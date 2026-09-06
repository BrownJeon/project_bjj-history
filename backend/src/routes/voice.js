const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const crypto  = require('crypto');
const fs      = require('fs/promises');
const { sequelize } = require('../config/db');
const { Class } = require('../models');
const { wrap } = require('../utils/respond');
const { isFillableTheme } = require('../utils/sessionTypes');
const { transcribeLongAudio, structureClassContent } = require('../services/voiceAnalysis');

const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// POST /api/voice/analyze — 음성 파일 업로드 + 분석 잡 시작
router.post('/analyze', upload.single('audio'), wrap(async (req, res) => {
  const { classId, trainedDate } = req.body;
  if (!req.file)  return res.status(400).json({ error: '음성 파일이 없습니다' });
  if (!classId)   return res.status(400).json({ error: 'classId가 없습니다' });

  const owned = await Class.findOne({ where: { id: classId, user_id: req.user.id }, attributes: ['id'] });
  if (!owned) {
    await require('fs/promises').unlink(req.file.path).catch(() => {});
    return res.status(404).json({ error: '수업을 찾을 수 없습니다' });
  }

  const jobId = crypto.randomUUID();
  await sequelize.query(
    `INSERT INTO voice_jobs (id, class_id, trained_date) VALUES (?, ?, ?)`,
    { replacements: [jobId, classId, trainedDate || null] }
  );
  res.json({ jobId });

  const audioPath = req.file.path;

  // fire-and-forget 백그라운드 처리
  (async () => {
    try {
      // 청크 완료 시마다 DB에 중간 저장
      const onChunkDone = async (partial) => {
        await sequelize.query(
          `UPDATE voice_jobs SET transcript = ? WHERE id = ?`,
          { replacements: [partial, jobId] }
        ).catch(e => console.error(`[voice] 청크 저장 실패: ${jobId}`, e.message));
        console.log(`[voice] 청크 저장: ${jobId} (${partial.length}자)`);
      };

      const transcript = await transcribeLongAudio(audioPath, onChunkDone);
      const result     = await structureClassContent(transcript);

      // 잡 완료 저장
      await sequelize.query(
        `UPDATE voice_jobs SET status='done', transcript=?, result=? WHERE id=?`,
        { replacements: [transcript, JSON.stringify(result), jobId] }
      );

      // 수업 테이블에 전사본 + 분석 결과 반영
      const { note, theme } = result;
      const label = trainedDate
        ? (() => { const d = new Date(trainedDate + 'T00:00:00'); return `${d.getMonth()+1}/${d.getDate()} 음성 분석`; })()
        : '음성 분석';
      const updateFields = ['voice_transcript = ?'];
      const updateValues = [transcript];
      if (theme) {
        // 사람이 적은 테마는 절대 덮어쓰지 않되, "아직 안 채워진 값"이면 서술형 테마로 채운다.
        // 예전 SQL(`IF(theme='' OR theme IS NULL, ...)`)은 빈 값만 봤다. 홈 카드가 생기면서
        // 모든 신규 수업이 프리셋('수업'·'오픈매트'·'자율운동')으로 시작하게 됐고, 그 결과
        // 홈에서 만든 수업은 음성분석 테마가 영영 안 들어갔다 (task-021 Reviewer 판정 1).
        //
        // 판정을 SQL 이 아니라 JS 에서 하는 이유: SQL 의 = / IN 은 NFD 로 저장된 한글을
        // 같은 글자로 보지 않는다(task-014). isFillableTheme 은 NFC 정규화 후 비교한다.
        // 대신 "판정에 쓴 값"을 UPDATE 조건(`theme <=> ?`)에 그대로 실어 보내, 읽은 뒤
        // 사용자가 테마를 고쳤다면 그 편집을 덮어쓰지 않는다(원자성 확보).
        const [[cur]] = await sequelize.query(
          `SELECT theme FROM classes WHERE id = ?`, { replacements: [classId] }
        );
        if (cur && isFillableTheme(cur.theme)) {
          updateFields.push('theme = CASE WHEN theme <=> ? THEN ? ELSE theme END');
          updateValues.push(cur.theme, theme);
        }
      }
      if (note)  {
        // 전체 메모가 비어 있든(첫 분석) 이미 내용이 있든 항상 [날짜 음성 분석] 라벨을 붙인다.
        // 예전에는 THEN 분기가 note만 넣어서 첫 분석에만 라벨·날짜가 빠졌고, 두 번째 분석부터
        // 라벨이 생겨 "어느 날 음성인지" 알 수 없는 덩어리가 메모 맨 앞에 남았다.
        updateFields.push('note = CASE WHEN note IS NULL OR note = \'\' THEN CONCAT(?, ?) ELSE CONCAT(note, ?, ?) END');
        updateValues.push(`[${label}]\n`, note, `\n\n[${label}]\n`, note);
      }
      updateValues.push(classId);
      await sequelize.query(
        `UPDATE classes SET ${updateFields.join(', ')} WHERE id = ?`,
        { replacements: updateValues }
      );

      console.log(`[voice] 잡 완료: ${jobId} (classId=${classId})`);
    } catch (e) {
      console.error(`[voice] 잡 실패: ${jobId}`, e.message);
      await sequelize.query(
        `UPDATE voice_jobs SET status='error', error=? WHERE id=?`,
        { replacements: [e.message || String(e), jobId] }
      ).catch(() => {});
    } finally {
      await fs.unlink(audioPath).catch(() => {});
    }
  })();
}));

// GET /api/voice/jobs — 최근 잡 목록 (pending 포함, 전사 진행 글자 수 포함)
router.get('/jobs', wrap(async (_req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, class_id, trained_date, status, created_at,
            CHAR_LENGTH(COALESCE(transcript, '')) AS transcript_len
     FROM voice_jobs ORDER BY created_at DESC LIMIT 30`
  );
  res.json(rows);
}));

// GET /api/voice/jobs/:jobId — 단일 잡 상태·결과
router.get('/jobs/:jobId', wrap(async (req, res) => {
  const [[job]] = await sequelize.query(
    `SELECT id, class_id, status, result, error, transcript FROM voice_jobs WHERE id = ?`,
    { replacements: [req.params.jobId] }
  );
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({
    status:     job.status,
    result:     job.result ? JSON.parse(job.result) : null,
    transcript: job.transcript || null,
    error:      job.error || null,
  });
}));

module.exports = router;

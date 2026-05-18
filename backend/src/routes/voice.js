const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const crypto  = require('crypto');
const fs      = require('fs/promises');
const { sequelize } = require('../config/db');
const { wrap } = require('../utils/respond');
const { transcribeLongAudio, structureClassContent } = require('../services/voiceAnalysis');

const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// POST /api/voice/analyze — 음성 파일 업로드 + 분석 잡 시작
router.post('/analyze', upload.single('audio'), wrap(async (req, res) => {
  const { classId } = req.body;
  if (!req.file)  return res.status(400).json({ error: '음성 파일이 없습니다' });
  if (!classId)   return res.status(400).json({ error: 'classId가 없습니다' });

  const jobId = crypto.randomUUID();
  await sequelize.query(
    `INSERT INTO voice_jobs (id, class_id) VALUES (?, ?)`,
    { replacements: [jobId, classId] }
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
        ).catch(() => {});
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
      const updateFields = ['voice_transcript = ?'];
      const updateValues = [transcript];
      if (theme) { updateFields.push('theme = IF(theme=\'\' OR theme IS NULL, ?, theme)'); updateValues.push(theme); }
      if (note)  {
        updateFields.push('note = CASE WHEN note IS NULL OR note = \'\' THEN ? ELSE CONCAT(note, ?, ?) END');
        updateValues.push(note, '\n\n[음성 분석]\n', note);
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

// GET /api/voice/jobs — 최근 잡 목록 (pending 포함)
router.get('/jobs', wrap(async (_req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, class_id, status, created_at FROM voice_jobs
     ORDER BY created_at DESC LIMIT 30`
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

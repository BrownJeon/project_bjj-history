const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { sequelize, TechniqueChain, ChainStep, Technique, VideoClip } = require('../models');
const { wrap, safeParse } = require('../utils/respond');

const VIDEO_DIR = '/home/brownjeon/.node-local/bjj-chain-videos';

router.get('/', wrap(async (_req, res) => {
  const chains = await TechniqueChain.findAll({ order: [['id', 'DESC']], raw: true });
  for (const c of chains) {
    const steps = await ChainStep.findAll({
      where: { chain_id: c.id },
      order: [['step_order', 'ASC']],
      raw: true,
    });
    const techIds = [...new Set(steps.map(s => s.technique_id).filter(Boolean))];
    const techs = techIds.length
      ? await Technique.findAll({ where: { id: techIds }, attributes: ['id', 'name', 'pos'], raw: true })
      : [];
    const techMap = new Map(techs.map(t => [t.id, t]));
    c.steps = steps.map(s => ({
      ...s,
      tech_name: techMap.get(s.technique_id)?.name || null,
      tech_pos:  techMap.get(s.technique_id)?.pos  || null,
    }));
  }
  res.json(chains);
}));

router.post('/', wrap(async (req, res) => {
  const { name, note, steps } = req.body;
  const id = await sequelize.transaction(async (t) => {
    const chain = await TechniqueChain.create({ name, note: note || '' }, { transaction: t });
    for (let i = 0; i < (steps || []).length; i++) {
      const s = steps[i];
      await ChainStep.create({
        chain_id: chain.id,
        technique_id: s.techniqueId,
        step_order: i + 1,
        transition_note: s.transitionNote || '',
      }, { transaction: t });
    }
    return chain.id;
  });
  res.json({ id });
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, note, steps } = req.body;
  await sequelize.transaction(async (t) => {
    await TechniqueChain.update({ name, note: note || '' }, { where: { id: req.params.id }, transaction: t });
    await ChainStep.destroy({ where: { chain_id: req.params.id }, transaction: t });
    for (let i = 0; i < (steps || []).length; i++) {
      const s = steps[i];
      await ChainStep.create({
        chain_id: req.params.id,
        technique_id: s.techniqueId,
        step_order: i + 1,
        transition_note: s.transitionNote || '',
      }, { transaction: t });
    }
  });
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  await sequelize.transaction(async (t) => {
    await ChainStep.destroy({ where: { chain_id: req.params.id }, transaction: t });
    await TechniqueChain.destroy({ where: { id: req.params.id }, transaction: t });
  });
  // 생성된 영상 파일도 삭제
  const videoPath = path.join(VIDEO_DIR, `chain-${req.params.id}.mp4`);
  if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
  res.json({ ok: true });
}));

// 영상 서빙 (HTTP Range 지원 — HTML5 <video> 시크 가능)
router.get('/:id/video', wrap(async (req, res) => {
  const chain = await TechniqueChain.findByPk(req.params.id, { raw: true });
  if (!chain) return res.status(404).json({ error: '체인을 찾을 수 없습니다' });

  const filePath = chain.video_path || path.join(VIDEO_DIR, `chain-${chain.id}.mp4`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '영상이 아직 생성되지 않았습니다. 먼저 영상을 생성해주세요.' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}));

// AI 영상 비동기 생성 (job 즉시 반환 → 백그라운드 처리)
router.post('/:id/generate-video', wrap(async (req, res) => {
  const chain = await TechniqueChain.findByPk(req.params.id, { raw: true });
  if (!chain) return res.status(404).json({ error: '체인을 찾을 수 없습니다' });

  const steps = await ChainStep.findAll({
    where: { chain_id: chain.id },
    order: [['step_order', 'ASC']],
    raw: true,
  });
  if (!steps.length) return res.status(400).json({ error: '체인에 단계가 없습니다' });

  const techIds = [...new Set(steps.map(s => s.technique_id).filter(Boolean))];
  const techs = techIds.length
    ? await Technique.findAll({ where: { id: techIds }, raw: true })
    : [];
  const techMap = new Map(techs.map(t => [t.id, t]));
  const stepsWithName = steps.map(s => ({
    ...s,
    tech_name: techMap.get(s.technique_id)?.name || null,
  }));

  const jobId = require('crypto').randomUUID();
  await sequelize.query(
    `INSERT INTO chain_video_jobs (id, chain_id, status) VALUES (?, ?, 'pending')`,
    { replacements: [jobId, chain.id] }
  );

  const { generateChainVideoAsync } = require('../services/chainAiVideoGenerator');
  generateChainVideoAsync(chain, stepsWithName, jobId).catch(async (e) => {
    await sequelize.query(
      `UPDATE chain_video_jobs SET status='error', error=?, updated_at=NOW() WHERE id=?`,
      { replacements: [(e.message || '').slice(0, 400), jobId] }
    );
  });

  res.json({ job_id: jobId });
}));

// AI 영상 생성 잡 상태 폴링
router.get('/video-jobs/:jobId', wrap(async (req, res) => {
  const [rows] = await sequelize.query(
    `SELECT * FROM chain_video_jobs WHERE id = ?`,
    { replacements: [req.params.jobId] }
  );
  if (!rows.length) return res.status(404).json({ error: '작업 없음' });
  res.json(rows[0]);
}));

// AI 체인 자동 생성 (미등록 기술 포함 가능)
router.post('/ai-generate', wrap(async (req, res) => {
  const { seedTechniqueIds, scenario, goal } = req.body;
  const scenarioText = (scenario || goal || '').trim();
  if (!scenarioText) {
    return res.status(400).json({ error: '상황 또는 목표를 입력해주세요' });
  }

  const allTechniques = await Technique.findAll({ raw: true });

  const seedTechs = Array.isArray(seedTechniqueIds) && seedTechniqueIds.length
    ? allTechniques.filter(t => seedTechniqueIds.includes(t.id))
    : [];

  const allClips = await VideoClip.findAll({
    attributes: ['id', 'title', 'url', 'platform', 'tech_name', 'thumb_url'],
    raw: true,
  });

  const registeredList = allTechniques.length
    ? allTechniques.map(t => `  - "${t.name}"` + (t.pos ? ` [${t.pos}]` : '')).join('\n')
    : '  (등록된 기술 없음)';

  const seedSection = seedTechs.length
    ? `\n포함 희망 기술 (가능하면 체인에 넣어주세요):\n${seedTechs.map(t => `  - "${t.name}"`).join('\n')}\n`
    : '';

  const prompt = `당신은 BJJ(브라질리언 주짓수) 전문 코치입니다. 아래 상황에 맞는 실전 기술 체인을 구성해주세요.

상황/목표: ${scenarioText}
${seedSection}
훈련자의 등록 기술 목록 (이미 배운 기술):
${registeredList}

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "name": "체인 이름 (한국어, 15자 이내)",
  "goal": "이 체인의 전술적 의도와 흐름 설명 (3~4문장)",
  "steps": [
    {
      "techniqueName": "<기술명 (한국어)>",
      "transitionNote": "이전 기술에서 이 기술로 전환하는 방법과 이유 (2~3문장, 첫 단계는 시작 포지션 설명)",
      "keyPoints": "이 기술 실행 시 핵심 포인트 (2~3가지, 각 포인트는 세미콜론으로 구분)"
    }
  ]
}

규칙:
- 상황에 최적인 3~6개 기술로 체인 구성
- 등록 기술 목록에 없는 새로운 기술도 필요하다면 적극 포함할 것
- 각 단계가 BJJ 흐름상 자연스럽게 연결되어야 함
- 기술명은 한국어로 작성 (예: 암바, 삼각조르기, 킴우라 등)`;

  const { runClaude } = require('../services/claudeCli');
  const raw = await runClaude(prompt, { timeoutMs: 90000 });

  let result;
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    result = JSON.parse(m ? m[0] : raw);
  } catch {
    return res.status(500).json({ error: 'AI 응답 파싱 실패', raw: raw.slice(0, 500) });
  }

  const techByName = new Map(allTechniques.map(t => [t.name.trim(), t]));

  result.steps = (result.steps || []).map(s => {
    const matched = techByName.get((s.techniqueName || '').trim());
    const clips = matched
      ? allClips.filter(c => {
          try {
            const names = JSON.parse(c.tech_name);
            const arr = Array.isArray(names) ? names : [names];
            return arr.some(n => n === matched.name);
          } catch {
            return c.tech_name === matched.name;
          }
        }).slice(0, 3).map(c => ({
          id: c.id, title: c.title, url: c.url,
          platform: c.platform, thumb_url: c.thumb_url,
        }))
      : [];
    return {
      ...s,
      techniqueId: matched?.id || null,
      isNew: !matched,
      clips,
    };
  });

  res.json(result);
}));

module.exports = router;

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Public: 토큰 불필요
router.use('/auth', require('./auth'));

// Auth 벽: 이 아래 모든 라우터는 유효한 JWT 필요
router.use(authMiddleware);

router.use('/classes',      require('./classes'));
router.use('/spar-causes',  require('./sparCauses'));
router.use('/techniques',   require('./techniques'));
router.use('/chains',       require('./chains'));
router.use('/gameplans',    require('./gameplans'));
router.use('/clips',        require('./clips'));
router.use('/picks',        require('./picks'));
router.use('/recommend',    require('./recommend'));
router.use('/enhance-memo', require('./enhance-memo'));
router.use('/voice',        require('./voice'));
router.use('/coach',        require('./coach'));
router.use('/long-videos',  require('./longVideos'));
router.use('/settings',     require('./settings'));
router.use('/feedback',     require('./feedback'));
router.use('/recall',       require('./recall'));
router.use('/research',     require('./research'));
// 관장실 (task-030) — /chats · /chats/:id/turns(SSE) · /actions/:id/approve · /search/sns
router.use('/master',       require('./master'));
// 아래 둘은 도메인 접두사 없이 `/` 에 마운트된다 — 경로가 최상위이기 때문이다.
// lab: /holes · /mastery/:techId (task-024)  |  profile: /profile · /belts · /memberships
// 경로 계열이 겹치지 않음을 확인했다. 접두사를 붙이면 프론트가 조용히 404 를 받는다.
router.use('/',             require('./lab'));
router.use('/',             require('./profile'));

module.exports = router;

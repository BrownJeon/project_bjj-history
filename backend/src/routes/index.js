const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// Public: 토큰 불필요
router.use('/auth', require('./auth'));

// Auth 벽: 이 아래 모든 라우터는 유효한 JWT 필요
router.use(authMiddleware);

router.use('/classes',      require('./classes'));
router.use('/techniques',   require('./techniques'));
router.use('/chains',       require('./chains'));
router.use('/gameplans',    require('./gameplans'));
router.use('/clips',        require('./clips'));
router.use('/picks',        require('./picks'));
router.use('/recommend',    require('./recommend'));
router.use('/enhance-memo', require('./enhance-memo'));
router.use('/voice',        require('./voice'));
router.use('/coach',        require('./coach'));
router.use('/settings',     require('./settings'));
router.use('/',             require('./profile'));

module.exports = router;

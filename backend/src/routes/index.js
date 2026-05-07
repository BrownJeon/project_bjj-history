const express = require('express');
const router = express.Router();

// 각 도메인 라우터 마운트 (Phase 2에서 구현 채움)
router.use('/classes',     require('./classes'));
router.use('/techniques',  require('./techniques'));
router.use('/chains',      require('./chains'));
router.use('/gameplans',   require('./gameplans'));
router.use('/clips',       require('./clips'));
router.use('/recommend',   require('./recommend'));
router.use('/enhance-memo',require('./enhance-memo'));
router.use('/coach',       require('./coach'));
router.use('/',            require('./profile'));

module.exports = router;

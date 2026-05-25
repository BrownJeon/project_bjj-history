const express = require('express');
const router = express.Router();
const { wrap } = require('../utils/respond');
const { getUploadRoot } = require('../services/storage');

router.get('/', wrap(async (_req, res) => {
  res.json({ uploadPath: getUploadRoot() });
}));

module.exports = router;

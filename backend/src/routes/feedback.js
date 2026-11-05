const express = require('express');
const { ok } = require('../utils/respond');
const { defaultService } = require('../services/feedback');
function createRouter(service = defaultService()) {
  const router = express.Router();
  const route = fn => async (req, res, next) => {
    try { ok(res, await fn(req)); }
    catch (error) {
      if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.original?.code || error.parent?.code)) {
        error = Object.assign(new Error('피드백 저장소가 아직 준비되지 않았습니다. 스키마 적용 후 이용해주세요'), { status: 503 });
      }
      next(error);
    }
  };
  router.get('/', route(req => service.list(req.user.id, req.query)));
  router.get('/recap', route(req => service.recap(req.user.id, req.query)));
  router.post('/', route(req => service.create(req.user.id, req.body || {})));
  router.get('/:id', route(req => service.get(req.user.id, req.params.id)));
  router.patch('/:id', route(req => service.patch(req.user.id, req.params.id, req.body || {})));
  router.put('/:id/star', route(req => service.setStarred(req.user.id, req.params.id, req.body || {})));
  router.patch('/:id/results/:resultId', route(req => service.editResult(req.user.id, req.params.id, req.params.resultId, req.body || {})));
  router.delete('/:id/results/:resultId', route(req => service.deleteResult(req.user.id, req.params.id, req.params.resultId, req.body || {})));
  for (const [path, method] of [['answer', 'answer'], ['ask', 'ask'], ['summarize', 'summarize'], ['results', 'result'], ['task', 'assignTask']]) {
    router.post(`/:id/${path}`, route(req => service[method](req.user.id, req.params.id, req.body || {})));
  }
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;

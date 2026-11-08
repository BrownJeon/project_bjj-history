// task-054 GET /api/techniques/:id/reference 라우트 계약(400/404/200, req.user 스코프).
// 서비스는 require.cache 로 대체한다 — DB 연결·.env·실제 서버 기동 없음. 루프백 임시 포트만 사용.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

const servicePath = require.resolve('../src/services/techniqueReference');
const calls = [];
require.cache[servicePath] = {
  id: servicePath, filename: servicePath, loaded: true,
  exports: {
    getReference: async (id, userId) => {
      calls.push([id, userId]);
      if (id === 404) { const e = new Error('not found'); e.status = 404; throw e; }
      if (id === 500) throw new Error('boom');
      return { technique: { id, name: '합성' }, reference: { slug: null, matchType: 'none', kind: null, description: null, sourceUrl: null }, incoming: [], outgoing: [], related: [], linkStore: 'unavailable' };
    },
  },
};
const router = require(path.join(__dirname, '../src/routes/techniques'));

async function withServer(fn) {
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 42 }; next(); });
  app.use('/api/techniques', router);
  app.use((err, _req, res, _next) => res.status(500).json({ success: false, message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}

test('GET /:id/reference returns 200 envelope, 400 for non-numeric id, 404 for foreign id, 500 passes to error handler', async () => {
  await withServer(async base => {
    const okRes = await fetch(`${base}/api/techniques/7/reference`);
    assert.equal(okRes.status, 200);
    const body = await okRes.json();
    assert.equal(body.success, true);
    assert.equal(body.data.technique.id, 7);
    assert.deepEqual(calls.at(-1), [7, 42]);

    const bad = await fetch(`${base}/api/techniques/abc/reference`);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).success, false);
    const neg = await fetch(`${base}/api/techniques/-1/reference`);
    assert.equal(neg.status, 400);

    const missing = await fetch(`${base}/api/techniques/404/reference`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { success: false, message: 'not found', data: null });

    const err = await fetch(`${base}/api/techniques/500/reference`);
    assert.equal(err.status, 500);
  });
});

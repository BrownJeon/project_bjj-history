// 관장의 **SNS 검색** 도구 2종 (task-030 · 기획서 §7-B).
//
// 🔴 `search_sns` 는 제공자 체인의 **1(Brave) → 3(DDG)** 만 쓴다. 2(Claude WebSearch)는 건너뛴다 —
//   MCP 프로세스 안에서 claude 를 또 띄우면 관장 턴 안에서 claude 가 claude 를 기다리는 중첩이 되고,
//   워커가 1개라 교착이 실재한다. 결과가 비면 `hint` 를 돌려주고 관장이 내장 `WebSearch` 로
//   직접 찾는다(페르소나 §4 "결과가 비면 WebSearch 에 site: 를 붙여 검색").
//
// 🔴 결과 URL 은 허용 호스트(instagram·tiktok)를 통과한 **영상 링크만** 남는다.
//   해시태그·프로필 페이지는 버린다(실측에서 섞여 나왔다).
const { z } = require('zod');
const sns = require('../../services/snsSearch');
const { ctx, respond, guard } = require('../lib');

function register(server) {
  server.registerTool('search_sns', {
    description: '인스타그램·틱톡 영상 검색. 결과가 비면 hint 를 보고 내장 WebSearch 에 site:instagram.com / site:tiktok.com 을 붙여 직접 검색하세요.',
    inputSchema: {
      query: z.string().min(1).max(200),
      platform: z.enum(['instagram', 'tiktok', 'all']).optional(),
      limit: z.number().int().min(1).max(8).optional(),
    },
  }, guard('search_sns', async ({ query, platform, limit }) => {
    const out = await sns.search(query, {
      platform: platform || 'all',
      limit: limit || 5,
      allowClaude: false,   // 🔴 위 주석 참고 — MCP 안에서는 claude 를 부르지 않는다
    });
    return respond({
      query, platform: platform || 'all',
      provider: out.provider, cached: !!out.cached,
      total: out.results.length, results: out.results,
      ...(out.hint ? { hint: out.hint } : {}),
    }, ['results']);
  }));

  server.registerTool('enrich_sns_links', {
    description: 'SNS 링크의 제목·작성자·길이를 확인하고, 이미 저장된 참고영상인지 대조합니다. 추천하기 전에 이걸로 확인하세요 — 제목을 지어내면 안 됩니다.',
    inputSchema: { urls: z.array(z.string().max(300)).min(1).max(6) },
  }, guard('enrich_sns_links', async ({ urls }) => {
    const { userId } = ctx();
    const links = await sns.enrichLinks(urls, userId);
    // 🔴 실패한 건도 ok:false 로 남는다 — 조용히 사라지면 관장이 "왜 3개만 보이지"를 모른다.
    return respond({ total: links.length, links }, ['links']);
  }));
}

module.exports = { register };

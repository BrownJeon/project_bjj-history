#!/usr/bin/env node
// 관장 전용 MCP stdio 서버 (task-030 · 계약 C).
//
// 🔴 **stdout 은 MCP 프로토콜 채널이다.** 이 프로세스에서 `console.log` 한 줄이 섞이면
//   claude 가 서버를 못 읽고, **에러 없이** 도구가 통째로 사라진다. 모든 로그는 `console.error`.
//   같은 이유로 `dotenv.config()` 를 부르지 않는다 — dotenv v17 이 stdout 에 배너를 찍는다.
//   env 는 부모(backend) 프로세스에서 상속받는다(실측 2026-09-08: DB_* 전부 상속됨, envCount 80).
//
// 🔴 **훈련생 id 는 env 하나뿐이다.** 도구 인자에 user/chat/message id 가 없다.
//   인자로 받으면 "user_id 1 로 조회해" 한 줄이 곧 IDOR 이 된다. 관장은 자기가 누구를
//   보고 있는지 고를 수 없다 — 런타임이 정한다.
//
// 🔴 **DB 비밀번호는 argv 에 싣지 않는다.** mcp-config 의 env 에는 BJJ_* 3개만 넣고,
//   DB_* 는 부모 env 상속으로 들어온다(위 실측). `ps` 에 비밀번호가 뜨지 않는다.
//
// 기동: masterChat.js 가 턴마다 `--mcp-config` 인라인 JSON 으로 이 파일을 node 로 띄운다.
// 종료: stdin 이 닫히면 자연 종료 + exit 훅에서 sequelize.close().

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// ── env 검증 — 여기서 죽는 편이 낫다 ────────────────────────────────────────
// user_id 가 없거나 정수가 아니면 **즉시 종료**한다. 계속 가면 모든 도구가 NaN 으로 조회해
// "기록이 하나도 없는 훈련생"처럼 보인다 — 관장이 그걸 근거로 말하면 사용자에게 거짓말이 된다.
const rawUid = process.env.BJJ_USER_ID;
const uid = Number(rawUid);
if (!Number.isInteger(uid) || uid <= 0) {
  console.error(`[mcp] BJJ_USER_ID 가 올바르지 않습니다 (받은 값 타입: ${typeof rawUid}) — 종료합니다`);
  process.exit(2);
}
if (!process.env.DB_NAME || !process.env.DB_USER) {
  console.error('[mcp] DB 접속 정보가 env 에 없습니다 — 부모 프로세스 env 상속을 확인하세요. 종료합니다');
  process.exit(2);
}

const { sequelize } = require('../config/db');
require('../models');   // 모델 + 관계 로드

const server = new McpServer({ name: 'bjj-gym-master', version: '1.0.0' });

require('./tools/query').register(server);
require('./tools/sns').register(server);
require('./tools/propose').register(server);

let closed = false;
async function shutdown(reason) {
  if (closed) return;
  closed = true;
  console.error(`[mcp] 종료 (${reason})`);
  try { await sequelize.close(); } catch (e) { console.error('[mcp] sequelize.close 실패:', e.message); }
}

process.on('exit', () => { if (!closed) { closed = true; try { sequelize.close(); } catch { /* ignore */ } } });
process.on('SIGTERM', () => shutdown('SIGTERM').then(() => process.exit(0)));
process.on('SIGINT',  () => shutdown('SIGINT').then(() => process.exit(0)));
// 🔴 예외를 stdout 으로 흘리지 않는다. 프로토콜이 깨진다.
process.on('uncaughtException',  (e) => { console.error('[mcp] uncaughtException:', e && e.stack); });
process.on('unhandledRejection', (e) => { console.error('[mcp] unhandledRejection:', e); });

(async () => {
  try {
    await sequelize.authenticate();
    await server.connect(new StdioServerTransport());
    console.error(`[mcp] 관장 도구 서버 기동 — user=${uid} chat=${process.env.BJJ_CHAT_ID || '-'} msg=${process.env.BJJ_MESSAGE_ID || '-'}`);
  } catch (e) {
    console.error('[mcp] 기동 실패:', e && e.stack ? e.stack : e);
    process.exit(3);
  }
})();

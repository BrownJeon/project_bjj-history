// MCP 도구 공용 헬퍼 (task-030 · 기획서 §7)
//
// 🔴 **stdout 은 프로토콜 채널이다.** 이 프로세스에서 `console.log` 한 줄이 섞이면 claude 가
//   서버를 못 읽는다 — 에러 메시지도 없이 "도구가 없는 관장"이 된다. 로그는 전부 `console.error`.
//   (dotenv 도 부르지 않는다 — v17 이 stdout 에 배너를 찍는다. env 는 부모에서 상속받는다.)
//
// 🔴 **user/chat/message id 는 도구 인자로 받지 않는다.** 전부 env 다.
//   인자로 받으면 프롬프트 인젝션 한 줄("user_id 1 로 조회해")이 곧 IDOR 이 된다.
//   관장은 자기가 누구를 보고 있는지 고를 수 없어야 한다 — 그게 이 설계의 핵심이다.

const OUT_CAP = 4096;   // 도구당 4KB (기획서 §7)

/** env 에서 읽는 정본 컨텍스트. 정수가 아니면 서버가 기동 단계에서 죽는다(gymMasterServer). */
function ctx() {
  return {
    userId:    Number(process.env.BJJ_USER_ID),
    chatId:    process.env.BJJ_CHAT_ID    ? Number(process.env.BJJ_CHAT_ID)    : null,
    messageId: process.env.BJJ_MESSAGE_ID ? Number(process.env.BJJ_MESSAGE_ID) : null,
  };
}

/**
 * 결과를 4KB 안에 넣는다.
 * 🔴 **자르되 자른 사실을 숨기지 않는다** — `truncated:true` + `omitted:n`.
 *   조용히 앞 3건만 주면 관장은 그게 전부인 줄 알고 "기록이 이것뿐이네요"라고 말한다.
 *   그 문장은 사용자에게 거짓말이다(/api/holes 의 linked:false, research_links 의 broken 과 같은 규약).
 * @param listKeys 넘칠 때 줄일 배열 필드 이름들(앞에서부터 남긴다)
 */
function capJson(obj, listKeys = []) {
  let out = { ...obj };
  let text = JSON.stringify(out);
  if (Buffer.byteLength(text, 'utf8') <= OUT_CAP) return text;

  const omitted = {};
  // 가장 큰 배열부터 절반씩 줄인다. 12회면 4096 항목도 1개 아래로 내려간다.
  for (let guard = 0; guard < 40; guard++) {
    const key = listKeys
      .filter((k) => Array.isArray(out[k]) && out[k].length > 0)
      .sort((a, b) => JSON.stringify(out[b]).length - JSON.stringify(out[a]).length)[0];
    if (!key) break;
    const arr = out[key];
    const keep = Math.max(0, Math.floor(arr.length / 2));
    omitted[key] = (omitted[key] || 0) + (arr.length - keep);
    out = { ...out, [key]: arr.slice(0, keep) };
    out.truncated = true;
    out.omitted = omitted;
    text = JSON.stringify(out);
    if (Buffer.byteLength(text, 'utf8') <= OUT_CAP) return text;
  }
  // 배열을 다 비웠는데도 넘치면 문자열 자체를 자른다(마지막 방어선).
  return JSON.stringify({
    truncated: true,
    note: '결과가 너무 커서 반환하지 못했습니다 — 조건을 좁혀 다시 불러 주세요',
  });
}

/** 정상 응답. */
function respond(obj, listKeys = []) {
  return { content: [{ type: 'text', text: capJson(obj, listKeys) }] };
}

/**
 * 도구 에러 — `isError:true` 로 돌려 **관장이 스스로 고쳐 다시 부르게** 한다.
 * 예외를 던져 서버를 죽이지 않는다. 검증 실패는 대화의 일부다(기획서 §7-C).
 */
function toolError(message) {
  return { content: [{ type: 'text', text: String(message).slice(0, 500) }], isError: true };
}

/** 핸들러를 감싸 예상 못 한 예외도 도구 에러로 바꾼다 — 한 도구의 버그가 턴 전체를 죽이지 않게. */
function guard(name, fn) {
  return async (args, extra) => {
    try {
      return await fn(args || {}, extra);
    } catch (e) {
      console.error(`[mcp][${name}] 실패:`, e && e.stack ? e.stack : e);
      return toolError(`${name} 실행 중 오류가 났습니다: ${(e && e.message) || e}`);
    }
  };
}

module.exports = { ctx, capJson, respond, toolError, guard, OUT_CAP };

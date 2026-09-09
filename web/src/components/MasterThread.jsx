// 관장실 대화 본문(task-030).
//
// 🔴 관장 본문은 **평문**이다 — `white-space: pre-wrap` 텍스트로만 그린다.
//    HTML 주입 경로(innerHTML 계열)는 이 트리에 하나도 없다(계약 F).
// 🔴 영상 링크는 관장 본문에서 URL 을 긁지 않는다. 서버가 tool_result 를 파싱해 넣어 준
//    `toolLog.videos[].url` 만 쓴다. 그 url 을 **글자 그대로** href 에 넣고, 허용 호스트가
//    아니면 버튼 자체를 그리지 않는다(기획서 §11.2·§12).

import React from 'react';
import MasterActionCard from './MasterActionCard';

// 허용 호스트 — 이 목록 밖은 "열기" 버튼이 없다.
const ALLOWED_HOSTS = ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com'];

/**
 * 열 수 있는 주소면 표시용 host 를, 아니면 null 을 돌려준다.
 * 🔴 판정만 한다 — href 에 들어가는 값은 항상 원문 url 이다(바이트 동일).
 */
export function videoHost(url) {
  if (typeof url !== 'string' || !url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;   // javascript:·data: 차단
  const host = (u.hostname || '').toLowerCase();
  const ok = ALLOWED_HOSTS.some(d => host === d || host.endsWith('.' + d));
  return ok ? host : null;
}

const PLATFORM_LABEL = { youtube: '유튜브', instagram: '인스타', tiktok: '틱톡' };

// SSE `status` 이벤트의 라벨과 같은 표(계약 B) — "관장이 본 것" 칩에 쓴다.
const TOOL_LABELS = {
  get_trainee_profile: '기록 살펴보는 중',
  get_holes: '구멍 목록 보는 중',
  get_mastery: '숙련도 보는 중',
  search_records: '기록 검색 중',
  list_research_projects: '연구 트리 보는 중',
  get_research_project: '연구 트리 보는 중',
  get_weekly_task: '이번 주 과제 보는 중',
  list_positions: '포지션 확인 중',
  search_techniques: '기술트리 찾는 중',
  list_my_clips: '저장된 참고영상 확인 중',
  search_videos: '유튜브 찾는 중',
  search_sns: 'SNS 찾는 중',
  WebSearch: 'SNS 찾는 중',
  enrich_sns_links: '링크 확인 중',
};

function toolLabel(name) {
  if (!name) return '생각하는 중';
  const bare = String(name).replace(/^mcp__[^_]+__/, '');
  if (TOOL_LABELS[bare]) return TOOL_LABELS[bare];
  if (bare.indexOf('propose_') === 0) return '제안 만드는 중';
  return bare;
}

function VideoCard({ video }) {
  const host = videoHost(video && video.url);
  const platform = PLATFORM_LABEL[video.platform] || (video.platform || '');
  const meta = [video.author, video.duration].filter(Boolean).join(' · ');
  return (
    <div className="bjjm-vid">
      <div className="bjjm-vt">
        {platform && <span className="bjjm-pf">{platform}</span>}
        {video.title || video.url}
      </div>
      {meta && <div className="bjjm-vw">{meta}</div>}
      {host && (
        // 🔴 href 는 toolLog 의 url 원문 그대로. 새 탭 + noopener(휴대폰은 OS 가 앱으로 넘긴다).
        <a className="bjjm-open" href={video.url} target="_blank" rel="noopener noreferrer">
          열기 ↗ <span className="bjjm-host">{host}</span>
        </a>
      )}
    </div>
  );
}

function SeenDetails({ toolLog }) {
  const tools = (toolLog && Array.isArray(toolLog.tools)) ? toolLog.tools : [];
  const chips = tools.map(t => toolLabel(t && t.name) + (t && t.ok === false ? ' 실패' : ''));
  if (toolLog && toolLog.model) {
    const secs = Number(toolLog.durationMs) > 0 ? ` · ${Math.round(Number(toolLog.durationMs) / 1000)}초` : '';
    chips.push(String(toolLog.model) + secs);
  }
  if (!chips.length) return null;
  return (
    <details className="bjjm-seen">
      <summary>관장이 본 것 · {chips.length}</summary>
      <div className="bjjm-tl">
        {chips.map((c, i) => <span key={i}>{c}</span>)}
      </div>
    </details>
  );
}

export default function MasterThread({
  messages = [], actions = [], status = null, streaming = false, detached = false, model = '',
  onApprove, onReject, busyActionId, onOpenResult,
}) {
  const actionsFor = (messageId) => actions.filter(a => a.messageId === messageId);

  return (
    <>
      {messages.map((m) => {
        if (m.role === 'user') {
          return <div className="bjjm-msg user" key={`u${m.id}`}>{m.content}</div>;
        }
        if (m.status === 'pending') return null;   // 진행 중 턴은 아래 status 말풍선이 대신한다
        const failed = m.status === 'failed';
        return (
          <React.Fragment key={`m${m.id}`}>
            <div className={failed ? 'bjjm-msg failed' : 'bjjm-msg master'}>
              {!failed && (
                <div className="bjjm-who">
                  관장{(m.toolLog && m.toolLog.model) ? <span>{m.toolLog.model}</span> : null}
                </div>
              )}
              {failed
                ? (m.content || '관장님이 답을 못 했어요 — 다시 보내 주세요')
                : m.content}
              {!failed && m.toolLog && Array.isArray(m.toolLog.videos)
                && m.toolLog.videos.map((v, i) => <VideoCard key={i} video={v} />)}
            </div>
            {!failed && <SeenDetails toolLog={m.toolLog} />}
            {actionsFor(m.id).map(a => (
              <MasterActionCard
                key={a.id}
                action={a}
                busy={busyActionId === a.id}
                onApprove={onApprove}
                onReject={onReject}
                onOpenResult={onOpenResult}
              />
            ))}
          </React.Fragment>
        );
      })}

      {streaming && (
        // 🔴 연결이 끊긴 상태(detached)는 **오류가 아니다**(task-030 D-1). 서버는 계속 답을 만들고
        //    있고, 화면은 폴링으로 그 결과를 받는다 — 그 사실을 그대로 말해 준다.
        <div className="bjjm-msg status">
          <span className="bjjm-spin" aria-hidden="true" />
          <span>
            {detached
              ? `연결이 잠시 끊겼어요 — 관장님은 계속 답을 만들고 있어요${status && status.label ? ` · ${status.label}` : ''}`
              : ((status && status.label) || '생각하는 중')}
          </span>
        </div>
      )}
    </>
  );
}

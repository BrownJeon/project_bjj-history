import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Tag from './Tag';
import Icon from './Icon';
import { importSearch } from '../api/research';
import { displayGroups, isAlreadyLinked, linkBodyOf } from '../utils/researchLinks';

// ═════════════════════════════════════════════════════════════════════════════
// 검색해서 가져오기 — 5개 저장소 (task-028 C)
//
// 수업기록 · 기술트리 · 시뮬레이터 · 참고영상 · 영상분석. 사용자는 다섯 화면을 각각 뒤지지 않는다.
//
// 🔴 **색으로 출처를 가르지 않는다.** 이 화면(`/research`)의 색 언어는 이미 세 갈래가 확정돼 있다:
//      앰버 = "대처 없는 리액션" 전용(task-026) · 중립 점선 = 미연결 · 블루 점선 = 리액션 제안(task-027).
//    5개 출처에 색을 배정하면 저 셋 중 최소 둘을 뺏는다. → 구분은 **구조**로 한다:
//      묶음 소제목 + 아이콘 + 출처 이름 + 개수. 색맹·저대비에서도 남는 단서다(task-026 규칙 그대로).
//
// 🔴 **표본 0을 한 가지로 뭉개지 않는다.** 서버가 묶음마다 `total`(매치)과 `available`(전체 행)을
//    따로 준다. `0/0` 은 "그 저장소에 기록이 없다"이고 `0/135` 는 "검색어가 안 걸렸다"다.
//    둘을 "결과 없음"으로 합치면, 사용자는 자기가 검색을 잘못한 건지 재료가 없는 건지 모른다.
//
// 🔴 **매핑을 여기서 재조립하지 않는다.** 서버가 준 `linkType`·`refId` 를 그대로 POST 한다
//    (`linkBodyOf`). 시뮬레이터는 한 라벨 아래 gameplan·chain **두 종류**라, 화면이 라벨에서
//    종류를 되짚으면 반드시 갈린다.
//
// 🔴 검색어 없이 열면 **둘러보기**(`browse:true`)다 — 시트를 열자마자 빈 손이 되지 않게.
// ═════════════════════════════════════════════════════════════════════════════

const DEBOUNCE_MS = 300;
const Q_LIMIT = 200;   // 서버 400 경계와 같은 값

function GroupEmpty({ g }) {
  // 🔴 두 상태를 다르게 말한다.
  if (g.reason === 'no-store') {
    return (
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55, padding: '2px 2px 6px' }}>
        아직 <b style={{ color: 'var(--text2)' }}>{g.label}</b>에 기록이 없습니다 — 검색어 문제가 아닙니다.
      </div>
    );
  }
  return (
    <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55, padding: '2px 2px 6px' }}>
      {g.available}건 중 걸린 것이 없습니다.
    </div>
  );
}

function ResultRow({ item, linked, busy, onPick }) {
  const [open, setOpen] = useState(false);
  const hits = Array.isArray(item.hits) ? item.hits : [];

  return (
    <div style={{
      padding: '9px 10px', marginBottom: 6, borderRadius: 10,
      background: 'var(--surface-up)', border: '1px solid var(--border)',
      opacity: linked ? 0.62 : 1,
    }}>
      {/* 🔴 이름은 자르지 않는다. ellipsis/nowrap 금지(340px 요건, task-026 과 같은 규칙). */}
      <div style={{
        fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.45,
        whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word',
      }}>
        {String(item.title || '').trim() || '(이름 없음)'}
      </div>

      {(item.subtitle || item.date) && (
        <div style={{
          fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5,
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>
          {[item.date, item.subtitle].filter(Boolean).join(' · ')}
        </div>
      )}

      <div style={{ marginTop: 7, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {linked ? (
          <Tag tone="neutral">이미 붙어 있습니다</Tag>
        ) : (
          <Button variant="primary" size="sm" disabled={busy} onClick={() => onPick(item)}>
            가져오기
          </Button>
        )}
        {hits.length > 0 && (
          <span
            onClick={() => setOpen(v => !v)}
            style={{ fontSize: 11, color: 'var(--text2)', cursor: 'pointer', marginLeft: 'auto' }}
          >{open ? '어디서 걸렸는지 닫기' : '어디서 걸렸는지'}</span>
        )}
      </div>

      {/* 근거 — 어느 필드의 어느 대목에서 걸렸는지. 없이 나타나면 사용자가 신뢰하지 않는다. */}
      {open && hits.length > 0 && (
        <div style={{
          marginTop: 7, padding: '7px 8px', borderRadius: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
        }}>
          {hits.map((h, i) => (
            <div key={i} style={{
              fontSize: 11, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 3,
              whiteSpace: 'normal', overflowWrap: 'anywhere',
            }}>
              <b style={{ color: 'var(--text)' }}>{h.field}</b>
              {h.count > 1 ? ` ×${h.count}` : ''} · {h.snippet}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @param nodeLabel  붙일 노드 이름 — 어디에 붙는지 화면이 말한다
 * @param links      이미 붙은 링크(normalizeLinks 결과) — 중복 표시용
 * @param onPick(item)  가져오기. 부모가 POST 하고 목록을 다시 읽는다
 */
export default function ResearchImportSheet({ open, nodeLabel, links, busy, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const seq = useRef(0);

  const run = useCallback(async (text) => {
    // 🔴 응답 순서가 뒤바뀌면 **옛 검색 결과가 최신 검색어 위에 남는다**(에러 없이 조용히 틀린다).
    //    요청마다 번호를 매기고 마지막 것만 그린다.
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await importSearch(text);
      if (my !== seq.current) return;
      setRes(d); setErr('');
    } catch (e) {
      if (my !== seq.current) return;
      setRes(null); setErr(e.message || '검색하지 못했습니다');
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  // 열 때 한 번 — 검색어 없이(둘러보기).
  useEffect(() => {
    if (!open) return;
    setQ(''); setRes(null); setErr('');
    run('');
  }, [open, run]);

  // 입력 디바운스.
  useEffect(() => {
    if (!open) return undefined;
    const h = setTimeout(() => { run(q.trim()); }, DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [q, open, run]);

  const view = displayGroups(res);
  const tooLong = q.length > Q_LIMIT;

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="검색해서 가져오기">
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55, marginBottom: 10 }}>
        <b style={{ color: 'var(--text)' }}>{String(nodeLabel || '').trim() || '이 노드'}</b> 에 붙일 자료를
        수업기록 · 기술트리 · 시뮬레이터 · 참고영상 · 영상분석 <b style={{ color: 'var(--text)' }}>다섯 곳</b>에서
        한 번에 찾습니다.
      </div>

      <div className="field">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="기술 이름 · 수업 테마 · 영상 제목으로 검색"
        />
      </div>

      {tooLong && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>
          검색어가 {Q_LIMIT}자를 넘었습니다 — 서버가 400 으로 거부합니다.
        </div>
      )}

      {err ? (
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, padding: '10px 0' }}>
          검색하지 못했습니다 — {err}
        </div>
      ) : res == null ? (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 0' }}>불러오는 중…</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.55, marginBottom: 8 }}>
            {view.browse
              ? '검색어 없이 최근 항목을 보여 줍니다 — 치면 좁혀집니다.'
              : `다섯 곳에서 ${view.matched}건 걸렸습니다.`}
            {loading && ' · 갱신 중…'}
          </div>

          {/* 🔴 모든 저장소가 비어 있다 = 검색어 문제가 아니라 **재료가 없다**. 그 말을 한다. */}
          {view.allStoresEmpty && (
            <div style={{
              padding: 11, borderRadius: 11, marginBottom: 10,
              background: 'var(--surface)', border: '1px dashed var(--border-med)',
              fontSize: 11, color: 'var(--text2)', lineHeight: 1.6,
            }}>
              다섯 저장소가 <b style={{ color: 'var(--text)' }}>전부 비어 있습니다</b> — 검색어를 바꿔도
              나올 것이 없습니다. 수업을 기록하거나 참고영상을 등록하면 여기서 가져올 수 있습니다.
            </div>
          )}

          {view.groups.map(g => (
            <div key={g.key} style={{ marginBottom: 14 }}>
              {/* 묶음 소제목 — 출처 구분의 **주 신호**다(색이 아니라 구조). */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                paddingBottom: 5, borderBottom: '1px solid var(--border)',
              }}>
                <Icon name={g.icon} size={13} color="var(--text2)" />
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{g.label}</span>
                <Tag tone="neutral">{g.total}</Tag>
                {g.hiddenCount > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' }}>
                    상위 {g.items.length}건만 표시 · 그 밖에 {g.hiddenCount}건
                  </span>
                )}
              </div>

              {g.items.length === 0
                ? <GroupEmpty g={g} />
                : g.items.map(it => (
                    <ResultRow
                      key={`${it.linkType}:${it.refId}`}
                      item={it}
                      linked={isAlreadyLinked(links, it)}
                      busy={busy}
                      onPick={(x) => onPick(linkBodyOf(x), x)}
                    />
                  ))}
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop: 4 }}>
        <Button variant="outline" onClick={onClose} disabled={busy}>닫기</Button>
      </div>
    </Modal>
  );
}

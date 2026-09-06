import React, { useState, useMemo, useEffect } from 'react';
import * as classesApi from '../api/classes';
import * as causesApi from '../api/sparCauses';
import * as enhanceApi from '../api/enhanceMemo';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import {
  BELT_LEVELS, BASE_TECHNIQUES, BASE_WEAKNESSES, KEY_TECHNIQUES, mergeUnique,
} from '../utils/baseOptions';
import { uniqueOpponents } from '../utils/suggestions';
import SparFeedbackCard from '../components/SparFeedbackCard';
import { listPicks } from '../api/picks';

// outcome — null = 아직 선택 안 함(통계 집계 제외) / 'win' = 이겼어 / 'learn' = 배웠어.
//   🔴 task-022 에서 **화면(토글)만 제거했다.** 컬럼·기존 값·페이로드는 그대로 둔다.
//   착수 시 실측: 54행 전부 NULL(값 있는 행 0건)이라 지금 당장 잃을 값은 없다. 그래도 계속
//   보내는 이유는 이 앱의 스파링 저장이 destroy+reinsert 라 **페이로드에 없는 필드는 저장할
//   때마다 사라지기** 때문이다 — 다른 경로로 값이 한 번이라도 들어오면 그 뒤 첫 저장에서
//   조용히 지워진다(task-017 의 positions 가 정확히 그렇게 사라졌다). 화면에서 못 고를 뿐,
//   불러온 값을 그대로 돌려보낸다.
// positions / positionScore — 편집 UI가 없는 필드. 새 라운드는 빈 값이지만,
//   기존 기록(18세션)이 저장 시 destroy+reinsert로 지워지지 않도록 그대로 되돌려 보낸다.
//   (접힘 안에서 읽기 전용으로 보여만 준다 — 지우지 않는다.)
// 실패 원인 태그·리액션은 세션이 아니라 **successTried 의 각 항목 안**에 산다
//   (`{name, success, causes:[id], reaction:''}` — docs/recall-lab-spec.md §3.1).
//   인덱스로 짝지은 별도 배열이 아니라 항목 내부라 항목을 지워도 짝이 밀리지 않는다.
//   빈 항목의 정본은 아래 newSuccessItem() 하나뿐이다.
const EMPTY_SESSION = {
  level: '', opponent: '', tapGot: 0, tapGave: 0, time: '',
  successTried: [], weak: [], note: '', outcome: null,
  positions: [], positionScore: 0,
};

/** successTried 항목의 빈 값 — 성공/실패 항목을 만드는 곳은 전부 여기를 거친다. */
function newSuccessItem(name, success) {
  return { name, success, causes: [], reaction: '' };
}

// _new — "이 화면에서 새로 만든, 서버에 아직 없는 라운드"라는 표시. buildPayload 에서 제거되므로
//   서버로 나가지 않는다. 아래 빈 라운드 필터를 이 라운드들에만 적용하기 위한 표시다 (task-021).
//   🔴 서버에서 불러온 라운드에는 절대 붙이지 않는다 — 이 앱의 스파링 저장은 destroy+reinsert 라
//   페이로드에서 빠진 행은 DB 에서 삭제된다(task-017 에서 positions 가 정확히 그렇게 사라졌다).
//   실측: 기존 54개 라운드 중 전 필드가 기본값인 행이 1건 있다(spar_sessions.id=104, spar_day_id=23).
//   _new 로 좁히지 않으면 그 스파링을 열어 저장하는 순간 그 행이 조용히 지워진다.
function isBlankSession(s) {
  return !String(s.level    || '').trim()
      && !String(s.opponent || '').trim()
      && !String(s.note     || '').trim()
      && (parseInt(s.tapGot)  || 0) === 0
      && (parseInt(s.tapGave) || 0) === 0
      && (parseInt(s.time)    || 0) === 0
      && (parseInt(s.positionScore) || 0) === 0
      && !s.outcome
      && (s.successTried || []).length === 0
      && (s.weak      || []).length === 0
      && (s.positions || []).length === 0;
}

/** 저장할 라운드만 남긴다 — 이 화면에서 새로 만들어 놓고 한 글자도 안 채운 라운드는 버린다. */
function keepSessions(sessions) {
  return sessions.filter(s => !(s._new && isBlankSession(s)));
}

// 실기록 분포(3분 15건 / 4분 29건 / 5분 8건)에 맞춘 원탭 프리셋
const TIME_PRESETS = [3, 4, 5];

// OUTCOME_OPTIONS(이겼어/배웠어)는 task-022 에서 화면과 함께 제거했다.
// 컬럼·기존 값·페이로드는 그대로 살아 있다(위 EMPTY_SESSION 주석 참고).

const BELT_PILL = {
  '화이트': { bg: '#e8e8e8', active: '#999',    text: '#666',    activeText: '#fff' },
  '블루':   { bg: '#c8dff0', active: '#1e6fa0', text: '#1e6fa0', activeText: '#fff' },
  '퍼플':   { bg: '#e0d0ef', active: '#7b4f9e', text: '#7b4f9e', activeText: '#fff' },
  '브라운': { bg: '#eeddd0', active: '#8B5E3C', text: '#8B5E3C', activeText: '#fff' },
  '블랙':   { bg: '#ccc',    active: '#222',    text: '#555',    activeText: '#fff' },
};

// initialRounds — 신규 스파링을 몇 라운드로 열지. 기본 0(캘린더 경로는 기존 그대로 빈 상태).
//   홈의 "스파링까지" 진입만 1을 넘겨 "+ 라운드 추가" 1탭을 없앤다 (task-021).
export default function SparEditor({ classId, sparDay, onClose, onSaved, initialRounds = 0 }) {
  const { showToast, setLoading } = useUI();
  const { techniques, classes } = useCache();
  const isEdit = !!sparDay?.id;

  const [feedbackData, setFeedbackData] = useState(null);

  // Autocomplete candidates from past records (datalist용 — 칩으로 표시하지 않음)
  const weakFreqSuggestions = useMemo(() => {
    const freq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.weak || []).forEach(w => { if (w) freq[w] = (freq[w] || 0) + 1; });
        });
      });
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return mergeUnique(sorted, BASE_WEAKNESSES);
  }, [classes]);

  const successFreqSuggestions = useMemo(() => {
    const freq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.success || []).forEach(t => {
            if (t?.success !== false && t?.name) freq[t.name] = (freq[t.name] || 0) + 1;
          });
        });
      });
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return mergeUnique(sorted, BASE_TECHNIQUES, techniques.map(t => t.name));
  }, [classes, techniques]);

  const tapTechSuggestions = useMemo(() => {
    const freq = {};
    classes.forEach(c => {
      (c.spar_days || []).forEach(sd => {
        (sd.sessions || []).forEach(s => {
          (s.success || []).forEach(t => {
            if (t?.success === false && t?.name) freq[t.name] = (freq[t.name] || 0) + 1;
          });
        });
      });
    });
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return mergeUnique(sorted, BASE_TECHNIQUES);
  }, [classes]);

  const opponentSuggestions = useMemo(() => uniqueOpponents(classes), [classes]);

  const [date, setDate] = useState(
    sparDay?.date?.toString().slice(0, 10) || new Date().toISOString().slice(0, 10)
  );
  const [dayNote, setDayNote] = useState(sparDay?.day_note || '');
  const [noteOpen, setNoteOpen] = useState(!!sparDay?.day_note);
  const [sessions, setSessions] = useState(() => {
    const existing = (sparDay?.sessions || []).map(s => ({
      level: s.level || '',
      opponent: s.opponent || '',
      tapGot: s.tap_got || 0,
      tapGave: s.tap_gave || 0,
      time: s.time_min || '',
      // 🔴 연결 2/3 — 기존값 매핑. causes/reaction 을 여기서 안 읽으면 화면 state 에 없는 값이
      //   되고, 저장 시 buildPayload 가 빈 값을 보내 destroy+reinsert 로 조용히 지워진다.
      successTried: (s.success || []).map(a =>
        typeof a === 'string'
          ? newSuccessItem(a, true)
          : {
              name: a?.name || '',
              success: a?.success !== false,
              causes: Array.isArray(a?.causes)
                ? a.causes.map(n => parseInt(n)).filter(Number.isInteger)
                : [],
              reaction: typeof a?.reaction === 'string' ? a.reaction : '',
            }
      ).filter(a => a.name),
      weak: Array.isArray(s.weak) ? s.weak : [],
      note: s.note || '',
      outcome: s.outcome || null,
      // 아래 둘은 편집 UI가 없다 — 읽어서 그대로 돌려보내야 저장 시 지워지지 않는다
      positions: Array.isArray(s.positions) ? s.positions : [],
      positionScore: s.position_score || 0,
      _new: false,   // 서버에 이미 있는 행 — 비어 있어도 절대 필터하지 않는다
    }));
    if (existing.length) return existing;
    // 배열 필드는 EMPTY_SESSION 과 참조를 공유하면 안 되므로 매번 새로 만든다
    return Array.from({ length: Math.max(0, initialRounds) }, () => ({
      ...EMPTY_SESSION, successTried: [], weak: [], positions: [], _new: true,
    }));
  });
  const [aiBusy, setAiBusy] = useState(false);

  // 실패 원인 태그 — 이 화면에서만 쓰므로 CacheContext(전 페이지 공통 로딩)에 올리지 않고
  // 여기서 직접 받는다. 서버가 이 사용자의 첫 조회 때 기본 4개를 넣어 준다.
  // 비활성 태그까지 함께 받는다 — 과거 기록이 참조하는 이름을 보여 줘야 하기 때문.
  const [causes, setCauses] = useState([]);
  const reloadCauses = React.useCallback(async () => {
    const list = await causesApi.listSparCauses().catch(() => []);
    setCauses(Array.isArray(list) ? list : []);
  }, []);
  useEffect(() => { reloadCauses(); }, [reloadCauses]);

  /** 태그 추가 — 화면을 벗어나지 않고(모달 중첩 없이) 카드 안에서 호출된다.
   *  실패하면 이유를 토스트로 알리고 null 을 돌려준다 — 조용히 아무 일도 안 일어난 척하지 않는다. */
  async function addCause(name) {
    try {
      const created = await causesApi.createSparCause(name);
      await reloadCauses();
      return created;          // 방금 만든 태그를 바로 선택할 수 있게 돌려준다
    } catch (e) {
      showToast('태그 추가 실패: ' + e.message);
      return null;
    }
  }

  function addSession() {
    // 직전 라운드의 시간·벨트를 이월 — 같은 날 라운드는 대개 동일하다(시간 96%·벨트 98% 채움)
    const prev = sessions[sessions.length - 1];
    setSessions([...sessions, {
      ...EMPTY_SESSION,
      successTried: [], weak: [], positions: [], _new: true,
      time:  prev ? prev.time  : '',
      level: prev ? prev.level : '',
    }]);
  }
  function removeSession(i) { setSessions(sessions.filter((_, idx) => idx !== i)); }
  function updateSession(i, key, val) {
    setSessions(sessions.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  }

  function buildPayload(kept) {
    return {
      date,
      dayNote,
      sessions: kept.map(s => ({
        level: s.level,
        opponent: s.opponent,
        tapGot: parseInt(s.tapGot) || 0,
        tapGave: parseInt(s.tapGave) || 0,
        // time_min 은 TINYINT — 직접 입력이 생겼으므로 상한을 막는다
        time: Math.min(127, Math.max(0, parseInt(s.time) || 0)),
        positionScore: parseInt(s.positionScore) || 0,
        // 🔴 연결 3/3 — 저장 페이로드. 필드를 스프레드하지 않고 하나씩 적는 이유는 화면 전용
        //   플래그(_new 등)가 서버로 새어 나가지 않게 하기 위해서다. 그래서 새 필드는
        //   여기에 반드시 명시해야 한다 — 빠지면 저장할 때마다 사라진다(task-017).
        success: (s.successTried || []).map(t => ({
          name: t.name,
          success: !!t.success,
          causes: Array.isArray(t.causes) ? t.causes : [],
          reaction: t.reaction || '',
        })),
        weak: s.weak || [],
        // 화면에서 뺐지만 계속 보낸다 — 안 보내면 값이 있는 행이 저장 때 지워진다
        outcome: s.outcome || null,
        positions: s.positions || [],   // 편집 UI 없음 — 기존 값 그대로 재전송(유실 방지)
        note: s.note,
      })),
    };
  }

  async function aiEnhance() {
    // 저장과 같은 기준으로 빈 라운드를 뺀다 — 안 그러면 내용 없는 "[라운드N]" 줄이 AI 프롬프트에 섞인다
    const kept = keepSessions(sessions);
    if (!kept.length) { alert('세션이 비어있습니다'); return; }
    const text = kept.map((s, i) => {
      const parts = [`라운드${i + 1}`];
      if (s.level) parts.push(`${s.level}벨트`);
      if (s.outcome) parts.push(s.outcome === 'win' ? '이겼어' : '배웠어');
      let line = `[${parts.join(' · ')}]`;
      const good = s.successTried.filter(t => t.success);
      const tapTech = s.successTried.filter(t => !t.success);
      if (good.length) line += `\n  성공한 기술: ${good.map(t => t.name).join(', ')}`;
      if (tapTech.length) line += `\n  탭 당한 기술: ${tapTech.map(t => t.name).join(', ')}`;
      if ((s.weak || []).length) line += `\n  성장 포인트: ${s.weak.join(', ')}`;
      if (s.note) line += `\n  메모: ${s.note}`;
      return line;
    }).join('\n\n');
    setAiBusy(true);
    try {
      const res = await enhanceApi.enhanceMemo({ text, type: 'spar' });
      setDayNote((dayNote ? dayNote + '\n\n' : '') + (res.enhanced || ''));
      setNoteOpen(true);
      showToast('AI 코칭 분석 완료');
    } catch (e) { showToast('AI 분석 실패: ' + e.message); }
    finally { setAiBusy(false); }
  }

  async function save() {
    if (!date) { alert('날짜를 입력해주세요'); return; }
    setLoading(true);
    try {
      // 새로 만들어 놓고 한 글자도 안 채운 라운드는 저장하지 않는다.
      // 이걸 안 걸러내면 홈에서 "스파링까지 → 저장"만 눌러도 전 필드가 빈 라운드가 저장돼
      // coachAnalytics.computeDiagnosis 가 summary.sessions 를 부풀리고 byOpponentBelt 에
      // '기타/tapGot0/tapGave0' 유령 버킷을 만든다 — 코치 리포트·AI 프롬프트에 그대로 들어간다
      // (task-021 Reviewer 판정 2). outcome 에 기본값을 두지 않은 것과 같은 이유다(task-017).
      const kept = keepSessions(sessions);
      const payload = buildPayload(kept);
      let sparDayId;
      if (isEdit) {
        await classesApi.updateSpar(classId, sparDay.id, payload);
        sparDayId = sparDay.id;
      } else {
        const res = await classesApi.createSpar(classId, payload);
        sparDayId = res.id;
      }
      onSaved && onSaved();

      // 그날 픽미업으로 뽑은 기술이 있을 때만 피드백 카드를 띄운다.
      // 픽이 없으면 카드에 입력할 것이 없어 "확인" 1탭만 늘어나므로 바로 닫는다 (task-017).
      let todayPicks = [];
      try {
        const groups = await listPicks();
        todayPicks = groups.find(g => g.date === date)?.picks || [];
      } catch { /* 픽 이력 조회 실패는 피드백을 건너뛰고 저장만 확정 */ }

      if (todayPicks.length > 0) {
        setFeedbackData({ sessions: kept, classes, sparDayId, todayPicks });
      } else {
        // 버린 라운드가 있으면 숨기지 않고 그대로 말해 준다 — "저장되었습니다 · 1라운드"라고 하고
        // 실제로는 0라운드가 저장되는 조용한 거짓말을 만들지 않기 위해서다
        const dropped = sessions.length - kept.length;
        showToast(dropped > 0
          ? `저장되었습니다 · ${kept.length}라운드 (빈 라운드 ${dropped}개는 저장하지 않음)`
          : `저장되었습니다 · ${kept.length}라운드`);
        onClose();
      }
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (!isEdit || !confirm('스파링 일자를 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await classesApi.deleteSpar(classId, sparDay.id);
      showToast('삭제되었습니다');
      onSaved && onSaved();
      onClose();
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  if (feedbackData) {
    return (
      <SparFeedbackCard
        sessions={feedbackData.sessions}
        classes={feedbackData.classes}
        sparDayId={feedbackData.sparDayId}
        todayPicks={feedbackData.todayPicks}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={isEdit ? '스파링 수정' : '스파링 추가'} onClose={onClose}>
      <div className="field">
        <label>날짜 *</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>라운드 ({sessions.length})</span>
        </div>
        {sessions.length === 0 && (
          <div style={{
            padding: 20, textAlign: 'center',
            border: '1px dashed var(--border-med)', borderRadius: 12,
            color: 'var(--text2)', fontSize: 13, marginBottom: 8,
          }}>
            아래 버튼으로 라운드를 추가하세요
          </div>
        )}
        {sessions.map((s, i) => (
          <GrowthSessionCard
            key={i}
            idx={i}
            session={s}
            weakAutocomplete={weakFreqSuggestions}
            successAutocomplete={successFreqSuggestions}
            tapTechSuggestions={tapTechSuggestions}
            opponentSuggestions={opponentSuggestions}
            causes={causes}
            onAddCause={addCause}
            onRemove={() => removeSession(i)}
            onUpdate={(k, v) => updateSession(i, k, v)}
          />
        ))}
        <button
          onClick={addSession}
          style={{
            width: '100%', padding: '13px 0',
            border: '2px dashed var(--border-med)',
            background: 'transparent', borderRadius: 14,
            color: 'var(--accent)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          + 라운드 추가
        </button>
      </div>

      {/* 전체 메모 — 17일 중 1일만 채워진 필드라 접어 둔다. 값이 있거나 AI 분석을 돌리면 자동으로 펼쳐진다 */}
      <div className="field">
        <button onClick={() => setNoteOpen(!noteOpen)} style={{
          width: '100%', padding: '8px 0',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, color: 'var(--text2)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          {noteOpen ? '▲ 접기' : `▼ 전체 메모 · AI 코칭 분석${dayNote ? ' (작성됨)' : ''}`}
        </button>
        {noteOpen && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <button
                onClick={aiEnhance}
                disabled={aiBusy || !sessions.length}
                style={{
                  background: 'var(--purple-dim)', color: 'var(--purple)',
                  border: 'none', padding: '4px 10px', borderRadius: 6,
                  fontSize: 11, fontWeight: 600,
                  cursor: aiBusy ? 'wait' : 'pointer',
                }}
              >
                {aiBusy ? '분석 중…' : '✨ AI 코칭 분석'}
              </button>
            </div>
            <textarea rows={4} value={dayNote} onChange={e => setDayNote(e.target.value)}
              placeholder="스파링 전체 메모 / AI 분석 결과" />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button variant="primary" size="sm" onClick={save}>저장</Button>
        <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
        {isEdit && <Button variant="danger" size="sm" onClick={remove} style={{ marginLeft: 'auto' }}>삭제</Button>}
      </div>
    </Modal>
  );
}

// 3계층 칩 입력 컴포넌트: 태그 행 + 고정 BASE 칩 + datalist 텍스트 입력
function ChipSection({ label, values, baseChips, autocompleteList, color, onToggle, onAdd, onRemove, inputId }) {
  const [input, setInput] = useState('');
  const isGold = color === 'gold';
  const activeColor = isGold ? '#F5A623' : 'var(--accent)';
  const activeDim   = isGold ? '#FEF3E2' : 'var(--accent-dim)';
  const labelColor  = isGold ? '#B8860B' : 'var(--accent)';

  function handleAdd() {
    const val = input.trim();
    if (val && !values.includes(val)) onAdd(val);
    setInput('');
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: labelColor, marginBottom: 7 }}>
        {label}
      </div>

      {/* Layer 1: 선택된 태그 행 */}
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
          {values.map(v => (
            <button key={v} onClick={() => onRemove(v)} style={{
              padding: '4px 10px', borderRadius: 20,
              background: activeColor, color: '#fff',
              border: 'none', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {v} <span style={{ fontSize: 13, opacity: 0.8 }}>×</span>
            </button>
          ))}
        </div>
      )}

      {/* Layer 2: 고정 BASE 칩 — 선택됨이면 dim 처리 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
        {baseChips.map(chip => {
          const selected = values.includes(chip);
          return (
            <button key={chip} onClick={() => onToggle(chip)} style={{
              padding: '5px 10px', borderRadius: 20,
              background: selected ? activeDim : 'var(--surface)',
              color: selected ? activeColor : 'var(--text3)',
              border: selected ? `1px solid ${activeColor}` : '1px solid var(--border-med)',
              fontSize: 12, fontWeight: selected ? 600 : 400,
              cursor: 'pointer',
            }}>{chip}</button>
          );
        })}
      </div>

      {/* Layer 3: 직접 입력 + datalist autocomplete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          list={inputId}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="직접 입력 또는 검색…"
          style={{
            flex: 1, padding: '6px 12px', borderRadius: 20,
            border: '1px dashed var(--border-med)',
            background: 'transparent', color: 'var(--text)',
            fontSize: 12, outline: 'none',
          }}
        />
        <datalist id={inputId}>
          {autocompleteList.filter(o => !values.includes(o)).map(o => (
            <option key={o} value={o} />
          ))}
        </datalist>
        {input.trim() && (
          <button onClick={handleAdd} style={{
            width: 26, height: 26, borderRadius: 13,
            border: 'none', background: activeColor,
            color: '#fff', fontSize: 16, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>+</button>
        )}
      </div>
    </div>
  );
}

// 실패 항목 하나의 상세 — 원인 태그 다중선택 + "상대가 어떻게 막았나요?" 한 줄 (task-022).
//
// 🔴 태그 추가(+)는 **모달을 새로 띄우지 않는다.** 이 화면(SparEditor) 자체가 이미 Modal 안이라
//   여기서 또 Modal 을 열면 모달 안 모달이 된다 — 배경 스크롤 잠금과 닫기(onClose)가 서로
//   얽혀 바깥 모달이 같이 닫히기 쉽다. 그래서 카드 안에서 입력칸이 펼쳐지는 인라인 방식으로 둔다.
function FailDetail({ item, causes, onToggleCause, onReaction, onAddCause }) {
  const [adding, setAdding]   = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy]       = useState(false);

  const selected = Array.isArray(item.causes) ? item.causes : [];

  // 고를 수 있는 칩 = 활성 태그 + 「비활성이지만 이 기록이 이미 고른」 태그.
  // 비활성 태그를 빼 버리면 과거 기록에서 원인 칩이 통째로 사라져 기록이 깨져 보인다.
  const chips = [
    ...causes.filter(c => c.active),
    ...causes.filter(c => !c.active && selected.includes(c.id)),
  ];
  // 목록에 아예 없는 id(다른 경로로 행이 지워진 경우). 조용히 버리지 않고 보여 줘서
  // 사용자가 알아채고 해제할 수 있게 한다.
  const orphanIds = selected.filter(id => !causes.some(c => c.id === id));

  async function submitNew() {
    const val = newName.trim();
    if (!val || busy) return;
    setBusy(true);
    const created = await onAddCause(val);
    setBusy(false);
    if (created && created.id) {
      if (!selected.includes(created.id)) onToggleCause(created.id);
      setNewName('');
      setAdding(false);
    }
  }

  return (
    <div style={{
      marginTop: 6, marginBottom: 8, padding: '9px 10px',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 6 }}>
        {item.name} — 왜 안 됐나요?
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
        {chips.map(c => {
          const sel = selected.includes(c.id);
          return (
            <button key={c.id} onClick={() => onToggleCause(c.id)} style={{
              padding: '5px 11px', borderRadius: 20,
              background: sel ? 'var(--accent)' : 'var(--surface-up)',
              color: sel ? '#fff' : 'var(--text2)',
              border: sel ? '1px solid var(--accent)' : '1px solid var(--border-med)',
              fontSize: 12, fontWeight: sel ? 700 : 500,
              opacity: c.active ? 1 : 0.6,
              cursor: 'pointer',
            }}>
              {c.name}{c.active ? '' : ' (해제됨)'}
            </button>
          );
        })}
        {orphanIds.map(id => (
          <button key={`orphan-${id}`} onClick={() => onToggleCause(id)} style={{
            padding: '5px 11px', borderRadius: 20,
            background: 'var(--surface-up)', color: 'var(--text3)',
            border: '1px dashed var(--border-med)',
            fontSize: 12, cursor: 'pointer',
          }}>없는 태그 #{id} ×</button>
        ))}
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            width: 26, height: 26, borderRadius: 13,
            border: '1px dashed var(--border-med)', background: 'transparent',
            color: 'var(--accent)', fontSize: 15, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }} title="원인 태그 추가">+</button>
        )}
      </div>

      {adding && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <input
            value={newName}
            autoFocus
            maxLength={40}   /* spar_causes.name VARCHAR(40) — 서버도 같은 값으로 막는다 */
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submitNew(); }
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            placeholder="새 원인 태그 (예: 무게중심)"
            style={{
              flex: 1, padding: '6px 12px', borderRadius: 20,
              border: '1px dashed var(--border-med)',
              background: 'transparent', color: 'var(--text)',
              fontSize: 12, outline: 'none',
            }}
          />
          <button onClick={submitNew} disabled={busy || !newName.trim()} style={{
            padding: '5px 10px', borderRadius: 14, border: 'none',
            background: newName.trim() ? 'var(--accent)' : 'var(--border-med)',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer', flexShrink: 0,
          }}>{busy ? '…' : '추가'}</button>
          <button onClick={() => { setAdding(false); setNewName(''); }} style={{
            padding: '5px 8px', borderRadius: 14,
            border: '1px solid var(--border-med)', background: 'transparent',
            color: 'var(--text3)', fontSize: 12, cursor: 'pointer', flexShrink: 0,
          }}>취소</button>
        </div>
      )}

      {/* 선택 입력 — 비워도 저장된다 */}
      <input
        value={item.reaction || ''}
        onChange={e => onReaction(e.target.value)}
        maxLength={200}
        placeholder="상대가 어떻게 막았나요? (선택)"
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 8,
          border: '1px solid var(--border-med)',
          background: 'transparent', color: 'var(--text)',
          fontSize: 12, outline: 'none',
        }}
      />
    </div>
  );
}

function GrowthSessionCard({
  idx, session, weakAutocomplete, successAutocomplete, tapTechSuggestions,
  opponentSuggestions, causes, onAddCause, onRemove, onUpdate,
}) {
  const [expanded, setExpanded] = useState(false);
  const [customTapTech, setCustomTapTech] = useState('');

  const goodTechs = session.successTried.filter(t => t.success).map(t => t.name);
  const tapTechs  = session.successTried.filter(t => !t.success).map(t => t.name);

  // 실패 항목은 **배열 전체에서의 위치(i)** 를 들고 다닌다. 원인·리액션을 그 항목 객체에
  // 직접 쓰기 위해서다 — 인덱스로 짝지은 별도 배열이 아니므로 항목을 지워도 짝이 밀리지 않는다.
  const failEntries = session.successTried
    .map((t, i) => ({ t, i }))
    .filter(x => !x.t.success);

  // 성장 포인트 handlers
  function toggleWeak(name) {
    if (session.weak.includes(name))
      onUpdate('weak', session.weak.filter(w => w !== name));
    else
      onUpdate('weak', [...session.weak, name]);
  }
  function removeWeak(name) { onUpdate('weak', session.weak.filter(w => w !== name)); }
  function addWeak(name) {
    if (!session.weak.includes(name)) onUpdate('weak', [...session.weak, name]);
  }

  // 성공한 기술 handlers
  function toggleGoodTech(name) {
    if (goodTechs.includes(name)) {
      const i = session.successTried.findIndex(t => t.name === name && t.success);
      if (i >= 0) onUpdate('successTried', session.successTried.filter((_, j) => j !== i));
    } else {
      onUpdate('successTried', [...session.successTried, newSuccessItem(name, true)]);
    }
  }
  function removeGoodTech(name) {
    const i = session.successTried.findIndex(t => t.name === name && t.success);
    if (i >= 0) onUpdate('successTried', session.successTried.filter((_, j) => j !== i));
  }
  function addGoodTech(name) {
    if (!goodTechs.includes(name))
      onUpdate('successTried', [...session.successTried, newSuccessItem(name, true)]);
  }

  // 안 된 기술 handlers — 선택을 해제하면 그 항목의 원인·리액션도 같이 사라진다(항목 내부에 있으므로)
  function toggleTapTech(name) {
    if (tapTechs.includes(name)) {
      const i = session.successTried.findIndex(t => t.name === name && !t.success);
      if (i >= 0) onUpdate('successTried', session.successTried.filter((_, j) => j !== i));
    } else {
      onUpdate('successTried', [...session.successTried, newSuccessItem(name, false)]);
    }
  }
  function addCustomTapTech() {
    const val = customTapTech.trim();
    if (val && !tapTechs.includes(val))
      onUpdate('successTried', [...session.successTried, newSuccessItem(val, false)]);
    setCustomTapTech('');
  }

  /** successTried[i] 에 부분 갱신 — 원인·리액션은 항목 객체 안에 저장된다 */
  function patchItem(i, patch) {
    onUpdate('successTried', session.successTried.map((t, j) => j === i ? { ...t, ...patch } : t));
  }
  function toggleCause(i, causeId) {
    const cur = Array.isArray(session.successTried[i]?.causes) ? session.successTried[i].causes : [];
    patchItem(i, {
      causes: cur.includes(causeId) ? cur.filter(c => c !== causeId) : [...cur, causeId],
    });
  }

  function step(key, delta) {
    onUpdate(key, Math.max(0, (parseInt(session[key]) || 0) + delta));
  }

  const tapTechChips = [
    ...tapTechs,
    ...tapTechSuggestions.filter(s => !tapTechs.includes(s)).slice(0, 8),
  ];

  return (
    <div style={{
      padding: 14, background: 'var(--surface-up)',
      border: '1px solid var(--border)', borderRadius: 14, marginBottom: 8,
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 6,
            background: 'var(--accent-dim)', color: 'var(--accent)',
            fontSize: 11, fontWeight: 800,
          }}>{idx + 1}</span>
          라운드
        </span>
        <button onClick={onRemove} style={{
          background: 'transparent', border: '1px solid var(--border-med)',
          color: 'var(--red)', padding: '4px 8px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Icon name="trash" size={12} color="var(--red)" /> 삭제
        </button>
      </div>

      {/* ① 뭐가 안 됐어요? — 복기·연구의 재료가 여기서 나온다. 그래서 맨 위다 (task-022) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)', marginBottom: 8 }}>
          뭐가 안 됐어요?
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tapTechChips.map(chip => {
            const sel = tapTechs.includes(chip);
            return (
              <button key={chip} onClick={() => toggleTapTech(chip)} style={{
                padding: '5px 11px', borderRadius: 20,
                background: sel ? 'var(--red-dim, #fde8e8)' : 'var(--surface)',
                color: sel ? 'var(--red)' : 'var(--text2)',
                fontSize: 12, fontWeight: sel ? 700 : 500,
                cursor: 'pointer',
                border: sel ? '1px solid var(--red)' : '1px solid var(--border-med)',
              }}>{chip}</button>
            );
          })}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              list={`taptech-${idx}`}
              value={customTapTech}
              onChange={e => setCustomTapTech(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTapTech(); } }}
              placeholder="직접 입력"
              style={{
                padding: '5px 9px', borderRadius: 20,
                border: '1px dashed var(--border-med)',
                background: 'transparent', color: 'var(--text)',
                fontSize: 12, outline: 'none', width: 90,
              }}
            />
            {/* 기존 autocomplete 재사용 — 지금까지 적은 실패 기술 빈도순 */}
            <datalist id={`taptech-${idx}`}>
              {tapTechSuggestions.filter(o => !tapTechs.includes(o)).map(o => (
                <option key={o} value={o} />
              ))}
            </datalist>
            {customTapTech.trim() && (
              <button onClick={addCustomTapTech} style={{
                width: 24, height: 24, borderRadius: 12,
                border: 'none', background: 'var(--red)',
                color: '#fff', fontSize: 16, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>+</button>
            )}
          </div>
        </div>

        {/* 고른 실패 기술마다 원인 태그 + 리액션 한 줄 */}
        {failEntries.map(({ t, i }) => (
          <FailDetail
            key={`${i}-${t.name}`}
            item={t}
            causes={causes}
            onToggleCause={(cid) => toggleCause(i, cid)}
            onReaction={(v) => patchItem(i, { reaction: v })}
            onAddCause={onAddCause}
          />
        ))}
      </div>

      {/* ② 뭐가 됐어요? — 성공한 기술 + 상대 벨트(채움률 98%) */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#B8860B', marginBottom: 8 }}>
          뭐가 됐어요?
        </div>
        <ChipSection
          label="성공한 기술"
          values={goodTechs}
          baseChips={KEY_TECHNIQUES}
          autocompleteList={successAutocomplete}
          color="gold"
          onToggle={toggleGoodTech}
          onAdd={addGoodTech}
          onRemove={removeGoodTech}
          inputId={`success-${idx}`}
        />
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
            상대 벨트
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BELT_LEVELS.map(belt => {
              const pill = BELT_PILL[belt] || BELT_PILL['화이트'];
              const active = session.level === belt;
              return (
                <button key={belt} onClick={() => onUpdate('level', active ? '' : belt)} style={{
                  padding: '6px 13px', borderRadius: 20, border: 'none',
                  background: active ? pill.active : pill.bg,
                  color: active ? pill.activeText : pill.text,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                }}>{belt}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 시간 — 채움률 96%. 접힘 안으로 넣으면 대부분의 라운드에서 「펼치기+선택」 2탭이 늘어난다.
          task-017 이 1탭 프리셋으로 만들어 둔 자리를 그대로 지킨다. 접힘에는 채움률이 낮은
          상대 이름·탭 수·포지션·메모만 남긴다. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
          시간(분)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {TIME_PRESETS.map(m => {
            const active = (parseInt(session.time) || 0) === m;
            return (
              <button key={m} onClick={() => onUpdate('time', active ? '' : m)} style={{
                padding: '7px 15px', borderRadius: 20,
                border: active ? '1px solid var(--accent)' : '1px solid var(--border-med)',
                background: active ? 'var(--accent-dim)' : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--text2)',
                fontSize: 13, fontWeight: active ? 700 : 500,
                cursor: 'pointer',
              }}>{m}분</button>
            );
          })}
          <input
            type="number" inputMode="numeric" min="0" max="127"
            value={session.time === null || session.time === undefined ? '' : String(session.time)}
            onChange={e => onUpdate('time', e.target.value)}
            placeholder="직접"
            style={{
              width: 62, padding: '6px 10px', borderRadius: 20,
              border: '1px dashed var(--border-med)',
              background: 'transparent', color: 'var(--text)',
              fontSize: 12, outline: 'none',
            }}
          />
        </div>
      </div>

      {/* 성장 포인트 */}
      <div style={{ marginBottom: 10 }}>
        <ChipSection
          label="성장 포인트"
          values={session.weak}
          baseChips={BASE_WEAKNESSES}
          autocompleteList={weakAutocomplete}
          color="blue"
          onToggle={toggleWeak}
          onAdd={addWeak}
          onRemove={removeWeak}
          inputId={`weak-${idx}`}
        />
      </div>

      {/* 라운드별 상세 — 접어서 유지한다. 지우지 않는다 (task-022 확정 결정 5) */}
      <button onClick={() => setExpanded(!expanded)} style={{
        width: '100%', padding: '7px 0',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, color: 'var(--text2)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>
        {expanded ? '▲ 접기' : '▼ 라운드 상세 (상대 이름 · 탭 수 · 포지션 · 메모)'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 상대 이름 */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>상대 이름</label>
            <input
              list={`opp-${idx}`}
              value={session.opponent}
              onChange={e => onUpdate('opponent', e.target.value)}
              placeholder="이름 (선택)"
            />
            <datalist id={`opp-${idx}`}>
              {opponentSuggestions.map(o => <option key={o} value={o} />)}
            </datalist>
          </div>

          {/* 탭 수 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StepperField label="탭 받음" value={parseInt(session.tapGot) || 0}  onStep={d => step('tapGot', d)} />
            <StepperField label="탭 줌"   value={parseInt(session.tapGave) || 0} onStep={d => step('tapGave', d)} />
          </div>

          {/* 포지션 — 편집 UI는 원래부터 없다. 기존 값은 저장 때 그대로 되돌려 보내고(유실 방지)
              여기서는 읽기 전용으로 보여만 준다. 값이 없으면 아무것도 그리지 않는다. */}
          {(session.positions || []).length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
                포지션 <span style={{ fontWeight: 500, color: 'var(--text3)' }}>(기록 보존 · 편집 불가)</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(session.positions || []).map((p, pi) => (
                  <span key={pi} style={{
                    padding: '4px 10px', borderRadius: 20,
                    background: 'var(--surface)', color: 'var(--text2)',
                    border: '1px solid var(--border-med)', fontSize: 12,
                  }}>
                    {typeof p === 'string' ? p : (p?.name || '')}
                    {typeof p === 'object' && p?.score ? ` · ${p.score}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 세션 메모 */}
          <div className="field" style={{ marginBottom: 0 }}>
            <label>세션 메모</label>
            <textarea rows={2} value={session.note} onChange={e => onUpdate('note', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}


function StepperField({ label, value, onStep }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onStep(-1)} style={stepperBtnStyle}>−</button>
        <span style={{ fontSize: 15, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{value}</span>
        <button onClick={() => onStep(+1)} style={stepperBtnStyle}>+</button>
      </div>
    </div>
  );
}

const stepperBtnStyle = {
  width: 28, height: 28, borderRadius: 8,
  border: '1px solid var(--border-med)',
  background: 'var(--surface)', color: 'var(--text)',
  fontSize: 18, lineHeight: 1, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

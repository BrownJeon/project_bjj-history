import React, { useState, useMemo, useEffect } from 'react';
import * as classesApi from '../api/classes';
import * as causesApi from '../api/sparCauses';
import * as enhanceApi from '../api/enhanceMemo';
import * as techniquesApi from '../api/techniques';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import TechPicker from '../components/TechPicker';
import {
  BELT_LEVELS, BASE_WEAKNESSES, TECH_CATEGORIES, mergeUnique,
} from '../utils/baseOptions';
import { normalize, holdOf, buildUsage, buildPool, countByCategory } from '../utils/techSearch';
import { uniqueOpponents } from '../utils/suggestions';
import SparFeedbackCard from '../components/SparFeedbackCard';
import { listPicks } from '../api/picks';
import { getTask, closeTask } from '../api/research';
import WeeklyTaskCloseout from '../components/WeeklyTaskCloseout';
import { normalizeOutcomeOptions, taskSummary } from '../utils/weeklyTask';

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
// 🔴 task-027 "이번 주 과제 마감"은 **여기 없다.** 일부러 없다.
//   스파링 저장은 destroy+reinsert 라 페이로드에 없는 필드가 재저장마다 사라진다(task-017 의 positions).
//   그래서 dev-027a 는 마감 값을 `spar_sessions` 가 아니라 `research_tasks` 에 두고
//   전용 엔드포인트(`POST /api/research/task/:id/close`)로 저장하게 했다 — 함정을 **구조적으로** 피한 것이다.
//   여기(초기값)·아래 기존값 매핑·buildPayload 세 곳에 마감 필드를 넣으면 백엔드 insertSessions() 가
//   읽지 않아 **저장되지 않으면서 "저장된다"는 거짓 신호**만 남는다. 넣지 마라.
//   재저장으로 마감이 지워지지 않는다는 것은 QA 하네스가 실제 재저장으로 확인한다.
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
  const { techniques, classes, reloadTechniques } = useCache();
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

  // 스파링 기술 선택기(성공·실패) 재료 — 카드마다 계산하지 않고 여기서 한 번 (task-047).
  // 사용 횟수 = 이 사람 스파링 기록 전체의 성공+실패(정규화 이름). 카테고리 = 기술트리 DB category.
  const techUsage     = useMemo(() => buildUsage(classes), [classes]);
  const techPool      = useMemo(() => buildPool(techniques, techUsage), [techniques, techUsage]);
  const techCatCounts = useMemo(() => countByCategory(techPool), [techPool]);

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

  // ── 이번 주 과제 마감 (task-027 B) ─────────────────────────────────────────
  // 🔴 세 화면(`/research` 시트 · 홈 · 여기)이 **같은 엔드포인트**를 읽는다.
  //    여기서만 다른 출처를 쓰면 같은 과제가 화면마다 다르게 보인다.
  // 🔴 기본값은 `null`("아직 안 고름")이다. `not_tried` 를 기본값으로 두면 아무것도 안 한 저장이
  //    "시도 못 함"이라는 기록을 만든다 — outcome 에 기본값을 두지 않은 task-017 과 같은 이유.
  const [weeklyTask, setWeeklyTask] = useState(null);
  const [taskOptions, setTaskOptions] = useState({ options: [], fromServer: true });
  const [taskOutcome, setTaskOutcome] = useState(null);
  // 🔴 과제 조회 실패를 **조용히 삼키지 않는다.** 삼키면 3택이 안 뜨는 것과 "과제가 없는 것"이
  //    화면에서 똑같이 보여서, 열린 과제가 있는 사람이 그날 마감을 못 하고도 이유를 모른다.
  //    저장 자체는 막지 않는다 — 스파링 기록이 과제 때문에 인질이 되면 안 된다.
  const [taskErr, setTaskErr] = useState('');
  useEffect(() => {
    let alive = true;
    getTask()
      .then(d => {
        if (!alive) return;
        setWeeklyTask(d?.task ?? null);
        setTaskOptions(normalizeOutcomeOptions(d?.outcomeOptions));
        setTaskErr('');
      })
      .catch(e => { if (alive) setTaskErr(e.message || '불러오지 못했습니다'); });
    return () => { alive = false; };
  }, []);

  // 실패 원인 태그 — 이 화면에서만 쓰므로 CacheContext(전 페이지 공통 로딩)에 올리지 않고
  // 여기서 직접 받는다. 서버가 조회마다 기본 7개(active=1)를 맞춰 준다(task-045).
  // 비활성(= 직접 입력) 태그까지 함께 받는다 — 과거 기록이 고른 태그의 이름을 보여 줘야 하기 때문.
  // 선택지로 까는 건 기본 7개뿐이고, 직접 입력 태그는 FailDetail 이 그 항목이 고른 것만 보여 준다.
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
      // 목록 재조회가 실패해도 방금 받은 태그의 이름은 알고 있다 — 「없는 태그 #id」로 보이지 않게 넣어 둔다
      if (created && created.id) {
        setCauses(prev => (prev.some(c => c.id === created.id) ? prev : [...prev, created]));
      }
      return created;          // 방금 만든(또는 같은 이름으로 이미 있던) 태그를 바로 선택할 수 있게 돌려준다
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
  /** 함수형 갱신 — 기술 선택기 전용. "기술트리에도 등록"은 서버 응답을 기다린 **뒤에** 항목을 넣는데,
   *  그 사이 화면이 다시 그려졌으면 위 updateSession(렌더 시점 sessions 를 복사)은 옛 상태로 덮어쓴다. */
  function updateSessionWith(i, fn) {
    setSessions(prev => prev.map((s, idx) => idx === i ? fn(s) : s));
  }

  /** `+` → "기술트리에도 등록" (task-047). 성공하면 {name} — 선택기가 그 이름으로 항목을 넣는다.
   *  🔴 실패하면 이유를 토스트로 알리고 null — 항목을 넣지 않는다(조용히 성공한 척하지 않는다).
   *  서버(POST /api/techniques)는 같은 이름(대소문자 무시)이 이미 있으면 새로 만들지 않고 {id, existing:true} 를
   *  돌려준다 — 그때는 그 기술을 고른 것으로 하고, 그 기술의 카테고리는 바꾸지 않는다(서버가 안 바꾼다). */
  async function registerTechnique(name, category) {
    const clean = String(name || '').trim();
    if (!clean || !TECH_CATEGORIES.includes(category)) {
      showToast('기술트리 등록 실패: 이름과 카테고리를 확인해 주세요');
      return null;
    }
    if (holdOf(normalize(clean))) {   // 화면에서 버튼이 꺼져 있지만 한 번 더 막는다
      showToast(`「${clean}」은(는) 관장 보류 기술이라 기술트리에 등록하지 않아요 — "이 기록에만"으로 적어 주세요`);
      return null;
    }
    let res;
    try {
      res = await techniquesApi.createTechnique({ name: clean, category });
    } catch (e) {
      showToast('기술트리 등록 실패: ' + e.message);
      return null;
    }
    if (!res || res.id == null) {
      showToast('기술트리 등록 실패: 서버가 등록 결과를 돌려주지 않았어요');
      return null;
    }
    try {
      await reloadTechniques();
    } catch (e) {
      // 등록은 됐다 — 항목은 넣는다. 목록 갱신만 실패했음을 숨기지 않는다.
      showToast(`「${clean}」은(는) 기술트리에 등록됐지만 목록을 다시 불러오지 못했어요: ${e.message}`);
      return { name: clean };
    }
    showToast(res.existing
      ? `「${clean}」은(는) 이미 기술트리에 있어요 — 그 기술로 골랐어요(카테고리는 그대로)`
      : `기술트리에 「${clean}」(${category}) 등록`);
    return { name: clean };
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
      const failTech = s.successTried.filter(t => !t.success);
      if (good.length) line += `\n  성공한 기술: ${good.map(t => t.name).join(', ')}`;
      if (failTech.length) line += `\n  안 된 기술(시도했지만 실패): ${failTech.map(t => t.name).join(', ')}`;
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
      // 🔴 순서가 중요하다. **스파링 저장이 성공한 뒤에만** 과제를 마감한다.
      //    먼저 마감하면 스파링 저장이 실패했을 때 "과제는 닫혔는데 그날 기록은 없는" 상태가 남는다.
      //    반대로 마감이 실패하면 과제는 그냥 열린 채로 남는다 — 잃는 값이 없고 다음에 다시 닫으면 된다.
      //    🔴 실패를 조용히 삼키지 않는다. 스파링은 저장됐다는 사실과 무엇이 안 됐는지를 함께 말한다.
      const wt = taskSummary(weeklyTask);
      let closeFailed = '';
      if (taskOutcome && wt.has && wt.open && wt.id != null) {
        try {
          await closeTask(wt.id, { outcome: taskOutcome });
        } catch (e) {
          closeFailed = e.message || '알 수 없는 오류';
        }
      }
      // onSaved 는 마감까지 끝난 뒤 한 번만 부른다 — 홈 카드가 "마감됨"을 바로 읽게 하기 위해서다.
      onSaved && onSaved();
      if (closeFailed) showToast(`스파링은 저장되었습니다 · 과제 마감 실패: ${closeFailed}`);

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
            techPool={techPool}
            techCatCounts={techCatCounts}
            onRegisterTech={registerTechnique}
            opponentSuggestions={opponentSuggestions}
            causes={causes}
            onAddCause={addCause}
            onRemove={() => removeSession(i)}
            onUpdate={(k, v) => updateSession(i, k, v)}
            onUpdateWith={(fn) => updateSessionWith(i, fn)}
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

      {/* 이번 주 과제 마감 3택 (task-027 B) — 열린 과제가 없으면 컴포넌트가 null 을 돌려준다.
          🔴 3택 라벨은 서버(`outcomeOptions[]`)가 정본이다. 여기에 한글을 적지 마라. */}
      <WeeklyTaskCloseout
        task={weeklyTask}
        options={taskOptions.options}
        fromServer={taskOptions.fromServer}
        value={taskOutcome}
        onChange={setTaskOutcome}
        err={taskErr}
      />

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

      {/* Layer 3: 직접 입력 — 모바일에서 브라우저 자동완성 목록이 키보드를 가려 제거함(datalist 미사용) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder="직접 입력…"
          autoComplete="off"
          style={{
            flex: 1, padding: '6px 12px', borderRadius: 20,
            border: '1px dashed var(--border-med)',
            background: 'transparent', color: 'var(--text)',
            fontSize: 12, outline: 'none',
          }}
        />
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

// 「모르겠음」 — 다른 원인과 같이 고르지 않는다(관장 확정, task-045).
// 🔴 이름은 backend/src/routes/sparCauses.js 의 DEFAULT_CAUSES 와 글자까지 같아야 한다.
const UNKNOWN_CAUSE = '모르겠음';

// 실패 항목 하나의 상세 — 원인 태그 다중선택 + "상대가 어떻게 막았나요?" 한 줄 (task-022 · task-045).
//
// 🔴 태그 추가(+)는 **모달을 새로 띄우지 않는다.** 이 화면(SparEditor) 자체가 이미 Modal 안이라
//   여기서 또 Modal 을 열면 모달 안 모달이 된다 — 배경 스크롤 잠금과 닫기(onClose)가 서로
//   얽혀 바깥 모달이 같이 닫히기 쉽다. 그래서 카드 안에서 입력칸이 펼쳐지는 인라인 방식으로 둔다.
// 🔴 `+` 로 입력한 태그는 **이 기록에만** 남는다(서버가 active=0 으로 만든다). 다음 기록의 선택지는
//   다시 기본 7개뿐이다 — task-022 에서는 한 번 적은 문장이 모든 기록의 선택지에 영구히 쌓였다.
function FailDetail({ item, causes, onChangeCauses, onReaction, onAddCause }) {
  const [adding, setAdding]   = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy]       = useState(false);
  // 이 카드에서 방금 직접 입력한 태그 id. 실수로 해제해도 편집하는 동안은 칩이 남아 다시 누를 수
  // 있게 한다(저장하고 다시 열면 「이 항목이 고른 것」만 남는다 — 안 고른 입력은 흔적이 없다).
  const [addedIds, setAddedIds] = useState([]);

  const selected = Array.isArray(item.causes) ? item.causes : [];
  const unknownId = causes.find(c => c.active && c.name === UNKNOWN_CAUSE)?.id ?? null;

  // 칩 = 기본 태그(active, 서버가 sort 순으로 준다)
  //    + 직접 입력 태그 중 「이 항목이 이미 고른 것」·「이 카드에서 방금 입력한 것」.
  // 다른 기록에서 입력한 태그는 뜨지 않는다. 이 항목이 고른 직접 입력 태그를 빼 버리면 과거 기록에서
  // 원인 칩이 통째로 사라져 기록이 깨져 보이므로 그건 남긴다(표시는 기본 태그와 똑같이).
  const chips = [
    ...causes.filter(c => c.active),
    ...causes.filter(c => !c.active && (selected.includes(c.id) || addedIds.includes(c.id))),
  ];

  /** 고르기·풀기. 「모르겠음」을 고르면 다른 원인이 풀리고, 다른 원인을 고르면 「모르겠음」이 풀린다. */
  function toggle(id) {
    if (selected.includes(id)) return onChangeCauses(selected.filter(x => x !== id));
    if (unknownId != null && id === unknownId) return onChangeCauses([id]);
    onChangeCauses([...selected.filter(x => x !== unknownId), id]);
  }
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
      // 기본 태그 이름을 쳤으면 서버가 그 기본 태그를 돌려준다(active=1) — 이미 칩으로 떠 있다
      if (!created.active) setAddedIds(prev => (prev.includes(created.id) ? prev : [...prev, created.id]));
      if (!selected.includes(created.id)) toggle(created.id);
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
            <button key={c.id} onClick={() => toggle(c.id)} style={{
              padding: '5px 11px', borderRadius: 20,
              background: sel ? 'var(--accent)' : 'var(--surface-up)',
              color: sel ? '#fff' : 'var(--text2)',
              border: sel ? '1px solid var(--accent)' : '1px solid var(--border-med)',
              fontSize: 12, fontWeight: sel ? 700 : 500,
              cursor: 'pointer',
            }}>
              {c.name}
            </button>
          );
        })}
        {orphanIds.map(id => (
          <button key={`orphan-${id}`} onClick={() => toggle(id)} style={{
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

      {/* 입력칸은 한 줄을 통째로 쓰고 추가·취소는 그 아래로 내린다 — 버튼과 한 줄에 두면 390px 폭에서
          안내문이 「…이 기록」에서 잘려 정작 알려야 할 「이 기록에만 남아요」가 안 보였다(task-045 실측). */}
      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <input
            value={newName}
            autoFocus
            maxLength={40}   /* spar_causes.name VARCHAR(40) — 서버도 같은 값으로 막는다 */
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); submitNew(); }
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            placeholder="맞는 칸이 없을 때만, 짧게 — 이 기록에만 남아요"
            autoComplete="off"
            style={{
              flex: '1 1 100%', minWidth: 0, padding: '6px 12px', borderRadius: 20,
              border: '1px dashed var(--border-med)',
              background: 'transparent', color: 'var(--text)',
              fontSize: 12, outline: 'none',
            }}
          />
          <button onClick={submitNew} disabled={busy || !newName.trim()} style={{
            padding: '5px 10px', borderRadius: 14, border: 'none',
            background: newName.trim() ? 'var(--accent)' : 'var(--border-med)',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: busy ? 'wait' : 'pointer', flexShrink: 0, marginLeft: 'auto',
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
        placeholder="상대가 어떻게 막았나요? (예: 자세를 낮게 깔았음)"
        autoComplete="off"
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
  idx, session, weakAutocomplete, techPool, techCatCounts, onRegisterTech,
  opponentSuggestions, causes, onAddCause, onRemove, onUpdate, onUpdateWith,
}) {
  const [expanded, setExpanded] = useState(false);

  // 성공·실패 항목은 **배열 전체에서의 위치(i)** 를 들고 다닌다. 원인·리액션을 그 항목 객체에
  // 직접 쓰기 위해서다 — 인덱스로 짝지은 별도 배열이 아니므로 항목을 지워도 짝이 밀리지 않는다.
  // 선택 칩(TechPicker)도 이 위치로 뺀다 — 같은 이름이 두 번 들어간 옛 기록에서도 하나씩 정확히 빠진다.
  const entries      = session.successTried.map((t, i) => ({ t, i }));
  const goodEntries  = entries.filter(x => x.t.success);
  const failEntries  = entries.filter(x => !x.t.success);
  const goodSelected = goodEntries.map(({ t, i }) => ({ name: t.name, i }));
  const failSelected = failEntries.map(({ t, i }) => ({ name: t.name, i }));

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

  // 성공·실패 기술 handlers (task-047 — TechPicker). 같은 기술인지는 **정규화 이름**(띄어쓰기·대소문자 무시)으로 본다 —
  //   트리 "니슬라이드"를 눌렀을 때 옛 기록의 "니 슬라이드"가 이미 있으면 새로 넣지 않고 그걸 뺀다(토글).
  //   저장된 이름은 한 글자도 바꾸지 않는다(옛 철자 그대로 저장 — 기존 기록 수정 금지).
  // 🔴 새 항목은 반드시 newSuccessItem() — causes·reaction 필드가 빠지면 저장(destroy+reinsert)에서 사라진다.
  // 함수형 갱신(onUpdateWith)을 쓰는 이유: "기술트리에도 등록"은 서버 응답 뒤에 onAdd 가 불린다(렌더 시점 복사본 금지).
  const sameItem = (success, key) => t => !!t.success === success && normalize(t.name) === key;
  function toggleTech(name, success) {
    const key = normalize(name);
    onUpdateWith(s => {
      const i = s.successTried.findIndex(sameItem(success, key));
      return { ...s, successTried: i >= 0
        ? s.successTried.filter((_, j) => j !== i)
        : [...s.successTried, newSuccessItem(name, success)] };
    });
  }
  function addTech(name, success) {
    const key = normalize(name);
    if (!key) return;
    onUpdateWith(s => (s.successTried.some(sameItem(success, key))
      ? s
      : { ...s, successTried: [...s.successTried, newSuccessItem(name, success)] }));
  }
  // 칩 × — 선택을 해제하면 그 항목의 원인·리액션도 같이 사라진다(항목 내부에 있으므로. 기존과 같음)
  function removeTechAt(i) {
    onUpdateWith(s => ({ ...s, successTried: s.successTried.filter((_, j) => j !== i) }));
  }

  /** successTried[i] 에 부분 갱신 — 원인·리액션은 항목 객체 안에 저장된다 */
  function patchItem(i, patch) {
    onUpdate('successTried', session.successTried.map((t, j) => j === i ? { ...t, ...patch } : t));
  }

  function step(key, delta) {
    onUpdate(key, Math.max(0, (parseInt(session[key]) || 0) + delta));
  }

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

      {/* ① 상대 벨트 — 채움률 98%. 선택 안 됨 = 벨트 고유색(연한 배경), 선택됨 = 검정 테두리 +
          진한 배경(pill.active)으로 강조 — 가는 테두리만으로는 구분이 잘 안 돼서(사용자 피드백),
          테두리색을 벨트색과 무관한 검정으로 고정하고 배경 자체도 진하게 바꾼다. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>
          상대 벨트
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BELT_LEVELS.map(belt => {
            const pill = BELT_PILL[belt] || BELT_PILL['화이트'];
            const active = session.level === belt;
            return (
              <button key={belt} onClick={() => onUpdate('level', active ? '' : belt)} style={{
                padding: '6px 13px', borderRadius: 20,
                border: active ? '2px solid #000' : '2px solid transparent',
                background: active ? pill.active : pill.bg,
                color: active ? pill.activeText : pill.text,
                fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: 'pointer',
              }}>{belt}</button>
            );
          })}
        </div>
      </div>

      {/* ② 시간 — 채움률 96%. 접힘 안으로 넣으면 대부분의 라운드에서 「펼치기+선택」 2탭이 늘어난다.
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

      {/* ③ 성공한 기술 — 카테고리 → 사용 횟수순 목록 / 검색 → 고른 칩 (task-047, 성공·실패 선택기 따로) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#B8860B', marginBottom: 7 }}>
          성공한 기술
        </div>
        <TechPicker
          tone="gold"
          pool={techPool}
          catCounts={techCatCounts}
          selected={goodSelected}
          onToggle={(name) => toggleTech(name, true)}
          onAdd={(name) => addTech(name, true)}
          onRemove={removeTechAt}
          onRegister={onRegisterTech}
        />
      </div>

      {/* ④ 실패한 기술 — 복기·연구의 재료가 여기서 나온다 (task-022). 고른 항목마다 원인 태그(task-045)는 아래 그대로 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--red)', marginBottom: 8 }}>
          실패한 기술
        </div>
        <TechPicker
          tone="red"
          pool={techPool}
          catCounts={techCatCounts}
          selected={failSelected}
          onToggle={(name) => toggleTech(name, false)}
          onAdd={(name) => addTech(name, false)}
          onRemove={removeTechAt}
          onRegister={onRegisterTech}
        />

        {/* 고른 실패 기술마다 원인 태그 + 리액션 한 줄 */}
        {failEntries.map(({ t, i }) => (
          <FailDetail
            key={`${i}-${t.name}`}
            item={t}
            causes={causes}
            onChangeCauses={(next) => patchItem(i, { causes: next })}
            onReaction={(v) => patchItem(i, { reaction: v })}
            onAddCause={onAddCause}
          />
        ))}
      </div>

      {/* ⑤ 성장 포인트 */}
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
              value={session.opponent}
              onChange={e => onUpdate('opponent', e.target.value)}
              placeholder="이름 (선택)"
              autoComplete="off"
            />
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

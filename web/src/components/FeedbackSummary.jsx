import React, { useEffect, useRef, useState } from 'react';
import { getTask } from '../api/research';
import { todayKst } from '../utils/feedbackPeriod';
import { taskSummary } from '../utils/weeklyTask';
import { savedSituationLabels } from '../utils/feedbackInput';
import { isFeedbackResultWriteLocked } from '../utils/feedbackRecordController';
import { useFeedback } from '../contexts/FeedbackContext';
import Button from './Button';
import FeedbackStarButton from './FeedbackStarButton';
import FeedbackStatus, { FeedbackLegacySituation } from './FeedbackStatus';
import Icon from './Icon';
import Modal from './Modal';

const RESULT_LABELS = { not_tried: '시도 못 함', tried_failed: '해봤는데 안 됨', done: '됐음' };
const CONTEXT_LABELS = { drill: '드릴', position_spar: '포지션 스파링', spar: '스파링', other: '기타' };
const RESULTS_PENDING_MESSAGE = '피드백을 정리하는 중입니다. 정리가 끝나면 연습 결과를 저장하거나 수정·삭제할 수 있습니다.';

function FeedbackTaskCard({ record }) {
  const { controller, busy, loading, inputDirty, dirtyAnswers, inputConflicts, answerConflicts, uncertainWrite, resultDraft } = useFeedback();
  const [currentTask, setCurrentTask] = useState(null), [loaded, setLoaded] = useState(false), [checking, setChecking] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let alive = true; setLoaded(false);
    getTask().then(data => { if (alive) { setCurrentTask(data.task || null); setLoaded(true); setError(''); } }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [record.id, record.taskBinding?.taskId]);
  const correction = record.summary?.correctionPoints?.[0], practice = record.summary?.practiceMethods?.[0];
  const isCurrent = loaded && currentTask && Number(currentTask.id) === Number(record.taskBinding?.taskId) && record.taskBinding?.sourceHash === record.summarySourceHash;
  const unsubmitted = record.turns.some(turn => (turn.draftAnswer || '').trim() && turn.draftAnswer !== turn.answer);
  const blocked = loading || resultDraft || record.summaryStale || record.ai?.status === 'pending' || inputDirty || Object.keys(dirtyAnswers).length > 0 || Object.keys(inputConflicts).length > 0 || Object.keys(answerConflicts).length > 0 || uncertainWrite || unsubmitted;
  async function assign(expectedTaskId, replace) {
    const result = await controller.assignTask({ expectedTaskId, replace });
    if (result) { const data = await getTask(); setCurrentTask(data.task || null); setLoaded(true); setConfirm(false); }
    else if (controller.getSnapshot().conflict) {
      await controller.reloadConflict();
      const data = await getTask(); setCurrentTask(data.task || null); setLoaded(true); setConfirm(Boolean(data.task));
      setError('현재 과제가 바뀌었습니다. 내용을 확인하고 다시 선택해 주세요.');
    }
  }
  async function start(replace = false) {
    if (lock.current) return; lock.current = true; setChecking(true); setError('');
    try {
      // Re-read even when a previous render showed no task. A replacement is never implicit.
      const data = await getTask(); const task = data.task || null; setCurrentTask(task); setLoaded(true);
      if (!replace && task) { setConfirm(true); return; }
      if (replace && (!task || Number(task.id) !== Number(currentTask?.id))) { setConfirm(Boolean(task)); setError('현재 과제가 바뀌었습니다. 다시 확인해 주세요.'); return; }
      await assign(task?.id ?? null, replace);
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setChecking(false); }
  }
  return <section className="fb-section">
    <h3>이번 주에는 하나만 연습해요</h3>
    <p className="fb-text">{correction?.title || '교정점 확인'} · {practice?.title || '연습 계획 확인'}</p>
    {practice?.check && <p className="fb-muted">확인 기준 · {practice.check}</p>}
    <p className="fb-muted">첫 연습 제안과 확인 기준을 이번 주 과제로 지정합니다. 교정 내용과 전체 근거는 이 피드백 카드에서 확인할 수 있습니다.</p>
    {isCurrent && !blocked ? <div role="status" className="fb-notice">현재 과제로 설정됨</div> : <Button full variant="outline" disabled={busy || checking || blocked} onClick={() => start()}>{checking ? '과제 확인 중…' : '이번 주 과제로 정하기'}</Button>}
    {blocked && <p className="fb-muted">수정·보완 답변을 확정하고 최신 내용으로 다시 정리한 뒤 지정해 주세요.</p>}
    {record.taskBinding && !isCurrent && loaded && <p className="fb-muted">이전에 연결한 과제는 현재 과제 또는 현재 정리와 다릅니다.</p>}
    {error && <p role="alert" className="fb-muted">{error}</p>}
    {confirm && currentTask && <div className="fb-notice warn"><h3>진행 중인 과제가 있어요</h3><p className="fb-text">현재 과제 · {taskSummary(currentTask).title}</p><p className="fb-muted">바꾸면 기존 과제는 ‘시도 못 함’으로 마감하고 이력에 남깁니다.</p><div className="fb-actions"><Button variant="outline" disabled={checking} onClick={() => setConfirm(false)}>기존 과제 유지</Button><Button disabled={checking || blocked} onClick={() => start(true)}>이 과제로 바꾸기</Button></div></div>}
  </section>;
}

function resultFields(item) {
  return { date: item.date, outcome: item.outcome, context: item.context, note: item.note ?? '' };
}
function sameResult(item, fields) {
  if (!item) return false;
  const current = resultFields(item);
  return Object.entries(fields).every(([key, value]) => current[key] === value);
}

function ResultForm({ values, onChange, onSubmit, onCancel, editing, busy, disabled }) {
  return <form className="fb-stack" onSubmit={event => { event.preventDefault(); if (!disabled) onSubmit(values); }}>
    <label className="fb-field">적용 날짜<input type="date" required value={values.date} disabled={busy} onChange={event => onChange({ date: event.target.value })} /></label>
    <div className="fb-date-grid">
      <label className="fb-field">결과<select value={values.outcome} disabled={busy} onChange={event => onChange({ outcome: event.target.value })}>
        {Object.entries(RESULT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="fb-field">연습 상황<select value={values.context} disabled={busy} onChange={event => onChange({ context: event.target.value })}>
        {Object.entries(CONTEXT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
    <label className="fb-field">관찰한 점<textarea rows={3} value={values.note} disabled={busy} onChange={event => onChange({ note: event.target.value })} maxLength={6000} placeholder="어디까지 됐고, 무엇을 다시 확인할지 남겨주세요." /></label>
    <div className="fb-actions">
      {onCancel && <Button variant="outline" disabled={busy} onClick={onCancel}>{editing ? '취소' : '작성 취소'}</Button>}
      <Button variant={editing ? 'primary' : 'outline'} type="submit" disabled={disabled}>{editing ? '수정 내용 저장' : '연습 결과 저장'}</Button>
    </div>
  </form>;
}

function PracticeResults({ record }) {
  const { controller, busy, loading, conflict, uncertainWrite, error, resultDraft, inputConflicts, answerConflicts } = useFeedback();
  const [deletion, setDeletion] = useState(null);
  const [deletionFailed, setDeletionFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const draft = resultDraft ?? { id: null, values: { date: todayKst(), outcome: 'not_tried', context: 'drill', note: '' } };
  const editing = draft.id != null;
  const savedEdit = editing && record.results.find(item => item.id === draft.id);
  const changedEdit = editing && !sameResult(savedEdit, draft.base);
  const savedDeletion = deletion && record.results.find(item => item.id === deletion.id);
  const changedDeletion = deletion && !sameResult(savedDeletion, resultFields(deletion));
  const blocked = busy || loading || conflict || uncertainWrite || Object.keys(inputConflicts).length > 0 || Object.keys(answerConflicts).length > 0;
  const resultWriteLocked = isFeedbackResultWriteLocked(record);
  const writeBlocked = blocked || resultWriteLocked;

  function edit(item) {
    const base = resultFields(item);
    setNotice('');
    controller.setResultDraft({ id: item.id, base, values: base });
  }
  async function submit(values) {
    setNotice('');
    const result = editing ? await controller.updateResult(draft.id, values, draft.base) : await controller.addResult(values);
    if (result) setNotice(editing ? '연습 결과를 수정했습니다.' : '연습 결과를 저장했습니다. 숙련도는 자동으로 변경하지 않습니다.');
  }
  async function remove() {
    setDeletionFailed(false);
    const result = await controller.deleteResult(deletion.id, resultFields(deletion));
    if (result) { setDeletion(null); setNotice('연습 결과를 삭제했습니다.'); }
    else setDeletionFailed(true);
  }
  const form = <ResultForm values={draft.values} onChange={patch => controller.setResultDraft({ ...draft, values: { ...draft.values, ...patch } })}
    onSubmit={submit} onCancel={resultDraft ? () => controller.setResultDraft(null) : undefined} editing={editing} busy={busy || loading} disabled={writeBlocked || changedEdit} />;

  return <section className="fb-section">
    <h3>다음 훈련 결과</h3><p className="fb-muted">실제로 시도한 날짜와 결과를 남겨보세요.</p>
    {resultWriteLocked && <p role="status" className="fb-notice">{RESULTS_PENDING_MESSAGE}</p>}
    {!editing && form}
    {notice && <p role="status" className="fb-muted">{notice}</p>}
    {record.results.map(item => <div key={item.id} className="fb-notice fb-result-entry">
      <div className="fb-row fb-result-heading">
        <p className="fb-muted">{item.date} · {CONTEXT_LABELS[item.context]} · {RESULT_LABELS[item.outcome]}</p>
        <div className="fb-entry-actions">
          <Button size="sm" variant="outline" disabled={writeBlocked || Boolean(resultDraft)} onClick={() => edit(item)}>수정</Button>
          <Button size="sm" variant="outline" disabled={writeBlocked || Boolean(resultDraft)} onClick={() => { setDeletion(item); setDeletionFailed(false); }}>삭제</Button>
        </div>
      </div>
      <p className="fb-text">{item.note}</p>
      {item.id === draft.id && <div className="fb-result-edit">
        {changedEdit && <div className="fb-notice warn" role="status">서버의 연습 결과가 바뀌었습니다. 위 기록을 확인한 뒤 수정 내용을 저장해 주세요.
          <Button size="sm" variant="outline" disabled={blocked} onClick={() => controller.setResultDraft({ ...draft, base: resultFields(item) })}>현재 기록 확인</Button>
        </div>}
        {form}
      </div>}
    </div>)}
    {editing && !savedEdit && <div className="fb-notice warn fb-result-edit">
      <p role="status">편집 중인 연습 결과가 서버에 없습니다.</p>{form}
    </div>}
    {deletion && <Modal title="연습 결과 삭제" onClose={() => { if (!busy) setDeletion(null); }}>
      <div className="fb-stack">
        <p className="fb-text">{deletion.date} · {RESULT_LABELS[deletion.outcome]}</p>
        <p className="fb-muted">이 연습 결과를 삭제할까요? 삭제한 결과는 복구할 수 없습니다.</p>
        {changedDeletion && <p className="fb-notice warn" role="status">서버의 기록이 바뀌었습니다. 닫은 뒤 현재 결과를 다시 확인해 주세요.</p>}
        {resultWriteLocked && <p className="fb-notice" role="status">{RESULTS_PENDING_MESSAGE}</p>}
        {deletionFailed && error && <p className="fb-notice error" role="alert">{error}</p>}
        {(conflict || uncertainWrite) && <Button variant="outline" disabled={busy || loading} onClick={() => conflict ? controller.reloadConflict() : controller.refresh()}>서버 내용 확인</Button>}
        <div className="fb-actions"><Button variant="outline" disabled={busy} onClick={() => setDeletion(null)}>취소</Button><Button variant="danger" disabled={writeBlocked || changedDeletion} onClick={remove}>삭제 확인</Button></div>
      </div>
    </Modal>}
  </section>;
}

export default function FeedbackSummary({ record, onOpenClip, onMore, onEdit, onSummarize }) {
  const { controller, busy, loading, conflict, uncertainWrite, resultDraft } = useFeedback();
  const summary = record.summary;
  const situation = savedSituationLabels(record);
  const editing = busy || loading || Boolean(resultDraft);
  const heading = <div className="fb-row fb-summary-heading"><FeedbackStatus item={record} /><FeedbackStarButton item={record} /></div>;
  return <div className="fb-stack">
    {record.summaryStale && <div role="status" className="fb-notice warn">이전 내용 기준 카드입니다. 변경한 내용과 보완 답변으로 다시 정리해 주세요.<Button variant="outline" onClick={onSummarize} disabled={editing || record.ai?.status === 'pending'}>다시 정리</Button></div>}
    {summary ? <article className="fb-section accent" data-testid="feedback-summary-card">
      {heading}<h2>{summary.title}</h2>
      <div className="fb-wrap">{record.technique && <span className="fb-chip">{record.technique}</span>}{situation.map((label, index) => <span className="fb-chip" key={index}>{label}</span>)}</div>
      <FeedbackLegacySituation value={record.situation} />
      <p className="fb-text">{summary.overview}</p><hr />
      <h3>통합 교정 포인트</h3>{summary.correctionPoints.map((point, index) => <section key={index}><h3>{index + 1}. {point.title}</h3><p className="fb-text">{point.detail}</p>{!!point.sourceQuotes?.length && <details><summary>확인한 근거</summary>{point.sourceQuotes.map((quote, n) => <blockquote key={n} className="fb-quote"><span className="fb-muted">{quote.source === 'original' ? '피드백 원문' : '관장과 보완한 답변'}</span><p>{quote.quote}</p></blockquote>)}</details>}</section>)}
      <hr /><h3>연습 제안</h3><p className="fb-muted">앞으로 시도할 연습 방법입니다. 이미 연습했거나 성공한 기록은 아닙니다.</p>
      {summary.practiceMethods.map((method, index) => <section key={index}><h3>{method.title}</h3><ol>{method.steps.map((step, n) => <li key={n}>{step}</li>)}</ol><p className="fb-text">관찰 기준 · {method.check}</p></section>)}
      {!!summary.unresolved?.length && <><hr /><h3>추가 확인 사항</h3><ul>{summary.unresolved.map((value, index) => <li key={index}>{value}</li>)}</ul></>}
    </article> : <section className="fb-section">{heading}<h3>관장 검토 대기</h3><FeedbackLegacySituation value={record.situation} /><p className="fb-muted">원문과 확정한 보완 답변을 통합해 교정 포인트와 연습 방법을 정리합니다.</p></section>}
    <details><summary>피드백 원문과 보완 대화</summary><div className="fb-stack"><section className="fb-section"><h3>입력한 피드백</h3><p className="fb-text">{record.original}</p></section>{record.turns.filter(turn => turn.answer !== null).map(turn => <section key={turn.id} className="fb-section"><p className="fb-muted">{turn.question}</p><p className="fb-text">{turn.skipped ? '확인 대기' : turn.answer}</p></section>)}</div></details>
    <section className="fb-section"><h3>연결 영상</h3>{record.clips.map(clip => <button type="button" key={clip.id} className="fb-video-row" onClick={() => onOpenClip(clip.id)}><span className="fb-video-glyph"><Icon name="video" /></span><span style={{ flex: 1 }}><strong>{clip.title || '제목 없는 영상'}</strong><small>{clip.tech_name}</small></span><Icon name="chevR" /></button>)}{record.unavailableClipIds?.map(id => <p className="fb-muted" key={id}>연결할 수 없는 영상 #{id}</p>)}{!record.clipIds.length && <p className="fb-muted">연결한 영상이 없습니다. 입력 수정에서 등록영상을 선택할 수 있습니다.</p>}</section>
    {!summary && record.ai?.status !== 'pending' && <Button disabled={editing} onClick={onSummarize}>현재 내용으로 정리</Button>}
    <div className="fb-actions"><Button variant="outline" disabled={editing || record.ai?.status === 'pending'} onClick={onMore}>관장과 더 보완</Button><Button disabled={editing || conflict || uncertainWrite} onClick={() => controller.saveAndClose()}>{summary && !record.summaryStale ? '정리 저장' : '보완 중 저장'}</Button></div>
    <Button variant="ghost" disabled={editing} onClick={onEdit}>입력 수정</Button>
    {summary && <FeedbackTaskCard record={record} />}
    <PracticeResults record={record} />
  </div>;
}

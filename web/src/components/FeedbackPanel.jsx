import React, { useEffect, useRef, useState } from 'react';
import { useFeedback } from '../contexts/FeedbackContext';
import { useCache } from '../contexts/CacheContext';
import * as clipsApi from '../api/clips';
import { listFeedback } from '../api/feedback';
import { isCalendarDate } from '../utils/feedbackPeriod';
import { feedbackSituationLabels, feedbackTechniqueName, SITUATION_LABELS } from '../utils/feedbackInput';
import { isFeedbackResultWriteLocked } from '../utils/feedbackRecordController';
import Modal from './Modal';
import Button from './Button';
import Icon from './Icon';
import ClipDetailModal from './ClipDetailModal';
import FeedbackClipPicker from './FeedbackClipPicker';
import FeedbackSummary from './FeedbackSummary';
import { FeedbackLegacySituation } from './FeedbackStatus';
import FeedbackTechniquePicker from './FeedbackTechniquePicker';

const INPUT_LABEL = { date: '날짜', situation: '상황', situationSelection: '상황', technique: '기술', original: '피드백 내용', clipIds: '연결 영상' };
const showValue = value => Array.isArray(value) ? value.join(', ') : String(value ?? '(없음)');
function showInputValue(key, value) {
  if (key === 'situationSelection') return feedbackSituationLabels(value).join(' · ') || '(없음)';
  if (key === 'technique') return feedbackTechniqueName(value) || '(없음)';
  return showValue(value);
}

function FeedbackConflicts() {
  const { controller, inputConflicts, answerConflicts, orphanDrafts, record } = useFeedback();
  const [targets, setTargets] = useState({}), [append, setAppend] = useState({}), [drop, setDrop] = useState(null), [error, setError] = useState('');
  return <>
    {Object.entries(inputConflicts).map(([key, conflict]) => <section key={key} className="fb-notice warn"><h3>{INPUT_LABEL[key]}이 다른 창에서도 바뀌었습니다</h3><p className="fb-muted">수정 전 · {showInputValue(key, conflict.base)}</p><p className="fb-text">내 입력 · {showInputValue(key, conflict.local)}</p><p className="fb-text">서버 값 · {showInputValue(key, conflict.server)}</p><div className="fb-actions"><Button variant="outline" onClick={() => controller.resolveInputConflict(key, 'local')}>내 입력 사용</Button><Button variant="outline" onClick={() => controller.resolveInputConflict(key, 'server')}>서버 값 사용</Button></div></section>)}
    {Object.entries(answerConflicts).map(([id, conflict]) => <section key={id} className="fb-notice warn"><h3>{conflict.removed ? '보관된 질문에 작성 중인 초안이 있습니다' : '이 답변이 다른 창에서도 바뀌었습니다'}</h3><p className="fb-muted">질문 ID · {id}</p><p className="fb-text">{orphanDrafts[id]?.question || record.turns.find(turn => turn.id === id)?.question}</p><p className="fb-text">내 초안 · {conflict.local}</p>
      {conflict.removed ? <div className="fb-stack"><p className="fb-muted">자동으로 버리지 않습니다. 현재 질문으로 복구한 초안은 답변 제출 전까지 관장 정리의 근거가 아닙니다.</p><label className="fb-field">복구할 현재 질문<select value={targets[id] || ''} onChange={e => setTargets({ ...targets, [id]: e.target.value })}><option value="">질문 선택</option>{record.turns.map((turn, index) => <option key={turn.id} value={turn.id}>질문 {index + 1} · {turn.question}</option>)}</select></label><label className="fb-muted"><input type="checkbox" checked={!!append[id]} onChange={e => setAppend({ ...append, [id]: e.target.checked })} /> 기존 초안 뒤에 덧붙이기</label><div className="fb-actions"><Button variant="outline" disabled={!targets[id]} onClick={() => { if (!controller.recoverAnswerDraft(id, targets[id], { append: !!append[id] })) setError('질문을 선택해 주세요. 기존 초안이 있으면 덧붙이기를 선택해야 합니다.'); else setError(''); }}>초안 복구</Button><Button variant="danger" onClick={() => setDrop(id)}>이 초안 폐기</Button></div></div>
        : <><p className="fb-muted">수정 전 답변 · {showValue(conflict.base?.answer)}</p><p className="fb-text">서버 제출 답변 · {showValue(conflict.server?.answer)}</p><p className="fb-text">서버 초안 · {showValue(conflict.server?.draftAnswer)}</p><div className="fb-actions"><Button variant="outline" onClick={() => controller.resolveAnswerConflict(id, 'local')}>내 초안 사용</Button><Button variant="outline" onClick={() => controller.resolveAnswerConflict(id, 'server')}>서버 값 사용</Button></div></>}
    </section>)}
    {error && <p className="fb-muted" role="alert">{error}</p>}
    {drop && <Modal title="이 초안을 폐기할까요?" onClose={() => setDrop(null)}><div className="fb-stack"><p className="fb-text">{orphanDrafts[drop]?.value}</p><p className="fb-muted">지금 작성한 초안만 폐기합니다. 서버에 보관된 이전 대화는 남습니다.</p><div className="fb-actions"><Button variant="outline" onClick={() => setDrop(null)}>계속 보관</Button><Button variant="danger" onClick={() => { controller.resolveAnswerConflict(drop, 'discard'); setDrop(null); }}>초안 폐기</Button></div></div></Modal>}
  </>;
}

function UnknownCreateRecovery() {
  const { controller, inputDraft, setStage } = useFeedback();
  const [from, setFrom] = useState(isCalendarDate(inputDraft.date) ? inputDraft.date : ''), [to, setTo] = useState(isCalendarDate(inputDraft.date) ? inputDraft.date : '');
  const [items, setItems] = useState([]), [page, setPage] = useState(1), [total, setTotal] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null), [queried, setQueried] = useState(false);
  async function search(nextPage = 1, all = false) {
    setBusy(true); setError('');
    try {
      const data = await listFeedback({ ...(all ? {} : { from, to }), page: nextPage, limit: 5 });
      if (all) { setFrom(''); setTo(''); }
      setItems(data.items || []); setTotal(data.total || 0); setPage(nextPage); setQueried(true);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="fb-notice warn fb-stack"><h3>먼저 저장된 기록을 확인해 주세요</h3><p className="fb-muted">저장 응답을 받지 못해 자동으로 다시 생성하지 않습니다. 작성한 날짜로 조회하거나 전체 기록에서 직접 선택해 이어갈 수 있습니다. 같은 내용이라는 이유만으로 자동 선택하지 않습니다.</p>
    <div className="fb-date-grid"><label className="fb-field">시작일<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="fb-field">종료일<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    <div className="fb-actions"><Button variant="outline" disabled={busy} onClick={() => search()}>저장 기록 조회</Button><Button variant="outline" disabled={busy} onClick={() => search(1, true)}>전체 기록 조회</Button></div>
    {error && <p role="alert">{error}</p>}
    {items.map(item => <button type="button" className="fb-list-button" key={item.id} onClick={() => setSelected(item)}><span className="fb-muted">{item.date} · 기록 #{item.id}</span><h3>{item.summary?.title || item.technique || '피드백'}</h3><p>{item.original}</p></button>)}
    {queried && !items.length && <p className="fb-muted">이 범위에서 저장된 기록을 찾지 못했습니다. 범위를 넓혀 확인해 주세요.</p>}
    {total > 5 && <div className="fb-row"><Button variant="outline" disabled={page === 1 || busy} onClick={() => search(page - 1)}>이전</Button><span>{page} / {Math.ceil(total / 5)}</span><Button variant="outline" disabled={page * 5 >= total || busy} onClick={() => search(page + 1)}>다음</Button></div>}
    {selected && <div className="fb-stack"><p className="fb-text">#{selected.id} 저장 기록으로 이어갈까요? 현재 로컬 작성값 대신 선택한 기록을 불러옵니다.</p><div className="fb-actions"><Button variant="outline" onClick={() => setSelected(null)}>현재 초안 유지</Button><Button onClick={async () => { const saved = await controller.discardAndOpen(selected.id); if (saved) setStage(saved.summary ? 'summary' : saved.turns.length ? 'conversation' : 'input'); }}>선택한 저장 기록 이어쓰기</Button></div></div>}
  </section>;
}

export default function FeedbackPanel() {
  const feedback = useFeedback();
  const { open, controller, record, inputDraft, inputDirty, dirtyAnswers, loading, busy, error, conflict, uncertainWrite, pollError, stage, setStage, requestClose, closeConfirm, setCloseConfirm, inputConflicts, answerConflicts, resultDraft } = feedback;
  const { clips } = useCache();
  const [detail, setDetail] = useState(null), [clipError, setClipError] = useState(''), [clipLoading, setClipLoading] = useState(false);
  const clipRequest = useRef(0);
  const [inputVideoOpen, setInputVideoOpen] = useState(false);
  const [reviewPrevious, setReviewPrevious] = useState(false);
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  const techniqueName = feedbackTechniqueName(inputDraft.technique);
  const { options, other } = inputDraft.situationSelection;
  const selectedSituations = options ?? [];
  const otherSelected = selectedSituations.includes('other');
  const canSaveInput = Boolean(inputDraft.original.trim() && (!otherSelected || other.trim()));
  useEffect(() => { if (!open) { clipRequest.current += 1; setDetail(null); setClipLoading(false); setClipError(''); setInputVideoOpen(false); setReviewPrevious(false); setTechniqueOpen(false); } }, [open]);
  useEffect(() => { setReviewPrevious(false); }, [record?.id, record?.ready]);
  const disabled = busy || loading || uncertainWrite || conflict || Object.keys(inputConflicts).length > 0 || Object.keys(answerConflicts).length > 0;
  const pending = record?.ai?.status === 'pending';
  async function openClip(id) {
    const sequence = ++clipRequest.current; setClipError('');
    const cached = clips.find(clip => Number(clip.id) === Number(id));
    if (cached) { setDetail(cached); return; }
    setClipLoading(true);
    try {
      const fresh = await clipsApi.listClips();
      if (sequence !== clipRequest.current || !controller.getSnapshot().open) return;
      const found = fresh.find(clip => Number(clip.id) === Number(id));
      if (!found) throw new Error('이 영상은 삭제되었거나 현재 조회할 수 없습니다.');
      setDetail(found);
    } catch (e) { if (sequence === clipRequest.current) setClipError(e.message); }
    finally { if (sequence === clipRequest.current) setClipLoading(false); }
  }
  async function ask(more = false) { setStage('conversation'); await controller.ask({ more }); }
  async function summarize() { setStage('summary'); await controller.summarize(); }
  function toggleSituation(key, checked) {
    const next = checked ? [...selectedSituations, key] : selectedSituations.filter(value => value !== key);
    controller.setInputDraft({ situationSelection: { options: next, other: next.includes('other') && otherSelected ? other : '' } });
  }
  const currentTurn = record?.turns?.[record.cursor];
  const ready = !reviewPrevious && record?.ready && (!currentTurn || (record.cursor === record.turns.length - 1 && currentTurn.answer !== null));
  if (!open) return null;
  return <>
    <Modal title={stage === 'conversation' ? '관장과 보완' : '피드백'} onClose={requestClose} fullScreen>
      <div className="fb-stack" data-testid="feedback-panel">
        <div className="fb-steps">{['입력', '관장과 보완', '정리'].map((label, index) => <span key={label} aria-current={['input', 'conversation', 'summary'][index] === stage ? 'step' : undefined}><b>{index + 1}</b>{label}{index < 2 && ' ›'}</span>)}</div>
        {loading && <p className="fb-muted" role="status">저장된 피드백을 불러오는 중…</p>}
        {error && <div className="fb-notice error" role="alert">{error}{conflict ? <Button variant="outline" onClick={() => controller.reloadConflict()} disabled={busy}>서버 내용 확인</Button> : (!record && feedback.requestedId != null) ? <Button variant="outline" onClick={() => controller.refresh()} disabled={busy}>저장된 기록 다시 불러오기</Button> : (!uncertainWrite || record) && <Button variant="outline" onClick={() => controller.retry()} disabled={busy}>다시 확인</Button>}</div>}
        <FeedbackConflicts />
        {uncertainWrite && !record && <UnknownCreateRecovery />}
        {(inputDirty || Object.keys(dirtyAnswers).length > 0) && <p className="fb-muted">저장하지 않은 변경 사항이 있습니다. 보완 답변은 제출한 뒤 관장의 통합 정리에 반영됩니다.</p>}
        {pending && <div className="fb-notice" role="status">{record.ai.kind === 'summarize' ? '원문과 확정 답변을 통합해서 정리하는 중…' : '관장이 다음 질문을 준비하는 중…'}<p className="fb-muted">창을 닫아도 저장된 기록에서 이어갈 수 있습니다.</p></div>}
        {pollError && <div className="fb-notice warn" role="alert">진행 상태를 다시 확인하고 있습니다. {pollError}<Button variant="outline" onClick={() => controller.refresh()}>진행 상태 확인</Button></div>}
        {record?.ai?.status === 'failed' && <div className="fb-notice error" role="alert">{record.ai.error}<Button variant="outline" disabled={disabled} onClick={() => controller.retry()}>관장 검토 다시 시도</Button></div>}
        {clipLoading && <p role="status" className="fb-muted">영상 정보를 확인하는 중…</p>}{clipError && <p role="alert" className="fb-muted">{clipError}</p>}
        {!loading && stage === 'input' && (record || feedback.requestedId == null) && <>
          <p className="fb-muted">언제, 어떤 상황에서 얻은 내용인지 남겨주세요.<br />수업 기록이 없어도 시작할 수 있어요.</p>
          <form className="fb-stack" onSubmit={e => { e.preventDefault(); ask(); }}>
            <label className="fb-field">날짜<input type="date" required value={inputDraft.date} disabled={busy} onChange={e => controller.setInputDraft({ date: e.target.value })} /></label>
            <fieldset className="fb-situation">
              <legend>상황 · 선택 (여러 개 가능)</legend>
              <div className="fb-date-grid">
                {Object.entries(SITUATION_LABELS).map(([key, label]) => <label className="fb-check" key={key}>
                  <input type="checkbox" checked={selectedSituations.includes(key)} disabled={busy} onChange={event => toggleSituation(key, event.target.checked)} />
                  {label}
                </label>)}
              </div>
            </fieldset>
            <FeedbackLegacySituation value={inputDraft.situation} />
            {otherSelected && <label className="fb-field">기타 상황<input value={other} disabled={busy} maxLength={200} required placeholder="어떤 상황이었나요?"
              onChange={event => controller.setInputDraft({ situationSelection: { options: selectedSituations, other: event.target.value } })} /></label>}
            <div className="fb-field">
              <span>기술 · 선택</span>
              <div className="fb-row fb-tech-selection">
                {techniqueName && <span className="fb-selected-technique">{techniqueName}</span>}
                <button type="button" className="fb-tech-choose" disabled={busy} key="select-technique" aria-label={techniqueName ? '기술 다시 선택' : undefined} onClick={() => setTechniqueOpen(true)}>
                  {techniqueName ? '변경' : <><Icon name="search" size={16} />기술명 검색·선택</>}
                </button>
                {techniqueName && <button type="button" className="fb-tech-choose" disabled={busy} aria-label="선택 기술 제거" onClick={() => controller.setInputDraft({ technique: { id: null, name: '' } })}><Icon name="x" size={16} /></button>}
              </div>
              <p className="fb-muted">기술트리에 등록된 기술에서 선택합니다. 기존 미등록 기술은 원래 이름을 보존합니다.</p>
              {techniqueOpen && <FeedbackTechniquePicker selected={techniqueName} onClose={() => setTechniqueOpen(false)} onSelect={technique => {
                controller.setInputDraft({ technique: { id: Number(technique.id), name: technique.name } });
                setTechniqueOpen(false);
              }} />}
            </div>
            <label className="fb-field">피드백 내용 · 필수<textarea required rows={7} maxLength={12000} value={inputDraft.original} disabled={busy} onChange={e => controller.setInputDraft({ original: e.target.value })} placeholder="받은 설명, 깨달은 점, 다음에 확인하고 싶은 내용을 적어주세요." data-testid="feedback-original" /><span className="fb-muted">정확하지 않은 표현도 그대로 적어주세요.</span></label>
            {!!record?.turns?.length && ['original', 'situation', 'situationSelection', 'technique'].some(key => feedback.inputDirtyFields[key]) && <p className="fb-notice warn">원문·상황·기술을 변경하면 기존 대화는 이력에 보관하고 새 질문을 시작합니다.</p>}
            <details open={inputVideoOpen} onToggle={e => setInputVideoOpen(e.currentTarget.open)}><summary>영상 연결 · 선택 {inputDraft.clipIds.length}개</summary><FeedbackClipPicker selectedIds={inputDraft.clipIds} linkedClips={record?.clips || []} onChange={clipIds => controller.setInputDraft({ clipIds })} onOpen={openClip} disabled={disabled} /></details>
            <div className="fb-actions"><Button variant="outline" disabled={disabled || !canSaveInput} onClick={async () => { const saved = await controller.saveAndClose(); if (saved && !controller.getSnapshot().open) setCloseConfirm(false); }}>임시저장</Button><Button type="submit" disabled={disabled || pending || !canSaveInput}>관장과 보완하기</Button></div>
          </form>
        </>}
        {!loading && stage === 'conversation' && record && <>
          <div className="fb-row"><span className="fb-chip">{record.technique || '기술 미정'}</span><span className="fb-muted">{ready ? '정리 제안' : currentTurn ? `질문 ${record.cursor + 1}` : '보완 준비'}</span></div>
          <details><summary>이전 질문과 답변 보기</summary><div className="fb-stack">{record.turns.filter(turn => turn.answer !== null).map(turn => <div className="fb-section" key={turn.id}><p className="fb-muted">{turn.question}</p><p className="fb-text">{turn.skipped ? '확인 대기' : turn.answer}</p></div>)}<p className="fb-muted">제출 전 저장한 초안은 통합 정리의 근거에 포함되지 않습니다.</p></div></details>
          {!!record.archives.length && <details><summary>변경 전 대화 이력 · {record.archives.length}개</summary><div className="fb-stack">{record.archives.map(path => <div className="fb-section" key={path.id}><h3>{path.reason}</h3>{path.turns.map(turn => <div key={turn.id}><p className="fb-muted">{turn.question}</p><p className="fb-text">{turn.skipped ? '확인 대기' : turn.answer ?? '미제출'}</p>{turn.draftAnswer && turn.draftAnswer !== turn.answer && <p className="fb-muted">보관한 초안 · {turn.draftAnswer}</p>}</div>)}</div>)}</div></details>}
          {ready ? <><div className="fb-question"><h3>관장</h3><p className="fb-text">지금까지 나온 내용으로 정리할 수 있어요. 확인되지 않은 부분은 확인 대기로 남겨둘게요.</p></div><div className="fb-actions"><Button variant="outline" disabled={disabled || !record.turns.length} onClick={() => { setReviewPrevious(true); controller.moveTo(Math.max(0, record.turns.length - 1)); }}>이전 질문</Button><Button disabled={disabled || pending} onClick={summarize}>정리 카드 보기</Button></div><Button full variant="outline" disabled={disabled || pending} onClick={() => ask(true)}>더 질문받기</Button></>
            : currentTurn && <><div className="fb-question"><h3>관장</h3><p className="fb-text" data-testid="master-question">{currentTurn.question}</p></div><label className="fb-field">내 답변<textarea rows={4} maxLength={6000} disabled={busy} value={feedback.answerDrafts[currentTurn.id] ?? ''} onChange={e => controller.setAnswerDraft(currentTurn.id, e.target.value)} placeholder="기억나는 만큼 답해주세요" data-testid="feedback-answer" /></label><div className="fb-actions"><Button variant="outline" disabled={disabled || record.cursor === 0} onClick={() => controller.previous()}>이전 질문</Button><Button disabled={disabled || pending} onClick={async () => { const saved = await controller.answerAndContinue(); if (saved) setReviewPrevious(false); }}>답하고 이어가기</Button></div><Button variant="ghost" disabled={disabled || pending} onClick={async () => { const saved = await controller.answerAndContinue({ skip: true }); if (saved) setReviewPrevious(false); }}>확인 대기로 남기고 이어가기</Button><Button full variant="outline" disabled={disabled || pending} onClick={summarize}>지금까지 정리</Button></>}
          {!currentTurn && !ready && !pending && <Button disabled={disabled} onClick={() => ask()}>관장 질문 받기</Button>}
          <Button full variant="outline" disabled={disabled} onClick={() => controller.saveAndClose()}>보완 중 저장하고 닫기</Button><Button variant="ghost" disabled={busy} onClick={() => setStage('input')}>입력 내용 수정</Button>
        </>}
        {stage === 'summary' && record && <FeedbackSummary record={record} onOpenClip={openClip} onEdit={() => setStage('input')} onMore={() => ask(Boolean(record.ready))} onSummarize={summarize} />}
      </div>
    </Modal>
    {detail && <ClipDetailModal c={detail} onClose={() => setDetail(null)} />}
    {closeConfirm && <Modal title="작성 중인 피드백" onClose={() => setCloseConfirm(false)}><div className="fb-stack">
      {resultDraft ? <>
        <p className="fb-text">{resultDraft.id == null ? '작성 중인' : '수정 중인'} 연습 결과가 있습니다.</p>
        <p className="fb-muted">{isFeedbackResultWriteLocked(record) ? '정리가 끝나면 연습 결과를 저장할 수 있습니다.' : '연습 결과를 저장하거나 해당 폼에서 취소할 수 있습니다.'}</p>
      </> : <p className="fb-text">저장하고 닫거나, 로컬 변경을 폐기할 수 있습니다. 서버에 이미 저장된 기록과 대화 이력은 삭제하지 않습니다.</p>}
      {uncertainWrite && <p className="fb-muted">저장 여부가 불확실합니다. 먼저 저장 기록을 확인해 주세요.</p>}
      {!resultDraft && <Button disabled={disabled || (stage === 'input' && !canSaveInput)} onClick={async () => { await controller.saveAndClose(); if (!controller.getSnapshot().open) setCloseConfirm(false); }}>저장하고 닫기</Button>}
      <Button variant="danger" disabled={busy} onClick={() => { controller.discardAndClose(); setCloseConfirm(false); setDetail(null); }}>로컬 변경 폐기하고 닫기</Button><Button variant="outline" onClick={() => setCloseConfirm(false)}>계속 편집</Button>
    </div></Modal>}
  </>;
}

import React, { useState, useMemo, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import Icon from './Icon';
import { aiGenerateChain, createChain } from '../api/chains';
import { createTechnique } from '../api/techniques';
import { getClipThumb, getPlatformIcon } from '../utils/videoThumb';

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

const PROGRESS_STAGES = [
  { after: 0,      pct: 6,  label: '기술 데이터 로드 중...' },
  { after: 1200,   pct: 22, label: 'AI 코치가 상황을 분석 중...' },
  { after: 4000,   pct: 44, label: '체인 루트를 설계하는 중...' },
  { after: 10000,  pct: 65, label: '전환 동작 및 핵심 포인트 작성 중...' },
  { after: 20000,  pct: 82, label: '등록 영상과 매칭 중...' },
  { after: 35000,  pct: 91, label: '최종 검토 중...' },
];

function YoutubeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/>
    </svg>
  );
}

export default function AiChainGenerator({ techniques, onClose, onSaved }) {
  const [scenario, setScenario]   = useState('');
  const [seedOpen, setSeedOpen]   = useState(false);
  const [seedIds, setSeedIds]     = useState(new Set());
  const [seedSearch, setSeedSearch] = useState('');

  const [status, setStatus]       = useState('idle'); // idle|loading|result|error
  const [result, setResult]       = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [progress, setProgress]   = useState({ pct: 0, stageIdx: -1 });

  useEffect(() => {
    if (status !== 'loading') return;
    setProgress({ pct: 0, stageIdx: -1 });
    const timers = PROGRESS_STAGES.map(({ after, pct }, i) =>
      setTimeout(() => setProgress({ pct, stageIdx: i }), after)
    );
    return () => timers.forEach(clearTimeout);
  }, [status]);

  // { [stepIdx]: { status: 'idle'|'adding'|'done' } }
  const [stepAddState, setStepAddState] = useState({});

  const filteredSeeds = useMemo(() => {
    const q = seedSearch.trim().toLowerCase();
    if (!q) return techniques;
    return techniques.filter(t =>
      t.name.toLowerCase().includes(q) || (t.pos || '').toLowerCase().includes(q)
    );
  }, [techniques, seedSearch]);

  function toggleSeed(id) {
    setSeedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function generate() {
    if (!scenario.trim()) return;
    setStatus('loading');
    setResult(null);
    setStepAddState({});
    try {
      const data = await aiGenerateChain({
        scenario: scenario.trim(),
        seedTechniqueIds: seedIds.size ? [...seedIds] : undefined,
      });
      setProgress({ pct: 100, stageIdx: PROGRESS_STAGES.length });
      await new Promise(r => setTimeout(r, 500));
      setResult(data);
      setStatus('result');
    } catch (e) {
      setErrorMsg(e.message || 'AI 생성 실패');
      setStatus('error');
    }
  }

  async function addTechnique(idx, techniqueName) {
    setStepAddState(prev => ({ ...prev, [idx]: { status: 'adding' } }));
    try {
      const created = await createTechnique({ name: techniqueName });
      setStepAddState(prev => ({ ...prev, [idx]: { status: 'done' } }));
      setResult(prev => ({
        ...prev,
        steps: prev.steps.map((s, i) =>
          i === idx ? { ...s, isNew: false, techniqueId: created.id || created.data?.id } : s
        ),
      }));
      onSaved?.();
    } catch (e) {
      setStepAddState(prev => ({ ...prev, [idx]: { status: 'idle' } }));
      alert('기술 추가 실패: ' + e.message);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      const steps = result.steps
        .filter(s => s.techniqueId)
        .map(s => ({
          techniqueId: s.techniqueId,
          transitionNote: [s.transitionNote, s.keyPoints ? `핵심: ${s.keyPoints}` : ''].filter(Boolean).join('\n'),
        }));
      await createChain({ name: result.name, note: result.goal, steps });
      onSaved?.();
      onClose();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
    setStepAddState({});
  }

  const ytSearch = (name) =>
    `https://www.youtube.com/results?search_query=BJJ+주짓수+${encodeURIComponent(name)}`;

  const hasUnregistered = result?.steps.some((s, i) => s.isNew && stepAddState[i]?.status !== 'done');

  return (
    <Modal title="AI 체인 자동 생성" onClose={onClose}>

      {/* ── 입력 단계 ── */}
      {(status === 'idle' || status === 'error') && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
            상황을 설명하면 AI가 등록되지 않은 기술까지 포함한 체인을 제안합니다
          </div>

          <div className="field">
            <label>
              상황 / 목표
              <span style={{ color: 'var(--red)', fontSize: 10, marginLeft: 4 }}>*필수</span>
            </label>
            <textarea
              value={scenario}
              onChange={e => setScenario(e.target.value)}
              placeholder={'예: 클로즈드 가드에서 상대가 패스 시도 시 서브미션으로 연결\n예: 스크램블 상황에서 백테이크까지 이어지는 루트'}
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* 씨드 기술 선택 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              포함할 기술 선택
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>선택 사항 — AI가 이 기술들을 체인에 포함합니다</span>
            </div>

            {/* 선택된 기술 칩 */}
            {seedIds.size > 0 && (
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8,
                padding: '8px 10px',
                background: 'var(--surface-up)', border: '1px solid var(--accent)',
                borderRadius: 10,
              }}>
                {techniques.filter(t => seedIds.has(t.id)).map(t => (
                  <span key={t.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px 3px 10px', borderRadius: 20,
                    background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                    fontSize: 12, fontWeight: 600, color: 'var(--accent)',
                  }}>
                    {t.name}
                    <button
                      onClick={() => toggleSeed(t.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 14, height: 14, borderRadius: '50%',
                        background: 'var(--accent)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: 9, lineHeight: 1,
                        padding: 0, flexShrink: 0,
                      }}
                      title={`${t.name} 제거`}
                    >✕</button>
                  </span>
                ))}
              </div>
            )}

            {/* 기술 목록 (펼치기) */}
            <button
              onClick={() => setSeedOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, width: '100%',
                padding: '7px 10px', borderRadius: 8,
                background: 'var(--surface-up)', border: '1px solid var(--border)',
                cursor: 'pointer', color: 'var(--text2)', fontSize: 12, fontWeight: 500,
              }}
            >
              <span style={{
                display: 'inline-block', fontSize: 9,
                transform: seedOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.15s',
              }}>▶</span>
              {seedOpen ? '기술 목록 접기' : '기술 목록에서 선택'}
            </button>

            {seedOpen && (
              <div style={{ marginTop: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', marginBottom: 6,
                  background: 'var(--surface-up)', border: '1px solid var(--border)', borderRadius: 8,
                }}>
                  <Icon name="search" size={13} color="var(--text3)" />
                  <input
                    value={seedSearch}
                    onChange={e => setSeedSearch(e.target.value)}
                    placeholder="기술 검색"
                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 12, outline: 'none' }}
                  />
                </div>
                <div style={{
                  maxHeight: 180, overflowY: 'auto',
                  border: '1px solid var(--border)', borderRadius: 10,
                }}>
                  {filteredSeeds.length === 0
                    ? <div style={{ padding: 14, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>기술 없음</div>
                    : filteredSeeds.map((t, i) => (
                        <label key={t.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', cursor: 'pointer',
                          borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                          background: seedIds.has(t.id) ? 'var(--accent-dim)' : 'transparent',
                        }}>
                          <input
                            type="checkbox"
                            checked={seedIds.has(t.id)}
                            onChange={() => toggleSeed(t.id)}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: seedIds.has(t.id) ? 'var(--accent)' : 'var(--text)' }}>
                              {t.name}
                            </div>
                            {t.pos && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{t.pos}</div>}
                          </div>
                        </label>
                      ))
                  }
                </div>
              </div>
            )}
          </div>

          {status === 'error' && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 10,
              background: 'rgba(224,90,71,0.08)', border: '1px solid var(--red)',
              fontSize: 12, color: 'var(--red)',
            }}>{errorMsg}</div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={generate} disabled={!scenario.trim()}>
              AI 체인 생성
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          </div>
        </>
      )}

      {/* ── 생성 중 ── */}
      {status === 'loading' && (() => {
        const isDone = progress.pct === 100;
        const currentStage = isDone
          ? '체인 생성 완료!'
          : (PROGRESS_STAGES[progress.stageIdx]?.label || '준비 중...');
        const completedStages = PROGRESS_STAGES.slice(0, progress.stageIdx);

        return (
          <div style={{ padding: '8px 0 4px' }}>
            {/* 헤더 */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--text)' }}>
              AI 체인 생성 중
            </div>

            {/* 진행률 바 */}
            <div style={{ height: 8, background: 'var(--surface-up)', borderRadius: 4, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress.pct}%`,
                background: isDone
                  ? 'var(--accent)'
                  : 'linear-gradient(90deg, var(--accent), var(--accent-lt))',
                borderRadius: 4,
                transition: 'width 1s ease',
              }} />
            </div>

            {/* 퍼센트 + 현재 단계 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{
                fontSize: 28, fontWeight: 800,
                color: isDone ? 'var(--accent)' : 'var(--text)',
                minWidth: 60, lineHeight: 1,
              }}>{progress.pct}%</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: isDone ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>
                  {isDone ? '✓ ' : ''}{currentStage}
                </div>
                {!isDone && (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    상황에 맞는 기술 루트를 분석하고 있습니다
                  </div>
                )}
              </div>
            </div>

            {/* 완료된 단계 목록 */}
            {completedStages.length > 0 && (
              <div style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'var(--surface-up)', border: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {completedStages.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--accent-dim)', color: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                    }}>✓</span>
                    <span style={{ color: 'var(--text2)' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 결과 ── */}
      {status === 'result' && result && (
        <>
          {/* 체인 헤더 */}
          <div style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 14,
            background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', marginBottom: 6 }}>
              {result.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
              {result.goal}
            </div>
          </div>

          {/* 스텝 타임라인 */}
          <div style={{ position: 'relative', paddingLeft: 28, marginBottom: 14 }}>
            {result.steps.length > 1 && (
              <div style={{
                position: 'absolute', left: 11, top: 8, bottom: 8, width: 2,
                background: 'linear-gradient(to bottom, var(--blue), var(--accent), var(--amber))',
                borderRadius: 1, opacity: 0.5,
              }} />
            )}

            {result.steps.map((s, i) => {
              const isFirst = i === 0;
              const isLast  = i === result.steps.length - 1;
              const color   = isFirst ? 'var(--blue)' : isLast ? 'var(--amber)' : 'var(--accent)';
              const bg      = isFirst ? 'var(--blue-dim)' : isLast ? 'var(--amber-dim)' : 'var(--accent-dim)';
              const addSt   = stepAddState[i] || { status: 'idle' };
              const isDone  = addSt.status === 'done';

              return (
                <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
                  {/* 번호 뱃지 */}
                  <div style={{
                    position: 'absolute', left: -28, top: 8,
                    width: 22, height: 22, borderRadius: 7,
                    background: bg, color, border: `1px solid ${color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 800,
                  }}>{i + 1}</div>

                  <div style={{
                    background: 'var(--surface)',
                    border: `1px solid ${s.isNew && !isDone ? 'var(--amber)' : 'var(--border)'}`,
                    borderRadius: 10, padding: 10,
                  }}>
                    {/* 기술명 + 상태 뱃지 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: 0.5 }}>STEP {i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{s.techniqueName}</span>
                      {s.isNew && !isDone && (
                        <span style={{
                          padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                          background: 'var(--amber-dim)', color: 'var(--amber)',
                          border: '1px solid var(--amber)',
                        }}>미등록</span>
                      )}
                      {isDone && (
                        <span style={{
                          padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                          background: 'var(--accent-dim)', color: 'var(--accent)',
                          border: '1px solid var(--accent)',
                        }}>등록됨</span>
                      )}
                    </div>

                    {/* 전환 설명 */}
                    {s.transitionNote && (
                      <div style={{
                        fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                        padding: '6px 8px', marginBottom: 6,
                        background: 'var(--surface-up)', borderRadius: 6,
                        borderLeft: `2px solid ${color}`,
                      }}>{s.transitionNote}</div>
                    )}

                    {/* 핵심 포인트 */}
                    {s.keyPoints && (
                      <div style={{ marginBottom: 8 }}>
                        {s.keyPoints.split(';').map(p => p.trim()).filter(Boolean).map((p, j) => (
                          <div key={j} style={{
                            fontSize: 11, color: 'var(--text2)', marginTop: 3,
                            display: 'flex', alignItems: 'flex-start', gap: 5,
                          }}>
                            <span style={{ color, flexShrink: 0, fontWeight: 700 }}>•</span>
                            {p}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 액션 버튼 */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: s.clips?.length ? 8 : 0 }}>
                      {s.isNew && !isDone && (
                        <button
                          onClick={() => addTechnique(i, s.techniqueName)}
                          disabled={addSt.status === 'adding'}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            border: '1px solid var(--amber)',
                            background: 'var(--amber-dim)', color: 'var(--amber)',
                            fontSize: 11, fontWeight: 700,
                            cursor: addSt.status === 'adding' ? 'wait' : 'pointer',
                            opacity: addSt.status === 'adding' ? 0.7 : 1,
                          }}
                        >
                          {addSt.status === 'adding' ? '추가 중...' : '+ 기술 추가'}
                        </button>
                      )}
                      <a
                        href={ytSearch(s.techniqueName)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '4px 10px', borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-up)', color: 'var(--text2)',
                          fontSize: 11, fontWeight: 600, textDecoration: 'none',
                        }}
                      >
                        <YoutubeIcon /> YouTube 검색
                      </a>
                    </div>

                    {/* 등록된 연관 영상 */}
                    {s.clips?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 5, fontWeight: 600 }}>
                          관련 영상 ({s.clips.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {s.clips.map(c => {
                            const thumb = getClipThumb(c);
                            return (
                              <a key={c.id} href={c.url} target="_blank" rel="noreferrer"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '6px 8px', borderRadius: 8,
                                  background: 'var(--surface-hi)', border: '1px solid var(--border)',
                                  textDecoration: 'none',
                                }}>
                                {thumb
                                  ? <img src={thumb} alt="" style={{ width: 48, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                                  : <div style={{ width: 48, height: 28, borderRadius: 4, flexShrink: 0, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{getPlatformIcon(c.platform)}</div>
                                }
                                <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                  {c.title}
                                </span>
                                <ExternalIcon />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hasUnregistered && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 10,
              background: 'var(--amber-dim)', border: '1px solid var(--amber)',
              fontSize: 11, color: 'var(--amber)',
            }}>
              미등록 기술이 포함된 스텝은 체인 저장 시 제외됩니다. "+ 기술 추가"로 먼저 등록하면 체인에 포함됩니다.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? '저장 중...' : '체인으로 저장'}
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>다시 생성</Button>
            <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

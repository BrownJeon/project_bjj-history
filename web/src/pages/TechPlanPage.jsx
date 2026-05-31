import React, { useState, useMemo, useEffect } from 'react';
import { useCache } from '../contexts/CacheContext';
import { useUI } from '../contexts/UIContext';
import * as techApi from '../api/techniques';
import * as chainsApi from '../api/chains';
import * as gpApi from '../api/gameplans';
import Card from '../components/Card';
import Tag from '../components/Tag';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import Button from '../components/Button';
import TagPicker from '../components/TagPicker';
import Pagination from '../components/Pagination';
import ChainDetail from '../components/ChainDetail';
import ChainEditor from '../components/ChainEditor';
import { getClipThumb, getPlatformIcon } from '../utils/videoThumb';
import ClipDetailModal from '../components/ClipDetailModal';
import GameplanDetail from '../components/GameplanDetail';
import GameplanEditor from '../components/GameplanEditor';
import { BASE_POSITIONS, BASE_CATEGORIES, mergeUnique } from '../utils/baseOptions';
import { uniqueTechPositions, uniqueAllTags } from '../utils/suggestions';

const PAGE_SIZE = 10;

export default function TechPlanPage() {
  const [tab, setTab] = useState('tech'); // tech | plan

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 14 }}>
        기술
      </div>

      {/* 세그먼트 */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        background: 'var(--surface-up)',
        borderRadius: 10,
        padding: 3,
        marginBottom: 16,
        gap: 3,
      }}>
        <SegBtn active={tab === 'tech'} onClick={() => setTab('tech')}>기술트리</SegBtn>
        <SegBtn active={tab === 'plan'} onClick={() => setTab('plan')}>시뮬레이터</SegBtn>
      </div>

      {tab === 'tech' ? <TechTab /> : <PlanTab />}
    </div>
  );
}

function SegBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: active ? '0 2px 6px rgba(0,0,0,0.3)' : 'none',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────
// 기술트리 탭
// ─────────────────────────────────────────────
function TechTab() {
  const { techniques, reloadTechniques } = useCache();
  const { showToast, setLoading } = useUI();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | recent | star
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);

  const list = useMemo(() => {
    let items = [...techniques];
    if (filter === 'star') items = items.filter(t => t.starred);
    if (filter === 'recent') items.sort((a, b) => (b.id || 0) - (a.id || 0));
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.positions?.length ? t.positions : (t.pos ? [t.pos] : [])).some(p => p.toLowerCase().includes(q)) ||
        (t.tags || []).some(x => (x || '').toLowerCase().includes(q))
      );
    }
    return items;
  }, [techniques, search, filter]);

  // 검색·필터 변경 시 첫 페이지로
  useEffect(() => { setPage(1); }, [search, filter]);

  const paged = useMemo(
    () => list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [list, page]
  );

  async function handleStar(id) {
    try { await techApi.toggleTechStar(id); await reloadTechniques(); }
    catch (e) { showToast('오류: ' + e.message); }
  }
  async function handleSave(form) {
    setLoading(true);
    try {
      if (editing && editing !== 'new') await techApi.updateTechnique(editing.id, form);
      else await techApi.createTechnique(form);
      await reloadTechniques();
      setEditing(null);
      showToast('저장되었습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }
  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await techApi.deleteTechnique(id);
      await reloadTechniques();
      setDetail(null);
      showToast('삭제되었습니다');
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      {/* 검색바 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: 10,
      }}>
        <Icon name="search" size={16} color="var(--text3)" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="기술 검색"
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, outline: 'none' }}
        />
      </div>

      {/* 필터 칩 + 추가 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>전체</FilterChip>
        <FilterChip active={filter === 'recent'} onClick={() => setFilter('recent')} icon="clock">최신순</FilterChip>
        <FilterChip active={filter === 'star'} onClick={() => setFilter('star')} icon="star">즐겨찾기</FilterChip>
        <div style={{ marginLeft: 'auto' }}>
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>+ 추가</Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
          기술이 없습니다
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paged.map(t => (
              <Card key={t.id} onClick={() => setDetail(t)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); handleStar(t.id); }}
                    style={{ display: 'inline-flex', cursor: 'pointer', padding: 2 }}
                  >
                    <Icon name="star" size={18} color={t.starred ? 'var(--amber)' : 'var(--text3)'} filled={!!t.starred} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{t.name}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(t.positions?.length ? t.positions : (t.pos ? [t.pos] : [])).map((p, i) => (
                        <Tag key={i} tone="blue">{p}</Tag>
                      ))}
                      {(t.clips || []).length > 0 && <Tag tone="purple">영상 {t.clips.length}</Tag>}
                    </div>
                  </div>
                  <Icon name="chevR" size={18} color="var(--text3)" />
                </div>
              </Card>
            ))}
          </div>
          <Pagination total={list.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      {detail && (
        <TechDetailModal
          t={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onDelete={() => handleDelete(detail.id)}
        />
      )}
      {editing && (
        <TechEditorModal
          initial={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '6px 12px',
        background: active ? 'var(--accent)' : 'var(--surface-up)',
        color: active ? '#fff' : 'var(--text2)',
        border: 'none',
        borderRadius: 16,
        fontSize: 12, fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {icon && <Icon name={icon} size={12} color={active ? '#fff' : 'var(--text2)'} filled={icon === 'star' && active} />}
      {children}
    </button>
  );
}

function TechDetailModal({ t, onClose, onEdit, onDelete }) {
  const [detailClip, setDetailClip] = useState(null);

  if (detailClip) {
    return (
      <ClipDetailModal
        c={detailClip}
        onClose={() => setDetailClip(null)}
      />
    );
  }

  return (
    <Modal title={t.name} onClose={onClose}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(t.positions?.length ? t.positions : (t.pos ? [t.pos] : [])).map((p, i) => (
          <Tag key={i} tone="blue">{p}</Tag>
        ))}
        {t.starred ? <Tag tone="amber">즐겨찾기</Tag> : null}
        {(t.tags || []).map((x, i) => (
          <Tag key={i} tone="neutral">{x}</Tag>
        ))}
      </div>
      {t.note && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 12,
          fontSize: 13,
          color: 'var(--text)',
          whiteSpace: 'pre-wrap',
          marginBottom: 12,
        }}>
          {t.note}
        </div>
      )}
      {(t.clips || []).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, fontWeight: 600 }}>
            관련 영상 ({t.clips.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {t.clips.map(c => {
              const thumb = getClipThumb(c);
              const firstFrame = c.frames?.[0];
              const previewImg = thumb || firstFrame || null;
              return (
                <button
                  key={c.id}
                  onClick={() => setDetailClip(c)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    border: '1px solid var(--border)', borderRadius: 12,
                    overflow: 'hidden', background: 'var(--surface)',
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  {/* 썸네일 or 첫 프레임 */}
                  {previewImg ? (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', overflow: 'hidden' }}>
                      <img src={previewImg} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', aspectRatio: '16/9', background: 'var(--surface-hi)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 32 }}>{getPlatformIcon(c.platform)}</span>
                    </div>
                  )}
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  color: 'var(--text)' }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                      탭하여 상세 보기
                      {c.video_file && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>📥 저장됨</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="danger" size="sm" onClick={onDelete}>삭제</Button>
        <Button variant="outline" size="sm" onClick={onEdit}>수정</Button>
        <Button variant="primary" size="sm" full onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}

function TechEditorModal({ initial, onSave, onCancel }) {
  const { techniques } = useCache();
  const [name, setName]   = useState(initial?.name || '');
  const [pos, setPos]     = useState(
    initial?.positions?.length ? initial.positions
    : initial?.pos ? [initial.pos]
    : []
  );
  const [tags, setTags]   = useState(initial?.tags || []);
  const [note, setNote]   = useState(initial?.note || '');
  const [starred, setStarred] = useState(!!initial?.starred);

  const posSuggestions = useMemo(
    () => mergeUnique(BASE_POSITIONS, uniqueTechPositions(techniques)),
    [techniques]
  );
  const tagSuggestions = useMemo(() => uniqueAllTags(techniques), [techniques]);

  function submit() {
    if (!name.trim()) return alert('기술명을 입력해주세요');
    onSave({
      name: name.trim(),
      positions: pos,
      pos: pos[0] || '',
      category: initial?.category || '',
      tags,
      note,
      starred: starred ? 1 : 0,
    });
  }

  return (
    <Modal title={initial ? '기술 수정' : '기술 추가'} onClose={onCancel}>
      <div className="field">
        <label>기술명 *</label>
        <input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>포지션</label>
        <TagPicker value={pos} onChange={setPos} suggestions={posSuggestions} placeholder="포지션 검색·자유 입력 (여러 개 가능)" />
      </div>
      <div className="field">
        <label>태그</label>
        <TagPicker value={tags} onChange={setTags} suggestions={tagSuggestions} />
      </div>
      <div className="field">
        <label>핵심 포인트 / 메모</label>
        <textarea rows={4} value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="t-star-tp" checked={starred} onChange={e => setStarred(e.target.checked)} />
        <label htmlFor="t-star-tp" style={{ margin: 0, cursor: 'pointer' }}>즐겨찾기</label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button variant="primary" size="sm" onClick={submit}>저장</Button>
        <Button variant="outline" size="sm" onClick={onCancel}>취소</Button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// 플랜 탭 (체인 + 게임플랜)
// ─────────────────────────────────────────────
function PlanTab() {
  const [sub, setSub] = useState('chain'); // chain | gameplan
  const { techniques, chains, gameplans, reloadChains, reloadGameplans } = useCache();
  const { showToast, setLoading } = useUI();

  const [chainDetail, setChainDetail]   = useState(null);
  const [chainEditing, setChainEditing] = useState(null); // 'new' | chain
  const [gpDetail, setGpDetail]         = useState(null);
  const [gpEditing, setGpEditing]       = useState(null);

  async function saveChain(form) {
    setLoading(true);
    try {
      if (chainEditing && chainEditing !== 'new') await chainsApi.updateChain(chainEditing.id, form);
      else await chainsApi.createChain(form);
      await reloadChains();
      setChainEditing(null);
      showToast('저장되었습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }
  async function deleteChain(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await chainsApi.deleteChain(id);
      await reloadChains();
      setChainDetail(null); setChainEditing(null);
      showToast('삭제됨');
    } catch (e) { showToast('오류: ' + e.message); }
    finally { setLoading(false); }
  }

  async function saveGp(form) {
    setLoading(true);
    try {
      if (gpEditing && gpEditing !== 'new') await gpApi.updateGameplan(gpEditing.id, form);
      else await gpApi.createGameplan(form);
      await reloadGameplans();
      setGpEditing(null);
      showToast('저장되었습니다');
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }
  async function deleteGp(id) {
    if (!confirm('삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await gpApi.deleteGameplan(id);
      await reloadGameplans();
      setGpDetail(null); setGpEditing(null);
      showToast('삭제됨');
    } catch (e) { showToast('오류: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <PillBtn active={sub === 'chain'} onClick={() => setSub('chain')}>기술체인</PillBtn>
        <PillBtn active={sub === 'gameplan'} onClick={() => setSub('gameplan')}>기술연계</PillBtn>
        <div style={{ marginLeft: 'auto' }}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => sub === 'chain' ? setChainEditing('new') : setGpEditing('new')}
          >
            + 추가
          </Button>
        </div>
      </div>
      {sub === 'chain'
        ? <ChainList onOpen={setChainDetail} />
        : <GameplanList onOpen={setGpDetail} />}

      {chainDetail && (
        <ChainDetail
          chain={chainDetail}
          techniques={techniques}
          onClose={() => setChainDetail(null)}
          onEdit={() => { setChainEditing(chainDetail); setChainDetail(null); }}
          onDelete={() => deleteChain(chainDetail.id)}
        />
      )}
      {chainEditing && (
        <ChainEditor
          initial={chainEditing === 'new' ? null : chainEditing}
          techniques={techniques}
          onSave={saveChain}
          onCancel={() => setChainEditing(null)}
          onDelete={chainEditing !== 'new' ? () => deleteChain(chainEditing.id) : null}
        />
      )}
      {gpDetail && (
        <GameplanDetail
          gameplan={gpDetail}
          onClose={() => setGpDetail(null)}
          onEdit={() => { setGpEditing(gpDetail); setGpDetail(null); }}
          onDelete={() => deleteGp(gpDetail.id)}
        />
      )}
      {gpEditing && (
        <GameplanEditor
          initial={gpEditing === 'new' ? null : gpEditing}
          techniques={techniques}
          onSave={saveGp}
          onCancel={() => setGpEditing(null)}
          onDelete={gpEditing !== 'new' ? () => deleteGp(gpEditing.id) : null}
        />
      )}
    </div>
  );
}

function PillBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        background: active ? 'var(--accent)' : 'var(--surface-up)',
        color: active ? '#fff' : 'var(--text2)',
        border: 'none',
        borderRadius: 999,
        fontSize: 12, fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ChainList({ onOpen }) {
  const { chains } = useCache();
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [chains.length]);

  if (!chains.length) {
    return (
      <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
        등록된 체인이 없습니다
      </Card>
    );
  }

  const paged = chains.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {paged.map(c => (
        <Card key={c.id} className="bjj-card-tap" onClick={() => onOpen(c)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{c.name}</div>
              {c.note && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{c.note}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                {(c.steps || []).map((s, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <Icon name="chevR" size={12} color="var(--text3)" />}
                    <Tag tone="accent">{s.tech_name || `#${s.technique_id}`}</Tag>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {(c.steps || []).length}개 기술
              </div>
            </div>
            <Icon name="chevR" size={16} color="var(--text3)" />
          </div>
        </Card>
      ))}
    </div>
    <Pagination total={chains.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}

function GameplanList({ onOpen }) {
  const { gameplans, reloadGameplans } = useCache();
  const { showToast } = useUI();
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [gameplans.length]);

  async function handleStar(e, id) {
    e.stopPropagation();
    try { await gpApi.toggleGpStar(id); await reloadGameplans(); }
    catch (err) { showToast('오류: ' + err.message); }
  }

  if (!gameplans.length) {
    return (
      <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
        등록된 게임플랜이 없습니다
      </Card>
    );
  }

  const paged = gameplans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {paged.map(gp => (
        <Card key={gp.id} className="bjj-card-tap" onClick={() => onOpen(gp)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{gp.name}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                {gp.start_pos && <Tag tone="blue">시작 · {gp.start_pos}</Tag>}
                <Tag tone="neutral">노드 {(gp.nodes || []).length}</Tag>
                <Tag tone="neutral">전환 {(gp.edges || []).length}</Tag>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(gp.nodes || []).slice(0, 4).map(n => (
                  <Tag key={n.id} tone={n.is_finish ? 'amber' : 'accent'}>
                    {n.tech_name || n.label}
                  </Tag>
                ))}
              </div>
            </div>
            <span
              onClick={(e) => handleStar(e, gp.id)}
              style={{ display: 'inline-flex', cursor: 'pointer', padding: 4 }}
            >
              <Icon name="star" size={18} color={gp.starred ? 'var(--amber)' : 'var(--text3)'} filled={!!gp.starred} />
            </span>
          </div>
        </Card>
      ))}
    </div>
    <Pagination total={gameplans.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>
  );
}

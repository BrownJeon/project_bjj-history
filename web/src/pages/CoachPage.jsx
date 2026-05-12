import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '../contexts/UIContext';
import * as coachApi from '../api/coach';
import Card from '../components/Card';
import Icon from '../components/Icon';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 10;

export default function CoachPage() {
  const { showToast, setLoading } = useUI();
  const [days, setDays] = useState(30);
  const [diag, setDiag] = useState(null);
  const [reports, setReports] = useState([]);
  const [plans, setPlans] = useState([]);
  const [detail, setDetail] = useState(null); // { type: 'report'|'plan', item }

  useEffect(() => { loadAll(); }, [days]);

  async function loadAll() {
    try {
      const [d, r, p] = await Promise.all([
        coachApi.getDiagnosis(days),
        coachApi.listReports('report', 50),
        coachApi.listReports('plan', 50),
      ]);
      setDiag(d); setReports(r); setPlans(p);
    } catch (e) { showToast('오류: ' + e.message); }
  }

  async function generateReport() {
    setLoading(true);
    try {
      await coachApi.generateReport({ days });
      await loadAll();
      showToast('리포트 생성 완료');
    } catch (e) { showToast('생성 실패: ' + e.message); }
    finally { setLoading(false); }
  }
  async function generatePlan() {
    setLoading(true);
    try {
      await coachApi.generatePlan({ days });
      await loadAll();
      showToast('플랜 생성 완료');
    } catch (e) { showToast('생성 실패: ' + e.message); }
    finally { setLoading(false); }
  }
  async function handleDelete() {
    if (!detail) return;
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await coachApi.deleteReport(detail.item.id);
      await loadAll();
      setDetail(null);
      showToast('삭제됨');
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  const tapTotal = diag ? (diag.summary.tapGot + diag.summary.tapGave) : 0;
  const tapRate = tapTotal > 0
    ? Math.round((diag.summary.tapGave / tapTotal) * 100)
    : 0;

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 14 }}>
        분석
      </div>

      {/* 기간 필터 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: '6px 14px',
              background: days === d ? 'var(--purple)' : 'var(--surface-up)',
              color: days === d ? '#fff' : 'var(--text2)',
              border: 'none',
              borderRadius: 999,
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {d}일
          </button>
        ))}
      </div>

      {/* 진단 카드 */}
      {diag && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>진단 요약</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
            <DiagCell label="수업" value={`${diag.summary.classes}회`} color="var(--accent)" />
            <DiagCell label="수련일" value={`${diag.summary.trainedDays}일`} color="var(--blue)" />
            <DiagCell label="스파링" value={`${diag.summary.sessions}세션`} color="var(--red)" sub={`${diag.summary.minutes}분`} />
            <DiagCell label="탭 비율" value={`${tapRate}%`} color="var(--amber)" sub={`↓${diag.summary.tapGot} ↑${diag.summary.tapGave}`} />
          </div>
          {(diag.weakTop || []).length > 0 && (
            <div style={{
              padding: 10,
              background: 'var(--red-dim)',
              borderRadius: 8,
              fontSize: 12,
            }}>
              <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 4 }}>반복 약점</div>
              <div style={{ color: 'var(--text)' }}>
                {diag.weakTop.map(w => `${w.name}(×${w.count})`).join(', ')}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 액션 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Button variant="primary" full onClick={generateReport}>리포트 생성</Button>
        <Button variant="outline" full onClick={generatePlan}>플랜 생성</Button>
      </div>

      <ReportSection
        title="리포트 목록"
        items={reports}
        emptyText="생성된 리포트가 없습니다"
        renderPreview={c => c.highlights || c.recommendations || ''}
        onOpen={(item) => setDetail({ type: 'report', item })}
      />
      <ReportSection
        title="플랜 목록"
        items={plans}
        emptyText="생성된 플랜이 없습니다"
        renderPreview={c => (c.focuses || []).map(f => f.title).join(' · ')}
        onOpen={(item) => setDetail({ type: 'plan', item })}
      />

      {detail && (
        <ReportDetailModal
          detail={detail}
          onClose={() => setDetail(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

function DiagCell({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--surface-up)',
      borderRadius: 8,
      padding: 10,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ReportSection({ title, items, emptyText, renderPreview, onOpen }) {
  const [page, setPage] = useState(1);
  // items 변경 (생성/삭제) 시 첫 페이지로
  useEffect(() => { setPage(1); }, [items.length]);

  const paged = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page]
  );

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
        {title} {items.length > 0 && <span style={{ color: 'var(--text2)', fontWeight: 500 }}>({items.length})</span>}
      </div>
      {items.length === 0 ? (
        <Card style={{ textAlign: 'center', color: 'var(--text2)', padding: 20 }}>{emptyText}</Card>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paged.map(r => (
              <Card key={r.id} className="bjj-card-tap" onClick={() => onOpen(r)}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="clock" size={11} color="var(--text2)" />
                  {String(r.created_at).slice(0, 10)} · {r.period_start} ~ {r.period_end}
                </div>
                <div style={{
                  fontSize: 13, color: 'var(--text)',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {renderPreview(r.content)}
                </div>
              </Card>
            ))}
          </div>
          <Pagination total={items.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function ReportDetailModal({ detail, onClose, onDelete }) {
  const { type, item } = detail;
  const c = item.content || {};
  const isReport = type === 'report';

  return (
    <Modal title={isReport ? '리포트 상세' : '플랜 상세'} onClose={onClose}>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon name="clock" size={11} color="var(--text2)" />
        {String(item.created_at).slice(0, 16).replace('T', ' ')} · {item.period_start} ~ {item.period_end}
      </div>

      {isReport ? <ReportBody c={c} /> : <PlanBody c={c} />}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button variant="danger" size="sm" onClick={onDelete}>삭제</Button>
        <Button variant="primary" size="sm" full onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}

function ReportBody({ c }) {
  const sections = [
    { key: 'highlights',     label: '하이라이트',     color: 'var(--accent)' },
    { key: 'weaknesses',     label: '반복 약점',       color: 'var(--red)' },
    { key: 'improvements',   label: '개선된 점',       color: 'var(--blue)' },
    { key: 'recommendations', label: '다음 기간 권장', color: 'var(--amber)' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sections.map(s => c[s.key] ? (
        <div key={s.key}>
          <div style={{ fontSize: 12, fontWeight: 700, color: s.color, marginBottom: 6 }}>{s.label}</div>
          <div style={{
            fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
            whiteSpace: 'pre-wrap',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: 10,
          }}>
            {c[s.key]}
          </div>
        </div>
      ) : null)}
    </div>
  );
}

function PlanBody({ c }) {
  const focuses = c.focuses || [];
  if (focuses.length === 0) {
    return <div style={{ color: 'var(--text2)', textAlign: 'center', padding: 20 }}>플랜 내용이 비었습니다</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {focuses.map((f, i) => (
        <div key={i} style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10, padding: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--accent)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 12, flexShrink: 0,
            }}>{i + 1}</div>
            <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{f.title}</div>
          </div>
          {f.why && (
            <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
              {f.why}
            </div>
          )}
          {(f.techniqueNames || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {f.techniqueNames.map((n, j) => (
                <span key={j} style={{
                  background: 'var(--accent-dim)', color: 'var(--accent)',
                  padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                }}>⊙ {n}</span>
              ))}
            </div>
          )}
          {f.drillSuggestion && (
            <div style={{
              fontSize: 12, color: 'var(--text)',
              whiteSpace: 'pre-wrap', marginTop: 6,
              padding: 8, background: 'var(--surface-up)', borderRadius: 8,
            }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4, fontWeight: 700 }}>드릴 제안</div>
              {f.drillSuggestion}
            </div>
          )}
          {(f.videoLinks || []).length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {f.videoLinks.map((v, j) => (
                <a key={j} href={v.url} target="_blank" rel="noreferrer"
                  style={{
                    fontSize: 12, color: 'var(--blue)',
                    textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                  <Icon name="link" size={12} color="var(--blue)" />
                  {v.query}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

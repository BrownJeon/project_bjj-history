import React from 'react';

/**
 * 간단한 페이지네이션 (이전 / 페이지 번호 / 다음)
 *
 * Props:
 *  - total:        전체 항목 수
 *  - page:         현재 페이지 (1-base)
 *  - pageSize:     페이지당 항목 수
 *  - onPageChange: (nextPage) => void
 */
export default function Pagination({ total, page, pageSize, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function go(p) {
    if (p < 1 || p > totalPages || p === page) return;
    onPageChange(p);
  }

  // 윈도우 페이지 번호 (현재 ±2)
  const window = 2;
  const pages = [];
  let l = Math.max(1, page - window);
  let r = Math.min(totalPages, page + window);
  if (l > 1) pages.push(1, l > 2 ? '…' : null);
  for (let i = l; i <= r; i++) pages.push(i);
  if (r < totalPages) pages.push(r < totalPages - 1 ? '…' : null, totalPages);

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      gap: 4, marginTop: 14, flexWrap: 'wrap',
    }}>
      <PageBtn disabled={page === 1} onClick={() => go(page - 1)} aria-label="이전">‹</PageBtn>
      {pages.filter(Boolean).map((p, i) => (
        p === '…'
          ? <span key={`e${i}`} style={{ color: 'var(--text3)', padding: '0 4px' }}>…</span>
          : <PageBtn key={p} active={p === page} onClick={() => go(p)}>{p}</PageBtn>
      ))}
      <PageBtn disabled={page === totalPages} onClick={() => go(page + 1)} aria-label="다음">›</PageBtn>
    </div>
  );
}

function PageBtn({ active, disabled, onClick, children, ...rest }) {
  return (
    <button onClick={onClick} disabled={disabled}
      {...rest}
      style={{
        minWidth: 30, height: 30,
        background: active ? 'var(--accent)' : 'var(--surface-up)',
        color: active ? '#fff' : disabled ? 'var(--text3)' : 'var(--text2)',
        border: 'none', borderRadius: 8,
        fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '0 8px',
      }}>
      {children}
    </button>
  );
}

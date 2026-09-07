import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { branchPreview } from '../utils/researchLinks';

// ═════════════════════════════════════════════════════════════════════════════
// 분기 — task-028 B
//
// 🔴 이 화면의 급소는 **"원본이 어떻게 되는가"** 하나다.
//    "복사합니다"만 쓰면 사용자는 원본이 사라지는지, 옮겨지는지, 남는지 알 수 없다.
//    실제로 이 앱에서 가장 비싼 실수는 "지워지는 줄 모르고 눌렀다"였다(task-026 삭제 확인 문구).
//    → 여기서는 **무엇이 복제되는지(노드 N · 자료 M)** 와 **원본 vN 은 그대로 남는다**를
//      숫자와 버전 이름으로 못 박는다. 추상어("백업", "스냅샷") 금지.
//
// 🔴 숫자를 여기서 다시 세지 않는다. `branchPreview()` 순수 함수가 서버가 준 값
//    (`detail.nodes` · `nodeView.linkCount`)만으로 계산한다 — QA 하네스가 HTTP 없이 검증한다.
//
// 🔴 표본 0을 감추지 않는다. 노드 0개인 버전에서 분기하면 "복제할 노드가 없습니다"라고
//    그대로 말한다. 빈 버전을 하나 더 만드는 것이 사용자가 원한 것일 수도 있으므로 막지는 않는다.
// ═════════════════════════════════════════════════════════════════════════════

const NAME_LIMIT = 50;   // research_versions.name — backend LIMITS.versionName 과 같은 값

export default function ResearchBranchModal({ open, detail, busy, err, onClose, onConfirm }) {
  const p = branchPreview(detail);
  const [name, setName] = useState('');

  // 시트를 다시 열 때 이전 입력이 남지 않게 한다(노드 시트와 같은 규칙).
  useEffect(() => { if (open) setName(''); }, [open, detail?.activeVersionId]);

  const tooLong = name.length > NAME_LIMIT;

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="버전 분기">
      <div style={{
        padding: 12, borderRadius: 12, marginBottom: 14,
        background: 'var(--surface)', border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
          지금 버전 <b style={{ color: 'var(--text)' }}>{p.fromLabel || '(없음)'}</b> 을(를) 통째로 복제합니다
        </div>

        {/* 🔴 무엇이 복제되는지를 **숫자로** 말한다. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{
            flex: 1, minWidth: 110, padding: '9px 10px', borderRadius: 10,
            background: 'var(--surface-up)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>복제할 노드</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: p.nodeCount ? 'var(--text)' : 'var(--text3)' }}>
              {p.nodeCount}개
            </div>
          </div>
          <div style={{
            flex: 1, minWidth: 110, padding: '9px 10px', borderRadius: 10,
            background: 'var(--surface-up)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>붙어 있는 자료</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: p.linkCount ? 'var(--text)' : 'var(--text3)' }}>
              {p.linkCount}개
            </div>
          </div>
        </div>

        {/* 🔴 원본이 남는다는 사실 — 이 한 줄이 이 모달의 존재 이유다. */}
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
          원본 <b style={{ color: 'var(--text)' }}>{p.fromLabel || '현재 버전'}</b> 은
          <b style={{ color: 'var(--text)' }}> 그대로 남습니다.</b> 새 버전
          <b style={{ color: 'var(--text)' }}> v{p.nextVersionNo}</b> 이(가) 만들어지고 화면이 그쪽으로 넘어갑니다.
          버전 탭에서 언제든 원본으로 돌아올 수 있습니다.
        </div>

        {p.nodeCount === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.55 }}>
            지금 버전에 노드가 없어 <b style={{ color: 'var(--text)' }}>복제할 것이 없습니다</b> —
            빈 버전 하나가 더 생깁니다.
          </div>
        )}
      </div>

      <div className="field">
        <label>새 버전 이름 <span style={{ color: tooLong ? 'var(--red)' : 'var(--text3)' }}>
          {name.length}/{NAME_LIMIT}
        </span></label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예) 상대가 팔 뺄 때 대응 실험"
        />
        {/* 🔴 "비워 두면 이름이 없다"고 쓰면 **거짓말**이다 — 서버가 `v{원본번호} 분기` 를 자동으로
            붙인다(dev-028a 계약). 화면이 서버가 실제로 할 일을 그대로 말해야 한다. */}
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
          비워 두면 <b style={{ color: 'var(--text2)' }}>{p.fromVersionNo != null ? `v${p.fromVersionNo} 분기` : '자동 이름'}</b> 로
          저장됩니다. 나중에 버전 관리에서 바꿀 수 있습니다.
        </div>
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10, lineHeight: 1.55 }}>{err}</div>}
      {tooLong && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
          이름이 {NAME_LIMIT}자를 넘었습니다 — 서버가 400 으로 거부합니다.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="primary"
          disabled={busy || tooLong || p.fromVersionId == null}
          onClick={() => onConfirm({ name: name.trim() })}
        >{busy ? '분기 중…' : '분기 만들기'}</Button>
        <Button variant="outline" onClick={onClose} disabled={busy}>취소</Button>
      </div>
    </Modal>
  );
}

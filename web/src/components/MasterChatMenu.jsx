// 채팅 패널 상단 바 `⋯` 액션 시트(task-030 D-3).
//
// 🔴 사용자 지시: "'...'버튼을 누르면 제목수정 및 삭제, 보관할 수 있도록".
//    예전 `⋯` 는 대화 관리로 **이동**해서 좌측 `‹`(닫기)와 사실상 같은 일을 했다 — 그 중복을 없앤다.
//
// 세 갈래를 **Modal 하나**로 처리한다(중첩 모달을 피한다 — 겹치면 Esc·바깥 클릭이
// 어느 쪽을 닫는지 예측하기 어렵다). `view` 가 menu → rename | archive | delete 로 바뀔 뿐이다.
//
// 보관·삭제는 성공하면 **패널을 닫고 토스트**를 띄운다(계약 I). 보관은 데이터를 지우지 않는다 —
// 목록에서 빠지고 "보관됨" 보기에서 되살릴 수 있다.
//
// 🔴 D-5(사용자 지시 3): 보관도 **확인을 한 번 묻는다**. 삭제 확인과 같은 문형·같은 Modal 이고,
//    확인 버튼만 primary 다(보관은 되돌릴 수 있어 danger 가 아니다). 취소하면 PATCH 0 건.
// 🔴 D-5(사용자 지시 2): 항목 아이콘은 이모지가 아니라 `Icon` 선 아이콘이다 — 앱 전역과 같은 벌.

import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Icon from './Icon';
import { useMaster } from '../contexts/MasterContext';
import { useUI } from '../contexts/UIContext';
import { archiveChat, deleteChat, renameChat } from '../api/master';

export default function MasterChatMenu({ onClose }) {
  const { chatId, chatTitle, setChatTitle, close, refresh } = useMaster();
  const { showToast } = useUI();
  const [view, setView] = useState('menu');          // menu | rename | archive | delete
  const [titleInput, setTitleInput] = useState(chatTitle || '');
  const [busy, setBusy] = useState(false);

  const label = chatTitle || '새 대화';

  async function saveTitle() {
    const v = titleInput.trim().slice(0, 100);
    if (!v) { onClose(); return; }
    setBusy(true);
    try {
      await renameChat(chatId, v);
      setChatTitle(v);            // 패널 상단 제목을 즉시 반영(목록 재조회를 기다리지 않는다)
      await refresh();
      showToast('제목을 바꿨어요');
      onClose();
    } catch (e) {
      showToast(e.message || '제목을 바꾸지 못했어요');
    } finally { setBusy(false); }
  }

  async function doArchive() {
    setBusy(true);
    try {
      await archiveChat(chatId, true);
      await refresh();
      onClose();
      close();                    // 보관한 대화를 계속 열어 둘 이유가 없다
      showToast('보관했어요');
    } catch (e) {
      showToast(e.message || '보관하지 못했어요');
    } finally { setBusy(false); }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await deleteChat(chatId);
      await refresh();
      onClose();
      close();
      showToast('삭제했어요');
    } catch (e) {
      showToast(e.message || '삭제하지 못했어요');
    } finally { setBusy(false); }
  }

  if (view === 'rename') {
    return (
      <Modal title="제목 수정" onClose={onClose} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" onClick={onClose}>취소</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={saveTitle}>저장</Button>
        </div>
      }>
        <input
          value={titleInput}
          maxLength={100}
          autoFocus
          onChange={(e) => setTitleInput(e.target.value)}
          aria-label="제목"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            background: 'var(--surface-up)', border: '1px solid var(--border-med)',
            color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </Modal>
    );
  }

  if (view === 'archive') {
    return (
      <Modal title="대화 보관" onClose={onClose} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" onClick={onClose}>취소</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={doArchive}>보관</Button>
        </div>
      }>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)' }}>
          “{label}” 대화를 보관할까요?<br />
          <span style={{ color: 'var(--text3)' }}>
            보관해도 지워지지 않아요 — 목록에서만 빠지고 “보관됨”에서 되살릴 수 있어요.
          </span>
        </div>
      </Modal>
    );
  }

  if (view === 'delete') {
    return (
      <Modal title="대화 삭제" onClose={onClose} footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" onClick={onClose}>취소</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={doDelete}>삭제</Button>
        </div>
      }>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)' }}>
          “{label}” 대화를 삭제할까요?<br />
          대화에 남은 제안 카드도 함께 사라져요. 이미 승인해서 만들어진 연구·과제는 그대로 남습니다.<br />
          지우지 않고 목록에서만 치우려면 <b style={{ color: 'var(--text)' }}>보관</b>을 쓰세요.
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={label} onClose={onClose}>
      <div className="bjjm-act" data-chat-menu="1">
        <button type="button" disabled={busy} onClick={() => setView('rename')}>
          <span className="bjjm-ai" aria-hidden="true"><Icon name="edit" size={17} /></span>제목 수정
        </button>
        {/* 🔴 곧바로 보관하지 않는다 — 확인 화면(view='archive')을 먼저 연다(D-5 지시 3). */}
        <button type="button" disabled={busy} onClick={() => setView('archive')}>
          <span className="bjjm-ai" aria-hidden="true"><Icon name="archive" size={17} /></span>보관
        </button>
        <button type="button" className="danger" disabled={busy} onClick={() => setView('delete')}>
          <span className="bjjm-ai" aria-hidden="true"><Icon name="trash" size={17} /></span>삭제
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', margin: '10px 6px 0', lineHeight: 1.6 }}>
        보관하면 목록에서 빠지고 “보관됨”에서 되살릴 수 있어요. 삭제는 되돌릴 수 없어요.
      </div>
    </Modal>
  );
}

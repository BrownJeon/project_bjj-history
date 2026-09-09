// 관장실 컴포저(task-030) — 패널 하단. 빠른 문구 칩 + 입력창.
// 🔴 본문 상한 2,000자는 서버(계약 B)와 같은 값이다. 넘으면 서버가 400 을 준다.

import React, { useRef, useState } from 'react';

const DEFAULT_CHIPS = ['이번 주엔 뭘 할까요', '어제 복기', '영상 찾아 주세요'];

export default function MasterComposer({ onSend, busy = false, chips = DEFAULT_CHIPS }) {
  const [text, setText] = useState('');
  const ref = useRef(null);

  function send(value) {
    const v = (value != null ? value : text).trim();
    if (!v || busy) return;
    if (value == null) {
      setText('');
      if (ref.current) ref.current.style.height = '';
    }
    onSend(v.slice(0, 2000));
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput(e) {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(110, e.target.scrollHeight) + 'px';
  }

  return (
    <div className="bjjm-composer">
      <div className="bjjm-chips">
        {chips.map(c => (
          <button className="bjjm-chip" type="button" key={c} disabled={busy} onClick={() => send(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="bjjm-cin">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          maxLength={2000}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="관장님께 이어서 말하기…"
          aria-label="메시지"
        />
        <button className="bjjm-csend" type="button" onClick={() => send()}
          disabled={busy || !text.trim()} aria-label="보내기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

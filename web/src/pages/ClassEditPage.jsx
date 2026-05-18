import React, { useState, useMemo, useRef } from 'react';
import * as classesApi from '../api/classes';
import * as enhanceApi from '../api/enhanceMemo';
import * as voiceApi from '../api/voice';
import { useUI } from '../contexts/UIContext';
import { useCache } from '../contexts/CacheContext';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Icon from '../components/Icon';
import TagPicker from '../components/TagPicker';
import {
  BASE_POSITIONS, BASE_TECHNIQUES, mergeUnique,
} from '../utils/baseOptions';
import { uniqueDrillPositions } from '../utils/suggestions';

export default function ClassEditor({ initial, onClose, onSaved }) {
  const { showToast, setLoading } = useUI();
  const { techniques, classes } = useCache();
  const isEdit = !!initial?.id;

  const drillPosSuggestions = useMemo(
    () => mergeUnique(BASE_POSITIONS, uniqueDrillPositions(classes)),
    [classes]
  );
  const techSuggestions = useMemo(
    () => mergeUnique(BASE_TECHNIQUES, techniques.map(t => t.name)),
    [techniques]
  );

  const [date, setDate]       = useState(initial?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [dateEnd, setDateEnd] = useState(initial?.date_end?.slice(0, 10) || '');
  const [theme, setTheme]     = useState(initial?.theme || '');
  const [note, setNote]       = useState(initial?.note || '');
  const [feedback, setFeedback] = useState(initial?.feedback || '');

  const drill0 = initial?.drill || {};
  const [drillPos,   setDrillPos]   = useState(drill0.pos ? [drill0.pos] : []);
  const [drillTech,  setDrillTech]  = useState(
    (drill0.tech || []).map(t => typeof t === 'string' ? t : (t.name || ''))
  );
  const [drillStars, setDrillStars] = useState(drill0.stars || 0);

  const [aiBusy, setAiBusy] = useState(null);
  const [voiceBusy, setVoiceBusy]         = useState(false);
  const [voiceElapsed, setVoiceElapsed]   = useState(0);
  const [voiceSuggestions, setVoiceSuggestions] = useState([]);
  const fileInputRef = useRef(null);
  const voiceTimerRef = useRef(null);

  async function aiEnhance(field) {
    const text = field === 'note' ? note : feedback;
    if (!text.trim()) { alert('내용을 먼저 입력해주세요'); return; }
    setAiBusy(field);
    try {
      const t = field === 'feedback' ? 'classFeedback' : 'classNote';
      const res = await enhanceApi.enhanceMemo({ text, type: t });
      if (field === 'note') setNote(res.enhanced || text);
      else setFeedback(res.enhanced || text);
      showToast('AI 보완 완료');
    } catch (e) { showToast('AI 보완 실패: ' + e.message); }
    finally { setAiBusy(null); }
  }

  async function handleVoiceFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // 수업을 먼저 저장해 classId를 확보
    if (!date) { alert('날짜를 먼저 입력해주세요'); return; }
    setLoading(true);
    let savedId = initial?.id;
    try {
      const body = {
        date, dateEnd: dateEnd || null, theme, note, feedback,
        trainedDates: initial?.trained_dates || [],
        drill: (drillPos.length || drillTech.length || drillStars) ? {
          pos: drillPos[0] || '', tech: drillTech,
          detail: drill0.detail || [], stars: parseInt(drillStars) || 0,
          chainIds: drill0.chain_ids || [], clipIds: [],
        } : null,
      };
      if (isEdit) {
        await classesApi.updateClass(initial.id, body);
      } else {
        const res = await classesApi.createClass(body);
        savedId = res?.id || res;
      }
    } catch (err) {
      showToast('저장 실패: ' + err.message);
      setLoading(false);
      return;
    } finally { setLoading(false); }

    if (!savedId) { showToast('classId를 확보할 수 없습니다'); return; }

    // 음성 분석 잡 시작 (백그라운드)
    setVoiceBusy(true);
    setVoiceElapsed(0);
    voiceTimerRef.current = setInterval(() => setVoiceElapsed(s => s + 1), 1000);
    try {
      const form = new FormData();
      form.append('audio', file);
      form.append('classId', savedId);
      await voiceApi.startAnalyze(form);
      showToast('🎙 음성 업로드 완료 — 백그라운드에서 분석을 시작합니다 (완료 시 수업 카드에 표시)');
      onSaved?.();

      // 폴링 — 완료될 때까지 30초마다 확인 (최대 2시간)
      const maxTries = 240;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        try {
          // 잡 목록에서 현재 classId 잡 찾기
          const jobs = await voiceApi.listJobs();
          const job = jobs.find(j => String(j.class_id) === String(savedId));
          if (!job || job.status === 'error') {
            clearInterval(poll);
            clearInterval(voiceTimerRef.current);
            setVoiceBusy(false);
            if (job?.status === 'error') showToast('음성 분석 실패');
            return;
          }
          if (job.status === 'done') {
            clearInterval(poll);
            clearInterval(voiceTimerRef.current);
            const detail = await voiceApi.getJob(job.id);
            const r = detail.result;
            if (r) {
              const newTheme = (r.theme && !theme) ? r.theme : theme;
              if (r.theme && !theme) setTheme(r.theme);

              // 기존 메모가 있으면 구분자 추가 후 append, 없으면 직접 설정
              let mergedNote = note;
              if (r.note) {
                mergedNote = note.trim()
                  ? `${note.trim()}\n\n[음성 분석]\n${r.note}`
                  : r.note;
                setNote(mergedNote);
              }

              const newDrillPos  = r.drillPos        ? [r.drillPos]      : drillPos;
              const newDrillTech = r.techniques?.length ? r.techniques   : drillTech;
              if (r.drillPos)             setDrillPos(newDrillPos);
              if (r.techniques?.length)   setDrillTech(newDrillTech);
              if (r.videoQueries?.length) setVoiceSuggestions(r.videoQueries.slice(0, 3));

              // 분석 결과를 DB에 즉시 반영 (저장 버튼 누르지 않아도 보존)
              const hasDrill = newDrillPos.length || newDrillTech.length || drillStars;
              await classesApi.updateClass(savedId, {
                date, dateEnd: dateEnd || null,
                theme: newTheme, note: mergedNote, feedback,
                trainedDates: initial?.trained_dates || [],
                drill: hasDrill ? {
                  pos: newDrillPos[0] || '', tech: newDrillTech,
                  detail: drill0.detail || [], stars: parseInt(drillStars) || 0,
                  chainIds: drill0.chain_ids || [], clipIds: [],
                } : null,
              }).catch(() => {});
            }
            setVoiceBusy(false);
            showToast('🎙 음성 분석 완료! 전체 메모에 분석 내용이 저장되었습니다');
            onSaved?.();
          }
        } catch {}
        if (tries >= maxTries) {
          clearInterval(poll);
          clearInterval(voiceTimerRef.current);
          setVoiceBusy(false);
        }
      }, 30000);
    } catch (err) {
      clearInterval(voiceTimerRef.current);
      setVoiceBusy(false);
      showToast('업로드 실패: ' + err.message);
    }
  }

  async function save() {
    if (!date) { alert('날짜를 입력해주세요'); return; }
    setLoading(true);
    try {
      const hasDrill = drillPos.length || drillTech.length || drillStars;
      const body = {
        date,
        dateEnd: dateEnd || null,
        theme, note, feedback,
        trainedDates: initial?.trained_dates || [],
        drill: hasDrill ? {
          pos: drillPos[0] || '',
          tech: drillTech,
          detail: drill0.detail || [],
          stars: parseInt(drillStars) || 0,
          chainIds: drill0.chain_ids || [],
          clipIds: [],
        } : null,
      };
      if (isEdit) await classesApi.updateClass(initial.id, body);
      else await classesApi.createClass(body);
      showToast(isEdit ? '수정되었습니다' : '추가되었습니다');
      onSaved && onSaved();
      onClose();
    } catch (e) { showToast('저장 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (!isEdit) return;
    if (!confirm('이 수업을 삭제하시겠습니까? (드릴·스파링 모두 삭제됩니다)')) return;
    setLoading(true);
    try {
      await classesApi.deleteClass(initial.id);
      showToast('삭제되었습니다');
      onSaved && onSaved();
      onClose();
    } catch (e) { showToast('삭제 실패: ' + e.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal title={isEdit ? '수업 수정' : '수업 추가'} onClose={onClose}>
      {/* 음성 기록 버튼 */}
      <div style={{ marginBottom: 16 }}>
        <input
          ref={fileInputRef} type="file"
          accept="audio/*,video/mp4,video/quicktime"
          style={{ display: 'none' }}
          onChange={handleVoiceFile}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={voiceBusy}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 12,
            background: voiceBusy ? 'var(--surface-up)' : 'var(--accent-dim)',
            color: voiceBusy ? 'var(--text2)' : 'var(--accent)',
            border: `1.5px solid ${voiceBusy ? 'var(--border)' : 'var(--accent)'}`,
            fontSize: 14, fontWeight: 700,
            cursor: voiceBusy ? 'default' : 'pointer',
          }}
        >
          {voiceBusy
            ? `🎙 분석 중… ${Math.floor(voiceElapsed / 60)}분 ${voiceElapsed % 60}초 경과`
            : '🎙 음성 파일로 수업 기록'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 0', textAlign: 'center' }}>
          MP3·M4A·WAV·MP4 지원 · 수업 전체 녹음 가능 · 업로드 후 백그라운드 처리
        </p>

        {/* 관련 영상 검색 제안 */}
        {voiceSuggestions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6, fontWeight: 600 }}>
              관련 참고 영상
            </div>
            {voiceSuggestions.map((v, i) => (
              <a key={i}
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(v.query)}`}
                target="_blank" rel="noreferrer"
                style={{
                  display: 'block', padding: '7px 10px', marginBottom: 5,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12, color: 'var(--accent)',
                  textDecoration: 'none',
                }}
              >
                🔍 {v.query}
                {v.reason && <span style={{ color: 'var(--text3)', marginLeft: 6 }}>— {v.reason}</span>}
              </a>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>시작일 *</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>종료일</label>
          <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>테마</label>
        <input value={theme} onChange={e => setTheme(e.target.value)} placeholder="예: 하프가드 위크" />
      </div>

      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>전체 메모</label>
          <AiBtn busy={aiBusy === 'note'} onClick={() => aiEnhance('note')} label="AI 보완" />
        </div>
        <textarea rows={4} value={note} onChange={e => setNote(e.target.value)}
          placeholder="수업 메모, 인사이트, 깨달음" />
      </div>

      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ margin: 0 }}>코치 피드백</label>
          <AiBtn busy={aiBusy === 'feedback'} onClick={() => aiEnhance('feedback')} label="AI 코치 피드백" />
        </div>
        <textarea rows={3} value={feedback} onChange={e => setFeedback(e.target.value)}
          placeholder="원문 피드백 (AI가 자연스러운 코칭 톤으로 보완)" />
      </div>

      <div className="field">
        <label>주요 포지션</label>
        <TagPicker value={drillPos} onChange={setDrillPos}
          suggestions={drillPosSuggestions} singleSelect placeholder="포지션 검색·자유 입력" />
      </div>

      <div className="field">
        <label>주요 기술</label>
        <TagPicker value={drillTech} onChange={setDrillTech}
          suggestions={techSuggestions} placeholder="기술명 검색·자유 입력" />
      </div>

      <div className="field">
        <label>난이도/만족도</label>
        <StarRating value={drillStars} onChange={setDrillStars} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {isEdit && (
          <Button variant="danger" size="sm" onClick={remove} style={{ marginRight: 'auto' }}>삭제</Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
        <Button variant="primary" size="sm" onClick={save}>저장</Button>
      </div>
    </Modal>
  );
}

function AiBtn({ busy, onClick, label }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        background: 'var(--purple-dim)',
        color: 'var(--purple)',
        border: 'none',
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {busy ? '보완 중…' : `✨ ${label}`}
    </button>
  );
}

function StarRating({ value, onChange }) {
  const v = parseInt(value) || 0;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          onClick={() => onChange(n === v ? 0 : n)}
          style={{ cursor: 'pointer', display: 'inline-flex' }}
        >
          <Icon name="star" size={22}
            color={n <= v ? 'var(--amber)' : 'var(--text3)'}
            filled={n <= v} />
        </span>
      ))}
    </div>
  );
}

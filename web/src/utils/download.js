/**
 * 파일 저장 공용 헬퍼 — 웹은 기존 `<a download>`, 앱은 폰 저장소에 직접 저장 (task-039 A-5).
 *
 * 교체 전에는 화면마다 `<a download>` 를 만들어 눌렀다. 앱 WebView 에서는 그 방식이 동작하지 않거나
 * (다운로드 매니저 미연결) 같은 도메인 `/uploads/…` 로 **WebView 자체가 이동해 앱 화면을 덮는다.**
 * 그래서 앱이면 브리지 `saveToDevice`(네이티브 스트리밍 저장 → `Download/BJJ`)로 보내고,
 * 결과를 반드시 알린다 — 🔴 조용한 실패 금지(저장 버튼을 눌렀는데 아무 일도 없는 상태를 만들지 않는다).
 *
 * 웹 동작은 교체 전과 같다(같은 파일명·같은 `<a download>` 클릭).
 */
import { isNativeApp, saveToDevice } from '../native/bridge';

/** 기존 화면들이 쓰던 캡처 파일명 규칙 그대로 — `<제목(한글·영문·숫자 외 _)>-<n>.jpg` */
export function frameFileName(title, idx) {
  return `${(title || 'frame').replace(/[^가-힣a-zA-Z0-9]/g, '_')}-${idx + 1}.jpg`;
}

/** 기존 영상 다운로드 링크의 파일명 규칙 그대로 — `<제목>.mp4` */
export function videoFileName(title) {
  return `${title || 'video'}.mp4`;
}

function clickAnchor(url, filename, doc) {
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
}

/**
 * @param {string} url
 * @param {string} filename
 * @param {object} [opts]
 * @param {(msg: string, ms?: number) => void} [opts.notify]  토스트(앱에서 완료/실패 안내). 없으면 alert.
 * @param {(p: {bytes: number, total: number|null}) => void} [opts.onProgress]
 * @param {boolean} [opts.quiet]  여러 장을 순차 저장할 때 개별 "완료" 토스트를 생략(실패는 항상 알린다)
 * @returns {Promise<{ok: boolean, native: boolean, path?: string, error?: string}>}
 */
export async function downloadFile(url, filename, opts = {}) {
  const { notify, onProgress, quiet = false } = opts;
  const say = (msg, ms) => {
    if (typeof notify === 'function') notify(msg, ms);
    else if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg);
  };

  if (!isNativeApp()) {
    clickAnchor(url, filename, document);
    return { ok: true, native: false };
  }

  try {
    const { path } = await saveToDevice({ url, filename, onProgress });
    if (!quiet) say(`저장했습니다 · ${path}`, 3000);
    return { ok: true, native: true, path };
  } catch (e) {
    const error = (e && e.message) || '저장하지 못했습니다';
    say(error, 4000);
    return { ok: false, native: true, error };
  }
}

/**
 * 캡처 여러 장 저장. 웹은 기존처럼 400ms 간격 `<a download>`(브라우저 연속 다운로드 차단 회피),
 * 앱은 한 장씩 **순차로** 저장한 뒤 결과를 한 번에 알린다.
 * @returns {Promise<{saved: number, failed: number}>}
 */
export async function downloadFrames(frames, title, opts = {}) {
  const list = Array.isArray(frames) ? frames : [];
  if (!isNativeApp()) {
    list.forEach((url, i) => {
      setTimeout(() => clickAnchor(url, frameFileName(title, i), document), i * 400);
    });
    return { saved: list.length, failed: 0 };
  }
  let saved = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i += 1) {
    const r = await downloadFile(list[i], frameFileName(title, i), { ...opts, quiet: true });
    if (r.ok) saved += 1; else failed += 1;
  }
  if (list.length && typeof opts.notify === 'function') {
    opts.notify(
      failed ? `캡처 ${saved}장 저장 · ${failed}장 실패` : `캡처 ${saved}장을 Download/BJJ 에 저장했습니다`,
      3000,
    );
  }
  return { saved, failed };
}

/**
 * 앱에서 같은 도메인 `/uploads/…` 링크를 누르면 WebView 가 그 파일로 이동해 앱 화면을 덮는다.
 * 전역 클릭 가로채기(NativeAppHost)가 이 함수로 대상인지 판정한다. 대상이면 저장 파일명을 돌려준다.
 * @param {HTMLAnchorElement|null} anchor
 * @param {string} origin  현재 페이지 origin
 * @returns {{url: string, filename: string} | null}
 */
export function uploadsLinkTarget(anchor, origin) {
  if (!anchor || typeof anchor.getAttribute !== 'function') return null;
  const href = anchor.getAttribute('href');
  if (!href) return null;
  let u;
  try {
    u = new URL(href, origin);
  } catch {
    return null;
  }
  if (u.origin !== origin || !u.pathname.startsWith('/uploads/')) return null;
  const attr = anchor.getAttribute('download');
  let base = '';
  try { base = decodeURIComponent(u.pathname.split('/').pop() || ''); } catch { base = u.pathname.split('/').pop() || ''; }
  return { url: u.toString(), filename: attr || base || 'file' };
}

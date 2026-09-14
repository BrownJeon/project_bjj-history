/**
 * Capacitor 런타임 브리지 — 웹 코드가 네이티브(Android 앱) 기능을 만지는 **유일한 경로** (task-039 A-3).
 *
 * ── `@capacitor/*` 를 import 하지 않는다 ────────────────────────────────────
 * 앱은 운영 웹(`server.url`)을 그대로 로드한다 — **같은 번들이 폰 앱과 PC·모바일 브라우저에 함께 나간다.**
 * 네이티브 패키지를 import 하면 웹 사용자도 그 코드를 받고, 플러그인이 빠진 APK 에서는 모듈 최상위에서
 * 터진다. 그래서 여기서는 **앱 WebView 에 Capacitor 가 주입하는 `window.Capacitor` 전역만** 본다.
 * (참고 원본: TheMeal `src/lib/native/bridge.ts` — 실기기에서 검증된 구조)
 *
 * ── 규칙: 브리지·플러그인이 없으면 조용히 아무 일도 안 한다 ──────────────────
 * 모든 함수가 웹에서는 no-op / false / null 을 돌려준다. 호출부는 그 값으로 웹 동작으로 갈라진다.
 * 단 `saveToDevice` 는 **사용자가 누른 저장**이라 실패를 삼키지 않고 throw 한다(조용한 실패 금지).
 */

/** 앱이 로드하는 운영 주소. 퓨니코드 — mobile/capacitor.config.ts 의 server.url 과 같은 값. */
export const APP_ORIGIN = 'https://bjj.xn--lh0b87pnudm10a4vd.com';
/** 앱 intent-filter(`bjjapp://auth`)와 서버 `services/appAuthCodes.js` 의 딥링크와 같은 값. */
export const AUTH_DEEP_LINK_SCHEME = 'bjjapp:';
/** 폰 공개 저장소 안 저장 폴더 — 파일 앱의 `Download/BJJ`. */
export const DEVICE_SAVE_DIR = 'Download/BJJ';

const AUTH_CODE_RE = /^[0-9a-f]{64}$/;

export function getBridge() {
  if (typeof window === 'undefined') return null;
  return window.Capacitor || null;
}

export function isNativeApp() {
  const b = getBridge();
  return !!b && typeof b.isNativePlatform === 'function' && b.isNativePlatform() === true;
}

/** 앱일 때만 플러그인 프록시를 꺼낸다. 없으면 null. */
function getPlugin(name) {
  if (!isNativeApp()) return null;
  const plugins = getBridge().Plugins;
  return (plugins && plugins[name]) || null;
}

function fn(plugin, method) {
  return plugin && typeof plugin[method] === 'function' ? plugin[method].bind(plugin) : null;
}

/** Custom Tab(외부 브라우저)으로 연다. 플러그인이 없거나 실패하면 false — 호출부가 일반 이동으로 폴백한다. */
export async function openExternal(url) {
  const open = fn(getPlugin('Browser'), 'open');
  if (!open) return false;
  try {
    await open({ url });
    return true;
  } catch {
    return false;
  }
}

/** 로그인이 끝나면 떠 있는 Custom Tab 을 닫는다. 부가 동작이라 실패해도 무시한다. */
export async function closeExternal() {
  const close = fn(getPlugin('Browser'), 'close');
  if (!close) return;
  try {
    await close();
  } catch {
    // 이미 닫혔거나(singleTask 복귀가 먼저 정리) 열린 적이 없다 — 사용자가 할 일이 없다.
  }
}

/**
 * `bjjapp://auth/callback?…` 인지 판정하고 URL 객체를 돌려준다.
 *
 * 🔴 함정: 커스텀 스킴은 WHATWG URL 의 "특수 스킴"이 아니라서 `new URL('bjjapp://auth/callback')` 의
 *    `auth` 는 **host** 로, pathname 은 **`/callback`** 으로 파싱된다. `pathname.includes('auth/callback')`
 *    으로 찾으면 영원히 못 찾는다(TheMeal 실기기에서 로그인이 통째로 죽었던 원인) — 그래서 host 와 path 를 따로 본다.
 */
function parseAuthCallback(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== AUTH_DEEP_LINK_SCHEME) return null;
  if (url.host !== 'auth') return null;
  if (url.pathname !== '/callback' && url.pathname !== '/callback/') return null;
  return url;
}

/** 딥링크에서 로그인 코드(소문자 hex 64자)를 꺼낸다. 로그인 딥링크가 아니거나 형식이 틀리면 null. */
export function authCodeFromDeepLink(rawUrl) {
  const url = parseAuthCallback(rawUrl);
  if (!url) return null;
  const code = url.searchParams.get('code');
  return code !== null && AUTH_CODE_RE.test(code) ? code : null;
}

/** 딥링크에 실린 오류(`?error=…&msg=…`, 예: 구글에서 취소). 없으면 null. */
export function authErrorFromDeepLink(rawUrl) {
  const url = parseAuthCallback(rawUrl);
  if (!url) return null;
  const error = url.searchParams.get('error');
  if (error === null || error === '') return null;
  return { error, msg: url.searchParams.get('msg') || '' };
}

/**
 * 로그인 딥링크 구독 + **콜드 스타트 보정**.
 *
 * ⚠️ 앱이 꺼져 있다가 딥링크로 깨어나면 웹이 뜨기 전에 `appUrlOpen` 이 지나간다. Capacitor App 플러그인은
 *    그 이벤트를 보관했다가(retain) 첫 리스너에 주기도 하고, `getLaunchUrl()` 도 같은 주소를 준다.
 *    즉 **같은 주소가 두 번 올 수 있고**, `getLaunchUrl()` 은 WebView 가 새로고침돼도 계속 같은 옛 주소를 준다
 *    (Bridge.intentUri 는 앱 시작 시 한 번 잡힌다 — @capacitor/android 7 소스 실측).
 *    코드는 1회용이므로 **중복 처리는 호출부(native/appLogin.js)가 막는다.**
 *
 * @param {(url: string, meta: {source: 'open'|'launch'}) => void} handler
 * @returns {() => void} 구독 해제. 브리지가 없으면 아무것도 안 하는 함수.
 */
export function onAuthDeepLink(handler) {
  const app = getPlugin('App');
  if (!app) return () => {};

  let disposed = false;
  let removeListener = null;

  const addListener = fn(app, 'addListener');
  if (addListener) {
    try {
      const result = addListener('appUrlOpen', (data) => {
        if (!disposed && data && typeof data.url === 'string') handler(data.url, { source: 'open' });
      });
      Promise.resolve(result).then((h) => {
        const remove = h && typeof h.remove === 'function' ? () => h.remove() : null;
        if (disposed) { if (remove) remove(); } else removeListener = remove;
      }).catch(() => {});
    } catch {
      // 리스너 등록 실패 — 콜드 스타트 보정만 남는다.
    }
  }

  const getLaunchUrl = fn(app, 'getLaunchUrl');
  if (getLaunchUrl) {
    Promise.resolve()
      .then(() => getLaunchUrl())
      .then((launch) => {
        if (!disposed && launch && typeof launch.url === 'string') handler(launch.url, { source: 'launch' });
      })
      .catch(() => {});
  }

  return () => {
    disposed = true;
    if (removeListener) {
      try { removeListener(); } catch { /* 무시 */ }
    }
  };
}

/**
 * 하드웨어 뒤로가기. 🔴 리스너를 하나라도 등록하면 Capacitor 의 기본 동작(WebView goBack)이 **꺼진다** —
 * 그래서 등록한 쪽(native/backStack.js handleNativeBack)이 모달 닫기·뒤로·종료를 전부 책임진다.
 * @param {(data: {canGoBack?: boolean}) => void} handler
 */
export function onBackButton(handler) {
  const addListener = fn(getPlugin('App'), 'addListener');
  if (!addListener) return () => {};
  let disposed = false;
  let removeListener = null;
  try {
    const result = addListener('backButton', (data) => { if (!disposed) handler(data || {}); });
    Promise.resolve(result).then((h) => {
      const remove = h && typeof h.remove === 'function' ? () => h.remove() : null;
      if (disposed) { if (remove) remove(); } else removeListener = remove;
    }).catch(() => {});
  } catch {
    return () => {};
  }
  return () => {
    disposed = true;
    if (removeListener) {
      try { removeListener(); } catch { /* 무시 */ }
    }
  };
}

/** 앱 종료(루트에서 뒤로가기). 웹에서는 아무 일도 없다. */
export async function exitApp() {
  const exit = fn(getPlugin('App'), 'exitApp');
  if (!exit) return false;
  try {
    await exit();
    return true;
  } catch {
    return false;
  }
}

/** 저장 파일명 정리 — 한글·영문·숫자·`.`·`-`·`_` 만 남긴다. */
export function sanitizeFileName(name, fallback = 'file') {
  const raw = typeof name === 'string' ? name : '';
  // `+`·`%` 는 반드시 치운다: file-transfer(ionfiletransfer 1.0.3 normalizeFilePath)가 경로를
  // URLDecoder 로 한 번 풀어서 `+` 는 공백이 되고 `%xx` 가 아닌 `%` 는 예외가 난다(AAR 역어셈블 실측).
  let s = raw.normalize('NFC').replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9._-]/g, '_');
  s = s.replace(/_+/g, '_').replace(/^[._]+/, '').slice(0, 80);
  return s || fallback;
}

function splitExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

/** 같은 도메인 상대경로(`/uploads/…`)를 네이티브 HTTP 가 받을 수 있게 절대 URL 로. */
export function toAbsoluteUrl(url) {
  const base = typeof window !== 'undefined' && window.location && /^https?:$/.test(window.location.protocol)
    ? window.location.origin
    : APP_ORIGIN;
  return new URL(url, base).toString();
}

/**
 * 폰 공개 저장소 `Download/BJJ/` 에 **스트리밍으로** 저장한다(앱 전용, A-5).
 *
 * 저장 방법 결정 근거(플러그인 소스 실측, task-039 결과에 기록):
 *  · `@capacitor/file-transfer@1.0.12`(Capacitor 7 계열, 2.x 는 core>=8) `downloadFile` 은 네이티브
 *    HttpURLConnection 으로 받아 파일로 바로 쓴다 — 영상을 WebView 메모리에 base64 로 올리지 않는다.
 *    부모 폴더는 라이브러리가 `mkdirs()` 로 만든다. API 30+ 는 저장소 권한 없이 진행, 공개 폴더면 끝나고
 *    MediaScanner 로 등록 → 파일 앱·갤러리에 보인다. `path` 는 `file://` 없는 절대 경로로 넘긴다
 *    (MediaScannerConnection.scanFile 이 경로를 기대한다).
 *  · 경로는 `@capacitor/filesystem` `getUri({directory:'EXTERNAL_STORAGE'})` 로 기기 공용 저장소 루트를 얻어 만든다.
 *    같은 이름이 있으면 `stat` 으로 확인해 ` (2)` 식으로 비켜 쓴다(남의 파일 덮어쓰기 실패 방지).
 *
 * @param {{url: string, filename: string, onProgress?: (p: {bytes:number, total:number|null}) => void}} opts
 * @returns {Promise<{path: string, name: string}>}  저장 위치(`Download/BJJ/<이름>`)
 * @throws  플러그인이 없거나 저장이 실패하면 Error — 호출부가 사용자에게 알린다.
 */
export async function saveToDevice({ url, filename, onProgress } = {}) {
  const fs = getPlugin('Filesystem');
  const ft = getPlugin('FileTransfer');
  const getUri = fn(fs, 'getUri');
  const stat = fn(fs, 'stat');
  const downloadFile = fn(ft, 'downloadFile');
  if (!getUri || !downloadFile) {
    throw new Error('이 앱 버전은 기기 저장을 지원하지 않습니다');
  }
  if (typeof url !== 'string' || url === '') throw new Error('저장할 파일 주소가 없습니다');

  const absUrl = toAbsoluteUrl(url);
  const [base, ext] = splitExt(sanitizeFileName(filename));

  // 비어 있는 이름 찾기 — stat 이 실패(=없음)하면 그 이름을 쓴다. stat 이 없으면 첫 이름 그대로.
  let name = `${base}${ext}`;
  if (stat) {
    for (let n = 2; n <= 50; n += 1) {
      try {
        await stat({ path: `${DEVICE_SAVE_DIR}/${name}`, directory: 'EXTERNAL_STORAGE' });
        name = `${base}_(${n})${ext}`;
      } catch {
        break;
      }
    }
  }
  const relPath = `${DEVICE_SAVE_DIR}/${name}`;
  const { uri } = await getUri({ path: relPath, directory: 'EXTERNAL_STORAGE' });
  if (typeof uri !== 'string' || uri === '') throw new Error('저장 경로를 만들지 못했습니다');
  const filePath = uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;

  let removeProgress = null;
  const addListener = fn(ft, 'addListener');
  if (onProgress && addListener) {
    try {
      const h = await addListener('progress', (e) => {
        if (!e || e.url !== absUrl) return;
        onProgress({ bytes: Number(e.bytes) || 0, total: e.lengthComputable ? Number(e.contentLength) || null : null });
      });
      removeProgress = h && typeof h.remove === 'function' ? () => h.remove() : null;
    } catch {
      removeProgress = null; // 진행률은 부가 기능 — 저장은 계속한다
    }
  }

  try {
    await downloadFile({ url: absUrl, path: filePath, progress: !!onProgress });
  } catch (e) {
    const status = e && e.data && e.data.httpStatus;
    const reason = status ? `서버 응답 ${status}` : (e && e.message) || '알 수 없는 오류';
    throw new Error(`저장하지 못했습니다 (${reason})`);
  } finally {
    if (removeProgress) {
      try { await removeProgress(); } catch { /* 무시 */ }
    }
  }
  return { path: relPath, name };
}

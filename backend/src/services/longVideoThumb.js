// 긴 영상 썸네일 서버 보관 (task-050)
//
// long_videos.thumb_url 은 원래 유튜브 CDN 주소(i.ytimg.com)였다. 유튜브에서 영상이 지워지거나 비공개가 되면
// 목록·상세 poster 의 썸네일이 같이 사라지므로, 받은 이미지를 영상과 같은 폴더
// (storage.getLongVideoDir → users/<uid>/long-videos/<vid>/thumb.<ext>)에 남기고 thumb_url 에 서버 경로를 쓴다.
//
// 🔴 외부 주소를 서버가 받아 오는 코드다(SSRF). 규칙:
//   - https 만, 호스트는 허용목록(i.ytimg.com · *.ytimg.com · img.youtube.com)만, 계정·비표준 포트 금지
//   - 리다이렉트는 따라가지 않는다(redirect:'manual' → 200 이 아니면 거부) — 허용 호스트가 다른 곳으로 넘기는 길을 막는다
//   - 15초 제한(헤더·본문 전체), 5MB 상한(content-length 와 실제 누적 바이트 둘 다)
//   - 형식은 응답 바이트의 매직 바이트로만 정한다(JPEG FFD8FF · WebP RIFF....WEBP · PNG 89504E47…) — content-type 은 믿지 않는다
// 저장 규칙(task-048 persistVideo 와 같은 원칙):
//   - 임시 이름(thumb.tmp-<pid>-<난수>)에 쓴 뒤 rename 으로 thumb.<ext> 교체(원자적). 어떤 실패에서도 기존 thumb.* 는 그대로다.
//   - 실패하면 임시 파일과 이번에 만든 빈 폴더를 지운다.
//   - 성공(+ commit 이 있으면 기록 성공) 뒤에 10분 넘은 thumb.tmp-* 만 지운다.
//   - 🔴 다른 확장자의 옛 thumb.* 는 **지우지 않는다**(REV-050 F1 / Codex C2 #1). 같은 영상에 쓰기 주체가 둘(재분석 S1.5 와
//     백필)이고 받은 형식이 다르면(jpg/webp), 한쪽의 정리가 다른 쪽이 방금 DB 에 연결한 파일을 지워 DB 가 없는 파일을
//     가리켰다(재현: DB=thumb.webp, files=[]). 확장자가 바뀌어 남는 옛 파일(수십~수백 KB)은 영상 DELETE 의 폴더 통삭제가 회수한다.
//   - 운영상 실패는 던지지 않고 { saved:false, reason } — 인자 오류(userId·videoId 가 정수가 아님 등)만 던진다.
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const storage = require('./storage');

const THUMB_TIMEOUT_MS = 15 * 1000;
const THUMB_MAX_BYTES = 5 * 1024 * 1024;
const THUMB_STALE_TMP_MS = 10 * 60 * 1000;
const THUMB_TMP_PREFIX = 'thumb.tmp-';
const THUMB_URL_MAX_LEN = 2048;
const THUMB_MIN_BYTES = 12; // 매직 바이트(WebP 12바이트)조차 못 담는 응답은 이미지가 아니다

const ALLOWED_EXACT_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com']);
// *.ytimg.com — 라벨 하나 이상 + ytimg.com. ytimg.com 자체·IP·끝 점('i.ytimg.com.')은 걸리지 않는다.
const YTIMG_SUBDOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ytimg\.com$/;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 허용된 썸네일 주소인지 — 네트워크를 쓰지 않는다. @returns {{ok:true,url}|{ok:false,reason}} */
function checkThumbUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: '썸네일 주소가 비어 있습니다' };
  if (raw.length > THUMB_URL_MAX_LEN) return { ok: false, reason: '썸네일 주소가 너무 깁니다' };
  let u;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: '썸네일 주소 형식이 아닙니다' }; }
  if (u.protocol !== 'https:') return { ok: false, reason: `https 주소만 받습니다(${u.protocol})` };
  if (u.username || u.password) return { ok: false, reason: '계정 정보가 들어간 주소는 받지 않습니다' };
  if (u.port) return { ok: false, reason: `기본 포트가 아닌 주소는 받지 않습니다(${u.port})` }; // https 의 443 은 URL 이 '' 로 정규화한다
  const host = u.hostname;
  if (!(ALLOWED_EXACT_HOSTS.has(host) || YTIMG_SUBDOMAIN_RE.test(host))) {
    return { ok: false, reason: `허용되지 않은 호스트입니다(${host.slice(0, 80)})` };
  }
  return { ok: true, url: u.href };
}

/** 응답 바이트의 매직 바이트로 확장자를 정한다. 모르는 형식 → null */
function sniffImageExt(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < THUMB_MIN_BYTES) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function cancelBody(res) {
  try { res?.body?.cancel?.().catch?.(() => {}); } catch { /* ignore */ }
}

// 본문을 상한까지만 읽는다. 시간 초과(signal)면 읽기를 끊는다. 결과: {buf} | {tooLarge:true}
async function readCapped(res, maxBytes, signal) {
  if (!res.body) return { buf: Buffer.alloc(0) };
  const reader = res.body.getReader();
  const onAbort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Error('aborted');
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  // cancel() 은 대기 중인 read() 를 done:true 로 끝낼 수 있다 — 잘린 본문을 이미지로 쓰지 않게 다시 본다
  if (signal.aborted) throw new Error('aborted');
  return { buf: Buffer.concat(chunks, total) };
}

// 오래된 thumb.tmp-* 정리 — 겹쳐 도는 다른 시도의 살아 있는 임시 파일일 수 있으므로 오래된 것만(persistVideo 와 같은 규칙).
// thumb.<ext>(다른 확장자 포함)·video.mp4·video.mp4.tmp-* 등 다른 이름은 건드리지 않는다(위 헤더 🔴 참고).
async function pruneStaleTmp(dir, staleTmpMs, now) {
  for (const name of await fs.readdir(dir).catch(() => [])) {
    if (!name.startsWith(THUMB_TMP_PREFIX)) continue;
    const p = path.join(dir, name);
    const st = await fs.stat(p).catch(() => null);
    if (st && st.isFile() && now() - st.mtimeMs > staleTmpMs) await fs.rm(p, { force: true }).catch(() => {});
  }
}

/**
 * 원격 썸네일을 받아 서버에 보관한다.
 * @param {string} remoteUrl  유튜브 썸네일 주소(yt-dlp 메타의 thumbnail 또는 DB 의 thumb_url)
 * @param {number|string} userId   정수 — 아니면 던진다(storage.getLongVideoDir)
 * @param {number|string} videoId  long_videos.id, 정수 — 아니면 던진다
 * @param {object} [opts]
 *   commit(webPath)  저장(rename) 직후 호출 — 호출측이 thumb_url 을 기록한다. 던지면
 *                    { saved:true, recorded:false, reason, commitError } 를 돌려준다(새 파일은 남는다).
 *                    다른 확장자의 옛 thumb.* 는 commit 성공 여부와 관계없이 지우지 않는다.
 *   fetchFn · targetDir · timeoutMs · maxBytes · staleTmpMs · now — 단위 테스트 주입용(기본값이 운영 값이다)
 * @returns {Promise<{saved:true, recorded:boolean|null, webPath, filePath, bytes, ext} | {saved:false, reason}>}
 */
async function persistThumbnail(remoteUrl, userId, videoId, opts = {}) {
  const defaultDir = storage.getLongVideoDir(userId, videoId); // 인자 오류는 여기서 던진다
  const {
    fetchFn = (u, init) => globalThis.fetch(u, init),
    targetDir = defaultDir,
    timeoutMs = THUMB_TIMEOUT_MS,
    maxBytes = THUMB_MAX_BYTES,
    staleTmpMs = THUMB_STALE_TMP_MS,
    commit = null,
    now = Date.now,
  } = opts;
  if (typeof fetchFn !== 'function') throw new Error('persistThumbnail: fetchFn 은 함수여야 합니다');
  if (commit != null && typeof commit !== 'function') throw new Error('persistThumbnail: commit 은 함수여야 합니다');

  const checked = checkThumbUrl(remoteUrl);
  if (!checked.ok) return { saved: false, reason: checked.reason };

  // 1) 받기 — 디스크에 쓰기 전에 크기·형식까지 확인한다(메모리 상한 maxBytes)
  let buf;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchFn(checked.url, {
      method: 'GET',
      redirect: 'manual',
      signal: ac.signal,
      headers: { accept: 'image/webp,image/jpeg,image/png' },
    });
    if (!res || typeof res.status !== 'number') return { saved: false, reason: '응답이 올바르지 않습니다' };
    if (res.status !== 200) {
      cancelBody(res);
      if (res.status >= 300 && res.status < 400) return { saved: false, reason: `리다이렉트는 따라가지 않습니다(HTTP ${res.status})` };
      return { saved: false, reason: `HTTP ${res.status}` };
    }
    const cl = res.headers?.get?.('content-length');
    if (cl != null && /^\s*\d+\s*$/.test(cl) && Number(cl) > maxBytes) {
      cancelBody(res);
      return { saved: false, reason: `크기 상한 초과(content-length ${Number(cl)} > ${maxBytes} bytes)` };
    }
    const got = await readCapped(res, maxBytes, ac.signal);
    if (got.tooLarge) return { saved: false, reason: `크기 상한 초과(본문이 ${maxBytes} bytes 를 넘음)` };
    buf = got.buf;
  } catch (e) {
    if (ac.signal.aborted) return { saved: false, reason: `시간 초과(${Math.round(timeoutMs / 1000)}초)` };
    return { saved: false, reason: `받기 실패: ${e?.message || String(e)}` };
  } finally {
    clearTimeout(timer);
  }

  if (!buf.length) return { saved: false, reason: '빈 응답입니다(0 bytes)' };
  const ext = sniffImageExt(buf);
  if (!ext) return { saved: false, reason: `이미지 형식(JPEG·WebP·PNG)이 아닙니다(${buf.length} bytes)` };

  // 2) 저장 — 임시 이름 → rename(같은 폴더라 원자적 교체)
  const webPath = storage.longVideoThumbWebPath(userId, videoId, ext);
  const finalPath = path.join(targetDir, `thumb.${ext}`);
  const tmpPath = path.join(targetDir, `${THUMB_TMP_PREFIX}${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  let createdDir = false;
  let renamed = false;
  try {
    createdDir = !fsSync.existsSync(targetDir);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(tmpPath, buf, { flag: 'wx' });
    await fs.rename(tmpPath, finalPath);
    renamed = true;
  } catch (e) {
    return { saved: false, reason: `저장 실패: ${e?.message || String(e)}` };
  } finally {
    if (!renamed) {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
      // 이번 실행이 만든 폴더가 비어 있으면 지운다(비어 있지 않으면 rmdir 이 실패 — 기존 파일은 안전)
      if (createdDir) await fs.rmdir(targetDir).catch(() => {});
    }
  }

  // 3) 기록(호출측)
  if (commit) {
    try {
      await commit(webPath);
    } catch (e) {
      return {
        saved: true, recorded: false, webPath, filePath: finalPath, bytes: buf.length, ext,
        reason: `기록 실패: ${e?.message || String(e)}`, commitError: e,
      };
    }
  }

  // 4) 정리 — 성공 뒤에만, 오래된 임시 파일만(다른 확장자 thumb.* 는 남긴다)
  await pruneStaleTmp(targetDir, staleTmpMs, now);
  return { saved: true, recorded: commit ? true : null, webPath, filePath: finalPath, bytes: buf.length, ext };
}

/**
 * 썸네일 주소를 받아 올 수 있는지만 본다(HEAD) — 백필 dry-run 용. 아무것도 쓰지 않는다.
 * @returns {Promise<{ok:boolean, status?, contentType?, contentLength?, reason?}>}
 */
async function probeThumbnail(remoteUrl, opts = {}) {
  const { fetchFn = (u, init) => globalThis.fetch(u, init), timeoutMs = THUMB_TIMEOUT_MS, maxBytes = THUMB_MAX_BYTES } = opts;
  const checked = checkThumbUrl(remoteUrl);
  if (!checked.ok) return { ok: false, reason: checked.reason };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchFn(checked.url, { method: 'HEAD', redirect: 'manual', signal: ac.signal });
    cancelBody(res);
    const contentType = res.headers?.get?.('content-type') || '';
    const clRaw = res.headers?.get?.('content-length');
    const contentLength = clRaw != null && /^\s*\d+\s*$/.test(clRaw) ? Number(clRaw) : null;
    if (res.status !== 200) {
      const why = res.status >= 300 && res.status < 400 ? `리다이렉트(HTTP ${res.status})` : `HTTP ${res.status}`;
      return { ok: false, status: res.status, contentType, contentLength, reason: why };
    }
    if (contentLength != null && contentLength > maxBytes) {
      return { ok: false, status: res.status, contentType, contentLength, reason: `크기 상한 초과(${contentLength})` };
    }
    return { ok: true, status: res.status, contentType, contentLength };
  } catch (e) {
    return { ok: false, reason: ac.signal.aborted ? `시간 초과(${Math.round(timeoutMs / 1000)}초)` : `확인 실패: ${e?.message || String(e)}` };
  } finally {
    clearTimeout(timer);
  }
}

/** thumb_url 이 서버에 보관된 썸네일(웹 경로)인지 — 파이프라인 S1·백필이 같은 기준을 쓴다 */
function isServerThumbUrl(value) {
  return typeof value === 'string' && value.startsWith('/uploads/');
}

module.exports = {
  persistThumbnail,
  probeThumbnail,
  checkThumbUrl,
  sniffImageExt,
  isServerThumbUrl,
  THUMB_TIMEOUT_MS,
  THUMB_MAX_BYTES,
  THUMB_STALE_TMP_MS,
  THUMB_TMP_PREFIX,
};

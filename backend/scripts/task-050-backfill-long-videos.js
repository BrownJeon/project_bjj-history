#!/usr/bin/env node
// task-050 — 1회성: 기존 영상분석(long_videos) 행의 썸네일·영상 파일을 서버(NAS)에 보관하고 thumb_url·video_path 를 연결한다.
// (새 분석은 파이프라인 S1.5·S3.5 가 하므로 이 스크립트는 그 전에 분석된 행만 채운다.)
//
// 사용 (🔴 --user 는 필수. 쓰기는 --apply 가 있을 때만):
//   node backend/scripts/task-050-backfill-long-videos.js --user 3 --skip-video-ids 74                  # dry-run(기본) — 계획표, 쓰기 0
//   node backend/scripts/task-050-backfill-long-videos.js --user 3 --skip-video-ids 74 --apply          # 백업 JSON → 행별 처리
//   node backend/scripts/task-050-backfill-long-videos.js --user 3 --restore <백업.json>                # 복원 dry-run
//   node backend/scripts/task-050-backfill-long-videos.js --user 3 --restore <백업.json> --apply        # 복원 적용
//   옵션: --only <id,id>          이 id 들만
//         --skip-video-ids <id,id> 영상 파일은 건너뛸 id(썸네일은 처리) — 예: 74(이미 영상 저장됨)
//         --allow-non-h264       H.264+AAC 가 아닌 영상도 저장(기본은 저장·연결하지 않고 보고 — 폰 재생 문제)
//         --backup-dir <dir>     백업·로그 위치(기본 ~/.local/share/bjj-backups)
//
// 원칙 (task-047 규약 + task-048 저장 규칙)
// - dry-run 은 DB·NAS·/tmp 에 아무것도 쓰지 않는다: DB SELECT, yt-dlp 메타 조회(-J --skip-download), 썸네일 HEAD 만.
//   (기록용 로그 파일 하나만 --backup-dir 에 남긴다.)
// - --apply 는 먼저 대상 행의 원래 thumb_url·video_path·updated_at 을 백업 JSON(600)에 쓰고, 쓰는 일마다
//   (만든 파일·바꿀 값) 를 **쓰기 전에** 백업에 덧붙인다 — 중간에 죽어도 --restore 가 되돌릴 수 있게.
// - 행마다 독립: 한 행의 실패(유튜브 삭제·길이 불일치·코덱·저장 실패)는 보고만 하고 다음 행으로 간다. 순차 실행(동시성 1).
// - 모든 UPDATE 는 `updated_at = updated_at` 로 시각을 고정하고, 조건을 건다:
//     thumb_url  → `thumb_url <=> 백업 시점 값` (그 사이 바뀌었으면 쓰지 않음)
//     video_path → `video_path IS NULL OR video_path = ''` (그 사이 파이프라인이 저장했으면 쓰지 않음 — '' 는 NULL 과 같이 '비어 있음', REV-050 F6)
// - 진행 중 분석 잡(long_video_jobs queued/running)이 있는 행은 건너뛴다(처리 직전에 다시 확인).
// - 영상: ytdlp.downloadVideo(파이프라인과 같은 포맷 지정·YTDLP_BIN)로 /tmp 임시 폴더에 받고 → ffprobe 길이가
//   DB duration_sec 의 ±5% 인지(엉뚱한 영상 방지) → H.264+AAC 인지 → pipeline.persistVideo(임시 이름 → rename) → video_path.
//   임시 폴더는 어떤 경로로 끝나도 지운다.
// - 썸네일: DB 의 thumb_url(유튜브 주소)을 longVideoThumb.persistThumbnail 로 받는다(허용목록·https·리다이렉트 거부·5MB·15초·매직 바이트).
// - --restore 는 지금 값이 이 스크립트가 쓴 값 그대로인 칸만 백업 값으로 되돌리고, **이 스크립트가 만든 파일**(백업의
//   created_files, sha256 이 그대로인 것)만 지운다. 이미 있던 파일(예: id 74 의 video.mp4)은 건드리지 않는다.
//   분류 뒤 apply 직전에 행마다 진행 중 잡과 파일 서명(ino·size·mtime)을 다시 보고, 바뀌었으면 그 칸은 값·파일을 유지한다.
//   지울 때마다 백업을 갱신하므로 중간에 끊겨도 다시 돌리면 남은 파일만 지운다(REV-050 F2·F4).
//   종료 코드: 0 완료 · 1 실패 · 2 인자 오류 · 3 restore 미완료(분류 뒤 바뀌어 유지한 칸이 남음, 끝 줄의 N 확인).
// - 잠금은 --backup-dir 와 무관한 ~/.local/share/bjj-backups/.task-050-user<id>.lock 하나(죽은 pid 잠금은 자동 회수, F3·F7).
//   회수는 <잠금>.recover 폴더로 상호배제한다(REV-050-2 N1) — 회수 중 비정상 종료로 이 폴더가 남으면 안내대로 rmdir.
//   백업 파일의 경로는 users/<uid>/long-videos/<id>/(thumb.*|video.mp4) 꼴만 받는다(변조된 백업으로 다른 파일을 못 지우게).
// 🔴 개발·운영이 같은 DB·NAS 다. 운영 사용자(user 3) 적용은 배포 뒤 Leader 가 dry-run 을 확인하고 --apply.
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const BACKEND = path.join(__dirname, '..');
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env'), quiet: true });

const TASK = 'task-050';
const LENGTH_TOLERANCE = 0.05;                 // ffprobe 길이 vs DB duration_sec
const TMP_MIN_FREE_BYTES = 3 * 1024 * 1024 * 1024; // ytdlp.checkFreeDiskSpace 기본값과 같다
const NAS_MARGIN_BYTES = 1024 * 1024 * 1024;   // persistVideo 의 저장 후 여유(1GB)와 같다
const COLUMNS = { thumb_url: 'thumb_url', video_path: 'video_path' }; // UPDATE 에 쓰는 칸 이름은 이 표에서만 꺼낸다
const FILE_BASENAME_RE = /^(thumb\.(jpg|webp|png)|video\.mp4)$/;

// ── 인자 ────────────────────────────────────────────────────────────────
function parseIdList(flag, v) {
  if (v === undefined || v === '' || String(v).startsWith('--')) throw new Error(`${flag} <id[,id...]> 값이 필요합니다`);
  const parts = String(v).split(',').map(s => s.trim());
  if (parts.some(p => !/^\d+$/.test(p))) throw new Error(`${flag} 는 양의 정수 목록이어야 합니다(${JSON.stringify(v)})`);
  const ids = parts.map(Number);
  if (ids.some(n => !Number.isSafeInteger(n) || n <= 0)) throw new Error(`${flag} 는 양의 정수 목록이어야 합니다(${JSON.stringify(v)})`);
  return ids;
}

function parseArgs(argv) {
  const a = {
    user: null, apply: false, restore: null, only: null, skipVideoIds: new Set(), allowNonH264: false,
    backupDir: path.join(os.homedir(), '.local', 'share', 'bjj-backups'),
  };
  let sawOnly = false, sawSkip = false, sawUser = false;
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--user') {
      // REV-050 F5: 반복 지정(--user 3 --user 4)은 마지막 값을 조용히 쓰지 않고 거부한다(운영 명령 조립 실수 방지)
      if (sawUser) throw new Error('--user 는 한 번만 지정합니다');
      sawUser = true;
      a.user = argv[++i];
    }
    else if (v === '--apply') a.apply = true;
    else if (v === '--dry-run') a.apply = false;
    else if (v === '--restore') {
      a.restore = argv[++i];
      if (a.restore === undefined || a.restore === '' || a.restore.startsWith('--')) throw new Error('--restore <백업 파일> 경로가 필요합니다');
    } else if (v === '--only') { sawOnly = true; a.only = new Set([...(a.only || []), ...parseIdList('--only', argv[++i])]); }
    else if (v === '--skip-video-ids') { sawSkip = true; for (const id of parseIdList('--skip-video-ids', argv[++i])) a.skipVideoIds.add(id); }
    else if (v === '--allow-non-h264') a.allowNonH264 = true;
    else if (v === '--backup-dir') {
      a.backupDir = argv[++i];
      if (a.backupDir === undefined || a.backupDir === '' || a.backupDir.startsWith('--')) throw new Error('--backup-dir <폴더> 가 필요합니다');
    } else throw new Error(`모르는 인자: ${v}`);
  }
  if (a.user === null || a.user === undefined || !/^\d+$/.test(String(a.user))) throw new Error('--user <양의 정수> 가 필요합니다');
  const uid = Number(a.user);
  if (!Number.isSafeInteger(uid) || uid <= 0) throw new Error('--user <양의 정수> 가 필요합니다');
  a.user = uid;
  if (a.restore && (sawOnly || sawSkip || a.allowNonH264)) {
    throw new Error('--restore 는 --only·--skip-video-ids·--allow-non-h264 와 같이 쓰지 않습니다(백업에 적힌 것만 되돌린다)');
  }
  a.backupDir = path.resolve(String(a.backupDir).replace(/^~(?=$|\/)/, os.homedir()));
  return a;
}

// ── 작은 도구 ──────────────────────────────────────────────────────────
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
const show = v => (v === null || v === undefined || v === '' ? '(빈 값)' : String(v));
// yt-dlp 오류는 stderr 전체(여러 줄 — 앞에 'Deprecated Feature: … Python 3.10 …' 경고가 붙는다)라 계획표·결과 한 줄을 깨뜨리고
// 진짜 원인이 잘린다(2026-10-08 실측). 'ERROR:' 줄을 우선, 없으면 경고가 아닌 줄들을 ' / ' 로 이어 한 줄로 보여 준다.
function oneLine(msg, max = 160) {
  const lines = String(msg ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const nonWarn = lines.filter(l => !/^(\S+: )?(WARNING|Deprecated Feature)/i.test(l));
  const pick = lines.find(l => /(^|\s)ERROR:/.test(l)) || (nonWarn.length ? nonWarn : lines).join(' / ');
  return pick.replace(/\s+/g, ' ').slice(0, max);
}
const mmss = s => { const n = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const mb = b => (b == null ? '?' : `${(b / 1024 / 1024).toFixed(1)}MB`);
const gb = b => (b == null ? '?' : `${(b / 1024 / 1024 / 1024).toFixed(1)}GB`);

function makeLogger(file) {
  let fd = null;
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fd = fs.openSync(file, 'a', 0o600);
  }
  const line = (stream, s) => {
    const text = String(s);
    stream.write(text + '\n');
    if (fd != null) fs.writeSync(fd, text + '\n');
  };
  return {
    file,
    info: s => line(process.stdout, s),
    warn: s => line(process.stderr, s),
    close: () => { if (fd != null) { fs.closeSync(fd); fd = null; } },
  };
}

async function sha256File(file) {
  const h = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', resolve).on('error', reject);
  });
  return h.digest('hex');
}

// 대상 폴더가 아직 없을 수 있어 존재하는 가장 가까운 상위 폴더 기준(pipeline.freeBytesNear 와 같은 규칙). 실패 → null
async function freeBytesNear(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    try { const st = await fsp.statfs(cur); return st.bavail * st.bsize; } catch (e) {
      const parent = path.dirname(cur);
      if (e.code !== 'ENOENT' || parent === cur) return null;
      cur = parent;
    }
  }
}

function execFileP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) { err.message = `${path.basename(cmd)}: ${(String(stderr || '').trim() || err.message).slice(0, 300)}`; return reject(err); }
      resolve(String(stdout));
    });
  });
}

/** ffprobe → { durationSec, vcodec, acodec } */
async function ffprobeMedia(file) {
  const out = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', file],
    { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const j = JSON.parse(out);
  const streams = Array.isArray(j.streams) ? j.streams : [];
  return {
    durationSec: Number(j.format?.duration),
    vcodec: streams.find(s => s.codec_type === 'video')?.codec_name || null,
    acodec: streams.find(s => s.codec_type === 'audio')?.codec_name || null,
  };
}

// 대상 폴더(users/<uid>/long-videos/<id>)에 이미 있는 파일 — 계획표 표시용, 읽기 전용(readdir·stat 만)
function folderSummary(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch (e) { return e.code === 'ENOENT' ? '(폴더 없음)' : `(확인 실패 ${e.code})`; }
  if (!names.length) return '(빈 폴더)';
  return names.sort().map(n => {
    try { const st = fs.statSync(path.join(dir, n)); return st.isFile() ? `${n} ${mb(st.size)}` : `${n}/`; } catch { return n; }
  }).join(', ');
}

function lengthOk(probeSec, dbSec) {
  return Number.isFinite(probeSec) && dbSec > 0 && Math.abs(probeSec - dbSec) <= dbSec * LENGTH_TOLERANCE;
}
const isH264Aac = (vcodec, acodec) => vcodec === 'h264' && acodec === 'aac';

// ── 기본 의존성(하네스가 일부를 바꿔 끼운다) ──────────────────────────────
function defaultDeps() {
  const { sequelize } = require(path.join(BACKEND, 'src', 'models'));
  const ytdlp = require(path.join(BACKEND, 'src', 'services', 'ytdlp'));
  const pipeline = require(path.join(BACKEND, 'src', 'services', 'longVideoPipeline'));
  const thumb = require(path.join(BACKEND, 'src', 'services', 'longVideoThumb'));
  const storage = require(path.join(BACKEND, 'src', 'services', 'storage'));
  return {
    sequelize,
    storage,
    fetchMeta: url => ytdlp.fetchMeta(url),
    // dry-run 전용: 실제 다운로드와 같은 포맷 지정으로 어떤 코덱·크기를 받게 될지만 본다(-J --skip-download, 쓰기 없음)
    probeFormat: async (url) => {
      const out = await execFileP(ytdlp.YTDLP_BIN, ['-J', '--skip-download', '--no-warnings', '-f', ytdlp.DOWNLOAD_FORMAT, url],
        { timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
      const j = JSON.parse(out);
      const fmts = Array.isArray(j.requested_formats) && j.requested_formats.length ? j.requested_formats : [j];
      const v = fmts.find(f => f.vcodec && f.vcodec !== 'none') || {};
      const au = fmts.find(f => f.acodec && f.acodec !== 'none') || {};
      const bytes = fmts.reduce((s, f) => s + (Number(f.filesize || f.filesize_approx) || 0), 0) || null;
      // 오디오 언어 — 여러 오디오 트랙(140-0/140-1…)이 있는 영상은 yt-dlp 가 원어(default) 트랙을 고르는지 계획표에서 보이게 한다
      const alang = au.language ? `${au.language}${/original|default/i.test(au.format_note || '') ? ' 원어' : ''}` : null;
      return { formatId: j.format_id || fmts.map(f => f.format_id).join('+'), vcodec: v.vcodec || null, acodec: au.acodec || null, alang, height: v.height || null, bytes };
    },
    probeThumb: url => thumb.probeThumbnail(url),
    downloadVideo: (url, dir, opts) => ytdlp.downloadVideo(url, dir, opts),
    persistVideo: (src, uid, vid, opts) => pipeline.persistVideo(src, uid, vid, opts),
    persistThumbnail: (url, uid, vid, opts) => thumb.persistThumbnail(url, uid, vid, opts),
    isServerThumbUrl: v => thumb.isServerThumbUrl(v),
    checkThumbUrl: v => thumb.checkThumbUrl(v),
    ffprobe: ffprobeMedia,
    tmpRoot: '/tmp',
    hooks: {},              // 하네스 전용: beforeThumbUpdate(id) · beforeVideoUpdate(id) — 경합 재현
    isAborting: () => false,
  };
}

// ── DB ──────────────────────────────────────────────────────────────────
async function selectRows(db, sql, replacements) {
  return db.query(sql, { replacements, type: db.QueryTypes.SELECT });
}
async function execWrite(db, sql, replacements) {
  const [res] = await db.query(sql, { replacements });
  return res; // mysql2 ResultSetHeader (affectedRows = 조건에 맞은 행 수)
}

const ROW_COLS = `id, user_id, url, video_id, title, duration_sec, thumb_url, video_path, status,
  DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at`;

async function loadRows(db, user, ids = null) {
  if (ids && !ids.length) return [];
  return ids
    ? selectRows(db, `SELECT ${ROW_COLS} FROM long_videos WHERE user_id = ? AND id IN (?) ORDER BY id`, [user, ids])
    : selectRows(db, `SELECT ${ROW_COLS} FROM long_videos WHERE user_id = ? ORDER BY id`, [user]);
}
async function loadRow(db, user, id) {
  const [r] = await selectRows(db, `SELECT ${ROW_COLS} FROM long_videos WHERE id = ? AND user_id = ? LIMIT 1`, [id, user]);
  return r || null;
}
async function activeJobVideoIds(db, ids) {
  if (!ids.length) return new Set();
  const rows = await selectRows(db,
    `SELECT DISTINCT long_video_id FROM long_video_jobs WHERE long_video_id IN (?) AND status IN ('queued','running')`, [ids]);
  return new Set(rows.map(r => Number(r.long_video_id)));
}

// ── 계획 ────────────────────────────────────────────────────────────────
/** 행 하나의 계획(순수 계산). action: save | skip | fail */
function planRow(row, { skipVideoIds, activeIds, isServerThumbUrl, checkThumbUrl }) {
  const p = { id: row.id, active: activeIds.has(row.id), thumb: null, video: null };
  if (p.active) {
    p.thumb = { action: 'skip', why: '진행 중 분석 잡 있음' };
    p.video = { action: 'skip', why: '진행 중 분석 잡 있음' };
    return p;
  }
  if (isServerThumbUrl(row.thumb_url)) p.thumb = { action: 'skip', why: '이미 서버 경로' };
  else if (!row.thumb_url) p.thumb = { action: 'skip', why: 'thumb_url 없음' };
  else {
    const c = checkThumbUrl(row.thumb_url);
    p.thumb = c.ok ? { action: 'save' } : { action: 'fail', why: `허용되지 않는 썸네일 주소: ${c.reason}` };
  }
  if (row.video_path) p.video = { action: 'skip', why: '이미 video_path 있음' }; // '' 는 비어 있음(UPDATE 조건과 같게, REV-050 F6)
  else if (skipVideoIds.has(row.id)) p.video = { action: 'skip', why: '--skip-video-ids' };
  else if (!(Number(row.duration_sec) > 0)) p.video = { action: 'fail', why: 'DB duration_sec 없음 — 길이 검증 불가' };
  else p.video = { action: 'save' };
  return p;
}

// ── 백업 ────────────────────────────────────────────────────────────────
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// 잠금 (REV-050 F3·F7 / Codex C2 #3) — --backup-dir 와 무관한 고정 위치에 user 별 하나:
//   ~/.local/share/bjj-backups/.task-050-user<id>.lock   (테스트 격리용으로만 환경변수 BJJ_BACKFILL_LOCK_DIR 로 바꾼다)
// 내용은 "pid host ISO시각". 이미 있으면(EEXIST) 같은 host 이고 그 pid 가 죽었을 때(process.kill(pid,0) → ESRCH)만
// 죽은 잠금으로 보고 지운 뒤 한 번 다시 잡는다(터미널이 끊겨 SIGHUP/SIGKILL 로 죽은 실행의 잔재). 그 밖에는 거부한다.
// 이 잠금은 스크립트끼리만 막는다 — 웹 파이프라인과의 겹침은 조건부 UPDATE·restore 재확인이 맡는다.
function lockDirOf() {
  const fromEnv = String(process.env.BJJ_BACKFILL_LOCK_DIR || '').trim();
  return fromEnv ? path.resolve(fromEnv) : path.join(os.homedir(), '.local', 'share', 'bjj-backups');
}
function lockFileOf(user) { return path.join(lockDirOf(), `.${TASK}-user${user}.lock`); }

function acquireLock(user, hooks = {}) {
  const dir = lockDirOf();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = lockFileOf(user);
  const mine = `${process.pid} ${os.hostname()} ${new Date().toISOString()}\n`;
  const take = () => fs.writeFileSync(file, mine, { flag: 'wx', mode: 0o600 });
  let recovered = null;
  try {
    take();
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let holder = '';
    try { holder = fs.readFileSync(file, 'utf8').trim(); } catch { /* 그 사이 풀렸으면 아래 재읽기가 판단 */ }
    if (hooks.afterLockRead) hooks.afterLockRead(); // 테스트 전용(결정적 인터리빙) — 운영에서는 비어 있다
    const [pidStr, host] = holder.split(/\s+/);
    const pid = /^\d+$/.test(pidStr || '') ? Number(pidStr) : null;
    let dead = false;
    if (pid && host === os.hostname()) {
      try { process.kill(pid, 0); } catch (k) { dead = k.code === 'ESRCH'; }
    }
    if (!dead) throw new Error(`다른 실행이 잠금을 잡고 있습니다(${file}: ${holder || '내용 없음'}) — 그 실행이 끝나기를 기다리세요(다른 host 이거나 살아 있는 pid 면 자동으로 풀지 않음)`);
    // 회수 CAS (REV-050-2 N1 / Codex 2차 #1): 두 실행이 같은 죽은 잠금을 동시에 회수하면 둘 다 잠금을 쥐었다(30회 중 5회).
    //   (a) 회수 전용 guard 폴더를 비재귀 mkdir 로 잡고 (b) 그 안에서 잠금 파일을 다시 읽어 처음 본 holder 와 같을 때만
    //   (c) 지우고 wx 로 다시 만든다 (d) guard 는 finally 에서 지운다. rename 만으로는 부족하다(뒤 실행이 앞 실행의 새 잠금을 옮김).
    const guard = `${file}.recover`;
    try { fs.mkdirSync(guard, { mode: 0o700 }); } catch (g) {
      if (g.code === 'EEXIST') throw new Error(`다른 실행이 잠금을 회수 중입니다(${guard}) — 그 실행이 없는데 이 폴더가 남아 있으면(회수 중 비정상 종료 잔재) 확인 후 rmdir ${guard}`);
      throw g;
    }
    try {
      let again = null;
      try { again = fs.readFileSync(file, 'utf8').trim(); } catch { again = null; }
      if (again !== holder) throw new Error(`잠금을 회수하려는 사이 다른 실행이 먼저 잠갔거나 풀었습니다(${file}: ${again || '없음'}) — 다시 실행하세요`);
      fs.rmSync(file, { force: true });
      try { take(); } catch (e2) {
        if (e2.code === 'EEXIST') throw new Error(`잠금을 회수하려는 사이 다른 실행이 먼저 잠갔습니다(${file}) — 다시 실행하세요`);
        throw e2;
      }
      recovered = holder;
    } finally {
      try { fs.rmdirSync(guard); } catch { /* 이미 없음 */ }
    }
  }
  // 풀 때는 내 잠금일 때만 지운다(다른 실행이 죽은 잠금으로 보고 가져간 경우를 지우지 않게)
  const release = () => {
    try { if (fs.readFileSync(file, 'utf8') === mine) fs.rmSync(file, { force: true }); } catch { /* 이미 없음 */ }
  };
  release.file = file;
  release.recovered = recovered;
  return release;
}

// ── dry-run / apply ────────────────────────────────────────────────────
async function runBackfill(args, deps, log) {
  const { sequelize: db, storage } = deps;
  const all = await loadRows(db, args.user);
  const rows = args.only ? all.filter(r => args.only.has(r.id)) : all;
  const missingOnly = args.only ? [...args.only].filter(id => !all.some(r => r.id === id)) : [];
  const activeIds = await activeJobVideoIds(db, rows.map(r => r.id));
  const plans = new Map(rows.map(r => [r.id, planRow(r, { skipVideoIds: args.skipVideoIds, activeIds, isServerThumbUrl: deps.isServerThumbUrl, checkThumbUrl: deps.checkThumbUrl })]));

  const userDir = storage.getUserDir(String(args.user));
  const nasFree = await freeBytesNear(userDir);
  const tmpFree = await freeBytesNear(deps.tmpRoot);
  const videoRows = rows.filter(r => plans.get(r.id).video.action === 'save');
  const totalSec = videoRows.reduce((s, r) => s + (Number(r.duration_sec) || 0), 0);

  log.info(`# ${TASK} 영상분석 썸네일·영상 백필 — user ${args.user} · 행 ${rows.length}/${all.length} · DB ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  log.info(`# 모드: ${args.apply ? 'APPLY (행마다 독립, 순차)' : 'DRY-RUN (DB·NAS·/tmp 에 쓰지 않음)'}`);
  log.info(`# 옵션: skip-video-ids=[${[...args.skipVideoIds].join(',')}] only=${args.only ? `[${[...args.only].join(',')}]` : '(전체)'} allow-non-h264=${args.allowNonH264}`);
  log.info(`# NAS 여유(${userDir}) ${gb(nasFree)} · /tmp 여유 ${gb(tmpFree)} · 받을 영상 ${videoRows.length}건 합계 ${mmss(totalSec)} (${totalSec}초)`);
  if (missingOnly.length) log.info(`# --only 중 이 사용자에게 없는 id: ${missingOnly.join(',')}`);
  log.info('');

  // 계획표 — dry-run 은 원격 확인(메타·포맷·썸네일 HEAD)까지 한다(읽기 전용)
  log.info('## 계획표 (id · video_id · DB 길이 · 썸네일 · 영상 · 원격 확인)');
  let predictedBytes = 0, predictedUnknown = 0;
  for (const r of rows) {
    const p = plans.get(r.id);
    const tPlan = p.thumb.action === 'save' ? '저장' : `${p.thumb.action === 'fail' ? '실패예정' : '건너뜀'}(${p.thumb.why})`;
    const vPlan = p.video.action === 'save' ? `받기·저장(${mmss(r.duration_sec)})` : `${p.video.action === 'fail' ? '실패예정' : '건너뜀'}(${p.video.why})`;
    let remote = '';
    if (!args.apply) {
      const bits = [];
      if (p.video.action === 'save') {
        try {
          const m = await deps.fetchMeta(r.url);
          const okLen = lengthOk(m.durationSec, Number(r.duration_sec));
          bits.push(`메타 OK(${mmss(m.durationSec)}${okLen ? '' : ` ≠ DB ${mmss(r.duration_sec)} → 길이 검증 실패 예상`})`);
        } catch (e) { bits.push(`메타 실패(${oneLine(e.message, 140)}) → 영상 실패 예상`); }
        try {
          const f = await deps.probeFormat(r.url);
          const h264 = String(f.vcodec || '').startsWith('avc1') && String(f.acodec || '').startsWith('mp4a');
          bits.push(`포맷 ${f.formatId} ${f.vcodec}/${f.acodec}${f.alang ? `[${f.alang}]` : ''} ${f.height || '?'}p ${mb(f.bytes)}${h264 ? '' : (args.allowNonH264 ? ' (비 H.264 — 허용됨)' : ' → H.264+AAC 아님, 저장 거부 예상')}`);
          if (f.bytes) predictedBytes += f.bytes; else predictedUnknown++;
        } catch (e) { bits.push(`포맷 확인 실패(${oneLine(e.message, 140)})`); predictedUnknown++; }
      }
      if (p.thumb.action === 'save') {
        const h = await deps.probeThumb(r.thumb_url);
        bits.push(h.ok ? `썸네일 HEAD 200 ${h.contentType || '?'} ${h.contentLength ?? '?'}B` : `썸네일 HEAD 실패(${h.reason}) → 썸네일 실패 예상`);
      }
      remote = bits.join(' · ');
    }
    log.info(`  ${r.id}\t${r.video_id}\t${mmss(r.duration_sec)}\t썸네일:${tPlan}\t영상:${vPlan}${remote ? `\t${remote}` : ''}`);
    log.info(`  \t  현재 thumb_url=${show(r.thumb_url)} · video_path=${show(r.video_path)} · updated_at=${r.updated_at} · 기존: ${folderSummary(storage.getLongVideoDir(args.user, r.id))}`);
  }
  const nT = rows.filter(r => plans.get(r.id).thumb.action === 'save').length;
  log.info(`\n## 요약: 썸네일 저장 ${nT}건 · 영상 저장 ${videoRows.length}건(합계 ${mmss(totalSec)})`);

  if (!args.apply) {
    if (videoRows.length) {
      const need = predictedBytes + NAS_MARGIN_BYTES;
      log.info(`## 예상 영상 크기 합계 ${mb(predictedBytes)}${predictedUnknown ? ` (+ 크기 모름 ${predictedUnknown}건)` : ''} · NAS 필요(+1GB 여유) ${gb(need)} / 여유 ${gb(nasFree)}${nasFree != null && nasFree < need ? ' 🔴 부족' : ''}`);
      log.info(`## /tmp: 영상 1건씩 받고 지운다 — 건마다 3GB 여유 필요 / 지금 ${gb(tmpFree)}${tmpFree != null && tmpFree < TMP_MIN_FREE_BYTES ? ' 🔴 부족' : ''}`);
    }
    log.info('\nDRY-RUN — DB·NAS·/tmp 에 쓰지 않았습니다. 적용하려면 --apply 를 붙이세요.');
    return 0;
  }

  const targets = rows.filter(r => { const p = plans.get(r.id); return p.thumb.action === 'save' || p.video.action === 'save'; });
  const plannedFails = [];
  for (const r of rows) {
    const p = plans.get(r.id);
    if (p.thumb.action === 'fail') plannedFails.push(`${r.id} 썸네일: ${p.thumb.why}`);
    if (p.video.action === 'fail') plannedFails.push(`${r.id} 영상: ${p.video.why}`);
  }
  if (!targets.length) {
    log.info('\n할 일이 없어 아무것도 쓰지 않았습니다(백업 파일도 만들지 않음).');
    for (const f of plannedFails) log.warn(`  실패(계획 단계) ${f}`);
    return plannedFails.length ? 1 : 0;
  }

  // 1) 백업 먼저 — 어떤 쓰기보다 앞서 디스크에 있어야 한다
  fs.mkdirSync(args.backupDir, { recursive: true, mode: 0o700 });
  const backupFile = path.join(args.backupDir, `${TASK}-${stamp()}-user${args.user}.json`);
  const backup = {
    task: TASK, kind: 'long_videos thumb_url/video_path backfill', version: 1,
    created_at: new Date().toISOString(), db: process.env.DB_NAME, host: process.env.DB_HOST, user_id: args.user,
    args: { skipVideoIds: [...args.skipVideoIds], only: args.only ? [...args.only] : null, allowNonH264: args.allowNonH264 },
    status: 'running',
    rows: targets.map(r => ({ id: r.id, video_id: r.video_id, before: { thumb_url: r.thumb_url, video_path: r.video_path, updated_at: r.updated_at } })),
    writes: [],         // { id, column, before, after, applied: 'pending'|true|false }
    created_files: [],  // { id, column, path, web_path, sha256, bytes, removed? }
    created_dirs: [],   // 이번 실행이 만든 users/<uid>/long-videos/<id>
  };
  const flush = () => writeJsonAtomic(backupFile, backup);
  flush();
  log.info(`\n백업: ${backupFile} (대상 ${targets.length}행)`);

  const results = [];
  for (const r of targets) {
    if (deps.isAborting()) { log.warn(`중단 신호 — id ${r.id} 부터 처리하지 않습니다`); break; }
    const p = plans.get(r.id);
    const label = a => (a.action === 'fail' ? `실패(${a.why})` : `건너뜀(${a.why})`);
    const res = { id: r.id, thumb: p.thumb.action === 'save' ? null : label(p.thumb), video: p.video.action === 'save' ? null : label(p.video) };
    results.push(res);
    log.info(`\n── id ${r.id} (${r.video_id}) ──`);
    if (p.thumb.action === 'save') res.thumb = await backfillThumb(r, args, deps, log, backup, flush);
    if (p.video.action === 'save') {
      if (deps.isAborting()) res.video = '중단(처리 안 함)';
      else res.video = await backfillVideo(r, args, deps, log, backup, flush);
    }
  }

  backup.status = deps.isAborting() ? 'aborted' : 'finished';
  backup.finished_at = new Date().toISOString();
  flush();

  // 2) 결과 + 재조회 확인(값·updated_at 보존)
  log.info('\n## 결과');
  const post = new Map((await loadRows(db, args.user, targets.map(r => r.id))).map(x => [x.id, x]));
  let failed = 0;
  for (const res of results) {
    const before = targets.find(t => t.id === res.id);
    const now = post.get(res.id);
    const keptTs = now && now.updated_at === before.updated_at;
    const bad = [res.thumb, res.video].filter(x => typeof x === 'string' && x.startsWith('실패')).length;
    failed += bad;
    log.info(`  ${res.id}\t썸네일: ${res.thumb}\t영상: ${res.video}`);
    log.info(`  \t  → thumb_url=${show(now?.thumb_url)} · video_path=${show(now?.video_path)} · updated_at ${now ? (keptTs ? `그대로(${now.updated_at})` : `🔴 바뀜 ${before.updated_at} → ${now.updated_at}`) : '(행 없음)'}`);
  }
  // 처리 대상(저장할 것이 있는 행)에 안 들어간 행의 계획 단계 실패(예: 썸네일 주소 불허 + 영상 건너뜀)
  for (const r of rows) {
    if (targets.includes(r)) continue;
    const p = plans.get(r.id);
    for (const [k, a] of [['썸네일', p.thumb], ['영상', p.video]]) {
      if (a.action === 'fail') { failed++; log.info(`  ${r.id}\t${k}: 실패(${a.why})`); }
    }
  }
  log.info(`\nAPPLY 끝 — 실패 ${failed}건. 백업: ${backupFile}`);
  log.info(`되돌리기(dry-run 먼저): node ${__filename} --user ${args.user} --restore ${backupFile}`);
  return failed ? 1 : 0;
}

// 썸네일 1행. 반환: 결과 문구('저장 …' | '실패 …' | '건너뜀 …')
async function backfillThumb(r, args, deps, log, backup, flush) {
  const { sequelize: db, storage } = deps;
  try {
    const active = await activeJobVideoIds(db, [r.id]);
    if (active.has(r.id)) return '건너뜀(진행 중 분석 잡 — 처리 직전 확인)';
    const dir = storage.getLongVideoDir(args.user, r.id);
    const dirExisted = fs.existsSync(dir);
    const preexisting = new Set(dirExisted ? fs.readdirSync(dir).filter(n => /^thumb\.(jpg|webp|png)$/.test(n)) : []);
    let writeEntry = null;
    const out = await deps.persistThumbnail(r.thumb_url, args.user, r.id, {
      ...(deps.thumbOpts || {}),
      commit: async (webPath) => {
        const file = path.join(dir, path.basename(webPath));
        if (!preexisting.has(path.basename(webPath))) {
          const st = fs.statSync(file);
          backup.created_files.push({ id: r.id, column: 'thumb_url', path: file, web_path: webPath, sha256: await sha256File(file), bytes: st.size });
        }
        if (!dirExisted && !backup.created_dirs.includes(dir)) backup.created_dirs.push(dir);
        writeEntry = { id: r.id, column: 'thumb_url', before: r.thumb_url, after: webPath, applied: 'pending' };
        backup.writes.push(writeEntry);
        flush(); // 🔴 UPDATE 전에 — 여기서 죽어도 restore 가 이 값·파일을 안다
        if (deps.hooks.beforeThumbUpdate) await deps.hooks.beforeThumbUpdate(r.id);
        const u = await execWrite(db,
          'UPDATE long_videos SET thumb_url = ?, updated_at = updated_at WHERE id = ? AND user_id = ? AND thumb_url <=> ?',
          [webPath, r.id, args.user, r.thumb_url]);
        writeEntry.applied = u.affectedRows === 1;
        flush();
        if (u.affectedRows !== 1) throw new Error(`경합 — thumb_url 이 백업 시점 값과 달라 쓰지 않았습니다(영향 ${u.affectedRows}행)`);
      },
    });
    if (out.saved && out.recorded) {
      log.info(`  썸네일 저장: ${out.webPath} (${out.ext}, ${out.bytes} bytes)`);
      return `저장(${out.ext} ${out.bytes}B)`;
    }
    if (out.saved) {
      // 파일은 생겼지만 기록하지 못함 — 행이 그 파일을 가리키지 않으면 이번에 만든 파일을 되돌린다
      const now = await loadRow(db, args.user, r.id);
      const cf = backup.created_files.find(f => f.id === r.id && f.column === 'thumb_url' && f.web_path === out.webPath && !f.removed);
      if (cf && (!now || now.thumb_url !== out.webPath)) {
        fs.rmSync(cf.path, { force: true });
        cf.removed = 'apply-rollback';
        if (!dirExisted) { try { fs.rmdirSync(dir); } catch { /* 비어 있지 않음 */ } }
        flush();
      }
      log.warn(`  썸네일 실패: ${oneLine(out.reason, 300)}`);
      return `실패(${oneLine(out.reason, 300)})`;
    }
    log.warn(`  썸네일 실패: ${oneLine(out.reason, 300)}`);
    return `실패(${oneLine(out.reason, 300)})`;
  } catch (e) {
    log.warn(`  썸네일 실패(예외): ${oneLine(e.message, 300)}`);
    return `실패(예외: ${oneLine(e.message, 300)})`;
  }
}

// 영상 1행. 반환: 결과 문구
async function backfillVideo(r, args, deps, log, backup, flush) {
  const { sequelize: db, storage } = deps;
  let tmpDir = null;
  try {
    const active = await activeJobVideoIds(db, [r.id]);
    if (active.has(r.id)) return '건너뜀(진행 중 분석 잡 — 처리 직전 확인)';
    const fresh = await loadRow(db, args.user, r.id);
    if (!fresh) return '실패(행이 없어졌습니다)';
    if (fresh.video_path) return `건너뜀(그 사이 video_path 생김: ${fresh.video_path})`;
    const tmpFree = await freeBytesNear(deps.tmpRoot);
    if (tmpFree != null && tmpFree < TMP_MIN_FREE_BYTES) return `실패(/tmp 여유 부족 ${gb(tmpFree)} < 3GB)`;

    tmpDir = await fsp.mkdtemp(path.join(deps.tmpRoot, 'bjj-bf050-'));
    log.info(`  영상 받는 중 → ${tmpDir}`);
    let lastPct = -1;
    const src = await deps.downloadVideo(r.url, tmpDir, {
      onProgress: (chunk) => {
        const m = /(\d{1,3})\.\d%/.exec(chunk);
        if (!m) return;
        const pct = Number(m[1]);
        if (pct >= lastPct + 25 || (pct === 100 && lastPct !== 100)) { lastPct = pct; log.info(`    다운로드 ${pct}%`); }
      },
      cancelCheck: async () => deps.isAborting(),
    });
    const probe = await deps.ffprobe(src);
    const dbSec = Number(r.duration_sec);
    log.info(`  받음: ${path.basename(src)} ${mb(fs.statSync(src).size)} · 길이 ${probe.durationSec?.toFixed?.(1)}초(DB ${dbSec}초) · ${probe.vcodec}/${probe.acodec}`);
    if (!lengthOk(probe.durationSec, dbSec)) {
      return `실패(길이 불일치 — 받은 영상 ${Number(probe.durationSec).toFixed(1)}초 vs DB ${dbSec}초, 허용 ±${LENGTH_TOLERANCE * 100}%)`;
    }
    if (!isH264Aac(probe.vcodec, probe.acodec) && !args.allowNonH264) {
      return `실패(코덱 ${probe.vcodec}/${probe.acodec} — H.264+AAC 아님, 저장·연결 안 함. 허용하려면 --allow-non-h264)`;
    }
    if (deps.isAborting()) return '중단(저장 안 함)';

    // 저장 직전 다시 확인 — 그 사이 분석 잡이 시작됐거나 video_path 가 생겼으면 손대지 않는다
    if ((await activeJobVideoIds(db, [r.id])).has(r.id)) return '건너뜀(진행 중 분석 잡 — 저장 직전 확인)';
    const again = await loadRow(db, args.user, r.id);
    if (!again) return '실패(행이 없어졌습니다)';
    if (again.video_path) return `건너뜀(그 사이 video_path 생김: ${again.video_path})`;

    const dir = storage.getLongVideoDir(args.user, r.id);
    const dirExisted = fs.existsSync(dir);
    const fileExisted = fs.existsSync(path.join(dir, 'video.mp4'));
    const saved = await deps.persistVideo(src, args.user, r.id, { jobId: `bf050-${process.pid}`, cancelCheck: async () => deps.isAborting() });
    if (!saved.saved) return `실패(저장: ${oneLine(saved.reason, 300)})`;

    // 저장 뒤 행 확인 — 행이 없으면(삭제) 라우트의 폴더 정리가 이미 지나갔으므로 여기서 지운다(파이프라인 S3.5 와 같은 규칙)
    const afterSave = await loadRow(db, args.user, r.id);
    if (!afterSave) {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
      return '실패(저장 중 행이 삭제됨 — 폴더 정리)';
    }
    if (!fileExisted) {
      backup.created_files.push({ id: r.id, column: 'video_path', path: saved.filePath, web_path: saved.webPath, sha256: await sha256File(saved.filePath), bytes: saved.bytes });
    }
    if (!dirExisted && !backup.created_dirs.includes(dir)) backup.created_dirs.push(dir);
    const w = { id: r.id, column: 'video_path', before: again.video_path ?? null, after: saved.webPath, applied: 'pending' };
    backup.writes.push(w);
    flush(); // 🔴 UPDATE 전에
    if (deps.hooks.beforeVideoUpdate) await deps.hooks.beforeVideoUpdate(r.id);
    const u = await execWrite(db,
      "UPDATE long_videos SET video_path = ?, updated_at = updated_at WHERE id = ? AND user_id = ? AND (video_path IS NULL OR video_path = '')",
      [saved.webPath, r.id, args.user]);
    w.applied = u.affectedRows === 1;
    flush();
    if (u.affectedRows !== 1) {
      const now = await loadRow(db, args.user, r.id);
      const cf = backup.created_files.find(f => f.id === r.id && f.column === 'video_path' && !f.removed);
      if (now && now.video_path === saved.webPath) {
        return `건너뜀(경합 — 그 사이 다른 갱신이 같은 video_path 를 기록, 파일 유지)`;
      }
      if (cf) {
        fs.rmSync(cf.path, { force: true });
        cf.removed = 'apply-rollback';
        if (!dirExisted) { try { fs.rmdirSync(dir); } catch { /* 비어 있지 않음 */ } }
        flush();
      }
      return `실패(경합 — video_path 가 이미 ${show(now?.video_path)}, 이번에 만든 파일은 지움)`;
    }
    log.info(`  영상 저장: ${saved.webPath} (${mb(saved.bytes)}${saved.remuxed ? ', mp4 재포장' : ''})`);
    return `저장(${mb(saved.bytes)})`;
  } catch (e) {
    if (deps.isAborting()) { log.warn(`  영상 중단: ${oneLine(e.message)}`); return '중단(저장 안 함)'; }
    log.warn(`  영상 실패(예외): ${oneLine(e.message, 300)}`);
    return `실패(${oneLine(e.message, 300)})`;
  } finally {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── restore ─────────────────────────────────────────────────────────────
/** 백업 파일 읽기·검사 — DB 에 붙기 **전에** 한다. 경로는 users/<uid>/long-videos/<id>/ 아래 정해진 이름만 받는다. */
function loadBackup(args, storage) {
  const file = path.resolve(String(args.restore).replace(/^~(?=$|\/)/, os.homedir()));
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (backup.task !== TASK || !Array.isArray(backup.rows) || !Array.isArray(backup.writes) || !Array.isArray(backup.created_files)) {
    throw new Error(`${TASK} 백업 파일이 아닙니다`);
  }
  if (Number(backup.user_id) !== args.user) throw new Error(`백업은 user ${backup.user_id} 것 — --user ${args.user} 와 다릅니다`);
  if (backup.db && process.env.DB_NAME && backup.db !== process.env.DB_NAME) throw new Error(`백업 DB(${backup.db})가 지금 DB(${process.env.DB_NAME})와 다릅니다`);
  const rowIds = new Set(backup.rows.map(r => Number(r.id)));
  for (const w of backup.writes) {
    if (!Number.isSafeInteger(Number(w.id)) || !rowIds.has(Number(w.id))) throw new Error(`writes 의 id 가 올바르지 않습니다(${w.id})`);
    if (!Object.prototype.hasOwnProperty.call(COLUMNS, w.column)) throw new Error(`writes 의 칸 이름이 올바르지 않습니다(${w.column})`);
  }
  for (const f of backup.created_files) {
    const id = Number(f.id);
    if (!rowIds.has(id) || !Object.prototype.hasOwnProperty.call(COLUMNS, f.column)) throw new Error(`created_files 항목이 올바르지 않습니다(${f.id}/${f.column})`);
    const dir = storage.getLongVideoDir(args.user, id);
    const base = path.basename(String(f.path || ''));
    if (!FILE_BASENAME_RE.test(base) || path.resolve(String(f.path)) !== path.join(dir, base)) {
      throw new Error(`created_files 경로가 허용 범위 밖입니다(${f.path})`);
    }
    if (!/^[0-9a-f]{64}$/.test(String(f.sha256 || ''))) throw new Error(`created_files sha256 이 없습니다(${f.path})`);
  }
  for (const d of backup.created_dirs || []) {
    const ok = backup.rows.some(r => path.resolve(String(d)) === storage.getLongVideoDir(args.user, Number(r.id)));
    if (!ok) throw new Error(`created_dirs 경로가 허용 범위 밖입니다(${d})`);
  }
  return { file, backup };
}

// 파일 서명(ino·size·mtimeMs) — 분류 때 sha256 과 함께 잡아 두고 apply 직전·직후에는 stat 만 다시 본다
// (해시를 다시 읽지 않는다 — 영상은 NFS 에서 수십 MB 라 restore 시간이 늘어난다, REV-050 F2).
function statSig(p) {
  try { const st = fs.statSync(p); return st.isFile() ? `${st.ino}:${st.size}:${st.mtimeMs}` : null; } catch { return null; }
}
// 해시 + 서명. 해시를 읽는 동안 파일이 바뀌었으면(앞뒤 서명이 다름) 'changed' 로 본다.
async function fileIdentity(p, sha) {
  const before = statSig(p);
  if (!before) return { state: 'missing' };
  const h = await sha256File(p).catch(() => null);
  if (!h || statSig(p) !== before) return { state: 'changed' };
  return h === sha ? { state: 'same', sig: before } : { state: 'changed' };
}

async function runRestore(args, deps, log, { file, backup }) {
  const { sequelize: db } = deps;
  const hooks = deps.hooks || {};
  const flush = () => writeJsonAtomic(file, backup);
  const ids = [...new Set(backup.rows.map(r => Number(r.id)))];
  const cur = new Map((await loadRows(db, args.user, ids)).map(r => [r.id, r]));
  const activeIds = await activeJobVideoIds(db, ids);

  // 칸(write)마다: 지금 값 == 스크립트가 쓴 값이고 파일이 스크립트가 만든 그대로면 → 되돌림 + 파일 삭제
  const todo = [], conflict = [], already = [], skipped = [];
  const claimed = new Set(); // todo 가 지울 파일
  const keep = new Set();    // 지우면 안 되는 파일(충돌·진행 중 잡)
  for (const w of backup.writes) {
    if (w.applied === false) continue; // 쓰지 못한 칸(경합) — 되돌릴 것이 없다
    const row = cur.get(Number(w.id));
    const cf = backup.created_files.find(f => Number(f.id) === Number(w.id) && f.column === w.column && f.web_path === w.after && !f.removed);
    if (!row) { skipped.push({ w, why: '행 없음(삭제됨)' }); continue; } // 파일은 아래 고아 후보로 본다
    if (activeIds.has(row.id)) { skipped.push({ w, why: '진행 중 분석 잡 있음 — 다음에 다시' }); if (cf) keep.add(cf); continue; }
    const now = row[w.column];
    // F4: 지난 restore 가 UPDATE 뒤 rm 전에 끊겼거나 rm 이 실패했으면 값은 이미 원복돼 있다 → 파일은 아래 고아 후보로 회수
    if (now === w.before || (now == null && w.before == null)) { already.push({ w }); continue; }
    if (now !== w.after) { conflict.push({ w, why: `지금 값이 백필 뒤에 바뀜(${show(now)})` }); if (cf) keep.add(cf); continue; }
    let fid = { state: 'none' };
    if (cf) fid = await fileIdentity(cf.path, cf.sha256);
    if (fid.state === 'changed') { conflict.push({ w, why: '파일이 백필 뒤에 교체됨(앱이 다시 저장) — 값·파일 유지' }); keep.add(cf); continue; }
    if (fid.state === 'same') claimed.add(cf);
    todo.push({ w, cf: fid.state === 'same' ? cf : null, sig: fid.sig || null, fileState: fid.state });
  }
  // 고아 후보: 아직 안 지웠고 · todo·keep 이 아니고 · 진행 중 잡이 없고 · 지금 행이 가리키지 않고 · 해시가 같은 파일
  const orphans = [];
  for (const f of backup.created_files) {
    if (f.removed || claimed.has(f) || keep.has(f)) continue;
    const row = cur.get(Number(f.id));
    if (row && activeIds.has(row.id)) continue;
    if (row && row[f.column] === f.web_path) continue;
    const fid = await fileIdentity(f.path, f.sha256);
    if (fid.state === 'same') orphans.push({ f, sig: fid.sig });
  }

  log.info(`# ${TASK} 복원 — ${file}`);
  log.info(`# user ${args.user} · 백업 행 ${backup.rows.length} · 쓴 칸 ${backup.writes.length} · 만든 파일 ${backup.created_files.length} · 모드: ${args.apply ? 'APPLY' : 'DRY-RUN (쓰지 않음)'}\n`);
  log.info('## 되돌릴 칸 (id · 칸 · 지금 → 백업 값 · 지울 파일)');
  for (const t of todo) log.info(`  ${t.w.id}\t${t.w.column}\t${show(t.w.after)} → ${show(t.w.before)}\t${t.cf ? `파일 삭제 ${t.cf.path}` : (t.fileState === 'missing' ? '(파일 이미 없음)' : '(이 스크립트가 만든 파일 아님 — 유지)')}`);
  if (!todo.length) log.info('  (없음)');
  log.info(`\n## 이미 백업 값: ${already.length}칸`);
  log.info(`## 덮지 않음(충돌): ${conflict.length}칸`);
  for (const c of conflict) log.info(`  ${c.w.id}\t${c.w.column}\t${c.why}`);
  log.info(`## 건너뜀: ${skipped.length}칸`);
  for (const sk of skipped) log.info(`  ${sk.w.id}\t${sk.w.column}\t${sk.why}`);
  log.info(`## 남은 고아 파일(지움): ${orphans.length}개`);
  for (const o of orphans) log.info(`  ${o.f.id}\t${o.f.path}`);

  if (!args.apply) { log.info('\nDRY-RUN — DB·NAS 에 쓰지 않았습니다. 복원하려면 --apply 를 붙이세요.'); return 0; }

  // 삭제는 동기 — 호출 직전의 검사와 삭제 사이에 await 가 없다. 지울 때마다 backup 을 바로 flush 해,
  // 중간에 끊겨도 다음 restore 가 남은 파일만 정확히 지운다(F4).
  let bad = 0, late = 0, reverted = 0;
  const removeNow = (f, how) => {
    try { fs.rmSync(f.path, { force: true }); } catch (e) {
      log.warn(`  🔴 파일 삭제 실패(${e.code || e.message}) ${f.path} — 다시 restore 하면 고아 파일로 지운다`);
      return false;
    }
    f.removed = how;
    flush();
    return true;
  };
  for (const t of todo) {
    const id = Number(t.w.id);
    if (hooks.beforeRestoreRow) await hooks.beforeRestoreRow(id, t.w.column);
    // 행마다 직전 재확인(REV-050 F2 / Codex C2 #2): 분류 뒤에 분석 잡이 생겼거나 파일이 바뀌었으면 값·파일 유지
    if ((await activeJobVideoIds(db, [id])).has(id)) { log.warn(`  건너뜀 ${id}/${t.w.column} — 분류 뒤 진행 중 분석 잡이 생김(값·파일 유지, 나중에 다시)`); late++; continue; }
    if (t.cf && statSig(t.cf.path) !== t.sig) { log.warn(`  충돌 ${id}/${t.w.column} — 분류 뒤 파일이 바뀜(앱이 다시 저장, 값·파일 유지)`); late++; continue; }
    const col = COLUMNS[t.w.column];
    const u = await execWrite(db,
      `UPDATE long_videos SET ${col} = ?, updated_at = updated_at WHERE id = ? AND user_id = ? AND ${col} <=> ?`,
      [t.w.before ?? null, id, args.user, t.w.after]);
    if (u.affectedRows !== 1) { log.warn(`  🔴 ${id}/${t.w.column} 되돌리기 영향 ${u.affectedRows}행 — 그 사이 바뀜, 파일 유지`); bad++; continue; }
    reverted++;
    // 조건부 UPDATE 직후, await 없이: UPDATE 도중 파일이 교체됐으면(서명 다름) 지우지 않는다
    if (t.cf) {
      if (statSig(t.cf.path) !== t.sig) { log.warn(`  충돌 ${id}/${t.w.column} — 되돌리는 사이 파일이 바뀜(파일 유지)`); late++; }
      else if (!removeNow(t.cf, 'restore')) bad++;
    }
    log.info(`  되돌림 ${id}/${t.w.column}${t.cf && t.cf.removed ? ` · 파일 삭제 ${path.basename(t.cf.path)}` : ''}`);
  }
  for (const { f, sig } of orphans) {
    const id = Number(f.id);
    if (hooks.beforeRestoreRow) await hooks.beforeRestoreRow(id, `orphan:${f.column}`);
    if ((await activeJobVideoIds(db, [id])).has(id)) { log.warn(`  고아 파일 유지 ${f.path} — 진행 중 분석 잡이 생김`); late++; continue; }
    const row = await loadRow(db, args.user, id);
    if (row && row[f.column] === f.web_path) { log.warn(`  고아 파일 유지 ${f.path} — 이제 행이 이 파일을 가리킴`); late++; continue; }
    if (statSig(f.path) !== sig) { log.warn(`  고아 파일 유지 ${f.path} — 분류 뒤 파일이 바뀜`); late++; continue; }
    if (removeNow(f, 'restore-orphan')) log.info(`  고아 파일 삭제 ${f.path}`); else bad++;
  }
  for (const d of backup.created_dirs || []) {
    try { fs.rmdirSync(d); log.info(`  빈 폴더 삭제 ${d}`); } catch (e) { if (e.code !== 'ENOENT') log.info(`  폴더 유지(${e.code}) ${d}`); }
  }
  backup.restored_at = new Date().toISOString();
  flush();
  // 종료 코드: 0 완료 · 1 실패 있음 · 3 분류 뒤 바뀌어 유지한 칸이 남음(미완료 — 잡이 끝난 뒤 다시 restore). 실패가 있으면 1 이 우선.
  log.info(`\nRESTORE 끝 — 되돌림 ${reverted}칸 · 분류 뒤 바뀌어 유지 ${late}건 · 실패 ${bad}건${bad ? ' 🔴' : (late ? ' — 미완료(종료 코드 3): 잡이 끝난 뒤 같은 백업으로 다시 restore 하세요' : '')}.`);
  return bad ? 1 : (late ? 3 : 0);
}

// ── 진입 ────────────────────────────────────────────────────────────────
/** 하네스는 main(argv, deps 일부) 로 부른다. DB 연결은 닫지 않는다(cli 가 닫는다). @returns {Promise<number>} 종료 코드 */
async function main(argv, injected = {}) {
  let args;
  try { args = parseArgs(argv); } catch (e) {
    console.error(`사용법 오류: ${e.message}\n  node ${path.basename(__filename)} --user <id> [--skip-video-ids <id,..>] [--only <id,..>] [--allow-non-h264] [--apply] [--restore <file>] [--backup-dir <dir>]`);
    return 2;
  }
  const deps = { ...defaultDeps(), ...injected, hooks: { ...(injected.hooks || {}) } };
  let restoreSrc = null;
  if (args.restore) {
    try { restoreSrc = loadBackup(args, deps.storage); } catch (e) { console.error(`🔴 백업 파일 오류: ${e.message}`); return 1; }
  }
  const mode = restoreSrc ? (args.apply ? 'restore-apply' : 'restore-dryrun') : (args.apply ? 'apply' : 'dryrun');
  const log = makeLogger(path.join(args.backupDir, `${TASK}-${stamp()}-user${args.user}-${mode}.log`));
  let release = null;
  try {
    log.info(`# 로그: ${log.file}`);
    if (args.apply) {
      release = acquireLock(args.user, deps.hooks);
      log.info(`# 잠금: ${release.file}${release.recovered ? ` (죽은 잠금 회수: ${release.recovered})` : ''}`);
    }
    return restoreSrc ? await runRestore(args, deps, log, restoreSrc) : await runBackfill(args, deps, log);
  } catch (e) {
    log.warn(`🔴 실패: ${e.message}`);
    return 1;
  } finally {
    if (release) release();
    log.close();
  }
}

async function cli() {
  let aborting = false;
  const onSignal = (sig) => {
    if (aborting) { console.error(`\n${sig} 두 번째 — 즉시 종료(임시 폴더는 /tmp/bjj-bf050-* 를 확인하세요)`); process.exit(130); }
    aborting = true;
    console.error(`\n${sig} — 지금 단계를 정리하고 멈춥니다(다운로드는 3초 안에 끊김). 한 번 더 누르면 즉시 종료.`);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  const code = await main(process.argv.slice(2), { isAborting: () => aborting });
  try { await require(path.join(BACKEND, 'src', 'models')).sequelize.close(); } catch { /* ignore */ }
  process.exitCode = code;
}

if (require.main === module) cli();
module.exports = { main, parseArgs, planRow, lengthOk, isH264Aac, loadBackup, oneLine, lockFileOf, acquireLock, LENGTH_TOLERANCE };

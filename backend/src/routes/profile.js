const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Profile, BeltHistory, MembershipPayment } = require('../models');
const { wrap } = require('../utils/respond');
const { getStaticRoot, ensureDir, getAvatarPath, avatarWebPath } = require('../services/storage');

// ─── 아바타 업로드 (task-019) ────────────────────────────────────────────────
// 저장 위치는 **express.static 이 서빙하는 루트**(services/storage.getStaticRoot) 하나뿐이다.
// 이전 코드는 `../../../public/uploads` 에 저장했는데 그 디렉토리는 서빙되지 않아,
// 업로드가 200을 주고도 사진은 영영 보이지 않았다. 경로 문자열은 여기서 다시
// 하드코딩하지 말고 반드시 storage.js 헬퍼만 경유할 것.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { ensureDir(getStaticRoot()); cb(null, getStaticRoot()); }
    catch (e) { cb(e); }
  },
  // 🔴 최종 이름(`avatar_<uid><ext>`)으로 바로 받지 않는다.
  //    multer(2.1.1) diskStorage 는 크기 제한을 알기 전에 write stream 을 먼저 열기 때문에,
  //    최종 이름으로 받으면 5MB 초과 업로드가 기존 사진을 truncate 한 뒤 실패 정리로 unlink 해
  //    **실패한 업로드가 멀쩡한 기존 사진을 지워버린다**(lib/make-middleware.js abortWithError
  //    → storage/disk.js _removeFile 경로에서 확인). 임시 파일로 받고 성공 후 rename 한다.
  //    선행 '.' 은 express.static 기본값 dotfiles:'ignore' 에 걸려 쓰는 도중에도 서빙되지 않는다.
  filename: (req, file, cb) => {
    cb(null, `.avatar_${req.user?.id || 'anon'}_${crypto.randomBytes(6).toString('hex')}.tmp`);
  },
});
// ─── 허용 이미지 타입 — 이 표 하나가 유일한 진실이다 ──────────────────────────
// 🔴 아래 fileFilter(통과 여부)와 safeExt(저장 확장자)가 **같은 표·같은 함수**를 본다.
//    두 판단이 서로 다른 입력을 보면 저장형 XSS 가 열린다. 실제로 그랬다(task-019 Reviewer 재현):
//    수정 전에는 필터가 `file.mimetype`(선언값)만 보고 확장자는 `file.originalname`에서 뽑았는데,
//    이 둘은 **서로 다른, 둘 다 클라이언트가 자유롭게 정하는 필드**다. 그래서
//      Content-Type: image/png (필터 통과) + filename: evil.html (확장자 검사 없음)
//    조합이면 내용이 순수 HTML/JS 여도 `avatar_1.html` 로 저장되고 express.static 이
//    `Content-Type: text/html` 로 서빙한다. /uploads 는 SPA 와 **동일 오리진**이고 JWT(`bjj_token`,
//    만료 30일)가 localStorage 에 있으므로, 그 URL 을 여는 것만으로 토큰이 털려 계정이 넘어간다.
//    ⇒ 저장 확장자는 **서버가 검증한 mimetype 에서만** 파생시킨다. originalname 은 쓰지 않는다.
// ⚠️ image/svg+xml 은 의도적으로 제외(차단). SVG 는 스푸핑 없이 **선언 그대로** <script> 를 담을 수
//    있어 위 경로와 무관하게 같은 결과가 된다. 아바타에 SVG 를 쓸 실사용 시나리오가 없다.
// ⚠️ 이 표에 타입을 추가/삭제하면 필터와 확장자 매핑이 **동시에** 바뀐다. 목록을 갈라 두지 말 것 —
//    갈라지면 허용된 타입이 fallback 확장자로 조용히 저장되거나 그 반대가 된다.
const EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/avif': '.avif', 'image/bmp': '.bmp',
  'image/heic': '.heic', 'image/heif': '.heif',
};

// 저장 파일명의 확장자 — 허용 목록에 없는 타입이면 null(=거부). 절대 '.jpg' 로 fallback 하지 않는다.
// fallback 이 있으면 검증되지 않은 파일이 이미지인 척 조용히 저장되는 경로가 생긴다.
function safeExt(file) {
  const mime = String(file?.mimetype || '').split(';')[0].trim().toLowerCase();
  return EXT_BY_MIME[mime] || null;
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  // 명시적 화이트리스트. `image/` 로 시작하면 다 통과시키던 방식은 image/svg+xml 도 함께 열어준다.
  fileFilter: (req, file, cb) => {
    if (!safeExt(file)) return cb(new Error('이미지 파일만 업로드 가능합니다'));
    cb(null, true);
  },
});

// 아바타 파일 삭제 — path traversal 방어.
// row.avatar 를 그대로 join 하지 않고 basename 으로 파일명만 뽑아 정적 루트 **바로 아래**로 한정하고,
// 다시 `avatar_<uid><ext>` 소유권 규칙까지 만족하는 이름만 지운다
// (basename 만으로는 `../avatar_3.png` 같은 값이 남의 사진을 가리킬 수 있다).
// 규칙에 안 맞으면 아무것도 지우지 않는다 — 잘못 지우느니 orphan 을 남기는 쪽이 안전하다.
// keepPath 를 주면 그 파일은 지우지 않는다(방금 저장한 새 파일 보호).
function removeAvatarFile(userId, webPath, keepPath) {
  if (!webPath) return;
  const name = path.basename(String(webPath));
  if (!name || name === '.' || name === '..') return;
  if (path.basename(name, path.extname(name)) !== `avatar_${userId}`) {
    console.warn('[profile] 소유권 규칙에 맞지 않는 아바타 경로 — 삭제 건너뜀', webPath);
    return;
  }
  const root = path.resolve(getStaticRoot());
  const full = path.resolve(root, name);
  if (path.dirname(full) !== root) return;                       // 루트 바로 아래가 아니면 중단
  if (keepPath && full === path.resolve(keepPath)) return;        // 새 파일은 보호
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (e) {
    console.error('[profile] 아바타 파일 삭제 실패', full, e.message);
  }
}

// multer 에러를 400 + 한국어 메시지로 변환한다.
// 없으면 전역 errorHandler 가 500 "File too large" 를 돌려줘 사용자는 원인을 알 수 없다.
function uploadErrorHandler(err, req, res, next) {
  if (!err) return next();
  if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch { /* 이미 정리됨 */ } }
  const msg = err.code === 'LIMIT_FILE_SIZE'
    ? '이미지 용량은 5MB 이하만 업로드할 수 있습니다'
    : (err.message || '업로드에 실패했습니다');
  console.error('[profile] 아바타 업로드 실패', err.code || '', err.message);
  res.status(400).json({ success: false, message: msg });
}

// ─── 소속(networks) JSON 헬퍼 — techniques.js의 parsePos/posToJson과 동일 패턴 ───
// 공백 제거 + 빈 값 제거 + 중복 제거
function cleanNetworks(list) {
  const out = [];
  for (const n of (Array.isArray(list) ? list : [])) {
    const v = String(n ?? '').trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function parseNetworks(raw) {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return cleanNetworks(p);
    return p ? cleanNetworks([p]) : [];
  } catch {
    return cleanNetworks([raw]);   // 손상 JSON·레거시 단일 문자열 흡수
  }
}

function networksToJson(networks, network) {
  const list = Array.isArray(networks)
    ? networks
    : (networks ? [networks] : (network ? [network] : []));
  return JSON.stringify(cleanNetworks(list));
}

// profile row에서 소속 배열 추출 — networks 우선, 없으면 레거시 network 흡수
function rowNetworks(row) {
  const list = parseNetworks(row?.networks);
  if (list.length) return list;
  return cleanNetworks([row?.network]);
}

// ─── 프로필 ───
router.get('/profile', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await Profile.findOne({ where: { user_id: uid }, raw: true });
  if (!row) return res.json({});
  row.networks = rowNetworks(row);
  row.network  = row.networks[0] || '';   // 하위호환 — 첫 번째 소속
  res.json(row);
}));

router.put('/profile', wrap(async (req, res) => {
  const uid = req.user.id;
  const { nickname, startDate, weightClass, network, networks } = req.body;
  const row = await Profile.findOne({ where: { user_id: uid } });
  // networks/network 둘 다 안 온 경우엔 기존 소속 유지 (레거시 클라이언트 보호)
  const nextNetworks = (networks !== undefined || network !== undefined)
    ? parseNetworks(networksToJson(networks, network))
    : rowNetworks(row);
  const data = {
    nickname:     nickname || '',
    start_date:   startDate || null,
    weight_class: weightClass || '',
    networks:     JSON.stringify(nextNetworks),
    network:      (nextNetworks[0] || '').slice(0, 100),   // 레거시 컬럼 동기화(STRING(100))
  };
  if (row) await row.update(data); else await Profile.create({ ...data, user_id: uid });
  res.json({ ok: true });
}));

router.post('/profile/avatar', upload.single('avatar'), uploadErrorHandler, wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' });
  const uid = req.user.id;
  const ext = safeExt(req.file);
  // fileFilter 가 같은 함수를 쓰므로 여기서 null 일 수 없다. 그래도 남겨 두는 이유는,
  // 나중에 필터만 손대고 이 표를 잊는 변경이 들어와도 검증 안 된 확장자가 저장되지 않게 하기 위해서다.
  if (!ext) {
    try { fs.unlinkSync(req.file.path); } catch { /* 이미 정리됨 */ }
    return res.status(400).json({ success: false, message: '이미지 파일만 업로드 가능합니다' });
  }
  const destPath   = getAvatarPath(uid, ext);     // <staticRoot>/avatar_<uid><ext>
  const avatarPath = avatarWebPath(uid, ext);     // /uploads/avatar_<uid><ext>
  // 임시 파일 → 최종 이름. 같은 디렉토리이므로 rename 은 원자적이다.
  try {
    fs.renameSync(req.file.path, destPath);
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch { /* 이미 없음 */ }
    throw e;
  }
  const row  = await Profile.findOne({ where: { user_id: uid } });
  const prev = row?.avatar || null;
  if (row) await row.update({ avatar: avatarPath });
  else     await Profile.create({ avatar: avatarPath, user_id: uid });
  // orphan 정리 — 확장자가 바뀐 재업로드(.jpg → .png)로 남는 이전 파일 제거.
  // 반드시 rename 성공·DB 갱신 뒤에, destPath 를 보호 대상으로 넘겨 새 파일을 지우지 않게 한다.
  if (prev && prev !== avatarPath) removeAvatarFile(uid, prev, destPath);
  res.json({ avatar: avatarPath });
}));

router.delete('/profile/avatar', wrap(async (req, res) => {
  const uid = req.user.id;
  const row = await Profile.findOne({ where: { user_id: uid } });
  if (row && row.avatar) {
    removeAvatarFile(uid, row.avatar);
    await row.update({ avatar: null });
  }
  res.json({ ok: true });
}));

// ─── 벨트 히스토리 ───
router.get('/belts', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await BeltHistory.findAll({ where: { user_id: uid }, order: [['achieved_date', 'DESC']], raw: true });
  res.json(rows);
}));

router.post('/belts', wrap(async (req, res) => {
  const uid = req.user.id;
  const { belt, stripes, achievedDate, note } = req.body;
  const r = await BeltHistory.create({
    belt, stripes: stripes || 0, achieved_date: achievedDate, note: note || '', user_id: uid,
  });
  res.json({ id: r.id });
}));

router.put('/belts/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  const { belt, stripes, achievedDate, note } = req.body;
  await BeltHistory.update(
    { belt, stripes: stripes || 0, achieved_date: achievedDate, note: note || '' },
    { where: { id: req.params.id, user_id: uid } }
  );
  res.json({ ok: true });
}));

router.delete('/belts/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  await BeltHistory.destroy({ where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });
}));

// ─── 회원권 결제이력 ───
router.get('/memberships', wrap(async (req, res) => {
  const uid = req.user.id;
  const rows = await MembershipPayment.findAll({
    where: { user_id: uid },
    order: [['paid_date', 'DESC']],
    raw: true,
  });
  res.json(rows);
}));

router.post('/memberships', wrap(async (req, res) => {
  const uid = req.user.id;
  const { paidDate, duration, sessionType, memo } = req.body;
  if (!paidDate || !duration || !sessionType) {
    return res.status(400).json({ error: '필수 항목 누락' });
  }
  const r = await MembershipPayment.create({
    paid_date: paidDate,
    duration,
    session_type: sessionType,
    memo: memo || '',
    user_id: uid,
  });
  res.json({ id: r.id });
}));

router.delete('/memberships/:id', wrap(async (req, res) => {
  const uid = req.user.id;
  await MembershipPayment.destroy({ where: { id: req.params.id, user_id: uid } });
  res.json({ ok: true });
}));

module.exports = router;

const path = require('path');
const fs   = require('fs');

const UPLOADS_ROOT = '/home/brownjeon/NFS/homes/brownjeon/project/files/bjj-trainning';
const DEFAULT_USER = 'brownjeon';

function getUploadRoot() {
  return UPLOADS_ROOT;
}

function getUserDir(userId = DEFAULT_USER) {
  return path.join(UPLOADS_ROOT, 'users', userId);
}

function getFramesDir(clipId, userId = DEFAULT_USER) {
  return path.join(getUserDir(userId), 'clip-frames', String(clipId));
}

function getThumbPath(clipId, userId = DEFAULT_USER) {
  return path.join(getUserDir(userId), 'clip-thumbs', `${clipId}.jpg`);
}

function frameWebPath(clipId, filename, userId = DEFAULT_USER) {
  return `/uploads/users/${userId}/clip-frames/${clipId}/${filename}`;
}

function thumbWebPath(clipId, userId = DEFAULT_USER) {
  return `/uploads/users/${userId}/clip-thumbs/${clipId}.jpg`;
}

function getStaticRoot() {
  return UPLOADS_ROOT;
}

function getVideoDir(clipId, userId = DEFAULT_USER) {
  return path.join(getUserDir(userId), 'clip-videos', String(clipId));
}

function videoWebPath(clipId, userId = DEFAULT_USER) {
  return `/uploads/users/${userId}/clip-videos/${clipId}/video.mp4`;
}

function getClassVideoDir(classId, userId = DEFAULT_USER) {
  return path.join(getUserDir(userId), 'class-videos', String(classId));
}

function classVideoWebPath(classId, userId = DEFAULT_USER) {
  return `/uploads/users/${userId}/class-videos/${classId}/video.mp4`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// 긴 영상 챕터 프레임 (task-008 Phase 2, S7) — 기존 함수들의 DEFAULT_USER='brownjeon' 하드코딩
// 패턴을 반복하지 않고 userId를 필수 인자로 받는다(기존 함수는 전부 무수정).
function getLongVideoFramesDir(userId, videoId) {
  if (userId == null) throw new Error('getLongVideoFramesDir: userId가 필요합니다');
  return path.join(getUserDir(String(userId)), 'long-video-frames', String(videoId));
}

function longVideoFrameWebPath(userId, videoId, filename) {
  if (userId == null) throw new Error('longVideoFrameWebPath: userId가 필요합니다');
  return `/uploads/users/${userId}/long-video-frames/${videoId}/${filename}`;
}

// 긴 영상 원본 보관 (task-048, S3.5) — 분석용으로 받은 영상을 유튜브 삭제·비공개에 대비해 남긴다.
// 프레임(getLongVideoFramesDir)과 같은 규칙: userId 필수, DEFAULT_USER 로 떨어지지 않는다.
// 파일명은 항상 video.mp4 하나 — 재분석은 같은 경로를 원자 교체(임시 이름 → rename)한다.
// 🔴 이 폴더는 DELETE·S3.5 가 fs.rm(recursive) 로 지운다 → id 는 숫자만 받는다(REV-048-1 L-1).
//    '' · '../..' · '1/2' · -1 · 1.5 · '1e3' 같은 값이 상위 폴더를 가리키지 못하게 정수(숫자 또는 숫자 문자열)가
//    아니면 던진다. 기존 함수(getLongVideoFramesDir 등)는 손대지 않았다.
function assertLongVideoId(fn, name, value) {
  if (value == null) throw new Error(`${fn}: ${name}가 필요합니다`);
  const ok = (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    || (typeof value === 'string' && /^\d+$/.test(value));
  if (!ok) throw new Error(`${fn}: ${name}는 정수여야 합니다 (${JSON.stringify(value)})`);
}

function getLongVideoDir(userId, videoId) {
  assertLongVideoId('getLongVideoDir', 'userId', userId);
  assertLongVideoId('getLongVideoDir', 'videoId', videoId);
  return path.join(getUserDir(String(userId)), 'long-videos', String(videoId));
}

function longVideoWebPath(userId, videoId) {
  assertLongVideoId('longVideoWebPath', 'userId', userId);
  assertLongVideoId('longVideoWebPath', 'videoId', videoId);
  return `/uploads/users/${userId}/long-videos/${videoId}/video.mp4`;
}

// 긴 영상 썸네일 보관 (task-050) — 영상과 같은 폴더(getLongVideoDir)에 thumb.<ext> 하나.
// 확장자는 응답 바이트의 매직 바이트로 정해진 세 가지만 받는다(longVideoThumb.js). 정수 id 검증은 위와 같다.
const LONG_VIDEO_THUMB_EXTS = Object.freeze(['jpg', 'webp', 'png']);

function longVideoThumbWebPath(userId, videoId, ext) {
  assertLongVideoId('longVideoThumbWebPath', 'userId', userId);
  assertLongVideoId('longVideoThumbWebPath', 'videoId', videoId);
  if (!LONG_VIDEO_THUMB_EXTS.includes(ext)) {
    throw new Error(`longVideoThumbWebPath: 허용되지 않은 확장자입니다 (${JSON.stringify(ext)})`);
  }
  return `/uploads/users/${userId}/long-videos/${videoId}/thumb.${ext}`;
}

// 프로필 아바타 (task-019) — getThumbPath/thumbWebPath 쌍과 동일한 패턴.
// ⚠️ 배치 스킴은 users/<id>/ 가 아니라 **정적 루트 평면 배치**다. 바꾸지 말 것 —
//    기존 DB 값 `/uploads/avatar_3.png` 와 실제 파일 `<staticRoot>/avatar_3.png` 가
//    이 규칙 기준으로 이미 정합하며, 스킴을 바꾸면 파일 이동 + DB UPDATE 마이그레이션이 발생한다.
//    파일명 규칙 `avatar_<userId><ext>` 도 같은 이유로 고정이다.
function getAvatarPath(userId, ext) {
  if (userId == null) throw new Error('getAvatarPath: userId가 필요합니다');
  return path.join(getStaticRoot(), `avatar_${userId}${ext}`);
}

function avatarWebPath(userId, ext) {
  if (userId == null) throw new Error('avatarWebPath: userId가 필요합니다');
  return `/uploads/avatar_${userId}${ext}`;
}

module.exports = {
  getUploadRoot, getUserDir, getFramesDir, getThumbPath, getVideoDir,
  frameWebPath, thumbWebPath, videoWebPath, getStaticRoot, ensureDir,
  getClassVideoDir, classVideoWebPath,
  getLongVideoFramesDir, longVideoFrameWebPath,
  getLongVideoDir, longVideoWebPath,
  longVideoThumbWebPath, LONG_VIDEO_THUMB_EXTS,
  getAvatarPath, avatarWebPath,
  DEFAULT_USER,
};

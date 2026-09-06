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
  getAvatarPath, avatarWebPath,
  DEFAULT_USER,
};

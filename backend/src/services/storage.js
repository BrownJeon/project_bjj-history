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

module.exports = {
  getUploadRoot, getUserDir, getFramesDir, getThumbPath, getVideoDir,
  frameWebPath, thumbWebPath, videoWebPath, getStaticRoot, ensureDir,
  getClassVideoDir, classVideoWebPath,
  getLongVideoFramesDir, longVideoFrameWebPath,
  DEFAULT_USER,
};

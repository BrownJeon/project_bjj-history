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

module.exports = {
  getUploadRoot, getUserDir, getFramesDir, getThumbPath, getVideoDir,
  frameWebPath, thumbWebPath, videoWebPath, getStaticRoot, ensureDir,
  getClassVideoDir, classVideoWebPath,
  DEFAULT_USER,
};

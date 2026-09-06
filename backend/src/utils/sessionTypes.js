// 홈 "오늘 훈련했나요?" 카드의 수업 종류 프리셋 — task-021.
//
// [이 목록이 여기 한 곳에만 있어야 하는 이유]
// 이 값들은 두 가지 역할을 동시에 한다.
//   1) 홈 카드의 칩 라벨 (프론트)
//   2) "아직 사람이 테마를 안 적었다"는 표시 (백엔드 — voice.js 의 음성분석 테마 자동 채움)
// 프론트가 같은 문자열을 따로 하드코딩하면, 칩이 하나 늘어나는 순간 (2)가 조용히 어긋나
// 그 종류로 만든 수업만 음성분석 테마가 영영 안 채워진다 (task-021 Reviewer 판정 1과 동일한 회귀).
// 그래서 정본은 이 파일 하나뿐이고, 프론트는 GET /api/classes/session-types 로 받아 쓴다.
// (web/ 는 별도 ext4 작업 디렉토리에서 빌드되므로 backend/ 를 직접 import 할 수 없다.)
//
// utils/ 에 두는 이유: nfc.js·techAliases.js 처럼 I/O 없는 순수 공유 모듈이고,
// 이 파일 하나 때문에 프로젝트에 없던 constants/ 계층을 새로 만들 이유가 없다.

const { toNFC } = require('./nfc');

/** 수업 종류 3택. 값이 그대로 classes.theme 에 저장된다(스키마 변경 없음). */
const SESSION_TYPE_PRESETS = ['수업', '오픈매트', '자율운동'];

// 비교는 항상 NFC 정규화 후 (task-014) — 같은 글자가 NFD 로 저장돼 있어도 눈에 보이는 대로 비교한다.
const PRESET_SET = new Set(SESSION_TYPE_PRESETS.map(toNFC));

/**
 * theme 이 프리셋 값 "그 자체"인가.
 * 🔴 정확히 일치할 때만 true — "오픈매트 - 드릴 위주"처럼 사용자가 덧붙여 쓴 값은 false 다.
 * (trim 하지 않는 것도 같은 이유: 공백까지 포함해 사람이 손댄 흔적이면 보존한다.)
 */
function isPresetTheme(theme) {
  return typeof theme === 'string' && PRESET_SET.has(toNFC(theme));
}

/**
 * theme 이 "아직 안 채워진 값"인가 — 즉 더 정보량이 큰 값으로 덮어써도 되는가.
 * 비어 있거나(NULL/공백) 프리셋 그대로면 true.
 * 프리셋은 "빠른 기본값"이지 최종 진실이 아니므로, 음성분석이 실제 수업 내용을 알아내면
 * 서술형 테마로 바뀌는 것이 자유 텍스트 필드인 theme 의 원래 의도에 맞다.
 */
function isFillableTheme(theme) {
  if (theme == null) return true;
  if (typeof theme !== 'string') return false;
  if (theme.trim() === '') return true;
  return isPresetTheme(theme);
}

module.exports = { SESSION_TYPE_PRESETS, isPresetTheme, isFillableTheme };

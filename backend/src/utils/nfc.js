// 한글 NFC(완성형) 정규화 유틸 — task-014
//
// [왜 필요한가]
// 같은 한글이 유니코드상 두 가지로 표현된다. 완성형(NFC) "델"=U+B378 한 글자와,
// 자모분리형(NFD) "델"=U+1103 U+1166 U+11AF 세 글자. 화면에는 완전히 똑같이 보이지만
// JS의 ===, includes(), Set/Map 키, SQL의 = / LIKE 는 전부 "다른 문자열"로 판정한다.
// 에러 없이 "결과 없음"으로만 나타나서 사용자는 자기가 잘못 친 줄 안다.
//
// [이 앱의 실제 유입 경로 — task-014에서 실측 확인]
// yt-dlp가 일부 유튜브 영상 제목을 NFD로 반환한다. 2026-09-04 기준 운영 DB에서
// long_videos.id=29 의 title 1건이 NFD로 저장돼 있고, 같은 URL에 yt-dlp를 다시 돌려도
// 여전히 NFD가 나온다(과거 흔적이 아니라 지금도 살아있는 유입원). 사용자가 키보드로 치는
// 글자는 항상 NFC라 이 제목은 검색으로 절대 찾을 수 없었다.
//
// [방어 전략 — 2층]
//  1층(근본): 외부 텍스트가 앱에 들어오는 경계(services/ytdlp.js의 fetchMeta 등)와
//            비교 키로 쓰이는 필드의 저장 시점에서 NFC로 통일한다 → DB를 정본으로 유지.
//  2층(안전망): 이미 NFD로 저장된 기존 데이터와 미처 못 막은 유입 경로를 위해,
//            "조용히 실패"가 치명적인 지점(검색·이름 매칭)에서 비교 시점에도 정규화한다.
//
// 자유 서술 필드(note/description/summary 등)는 정본화 대상이 아니다 — 매칭 키로 쓰이지
// 않으므로 저장값을 건드릴 이유가 없고, 검색 대상일 때만 비교 시점에 정규화하면 충분하다.

/** 문자열을 NFC로 정규화. 문자열이 아니면(null/undefined/숫자 등) 원본을 그대로 돌려준다. */
function toNFC(v) {
  return typeof v === 'string' ? v.normalize('NFC') : v;
}

/** 배열 안의 문자열 원소만 NFC로 정규화(비문자열 원소는 보존). 배열이 아니면 원본 반환. */
function arrToNFC(v) {
  return Array.isArray(v) ? v.map(toNFC) : v;
}

/** 정규화 형태 차이를 무시한 문자열 동등 비교. 한쪽이 NFD여도 눈에 보이는 대로 같으면 true. */
function eqNFC(a, b) {
  return String(a ?? '').normalize('NFC') === String(b ?? '').normalize('NFC');
}

module.exports = { toNFC, arrToNFC, eqNFC };

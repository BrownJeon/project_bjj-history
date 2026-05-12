# Handoff: BJJ 일상기록 웹 리디자인

## Overview
기존 주짓수 일상기록 웹앱(React SPA)의 전면 UI 리디자인입니다.
다크 테마 기반의 모던하고 깔끔한 디자인으로, 기존 기능을 유지하면서 UX와 비주얼을 개선합니다.

## About the Design Files
이 번들의 HTML 파일들은 **디자인 레퍼런스로 제작된 프로토타입**입니다. 프로덕션 코드가 아닙니다.
기존 프로젝트의 React + Vite 환경에서 이 디자인을 참고하여 재구현해야 합니다.
기존 코드의 API 호출, 라우팅(react-router-dom), 상태관리(Context) 패턴을 그대로 유지하면서
CSS/JSX의 스타일과 레이아웃만 이 디자인에 맞게 변경합니다.

## Fidelity
**High-fidelity (hifi)** — 최종 색상, 타이포그래피, 간격, 인터랙션이 포함된 픽셀 수준 목업입니다.
디자인 토큰(색상, 간격, 라운딩 등)을 정확히 따라 구현하세요.

---

## 기존 프로젝트 구조 (변경 전)

```
web/src/
├── main.jsx                 # 라우터 설정
├── components/Layout.jsx    # 앱 쉘 + 하단 네비
├── contexts/
│   ├── CacheContext.jsx     # 데이터 캐시 (classes, techniques, clips, chains, gameplans)
│   └── UIContext.jsx        # 로딩/토스트
├── pages/
│   ├── CalendarPage.jsx     # 캘린더 (메인)
│   ├── TechniquesPage.jsx   # 기술트리
│   ├── ChainsPage.jsx       # 기술 체인
│   ├── GameplanPage.jsx     # 게임플랜
│   ├── ClipsPage.jsx        # 참고영상
│   ├── CoachPage.jsx        # AI 코치
│   ├── ProfilePage.jsx      # 프로필
│   ├── ClassEditPage.jsx    # 수업 추가/수정 모달
│   └── SparEditPage.jsx     # 스파링 추가/수정 모달
├── api/                     # API 호출 모듈들
└── styles/
    ├── tokens.css           # CSS 변수 (색상, 라운딩 등)
    └── app.css              # 전역 스타일
```

---

## 리디자인 후 구조 (변경 후)

### 네비게이션 변경
기존 5탭: 캘린더 / 기술 / 체인 / 게임플랜 / 영상
→ 변경 5탭: **홈 / 캘린더 / 기술·플랜 / 영상 / 분석**

```
하단 네비게이션 (5탭):
┌──────┬──────────┬───────────┬──────┬──────┐
│  홈  │ 캘린더   │ 기술/플랜  │ 영상 │ 분석 │
│ home │ calendar │ book      │video │brain │
└──────┴──────────┴───────────┴──────┴──────┘

추가 접근:
- 프로필: 홈 우측 상단 아이콘 → 오버레이
- 기술 체인 / 게임플랜: "기술/플랜" 탭 내 상단 토글
```

### 라우팅 변경

```jsx
// main.jsx 라우팅
<Routes>
  <Route element={<Layout />}>
    <Route path="/"           element={<HomePage />} />        {/* 신규 */}
    <Route path="/calendar"   element={<CalendarPage />} />    {/* 기존 "/" → "/calendar" */}
    <Route path="/techplan"   element={<TechPlanPage />} />    {/* 기술+플랜 통합 */}
    <Route path="/clips"      element={<ClipsPage />} />       {/* 유지 */}
    <Route path="/coach"      element={<CoachPage />} />       {/* 유지 (탭명: 분석) */}
    <Route path="/me"         element={<ProfilePage />} />     {/* 유지 (오버레이) */}
    <Route path="*"           element={<NotFoundPage />} />
  </Route>
</Routes>
```

### Layout.jsx 네비 탭 변경

```jsx
const tabs = [
  { to: '/',          label: '홈',      icon: 'home',     end: true },
  { to: '/calendar',  label: '캘린더',   icon: 'calendar' },
  { to: '/techplan',  label: '기술/플랜', icon: 'book' },
  { to: '/clips',     label: '영상',     icon: 'video' },
  { to: '/coach',     label: '분석',     icon: 'brain' },
];
```

---

## 디자인 토큰 (tokens.css 교체)

### 색상 시스템 (다크 테마 기본)

```css
:root {
  /* 배경 계층 */
  --bg:           #0C0D12;      /* 최하단 배경 */
  --surface:      #15171E;      /* 카드, 입력필드 배경 */
  --surface-up:   #1C1F28;      /* 상위 서피스 (모달 내부, 섹션) */
  --surface-hi:   #242836;      /* 하이라이트 배경 (칩, 호버) */

  /* 테두리 */
  --border:       rgba(255,255,255,0.06);   /* 기본 보더 */
  --border-med:   rgba(255,255,255,0.10);   /* 중간 강도 보더 */

  /* 텍스트 */
  --text:         #EEEEF2;      /* 기본 텍스트 */
  --text2:        #7C8098;      /* 보조 텍스트 */
  --text3:        #4A4E64;      /* 비활성 텍스트 */

  /* 포인트 컬러 (그린 계열) */
  --accent:       #1D9E75;      /* 기본 액센트 */
  --accent-lt:    #25C490;      /* 밝은 액센트 */
  --accent-dim:   rgba(29,158,117,0.12);   /* 액센트 배경 */
  --accent-glow:  rgba(29,158,117,0.25);   /* 그림자/글로우 */

  /* 시맨틱 컬러 */
  --red:          #E05A47;      /* 위험/스파링/삭제 */
  --red-dim:      rgba(224,90,71,0.12);
  --blue:         #4B8FE2;      /* 정보/포지션 태그 */
  --blue-dim:     rgba(75,143,226,0.12);
  --amber:        #F0A830;      /* 경고/즐겨찾기/별점 */
  --amber-dim:    rgba(240,168,48,0.12);
  --purple:       #8B6CE7;      /* AI/코치/영상태그 */
  --purple-dim:   rgba(139,108,231,0.12);

  /* 라운딩 */
  --radius:       10px;
  --radius-lg:    14px;
  --radius-xl:    16px;

  /* 벨트 색상 */
  --belt-white:   #E0E0E0;
  --belt-blue:    #1565C0;
  --belt-purple:  #7B1FA2;
  --belt-brown:   #795548;
  --belt-black:   #212121;
}
```

### 타이포그래피

```css
body {
  font-family: 'Noto Sans KR', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  word-break: keep-all;
  overflow-wrap: break-word;
}

/* 텍스트 스케일 */
/* 페이지 타이틀:    22px, weight 800, letter-spacing -0.5px */
/* 섹션 타이틀:      16px, weight 700 */
/* 카드 타이틀:      14-15px, weight 700 */
/* 본문:            13-14px, weight 400-500 */
/* 보조/캡션:       11-12px, weight 500 */
/* 태그:            10-11px, weight 600 */
/* 하단 네비 라벨:   10px, weight 400-600 */
```

### 간격 스케일

```
4px  — 태그 내부 패딩, 아이콘 갭
6px  — 필터 버튼 갭, 태그 갭
8px  — 카드 갭, 그리드 갭
10px — 카드 내부 패딩(소), 입력필드 패딩
12px — 카드 내부 패딩(중), 섹션 간격
14px — 카드 내부 패딩(기본)
16px — 카드 내부 패딩(대), 섹션 마진
20px — 좌우 페이지 패딩 (고정)
54px — 페이지 상단 패딩 (상태바 회피)
62px — 하단 네비 높이
80px — 스크롤 영역 하단 패딩 (네비 회피)
```

---

## 화면별 상세 명세

### 1. 홈 화면 (HomePage) — 신규

**목적**: 대시보드. 주간 현황, 빠른 통계, 최근 수업을 한눈에.

**구성요소**:
1. **헤더** (padding: 54px 20px 8px)
   - 좌: "오늘도 매트 위에서" (13px, text2) + "훈련 기록" (22px, weight 800)
   - 우: 프로필 아이콘 (38×38, radius 12, accent-dim 배경, 클릭→프로필 오버레이)

2. **주간 스트립 카드** (surface 배경, radius 16, padding 14)
   - 상단: "이번 주" + 연속일수 배지 (amber-dim 배경, fire 아이콘)
   - 7일 행: 요일(10px) + 날짜 원형(30×30, radius 10)
     - 오늘: accent 배경, 흰색 텍스트
     - 수련한 날: accent-dim 배경, accent 텍스트
     - 미수련: 투명, border만

3. **빠른 통계** (3열 그리드, gap 8)
   - 각 카드: surface 배경, radius 14, padding 12, 중앙 정렬
   - 아이콘 원형(28×28, radius 8) + 값(17px, weight 800) + 라벨(10px, text2)
   - "이번 달" / "총 수업" / "기술 수"

4. **최근 수업** (SectionHeader + 카드 목록)
   - 섹션 헤더: "최근 수업" + "전체보기" (accent 링크)
   - 각 카드: surface, radius 14, padding 14
     - 유형 배지(Gi/No-Gi/Open Mat) + 날짜 + 스파링 횟수 태그
     - 수업 제목 (14px, weight 700)
     - 기술 칩들 (11px, surface-hi 배경)

5. **새 수업 CTA** (accent gradient 버튼, radius 14, shadow accent-glow)

**데이터 소스**: CacheContext의 classes 배열에서 최근 데이터 + 통계 계산

---

### 2. 캘린더 화면 (CalendarPage) — 기존 리디자인

**목적**: 월간 캘린더 + 날짜별 수업/스파링 상세

**구성요소**:
1. **헤더**: "캘린더" (22px, weight 800)
2. **월 네비게이션**: ◀ 2026년 5월 ▶ (16px, weight 700, 중앙)
3. **캘린더 그리드** (7열, gap 4)
   - 요일 헤더: 11px, text3
   - 날짜 셀: aspectRatio 1, radius 10
     - 오늘: accent-dim 배경
     - 수업 있음: accent 보더 50% opacity
     - 수련 완료: surface-up 배경 + 하단 초록 점(4×4)
     - 선택됨: accent 배경, 흰색 텍스트
4. **월간 요약** (surface 카드, 3열: 수업/수련일/스파링)
5. **날짜 상세** (선택 시 표시)
   - 수업 카드: 테마, 드릴 정보, 수련체크 버튼, 스파링 버튼

**인터랙션**:
- 날짜 클릭 → 하단에 상세 패널 표시 (토글)
- "수련 체크" → `classesApi.toggleTrainedDate()` 호출
- "스파링" 버튼 → SparEditPage 모달 열기

---

### 3. 기술/플랜 화면 (TechPlanPage) — 통합 신규

**목적**: 기술트리와 플랜(체인+게임플랜)을 하나의 화면에서 토글

**구성요소**:
1. **상단 토글** (padding 54px 20px 0)
   - 2버튼 세그먼트: surface-up 배경, radius 10, padding 3
   - 활성 탭: surface 배경, shadow, text 색상
   - 비활성 탭: 투명, text2 색상
   - 옵션: "기술트리" / "플랜"

#### 3-A. 기술트리 탭

2. **검색바** (surface 배경, radius 10, 좌측 search 아이콘)
3. **필터 칩**: 전체 / 🕐 최신순 / ⭐ 즐겨찾기 (수평 스크롤)
   - 활성: accent 배경, 흰색
   - 비활성: surface-up 배경, text2
4. **기술 카드 목록** (각 surface, radius 14, padding 14)
   - 즐겨찾기 star 아이콘 + 기술명 (14px, weight 700)
   - 포지션 태그(blue) + 영상 수 태그(purple)
   - 우측 chevron
5. **기술 상세 모달** (바텀시트)
   - 포지션/즐겨찾기 태그, 메모, 참고영상 리스트
   - 삭제/수정/닫기 버튼

#### 3-B. 플랜 탭

2. **서브 필터**: 체인 / 게임플랜 (accent pill 스타일)
3. **+ 추가** 버튼

##### 기술 체인 (콤비네이션)
- **카드**: 체인명, 설명, 기술 태그 시퀀스(→ 화살표), 기술 수
- **상세 화면**: 세로 타임라인
  - 좌측 수직 라인 (accent gradient)
  - 각 스텝: 번호뱃지(STEP N) + 카드(기술명, 포지션태그, 메모)
  - 시작(blue)/중간(accent)/피니시(amber) 색상 구분
- **등록 화면**: 이름/설명 입력 + 등록된 기술에서 검색·선택 + 순서 조정(▲▼)

##### 게임플랜 (플로우차트)
- **카드**: 플랜명, 시작포지션 태그, 노드/전환 수, 기술 태그 미리보기
- **상세 화면**: SVG 플로우차트
  - 노드 유형별 색상: 시작(blue)/기술(accent)/피니시(amber)/상대반응(purple)/탈출(red)
  - 엣지: 성공(실선 accent) / 실패(점선 red) / 기본(회색)
  - 노드 클릭 → 하단 디테일 카드 (설명 + 연결된 전환 목록)
  - 범례 표시
- **등록 화면**: 노드 추가(유형별) + 전환 연결(성공/실패/기본) + 전환 요약 편집

---

### 4. 영상 화면 (ClipsPage) — 기존 리디자인

**목적**: 참고영상 관리 (YouTube, Instagram)

**구성요소**:
1. **헤더**: "참고영상" + "+ 추가" 버튼
2. **검색바** (search 아이콘 포함)
3. **영상 카드** (surface, radius 14, padding 12)
   - 좌: 썸네일 영역 (80×50, radius 8, surface-hi 배경, 플랫폼 아이콘)
   - 중: 제목(13px, weight 600, ellipsis) + 기술명 태그(accent)
   - 우: 즐겨찾기 star

---

### 5. 분석 화면 (CoachPage) — 기존 리디자인

**목적**: AI 코치 진단, 리포트, 플랜 생성

**구성요소**:
1. **헤더**: "분석" (22px, weight 800)
2. **기간 필터**: 7일 / 30일 / 90일 (pill 버튼, 활성=purple)
3. **진단 요약 카드** (surface, radius 14)
   - 4칸 그리드: 수업(accent)/수련일(blue)/스파링(red)/탭비율(amber)
   - 각 칸: surface-up 배경, radius 8, 값(16px weight 800) + 라벨
   - 하단: 반복 약점 영역 (red-dim 배경, radius 8)
4. **액션 버튼** 2개: "리포트 생성" / "플랜 생성"
5. **최근 리포트** 카드 목록

---

### 6. 프로필 화면 (ProfilePage) — 오버레이

**접근**: 홈 우측 상단 아이콘 → 전체 화면 오버레이 (z-index 150)

**구성요소**:
1. **헤더**: "프로필" + X 닫기 버튼
2. **프로필 헤더** (accent-dim gradient 배경)
   - 아바타(64×64, radius 18, accent 보더)
   - 닉네임(18px, weight 800)
   - 벨트 바 시각화 (120×18)
   - 시작일/소속 텍스트
3. **통계 행** (4칸: 수업/수련/기술/체급)
4. **기본 정보** 카드 + "수정" 버튼
   - 닉네임/시작일/체급/소속 행
   - 수정 클릭 → 편집 모달 (Input 필드 4개)
5. **벨트 이력** + "+ 추가" 버튼
   - 각 카드: 벨트바(60×10) + 메모 + 날짜
   - 카드 클릭 → 편집 모달 (벨트색상 선택/줄수/날짜/메모 + 삭제)

---

## 공통 컴포넌트

### Card
```
background: var(--surface)
border-radius: 14px
padding: 14px
border: 1px solid var(--border)
```

### Tag (배지)
```
display: inline-flex
padding: 3px 9px
border-radius: 6px
font-size: 11px
font-weight: 600
white-space: nowrap
```
유형별 색상: Gi(accent), No-Gi(blue), 대회(amber), 오픈매트(purple), 스파링(red)

### TagPicker (검색+태그 선택 입력)
```
사용처: 수업 모달의 포지션/기술, 스파링 모달의 시도기술/부족했던 부분
동작:
1. 선택된 태그 표시 (accent-dim 배경, × 제거 버튼)
2. "+ 추가" 클릭 → 드롭다운 오픈
3. 검색 입력 → 추천 목록 필터링 → 버튼 탭으로 추가
4. 목록에 없으면 직접 입력 후 Enter
5. singleSelect 옵션: 하나만 선택 가능 (포지션용)
```

미리 정의된 추천 목록:
- **포지션**: 클로즈드 가드, 오픈 가드, 하프 가드, 데라히바, 스파이더 가드, X가드, 버터플라이 가드, 래소 가드, 사이드 컨트롤, 마운트, 백 마운트, 니온벨리, 터틀, 스탠딩, 하프가드 탑, 50/50
- **기술**: 삼각조르기, 암바, 기무라, 길로틴, RNC, 옴플라타, 크로스초크, 에제키엘, 니슬라이스 패스, 스매시 패스, 롱스텝 패스, 레그드래그, 불파이터 패스, 힙범프 스윕, 시저스윕, 펜듈럼 스윕, 싱글렉, 더블렉, 스냅다운, 풋스윕, 백테이크, 시트벨트 그립, 바우앤애로우, 베림볼로, 언더훅 패스, 니쉴드 리텐션, 프레임 셋업, 가드 리커버리, 토홀드, 힐훅, 스트레이트 풋락
- **약점**: 패스 디펜스, 그립 파이팅, 포스쳐 관리, 힙 무브먼트, 프레임 유지, 테이크다운 디펜스, 가드 리텐션, 스크램블, 체력 관리, 멘탈, 타이밍, 압박 유지, 서브미션 디펜스, 백 탈출, 마운트 탈출

### Button
```
Primary: background accent, color white, radius 12, padding 11px 18px, weight 600
Outline: transparent, border 1px border-med, radius 12
Small:   padding 7px 12px, radius 8, font-size 12px
Danger:  background red, color white
Full:    width 100%
```

### Modal (바텀시트)
```
position: absolute, inset: 0
background: rgba(0,0,0,0.6)
align-items: flex-end
내부: surface-up, border-radius 20px 20px 0 0
padding: 20px 20px 30px
max-height: 88%
```

### NavBar (하단 네비)
```
position: absolute, bottom 0
height: 62px
background: rgba(12,13,18,0.92)
backdrop-filter: blur(20px)
border-top: 1px solid var(--border)
5탭 균등 배분
활성: accent 색상 아이콘+라벨
비활성: text3 색상
```

### BeltBar (벨트 시각화)
```
SVG 기반 벨트 표시
색상: white/blue/purple/brown/black
줄(stripes): 0~4개, 흰색 직사각형
검은 띠 표시 포함
```

---

## 수업 모달 (ClassEditPage 리디자인)

기존 콤마 구분 텍스트 입력 → **TagPicker** 방식으로 변경

```
필드 구성:
- 시작일 * (date input)
- 테마 (text input)
- 전체 메모 (textarea + ✨ AI 보완 버튼)
- 드릴 정보 (surface-up 섹션):
  - 포지션: TagPicker (singleSelect, POS_LIST)
  - 기술: TagPicker (TECH_LIST)
  - 난이도: 별점 5개 (★/☆ 토글)
```

## 스파링 모달 (SparEditPage 리디자인)

```
필드 구성:
- 날짜 * (date input)
- 세션 목록 (+ 세션 추가 버튼):
  각 세션:
  - 2열 그리드: 상대벨트/상대/탭받음/탭줌/시간/포지션점수
  - 시도한 기술: TagPicker (TECH_LIST)
  - 부족했던 부분: TagPicker (WEAK_LIST)
  - 세션 메모 (textarea)
- 전체 메모 (textarea + ✨ AI 코칭 분석 버튼)
```

---

## 아이콘 시스템

SVG 기반 커스텀 아이콘 (24×24 viewBox, stroke 기반)
아이콘 목록: home, calendar, book, target, grid, plus, search, chevL, chevR, star, x, check, clock, fire, trophy, users, video, brain, link, settings, edit, trash, sparring, belt

**구현 권장**: lucide-react 또는 heroicons에서 유사한 아이콘을 사용하거나,
디자인 파일의 `bjj-ui.jsx` 내 `Ic` 컴포넌트에서 SVG path를 직접 참고

---

## 작업 순서 권장

### Phase 1: 기반 작업
1. `tokens.css`를 위 디자인 토큰으로 교체 (다크 테마)
2. `app.css`에서 기본 스타일 업데이트 (다크 배경, 폰트, word-break)
3. `Layout.jsx` 네비게이션 탭 변경 (5탭 + 아이콘 교체)
4. 공통 컴포넌트 생성: Card, Tag, TagPicker, Modal(바텀시트), Button, BeltBar

### Phase 2: 화면 구현
5. HomePage 신규 생성 (주간 스트립 + 통계 + 최근 수업)
6. CalendarPage 리디자인 (그리드 스타일 + 날짜 상세)
7. TechPlanPage 신규 생성 (토글 + 기술트리 + 플랜)
8. ClipsPage 리디자인 (카드 레이아웃)
9. CoachPage 리디자인 (진단 카드 + 기간 필터)

### Phase 3: 모달/에디터
10. ClassEditPage 리디자인 (TagPicker 적용)
11. SparEditPage 리디자인 (TagPicker 적용)
12. ProfilePage 리디자인 (오버레이 + 벨트이력 편집)
13. 기술 체인 상세/등록 화면
14. 게임플랜 플로우차트 상세/등록 화면

### Phase 4: 마무리
15. 애니메이션/트랜지션 추가
16. 반응형 대응 (모바일 우선, 태블릿/데스크톱 확장)
17. 에러/로딩/빈 상태 디자인 적용

---

## 디자인 참조 파일

| 파일 | 내용 |
|------|------|
| `BJJ Redesign v2.html` | 메인 프로토타입 (모든 화면 통합) |
| `bjj-ui.jsx` | 디자인 토큰, 아이콘, 공통 컴포넌트 |
| `bjj-screens-1.jsx` | 홈, 캘린더 화면 |
| `bjj-screens-2.jsx` | 기술트리, 플랜(체인+게임플랜), 플로우차트 |
| `bjj-screens-3.jsx` | 프로필, 분석, 영상, 수업모달, 스파링모달, TagPicker |

---

## 주의사항

1. **API 호출은 변경하지 마세요** — 기존 `api/` 폴더의 모듈을 그대로 사용
2. **CacheContext/UIContext는 유지** — 데이터 구조 변경 없음
3. **다크 테마 전용** — 라이트 모드는 향후 추가 가능하도록 CSS 변수 사용
4. **모바일 퍼스트** — 기본 레이아웃은 모바일(375-390px), 태블릿/데스크톱은 max-width 제한
5. **한국어 텍스트** — `word-break: keep-all` 필수 (단어 중간 줄바꿈 방지)
6. **TagPicker의 추천 목록**은 하드코딩이 아닌 DB에서 가져온 기술/포지션 데이터와 연동 권장

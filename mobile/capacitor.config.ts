/**
 * Capacitor 설정 — BJJ 훈련일지 Android 앱 (task-039).
 *
 * ── 앱은 껍데기고 내용물은 서버에 있다 ──────────────────────────────────────
 * `server.url` 이 운영 도메인을 가리키므로 WebView 가 **항상 최신 웹**을 로드한다.
 * 화면·기능 수정은 웹 배포(CLAUDE.md 빌드 절차)만으로 반영되고 APK 재설치가 필요 없다.
 * APK 를 다시 만들어야 하는 것은 아이콘·권한·플러그인·이 설정 파일을 바꿀 때뿐이다.
 * `webDir`(`app-shell/`)는 Capacitor 가 요구하는 자리표시이고, 그 안의 `index.html` 을
 * `server.errorPath` 로 지정해 **운영 웹을 불러오지 못했을 때만** "연결할 수 없습니다" 안내로 쓴다.
 * (Capacitor 7 `BridgeWebViewClient.onReceivedError/onReceivedHttpError` 가 메인 프레임 오류 시
 *  `https://localhost/<errorPath>` 를 APK 안 assets 에서 로드한다 — 플러그인 접근은 없다.)
 *
 * ── 퓨니코드로 적는 이유 ─────────────────────────────────────────────────────
 * 한글 도메인(`bjj.미라클펭귄.com`)을 그대로 적으면 플랫폼마다 IDN 정규화가 달라
 * WebView 가 못 열거나, Capacitor 가 "앱 내부 주소"로 판정하는 호스트 비교가 어긋나
 * 같은 도메인 링크가 외부 브라우저로 튕길 수 있다(TheMeal 에서 같은 이유로 퓨니코드 사용).
 *
 * ── `androidScheme: 'https'` · `cleartext: false` ──────────────────────────
 * 운영 서버는 정식 인증서를 쓴다. 평문 트래픽을 허용할 이유가 없고, 스킴을 https 로 맞춰
 * Secure 쿠키·보안 컨텍스트 전용 API 가 웹 브라우저와 똑같이 동작하게 한다.
 *
 * ── 서명 ────────────────────────────────────────────────────────────────────
 * 개발용 APK는 기존 debug.keystore를 사용한다. 제출 준비용 AAB는 저장소 밖의
 * 업로드키(BJJ_UPLOAD_PROPERTIES)로 서명한다. 실제 Play 등록/배포는 별도 런칭 작업이다.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.miraclepenguin.bjj',
  appName: 'BJJ 훈련일지',
  webDir: 'app-shell',
  server: {
    url: 'https://bjj.xn--lh0b87pnudm10a4vd.com',
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'index.html',
  },
  android: {
    // Android 15(targetSdk 35) edge-to-edge 강제로 WebView 가 상태바·내비게이션바 밑까지 그려지는데,
    // 이 WebView 는 CSS `env(safe-area-inset-*)` 를 0 으로 준다 → 하단 탭바가 시스템 내비게이션 버튼과 겹쳤다
    // (2026-09-14 실기기). 'auto' 는 API 35+ 에서 WebView 에 시스템 바·컷아웃 크기만큼 **네이티브 margin** 을 줘
    // 웹이 바를 아예 피하게 한다(Capacitor 7 `CapacitorWebView.edgeToEdgeHandler`). 바 뒤 배경은 styles.xml 창 배경색.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    // The app is dark even when Android uses a light theme; preserve bright status icons.
    StatusBar: { style: 'DARK' },
  },
};

export default config;

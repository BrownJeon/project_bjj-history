#!/usr/bin/env node
// 앱 아이콘 생성기 — 시안 T1 "BJJ 워드마크 · 브라운" (2026-09-13 사용자 확정, task-038)
//
// 도안은 이 파일 맨 위 상수(BG·TEXT·BELT·GLYPH_BJJ·띠/랭크바 도형)가 단일 진실이다.
// 웹 아이콘·favicon·og-image·안드로이드 벡터/PNG 를 전부 여기서 뽑으므로, 아이콘을 고칠 때는
// 산출물을 손대지 말고 상수를 고친 뒤 다시 돌린다.
//
//   node web/scripts/gen-app-icons.mjs                    # 웹: web/public/{icons/*,apple-touch-icon.png,favicon.*,og-image.png} + docs/brand/app-icon.svg
//   node web/scripts/gen-app-icons.mjs --android <res>    # 안드로이드 res 만 (예: mobile/android/app/src/main/res)
//   node web/scripts/gen-app-icons.mjs --out <dir>        # 웹 산출물을 <dir> 아래 같은 상대 경로로(검증·비교용, 저장소는 안 건드림)
//
// - 글자는 SVG path 로 박혀 있어 기기 폰트와 무관하다. path 의 출처는 extract-icon-glyphs.mjs(Archivo Black · OFL).
// - sharp 는 NFS(noexec)에 node_modules 를 두지 않으려고 ext4 미러(~/.node-local/themeal)의 것을 빌린다.
// - 산출은 결정적이다(같은 입력 → 같은 바이트). 시각·난수·환경값을 쓰지 않는다.
// - 런처 아이콘은 APK 안에 들어가므로 --android 로 바꾼 뒤에는 APK 재빌드·재설치가 필요하다(웹 배포로는 안 바뀐다).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = resolve(WEB, '..');
const sharp = createRequire(join(homedir(), '.node-local/themeal/package.json'))('sharp');

// ════════════════════ 디자인 단일 진실 (시안 100×100 좌표) ════════════════════
export const BG = '#795548'; // 브라운 배경
export const TEXT = '#F3E9DC'; // 크림 글자·랭크바
export const BELT = '#111111'; // 검은 띠·랭크바 줄
export const DARK = '#0C0D12'; // 앱 배경(web/src/styles/tokens.css --bg) — og 바탕·스플래시·manifest background_color
const MONO = '#FFFFFF'; // 안드로이드 13+ 테마 아이콘은 알파만 쓴다
const TILE_RX = 23; // 웹 아이콘 모서리

// 'BJJ' — Archivo Black Regular 1.006 outline. 잉크 x 17→83(폭 66 = 띠 폭), 기준선 y 55, 캡 높이 25.05(시안 Arial Black 35 와 같음).
export const GLYPH_BJJ =
  'M32.39 29.95Q34.14 29.95 35.6 30.73Q37.06 31.52 37.92 32.94Q38.78 34.36 38.78 36.1Q38.78 40.73 34.91 41.93L34.91 42.07Q39.31 43.17 39.31 48.34Q39.31 50.3 38.42 51.81Q37.53 53.33 35.99 54.16Q34.44 55 32.59 55L17 55L17 29.95L32.39 29.95ZM24.43 35.45L24.43 39.71L29.53 39.71Q30.27 39.71 30.76 39.14Q31.25 38.58 31.25 37.74L31.25 37.38Q31.25 36.58 30.74 36.01Q30.24 35.45 29.53 35.45L24.43 35.45ZM24.43 44.88L24.43 49.17L30.07 49.17Q30.81 49.17 31.3 48.61Q31.79 48.05 31.79 47.21L31.79 46.84Q31.79 46.01 31.3 45.44Q30.81 44.88 30.07 44.88L24.43 44.88ZM60.59 46.3Q60.59 50.99 58.12 53.22Q55.65 55.44 51.01 55.44Q46.37 55.44 43.9 53.22Q41.43 50.99 41.43 46.3L41.43 45.97L48.39 45.97L48.39 46.26Q48.39 47.97 48.98 48.7Q49.56 49.43 50.77 49.43Q51.98 49.43 52.57 48.7Q53.16 47.97 53.16 46.26L53.16 29.95L60.59 29.95L60.59 46.3ZM83 46.3Q83 50.99 80.53 53.22Q78.06 55.44 73.42 55.44Q68.79 55.44 66.32 53.22Q63.85 50.99 63.85 46.3L63.85 45.97L70.8 45.97L70.8 46.26Q70.8 47.97 71.39 48.7Q71.98 49.43 73.19 49.43Q74.4 49.43 74.99 48.7Q75.57 47.97 75.57 46.26L75.57 29.95L83 29.95L83 46.3Z';
const BELT_BOX = { x: 17, y: 62, w: 66, h: 11, rx: 3 }; // 폭 = 글자 폭
const RANK_BAR = { x: 63, w: 12 }; // 띠 오른쪽 끝에서 20 안쪽. y·h 는 띠와 같음
const RANK_LINES = { xs: [66.5, 70.5], w: 2.2 };
/** 글자+띠 묶음의 외곽(글자 캡 상단 ~ 띠 하단). 시안 배치를 그대로 쓰므로 중심은 (50, 51.48). */
const BUNDLE = { x1: 17, y1: 29.95, x2: 83, y2: BELT_BOX.y + BELT_BOX.h };

// og-image 제목 'BJJ 훈련일지' — Noto Sans CJK KR Bold outline, font-size 100, 기준선 y 0, 잉크 왼쪽 x 0.
const GLYPH_TITLE =
  'M0 0L26.4 0C42.7 0 55 -6.9 55 -21.8C55 -31.7 49.2 -37.4 41.2 -39.3L41.2 -39.7C47.5 -42 51.3 -48.9 51.3 -55.8C51.3 -69.6 39.7 -74.1 24.5 -74.1L0 -74.1ZM14.8 -43.9L14.8 -62.7L23.6 -62.7C32.5 -62.7 36.9 -60.1 36.9 -53.6C36.9 -47.7 32.9 -43.9 23.5 -43.9ZM14.8 -11.4L14.8 -33L25.1 -33C35.3 -33 40.6 -29.9 40.6 -22.7C40.6 -15 35.1 -11.4 25.1 -11.4ZM82.1 1.4C98 1.4 105 -10 105 -23.9L105 -74.1L90.2 -74.1L90.2 -25.1C90.2 -14.9 86.8 -11.4 80.3 -11.4C76.1 -11.4 72.1 -13.7 69.3 -19.1L59.2 -11.6C64.1 -2.9 71.4 1.4 82.1 1.4ZM134.4 1.4C150.3 1.4 157.3 -10 157.3 -23.9L157.3 -74.1L142.5 -74.1L142.5 -25.1C142.5 -14.9 139.1 -11.4 132.6 -11.4C128.4 -11.4 124.4 -13.7 121.6 -19.1L111.5 -11.6C116.4 -2.9 123.7 1.4 134.4 1.4ZM234.6 -63.7C214.9 -63.7 203.6 -58.7 203.6 -49.6C203.6 -40.3 214.9 -35.4 234.6 -35.4C254.4 -35.4 265.6 -40.3 265.6 -49.6C265.6 -58.7 254.4 -63.7 234.6 -63.7ZM234.6 -54.4C246.7 -54.4 252 -53 252 -49.6C252 -46.2 246.7 -44.7 234.6 -44.7C222.6 -44.7 217.2 -46.2 217.2 -49.6C217.2 -53 222.6 -54.4 234.6 -54.4ZM192.7 -31.6L192.7 -21.4L229.1 -21.4L229.1 -10.1L242.4 -10.1L242.4 -21.4L276.5 -21.4L276.5 -31.6ZM202.4 -15.6L202.4 7.3L267.3 7.3L267.3 -3.1L215.7 -3.1L215.7 -15.6ZM228 -84.1L228 -76.2L196.7 -76.2L196.7 -66.2L272.2 -66.2L272.2 -76.2L241.2 -76.2L241.2 -84.1ZM288.1 -77.4L288.1 -66.8L315.6 -66.8L315.6 -57.5L288.3 -57.5L288.3 -26.5L295.3 -26.5C311.5 -26.5 321.9 -26.9 333.4 -29L332 -39.6C322.4 -37.9 313.7 -37.3 301.5 -37.2L301.5 -47.6L328.8 -47.6L328.8 -77.4ZM334.2 -48.9L334.2 -38.3L348.9 -38.3L348.9 -15.3L362.3 -15.3L362.3 -83.7L348.9 -83.7L348.9 -69.8L334.2 -69.8L334.2 -59.2L348.9 -59.2L348.9 -48.9ZM300.4 -20.6L300.4 7.1L364.5 7.1L364.5 -3.5L313.7 -3.5L313.7 -20.6ZM402.8 -81.1C388.7 -81.1 378.1 -72.3 378.1 -59.9C378.1 -47.6 388.7 -38.8 402.8 -38.8C417 -38.8 427.6 -47.6 427.6 -59.9C427.6 -72.3 417 -81.1 402.8 -81.1ZM402.8 -70.3C409.7 -70.3 414.7 -66.5 414.7 -59.9C414.7 -53.3 409.7 -49.5 402.8 -49.5C396 -49.5 391 -53.3 391 -59.9C391 -66.5 396 -70.3 402.8 -70.3ZM440.4 -83.7L440.4 -37.4L453.7 -37.4L453.7 -83.7ZM392.1 -2.5L392.1 7.9L456 7.9L456 -2.5L405.2 -2.5L405.2 -8.3L453.7 -8.3L453.7 -33.6L392 -33.6L392 -23.4L440.5 -23.4L440.5 -17.9L392.1 -17.9ZM532.3 -83.7L532.3 8.9L545.6 8.9L545.6 -83.7ZM471.7 -74.9L471.7 -63.9L491.1 -63.9L491.1 -58.7C491.1 -43.1 483.5 -26 468 -19L475.6 -8.5C486.5 -13.5 493.9 -23.5 498 -35.5C502.2 -24.5 509.6 -15.4 520.2 -10.8L527.5 -21.4C512 -27.8 504.5 -43.8 504.5 -58.7L504.5 -63.9L523.7 -63.9L523.7 -74.9Z';
const TITLE_BOX = { w: 545.6, top: -84.1, bottom: 8.9 };

// og-image 1200×630 — 어두운 앱 바탕 위에 타일 아이콘과 제목을 가운데 세로로 쌓는다(정사각형으로 잘려도 둘 다 남는다).
const OG = { w: 1200, h: 630, tile: 260, gap: 48, titleSize: 84 };
// ══════════════════════════════════════════════════════════════════════════

const fmt = (v) => Number(v.toFixed(4)).toString();

/** 둥근 사각형 path. left/right=false 면 그쪽 모서리는 각지게. */
function rectD({ x, y, w, h, rx = 0, left = true, right = true }) {
  const L = left ? rx : 0;
  const R = right ? rx : 0;
  const a = (r, ex, ey) => (r ? `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(ex)} ${fmt(ey)}` : ''); // 각진 모서리는 H/V 가 이미 닿는다
  return (
    `M${fmt(x + L)} ${fmt(y)}H${fmt(x + w - R)}${a(R, x + w, y + R)}V${fmt(y + h - R)}${a(R, x + w - R, y + h)}` +
    `H${fmt(x + L)}${a(L, x, y + h - L)}V${fmt(y + L)}${a(L, x + L, y)}Z`
  );
}

const { y: BY, h: BH } = BELT_BOX;
const RANK_LINES_D = RANK_LINES.xs.map((x) => rectD({ x, y: BY, w: RANK_LINES.w, h: BH })).join('');

/** 컬러 도안 — [fill, pathData] 를 그리는 순서대로. */
export const COLOR_LAYERS = [
  [TEXT, GLYPH_BJJ],
  [BELT, rectD(BELT_BOX)],
  [TEXT, rectD({ x: RANK_BAR.x, y: BY, w: RANK_BAR.w, h: BH })],
  [BELT, RANK_LINES_D],
];

/** 단색(테마 아이콘) — 글자·띠는 흰 실루엣, 랭크바 자리는 뚫고 랭크바 줄만 남긴다. */
export const MONO_LAYERS = [
  [
    MONO,
    GLYPH_BJJ +
      rectD({ ...BELT_BOX, w: RANK_BAR.x - BELT_BOX.x, right: false }) +
      RANK_LINES_D +
      rectD({ ...BELT_BOX, x: RANK_BAR.x + RANK_BAR.w, w: BELT_BOX.x + BELT_BOX.w - RANK_BAR.x - RANK_BAR.w, left: false }),
  ],
];

/** 캔버스 중심 (50,50) 에서 묶음의 가장 먼 모서리까지 거리 — 마스크 안전원 축소 비율의 기준. */
export const REACH = Math.max(
  ...[BUNDLE.x1, BUNDLE.x2].flatMap((x) => [BUNDLE.y1, BUNDLE.y2].map((y) => Math.hypot(x - 50, y - 50))),
);
// 안드로이드 적응형: 108 그리드 안전원 r33 → 묶음은 r31 안(여유 2). maskable: 안전원 r40%(=100 캔버스 40) 에 같은 여유 비율.
// 소수 4자리 내림 — 파일에 적히는 배율 그대로 상한을 넘지 않게.
const floor4 = (v) => Math.floor(v * 1e4) / 1e4;
export const K_ANDROID = floor4(31 / REACH);
export const K_MASKABLE = floor4((40 * 31) / 33 / REACH);

const layersSvg = (layers) => layers.map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('');

/** 시안 배치를 유지한 채 (50,50) 기준으로 k 배 해서 (cx,cy) 에 놓는다. SVG 와 안드로이드 group 이 같은 식을 쓴다. */
const placement = (k, cx, cy) => ({ k, tx: cx - 50 * k, ty: cy - 50 * k });
function placeSvg(k, cx, cy, inner) {
  if (k === 1 && cx === 50 && cy === 50) return inner;
  const p = placement(k, cx, cy);
  return `<g transform="translate(${fmt(p.tx)} ${fmt(p.ty)}) scale(${fmt(p.k)})">${inner}</g>`;
}

const SHAPES = {
  tile: `<rect width="100" height="100" rx="${TILE_RX}" fill="${BG}"/>`,
  square: `<rect width="100" height="100" fill="${BG}"/>`,
  circle: `<circle cx="50" cy="50" r="50" fill="${BG}"/>`,
  none: '',
};

/** 100 캔버스 아이콘. px 가 없으면 width/height 를 생략(favicon.svg). pad 는 100 좌표 단위 투명 여백. */
export function iconSvg({ px, shape = 'tile', pad = 0, k = 1, layers = COLOR_LAYERS } = {}) {
  const size = px ? ` width="${px}" height="${px}"` : '';
  const vb = `${fmt(-pad)} ${fmt(-pad)} ${fmt(100 + 2 * pad)} ${fmt(100 + 2 * pad)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="${vb}">${SHAPES[shape]}${placeSvg(k, 50, 50, layersSvg(layers))}</svg>`;
}

/** 안드로이드 적응형 전경 레이어(108 그리드, 투명 바탕). */
export function foregroundSvg(px, layers = COLOR_LAYERS) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 108 108">${placeSvg(K_ANDROID, 54, 54, layersSvg(layers))}</svg>`;
}

/** og-image 1200×630. */
export function ogSvg() {
  const s = OG.titleSize / 100;
  const titleH = (TITLE_BOX.bottom - TITLE_BOX.top) * s;
  const top = (OG.h - (OG.tile + OG.gap + titleH)) / 2;
  const tileX = (OG.w - OG.tile) / 2;
  const titleX = (OG.w - TITLE_BOX.w * s) / 2;
  const baseline = top + OG.tile + OG.gap - TITLE_BOX.top * s;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.w}" height="${OG.h}" viewBox="0 0 ${OG.w} ${OG.h}">` +
    `<rect width="${OG.w}" height="${OG.h}" fill="${DARK}"/>` +
    `<g transform="translate(${fmt(tileX)} ${fmt(top)}) scale(${fmt(OG.tile / 100)})">${SHAPES.tile}${layersSvg(COLOR_LAYERS)}</g>` +
    `<g transform="translate(${fmt(titleX)} ${fmt(baseline)}) scale(${fmt(s)})"><path fill="${TEXT}" d="${GLYPH_TITLE}"/></g>` +
    `</svg>`
  );
}

function vectorXml(layers) {
  const p = placement(K_ANDROID, 54, 54);
  const paths = layers
    .map(([fill, d]) => `        <path\n            android:fillColor="${fill}"\n            android:pathData="${d}" />`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- web/scripts/gen-app-icons.mjs 가 생성 — 직접 고치지 말고 스크립트를 다시 돌린다 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <!-- 시안(100 좌표)을 108 그리드 중심으로 축소: 묶음 가장 먼 모서리 ${fmt(REACH * K_ANDROID)} ≤ 안전원 r33 -->
    <group
        android:scaleX="${fmt(p.k)}"
        android:scaleY="${fmt(p.k)}"
        android:translateX="${fmt(p.tx)}"
        android:translateY="${fmt(p.ty)}">
${paths}
    </group>
</vector>
`;
}

const ADAPTIVE = `<?xml version="1.0" encoding="utf-8"?>
<!-- web/scripts/gen-app-icons.mjs 가 생성 -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_bjj_foreground"/>
    <!-- 안드로이드 13+ 테마 아이콘: 알파만 쓰이고 색은 배경화면을 따른다 -->
    <monochrome android:drawable="@drawable/ic_bjj_monochrome"/>
</adaptive-icon>
`;

/** PNG 를 그대로 담는 ICO(Vista 이후 모든 브라우저가 읽는다). */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, buf }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(buf.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...images.map((x) => x.buf)]);
}

const pngBuf = (svg, { opaque = false } = {}) => {
  let img = sharp(Buffer.from(svg));
  if (opaque) img = img.flatten({ background: BG });
  return img.png({ compressionLevel: 9 }).toBuffer();
};

function makeWriter(base) {
  const written = [];
  const put = (p, data) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
    written.push([p, data.length]);
  };
  const report = () => {
    for (const [p, n] of written) console.log(`  ✓ ${relative(base, p) || p}  (${n} B)`);
  };
  return { put, report };
}

async function writeWeb(root) {
  const pub = join(root, 'web/public');
  const { put, report } = makeWriter(root);
  put(join(pub, 'icons/icon-192.png'), await pngBuf(iconSvg({ px: 192 })));
  put(join(pub, 'icons/icon-512.png'), await pngBuf(iconSvg({ px: 512 })));
  put(join(pub, 'icons/icon-maskable-512.png'), await pngBuf(iconSvg({ px: 512, shape: 'square', k: K_MASKABLE }), { opaque: true }));
  put(join(pub, 'apple-touch-icon.png'), await pngBuf(iconSvg({ px: 180, shape: 'square' }), { opaque: true }));
  const fav = await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await pngBuf(iconSvg({ px: size })) })));
  put(join(pub, 'favicon.ico'), ico(fav));
  put(join(pub, 'favicon.svg'), `${iconSvg()}\n`);
  put(join(pub, 'og-image.png'), await pngBuf(ogSvg(), { opaque: true }));
  put(
    join(root, 'docs/brand/app-icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 100 100">\n` +
      `<!-- BJJ 훈련일지 앱 아이콘 기준본 — 시안 T1 "BJJ 워드마크 · 브라운"(2026-09-13 확정). web/scripts/gen-app-icons.mjs 가 생성 -->\n` +
      `${SHAPES.tile}${layersSvg(COLOR_LAYERS)}\n</svg>\n`,
  );
  report();
}

async function writeAndroid(res) {
  const { put, report } = makeWriter(res);

  // ── 적응형(API 26+) — 이름을 ic_launcher_foreground 로 두지 않는다: 템플릿 drawable-v24/ic_launcher_foreground.xml 이 API 24+ 에서 이긴다 ──
  put(join(res, 'drawable/ic_bjj_foreground.xml'), vectorXml(COLOR_LAYERS));
  put(join(res, 'drawable/ic_bjj_monochrome.xml'), vectorXml(MONO_LAYERS));
  put(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), ADAPTIVE);
  put(join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), ADAPTIVE);
  put(
    join(res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
  );

  // ── 구형 런처(API 23~25) PNG. 48dp 중 44dp 타일(여백 2dp). 전경 PNG 는 참조되지 않지만 옛 로고가 남지 않게 함께 간다 ──
  const pad = (100 * 2) / 44;
  const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, f] of Object.entries(DENSITY)) {
    const dir = join(res, `mipmap-${name}`);
    put(join(dir, 'ic_launcher.png'), await pngBuf(iconSvg({ px: 48 * f, pad })));
    put(join(dir, 'ic_launcher_round.png'), await pngBuf(iconSvg({ px: 48 * f, pad, shape: 'circle' })));
    put(join(dir, 'ic_launcher_foreground.png'), await pngBuf(foregroundSvg(108 * f)));
  }

  // ── 스플래시: 템플릿 로고를 걷어낸 같은 크기 단색(앱 다크 배경). 늘어나는 비트맵이라 로고를 넣지 않는다 ──
  for (const d of readdirSync(res).filter((x) => x.startsWith('drawable')).sort()) {
    const p = join(res, d, 'splash.png');
    if (!existsSync(p)) continue;
    const { width, height } = await sharp(p).metadata();
    put(p, await sharp({ create: { width, height, channels: 3, background: DARK } }).png({ compressionLevel: 9 }).toBuffer());
  }
  report();
}

function parseArgs(argv) {
  const opts = { android: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--android' || a === '--out') && argv[i + 1]) opts[a.slice(2)] = resolve(argv[++i]);
    else throw new Error(`알 수 없는 인자: ${a}\n사용법: gen-app-icons.mjs [--android <res 디렉터리> | --out <디렉터리>]`);
  }
  if (opts.android && opts.out) throw new Error('--android 와 --out 은 함께 쓰지 않는다');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.android) {
    if (!existsSync(opts.android) || !statSync(opts.android).isDirectory()) {
      throw new Error(`안드로이드 res 디렉터리가 없다: ${opts.android} (cap add android 뒤 app/src/main/res 를 넘긴다)`);
    }
    console.log(`[android] ${opts.android}  K=${fmt(K_ANDROID)} reach=${fmt(REACH * K_ANDROID)}/33`);
    await writeAndroid(opts.android);
  } else {
    const root = opts.out || PROJECT;
    console.log(`[web] ${root}  maskable K=${fmt(K_MASKABLE)} reach=${fmt(REACH * K_MASKABLE)}/40`);
    await writeWeb(root);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

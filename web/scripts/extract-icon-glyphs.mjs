#!/usr/bin/env node
// 앱 아이콘 글자 → SVG path 추출기 (task-038) — gen-app-icons.mjs 의 GLYPH_* 상수가 어디서 왔는지의 기록.
//
// 평소에는 돌릴 일이 없다. 생성기는 이 스크립트가 뽑은 path 문자열을 상수로 박아 두었으므로
// 폰트·opentype.js 없이 결정적으로 돈다. 글자 모양을 바꾸고 싶을 때만 다시 돌려 출력을 생성기에 옮긴다.
//
//   node web/scripts/extract-icon-glyphs.mjs      # 결과 JSON 을 stdout 으로
//
// 🔴 opentype.js·폰트 파일은 프로젝트 의존성이 아니다 — ext4 임시 도구 디렉터리에 둔다(NFS noexec, package.json 오염 방지).
//   mkdir -p ~/.node-local/bjj-tools/fonts && cd ~/.node-local/bjj-tools && npm init -y && npm i opentype.js@1.3.4
//   curl -o fonts/ArchivoBlack.ttf https://fonts.gstatic.com/s/archivoblack/v23/HTxqL289NzCGg4MzN6KJ7eW6OYs.ttf
//     (Archivo Black Regular v1.006 · © 2017 The Archivo Black Project Authors · SIL OFL 1.1 · md5 0ae1329aa90805a3901ff8929e244a38)
//   한글 제목은 시스템 Noto Sans CJK KR Bold(/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc #1, OFL).
//
// 폰트 선택 근거(2026-09-13): 시안은 <text font-family="Arial Black"> 였다. 후보 17종을 사양 상자에 맞춰
// Arial Black(참조용, 배포물에 넣지 않음)과 픽셀 IoU 로 비교 → Archivo Black 96.7% 가 1위
// (Inter Black 94.1 · Source Sans 3 Black 91.5 · Noto Sans CJK Black 86.8). 상세는 task-038 이력서 "dev-038 결과".
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOOLS = join(homedir(), '.node-local/bjj-tools');
const opentype = createRequire(join(TOOLS, 'package.json'))('opentype.js');

// 시안 사양(100×100): 잉크 x 17→83, 기준선 y 55, 캡 높이 25.05(= Arial Black font-size 35 의 B 윗면).
const BJJ_BOX = { x1: 17, x2: 83, base: 55, cap: 25.05 };
const TITLE = 'BJJ 훈련일지';
const TITLE_SIZE = 100; // og-image 에서 transform 으로 크기를 정하므로 기준 크기일 뿐

/** .ttc 는 index 번째 sfnt 를 단독 폰트로 재조립한다(opentype.js 1.3.4 는 'ttcf' 컬렉션을 못 읽는다). */
function loadFont(file, index = 0) {
  const buf = readFileSync(file);
  let out = buf;
  if (buf.toString('latin1', 0, 4) === 'ttcf') {
    const off = buf.readUInt32BE(12 + 4 * index);
    const n = buf.readUInt16BE(off + 4);
    const recs = Array.from({ length: n }, (_, i) => {
      const r = off + 12 + 16 * i;
      return { r, offset: buf.readUInt32BE(r + 8), length: buf.readUInt32BE(r + 12) };
    });
    let cursor = 12 + 16 * n;
    const placed = recs.map((t) => {
      const o = cursor;
      cursor += t.length + ((4 - (t.length % 4)) % 4);
      return { ...t, o };
    });
    out = Buffer.alloc(cursor);
    buf.copy(out, 0, off, off + 12);
    placed.forEach((t, i) => {
      buf.copy(out, 12 + 16 * i, t.r, t.r + 8); // tag + checksum
      out.writeUInt32BE(t.o, 12 + 16 * i + 8);
      out.writeUInt32BE(t.length, 12 + 16 * i + 12);
      buf.copy(out, t.o, t.offset, t.offset + t.length);
    });
  }
  return opentype.parse(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
}

const r2 = (v) => Number(v.toFixed(2)).toString();

/** opentype Path 를 (x,y) 변환 함수로 옮겨 SVG/Android 공용 path 문자열로. */
function toD(path, tx, ty) {
  let last = '';
  return path.commands
    .map((c) => {
      if (c.type === 'Z') return (last = '', 'Z');
      const end = `${tx(c.x)} ${ty(c.y)}`;
      // opentype.js 가 곡선 끝점에 길이 0 짜리 L 을 덧붙인다 — 그림엔 영향이 없어 뺀다.
      if (c.type === 'L' && end === last) return '';
      last = end;
      if (c.type === 'M' || c.type === 'L') return `${c.type}${end}`;
      if (c.type === 'Q') return `Q${tx(c.x1)} ${ty(c.y1)} ${end}`;
      return `C${tx(c.x1)} ${ty(c.y1)} ${tx(c.x2)} ${ty(c.y2)} ${end}`;
    })
    .join('');
}

// ── BJJ 워드마크: 잉크 폭을 66 으로(가로 스케일), 캡 높이를 25.05 로(세로 스케일) ──
const black = loadFont(join(TOOLS, 'fonts/ArchivoBlack.ttf'));
const S = 1000;
const bjj = black.getPath('BJJ', 0, 0, S, { kerning: true });
const bb = bjj.getBoundingBox();
const capTop = -black.getPath('B', 0, 0, S).getBoundingBox().y1;
const sx = (BJJ_BOX.x2 - BJJ_BOX.x1) / (bb.x2 - bb.x1);
const sy = BJJ_BOX.cap / capTop;
const GLYPH_BJJ = toD(bjj, (x) => r2(BJJ_BOX.x1 + (x - bb.x1) * sx), (y) => r2(BJJ_BOX.base + y * sy));

// ── og-image 제목: 기준선 y=0, 잉크 왼쪽 x=0, font-size 100 ──
const bold = loadFont('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 1);
const title = bold.getPath(TITLE, 0, 0, TITLE_SIZE, { kerning: true });
const tb = title.getBoundingBox();
const GLYPH_TITLE = toD(title, (x) => r2(x - tb.x1), (y) => r2(y));

console.log(
  JSON.stringify(
    {
      source: { bjj: `${black.names.fullName.en} ${black.names.version.en}`, title: `${bold.names.fullName.en} ${bold.names.version.en}` },
      GLYPH_BJJ,
      GLYPH_BJJ_BOX: { x1: 17, y1: r2(BJJ_BOX.base - BJJ_BOX.cap), x2: 83, y2: r2(BJJ_BOX.base + bb.y2 * sy) },
      scale: { sx: r2(sx * 1000), sy: r2(sy * 1000), distort: r2(sx / sy) },
      GLYPH_TITLE,
      GLYPH_TITLE_BOX: { x1: 0, y1: r2(tb.y1), x2: r2(tb.x2 - tb.x1), y2: r2(tb.y2) },
    },
    null,
    1,
  ),
);

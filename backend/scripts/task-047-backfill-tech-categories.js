#!/usr/bin/env node
// task-047 — 1회성: 기술트리 `techniques.category` 를 새 체계로 채운다(task-046 관장 분류표 = 데모 TAXONOMY 와 같은 매핑).
//
// 사용 (🔴 --user 는 필수. 쓰기는 --apply 가 있을 때만):
//   node backend/scripts/task-047-backfill-tech-categories.js --user 3                    # dry-run(기본) — 행별 전→후, 쓰기 0
//   node backend/scripts/task-047-backfill-tech-categories.js --user 3 --apply            # 백업 파일 쓰고 → 한 트랜잭션 UPDATE
//   node backend/scripts/task-047-backfill-tech-categories.js --user 3 --restore <file>   # 복원 dry-run
//   node backend/scripts/task-047-backfill-tech-categories.js --user 3 --restore <file> --apply   # 복원 적용
//   옵션: --backup-dir <dir>  (기본 ~/.local/share/bjj-backups)
//
// 원칙
// - 이름 비교 = techMatch.normalize(NFC·소문자·공백/하이픈/중점 제거) — "시저스 스윕" ≡ "시저스스윕".
// - 분류표에 없는 이름(미정 4: 매트릭스·사지오로·키마스터·밸리다운 포함)은 **건드리지 않는다.** 이미 같은 값이면 건너뛴다.
// - 모든 SELECT·UPDATE 에 user_id 조건. UPDATE 는 `category <=> 옛 값` 까지 걸어 계획 뒤에 바뀐 행은 덮지 않는다
//   (한 행이라도 어긋나면 전체 롤백).
// - --apply 는 먼저 바꿀 행의 id·name·category(전·후)를 백업 파일(JSON, 600)로 쓴 뒤 트랜잭션을 연다.
// - --restore 는 백업의 "후" 값 그대로인 행만 "전" 값으로 되돌린다. 그 뒤에 사용자가 기술 관리 화면에서 바꾼 행은
//   덮지 않고 목록으로 알려 준다.
// - 스키마 변경 없음(`techniques.category` varchar(50) 기존 칸).
// 🔴 개발·운영이 같은 DB 다. 운영 사용자(user 3) 적용은 QA PASS 뒤 Leader 가 dry-run 을 확인하고 --apply.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env'), quiet: true });
const mysql = require(path.join(BACKEND, 'node_modules', 'mysql2', 'promise'));
const { normalize } = require(path.join(BACKEND, 'src', 'utils', 'techMatch'));

// 🔴 web/src/utils/baseOptions.js 의 TECH_CATEGORIES(6) + EXCLUDED_CATEGORIES(2) 와 같아야 한다 — 다르면 매핑이 틀린 것.
const ALLOWED = ['서브미션', '패스', '스윕', '컨트롤', '탈출', '테이크다운', '포지션', '기타'];

// task-046 관장 제안 ③ — user 3 기술트리 56행 분류안(이름 55개, 앵클락 2행). 미정 4개는 넣지 않는다(= 건드리지 않음).
// 합계: 서브미션 13이름(14행) · 패스 7 · 스윕 5 · 컨트롤 6 · 탈출 0 · 테이크다운 1 · 포지션 15 · 기타 4 = 51이름(52행) + 미정 4 = 56행.
const TAXONOMY = {
  '서브미션':   ['기무라', '암바', '트라이앵글 쵸크', '리어네이키드 초크', '루프 쵸크', '칸토 쵸크', '깃 쵸크',
                 '보우 앤 애로우', '니어네이키트 쵸크', '오모플라타', '바라토플라타', '초이(choi) 바', '앵클락'],
  '패스':       ['니슬라이드', '크레이지독 패스', '엑스패스', '롱스탭', '토레안도', '니컷', '싱글언더 패스'],
  '스윕':       ['시저스 스윕', '버터플라이 스윕', '엑스가드 스윕', '100퍼스윕', '트라이포드'],
  '컨트롤':     ['백테이크', '백포지션', '베림보로', '마운트', '사이드', '스카프홀드'],
  '탈출':       [],
  '테이크다운': ['더블렉'],
  '포지션':     ['하프가드', '딥 하프가드', '델라리바', 'k가드', '윌리엄 가드', '라쏘', '리버스 엑스가드', '싱글엑스',
                 '엑스가드', '싯팅 가드', '오픈가드', '스파이더', '웜가드', '웨이터 가드', '컴뱃가드'],
  '기타':       ['스윕', '테이크다운', '탈출', '가드패스'],
};
const UNDECIDED = ['매트릭스', '사지오로', '키마스터', '밸리다운'];   // 미정 — 건드리지 않음(출력에 표시만)

function buildMap() {
  const m = new Map();
  for (const [cat, names] of Object.entries(TAXONOMY)) {
    if (!ALLOWED.includes(cat)) throw new Error(`분류표 카테고리 「${cat}」가 허용 값이 아님`);
    for (const n of names) {
      const k = normalize(n);
      if (m.has(k) && m.get(k) !== cat) throw new Error(`분류표 중복 이름 「${n}」: ${m.get(k)} / ${cat}`);
      m.set(k, cat);
    }
  }
  for (const n of UNDECIDED) if (m.has(normalize(n))) throw new Error(`미정 이름 「${n}」이 분류표에 들어 있음`);
  return m;
}

function parseArgs(argv) {
  const a = { user: null, apply: false, restore: null, backupDir: path.join(os.homedir(), '.local', 'share', 'bjj-backups') };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--user') a.user = argv[++i];
    else if (v === '--apply') a.apply = true;
    else if (v === '--dry-run') a.apply = false;
    else if (v === '--restore') a.restore = argv[++i];
    else if (v === '--backup-dir') a.backupDir = argv[++i];
    else throw new Error(`모르는 인자: ${v}`);
  }
  const uid = Number(a.user);
  if (!Number.isInteger(uid) || uid <= 0) throw new Error('--user <양의 정수> 가 필요합니다');
  a.user = uid;
  if (a.restore === undefined || a.restore === '') throw new Error('--restore <백업 파일> 경로가 비었습니다');
  return a;
}

const show = v => (v === null || v === undefined || v === '' ? '(빈 값)' : v);
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 계획(순수 계산) — rows: 이 사용자의 [{id,name,category}] */
function planBackfill(rows, map) {
  const changes = [], same = [], untouched = [];
  for (const r of rows) {
    const target = map.get(normalize(r.name));
    const cur = r.category ?? '';
    if (target === undefined) untouched.push(r);
    else if (cur === target) same.push(r);
    else changes.push({ id: r.id, name: r.name, before: r.category, after: target });
  }
  return { changes, same, untouched };
}

async function runBackfill(conn, args, map) {
  const [rows] = await conn.query('SELECT id, name, category FROM techniques WHERE user_id = ? ORDER BY id', [args.user]);
  const { changes, same, untouched } = planBackfill(rows, map);

  console.log(`# task-047 기술 카테고리 백필 — user ${args.user} · 기술 ${rows.length}행 · DB ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  console.log(`# 모드: ${args.apply ? 'APPLY (한 트랜잭션)' : 'DRY-RUN (쓰지 않음)'}\n`);
  console.log('## 바꿀 행 (id · 이름 · 전 → 후)');
  for (const c of changes) console.log(`  ${c.id}\t${c.name}\t${show(c.before)} → ${c.after}`);
  if (!changes.length) console.log('  (없음)');
  console.log(`\n## 이미 같은 값 — 건너뜀: ${same.length}행`);
  for (const r of same) console.log(`  ${r.id}\t${r.name}\t${show(r.category)}`);
  console.log(`\n## 분류표에 없음 — 건드리지 않음: ${untouched.length}행`);
  for (const r of untouched) {
    const tag = UNDECIDED.some(n => normalize(n) === normalize(r.name)) ? ' ← 미정(사용자 확인 대기)' : '';
    console.log(`  ${r.id}\t${r.name}\t${show(r.category)}${tag}`);
  }
  const afterCount = {};
  for (const r of rows) {
    const c = changes.find(x => x.id === r.id);
    const v = c ? c.after : (r.category || '(빈 값)');
    afterCount[v] = (afterCount[v] || 0) + 1;
  }
  console.log(`\n## 적용 후 category 분포(예상): ${JSON.stringify(afterCount)}`);
  console.log(`## 요약: 바꿈 ${changes.length} · 같음 ${same.length} · 안 건드림 ${untouched.length} (합 ${rows.length})`);

  if (!args.apply) { console.log('\nDRY-RUN — DB 에 쓰지 않았습니다. 적용하려면 --apply 를 붙이세요.'); return; }
  if (!changes.length) { console.log('\n바꿀 행이 없어 아무것도 쓰지 않았습니다(백업 파일도 만들지 않음).'); return; }

  // 1) 백업 먼저 — 트랜잭션 전에 파일이 디스크에 있어야 한다
  fs.mkdirSync(args.backupDir, { recursive: true, mode: 0o700 });
  const file = path.join(args.backupDir, `task-047-${stamp()}-user${args.user}.json`);
  const backup = {
    task: 'task-047', kind: 'techniques.category backfill', created_at: new Date().toISOString(),
    db: process.env.DB_NAME, host: process.env.DB_HOST, user_id: args.user,
    rows: changes.map(c => ({ id: c.id, name: c.name, category: c.before, after: c.after })),
  };
  fs.writeFileSync(file, JSON.stringify(backup, null, 2), { mode: 0o600 });
  console.log(`\n백업: ${file} (${changes.length}행)`);

  // 2) 한 트랜잭션 — 잠그고 다시 읽어 계획이 그대로인지 확인한 뒤, 옛 값 조건을 건 UPDATE
  await conn.beginTransaction();
  try {
    const [locked] = await conn.query('SELECT id, name, category FROM techniques WHERE user_id = ? ORDER BY id FOR UPDATE', [args.user]);
    const again = planBackfill(locked, map).changes;
    if (JSON.stringify(again) !== JSON.stringify(changes)) throw new Error('dry-run 계획 뒤에 기술트리가 바뀌었습니다 — 다시 실행하세요');
    for (const c of changes) {
      const [r] = await conn.query(
        'UPDATE techniques SET category = ? WHERE id = ? AND user_id = ? AND category <=> ?',
        [c.after, c.id, args.user, c.before],
      );
      if (r.affectedRows !== 1) throw new Error(`id ${c.id}(${c.name}) UPDATE 영향 ${r.affectedRows}행 — 전체 롤백`);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(`\n🔴 롤백 — 아무것도 바뀌지 않았습니다: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  const [post] = await conn.query('SELECT id, category FROM techniques WHERE user_id = ?', [args.user]);
  const byId = new Map(post.map(r => [r.id, r.category]));
  const bad = changes.filter(c => byId.get(c.id) !== c.after);
  console.log(`\nAPPLY 완료 — ${changes.length}행 커밋. 재조회 확인: ${bad.length ? `🔴 불일치 ${bad.map(b => b.id).join(',')}` : '전부 일치'}`);
  console.log(`되돌리기: node ${__filename} --user ${args.user} --restore ${file} --apply`);
}

/** 백업 파일 읽기·검사 — DB 에 붙기 **전에** 한다(파일이 틀렸으면 연결도 하지 않는다). */
function loadBackup(args) {
  const file = path.resolve(args.restore.replace(/^~(?=$|\/)/, os.homedir()));
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (backup.task !== 'task-047' || !Array.isArray(backup.rows)) throw new Error('task-047 백업 파일이 아닙니다');
  if (Number(backup.user_id) !== args.user) throw new Error(`백업은 user ${backup.user_id} 것 — --user ${args.user} 와 다릅니다`);
  return { file, backup };
}

async function runRestore(conn, args, { file, backup }) {

  const ids = backup.rows.map(r => r.id);
  const [rows] = ids.length
    ? await conn.query('SELECT id, name, category FROM techniques WHERE user_id = ? AND id IN (?)', [args.user, ids])
    : [[]];
  const cur = new Map(rows.map(r => [r.id, r]));
  const todo = [], already = [], conflict = [], missing = [];
  for (const b of backup.rows) {
    const r = cur.get(b.id);
    if (!r) missing.push(b);
    else if ((r.category ?? '') === (b.category ?? '')) already.push(b);
    else if ((r.category ?? '') === (b.after ?? '')) todo.push({ ...b, now: r.category });
    else conflict.push({ ...b, now: r.category });
  }
  console.log(`# task-047 복원 — ${file}`);
  console.log(`# user ${args.user} · 백업 ${backup.rows.length}행 · 모드: ${args.apply ? 'APPLY (한 트랜잭션)' : 'DRY-RUN (쓰지 않음)'}\n`);
  console.log('## 되돌릴 행 (id · 이름 · 지금 → 백업 값)');
  for (const t of todo) console.log(`  ${t.id}\t${t.name}\t${show(t.now)} → ${show(t.category)}`);
  if (!todo.length) console.log('  (없음)');
  console.log(`\n## 이미 백업 값: ${already.length}행`);
  console.log(`## 백필 뒤에 다른 값으로 바뀜 — 덮지 않음: ${conflict.length}행`);
  for (const c of conflict) console.log(`  ${c.id}\t${c.name}\t지금 ${show(c.now)} (백필 값 ${show(c.after)}, 백업 값 ${show(c.category)})`);
  console.log(`## 행이 없음(삭제됨): ${missing.length}행`);
  for (const m of missing) console.log(`  ${m.id}\t${m.name}`);

  if (!args.apply) { console.log('\nDRY-RUN — DB 에 쓰지 않았습니다. 복원하려면 --apply 를 붙이세요.'); return; }
  if (!todo.length) { console.log('\n되돌릴 행이 없어 아무것도 쓰지 않았습니다.'); return; }
  await conn.beginTransaction();
  try {
    for (const t of todo) {
      const [r] = await conn.query(
        'UPDATE techniques SET category = ? WHERE id = ? AND user_id = ? AND category <=> ?',
        [t.category ?? '', t.id, args.user, t.now],
      );
      if (r.affectedRows !== 1) throw new Error(`id ${t.id}(${t.name}) UPDATE 영향 ${r.affectedRows}행 — 전체 롤백`);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(`\n🔴 롤백 — 아무것도 바뀌지 않았습니다: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nRESTORE 완료 — ${todo.length}행 커밋.`);
}

async function main() {
  let args, conn;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`사용법 오류: ${e.message}\n  node ${path.basename(__filename)} --user <id> [--apply] [--restore <file>] [--backup-dir <dir>]`);
    process.exit(2);
  }
  const map = buildMap();
  let restoreSrc = null;
  try {
    if (args.restore) restoreSrc = loadBackup(args);
  } catch (e) {
    console.error(`🔴 백업 파일 오류: ${e.message}`);
    process.exit(1);
  }
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
      charset: 'utf8mb4',
    });
    if (restoreSrc) await runRestore(conn, args, restoreSrc);
    else await runBackfill(conn, args, map);
  } catch (e) {
    console.error(`🔴 실패: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

// require 로 불러오면(검증 하네스) 실행하지 않고 매핑·계획 함수만 내준다.
if (require.main === module) main();
module.exports = { TAXONOMY, UNDECIDED, ALLOWED, buildMap, planBackfill };

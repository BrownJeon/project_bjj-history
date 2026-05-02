require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  dateStrings: true,
});

function fmtDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function safeParse(val, fallback) {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || '[]'); } catch { return fallback; }
}

async function migrateToClasses() {
  const [drills] = await pool.query('SELECT * FROM drills WHERE class_id IS NULL');
  const [spars]  = await pool.query('SELECT * FROM spar_days WHERE class_id IS NULL');
  if (!drills.length && !spars.length) return;

  for (const d of drills) {
    const date    = fmtDate(d.date);
    const dateEnd = fmtDate(d.date_end);
    const [r] = await pool.query('INSERT INTO classes (date, date_end, note) VALUES (?,?,?)', [date, dateEnd, '']);
    await pool.query('UPDATE drills SET class_id=? WHERE id=?', [r.insertId, d.id]);
  }

  for (const sd of spars) {
    const date    = fmtDate(sd.date);
    const dateEnd = fmtDate(sd.date_end);
    const [r] = await pool.query('INSERT INTO classes (date, date_end, note) VALUES (?,?,?)', [date, dateEnd, sd.day_note || '']);
    await pool.query('UPDATE spar_days SET class_id=? WHERE id=?', [r.insertId, sd.id]);
  }

  console.log(`마이그레이션: drills ${drills.length}개, spar_days ${spars.length}개 → classes`);
}

async function setupDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      date_end DATE NULL,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [[drillCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='drills' AND COLUMN_NAME='class_id'`,
    [process.env.DB_NAME]
  );
  if (!drillCol) await pool.query('ALTER TABLE drills ADD COLUMN class_id INT NULL');

  const [[sparCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='spar_days' AND COLUMN_NAME='class_id'`,
    [process.env.DB_NAME]
  );
  if (!sparCol) await pool.query('ALTER TABLE spar_days ADD COLUMN class_id INT NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nickname VARCHAR(100) DEFAULT '',
      start_date DATE NULL,
      weight_class VARCHAR(20) DEFAULT '',
      network VARCHAR(100) DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS belt_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      belt VARCHAR(10) NOT NULL,
      stripes TINYINT DEFAULT 0,
      achieved_date DATE NOT NULL,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gameplans (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(200) NOT NULL,
      start_pos  VARCHAR(100) DEFAULT '',
      note       TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gameplan_nodes (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      gameplan_id  INT NOT NULL,
      technique_id INT NULL,
      label        VARCHAR(200) DEFAULT '',
      is_finish    TINYINT DEFAULT 0,
      note         TEXT DEFAULT '',
      FOREIGN KEY (gameplan_id) REFERENCES gameplans(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gameplan_edges (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      gameplan_id   INT NOT NULL,
      from_node_id  INT NOT NULL,
      to_node_id    INT NOT NULL,
      \`condition\`  VARCHAR(300) DEFAULT '',
      FOREIGN KEY (gameplan_id)  REFERENCES gameplans(id)  ON DELETE CASCADE,
      FOREIGN KEY (from_node_id) REFERENCES gameplan_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (to_node_id)   REFERENCES gameplan_nodes(id) ON DELETE CASCADE
    )
  `);

  // gameplans.starred 컬럼 마이그레이션
  const [[gpStarCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='gameplans' AND COLUMN_NAME='starred'`,
    [process.env.DB_NAME]
  );
  if (!gpStarCol) await pool.query('ALTER TABLE gameplans ADD COLUMN starred TINYINT DEFAULT 0');

  // gameplans.end_pos 컬럼 마이그레이션
  const [[gpEndPosCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='gameplans' AND COLUMN_NAME='end_pos'`,
    [process.env.DB_NAME]
  );
  if (!gpEndPosCol) await pool.query("ALTER TABLE gameplans ADD COLUMN end_pos VARCHAR(100) DEFAULT ''");

  // techniques.category 컬럼 마이그레이션
  const [[techCatCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='techniques' AND COLUMN_NAME='category'`,
    [process.env.DB_NAME]
  );
  if (!techCatCol) await pool.query("ALTER TABLE techniques ADD COLUMN category VARCHAR(50) DEFAULT ''");

  // drills.chain_ids 컬럼 마이그레이션
  const [[chainIdsCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='drills' AND COLUMN_NAME='chain_ids'`,
    [process.env.DB_NAME]
  );
  if(!chainIdsCol) await pool.query("ALTER TABLE drills ADD COLUMN chain_ids TEXT DEFAULT '[]'");

  // classes.theme 컬럼 마이그레이션
  const [[themeCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='classes' AND COLUMN_NAME='theme'`,
    [process.env.DB_NAME]
  );
  if(!themeCol) await pool.query("ALTER TABLE classes ADD COLUMN theme VARCHAR(200) DEFAULT ''");

  // classes.trained_dates 컬럼 마이그레이션
  const [[tdCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='classes' AND COLUMN_NAME='trained_dates'`,
    [process.env.DB_NAME]
  );
  if(!tdCol) await pool.query("ALTER TABLE classes ADD COLUMN trained_dates TEXT DEFAULT '[]'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_clips (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(255) NOT NULL,
      url         TEXT NOT NULL,
      platform    VARCHAR(20) DEFAULT 'other',
      description TEXT DEFAULT '',
      tech_id     INT NULL,
      tags        JSON DEFAULT '[]',
      starred     TINYINT DEFAULT 0,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tech_id) REFERENCES techniques(id) ON DELETE SET NULL
    )
  `);

  // video_clips.tech_name 컬럼 마이그레이션 (기술명 텍스트 직접 저장)
  const [[clipTechNameCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='video_clips' AND COLUMN_NAME='tech_name'`,
    [process.env.DB_NAME]
  );
  if (!clipTechNameCol) {
    await pool.query("ALTER TABLE video_clips ADD COLUMN tech_name VARCHAR(150) DEFAULT ''");
    await pool.query("CREATE INDEX idx_video_clips_tech_name ON video_clips(tech_name)");
    // 기존 tech_id 데이터를 tech_name 으로 백필
    await pool.query(`
      UPDATE video_clips vc
      JOIN techniques t ON vc.tech_id = t.id
      SET vc.tech_name = t.name
      WHERE (vc.tech_name IS NULL OR vc.tech_name = '') AND vc.tech_id IS NOT NULL
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_reports (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      type          VARCHAR(20) NOT NULL,
      period_start  DATE,
      period_end    DATE,
      question      TEXT,
      content       JSON NOT NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_type_created (type, created_at)
    )
  `);

  // classes.feedback 컬럼 마이그레이션
  const [[feedbackCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='classes' AND COLUMN_NAME='feedback'`,
    [process.env.DB_NAME]
  );
  if(!feedbackCol) await pool.query("ALTER TABLE classes ADD COLUMN feedback TEXT");

  // spar_days.links 컬럼 마이그레이션
  const [[sparLinksCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='spar_days' AND COLUMN_NAME='links'`,
    [process.env.DB_NAME]
  );
  if (!sparLinksCol) await pool.query("ALTER TABLE spar_days ADD COLUMN links JSON DEFAULT '[]'");

  // spar_sessions.opponent 컬럼 마이그레이션
  const [[sparOppCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='spar_sessions' AND COLUMN_NAME='opponent'`,
    [process.env.DB_NAME]
  );
  if (!sparOppCol) await pool.query("ALTER TABLE spar_sessions ADD COLUMN opponent VARCHAR(100) DEFAULT ''");

  // spar_sessions.positions 컬럼 마이그레이션
  const [[sparPosCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='spar_sessions' AND COLUMN_NAME='positions'`,
    [process.env.DB_NAME]
  );
  if (!sparPosCol) await pool.query("ALTER TABLE spar_sessions ADD COLUMN positions JSON DEFAULT ('[]')");

  // spar_sessions.position_score 컬럼 마이그레이션
  const [[sparPosScoreCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='spar_sessions' AND COLUMN_NAME='position_score'`,
    [process.env.DB_NAME]
  );
  if (!sparPosScoreCol) await pool.query("ALTER TABLE spar_sessions ADD COLUMN position_score TINYINT DEFAULT 0");

  // profile.avatar 컬럼 마이그레이션
  const [[profileAvatarCol]] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=? AND TABLE_NAME='profile' AND COLUMN_NAME='avatar'`,
    [process.env.DB_NAME]
  );
  if (!profileAvatarCol) await pool.query("ALTER TABLE profile ADD COLUMN avatar VARCHAR(255) DEFAULT NULL");

  // clips ↔ techniques (N:M)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clip_techniques (
      clip_id INT NOT NULL,
      tech_id INT NOT NULL,
      PRIMARY KEY (clip_id, tech_id),
      FOREIGN KEY (clip_id) REFERENCES video_clips(id) ON DELETE CASCADE,
      FOREIGN KEY (tech_id) REFERENCES techniques(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS technique_clips (
      tech_id INT NOT NULL,
      clip_id INT NOT NULL,
      position INT DEFAULT 0,
      PRIMARY KEY (tech_id, clip_id),
      FOREIGN KEY (tech_id) REFERENCES techniques(id) ON DELETE CASCADE,
      FOREIGN KEY (clip_id) REFERENCES video_clips(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS drill_clips (
      drill_id INT NOT NULL,
      clip_id INT NOT NULL,
      position INT DEFAULT 0,
      PRIMARY KEY (drill_id, clip_id),
      FOREIGN KEY (drill_id) REFERENCES drills(id) ON DELETE CASCADE,
      FOREIGN KEY (clip_id) REFERENCES video_clips(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS spar_day_clips (
      spar_day_id INT NOT NULL,
      clip_id INT NOT NULL,
      position INT DEFAULT 0,
      PRIMARY KEY (spar_day_id, clip_id),
      FOREIGN KEY (spar_day_id) REFERENCES spar_days(id) ON DELETE CASCADE,
      FOREIGN KEY (clip_id) REFERENCES video_clips(id) ON DELETE CASCADE
    )
  `);

  await migrateToClasses();
  await migrateLinksToClips();
}

function detectPlatform(url) {
  if (!url) return 'other';
  if (url.includes('youtu')) return 'youtube';
  if (url.includes('instagram')) return 'instagram';
  return 'other';
}

async function findOrCreateClip(url, desc, techId) {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) return null;
  const [[existing]] = await pool.query('SELECT id FROM video_clips WHERE url = ? LIMIT 1', [cleanUrl]);
  if (existing) return existing.id;
  const platform = detectPlatform(cleanUrl);
  const title = (desc && desc.trim()) || (platform === 'youtube' ? 'YouTube 영상' : platform === 'instagram' ? 'Instagram 영상' : '외부 링크');
  const [r] = await pool.query(
    'INSERT INTO video_clips (title, url, platform, description, tech_id, tags) VALUES (?,?,?,?,?,?)',
    [title, cleanUrl, platform, '', techId || null, '[]']
  );
  return r.insertId;
}

async function migrateLinksToClips() {
  const [techs] = await pool.query(`SELECT id, links FROM techniques WHERE links IS NOT NULL AND links <> '' AND links <> '[]'`);
  const [drills] = await pool.query(`SELECT id, links FROM drills WHERE links IS NOT NULL AND links <> '' AND links <> '[]'`);
  const [spars] = await pool.query(`SELECT id, links FROM spar_days WHERE links IS NOT NULL AND links <> '' AND links <> '[]'`);

  if (!techs.length && !drills.length && !spars.length) return;

  let migrated = 0;

  for (const t of techs) {
    const arr = safeParse(t.links, []);
    let pos = 0;
    for (const l of arr) {
      const url = typeof l === 'string' ? l : (l && l.url);
      const desc = typeof l === 'object' && l ? (l.desc || '') : '';
      if (!url) continue;
      const clipId = await findOrCreateClip(url, desc, t.id);
      if (!clipId) continue;
      await pool.query('INSERT IGNORE INTO technique_clips (tech_id, clip_id, position) VALUES (?,?,?)', [t.id, clipId, pos++]);
      await pool.query('INSERT IGNORE INTO clip_techniques (clip_id, tech_id) VALUES (?,?)', [clipId, t.id]);
      migrated++;
    }
    await pool.query('UPDATE techniques SET links = ? WHERE id = ?', ['[]', t.id]);
  }

  for (const d of drills) {
    const arr = safeParse(d.links, []);
    let pos = 0;
    for (const l of arr) {
      const url = typeof l === 'string' ? l : (l && l.url);
      const desc = typeof l === 'object' && l ? (l.desc || '') : '';
      if (!url) continue;
      const clipId = await findOrCreateClip(url, desc, null);
      if (!clipId) continue;
      await pool.query('INSERT IGNORE INTO drill_clips (drill_id, clip_id, position) VALUES (?,?,?)', [d.id, clipId, pos++]);
      migrated++;
    }
    await pool.query('UPDATE drills SET links = ? WHERE id = ?', ['[]', d.id]);
  }

  for (const sd of spars) {
    const arr = safeParse(sd.links, []);
    let pos = 0;
    for (const l of arr) {
      const url = typeof l === 'string' ? l : (l && l.url);
      const desc = typeof l === 'object' && l ? (l.desc || '') : '';
      if (!url) continue;
      const clipId = await findOrCreateClip(url, desc, null);
      if (!clipId) continue;
      await pool.query('INSERT IGNORE INTO spar_day_clips (spar_day_id, clip_id, position) VALUES (?,?,?)', [sd.id, clipId, pos++]);
      migrated++;
    }
    await pool.query('UPDATE spar_days SET links = ? WHERE id = ?', ['[]', sd.id]);
  }

  // 기존 video_clips.tech_id 기반 단일 연결도 N:M 조인 테이블로 복제
  const [legacyClips] = await pool.query('SELECT id, tech_id FROM video_clips WHERE tech_id IS NOT NULL');
  for (const c of legacyClips) {
    await pool.query('INSERT IGNORE INTO clip_techniques (clip_id, tech_id) VALUES (?,?)', [c.id, c.tech_id]);
  }

  console.log(`[migrate] links_migrated_v1 완료: techniques ${techs.length}, drills ${drills.length}, spar_days ${spars.length}, 총 ${migrated}건 → clips 참조 이관`);
}

module.exports = { pool, setupDB, fmtDate, safeParse };

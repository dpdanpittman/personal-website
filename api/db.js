// SQLite-backed post store. Replaces the previous read-mutate-write JSON
// pattern in server.js, which raced under concurrent writes and could
// truncate the whole blog on a mid-write crash.
//
// better-sqlite3 is synchronous and each prepared statement is atomic, so
// the race is gone "for free". We keep the read/write API in the same shape
// the existing handlers expect (array of post objects) to minimise blast
// radius of the migration.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH =
  process.env.POSTS_DB_PATH || path.join(__dirname, "data", "posts.sqlite");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// One table per content stream — schemas are identical but separated so
// callers can't accidentally cross-write.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS blog_posts (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  date TEXT,
  createdAt TEXT,
  updatedAt TEXT,
  tags TEXT,           -- JSON array
  sources TEXT,        -- JSON array
  editorNotes TEXT,    -- JSON object or null
  qualityScore REAL,
  readingTime INTEGER
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_date ON blog_posts(date DESC, createdAt DESC);

CREATE TABLE IF NOT EXISTS hamradio_posts (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  date TEXT,
  createdAt TEXT,
  updatedAt TEXT,
  tags TEXT,
  sources TEXT,
  editorNotes TEXT,
  qualityScore REAL,
  readingTime INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hamradio_posts_date ON hamradio_posts(date DESC, createdAt DESC);

-- Grow log: its own section, never part of the main blog feed.
CREATE TABLE IF NOT EXISTS grow_posts (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  date TEXT,
  plants TEXT,         -- JSON array, e.g. ["veg tent"]
  stage TEXT,          -- e.g. "week 4 of flower"
  photo TEXT,          -- stored file name in the photos folder (random hex + extension)
  createdAt TEXT,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_grow_posts_date ON grow_posts(date DESC, createdAt DESC);
`;
db.exec(SCHEMA);

// Row → post object (parse JSON-encoded columns).
function rowToPost(row) {
  if (!row) return null;
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    sources: row.sources ? JSON.parse(row.sources) : [],
    editorNotes: row.editorNotes ? JSON.parse(row.editorNotes) : null,
  };
}

// Post object → row params (stringify JSON-encoded columns).
function postToRow(p) {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? null,
    content: p.content,
    date: p.date ?? null,
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
    tags: JSON.stringify(p.tags ?? []),
    sources: JSON.stringify(p.sources ?? []),
    editorNotes: p.editorNotes ? JSON.stringify(p.editorNotes) : null,
    qualityScore: typeof p.qualityScore === "number" ? p.qualityScore : null,
    readingTime: typeof p.readingTime === "number" ? p.readingTime : null,
  };
}

function makeStore(tableName) {
  const selectAll = db.prepare(
    `SELECT * FROM ${tableName} ORDER BY date DESC, createdAt DESC`,
  );
  const selectOne = db.prepare(`SELECT * FROM ${tableName} WHERE slug = ?`);
  const upsert = db.prepare(`
    INSERT INTO ${tableName} (slug, title, excerpt, content, date, createdAt, updatedAt, tags, sources, editorNotes, qualityScore, readingTime)
    VALUES (@slug, @title, @excerpt, @content, @date, @createdAt, @updatedAt, @tags, @sources, @editorNotes, @qualityScore, @readingTime)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title,
      excerpt=excluded.excerpt,
      content=excluded.content,
      date=excluded.date,
      createdAt=excluded.createdAt,
      updatedAt=excluded.updatedAt,
      tags=excluded.tags,
      sources=excluded.sources,
      editorNotes=excluded.editorNotes,
      qualityScore=excluded.qualityScore,
      readingTime=excluded.readingTime
  `);
  const deleteOne = db.prepare(`DELETE FROM ${tableName} WHERE slug = ?`);
  const replaceAll = db.transaction((posts) => {
    db.prepare(`DELETE FROM ${tableName}`).run();
    for (const p of posts) upsert.run(postToRow(p));
  });

  return {
    list: () => selectAll.all().map(rowToPost),
    get: (slug) => rowToPost(selectOne.get(slug)),
    save: (post) => upsert.run(postToRow(post)),
    remove: (slug) => deleteOne.run(slug),
    // Used by callers that follow the old read-mutate-write-array pattern;
    // executed in a single transaction so concurrent writers don't race.
    replaceAll: (posts) => replaceAll(posts),
  };
}

const blog = makeStore("blog_posts");
const hamradio = makeStore("hamradio_posts");

// Grow posts have their own columns (plants, stage, photo).
function makeGrowStore() {
  const toPost = (row) =>
    row ? { ...row, plants: row.plants ? JSON.parse(row.plants) : [] } : null;
  const selectAll = db.prepare(
    "SELECT * FROM grow_posts ORDER BY date DESC, createdAt DESC",
  );
  const selectOne = db.prepare("SELECT * FROM grow_posts WHERE slug = ?");
  const upsert = db.prepare(`
    INSERT INTO grow_posts (slug, title, excerpt, content, date, plants, stage, photo, createdAt, updatedAt)
    VALUES (@slug, @title, @excerpt, @content, @date, @plants, @stage, @photo, @createdAt, @updatedAt)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title, excerpt=excluded.excerpt, content=excluded.content, date=excluded.date,
      plants=excluded.plants, stage=excluded.stage, photo=excluded.photo, updatedAt=excluded.updatedAt
  `);
  const deleteOne = db.prepare("DELETE FROM grow_posts WHERE slug = ?");
  return {
    list: () => selectAll.all().map(toPost),
    get: (slug) => toPost(selectOne.get(slug)),
    save: (p) =>
      upsert.run({
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt ?? null,
        content: p.content,
        date: p.date ?? null,
        plants: JSON.stringify(p.plants ?? []),
        stage: p.stage ?? null,
        photo: p.photo ?? null,
        createdAt: p.createdAt ?? null,
        updatedAt: p.updatedAt ?? null,
      }),
    remove: (slug) => deleteOne.run(slug),
  };
}
const grow = makeGrowStore();

module.exports = { db, blog, hamradio, grow, DB_PATH };

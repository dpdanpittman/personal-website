#!/usr/bin/env node
// One-shot migration: read the existing JSON post stores, INSERT into the
// SQLite tables managed by db.js, then rename the JSON files so subsequent
// runs of this script noop. Run inside the api container (or wherever the
// data/ directory lives) BEFORE swapping to the new server.js.

const fs = require("fs");
const path = require("path");
const { blog, hamradio } = require("../db.js");

const DATA_DIR =
  process.env.POSTS_DATA_DIR || path.join(__dirname, "..", "data");

const TARGETS = [
  { name: "blog", file: path.join(DATA_DIR, "blog-posts.json"), store: blog },
  {
    name: "hamradio",
    file: path.join(DATA_DIR, "hamradio-posts.json"),
    store: hamradio,
  },
];

function ts() {
  return new Date().toISOString();
}

function migrate({ name, file, store }) {
  if (!fs.existsSync(file)) {
    console.log(`[${ts()}] ${name}: source file ${file} missing — skipping`);
    return;
  }
  let posts;
  try {
    posts = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    console.error(`[${ts()}] ${name}: cannot parse ${file}: ${err.message}`);
    process.exit(1);
  }
  if (!Array.isArray(posts)) {
    console.error(
      `[${ts()}] ${name}: expected an array in ${file}, got ${typeof posts}`,
    );
    process.exit(1);
  }

  const before = store.list().length;
  store.replaceAll(posts);
  const after = store.list().length;
  console.log(
    `[${ts()}] ${name}: ${before} → ${after} rows (${posts.length} input)`,
  );

  const backup = `${file}.pre-migration-${new Date().toISOString().split("T")[0]}`;
  fs.renameSync(file, backup);
  console.log(`[${ts()}] ${name}: renamed ${file} → ${backup}`);
}

console.log(`[${ts()}] migration starting; data dir = ${DATA_DIR}`);
for (const t of TARGETS) migrate(t);
console.log(`[${ts()}] migration done`);

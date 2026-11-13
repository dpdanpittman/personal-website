// Shared setup for the grow tests: a fresh SQLite file and photos folder per test file
// (node --test runs each file in its own process), and the app on a random local port.
const fs = require("fs");
const os = require("os");
const path = require("path");

const KEY = "test-key-" + "x".repeat(32);

async function startApp(extraEnv = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grow-test-"));
  process.env.API_KEY = KEY;
  process.env.NODE_ENV = "test";
  process.env.POSTS_DB_PATH = path.join(root, "data", "posts.sqlite");
  Object.assign(process.env, extraEnv);
  const app = require("../server.js");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const photosDir = process.env.GROW_PHOTOS_DIR || path.join(root, "data", "grow-photos");
  return { root, base, photosDir, close: () => new Promise((r) => server.close(r)) };
}

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name));

async function upload(base, buf, { key = KEY, filename = "photo.jpg", type = "image/jpeg", field = "photo" } = {}) {
  const form = new FormData();
  form.append(field, new Blob([buf], { type }), filename);
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  const res = await fetch(`${base}/api/grow/photos`, { method: "POST", body: form, headers });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

async function postJson(base, p, obj, key = KEY) {
  const headers = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(base + p, { method: "POST", headers, body: JSON.stringify(obj) });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// Minimal EXIF reader: returns { gpsLat: [d, m, s] } when a JPEG/WebP buffer carries a GPS IFD, else null.
function readExifGps(buf) {
  // JPEG APP1 carries "Exif\0\0" + TIFF; a WebP "EXIF" chunk carries the TIFF data right after its 8-byte header.
  let t = null;
  const at = buf.indexOf(Buffer.from("Exif\0\0", "latin1"));
  if (at >= 0) t = buf.subarray(at + 6);
  else if (buf.toString("latin1", 8, 12) === "WEBP") {
    const c = buf.indexOf(Buffer.from("EXIF", "latin1"), 12);
    if (c >= 0) t = buf.subarray(c + 8);
  }
  if (!t) return null;
  const le = t.toString("latin1", 0, 2) === "II";
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd0 = u32(4);
  let gpsOff = null;
  for (let i = 0, n = u16(ifd0); i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) === 0x8825) gpsOff = u32(e + 8);
  }
  if (gpsOff === null) return { gpsLat: null };
  for (let i = 0, n = u16(gpsOff); i < n; i++) {
    const e = gpsOff + 2 + i * 12;
    if (u16(e) === 2) {
      const o = u32(e + 8);
      return { gpsLat: [0, 1, 2].map((k) => u32(o + k * 8) / u32(o + k * 8 + 4)) };
    }
  }
  return { gpsLat: null };
}

module.exports = { KEY, startApp, fixture, upload, postJson, readExifGps };

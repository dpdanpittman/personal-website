// Type allowlist, size cap, content-over-claim, traversal, PNG/WebP metadata.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { startApp, fixture, upload, readExifGps } = require("./helpers");

let ctx;
test.before(async () => { ctx = await startApp({ GROW_PHOTO_MAX_BYTES: String(100 * 1024), GROW_UPLOADS_PER_15MIN: "50" }); });
test.after(async () => { await ctx.close(); });

const names = () => (fs.existsSync(ctx.photosDir) ? fs.readdirSync(ctx.photosDir) : []);

test("text named .jpg is refused", async () => {
  const r = await upload(ctx.base, fixture("not-image.jpg"));
  assert.equal(r.status, 415);
});

test("GIF is refused even when it claims to be JPEG", async () => {
  const r = await upload(ctx.base, fixture("tiny.gif"), { filename: "a.jpg", type: "image/jpeg" });
  assert.equal(r.status, 415);
});

test("broken JPEG bytes are refused", async () => {
  const buf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
  const r = await upload(ctx.base, buf);
  assert.equal(r.status, 400);
});

test("a photo over the size cap is refused", async () => {
  const big = Buffer.concat([fixture("gps.jpg"), Buffer.alloc(120 * 1024, 1)]);
  const r = await upload(ctx.base, big);
  assert.equal(r.status, 413);
});

test("a second file or the wrong field is refused", async () => {
  assert.equal((await upload(ctx.base, fixture("gps.jpg"), { field: "file" })).status, 400);
  const form = new FormData();
  form.append("photo", new Blob([fixture("gps.jpg")]), "a.jpg");
  form.append("photo", new Blob([fixture("gps.jpg")]), "b.jpg");
  const r = await fetch(`${ctx.base}/api/grow/photos`, { method: "POST", body: form, headers: { Authorization: `Bearer ${process.env.API_KEY}` } });
  assert.equal(r.status, 400);
});

test("a traversal file name cannot write outside the photos folder", async () => {
  const before = fs.readdirSync(ctx.root);
  for (const filename of ["../../evil.jpg", "..\\..\\evil.jpg", "/etc/evil.jpg", "../data/posts.sqlite"]) {
    const r = await upload(ctx.base, fixture("gps.jpg"), { filename });
    assert.equal(r.status, 201);
    assert.match(r.json.photo, /^[a-f0-9]{32}\.jpg$/);
  }
  assert.deepEqual(fs.readdirSync(ctx.root), before);
  assert.ok(names().every((n) => /^[a-f0-9]{32}\.jpg$/.test(n)));
  assert.equal(fs.existsSync(path.join(ctx.root, "evil.jpg")), false);
});

test("a traversal photo name cannot read outside the photos folder", async () => {
  for (const p of ["..%2Fposts.sqlite", "..%2F..%2Fdata%2Fposts.sqlite", "%2e%2e%2fposts.sqlite", ".hidden.jpg", "posts.sqlite"]) {
    const r = await fetch(`${ctx.base}/api/grow/photos/${p}`);
    assert.equal(r.status, 404, p);
  }
  const r = await fetch(`${ctx.base}/api/grow/photos/../posts.sqlite`);
  assert.notEqual(r.status, 200);
});

test("the content decides the type, not the claimed name", async () => {
  const r = await upload(ctx.base, fixture("meta.png"), { filename: "x.jpg", type: "image/jpeg" });
  assert.equal(r.status, 201);
  assert.match(r.json.photo, /\.png$/);
});

test("PNG text chunks naming a place are gone", async () => {
  assert.ok(fixture("meta.png").includes(Buffer.from("Testville")));
  const r = await upload(ctx.base, fixture("meta.png"), { filename: "x.png", type: "image/png" });
  const stored = fs.readFileSync(path.join(ctx.photosDir, r.json.photo));
  assert.equal(stored.includes(Buffer.from("Testville")), false);
  assert.equal(stored.includes(Buffer.from("tEXt")), false);
  assert.equal((await sharp(stored).metadata()).format, "png");
});

test("WebP EXIF with GPS is gone", async () => {
  assert.deepEqual(readExifGps(fixture("gps.webp")).gpsLat, [0, 30, 0]);
  const r = await upload(ctx.base, fixture("gps.webp"), { filename: "x.webp", type: "image/webp" });
  assert.equal(r.status, 201);
  const stored = fs.readFileSync(path.join(ctx.photosDir, r.json.photo));
  assert.equal(readExifGps(stored), null);
  assert.equal(stored.includes(Buffer.from("EXIF")), false);
  const meta = await sharp(stored).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.exif, undefined);
});

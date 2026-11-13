// Store, auth, photo cleaning (EXIF/GPS really gone), serving, and separation from the main blog feed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { KEY, startApp, fixture, upload, postJson, readExifGps } = require("./helpers");

let ctx;
// Made-up place names: the real list is configured on the server, never in this public repo.
test.before(async () => { ctx = await startApp({ GROW_BLOCKED_PLACES: "Testville, Nowhere County,ZZ" }); });
test.after(async () => { await ctx.close(); });

let photoName;

test("grow list starts empty", async () => {
  const r = await fetch(`${ctx.base}/api/grow/posts`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { posts: [], count: 0 });
});

test("upload is refused without the key or with a wrong key", async () => {
  assert.equal((await upload(ctx.base, fixture("gps.jpg"), { key: null })).status, 401);
  assert.equal((await upload(ctx.base, fixture("gps.jpg"), { key: "wrong" })).status, 401);
  assert.equal((await upload(ctx.base, fixture("gps.jpg"), { key: KEY.replace(/x$/, "y") })).status, 401);
  assert.deepEqual(fs.existsSync(ctx.photosDir) ? fs.readdirSync(ctx.photosDir) : [], []);
});

test("the sample JPEG really carries GPS tags before upload", async () => {
  const gps = readExifGps(fixture("gps.jpg"));
  assert.deepEqual(gps.gpsLat, [0, 30, 0]);
  const meta = await sharp(fixture("gps.jpg")).metadata();
  assert.ok(meta.exif, "fixture should have EXIF");
});

test("upload stores a re-encoded JPEG with no EXIF or GPS left", async () => {
  const r = await upload(ctx.base, fixture("gps.jpg"), { filename: "IMG_2041.jpg" });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.photo, /^[a-f0-9]{32}\.jpg$/);
  assert.equal(r.json.url, `/api/grow/photos/${r.json.photo}`);
  photoName = r.json.photo;
  const stored = fs.readFileSync(path.join(ctx.photosDir, photoName));
  assert.equal(readExifGps(stored), null, "no EXIF block at all");
  assert.equal(stored.includes(Buffer.from("Exif", "latin1")), false);
  assert.equal(stored.includes(Buffer.from("TestCam", "latin1")), false, "camera make gone");
  assert.equal(stored.includes(Buffer.from([0xff, 0xe1])), false, "no APP1 segment");
  const meta = await sharp(stored).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  assert.equal(meta.width, 96);
});

test("stored photo is served with safe headers", async () => {
  const r = await fetch(`${ctx.base}/api/grow/photos/${photoName}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/jpeg");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("cross-origin-resource-policy"), "same-site");
  const body = Buffer.from(await r.arrayBuffer());
  assert.ok(body.equals(fs.readFileSync(path.join(ctx.photosDir, photoName))));
  assert.equal((await fetch(`${ctx.base}/api/grow/photos/${"0".repeat(32)}.jpg`)).status, 404);
});

test("a post is stored with its photo and listed", async () => {
  const post = {
    slug: "grow-2026-11-12", title: "Veg tent, day 3 after the transplant", date: "2026-11-12",
    excerpt: "Watered and checked the new pots.", plants: ["veg tent"], stage: "week 2 of veg",
    content: "<p>Watered the veg tent.</p><script>alert(1)</script><img src=x onerror=alert(1)>", photo: photoName,
  };
  const r = await postJson(ctx.base, "/api/grow/posts", post);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.post.content, "<p>Watered the veg tent.</p>", "script and img stripped");
  const list = await (await fetch(`${ctx.base}/api/grow/posts`)).json();
  assert.equal(list.count, 1);
  assert.deepEqual(list.posts[0], {
    slug: post.slug, title: post.title, date: post.date, excerpt: post.excerpt, plants: ["veg tent"],
    stage: "week 2 of veg", photo: photoName, photoUrl: `/api/grow/photos/${photoName}`,
  });
  const one = await (await fetch(`${ctx.base}/api/grow/posts/${post.slug}`)).json();
  assert.equal(one.post.content, "<p>Watered the veg tent.</p>");
  const again = await postJson(ctx.base, "/api/grow/posts", { ...post, title: "Veg tent, day 3" });
  assert.equal(again.status, 200);
  assert.equal(again.json.updated, true);
});

test("post writes need the key and valid fields", async () => {
  const ok = { slug: "grow-x", title: "t", content: "<p>c</p>" };
  assert.equal((await postJson(ctx.base, "/api/grow/posts", ok, null)).status, 401);
  assert.equal((await postJson(ctx.base, "/api/grow/posts", ok, "wrong")).status, 401);
  assert.equal((await postJson(ctx.base, "/api/grow/posts", { ...ok, photo: "../../posts.sqlite" })).status, 400);
  assert.equal((await postJson(ctx.base, "/api/grow/posts", { ...ok, photo: `${"a".repeat(32)}.jpg` })).status, 400);
  assert.equal((await postJson(ctx.base, "/api/grow/posts", { ...ok, slug: "../etc" })).status, 400);
});

test("a post naming a blocked place, a street or coordinates is refused", async () => {
  const base = { slug: "grow-loc", title: "Flower tent", content: "<p>Fine.</p>" };
  const refused = [
    { content: "<p>Cold night in Testville.</p>" },
    { title: "testville grow" },
    { content: "<p>Fair day in nowhere   county.</p>" },
    { content: "<p>Cold night here in ZZ.</p>" },
    { content: "<p>Back from T e s t v i l l e today.</p>" },
    { content: "<p>at 0.5891, -0.0391</p>" },
    { content: "<p>at 0° 30' north</p>" },
    { content: "<p>Moved them to 212 Oak Street.</p>" },
    { content: "<p>The tent is in the garage on Oak St.</p>" },
    { content: "<p>I live off oak street.</p>" },
    { stage: "week 2, garage on Maple Avenue" },
  ];
  for (const extra of refused) {
    const r = await postJson(ctx.base, "/api/grow/posts", { ...base, ...extra });
    assert.equal(r.status, 422, JSON.stringify(extra));
  }
  assert.equal((await fetch(`${ctx.base}/api/grow/posts/grow-loc`)).status, 404);
  // ordinary grow words are not places
  const ok = await postJson(ctx.base, "/api/grow/posts", { ...base, slug: "grow-ok", content: "<p>Week 4 of flower, 12/12. Topped two. Zz top note.</p>" });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const del = await fetch(`${ctx.base}/api/grow/posts/grow-ok`, { method: "DELETE", headers: { Authorization: `Bearer ${KEY}` } });
  assert.equal(del.status, 200);
});

test("?full=1 lists every post with its body in one call", async () => {
  const plain = await (await fetch(`${ctx.base}/api/grow/posts`)).json();
  const full = await (await fetch(`${ctx.base}/api/grow/posts?full=1`)).json();
  assert.equal(full.count, plain.count);
  assert.ok(full.count >= 1);
  for (const p of plain.posts) assert.equal(p.content, undefined);
  for (const p of full.posts) assert.equal(typeof p.content, "string");
});

test("grow posts never show up in the main blog or ham feeds", async () => {
  const blog = await (await fetch(`${ctx.base}/api/blog/posts`)).json();
  const ham = await (await fetch(`${ctx.base}/api/hamradio/posts`)).json();
  assert.equal(blog.count, 0);
  assert.equal(ham.count, 0);
  assert.equal((await fetch(`${ctx.base}/api/blog/posts/grow-2026-11-12`)).status, 404);
});

test("delete needs the key and keeps the photo file", async () => {
  const del = (key) => fetch(`${ctx.base}/api/grow/posts/grow-2026-11-12`, { method: "DELETE", headers: key ? { Authorization: `Bearer ${key}` } : {} });
  assert.equal((await del(null)).status, 401);
  assert.equal((await del(KEY)).status, 200);
  assert.ok(fs.existsSync(path.join(ctx.photosDir, photoName)));
  assert.equal((await (await fetch(`${ctx.base}/api/grow/posts`)).json()).count, 0);
});

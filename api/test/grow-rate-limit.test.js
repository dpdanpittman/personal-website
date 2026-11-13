// Limits: uploads are counted per key holder after the key check; grow reads have their own high budget.
const test = require("node:test");
const assert = require("node:assert/strict");
const { startApp, fixture, upload, KEY } = require("./helpers");

let ctx;
test.before(async () => { ctx = await startApp(); });
test.after(async () => { await ctx.close(); });

test("attempts without the key never use up the upload budget", async () => {
  for (let i = 0; i < 15; i++) assert.equal((await upload(ctx.base, fixture("gps.jpg"), { key: "wrong" })).status, 401);
  assert.equal((await upload(ctx.base, fixture("gps.jpg"))).status, 201);
});

test("the 11th upload with the key in 15 minutes gets 429, and a spoofed X-Forwarded-For does not help", async () => {
  for (let i = 0; i < 9; i++) assert.equal((await upload(ctx.base, fixture("gps.jpg"))).status, 201);
  assert.equal((await upload(ctx.base, fixture("gps.jpg"))).status, 429);
  const form = new FormData();
  form.append("photo", new Blob([fixture("gps.jpg")], { type: "image/jpeg" }), "p.jpg");
  const r = await fetch(`${ctx.base}/api/grow/photos`, { method: "POST", body: form,
    headers: { Authorization: `Bearer ${KEY}`, "X-Forwarded-For": "203.0.113.77" } });
  assert.equal(r.status, 429);
});

test("grow reads are not limited by the API-wide 100 per 15 minutes", async () => {
  for (let i = 0; i < 160; i++) {
    const r = await fetch(`${ctx.base}/api/grow/posts?full=1`);
    assert.equal(r.status, 200, `read ${i + 1}`);
  }
  // and they do not use up the general budget either: the blog list still answers
  assert.equal((await fetch(`${ctx.base}/api/blog/posts`)).status, 200);
});

// Grow log: a public section of its own (like ham radio), never part of the main blog feed.
//
//   GET    /api/grow/posts              list (public)
//   GET    /api/grow/posts/:slug        one post (public)
//   POST   /api/grow/posts              create or update (Bearer key)
//   DELETE /api/grow/posts/:slug        remove the post row; the photo file stays (Bearer key)
//   POST   /api/grow/photos             upload one photo (Bearer key, multipart field "photo")
//   GET    /api/grow/photos/:name       serve a stored photo (public)
//
// Photos: the type is read from the file's own bytes (JPEG, PNG or WebP only), the size is capped,
// and every photo is decoded and re-encoded with sharp. Re-encoding drops all metadata (EXIF, GPS,
// XMP, IPTC, comments); the result is checked again before it is written. The stored name is random
// (32 hex characters + extension); the uploaded file name is never used, so nothing can be written
// outside the photos folder.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const rateLimit = require("express-rate-limit");
const sanitizeHtml = require("sanitize-html");
const { body, param, validationResult } = require("express-validator");

sharp.cache(false);
sharp.concurrency(1);

const PHOTO_MAX_BYTES =
  Number(process.env.GROW_PHOTO_MAX_BYTES) || 15 * 1024 * 1024;
const PHOTO_MAX_PIXELS = 30 * 1000 * 1000; // phones save 12 MP; this keeps decoding well inside the pod memory limit
const PHOTO_MAX_EDGE = 2048;
const NAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const EXT = { jpeg: "jpg", png: "png", webp: "webp" };

// Places and coordinates that must never be published. The n8n flow holds such a post first;
// this is the last line of defence. Place NAMES are not in this source (the repo is public):
// they come from GROW_BLOCKED_PLACES (comma or newline separated) and/or the file named by
// GROW_BLOCKED_PLACES_FILE (one per line, # comments). The patterns below need no names.
const STREET_SUFFIX =
  "street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|circle|cir|highway|hwy|trail|trl|parkway|pkwy|terrace|ter|gulch";
const STREET_SUFFIX_NO_NUMBER =
  "street|st|avenue|ave|road|rd|boulevard|blvd|highway|hwy|parkway|pkwy|gulch";
const LOCATION_PATTERNS = [
  /-?\d{1,3}\.\d{3,}\s*[,;]\s*-?\d{1,3}\.\d{3,}/, // decimal lat, long
  /\d{1,3}\s*°\s*\d{1,2}\s*['′]/, // degrees and minutes
  /\b\d{1,3}(?:\.\d+)?\s*°?\s*[NS]\b[\s,]+\d{1,3}(?:\.\d+)?\s*°?\s*[EW]\b/i, // 12.5 N 3.4 W
  // a house number and a street: "212 Oak Street", "12 n. elm st"
  new RegExp(
    `\\b\\d{1,6}\\s+(?:[nsew]\\.?\\s+)?[a-z]+(?:\\s[a-z]+)?\\s+(?:${STREET_SUFFIX})\\b`,
    "i",
  ),
  // a named street with no number: "on Oak St", "off oak street", "by Maple Avenue"
  // (a short suffix list, and "the right place" or "down the road" do not count)
  new RegExp(
    `\\b(?:on|off|at|by|near|along|down|up|onto|from)\\s+(?:the\\s+)?(?!(?:the|a|an|my|our|this|that|his|her|their)\\s)[a-z]+(?:\\s[a-z]+)?\\s+(?:${STREET_SUFFIX_NO_NUMBER})\\b`,
    "i",
  ),
  /\b[A-Z][a-z]+\s+(?:Street|Avenue|Boulevard|Highway|Parkway|Gulch)\b/,
];

function loadBlockedPlaces() {
  const raw = [process.env.GROW_BLOCKED_PLACES || ""];
  const file = process.env.GROW_BLOCKED_PLACES_FILE;
  if (file) {
    try {
      raw.push(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.warn(`Grow: cannot read GROW_BLOCKED_PLACES_FILE (${e.code})`);
    }
  }
  return [
    ...new Set(
      raw
        .join("\n")
        .split(/[\n,]/)
        .map((x) => x.replace(/#.*$/, "").trim())
        .filter((x) => x.length >= 2),
    ),
  ];
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let BLOCKED = null; // [{ re, squashed }], built on first use so tests can set the env first

function blockedPlaces() {
  if (BLOCKED) return BLOCKED;
  const names = loadBlockedPlaces();
  if (!names.length)
    console.warn(
      "Grow: no blocked place names configured (GROW_BLOCKED_PLACES); only coordinates and street patterns are checked",
    );
  BLOCKED = names.map((n) => ({
    // short names (state codes) must match case and stand alone; longer ones ignore case
    re:
      n.length <= 3
        ? new RegExp(`\\b${esc(n)}\\b`)
        : new RegExp(`\\b${esc(n).replace(/\\? /g, "\\s+")}\\b`, "i"),
    squashed: n.length >= 5 ? n.toLowerCase().replace(/[^a-z]/g, "") : "",
  }));
  return BLOCKED;
}

// Runs of single letters split by spaces, dots or dashes ("H e l e n a", "h.e.l.e.n.a") joined up.
function spacedRuns(text) {
  return (text.match(/(?:\b[A-Za-z]\b[\s.\-_*·]+){3,}\b[A-Za-z]\b/g) || []).map((r) =>
    r.replace(/[^A-Za-z]/g, "").toLowerCase(),
  );
}

function locationProblem(...texts) {
  const all = texts.filter(Boolean).join("\n");
  if (LOCATION_PATTERNS.some((re) => re.test(all))) return true;
  const places = blockedPlaces();
  if (places.some((p) => p.re.test(all))) return true;
  const runs = spacedRuns(all);
  return runs.some((r) => places.some((p) => p.squashed && r.includes(p.squashed)));
}

// File type from the bytes, not from the client's claim.
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
}

async function cleanPhoto(buf) {
  const kind = sniff(buf);
  if (!kind) {
    const e = new Error("Only JPEG, PNG or WebP photos are accepted.");
    e.status = 415;
    throw e;
  }
  const opts = { limitInputPixels: PHOTO_MAX_PIXELS, failOn: "error" };
  let meta;
  try {
    meta = await sharp(buf, opts).metadata();
  } catch (err) {
    const e = new Error("The photo could not be read.");
    e.status = 400;
    throw e;
  }
  if (meta.format !== kind) {
    const e = new Error("The photo's content does not match its type.");
    e.status = 415;
    throw e;
  }
  let img = sharp(buf, opts)
    .rotate() // apply the camera's orientation, then the tag is gone with the rest
    .resize({
      width: PHOTO_MAX_EDGE,
      height: PHOTO_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  if (kind === "jpeg") img = img.jpeg({ quality: 85, mozjpeg: true });
  else if (kind === "png") img = img.png({ compressionLevel: 9 });
  else img = img.webp({ quality: 85 });
  const out = await img.toBuffer({ resolveWithObject: true });

  // Check the result again: no metadata block of any kind may survive.
  const check = await sharp(out.data).metadata();
  if (
    check.exif ||
    check.xmp ||
    check.iptc ||
    out.data.includes(Buffer.from("Exif\0\0", "latin1"))
  ) {
    throw new Error("metadata survived re-encoding");
  }
  return {
    data: out.data,
    ext: EXT[kind],
    width: out.info.width,
    height: out.info.height,
  };
}

module.exports = function growRouter({
  authenticate,
  writeLimiter,
  writeBodyParser,
  sanitizeText,
  store,
  photosDir,
}) {
  fs.mkdirSync(photosDir, { recursive: true, mode: 0o750 });
  const PHOTOS = fs.realpathSync(photosDir);
  const router = express.Router();

  // Uploads: counted AFTER the key check, and per key holder (there is one key), not per IP.
  // So nobody without the key can use up n8n's budget, and a spoofed X-Forwarded-For changes nothing.
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.GROW_UPLOADS_PER_15MIN) || 10,
    keyGenerator: () => "api-key-holder",
    message: { error: "Too many photo uploads, please try again later." },
  });
  // Public reads (list, posts, photos) have their own, much higher budget. The site rebuild
  // (every few minutes, one list call per build) and visitors loading photos through Caddy all
  // share one IP, so the API-wide 100 per 15 minutes would empty the section. server.js lets
  // grow GETs skip that general limiter.
  const readLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.GROW_READS_PER_15MIN) || 3000,
    message: { error: "Too many requests, please try again later." },
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: PHOTO_MAX_BYTES,
      files: 1,
      fields: 5,
      parts: 6,
      fieldSize: 1024,
    },
  }).single("photo");

  const photoUrl = (name) => (name ? `/api/grow/photos/${name}` : null);
  const listView = (p) => ({
    slug: p.slug,
    title: p.title,
    date: p.date,
    excerpt: p.excerpt,
    plants: p.plants,
    stage: p.stage,
    photo: p.photo,
    photoUrl: photoUrl(p.photo),
  });

  // ---- photos
  router.post(
    "/photos",
    authenticate, // first: an unauthenticated request is refused before any limiter or body parsing
    uploadLimiter,
    writeLimiter,
    (req, res, next) =>
      upload(req, res, (err) => {
        if (!err) return next();
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(413)
            .json({
              error: `Photo too large (max ${Math.round(PHOTO_MAX_BYTES / 1048576)} MB).`,
            });
        }
        return res
          .status(400)
          .json({
            error: "Upload refused: send one file in the field 'photo'.",
          });
      }),
    async (req, res) => {
      if (!req.file)
        return res
          .status(400)
          .json({ error: "No photo: send one file in the field 'photo'." });
      try {
        const clean = await cleanPhoto(req.file.buffer);
        const name = crypto.randomBytes(16).toString("hex") + "." + clean.ext;
        const target = path.join(PHOTOS, name);
        if (path.dirname(target) !== PHOTOS || !NAME_RE.test(name))
          throw new Error("bad target path");
        fs.writeFileSync(target, clean.data, { flag: "wx", mode: 0o640 });
        return res.status(201).json({
          photo: name,
          url: photoUrl(name),
          width: clean.width,
          height: clean.height,
          bytes: clean.data.length,
        });
      } catch (err) {
        if (err.status)
          return res.status(err.status).json({ error: err.message });
        console.error("Grow photo upload failed:", err.message);
        return res.status(500).json({ error: "Failed to store the photo" });
      }
    },
  );

  router.get("/photos/:name", readLimiter, (req, res) => {
    const name = String(req.params.name || "");
    if (!NAME_RE.test(name))
      return res.status(404).json({ error: "Photo not found" });
    res.sendFile(
      name,
      {
        root: PHOTOS,
        dotfiles: "deny",
        maxAge: "365d",
        immutable: true,
        headers: {
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-site",
        },
      },
      (err) => {
        if (err && !res.headersSent)
          res.status(404).json({ error: "Photo not found" });
      },
    );
  });

  // ---- posts
  // ?full=1 adds each post's body, so the site build needs one request for the whole section.
  router.get("/posts", readLimiter, (req, res) => {
    try {
      const full = req.query.full === "1";
      const posts = store
        .list()
        .map((p) => (full ? { ...listView(p), content: p.content } : listView(p)));
      res.json({ posts, count: posts.length });
    } catch (error) {
      console.error("Error reading grow posts:", error);
      res.status(500).json({ error: "Failed to fetch grow posts" });
    }
  });

  router.get("/posts/:slug", readLimiter, param("slug").isSlug(), (req, res) => {
    if (!validationResult(req).isEmpty())
      return res.status(400).json({ error: "Invalid slug format" });
    const post = store.get(req.params.slug);
    if (!post) return res.status(404).json({ error: "Grow post not found" });
    res.json({ post: { ...post, photoUrl: photoUrl(post.photo) } });
  });

  router.post(
    "/posts",
    authenticate,
    writeBodyParser,
    writeLimiter,
    [
      body("slug").isSlug().isLength({ max: 120 }),
      body("title").isString().trim().isLength({ min: 1, max: 200 }),
      body("content").isString().notEmpty().isLength({ max: 20000 }),
      body("excerpt").optional().isString().trim().isLength({ max: 500 }),
      body("date").optional().isISO8601(),
      body("plants").optional().isArray({ max: 5 }),
      body("plants.*")
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 40 }),
      body("stage")
        .optional({ nullable: true })
        .isString()
        .trim()
        .isLength({ max: 100 }),
      body("photo").optional({ nullable: true }).isString().matches(NAME_RE),
    ],
    (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res
          .status(400)
          .json({ error: "Validation failed", details: errors.array() });
      try {
        const { slug, title, content, excerpt, date, plants, stage, photo } =
          req.body;
        if (photo && !fs.existsSync(path.join(PHOTOS, photo))) {
          return res
            .status(400)
            .json({ error: "Photo not found: upload it first" });
        }
        const cleanContent = sanitizeHtml(content, {
          allowedTags: [
            "p",
            "br",
            "strong",
            "em",
            "ul",
            "ol",
            "li",
            "h2",
            "h3",
            "blockquote",
            "a",
          ],
          allowedAttributes: { a: ["href", "rel"] },
          allowedSchemes: ["http", "https"],
        });
        const cleanTitle = sanitizeText(title);
        const cleanExcerpt = sanitizeText(excerpt || "");
        if (locationProblem(cleanTitle, cleanExcerpt, cleanContent, stage)) {
          return res
            .status(422)
            .json({ error: "Refused: the post names a place or coordinates" });
        }
        const existing = store.get(slug);
        const now = new Date().toISOString();
        const post = {
          slug,
          title: cleanTitle,
          date: date || now.split("T")[0],
          excerpt: cleanExcerpt,
          content: cleanContent,
          plants: (plants || []).map((p) => sanitizeText(p)),
          stage: stage ? sanitizeText(stage) : null,
          photo: photo || null,
          createdAt: existing ? existing.createdAt : now,
          updatedAt: now,
        };
        store.save(post);
        return res.status(existing ? 200 : 201).json({
          message: existing ? "Grow post updated" : "Grow post created",
          post: { ...post, photoUrl: photoUrl(post.photo) },
          updated: !!existing,
        });
      } catch (error) {
        console.error("Error saving grow post:", error);
        res.status(500).json({ error: "Failed to save grow post" });
      }
    },
  );

  router.delete(
    "/posts/:slug",
    authenticate,
    writeLimiter,
    param("slug").isSlug(),
    (req, res) => {
      if (!validationResult(req).isEmpty())
        return res.status(400).json({ error: "Invalid slug format" });
      const post = store.get(req.params.slug);
      if (!post) return res.status(404).json({ error: "Grow post not found" });
      store.remove(req.params.slug);
      res.json({ message: "Grow post deleted (the photo file is kept)", post });
    },
  );

  return router;
};

module.exports.cleanPhoto = cleanPhoto;
module.exports.sniff = sniff;
module.exports.locationProblem = locationProblem;
module.exports._resetBlockedPlaces = () => {
  BLOCKED = null;
};

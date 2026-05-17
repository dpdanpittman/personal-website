const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require("express-validator");
const sanitizeHtml = require("sanitize-html");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3301;
const API_KEY = process.env.API_KEY;

// Trust the single Caddy hop in front of us so express-rate-limit
// keys on the real client IP instead of 127.0.0.1.
app.set("trust proxy", 1);
const BLOG_DATA_FILE = path.join(__dirname, "data", "blog-posts.json");
const HAMRADIO_DATA_FILE = path.join(__dirname, "data", "hamradio-posts.json");

// Validate API_KEY is set in production
if (!API_KEY && process.env.NODE_ENV === "production") {
  console.error(
    "FATAL: API_KEY environment variable must be set in production",
  );
  process.exit(1);
}

// Rate limiters
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 write requests per windowMs
  message: "Too many write requests from this IP, please try again later.",
});

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://mabus.ai",
          ...(process.env.NODE_ENV === "production"
            ? []
            : ["http://localhost:3301"]),
        ],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://mabus.ai", "https://www.mabus.ai"]
        : ["http://localhost:3300", "https://mabus.ai", "https://www.mabus.ai"],
    methods: ["GET", "POST", "DELETE"],
    // Bearer auth, not cookies — credentials:true was widening the surface for no benefit.
  }),
);
// Global body-parser removed; write routes mount their own 1 MB JSON parser
// AFTER the authenticate middleware so an unauthenticated caller can't force
// the server to parse a multi-megabyte body just to be rejected.
app.use(bodyParser.urlencoded({ extended: true, limit: "256kb" }));

// Apply rate limiting to all routes
app.use("/api/", publicLimiter);

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Authentication middleware for protected routes
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - Missing API key" });
  }

  const token = authHeader.substring(7);

  // Constant-time comparison. Length-mismatch shortcuts to false BEFORE
  // hitting timingSafeEqual (which throws on length mismatch).
  const a = Buffer.from(token);
  const b = Buffer.from(API_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized - Invalid API key" });
  }

  next();
};

// Per-write-route body parser. Capped at 1 MB and mounted INSIDE each
// authenticated write handler (see route definitions below), so an
// unauthenticated client can't force the server to parse a 10 MB body
// before getting rejected.
const writeBodyParser = bodyParser.json({ limit: "1mb" });

// Text-only sanitizer for title / excerpt fields. These flow into the
// social-media orchestrator that posts to X / Reddit / LinkedIn; we don't
// want zero-width / RTL-override / HTML chars surviving into tweets.
function sanitizeText(s) {
  if (s === null || s === undefined) return s;
  return sanitizeHtml(String(s), {
    allowedTags: [],
    allowedAttributes: {},
    allowedSchemes: [],
    disallowedTagsMode: "discard",
  });
}

// Post store — backed by SQLite via db.js. The previous read-mutate-write
// JSON pattern raced under concurrent writers; better-sqlite3's prepared
// statements are atomic per-call and `replaceAll` is wrapped in a tx.
const { blog: blogStore, hamradio: hamStore } = require("./db.js");

async function readBlogPosts() {
  return blogStore.list();
}

async function writeBlogPosts(posts) {
  blogStore.replaceAll(posts);
}

async function readHamRadioPosts() {
  return hamStore.list();
}

async function writeHamRadioPosts(posts) {
  hamStore.replaceAll(posts);
}

// Routes

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET all blog posts (public)
app.get("/api/blog/posts", async (req, res) => {
  try {
    const posts = await readBlogPosts();

    // Sort by date, newest first
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Return list view (without full content)
    const postList = posts.map((post) => ({
      slug: post.slug,
      title: post.title,
      date: post.date,
      excerpt: post.excerpt,
      tags: post.tags,
      readingTime: post.readingTime,
      qualityScore: post.qualityScore,
    }));

    res.json({ posts: postList, count: postList.length });
  } catch (error) {
    console.error("Error reading blog posts:", error);
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

// GET single blog post by slug (public)
app.get(
  "/api/blog/posts/:slug",
  param("slug").isSlug().trim().escape(),
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid slug format" });
    }

    try {
      const posts = await readBlogPosts();
      const post = posts.find((p) => p.slug === req.params.slug);

      if (!post) {
        return res.status(404).json({ error: "Blog post not found" });
      }

      res.json({ post });
    } catch (error) {
      console.error("Error reading blog post:", error);
      res.status(500).json({ error: "Failed to fetch blog post" });
    }
  },
);

// POST new blog post (protected - requires API key)
app.post(
  "/api/blog/posts",
  authenticate,
  writeBodyParser,
  writeLimiter,
  [
    body("slug").isSlug().trim().escape(),
    body("title").isString().trim().isLength({ min: 1, max: 500 }),
    body("content").isString().notEmpty(),
    body("excerpt").optional().isString().trim().isLength({ max: 1000 }),
    body("tags").optional().isArray(),
    body("tags.*").optional().isString().trim(),
    body("readingTime").optional().isInt({ min: 1, max: 999 }),
    body("qualityScore").optional().isFloat({ min: 0, max: 100 }),
    body("date").optional().isISO8601(),
    body("sources").optional().isArray(),
    body("sources.*.url").optional().isURL(),
    body("sources.*.title").optional().isString().trim(),
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    try {
      const {
        slug,
        title,
        date,
        excerpt,
        tags,
        readingTime,
        qualityScore,
        content,
        sources,
        editorNotes,
      } = req.body;

      const posts = await readBlogPosts();

      // Check if slug already exists
      const existingIndex = posts.findIndex((p) => p.slug === slug);

      // Sanitize HTML content to prevent XSS
      const sanitizedContent = sanitizeHtml(content, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img",
          "h1",
          "h2",
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ["src", "alt", "title"],
          a: ["href", "target", "rel"],
        },
        allowedSchemes: ["http", "https", "mailto"],
        allowedSchemesByTag: {
          img: ["http", "https", "data"],
        },
      });

      const newPost = {
        slug,
        title: sanitizeText(title),
        date: date || new Date().toISOString().split("T")[0],
        excerpt: sanitizeText(excerpt || ""),
        tags: tags || [],
        readingTime: readingTime || 5,
        qualityScore: qualityScore || null,
        content: sanitizedContent,
        sources: sources || [],
        editorNotes: editorNotes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (existingIndex !== -1) {
        // Update existing post
        newPost.createdAt = posts[existingIndex].createdAt;
        posts[existingIndex] = newPost;
        await writeBlogPosts(posts);

        return res.json({
          message: "Blog post updated successfully",
          post: newPost,
          updated: true,
        });
      } else {
        // Add new post
        posts.push(newPost);
        await writeBlogPosts(posts);

        return res.status(201).json({
          message: "Blog post created successfully",
          post: newPost,
          updated: false,
        });
      }
    } catch (error) {
      console.error("Error creating blog post:", error);
      res.status(500).json({ error: "Failed to create blog post" });
    }
  },
);

// DELETE blog post by slug (protected - requires API key)
app.delete(
  "/api/blog/posts/:slug",
  authenticate,
  writeLimiter,
  param("slug").isSlug().trim().escape(),
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid slug format" });
    }

    try {
      const posts = await readBlogPosts();
      const postIndex = posts.findIndex((p) => p.slug === req.params.slug);

      if (postIndex === -1) {
        return res.status(404).json({ error: "Blog post not found" });
      }

      const deletedPost = posts.splice(postIndex, 1)[0];
      await writeBlogPosts(posts);

      res.json({
        message: "Blog post deleted successfully",
        post: deletedPost,
      });
    } catch (error) {
      console.error("Error deleting blog post:", error);
      res.status(500).json({ error: "Failed to delete blog post" });
    }
  },
);

// ========================================
// HAM RADIO BLOG ENDPOINTS
// ========================================

// GET all HAM radio posts (public)
app.get("/api/hamradio/posts", async (req, res) => {
  try {
    const posts = await readHamRadioPosts();

    // Sort by date, newest first
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Return list view (without full content)
    const postList = posts.map((post) => ({
      slug: post.slug,
      title: post.title,
      date: post.date,
      excerpt: post.excerpt,
      tags: post.tags,
      readingTime: post.readingTime,
      qualityScore: post.qualityScore,
    }));

    res.json({ posts: postList, count: postList.length });
  } catch (error) {
    console.error("Error reading HAM radio posts:", error);
    res.status(500).json({ error: "Failed to fetch HAM radio posts" });
  }
});

// GET single HAM radio post by slug (public)
app.get(
  "/api/hamradio/posts/:slug",
  param("slug").isSlug().trim().escape(),
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid slug format" });
    }

    try {
      const posts = await readHamRadioPosts();
      const post = posts.find((p) => p.slug === req.params.slug);

      if (!post) {
        return res.status(404).json({ error: "HAM radio post not found" });
      }

      res.json({ post });
    } catch (error) {
      console.error("Error reading HAM radio post:", error);
      res.status(500).json({ error: "Failed to fetch HAM radio post" });
    }
  },
);

// POST new HAM radio post (protected - requires API key)
app.post(
  "/api/hamradio/posts",
  authenticate,
  writeBodyParser,
  writeLimiter,
  [
    body("slug").isSlug().trim().escape(),
    body("title").isString().trim().isLength({ min: 1, max: 500 }),
    body("content").isString().notEmpty(),
    body("excerpt").optional().isString().trim().isLength({ max: 1000 }),
    body("tags").optional().isArray(),
    body("tags.*").optional().isString().trim(),
    body("readingTime").optional().isInt({ min: 1, max: 999 }),
    body("qualityScore").optional().isFloat({ min: 0, max: 100 }),
    body("date").optional().isISO8601(),
    body("sources").optional().isArray(),
    body("sources.*.url").optional().isURL(),
    body("sources.*.title").optional().isString().trim(),
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }

    try {
      const {
        slug,
        title,
        date,
        excerpt,
        tags,
        readingTime,
        qualityScore,
        content,
        sources,
        editorNotes,
      } = req.body;

      const posts = await readHamRadioPosts();

      // Check if slug already exists
      const existingIndex = posts.findIndex((p) => p.slug === slug);

      // Sanitize HTML content to prevent XSS
      const sanitizedContent = sanitizeHtml(content, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img",
          "h1",
          "h2",
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ["src", "alt", "title"],
          a: ["href", "target", "rel"],
        },
        allowedSchemes: ["http", "https", "mailto"],
        allowedSchemesByTag: {
          img: ["http", "https", "data"],
        },
      });

      const newPost = {
        slug,
        title: sanitizeText(title),
        date: date || new Date().toISOString().split("T")[0],
        excerpt: sanitizeText(excerpt || ""),
        tags: tags || [],
        readingTime: readingTime || 5,
        qualityScore: qualityScore || null,
        content: sanitizedContent,
        sources: sources || [],
        editorNotes: editorNotes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (existingIndex !== -1) {
        // Update existing post
        newPost.createdAt = posts[existingIndex].createdAt;
        posts[existingIndex] = newPost;
        await writeHamRadioPosts(posts);

        return res.json({
          message: "HAM radio post updated successfully",
          post: newPost,
          updated: true,
        });
      } else {
        // Add new post
        posts.push(newPost);
        await writeHamRadioPosts(posts);

        return res.status(201).json({
          message: "HAM radio post created successfully",
          post: newPost,
          updated: false,
        });
      }
    } catch (error) {
      console.error("Error creating HAM radio post:", error);
      res.status(500).json({ error: "Failed to create HAM radio post" });
    }
  },
);

// DELETE HAM radio post by slug (protected - requires API key)
app.delete(
  "/api/hamradio/posts/:slug",
  authenticate,
  writeLimiter,
  param("slug").isSlug().trim().escape(),
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid slug format" });
    }

    try {
      const posts = await readHamRadioPosts();
      const postIndex = posts.findIndex((p) => p.slug === req.params.slug);

      if (postIndex === -1) {
        return res.status(404).json({ error: "HAM radio post not found" });
      }

      const deletedPost = posts.splice(postIndex, 1)[0];
      await writeHamRadioPosts(posts);

      res.json({
        message: "HAM radio post deleted successfully",
        post: deletedPost,
      });
    } catch (error) {
      console.error("Error deleting HAM radio post:", error);
      res.status(500).json({ error: "Failed to delete HAM radio post" });
    }
  },
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Blog API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Blog data file: ${BLOG_DATA_FILE}`);
  console.log(`HAM radio data file: ${HAMRADIO_DATA_FILE}`);
  Promise.all([
    ensureDataFile(BLOG_DATA_FILE),
    ensureDataFile(HAMRADIO_DATA_FILE),
  ]).then(() => {
    console.log("Data files ready");
  });
});

# Mabus.ai Blog API

REST API for autonomous blog post management. Powers the blog section of mabus.ai.

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file (see .env.example)
cp .env.example .env
# Edit .env and add your API_KEY

# Run in development
npm run dev

# Run in production
npm start

# Or use pm2
pm2 start server.js --name blog-api
```

## API Endpoints

### Public (No Auth)

- `GET /health` - Health check
- `GET /api/blog/posts` - List all posts (metadata only)
- `GET /api/blog/posts/:slug` - Get single post (full content)

### Protected (Requires API Key)

- `POST /api/blog/posts` - Create/update post
- `DELETE /api/blog/posts/:slug` - Delete post

**Authentication:**
```
Authorization: Bearer YOUR_API_KEY
```

## Data Storage

Posts are stored in `data/blog-posts.json` as a JSON array.

**Post Schema:**
```json
{
  "slug": "string (unique)",
  "title": "string",
  "date": "YYYY-MM-DD",
  "excerpt": "string",
  "tags": ["string"],
  "readingTime": number,
  "qualityScore": number,
  "content": "HTML string",
  "sources": [{"title": "string", "url": "string"}],
  "editorNotes": {
    "issuesFound": ["string"],
    "improvements": ["string"]
  },
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

## Environment Variables

- `PORT` - Server port (default: 3301)
- `API_KEY` - Secret key for protected endpoints
- `NODE_ENV` - Environment (development/production)

## Integration with n8n

The n8n Agent 5 (Publisher) posts blog content to this API after:
1. Topic discovery
2. Research
3. Writing
4. Editing

See `DEPLOYMENT-GUIDE.md` for full setup instructions.

## Security

- Helmet.js for security headers
- CORS configured for mabus.ai domains
- API key authentication
- Input validation
- Rate limiting recommended for production

## Development

```bash
# Watch mode with auto-reload
npm run dev

# Test endpoints
curl http://localhost:3301/health
curl http://localhost:3301/api/blog/posts
```

## Production Deployment

See `DEPLOYMENT-GUIDE.md` for complete deployment instructions.

**Quick steps:**
1. Set environment variables
2. Run with pm2
3. Configure Caddy reverse proxy
4. Set up n8n webhook integration

## Monitoring

```bash
# Check logs
pm2 logs blog-api

# Check status
pm2 status blog-api

# View data file
cat data/blog-posts.json | jq
```

## Backup

```bash
# Backup posts
cp data/blog-posts.json backups/blog-posts-$(date +%Y%m%d).json
```

## License

MIT

## Grow log (`/api/grow`)

A section of its own, like ham radio. Grow posts are never part of the main blog feed.

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/grow/posts` | public (`?full=1` adds each body) |
| GET | `/api/grow/posts/:slug` | public |
| POST | `/api/grow/posts` | Bearer key (same key as the blog) |
| DELETE | `/api/grow/posts/:slug` | Bearer key (the photo file is kept) |
| POST | `/api/grow/photos` | Bearer key, multipart field `photo` |
| GET | `/api/grow/photos/:name` | public |

Photos:

- JPEG, PNG or WebP only. The type is read from the file's bytes, not its name.
- At most 15 MB and 30 megapixels. At most 10 uploads per 15 minutes, counted after the key check.
- Every photo is decoded and re-encoded with sharp, so EXIF, GPS, XMP, IPTC and text chunks are dropped. The result is checked again before it is written.
- The stored name is random (32 hex characters). The uploaded name is ignored.
- Stored in `data/grow-photos/` next to `posts.sqlite` (set `GROW_PHOTOS_DIR` to move it).

Limits: grow reads (list, posts, photos) skip the API-wide 100 per 15 minutes and have their own
budget of 3000 per 15 minutes (`GROW_READS_PER_15MIN`), because the site rebuild and photo views share one IP.

A post that names a blocked place, a street address, or coordinates is refused with 422.
The place names are not in this repo. Set them on the server in `GROW_BLOCKED_PLACES`
(comma separated) or in a file named by `GROW_BLOCKED_PLACES_FILE` (one per line).
Names of 3 characters or less must match case; longer names ignore case and also match
when spelled with spaces between the letters.

Tests: `npm test` (uses a temp SQLite file and photos folder).

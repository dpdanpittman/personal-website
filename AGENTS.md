# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this is

A personal website with two parts. The front end is a React single page app (Create React App) that started from a public portfolio template; it has home, about, portfolio, blog, ham radio, resources, contact and privacy pages. The `api/` folder is a small Express service, the blog API, that stores posts in SQLite. It serves the blog, the ham radio log and the grow log, and takes photo uploads for the grow log. Posts are written by an automation pipeline that calls the API with a bearer key. The project is live: recent commits note that the repo was brought in line with what runs on the server.

## Layout

- `src/` React front end. `src/app/routes.js` holds the routes, `src/pages/` one folder per page, `src/content_option.js` the page text.
- `src/setupProxy.js` dev proxy: `/api` goes to the API on port 3301.
- `public/` static HTML shell, manifest, robots.txt.
- `api/server.js` Express app: blog and ham radio endpoints, auth, rate limits, sanitizing.
- `api/grow.js` grow log routes and photo upload (location data stripped, place names refused).
- `api/db.js` SQLite store (`data/posts.sqlite` unless `POSTS_DB_PATH` is set).
- `api/scripts/` one-off maintenance scripts (JSON to SQLite migration, editor notes cleanup).
- `api/test/` Node test runner tests and image fixtures.
- `api/Dockerfile` the API image.
- Root `*.md` files other than this one are older notes. Some describe hosting that is no longer used (GitHub Pages, Netlify, pm2). Trust the code over them.

## Commands

API (verified: `npm test` passed 24 of 24):

```bash
cd api
npm ci
npm test          # node --test test/*.test.js, uses a temp SQLite file and photo folder
npm run dev       # nodemon, port 3301 by default
npm start
```

Front end (not verified here):

```bash
npm install       # both package-lock.json and yarn.lock exist; do not add a third lock file
npm start         # dev server on port 3300
npm run build     # output in build/
npm test          # react-scripts test (no front end tests exist yet)
```

There is no separate lint script. The front end uses the `react-app` ESLint config through react-scripts.

## Deployment

The blog API runs as a deployment on the owner's homelab cluster. The image is built from `api/Dockerfile` on the host; the manifests are not in this repo. The front end is served behind the same reverse proxy, which sends `/api/*` to the API. The `deploy` and `predeploy` scripts in `package.json` (GitHub Pages) are leftovers from the template and are not how the site ships.

An agent does not deploy, build images, or touch the running system. A change to the live site is a reviewed change the owner rolls out.

## Rules for agents

- Ask before large changes. Explain the problem and the proposed fix first. Keep diffs small and surgical.
- Never commit secrets: API keys, tokens, passwords, `.env` files. Secrets live in a password manager and reach the server at run time.
- Never delete this repository or rewrite published history.
- Do not change the Dockerfile, deployment notes or infrastructure files unless that is the task.
- Before saying a change is done, run `cd api && npm test` for API changes, and `npm run build` for front end changes. Say plainly what you did not run.
- Commit messages: short, imperative, say what changed. API commits usually start with `blog-api:`.
- `package.json.new` and `api/clean-editor-notes.js` (a copy of the one in `api/scripts/`) are tracked on purpose to match the server. Do not delete or "tidy" them without asking.

Traps in this code:

- Grow photos must never leak location. `api/grow.js` re-encodes every upload with sharp to drop EXIF, GPS and other metadata, then checks the result again. Keep both steps. The fixtures in `api/test/fixtures/` (for example `gps.jpg`) exist to prove this; keep those tests passing.
- The grow log refuses posts that name a blocked place, a street address or coordinates. The blocked place names are set on the server (`GROW_BLOCKED_PLACES` or `GROW_BLOCKED_PLACES_FILE`). Never put real place names in code, tests, fixtures or commit messages.
- Grow posts are their own section. Do not mix them into the main blog feed.
- Write routes check the bearer key before rate limits and body parsing. Keep that order.
- All post HTML goes through sanitize-html. Do not add a path that stores or returns unsanitized HTML.
- Tests load the app without listening (`require.main` check in `server.js`). Keep `module.exports = app`.

## Never commit or make public

This repository is public.

- No secrets of any kind, and no real values in `api/.env.example`.
- The tracked root `.env` holds only two build flags. Do not add anything else to it; put real settings in an untracked file.
- No blog data: `api/data/` (the SQLite database, grow photos, old `blog-posts.json`).
- No personal details about the owner beyond what the site already shows: no home location, address, health or family details.
- No internal hostnames, IP addresses, machine usernames or home directory paths. Some older notes in the repo already contain them; do not add more, and do not copy them into new files.

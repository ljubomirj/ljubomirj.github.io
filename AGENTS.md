# Repository Guidelines

## Project Structure & Module Organization
- Root contains the static site: `index.html`, shared `sidebar.html`, and content pages like `post-*.html`.
- Large archives live in pages such as `twitter-history.html`; media assets (images, PDFs, audio) are stored in the repo root and `picmem/`.
- `scripts/` holds maintenance tooling (feeds, embeddings, bookmarklet build).
- `api/` contains a small proxy/API helper used by the site.
- Node dependencies live in `node_modules/`, configured by `package.json`.

## Build, Test, and Development Commands
- `make feeds` — regenerate `feed.xml` (Atom) and `rss.xml` (RSS 2.0) from local `.html/.pdf`.
- `python3 scripts/build-feeds.py` — same as above with optional `--base-url`.
- `make twitter-LJ-posts-archive-bookmarklet.txt` — rebuild the bookmarklet output from `twitter-LJ-posts-archive-bookmarklet.js`.
- `node scripts/build-knowledge.js` — rebuild `knowledge.json` from HTML/PDF sources.
- `npm run build:embeddings` — generate `knowledge-embeddings.json`.
- `make all` — runs embeddings + feeds.
- `npm test` — placeholder; no automated tests configured.

## Coding Style & Naming Conventions
- HTML/JS use 4-space indentation; keep formatting consistent with neighboring files.
- Content pages follow `post-*.html` naming; keep new media in the repo root or `picmem/`.
- Prefer updating scripts in `scripts/` over one-off shell commands.

## Testing Guidelines
- No formal test framework. Smoke-test pages locally via:
  - `python3 -m http.server 8000` and open `http://localhost:8000/`.
- After content updates, run `make feeds` to ensure feed entries are current.

## Commit & Pull Request Guidelines
- Commit history uses short, concise messages (e.g., “fix”, “rss and atom”). Keep messages brief and action-oriented.
- PRs (if used) should describe changes, note regenerated artifacts (feeds, bookmarklet, embeddings), and include screenshots for visual/layout changes.

## Content & Feeds Notes
- `feed.xml` and `rss.xml` are generated outputs; regenerate after adding/removing pages or PDFs.

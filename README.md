# Project Documentation
Ljubomir Josifovski personal home page at ljubomirj.github.io

## Overview
This is an HTML-based blog/static website project, containing:
- Blog posts in `.html` format
- Central styling via `style.css`
- JavaScript functionality including Twitter integration, API handling, and browser extensions

## Key Files & Directories

### HTML Content (Blog Posts)
- `index.html`: Main landing page
- Multiple post pages (e.g. `post-data-debugging.html`, `post-twitter.html`): Individual articles
- `sidebar.html`: Sidebar content (navigation, links)

### CSS Style
- `style.css`: Main stylesheet for styling all pages

### JavaScript Functionality
- `scripts.js`: Core functionality (interactions, DOM manipulation)
  - `api/`:
    - `oembed.js`: Embedding functionality
    - `proxy.js`: API proxying
- Twitter integration scripts:
  - `twitter-LJ-posts-archive-tampermonkey.js`: Tampermonkey script for Twitter archiving
  - `twitter-LJ-posts-archive-bookmarklet.js`: Bookmarklet version of Twitter archiving
  - `twitter-tasters.html`: Twitter-related content

- Footer search widget (client-side, no backend):
  - `scripts/build-search-index.js` — chunks all public pages (per-tweet for
    `twitter-history.html` with anchors; per-section elsewhere) and emits
    `search-index.json` (prebuilt MiniSearch BM25 index) + `search-texts.json`
    (full texts, lazy-loaded). Run via `make search`.
  - `search/minisearch.js` — vendored MiniSearch UMD (copied from node_modules
    at build; committed since GitHub Pages has no node).
  - Widget: injected into the footer row by `scripts.js` — [Search] button,
    input, this-page/site radios. `/pattern/` or `re:` queries run regex
    passes over `search-texts.json`; everything else is BM25. Results
    deep-link to `page#anchor` (tweet ids) and flash-highlight in page.
  - Various `.html` files documenting Vim tutorials
- Configuration-related files:
  - `bashrc-ml-setup.html`: Shell setup guide
  - `arxiv-tasters.html`, `youtube-tasters.html`: Content examples

# Meaning search for twitter-history.html (needle-style, Jev) — research + plan

Status: **built and verified locally; not deployed.** Date: 2026-09-28. Author: OMP session.
Goal: a **second** search box, on `twitter-history.html` only, that finds posts by
*meaning* (Jev / TypeSafe System One: typed questions + probabilities, no generated
text), next to the existing BM25 box, so the two can be compared on one page.

## 0. Decisions (LJ, 2026-09-28)

1. **Public endpoint is fine** — worst case a stranger spends the $5 credit. The point
   is to show system-1/Jev in action.
2. **Ship the Jev box** — the question to answer is the quality/cost tradeoff.
3. **1 chunk = 1 post** is the right boundary; split on line/paragraph breaks only when a
   post is too big. This is also a rehearsal for **email processing**: is Jev
   faster/cheaper there, where texts are long and must be chunked anyway.
4. **Index everything**: X, Bluesky, Substack — and later Mastodon etc. — for variety.
   Paragraph breaks where needed.
5. Key supplied: TypeSafe `lj-personal-1` (stored at `~/.config/typesafe.env`, mode 600;
   never in the repo).

## 1. What shipped (all verified locally, nothing pushed)

| Artifact | What it does |
|---|---|
| `scripts/build-search-index.js` | **Fixed + generalized.** Chunks every social block (`tweet`, `substack`), not just `<div class="tweet" id="N">`; strips `<style>`/`<script>`/comment bodies that quote example markup; anchor = div id → in-post `<a id>` → `data-num`; splits a post only above `MAX_TEXT_CHARS` (2500) at blank-line → line → sentence boundaries |
| `search-index.json`, `search-texts.json` | Rebuilt: **10,290** page chunks (was 7,685), 5.6M chars of text (was 4.14M), index 14.1 MB (was 10.5 MB) |
| `scripts.js` | `locateByText` O(n²) fix (40.7 s → 0.68 s on this page) and a **second widget** — "Meaning search" with fast / whole-page modes, own results panel, focus-sentence highlight via CSS Custom Highlight (`::highlight(lj-focus)`), plus a diagnostics line |
| `style.css` | Styles for the second widget (`.lj-semantic-row`, `#lj-semantic*`) |
| `api/_jev-search.js` | The core: BM25 shortlist → Jev `choice`-over-ids ranking + `exists` gate + focus-sentence pass; whole-page mode windows the corpus, ranks each window, re-ranks the pooled best |
| `api/semantic.js` | Vercel handler: CORS (same allowlist as `api/proxy.js` + any localhost), validation, per-IP/day cap on whole-page mode, `TYPESAFE_API_KEY` server-side |
| `scripts/test-semantic-search.js` | CLI over the same core: `--mode=bm25\|exhaustive\|needle`, prints ranking, BM25 ranks, tokens, cost, latency |
| `scripts/dev-server.js` | Static + `api/` locally, so the widget can be exercised without deploying (`node scripts/dev-server.js --port=8001`) |
| `vercel.json` | `api/semantic.js` `maxDuration: 60` (whole-page mode needs ~7-9 s) |

## 2. How needle does it (read from source)

One `POST /v1/evaluate` with `model: typesafe-ai/jev`, `state: {search, passages[]}`, and
**two questions per passage** — `boolean` "is this passage directly useful?" + `choice`
"which single sentence answers it" (criteria = the passage's sentences). Include-cut at
probability ≥ 0.58. Self-imposed caps: 160 passages / 2200 chars each / 60k chars, 45 s
timeout — sized to Jev's 32k-token context. Frontend maps server offsets → DOM `Range` →
CSS Custom Highlight, bailing when the DOM text ≠ the scored text. Key stays server-side;
browser talks to a local backend with an optional app token.

## 3. Jev facts — measured against the live API (not docs)

| Fact | Measurement |
|---|---|
| Model / endpoint | `jev-1.13.0`, `POST https://api.typesafe.ai/v1/systemone` (Gateway route exists too: `typesafe-ai/jev`, needs an `AI_GATEWAY_API_KEY`) |
| Price | $0.042 / 1M input tokens, output free |
| Token cost | **≈ 0.3 tokens per character** of state (≈ chars/3.3) **+ ≈25 tokens per passage** of JSON scaffolding |
| Latency | **250–650 ms per request**, essentially independent of size (80-window fan-out: 6.6 s at concurrency 16, 8.1 s at 6) |
| Context | 32k tokens → one request holds **~140 of our ~500-char posts** (~75k chars, ~24k estimated tokens). A window that fits in *characters* can still overflow when it holds many short posts — budget in estimated tokens, not chars |
| Question limits | ≤255 options per `choice`; `score` ≤10 levels; questions evaluated in parallel and in isolation |
| Ranking quality | `choice`-over-ids: **0.4–0.97** for a real hit (well calibrated, one question). One `noul` per passage: same cost but tops out near **0.3** → use it only as the "does this page answer it at all" gate (measured 0.92 for an answerable query, 0.02 for an unanswerable one) |
| Cross-request comparability | choice probabilities are relative *within* a request → whole-page mode re-ranks each window's best candidates in one pooled request |

## 4. Measured behaviour on our page

| Mode | Requests | Tokens | Cost | Latency | Notes |
|---|---|---|---|---|---|
| fast (`bm25`, K=40) | 2–3 | 18k–30k | **$0.0007–0.0013** | **1.2–1.4 s** | BM25 shortlist, then Jev ranks it; `exists` gate; focus sentence for the top 3 |
| whole page (`exhaustive`) | 82 | 1.94M | **$0.0815** | **6.6–9.0 s** | every one of the 10,290 chunks, 81 token-budgeted windows + pooled re-rank |
| needle shape (`needle`) | 1 | ~24k | $0.001 | ~0.5 s | one `noul` per passage; kept in the CLI for comparison only |

Query "why do I distrust vitamin D studies":
* BM25 top-1 was a generic "things don't work out" post; Jev (both modes) put the actual
  Vitamin-D-skepticism posts first — whole-page mode surfaced posts BM25 ranks **#343,
  #378, #225, #5257, #3688**, i.e. lexical search never had a chance.
* Whole-page mode reported `answers: 92%` for that query, `2%` for "what is my sourdough
  starter hydration ratio" — the page-level gate works and is worth showing in the UI.

Browser verification (headless, local dev server): fast mode rendered 25 hits in 1.4 s;
click → scroll + flash + `lj-focus` highlight range inside the correct tweet
(`#8042`, id `1777733480048464098`); whole-page mode rendered in 9.0 s with 82 requests /
1.94M tokens / $0.0816 in the diagnostics line.

## 5. Bug found and fixed while measuring

1. **Stale/broken index (was blocking any fair comparison).** The builder's regex
   `<div class="tweet" id="(\d+)">` matched **0** divs in the current file (which writes
   `id="…" data-num="…"`), so `make search` would have indexed **zero** X posts; the
   committed index (built 2026-09-05) covered only 7,685 of 8,814 id-bearing posts
   (1,129 missing) and none of the 78 Substack posts. Now: 10,290 chunks, every anchor
   resolvable except the 106 Substack parts (which locate by text — verified), no
   `MAX_TEXT_CHARS` truncation (was silently dropping 113k chars across 100 posts).
2. **`locateByText` was O(n²)** — appending to one growing string while testing
   `all.endsWith()` per node re-flattens the rope: **40.7 s** on this page. Now array +
   join with a tracked seam: **0.68 s**, byte-identical output and offsets (checked
   against the old algorithm on 3,000 nodes).

## 6. Remaining work

### P0 — index repair — **done**
- [x] Generalize the chunker (tweet id → `<a id>` → `data-num`; add `substack`; strip
      comments/style/script bodies).
- [x] Split oversized posts on natural boundaries instead of truncating.
- [x] Rebuild; verify counts, anchors, no truncation, and the widget end to end.

### P1 — Jev core + endpoint — **done**
- [x] Live key check, cost/latency/limit measurements, question calibration.
- [x] `api/_jev-search.js` (choice-over-ids + `exists` + focus; windowed whole-page mode
      with pooled re-rank) and `api/semantic.js`.
- [x] CLI harness `scripts/test-semantic-search.js`.
- [x] `vercel.json` duration; per-IP/day cap on the expensive mode.

### P2 — second box on the page — **done**
- [x] Widget injected only on `twitter-history.html`; fast/whole-page modes; panel with
      probability, BM25 rank, focus sentence; diagnostics line.
- [x] Click → locate (anchor or focus text) + flash + persistent `lj-focus` highlight.

### P3 — deploy (LJ's steps)
- [ ] Add `TYPESAFE_API_KEY` to the Vercel project (Production) — dashboard or
      `vercel env add TYPESAFE_API_KEY production`. Without it the endpoint answers 503.
- [ ] Commit + push (LJ commits): the rebuilt `search-index.json` / `search-texts.json`
      must ship for GitHub Pages, and `api/*` for Vercel. Checked 2026-09-28: the commit
      exists locally but `main` is 1 ahead of `github/main`, so nothing was deployed and
      `…/api/semantic` still answers 404.
- [ ] Smoke the live endpoint (`curl -s …/api/semantic -d '{"query":"…"}'`) and then the
      live page; check the diagnostics line and that whole-page mode returns < 60 s.
- [ ] Confirm the free-tier/credit balance on the TypeSafe account ($5 ≈ 60 whole-page
      searches, or ~4,000 fast ones).

**Local servers.** `python3 -m http.server 8000` cannot proxy the API: it has no POST
handler and no CORS headers, so the widget's POST dies with 501/"Failed to fetch". The
widget now tries, in order: a `localStorage.ljSemanticEndpoint` override → the current
origin when on localhost → the deployed Vercel endpoint. So:
* full local stack: `node scripts/dev-server.js --port=8001` (serves the site *and* `api/`)
  → `http://localhost:8001/twitter-history.html`;
* `localhost:8000` works once the endpoint is deployed, via the automatic fallback.

### P4 — evaluate properly (the "is it worth it" step)
- [ ] Collect 15–20 real queries with a known good post; record BM25 rank vs Jev rank per
      query, plus `exists`, cost and latency; write the table here.
- [ ] Decide shipped defaults: mode default (fast), K, whether to show `exists` as a
      percentage, and whether whole-page mode stays behind the per-IP cap.
- [ ] Tune the ranker's wording from failures (the `choice` instruction is the knob).

### P5 — cheaper whole-page recall (next real improvement)
- [ ] Whole-page mode's cost is the state itself (every character scored once): $0.08.
      Replace the exhaustive sweep with a **dense prefilter** — per-post MiniLM vectors
      (int8 ≈ 3 MB binary shard, built locally in ~2 min at the measured 12.4 ms/chunk;
      `@xenova/transformers` is already a dependency) — then Jev ranks the top ~150
      (~$0.004/query) with the pooled re-rank already in place.
- [ ] Keep exhaustive mode as the recall ceiling to score the prefilter against.
- [ ] Optional: give the 78 `<div class="substack">` blocks ids so their results deep-link
      by anchor instead of text-locating.

## 7. Risks / open questions

1. **Public endpoint** — fast mode is open (~$0.001/search); whole-page mode is capped per
   IP per day (best-effort: in-memory, per instance, resets on cold start). If it gets
   abused, add a WAF rate limit or a needle-style access token.
2. **Vercel function duration** — whole-page mode measured 6.6–9.0 s; `maxDuration: 60` is
   set, so a slow cold start still fits.
3. **Rate limits** — no 429s observed at concurrency 6–16 (82 requests). Unknown ceiling on
   the TypeSafe account; the core's `concurrency` is the knob.
4. **Frozen snapshot** — the endpoint reads the page's chunks from the deployed
   `search-index.json`; a page update needs a rebuild + redeploy (same failure mode as the
   stale-index bug in §5).
5. **Threshold semantics** — probabilities are relative to the candidate set, so a fixed
   include-cut (needle's 0.58) does not transfer; the UI shows the top 25 with their
   probability plus the page-level `exists` gate.
6. **Jev jaggedness** — `docs.typesafe.ai/model-jaggedness/jev-1.13.md` lists known rough
   edges; read before tuning criteria wording.
7. **Long-text (email) shape** — per-question overhead is small (~25 tokens/passage), so
   cost is ~chars/3.3 regardless of how the text is chunked; chunking matters for
   *ranking quality* (a `choice` over too many ids is where the 255-option cap bites),
   not for cost. Rehearsal on emails should therefore test windowing + pooled re-rank, not
   per-chunk question spam.

## 8. Verification commands

```sh
# local widget (needs the key file; serves static + api)
node scripts/dev-server.js --port=8001     # then open http://localhost:8001/twitter-history.html

# CLI, same core as the endpoint
node scripts/test-semantic-search.js "why do I distrust vitamin D studies" --mode=bm25
node scripts/test-semantic-search.js "why do I distrust vitamin D studies" --mode=exhaustive

# index rebuild after page updates
node scripts/build-search-index.js         # or: make search

# live endpoint once deployed
curl -s https://ljubomirj-github-io.vercel.app/api/semantic \
  -H 'content-type: application/json' -d '{"query":"costs beyond the advertised price","mode":"bm25"}' | jq '.diag'
```

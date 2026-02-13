# Project Memory: ljubomirj.github.io

## Session Log

- 2026-02-09: Phase 0 chat upgrade (system prompt rewrite for LJ persona, model switch DeepSeek->Gemini 2.5 Flash via OpenRouter, context framing improvement). Built v2 tree-based RAG: `scripts/build-tree-index.js` converts HTML+PDF+twitter-cluster-MD into hierarchical tree index (381 nodes, 61KB lightweight index). Created `api/proxy-v2.js` with 2-step LLM flow (tree search + answer generation with observational memory bridge). Created `post-chat-LJ-v2.html` with source attribution UI. Updated vercel.json (maxDuration 45 for v2) and Makefile. Inspired by PageIndex (~/LJ-ML-comp/PageIndex/) and Mastra observational memory pattern.
- 2026-02-13: Fixed bookmarklet bug where self-quoting tweets caused `pickMainTimeLink` to pick the quoted tweet's status link instead of the main tweet's. Root cause: `a[href*="/status/"]` selector matched links inside quoted-tweet containers. Fix: added `isInsideQuote()` helper using `[data-testid="quoteTweet"]` and `div[role="link"][tabindex="0"]` selectors; applied to both `pickMainTimeLink` and `extractText`. Added console.debug logging for easier future debugging.

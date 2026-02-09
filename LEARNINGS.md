# Learnings: ljubomirj.github.io

## Build Pipeline
- pandoc with `--wrap=none` is critical for markdown conversion — without it, heading lines get wrapped and break regex parsing
- The Lua filter approach (`strip-nav.lua`) cleanly strips sidebar/scripts before pandoc conversion; much better than post-processing
- Twitter cluster files from LJ-twitter-clusters-md/ are pre-organized into 20 thematic markdown files — perfect for tree indexing without extra processing

## Architecture
- PageIndex tree-building algorithm (page_index_md.py) is straightforward to port to JS: heading regex + stack-based tree builder, ~50 lines core logic
- For multi-document sites, concatenating pages with source annotations (`<!-- source: filename -->`) then tracking via line-number source map works well
- The 61KB tree index vs 80MB embedding index is a massive win for Vercel cold starts

## Vercel Deployment
- Hobby plan supports maxDuration up to 60s — sufficient for 2 sequential LLM calls
- Tree JSON files must be in repo (deployed as static assets) since Vercel serverless functions can read files relative to __dirname

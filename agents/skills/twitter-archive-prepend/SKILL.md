---
name: twitter-archive-prepend
description: "Workflow for prepending newly captured X (Twitter) posts to twitter-history.html in this repo. Use whenever a fresh bookmarklet capture (a qwe-style file of @ljupc0 posts: '  * <status url>', author line, body, timestamp) needs to be converted to the archive's <div class=\"tweet\"> format and prepended. Covers the converter script, the manual-review edge cases, the exact insertion point, and post-splice verification."
---

# Prepend new X posts to twitter-history.html

Archive file: `twitter-history.html` (large, ~7MB, newest-first).
Capture files: scratch files such as `qwe` produced by
`twitter-LJ-posts-archive-bookmarklet.js` (built via `make twitter-LJ-posts-archive-bookmarklet.txt`).

## 1. Convert

```bash
python3 twitter-blocks-to-html.py <capture-file(s)> > /tmp/blocks.html
```

The script (repo root) parses bookmarklet capture blocks — each block is
`  * https://x.com/ljupc0/status/<id>`, author line, body lines, timestamp —
and emits `<div class="tweet" id="<id>">` blocks with HTML escaping
(`&apos;` style), `<br>` on content lines, in-tweet `http[s]://` URLs turned
into hyperlinks, and blank body lines dropped. It implements the vim
procedure documented in the HTML comment at the top of
`twitter-history.html`; that comment is the source of truth for the format.

## 2. Manual review of generated blocks (mandatory)

The converter sticks to basics, as the archive comment documents. Check every
block for:

- **URLs adjacent to quotes/brackets**: the hyperlink regex
  `[^\s)\]},<]+` swallows trailing `&quot;` etc. into the anchor
  (`href="...&quot;"` is wrong). Move the stray character outside the
  `</a>`. Known recurring case: `curl "https://..."` command lines.
- **Truncated URLs** ending in `…`: leave them hyperlinked — that matches
  existing archive convention (`…</a>` occurs hundreds of times).
- **Scheme-less mentions** like `x.com/user/status/…`: leave as plain text —
  the archive never hyperlinks them.
- **Timestamp** is the last line of each block; exactly one per block.

## 3. Insert

- Find the end of the procedure comment: the FIRST `-->` line in the file
  (`grep -n '^-->' twitter-history.html` — later ones close the Substack and
  Bsky comment blocks; never touch those).
- Insert the new blocks directly after that `-->`, i.e. immediately before
  the current newest tweet. Keep the capture file's order (newest-first).
- Separator: one blank line between blocks (the script already emits one).

## 4. Verify

```bash
grep -c '^<div class="tweet" id="[0-9]*">' twitter-history.html   # +N vs before
grep -c '^</div>$' in the inserted range                          # must equal N
```

- **Duplicates**: for each new id, confirm it does not already exist in the
  archive before splicing.
- **Boundary**: lines around the splice must read `-->`, first new `<div ...>`,
  …, last new `</div>`, blank line, previous newest `<div ...>`.
- **Render smoke test**: `python3 -m http.server 8000`, open
  `http://localhost:8000/twitter-history.html`, confirm the page completes
  loading and the DOM contains the expected number of `div.tweet[id]`
  (old count + N) with the first being the newest post id.

## 5. Housekeeping

- Leave the capture file in place unless the user says otherwise; never delete
  scratch files unprompted.
- Do not commit — LJ commits. Report the changed files
  (`twitter-history.html`, possibly `twitter-blocks-to-html.py`).

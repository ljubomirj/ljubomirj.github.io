#!/usr/bin/env python3
"""
One-shot numbering of the posts in twitter-history.html (re-runnable).

Every <div class="tweet"> gets a hard-coded ordinal:

  - data-num="N" attribute on the div itself
  - a per-post anchor line before the closing </div>, so any post is
    addressable via URL:

      .../twitter-history.html#N        (always)
      .../twitter-history.html#N-slug   (posts long enough to warrant a slug;
                                         slug = first three words of the body)

  e.g.  <div class="tweet" id="2096..." data-num="8506">
        ...
        <a id="8506"></a><a class="post-num" id="8506-hermes-goldmine" href="#8506-hermes-goldmine">#8506</a>
        </div>

Numbering starts at 1 at the BOTTOM of the page (the last/oldest post) and
counts +1 going up, so newly prepended posts at the top simply take the next
free numbers and existing numbers never change.  twitter-blocks-to-html.py
assigns those numbers for new posts the same way (max existing data-num + 1).

Divs already carrying data-num are left untouched: re-running never
renumbers anything.
"""

import re
import sys
from pathlib import Path

DEFAULT_ARCHIVE = Path(__file__).resolve().parent.parent / 'twitter-history.html'

DIV_RE = re.compile(r'^<div class="tweet"[ >]')
CLOSE_RE = re.compile(r'^</div>$')
TS_RES = [
    re.compile(r'\d{1,2}:\d{2}\s*(?:AM|PM)\s*·'),        # X: 7:51 AM · Sep 5, 2026
    re.compile(r'\w{3} \d{1,2}, \d{4} at \d{2}:\d{2}'),  # Bsky: Aug 7, 2024 at 09:12
    re.compile(r'^\s*\d{1,2} \w+ \d{4}\s*$'),            # Bsky: 17 December 2024
]
DOMAIN_RE = re.compile(r'^[a-z0-9-]+(\.[a-z0-9-]+)+$')
URL_SUB_RE = re.compile(r'https?://\S+')
DROP_TOKENS = {'http', 'https', 'www', 'com', 'x'}
SLUG_WORDS = 3
MIN_WORDS_FOR_SLUG = 6
MAX_WORDS_TO_SCAN = 12


def strip_tags(line: str) -> str:
    return re.sub(r'<[^>]+>', '', line)


def slug_words(block_lines: list[str]) -> list[str]:
    """First few meaningful words from the top of a post body, or []."""
    words = []
    for line in block_lines:
        text = strip_tags(line).strip()
        if not text:
            continue
        if any(ts.search(text) for ts in TS_RES):
            break  # reached the timestamp: body is over
        low = URL_SUB_RE.sub(' ', text.lower())  # drop urls, keep the prose
        # skip bare domain/path lines (link previews, scheme-less x.com/...)
        if (' ' not in low and '.' in low) or DOMAIN_RE.match(low.strip()):
            continue
        if '@' in low:  # author lines (and mentions) stay out of slugs
            continue
        for tok in re.findall(r'[a-z0-9]+', low):
            if len(tok) < 2 or tok in DROP_TOKENS:
                continue
            words.append(tok)
            if len(words) >= MAX_WORDS_TO_SCAN:
                break
        if len(words) >= MAX_WORDS_TO_SCAN:
            break
    return words


def make_slug(block_lines: list[str]) -> str:
    words = slug_words(block_lines)
    if len(words) < MIN_WORDS_FOR_SLUG:
        return ''
    return '-'.join(words[:SLUG_WORDS])


def anchor_line(num: int, slug: str) -> str:
    """The per-post anchor line inserted before the block's </div>.

    The empty <a id="N"> keeps the bare-number URL working when a slug
    exists, so both ...#N and ...#N-slug address the same post.
    """
    if slug:
        return (f'<a id="{num}"></a>'
                f'<a class="post-num" id="{num}-{slug}" href="#{num}-{slug}">#{num}</a>')
    return f'<a class="post-num" id="{num}" href="#{num}">#{num}</a>'


COMMENT_TOKEN_RE = re.compile(r'<!--|-->')



def find_blocks(lines: list[str]) -> list[tuple[int, int]]:
    """(start, end) line indices of every <div class="tweet"> block.

    Content inside HTML comments (the vim-procedure comment at the top of
    the archive mentions '<div class="tweet">' as literal text) is ignored.
    Scanning follows real HTML comment semantics token by token: a comment
    starts at '<!--' and ends at the next '-->', whatever line it is on,
    and only text outside comments is searched for post markers.
    """
    blocks = []
    in_comment = False
    open_at = None
    for i, line in enumerate(lines):
        # reduce the line to the text visible outside HTML comments
        visible = []
        pos = 0
        for m in COMMENT_TOKEN_RE.finditer(line):
            if m.group() == '<!--' and not in_comment:
                visible.append(line[pos:m.start()])
                in_comment = True
                pos = m.end()
            elif m.group() == '-->' and in_comment:
                in_comment = False
                pos = m.end()
        if not in_comment:
            visible.append(line[pos:])
        text = ''.join(visible)

        if open_at is not None:
            if CLOSE_RE.match(text):
                blocks.append((open_at, i))
                open_at = None
        elif DIV_RE.match(text):
            open_at = i
    return blocks


def main() -> int:
    archive = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_ARCHIVE
    lines = archive.read_text(encoding='utf-8').splitlines()

    blocks = find_blocks(lines)
    if not blocks:
        print(f'No <div class="tweet"> blocks found in {archive}', file=sys.stderr)
        return 1

    # bottom-most block on the page is #1, counting +1 upward; walk bottom-up
    # so the line insertions don't shift the indices of pending blocks
    numbered = slugged = skipped = 0
    for idx in range(len(blocks) - 1, -1, -1):
        num = len(blocks) - idx
        start, end = blocks[idx]
        div_line = lines[start]
        if 'data-num=' in div_line:
            skipped += 1
            continue
        lines[start] = re.sub(r'(<div class="tweet"[^>]*?)>',
                              rf'\1 data-num="{num}">', div_line, count=1)
        slug = make_slug(lines[start + 1:end])
        if slug:
            slugged += 1
        lines.insert(end, anchor_line(num, slug))
        numbered += 1

    archive.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'{archive}: {len(blocks)} blocks, {numbered} numbered, '
          f'{slugged} with slug, {skipped} already numbered (left alone)')
    return 0


if __name__ == '__main__':
    sys.exit(main())

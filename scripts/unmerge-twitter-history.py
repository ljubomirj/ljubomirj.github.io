#!/usr/bin/env python3
"""
Split the accidentally-merged mega-post of twitter-history.html back into
individual posts.

The blob is one <div class="tweet"> holding ~1,130 posts whose per-post
<div>/</div> boundaries (and anchor lines) were lost in old manual editing.
Inside it every post is still intact and in archive order (newest-first),
separated from the previous one by a standalone '<br>' line, and each post
begins with its status-link line immediately followed by the author line:

    ...timestamp<br>
    <br>
    <a href="https://x.com/ljupc0/status/<id>">https://x.com/ljupc0/status/<id></a><br>
    Ljubomir Josifovski @ljupc0<br>
    ...

This script locates the blob (the biggest <div class="tweet"> block), cuts
it at that boundary, and re-emits each segment as a bare block:

    <div class="tweet" id="<status id>">
    <segment content lines, verbatim>
    </div>

No data-num and no anchor lines are written: run
  python3 scripts/number_twitter_history.py --renumber
afterwards to stamp fresh position-based numbers and anchors onto all posts.

The split only inserts structural lines; segment content lines are byte
identical to the blob's.  Safe to re-run: with no blob left, it does nothing.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from number_twitter_history import ANCHOR_RE, DEFAULT_ARCHIVE, find_blocks

START_RE = re.compile(r'^<a href="(https://x\.com/ljupc0/status/(\d+))">\1</a><br>$')
AUTHOR_LINE = 'Ljubomir Josifovski @ljupc0<br>'
SEPARATOR = '<br>'


def split_blob(inner: list[str]) -> tuple[list[str], int]:
    """Cut blob-internal lines into segments at post starts.

    Returns (segments, number of separator lines dropped).  A post start is
    a status-link line followed by the exact author line; posts other than
    the first are preceded by the standalone <br> separator, which is
    dropped (rebuilt blocks are separated by blank lines instead).
    """
    starts = [k for k, l in enumerate(inner)
              if START_RE.match(l)
              and k + 1 < len(inner) and inner[k + 1] == AUTHOR_LINE
              and (k == 0 or inner[k - 1] == SEPARATOR)]
    if not starts:
        return [], 0
    if starts[0] != 0:
        # content before the first detected post start: keep it attached to
        # the first segment rather than losing it
        starts = [0] + starts

    bounds = starts + [len(inner)]
    dropped = sum(1 for a, b in zip(bounds, bounds[1:])
                  if b < len(inner) and inner[b - 1] == SEPARATOR)
    segments = []
    for a, b in zip(bounds, bounds[1:]):
        seg = inner[a:b]
        if b < len(inner) and seg[-1] == SEPARATOR:
            seg = seg[:-1]
        segments.append(seg)
    return segments, dropped


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    archive = Path(args[0]) if args else DEFAULT_ARCHIVE
    lines = archive.read_text(encoding='utf-8').splitlines()

    blocks = find_blocks(lines)
    start, end = max(blocks, key=lambda b: b[1] - b[0])
    if end - start < 100:
        print('No blob found: biggest block is only '
              f'{end - start + 1} lines - nothing to do.')
        return 0

    div_line = lines[start]
    blob_id = re.search(r'id="(\d+)"', div_line).group(1)
    # inner content without the surviving post-number anchor line
    inner = [l for l in lines[start + 1:end] if not ANCHOR_RE.match(l)]

    segments, dropped = split_blob(inner)
    if not segments:
        print('Blob found but no post boundaries detected - aborting, '
              'file left unchanged.', file=sys.stderr)
        return 1
    dropped_anchor = sum(1 for l in lines[start + 1:end] if ANCHOR_RE.match(l))

    out = []
    for seg in segments:
        status_line = seg[0]
        post_id = START_RE.match(status_line).group(2)
        out.append(f'<div class="tweet" id="{post_id}">')
        out.extend(seg)
        out.append('</div>')
        out.append('')

    lines[start:end + 1] = out
    archive.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'{archive}: blob (id {blob_id}, {end - start + 1} lines) split into '
          f'{len(segments)} posts; dropped {dropped} separators, '
          f'{dropped_anchor} stale anchor line(s)')
    return 0


if __name__ == '__main__':
    sys.exit(main())

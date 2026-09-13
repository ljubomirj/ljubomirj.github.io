#!/usr/bin/env python3
"""
Convert twitter-LJ-posts-archive-block (N).txt files into the HTML format
used in twitter-history.html, matching the manual vim procedure documented
in the HTML comment at the top of that file.

Usage:
  python3 twitter-blocks-to-html.py ~/Downloads/twitter-LJ-posts-archive-block*.txt

Output: ready-to-splice <div class="tweet"> blocks on stdout.  Review them
(see agents/skills/twitter-archive-prepend/SKILL.md), then paste into
twitter-history.html directly after the FIRST '-->' line (newest-first).

Posts are numbered automatically: the script reads twitter-history.html,
takes the max data-num already there, and stamps each new block with
data-num="N" plus its anchor line (bottom of page = 1 counting up, so a
post prepended at the head takes max+1; slugs per scripts/number-twitter-history.py).
Override the archive looked at with --archive <path>.
"""

import argparse
import fileinput
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'scripts'))
from number_twitter_history import ANCHOR_RE, anchor_line, make_slug  # noqa: E402


def esc(text: str) -> str:
    """HTML-escape, using &apos; not &#x27;."""
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    text = text.replace('"', '&quot;')
    text = text.replace("'", '&apos;')
    return text


URL_RE = re.compile(r'^[ ]*\*\s+(https://x\.com/ljupc0/status/(\d+))\s*$')
AUTHOR_RE = re.compile(r'^[ ]*(.+@\S+)\s*$')
TS_RE = re.compile(
    r'\d{1,2}:\d{2}\s*(?:AM|PM)\s*·\s*[A-Z][a-z]+\s+\d{1,2},\s+\d{4}'
)


def max_post_num(archive: Path) -> int:
    """Highest data-num already in the archive (0 if none/file missing)."""
    try:
        text = archive.read_text(encoding='utf-8')
    except OSError as e:
        print(f'Warning: cannot read archive {archive} ({e}); '
              f'numbering starts at 1', file=sys.stderr)
        return 0
    nums = [int(n) for n in re.findall(r'data-num="(\d+)"', text)]
    return max(nums, default=0)


def parse_blocks(lines: list[str]) -> list[dict]:
    blocks = []
    i, n = 0, len(lines)

    while i < n:
        if not lines[i].strip():
            i += 1
            continue

        m = URL_RE.match(lines[i])
        if not m:
            i += 1
            continue

        url = m.group(1)
        tid = m.group(2)
        i += 1

        # author line
        while i < n and not lines[i].strip():
            i += 1
        author = ''
        if i < n and AUTHOR_RE.match(lines[i]):
            author = lines[i].strip()
            i += 1

        # blank line before body
        while i < n and not lines[i].strip():
            i += 1

        # body lines until next block
        body = []
        while i < n:
            if not lines[i].strip():
                j = i + 1
                while j < n and not lines[j].strip():
                    j += 1
                if j < n and URL_RE.match(lines[j]):
                    break
                body.append('')
                i += 1
                continue
            if URL_RE.match(lines[i]):
                break
            body.append(lines[i].rstrip())
            i += 1

        # pull timestamp from tail
        ts = ''
        while body:
            s = body[-1].strip()
            if TS_RE.search(s):
                ts = s
                body.pop()
                break
            if not s:
                body.pop()
            else:
                break

        # trim leading/trailing blanks
        while body and not body[-1].strip():
            body.pop()
        while body and not body[0].strip():
            body.pop(0)

        blocks.append({'id': tid, 'url': url, 'author': author,
                       'body': body, 'ts': ts})

    return blocks


def format_block(b: dict, num: int) -> str:
    """Produce one <div class="tweet"> block matching the manual vim output,
    plus the hard-coded post number and anchor (see the comment at the top
    of twitter-history.html)."""
    lines_out = [f'<div class="tweet" id="{b["id"]}" data-num="{num}">']
    lines_out.append(f'<a href="{b["url"]}">{b["url"]}</a>')
    if b['author']:
        lines_out.append(esc(b['author']))
    for bl in b['body']:
        if bl.strip():
            # Turn in-tweet http(s) URLs into hyperlinks, matching the manual
            # vim step: s%\<http[s]://[^\s)\]},<]\+%<a href="&">&</a>%
            # (basics only, as documented in the twitter-history.html comment;
            # scheme-less x.com/... URLs and trailing-punctuation caveats stay).
            bl = re.sub(r'http[s]://[^\s)\]},<]+',
                        lambda m: f'<a href="{m.group(0)}">{m.group(0)}</a>',
                        esc(bl.strip()))
            lines_out.append(bl)
        else:
            # Blank body lines are dropped: the manual procedure deletes the
            # resulting standalone '<br>' lines (g/^<br>$/d).
            pass
    if b['ts']:
        lines_out.append(esc(b['ts']))
    # body/<br> lines as rendered so far feed the slug (it stops at the
    # timestamp, so only lines preceding it are scanned)
    slug = make_slug(lines_out[1:])
    # post-number anchor goes right after the opening div line, so a shared
    # #N link lands on the post's first line
    lines_out.insert(1, anchor_line(num, slug))
    lines_out.append('</div>')

    # Add <br> to every content line inside the tweet (matching the vim
    # step that does :'a,'bs/$/<br>/); the div, the anchor line and </div>
    # stay bare, identical to what scripts/number_twitter_history.py emits.
    result = []
    for line in lines_out:
        if line.startswith('<div') or line == '</div>' or ANCHOR_RE.match(line):
            result.append(line)
        else:
            result.append(line + '<br>')

    return '\n'.join(result)


def main():
    parser = argparse.ArgumentParser(
        description='Convert bookmarklet capture files to numbered archive blocks.')
    parser.add_argument('inputs', nargs='*',
                        help='capture file(s), newest-first within each file')
    parser.add_argument('--archive', type=Path, default=None,
                        help='twitter-history.html to read the max post number from '
                             '(default: twitter-history.html next to this script)')
    args = parser.parse_args()

    if not args.inputs:
        parser.print_usage(sys.stderr)
        sys.exit(1)

    archive = args.archive or (Path(__file__).resolve().parent / 'twitter-history.html')
    expanded = []
    for arg in args.inputs:
        p = Path(arg).expanduser()
        if p.exists():
            expanded.append(str(p))
        else:
            print(f'Warning: not found: {arg}', file=sys.stderr)

    if not expanded:
        print('No input files found.', file=sys.stderr)
        sys.exit(1)

    all_lines = []
    for line in fileinput.input(files=expanded):
        all_lines.append(line.rstrip('\n'))

    blocks = parse_blocks(all_lines)
    if not blocks:
        print('No tweet blocks found.', file=sys.stderr)
        sys.exit(1)

    max_num = max_post_num(archive)
    # capture order is newest-first; numbering counts up the page, so the
    # first block (topmost after the prepend) takes the highest number
    for i, b in enumerate(blocks):
        num = max_num + len(blocks) - i
        print(format_block(b, num))
        print()
    print(f'# {len(blocks)} block(s), post numbers '
          f'{max_num + 1}..{max_num + len(blocks)} (archive max was {max_num})',
          file=sys.stderr)


if __name__ == '__main__':
    main()

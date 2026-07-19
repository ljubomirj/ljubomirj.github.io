#!/usr/bin/env python3
"""
Convert twitter-LJ-posts-archive-block (N).txt files into the HTML format
used in twitter-history.html, matching the manual vim procedure documented
in the HTML comment.

Usage:
  python3 twitter-blocks-to-html.py ~/Downloads/twitter-LJ-posts-archive-block*.txt

Output: HTML <div class="tweet"> blocks to stdout.  Pipe to pbcopy, then
paste into twitter-history.html after the first <div class="tweet">.
"""

import fileinput
import re
import sys
from pathlib import Path


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


def format_block(b: dict) -> str:
    """Produce one <div class="tweet"> block matching the manual vim output."""
    lines_out = [f'<div class="tweet" id="{b["id"]}">']
    lines_out.append(f'<a href="{b["url"]}">{b["url"]}</a>')
    if b['author']:
        lines_out.append(esc(b['author']))
    for bl in b['body']:
        if bl.strip():
            lines_out.append(esc(bl.strip()))
        else:
            lines_out.append('')
    if b['ts']:
        lines_out.append(esc(b['ts']))
    lines_out.append('</div>')

    # Add <br> to every content line inside the tweet (matching the vim
    # step that does :'a,'bs/$/<br>/)
    result = []
    for line in lines_out:
        if line.startswith('<div') or line == '</div>':
            result.append(line)
        else:
            result.append(line + '<br>')

    return '\n'.join(result)


def main():
    files = sys.argv[1:] if len(sys.argv) > 1 else []
    if not files:
        print("Usage: python3 twitter-blocks-to-html.py <input.txt> [...]", file=sys.stderr)
        sys.exit(1)

    expanded = []
    for arg in files:
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

    for b in blocks:
        print(format_block(b))
        print()


if __name__ == '__main__':
    main()

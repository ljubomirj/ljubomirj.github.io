#!/usr/bin/env python3
import re
import sys
import time
import html
from urllib.parse import quote_plus
from urllib.request import Request, urlopen
import ssl

IN_FILE = "youtube-tasters.txt"
OUT_FILE = "youtube-tasters.html"

YT_ID_RE = re.compile(r"(?:YT-)([A-Za-z0-9_-]{11})(?:-|_-_)\d{8}\.mp4$", re.IGNORECASE)
YT_ID_SIMPLE_RE = re.compile(r"(?:YT-)([A-Za-z0-9_-]{11})\.mp4$", re.IGNORECASE)
WATCH_ID_RE = re.compile(r"watch\?v=([A-Za-z0-9_-]{11})")
JSON_ID_RE = re.compile(r'"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"')

def is_extract_name(name: str) -> bool:
    base = name.rsplit('/', 1)[-1]
    base = re.sub(r"\.[A-Za-z0-9]+$", "", base)
    # All lowercase and only snake/hyphen/digits considered an extract
    return base == base.lower() and re.fullmatch(r"[a-z0-9._\-]+", base) is not None

def build_query(name: str) -> str:
    # strip extension and date-like suffixes
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", name)
    # remove trailing date tokens like -YYYYMMDD
    stem = re.sub(r"[-_](19|20)\d{6}$", "", stem)
    # replace underscores and hyphens with spaces, collapse spaces
    q = re.sub(r"[_\-]+", " ", stem)
    q = re.sub(r"\s+", " ", q).strip()
    return q

def yt_search_first_id(query: str, ua: str) -> str | None:
    url = f"https://www.youtube.com/results?search_query={quote_plus(query)}"
    req = Request(url, headers={"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"})
    ctx = ssl.create_default_context()
    try:
        # Some environments lack system certs; fall back to unverified context.
        with urlopen(req, timeout=15, context=ctx) as resp:
            html_text = resp.read().decode("utf-8", errors="ignore")
    except Exception:
        unverified = ssl._create_unverified_context()
        with urlopen(req, timeout=15, context=unverified) as resp:
            html_text = resp.read().decode("utf-8", errors="ignore")
    # find first unique id from ytInitialData JSON if available
    seen = set()
    for m in JSON_ID_RE.finditer(html_text):
        vid = m.group(1)
        if vid not in seen:
            seen.add(vid)
            return vid
    # fallback: scan hrefs
    for m in WATCH_ID_RE.finditer(html_text):
        vid = m.group(1)
        if vid not in seen:
            seen.add(vid)
            return vid
    return None

def parse_line(line: str):
    m = re.match(r"^(.{12})\s+(.*)$", line)
    if m:
        return m.group(1), m.group(2)
    return "", line

def main():
    try:
        lines = [l.rstrip("\n") for l in open(IN_FILE, "r", encoding="utf-8")]
    except FileNotFoundError:
        print(f"Source not found: {IN_FILE}", file=sys.stderr)
        sys.exit(1)

    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    resolved = 0
    total = 0

    out = ["<ol>"]
    for raw in lines:
        date, name = parse_line(raw)
        name = name.strip()
        url = None
        total += 1

        m = YT_ID_RE.search(name) or YT_ID_SIMPLE_RE.search(name)
        if m:
            url = f"https://www.youtube.com/watch?v={m.group(1)}"
        else:
            # Skip obvious extracts (short lowercase snake-case, mp3s, etc.)
            if not name.lower().endswith(".mp4") or name.lower().endswith(".mp3") or is_extract_name(name):
                url = None
            else:
                query = build_query(name)
                try:
                    vid = yt_search_first_id(query, ua)
                    if vid:
                        url = f"https://www.youtube.com/watch?v={vid}"
                        resolved += 1
                    # polite delay to avoid hammering
                    time.sleep(0.8)
                except Exception:
                    url = None

        esc_date = html.escape(date)
        esc_name = html.escape(name)
        if url and date:
            out.append(f"<li>{esc_date} <a href=\"{url}\">{esc_name}</a></li>")
        elif url:
            out.append(f"<li><a href=\"{url}\">{html.escape(raw)}</a></li>")
        else:
            out.append(f"<li>{html.escape(raw)}</li>")

    out.append("</ol>")
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")

    print(f"Resolved {resolved} new URLs out of {total} entries.")

if __name__ == "__main__":
    main()

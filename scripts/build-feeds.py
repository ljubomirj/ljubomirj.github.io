#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from datetime import datetime, timezone
from email.utils import format_datetime
from html import escape
from pathlib import Path


INCLUDE_EXTS = {".html", ".pdf"}
EXCLUDE_FILES = {"feed.xml", "rss.xml", "index.html", "sidebar.html"}


def extract_title(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None
    match = re.search(r"<title>(.*?)</title>", text, re.IGNORECASE | re.DOTALL)
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(1)).strip()


def build_feeds(base_url: str, root: Path) -> int:
    site_title = None
    home = root / "post-ljubomirj.html"
    if home.exists():
        site_title = extract_title(home)
    if not site_title:
        site_title = "Site Feed"

    items = []
    for path in root.iterdir():
        if not path.is_file():
            continue
        if path.name in EXCLUDE_FILES:
            continue
        if path.suffix.lower() not in INCLUDE_EXTS:
            continue

        mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        title = None
        if path.suffix.lower() == ".html":
            title = extract_title(path)
        if not title:
            title = path.stem.replace("_", " ").replace("-", " ").strip()

        items.append(
            {
                "path": path.name,
                "title": title,
                "mtime": mtime,
                "is_pdf": path.suffix.lower() == ".pdf",
            }
        )

    items.sort(key=lambda x: x["mtime"], reverse=True)
    if not items:
        raise SystemExit("No .html or .pdf files found to index.")

    updated = max(i["mtime"] for i in items)

    rss_items = []
    for item in items:
        link = base_url + item["path"]
        desc = "PDF file" if item["is_pdf"] else "HTML page"
        rss_items.append(
            "".join(
                [
                    "    <item>\n",
                    f"      <title>{escape(item['title'])}</title>\n",
                    f"      <link>{escape(link)}</link>\n",
                    f"      <guid>{escape(link)}</guid>\n",
                    f"      <pubDate>{format_datetime(item['mtime'])}</pubDate>\n",
                    f"      <description>{escape(desc)}</description>\n",
                    "    </item>\n",
                ]
            )
        )

    rss = "".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>\n',
            '<rss version="2.0">\n',
            "  <channel>\n",
            f"    <title>{escape(site_title)}</title>\n",
            f"    <link>{escape(base_url)}</link>\n",
            "    <description>Site feed</description>\n",
            "    <language>en-us</language>\n",
            f"    <lastBuildDate>{format_datetime(updated)}</lastBuildDate>\n",
            "\n",
            *rss_items,
            "  </channel>\n",
            "</rss>\n",
        ]
    )

    atom_entries = []
    for item in items:
        link = base_url + item["path"]
        summary = "PDF file" if item["is_pdf"] else "HTML page"
        atom_entries.append(
            "".join(
                [
                    "  <entry>\n",
                    f"    <title>{escape(item['title'])}</title>\n",
                    f"    <link href=\"{escape(link)}\"/>\n",
                    f"    <id>{escape(link)}</id>\n",
                    f"    <updated>{item['mtime'].strftime('%Y-%m-%dT%H:%M:%SZ')}</updated>\n",
                    f"    <summary>{escape(summary)}</summary>\n",
                    "  </entry>\n",
                ]
            )
        )

    atom = "".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>\n',
            '<feed xmlns="http://www.w3.org/2005/Atom">\n',
            f"  <title>{escape(site_title)}</title>\n",
            f"  <link href=\"{escape(base_url)}\"/>\n",
            f"  <link href=\"{escape(base_url)}feed.xml\" rel=\"self\"/>\n",
            f"  <id>{escape(base_url)}</id>\n",
            f"  <updated>{updated.strftime('%Y-%m-%dT%H:%M:%SZ')}</updated>\n",
            "\n",
            *atom_entries,
            "</feed>\n",
        ]
    )

    (root / "rss.xml").write_text(rss, encoding="utf-8")
    (root / "feed.xml").write_text(atom, encoding="utf-8")
    return len(items)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build RSS and Atom feeds.")
    parser.add_argument(
        "--base-url",
        default="https://ljubomirj.github.io/",
        help="Base URL for links, must end with '/'.",
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Directory to scan for .html/.pdf files.",
    )
    args = parser.parse_args()

    base_url = args.base_url
    if not base_url.endswith("/"):
        base_url += "/"

    count = build_feeds(base_url, Path(args.root))
    print(f"Wrote rss.xml and feed.xml with {count} entries.")


if __name__ == "__main__":
    main()

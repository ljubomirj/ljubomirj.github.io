#!/usr/bin/env node
// Build search-index.json + search-texts.json for the client-side site search
// widget (see scripts.js).
//
// Chunks every public page: twitter-history.html becomes one chunk per
// <div class="tweet" id="..."> (anchor = tweet id, so results deep-link to the
// tweet); other pages are chunked per heading section, grouped into ~1200-char
// chunks. Lexical index is a prebuilt MiniSearch BM25 index (search-index.json
// "ms" field) so the browser never tokenizes the corpus. Full chunk texts live
// in search-texts.json, loaded lazily by the widget only for regex search and
// in-page locating; snippets travel in search-index.json "docs".
//
// Usage: node scripts/build-search-index.js   (or: make search)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'search-index.json');
const TEXTS_OUTPUT = path.join(ROOT, 'search-texts.json');
const VENDOR_SRC = path.join(ROOT, 'node_modules', 'minisearch', 'dist', 'umd', 'index.js');
const VENDOR_DST = path.join(ROOT, 'search', 'minisearch.js');

// Not public content: redirect stub, empty template, chat UIs, samples.
const EXCLUDED = new Set([
    'index.html',
    'post-EMPTY.html',
    'post-chat-LJ.html',
    'post-chat-LJ-v2.html',
    'twitter-history-sample.html',
    'twitter-history-sample2.html',
    'sidebar.html',
]);

const MAX_CHUNK_CHARS = 1200;
const MAX_TEXT_CHARS = 2500;

const MiniSearch = require('minisearch'); // v7: module IS the class (no named export)

function decodeEntities(s) {
    return s
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

function stripHtml(html) {
    return decodeEntities(
        html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function pageTitle(html) {
    const m = html.match(/<title>([\s\S]*?)<\/title>/i);
    return m ? decodeEntities(m[1]).trim() : '';
}

function chunkPage(file, html) {
    const chunks = [];
    if (file === 'twitter-history.html') {
        // One chunk per tweet div; the div id is the anchor.
        const re = /<div class="tweet" id="(\d+)">([\s\S]*?)\n<\/div>/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            let text = stripHtml(m[2]);
            if (!text) continue;
            // Drop the status URL + author line repeated on every tweet:
            // pure index bloat (id/page are stored separately anyway).
            text = text
                .replace(new RegExp('https://x\\.com/ljupc0/status/' + m[1] + '\\s*\\n?'), '')
                .replace(/Ljubomir Josifovski @ljupc0\s*\n?/, '')
                .trim();
            const tsm = text.match(/\d{1,2}:\d{2} (?:AM|PM) · [A-Za-z]+ \d{1,2}, \d{4}/);
            chunks.push({
                anchor: m[1],
                title: tsm ? 'X post · ' + tsm[0] : 'X post',
                date: tsm ? tsm[0] : '',
                text,
            });
        }
        return chunks;
    }

    // Generic page: sections at headings, paragraphs grouped into chunks.
    const title = pageTitle(html);
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    // Walk blocks: headings (capture id if present) and paragraphs.
    const blockRe = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>|<p[^>]*>([\s\S]*?)<\/p>|<li[^>]*>([\s\S]*?)<\/li>|<td[^>]*>([\s\S]*?)<\/td>/gi;
    let current = { heading: title, anchor: null, parts: [] };
    const flush = () => {
        const text = current.parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        if (text) {
            // Oversized single chunks (tables, logbooks) are split on sentence-ish
            // boundaries so no chunk dwarfs the rest of the index.
            for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) {
                let end = Math.min(i + MAX_CHUNK_CHARS, text.length);
                if (end < text.length) {
                    const cut = text.lastIndexOf('. ', end);
                    if (cut > i + MAX_CHUNK_CHARS * 0.5) end = cut + 1;
                }
                chunks.push({
                    anchor: i === 0 ? current.anchor : null,
                    title: current.heading,
                    date: '',
                    text: text.slice(i, end),
                });
            }
        }
        current.parts = [];
    };
    let m;
    while ((m = blockRe.exec(body)) !== null) {
        if (m[1] !== undefined) {
            flush();
            const id = (m[2].match(/id="([^"]+)"/) || [])[1] || null;
            current = { heading: stripHtml(m[3]) || title, anchor: id, parts: [] };
        } else {
            const piece = stripHtml(m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : m[6]));
            if (piece) current.parts.push(piece);
            if (current.parts.join('\n').length > MAX_CHUNK_CHARS) flush();
        }
    }
    flush();
    return chunks;
}

function build() {
    const files = fs.readdirSync(ROOT)
        .filter(f => f.endsWith('.html') && !EXCLUDED.has(f))
        .sort();
    const docs = [];
    const texts = [];
    let docId = 0;
    for (const file of files) {
        const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const pt = pageTitle(html) || file;
        for (const c of chunkPage(file, html)) {
            const full = c.text.slice(0, MAX_TEXT_CHARS);
            docs.push({
                id: docId++,
                page: file,
                page_title: pt,
                anchor: c.anchor || '',
                title: c.title,
                date: c.date,
                snippet: full.slice(0, 180),
            });
            texts.push(full);
        }
        console.log(`  ${file}: ${docs.length} docs so far`);
    }

    const miniSearch = new MiniSearch({
        idField: 'id',
        fields: ['title', 'text'],
        storeFields: ['page', 'page_title', 'anchor', 'title'],
        searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3 } },
    });
    miniSearch.addAll(docs.map((d, i) => ({ ...d, text: texts[i] })));

    const payload = {
        generatedAt: new Date().toISOString(),
        pages: files.length,
        count: docs.length,
        docs,
        ms: miniSearch.toJSON(),
    };
    fs.writeFileSync(OUTPUT, JSON.stringify(payload));
    fs.writeFileSync(TEXTS_OUTPUT, JSON.stringify(texts));

    fs.mkdirSync(path.dirname(VENDOR_DST), { recursive: true });
    fs.copyFileSync(VENDOR_SRC, VENDOR_DST);

    const mb = s => (fs.statSync(s).size / 1e6).toFixed(1);
    console.log(`Wrote ${OUTPUT}: ${docs.length} chunks from ${files.length} pages (${mb(OUTPUT)} MB)`);
    console.log(`Wrote ${TEXTS_OUTPUT} (${mb(TEXTS_OUTPUT)} MB); vendored MiniSearch UMD -> ${VENDOR_DST}`);
}

try {
    build();
} catch (err) {
    console.error('Failed to build search index:', err);
    process.exit(1);
}

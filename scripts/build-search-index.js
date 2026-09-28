#!/usr/bin/env node
// Build search-index.json + search-texts.json for the client-side site search
// widget (see scripts.js).
//
// Chunks every public page: twitter-history.html is an archive of social posts
// (<div class="tweet"> for X/Twitter and Bluesky, <div class="substack"> for
// Substack), one chunk per post, split at line/paragraph boundaries only when a
// post exceeds MAX_TEXT_CHARS; anchor = div id, else the in-post <a id="N">, else
// data-num, so every chunk deep-links. Other pages are chunked per heading
// section, grouped into ~1200-char chunks. Lexical index is a prebuilt MiniSearch BM25 index (search-index.json
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

// Social archive blocks: X/Twitter and Bluesky posts are <div class="tweet">
// (identity is the status id on newer blocks, only data-num + an <a id="N">
// post anchor on older/imported ones and on Bluesky), Substack posts are
// <div class="substack">. Comments hold vim procedure notes with example block
// markup, so they are stripped before scanning.
const SOCIAL_BLOCK_RE = /<div class="(tweet|substack)"([^>]*)>/g;

function socialAnchor(attrs, inner) {
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (id) return id;
    const inBlock = (inner.match(/<a id="([^"]+)"/) || [])[1];
    if (inBlock) return inBlock;
    return (attrs.match(/\bdata-num="([^"]+)"/) || [])[1] || '';
}

function socialPlatform(kind, inner) {
    const host = (inner.match(/href="https?:\/\/([^\/"]+)/) || [])[1] || '';
    if (/bsky\.app/.test(host)) return 'Bsky';
    if (/substack\.com/.test(host) || kind === 'substack') return 'Substack';
    return 'X';
}

// Split an oversized post on its own natural boundaries (blank line, then line
// break, then sentence end) so long-form posts are not cut mid-sentence and no
// content is dropped.
function splitLongText(text, cap) {
    const parts = [];
    let rest = text;
    while (rest.length > cap) {
        const window = rest.slice(0, cap);
        const cuts = [];
        for (const sep of ['\n\n', '\n', '. ']) {
            const at = window.lastIndexOf(sep);
            if (at >= 0) cuts.push({ at: at + sep.length, soft: sep !== '. ' });
        }
        const para = cuts.filter(c => c.at > cap * 0.6).sort((a, b) => b.at - a.at)[0];
        const best = cuts.filter(c => c.at > cap * 0.5).sort((a, b) => b.at - a.at)[0];
        const cut = (para || best || { at: cap }).at;
        parts.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts.filter(Boolean);
}

function chunkSocialArchive(html) {
    // Comments and <style>/<script> bodies hold procedure notes and CSS that
    // quote example block markup; they are not posts.
    const source = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');
    const chunks = [];
    const blocks = [];
    SOCIAL_BLOCK_RE.lastIndex = 0;
    let m;
    while ((m = SOCIAL_BLOCK_RE.exec(source)) !== null) {
        blocks.push({ kind: m[1], attrs: m[2], start: m.index, from: m.index + m[0].length });
    }
    blocks.forEach((block, i) => {
        const nextStart = i + 1 < blocks.length ? blocks[i + 1].start : source.length;
        let end = source.indexOf('\n</div>', block.from);
        if (end === -1 || end > nextStart) end = nextStart;
        const inner = source.slice(block.from, end);
        let text = stripHtml(inner);
        if (block.kind === 'tweet') {
            // Drop the status URL + author line repeated on every post: pure
            // index bloat (identity/page are stored separately anyway).
            text = text
                .replace(/https:\/\/(?:www\.)?(?:x|twitter)\.com\/ljupc0\/status\/\d+\s*\n?/, '')
                .replace(/Ljubomir Josifovski @ljupc0\s*\n?/, '')
                .replace(/Ljubomir Josifovski @ljupco\.bsky\.social\s*\n?/, '')
                .trim();
        }
        if (!text) return;
        const anchor = socialAnchor(block.attrs, inner);
        const platform = socialPlatform(block.kind, inner);
        const tsm =
            text.match(/\d{1,2}:\d{2} (?:AM|PM) · [A-Za-z]+ \d{1,2}, \d{4}/) ||
            text.match(/\d{1,2} [A-Z][a-z]+ \d{4}/) ||
            text.match(/[A-Z][a-z]{2} \d{1,2}, \d{4}/);
        for (const part of splitLongText(text, MAX_TEXT_CHARS)) {
            chunks.push({
                anchor,
                title: `${platform} post${tsm ? ' · ' + tsm[0].trim() : ''}`,
                date: tsm ? tsm[0].trim() : '',
                text: part,
            });
        }
    });
    return chunks;
}

function chunkPage(file, html) {
    const chunks = [];
    if (file === 'twitter-history.html') return chunkSocialArchive(html);

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

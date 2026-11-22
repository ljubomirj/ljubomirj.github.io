#!/usr/bin/env node
// Build the agent-facing entry points for ljubomirj.github.io:
//
//   llms.txt        the curated index from https://llmstxt.org/ (H1, blockquote,
//                   prose, then H2 "file lists" of [name](url): notes)
//   llms-full.txt   every page in full, except the huge social archive
//   <page>.html.md  a markdown twin of each page, at the same URL + ".md", which
//                   is what the spec wants the llms.txt links to point at
//
// Usage:
//   node scripts/build-llms-txt.js           write the files
//   node scripts/build-llms-txt.js --links   also (re)inject the discovery <link>s
//                                            into each page's <head>
//   node scripts/build-llms-txt.js --check   exit 1 if anything on disk is stale
//
// The manifest below is the curation: section order, one-line descriptions, and
// whether a page belongs in llms-full.txt. A page on disk that is missing from
// the manifest still gets a twin and lands in "Optional" with an auto-summary,
// so new content is never invisible to an agent.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://ljubomirj.github.io';

// section: display order is the order of first appearance below.
const MANIFEST = [
    { file: 'post-ljubomirj.html', section: 'About', full: true,
      desc: 'Who I am: machine learning / AI now, systematic trading and research before that, speech recognition before that, plus online coordinates (LinkedIn, GitHub, Hugging Face, X).' },

    { file: 'post-knowing.html', section: 'Essays', full: true,
      desc: 'What I mean when I say I know something: knowledge as the probability distribution over a quantity, and why that reading is a blessing and a curse.' },
    { file: 'post-consciousness.html', section: 'Essays', full: true,
      desc: 'A working definition of consciousness, written as a question-and-answer with myself.' },
    { file: 'post-why-write.html', section: 'Essays', full: true,
      desc: 'Why write in public when you could write in private.' },
    { file: 'post-social-networks.html', section: 'Essays', full: true,
      desc: 'How I read and post on social networks, and what makes an account worth following.' },
    { file: 'post-twitter.html', section: 'Essays', full: true,
      desc: 'Personal practices and tips for surviving X/Twitter as a reader rather than a performer.' },
    { file: 'post-data-debugging.html', section: 'Essays', full: true,
      desc: 'Debugging data rather than code: checking the inputs before trusting the model.' },
    { file: 'post-ml-llm-dev.html', section: 'Essays', full: true,
      desc: 'Notes and links on ML/LLM development: coding agents, inference, tooling and local models.' },
    { file: 'post-my-HOME.html', section: 'Essays', full: true,
      desc: 'How my computer $HOME is organised, and why the important things live in visible named directories.' },
    { file: 'post-links-to.html', section: 'Essays', full: true,
      desc: 'Blogs, Substacks, YouTube channels, podcasts and magazines I keep coming back to.' },
    { file: 'taste-is-all-you-need-always-has-been.html', section: 'Essays', full: true,
      desc: 'A short argument that taste, not capability, is the scarce input in developer-facing work.' },
    { file: 'post-deepwiki.html', section: 'Essays', full: true,
      desc: 'A DeepWiki crawl of this repository, and what it produced.' },

    { file: 'arxiv-tasters.html', section: 'Curated lists', full: false,
      title: 'arXiv papers I read',
      desc: 'arXiv papers I read, newest first, each with its abstract link.' },
    { file: 'youtube-tasters.html', section: 'Curated lists', full: false,
      title: 'YouTube talks',
      desc: 'Talks and videos worth the time: Hinton, Karpathy, Aaronson, Veritasium and others.' },
    { file: 'twitter-tasters.html', section: 'Curated lists', full: false,
      title: 'X posts worth keeping',
      desc: 'X posts I found notable enough to keep, with their links.' },
    { file: 'llamacpp-logbook.html', section: 'Curated lists', full: false,
      title: 'llama.cpp logbook',
      desc: 'My llama.cpp build-and-run logbook: model downloads, build recipes and benchmark commands.' },
    { file: 'bashrc-ml-setup.html', section: 'Curated lists', full: false,
      title: 'ML shell setup',
      desc: 'The shell setup I use for ML work: conda, compilers, environment handling.' },
    { file: 'post-picmem.html', section: 'Curated lists', full: false,
      desc: 'Memes and random pictures worth replicating, in no particular order.' },

    { file: 'twitter-history.html', section: 'Social archive', full: false,
      desc: 'The full archive: every X post since 2021 plus the Substack and Bluesky archives, roughly ten thousand posts. Large - prefer the search endpoints below over fetching it whole.' },

    { file: 'post-chat-LJ.html', section: 'Interactive', full: false,
      desc: 'A chat page that answers as a virtual LJ, grounded in this site.' },
    { file: 'post-chat-LJ-v2.html', section: 'Interactive', full: false,
      desc: 'Second iteration of the virtual-LJ chat page.' },

    { file: 'a-person-of-good-taste-spoke.html', section: 'Optional', full: false,
      title: 'A person of good taste spoke',
      desc: 'A single quoted post about taste, kept for reference.' },
    { file: 'twitter-history-sample.html', section: 'Optional', full: false,
      desc: 'A small slice of the social archive, used for testing.' },
    { file: 'twitter-history-sample2.html', section: 'Optional', full: false,
      desc: 'A small slice of the social archive with link previews, used for testing.' },
];

// Internal fragments and stubs: reachable, but noise in an agent's index.
const EXCLUDE = new Set(['index.html', 'sidebar.html', 'post-EMPTY.html']);

const SECTION_ORDER = ['About', 'Essays', 'Curated lists', 'Social archive', 'Interactive', 'Machine-readable', 'Optional'];

const SITE_TITLE = "Ljubomir Josifovski's site";
const SUMMARY = 'Notes and essays by Ljubomir Josifovski on machine learning, LLM inference, ' +
    'probability and knowledge, plus curated reading/watching lists and a complete X/Twitter archive. ' +
    'Every page here has a markdown twin at the same URL with `.md` appended.';

const PROSE = `The site is a flat collection of hand-written HTML pages served by GitHub Pages; there is no
framework and no server-side rendering. Pages marked in the lists below link to their markdown twin,
which is the cleaner form for reading or quoting.

Two search paths exist over the text of the whole site, and they are usually a better starting point
than fetching pages one by one:

- Lexical (BM25) search runs entirely in the browser over \`search-index.json\`, built by
  \`scripts/build-search-index.js\`. The index covers every page except a small excluded set.
- Meaning ("semantic") search posts to \`/api/semantic\` with \`{ query, mode, page }\` and returns
  ranked passages with the sentence that answers the query. \`mode\` is \`"bm25"\` (fast, ranks a
  shortlist) or \`"exhaustive"\` (slow, scores the whole page, rate limited).

Both are driven by the two footer widgets on each page. A page that is absent from the index still
renders the widgets but returns no hits; that is deliberate, not a bug.`;

function extract(pageFile) {
    const html = fs.readFileSync(path.join(ROOT, pageFile), 'utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const title = (doc.title || '').trim();
    doc.querySelectorAll('script, style, noscript, nav, .lj-footer-row').forEach(el => el.remove());

    const lines = [];
    const BLOCK = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'body',
        'ul', 'ol', 'table', 'pre', 'blockquote', 'p', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

    // Text of an element with its inline children, <br> as a line break. This is
    // what carries the archive: 10k posts live in leaf <div>s separated by <br>,
    // with no <p> anywhere.
    function inlineText(el) {
        let out = '';
        for (const node of el.childNodes) {
            if (node.nodeType === 3) out += node.textContent;
            else if (node.nodeType === 1) {
                const t = node.tagName.toLowerCase();
                if (t === 'script' || t === 'style' || t === 'noscript') continue;
                if (t === 'br') { out += '\n'; continue; }
                out += inlineText(node);
            }
        }
        return out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
    }

    const hasBlockChild = el => [...el.children].some(c => BLOCK.has(c.tagName.toLowerCase()));

    function walk(el) {
        for (const child of el.children) {
            const tag = child.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;

            if (/^h[1-6]$/.test(tag)) {
                const t = inlineText(child);
                if (t) lines.push('', '#'.repeat(Math.min(6, Number(tag[1]) + 1)) + ' ' + t, '');
            } else if (tag === 'pre') {
                const t = child.textContent.replace(/\s+$/, '');
                if (t.trim()) lines.push('```', t, '```', '');
            } else if (tag === 'ul' || tag === 'ol') {
                let i = 1;
                for (const li of child.children) {
                    if (li.tagName.toLowerCase() !== 'li') continue;
                    const t = inlineText(li);
                    if (t) lines.push((tag === 'ol' ? `${i++}. ` : '- ') + t.replace(/\n/g, ' '));
                }
                lines.push('');
            } else if (tag === 'table') {
                for (const row of child.querySelectorAll('tr')) {
                    const cells = [...row.children].map(c => inlineText(c).replace(/\|/g, '\\|'));
                    if (cells.some(c => c)) lines.push('| ' + cells.join(' | ') + ' |');
                }
                lines.push('');
            } else if (tag === 'blockquote') {
                const t = inlineText(child);
                if (t) lines.push(t.split('\n').map(s => '> ' + s).join('\n'), '');
            } else if (tag === 'hr') {
                lines.push('---', '');
            } else if (hasBlockChild(child)) {
                walk(child);
            } else {
                const t = inlineText(child);
                if (t) lines.push(t, '');
            }
        }
    }

    walk(doc.body || doc.documentElement);

    const md = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return { title, md };
}

function twin(pageFile) {
    const { title, md } = extract(pageFile);
    const heading = title || pageFile.replace(/\.html$/, '');
    // The page's own <h1> becomes an H2 here and would just repeat the title line
    // (pages often extend it, e.g. "Knowing - what do I mean when I say ...").
    let body = md;
    const firstHeading = body.split('\n').find(l => /^#{1,6} /.test(l));
    const firstText = firstHeading ? firstHeading.replace(/^#{1,6}\s*/, '').trim().toLowerCase() : '';
    if (firstText && firstText.startsWith(heading.toLowerCase())) {
        body = body.replace(firstHeading + '\n', '').replace(/^\n+/, '');
    }
    return `# ${heading}\n\nSource: ${SITE}/${pageFile}\n\n${body}\n`;
}

function buildLlmsTxt(entries) {
    const bySection = new Map();
    for (const e of entries) {
        if (!bySection.has(e.section)) bySection.set(e.section, []);
        bySection.get(e.section).push(e);
    }
    const out = [`# ${SITE_TITLE}`, '', `> ${SUMMARY}`, '', PROSE, ''];

    for (const section of SECTION_ORDER) {
        if (section === 'Machine-readable') {
            out.push('## Machine-readable', '');
            out.push(`- [llms-full.txt](${SITE}/llms-full.txt): every page above in full text, except the large social archive`);
            out.push(`- [search-index.json](${SITE}/search-index.json): the BM25 index the in-page search loads (chunks of every indexed page)`);
            out.push(`- [RSS feed](${SITE}/rss.xml): new posts, RSS 2.0`);
            out.push(`- [Atom feed](${SITE}/feed.xml): the same posts, Atom`);
            out.push(`- [Meaning-search endpoint](${SITE}/api/semantic): POST-only, \`{ query, mode, page }\`, returns ranked passages. Costs money per call; the site's own widget is the intended client.`);
            out.push('');
            continue;
        }
        const list = bySection.get(section);
        if (!list || !list.length) continue;
        out.push(`## ${section}`, '');
        for (const e of list) {
            out.push(`- [${e.title || e.file}](${SITE}/${e.file}.md): ${e.desc}`);
        }
        out.push('');
    }

    return out.join('\n');
}

function buildFull(entries) {
    const parts = [
        `# ${SITE_TITLE} - full text`,
        '',
        `> Every page of ${SITE} in full, except the large social archive (see ${SITE}/twitter-history.html.md).`,
        '',
    ];
    for (const e of entries) {
        if (!e.full) continue;
        parts.push(`\n---\n\n# ${e.title || e.file}\n\nSource: ${SITE}/${e.file}\n`, e.md, '');
    }
    return parts.join('\n').replace(/\n{3,}/g, '\n\n');
}

// The spec's discovery mechanism: rel="describedby" points at the llms.txt that
// covers the page, rel="alternate" type="text/markdown" at the page's twin.
function injectDiscoveryLinks(entries) {
    const byFile = new Map(entries.map(e => [e.file, e]));
    let touched = 0;
    for (const file of fs.readdirSync(ROOT)) {
        if (!file.endsWith('.html') || EXCLUDE.has(file)) continue;
        const target = path.join(ROOT, file);
        const html = fs.readFileSync(target, 'utf8');
        if (!html.includes('<head')) continue;
        if (html.includes('rel="describedby"')) continue;
        const e = byFile.get(file);
        const block = [
            `    <link rel="describedby" href="/llms.txt">`,
            ...(e ? [`    <link rel="alternate" type="text/markdown" href="/${file}.md">`] : []),
        ].join('\n');
        const updated = html.replace(/<\/head>/i, `${block}\n</head>`);
        if (updated !== html) { fs.writeFileSync(target, updated); touched++; }
    }
    return touched;
}

function main() {
    const check = process.argv.includes('--check');
    const links = process.argv.includes('--links');
    const onDisk = new Set(fs.readdirSync(ROOT).filter(f => f.endsWith('.html')));
    const known = new Set(MANIFEST.map(m => m.file));

    // Pages on disk but not curated: keep them reachable rather than invisible.
    for (const file of [...onDisk].sort()) {
        if (known.has(file) || EXCLUDE.has(file)) continue;
        const { title, md } = extract(file);
        MANIFEST.push({
            file, section: 'Optional', full: false,
            title: title || file.replace(/\.html$/, ''),
            desc: (md.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').slice(0, 160),
            md,
        });
    }

    const entries = [];
    for (const m of MANIFEST) {
        if (!onDisk.has(m.file)) { console.warn(`skip (missing): ${m.file}`); continue; }
        const ex = m.md ? { title: m.title, md: m.md } : extract(m.file);
        entries.push({ ...m, title: m.title || ex.title || m.file, md: ex.md });
    }

    const outputs = new Map();
    for (const e of entries) outputs.set(`${e.file}.md`, twin(e.file));
    outputs.set('llms.txt', buildLlmsTxt(entries));
    outputs.set('llms-full.txt', buildFull(entries));

    let stale = 0;

    // Twins for pages that no longer belong (excluded, or deleted) are removed so
    // the site never carries stale markdown.
    for (const f of fs.readdirSync(ROOT)) {
        if (!f.endsWith('.html.md') || outputs.has(f)) continue;
        if (check) { console.error(`orphan: ${f}`); stale++; continue; }
        fs.unlinkSync(path.join(ROOT, f));
        console.log(`removed orphan ${f}`);
    }

    for (const [name, content] of outputs) {
        const target = path.join(ROOT, name);
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        const same = current === content;
        if (check) {
            if (!same) { console.error(`stale: ${name}`); stale++; }
        } else if (!same) {
            fs.writeFileSync(target, content);
            console.log(`wrote ${name} (${content.length} bytes)`);
        }
    }
    if (check) {
        console.log(stale ? `${stale} file(s) stale - run node scripts/build-llms-txt.js` : 'llms.txt is up to date');
        process.exit(stale ? 1 : 0);
    }
    if (links) {
        const touched = injectDiscoveryLinks(entries);
        console.log(`discovery links: ${touched} page(s) updated`);
    }
    console.log(`done: ${outputs.size} files, ${entries.length} pages`);
}

main();

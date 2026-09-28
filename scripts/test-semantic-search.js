#!/usr/bin/env node
// CLI harness for the Jev meaning search (the same core the browser endpoint
// uses: api/_jev-search.js). Prints the ranking next to BM25's, with the token,
// cost and latency numbers.
//
// Usage:
//   node scripts/test-semantic-search.js "query" [options]
//     --mode=bm25        shortlist -> rank (default, ~2 requests)
//     --mode=exhaustive  every chunk on the page (~80 requests, ~$0.08)
//     --mode=needle      one noul per passage (needle's shape, comparison)
//     --k=40             shortlist size (bm25/needle modes)
//     --tokens=24000     estimated Jev tokens per request window
//     --pool=3           candidates kept per window for the pooled re-rank
//     --concurrency=6
//     --top=10           hits to print
//     --json             raw result JSON
//
// Key: TYPESAFE_API_KEY (env or ~/.config/typesafe.env); never printed.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { search, loadCorpus, bm25Ranking } = require('../api/_jev-search');

function getKey() {
    if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY.trim();
    try {
        const m = fs.readFileSync(path.join(os.homedir(), '.config', 'typesafe.env'), 'utf8').match(/TYPESAFE_API_KEY=(\S+)/);
        if (m) return m[1];
    } catch { /* no key file */ }
    return '';
}

function parseArgs(argv) {
    const opts = { query: '', mode: 'bm25', k: 40, tokens: 24000, pool: 3, top: 10, concurrency: 6, json: false };
    for (const arg of argv) {
        const m = arg.match(/^--([a-z]+)(?:=(.*))?$/);
        if (!m) { opts.query = opts.query ? opts.query + ' ' + arg : arg; continue; }
        const [, name, value] = m;
        if (name === 'json') opts.json = true;
        else if (name in opts) opts[name] = /^\d+(\.\d+)?$/.test(value) ? Number(value) : value;
    }
    return opts;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.query) {
        console.error('Usage: node scripts/test-semantic-search.js "query" [--mode=bm25|exhaustive|needle]');
        process.exit(2);
    }
    const key = getKey();
    if (!key) { console.error('No TYPESAFE_API_KEY (env or ~/.config/typesafe.env).'); process.exit(2); }
    const rootDir = path.join(__dirname, '..');

    const { ranked, diag } = await search({
        rootDir,
        page: 'twitter-history.html',
        query: opts.query,
        mode: opts.mode,
        k: opts.k,
        tokenBudget: opts.tokens,
        pool: opts.pool,
        concurrency: opts.concurrency,
        key,
    });

    if (opts.json) { console.log(JSON.stringify({ diag, ranked }, null, 1)); return; }

    const { index, texts, docs } = loadCorpus(rootDir, 'twitter-history.html');
    const byId = new Map(docs.map(d => [d.id, d]));
    const bm25 = bm25Ranking(index, docs, opts.query);

    console.log(`query: ${opts.query}`);
    console.log(`mode=${diag.mode} candidates=${diag.candidates} windows=${diag.windows} requests=${diag.requests} model=${diag.model}`);
    console.log(`tokens in=${diag.inputTokens} cost=$${diag.costUsd} wall=${diag.wallMs}ms exists=${diag.exists === null ? '-' : diag.exists.toFixed(2)} confidence=${diag.confidence === null ? '-' : diag.confidence.toFixed(2)}`);
    if (diag.windowDiag) console.log(`per-request: ${diag.windowDiag.map(w => `${w.ms}ms/${w.tokens}t`).join(' ')}`);
    console.log('');
    for (const r of ranked.slice(0, opts.top)) {
        console.log(`  ${r.probability.toFixed(3)} | bm25#${String(r.bm25Rank ?? '-').padStart(5)} | ${r.title.replace(' post', '')} | #${r.anchor || '-'}`);
        console.log(`        ${r.focus ? 'FOCUS: ' + r.focus.text.replace(/\s+/g, ' ').slice(0, 110) : (r.snippet || '').replace(/\s+/g, ' ').slice(0, 110)}`);
    }
    if (bm25.length) {
        console.log('');
        console.log('BM25 top 3');
        for (const [id, rank] of bm25.slice(0, 3).map((id, i) => [id, i + 1])) {
            const doc = byId.get(id);
            console.log(`  #${rank} | ${doc.title.replace(' post', '')} | #${doc.anchor || '-'} | ${(doc.snippet || '').replace(/\s+/g, ' ').slice(0, 95)}`);
        }
    }
}

main().catch(err => { console.error('Failed:', err.message); process.exit(1); });

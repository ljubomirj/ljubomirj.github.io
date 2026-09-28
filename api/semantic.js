// Meaning search for the site search widget (twitter-history.html), backed by
// Jev (TypeSafe System One) — see api/_jev-search.js for the design and the
// measured cost/latency numbers.
//
// POST { query, mode?: "bm25"|"exhaustive", k? }  ->
//   200 { ranked, diag } | 4xx/5xx { error }
//
// The TypeSafe key stays server-side (TYPESAFE_API_KEY). bm25 mode is ~2
// requests / ~$0.001 per search; exhaustive mode re-reads the whole page
// (~83 requests, ~$0.08), so it is capped per IP per day to stop a stranger
// burning the credit balance.

const path = require('path');
const { search, PRICE_PER_M } = require('./_jev-search');

const allowedOrigins = [
    'https://ljubomirj.github.io',
    'https://ljubomirj-github-io.vercel.app',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
];

const EXHAUSTIVE_PER_DAY = 40; // per IP, best-effort (per instance, resets on cold start)
const hits = new Map();

function allowExhaustive(ip) {
    const day = new Date().toISOString().slice(0, 10);
    const entry = hits.get(ip);
    if (!entry || entry.day !== day) { hits.set(ip, { day, count: 1 }); return true; }
    if (entry.count >= EXHAUSTIVE_PER_DAY) return false;
    entry.count += 1;
    return true;
}

module.exports = async (req, res) => {
    const origin = req.headers.origin;
    const originAllowed = !origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (originAllowed && origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') return res.status(originAllowed ? 204 : 403).end();
    if (!originAllowed) return res.status(403).json({ error: 'Origin not allowed.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

    const key = (process.env.TYPESAFE_API_KEY || '').trim();
    if (!key) return res.status(503).json({ error: 'Meaning search needs a TYPESAFE_API_KEY on the server.' });

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) return res.status(400).json({ error: 'Enter something you want to find.' });
    if (query.length > 400) return res.status(400).json({ error: 'Keep your search under 400 characters.' });
    const mode = body.mode === 'exhaustive' ? 'exhaustive' : 'bm25';
    const k = Math.min(Math.max(Number(body.k) || 40, 5), 160);

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (mode === 'exhaustive' && !allowExhaustive(ip)) {
        return res.status(429).json({ error: 'Whole-page search is rate limited on this address. Try again tomorrow or use the fast mode.' });
    }

    try {
        const started = Date.now();
        const result = await search({
            rootDir: path.join(__dirname, '..'),
            page: 'twitter-history.html',
            query,
            mode,
            k,
            key,
            baseUrl: process.env.TYPESAFE_BASE_URL,
            model: process.env.TYPESAFE_MODEL,
        });
        console.log(`semantic ${mode} "${query}" -> ${result.ranked.length} ranked, ${result.diag.requests} requests, ${result.diag.inputTokens} tokens, $${result.diag.costUsd}, ${result.diag.wallMs}ms`);
        return res.status(200).json({
            model: result.diag.model,
            mode,
            ranked: result.ranked.slice(0, 25),
            diag: result.diag,
            pricePerMTokens: PRICE_PER_M,
        });
    } catch (error) {
        console.error('semantic search failed:', error.message);
        const status = error.status === 429 ? 429 : 502;
        return res.status(status).json({ error: 'Meaning search failed: ' + error.message.slice(0, 200) });
    }
};

function safeParse(text) {
    try { return JSON.parse(text); } catch { return {}; }
}

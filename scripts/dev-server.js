#!/usr/bin/env node
// Local dev server for the site: static files from the repo root plus the
// Vercel-style API handlers under api/, so the footer search widgets (BM25 and
// the Jev meaning search) can be exercised locally exactly as deployed.
//
//   node scripts/dev-server.js [--port=8001]
//
// Needs TYPESAFE_API_KEY for /api/semantic (env or ~/.config/typesafe.env).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const portArg = process.argv.find(a => a.startsWith('--port='));
const PORT = Number(portArg ? portArg.split('=')[1] : (process.env.PORT || 8001));

if (!process.env.TYPESAFE_API_KEY) {
    try {
        const m = fs.readFileSync(path.join(os.homedir(), '.config', 'typesafe.env'), 'utf8').match(/TYPESAFE_API_KEY=(\S+)/);
        if (m) process.env.TYPESAFE_API_KEY = m[1];
    } catch { /* no key file */ }
}

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf',
};

// Minimal Vercel-req/res shim: the handlers use res.status().json()/.end() and
// read req.body for POSTs.
function makeRes(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
        return res;
    };
    return res;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
        const name = url.pathname.slice('/api/'.length).replace(/[^a-z0-9_-]/gi, '');
        const file = path.join(ROOT, 'api', name + '.js');
        if (!fs.existsSync(file)) return makeRes(res).status(404).json({ error: 'No such endpoint: ' + url.pathname });
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        req.body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : {};
        try {
            await require(file)(req, makeRes(res));
        } catch (error) {
            console.error(error);
            if (!res.writableEnded) makeRes(res).status(500).json({ error: error.message });
        }
        return;
    }

    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404;
        return res.end('Not found: ' + rel);
    }
    const stat = fs.statSync(file);
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`dev server: http://localhost:${PORT}/  (semantic key: ${process.env.TYPESAFE_API_KEY ? 'loaded' : 'MISSING'})`);
});

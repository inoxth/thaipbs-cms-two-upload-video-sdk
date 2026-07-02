// Tiny dev proxy for the ByteArk upload demo.
//
// Why: the demo page runs at http://localhost:8899 but wants to call the STAGING Thai PBS Video CMS API.
// A browser can't do that directly — staging's CORS rejects this origin + the custom auth header.
// So the browser calls THIS proxy same-origin (no CORS), and the proxy forwards to staging
// server-to-server (CORS doesn't apply between servers), passing the x-api-server-secret header.
//
// Run:  node examples/proxy.mjs
// Then open http://localhost:8899/byteark-upload-demo.html and pick "Staging (via local proxy)".
//
// ponytail: minimal single-file proxy — no deps. Only handles what this demo needs.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = Number(process.env.PORT) || 8899;
const STAGING = (process.env.STAGING_BASE || 'https://console-program-new.thaipbsbeta.com').replace(/\/$/, '');
const HERE = dirname(fileURLToPath(import.meta.url));

// Permissive CORS so the browser page (any localhost origin) can call this proxy.
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,x-api-server-secret',
};

const server = http.createServer(async (req, res) => {
  // CORS preflight — answer it here so the browser never blocks the real request.
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  // /api/* → forward to staging, keeping method, body, and the auth header.
  if (req.url.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    try {
      const upstream = await fetch(STAGING + req.url, {
        method: req.method,
        headers: {
          ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
          ...(req.headers['x-api-server-secret'] ? { 'x-api-server-secret': req.headers['x-api-server-secret'] } : {}),
        },
        body,
      });
      const text = await upstream.text();
      console.log(`${req.method} ${req.url} → ${upstream.status}`);
      res.writeHead(upstream.status, { ...cors, 'content-type': upstream.headers.get('content-type') || 'application/json' });
      return res.end(text);
    } catch (e) {
      res.writeHead(502, { ...cors, 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'proxy failed', message: String(e) }));
    }
  }

  // Otherwise serve a static file (index.html, styles.css, app.js, api.js).
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const ext = path.slice(path.lastIndexOf('.'));
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
  try {
    const file = await readFile(join(HERE, path));
    res.writeHead(200, { 'content-type': MIME[ext] || 'text/plain' });
    res.end(file);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`demo + proxy on http://localhost:${PORT}  →  staging ${STAGING}`));

// Serves a build for the art-loading timings (scripts/art-loading.cjs): static files, SPA
// fallback to index.html, /api/* answers 404.
//   node scripts/art-loading-serve.cjs <dir> <port>
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2]);
const port = Number(process.argv[3]);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
http
  .createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u.startsWith('/api/')) return res.writeHead(404).end('{}');
    let f = path.join(dir, u);
    if (!f.startsWith(dir)) return res.writeHead(403).end();
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(port, '127.0.0.1');

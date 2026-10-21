import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
};

/** Tiny static file server rooted at the project directory (only web/, build/ and node_modules/ are exposed). */
export function startServer(port = 0) {
  const allowed = ['web', 'build', 'node_modules'];
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/web/index.html';
      const abs = path.normalize(path.join(ROOT, rel));
      const top = path.relative(ROOT, abs).split(path.sep)[0];
      if (!abs.startsWith(ROOT) || !allowed.includes(top)) { res.writeHead(403).end('forbidden'); return; }
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

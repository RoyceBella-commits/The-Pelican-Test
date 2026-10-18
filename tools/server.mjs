// Static dev server for the project root.
// - no-store caching so edits are always picked up
// - serves p5.brush's GLSL sources (*.vert / *.frag) as ES modules, so the
//   unbundled library source can be imported directly by the browser
// Usage: node tools/server.mjs [port]      (port 0 = pick a free one)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.map': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
};

export function startServer(port = 0, root = ROOT) {
  const server = http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root) || path.basename(file).startsWith('._')) {
      res.writeHead(404).end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const headers = { 'Cache-Control': 'no-store' };
      if (ext === '.vert' || ext === '.frag' || ext === '.glsl') {
        const src = fs.readFileSync(file, 'utf8');
        headers['Content-Type'] = MIME['.js'];
        res.writeHead(200, headers).end('export default ' + JSON.stringify(src) + ';\n');
        return;
      }
      headers['Content-Type'] = MIME[ext] || 'application/octet-stream';
      // Range support so <video> can seek in the preview page.
      const range = req.headers.range;
      if (range && /^bytes=\d*-\d*$/.test(range)) {
        let [a, b] = range.slice(6).split('-');
        const start = a ? +a : 0;
        const end = b ? Math.min(+b, st.size - 1) : st.size - 1;
        headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        headers['Accept-Ranges'] = 'bytes';
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      headers['Content-Length'] = st.size;
      headers['Accept-Ranges'] = 'bytes';
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({ server, port: p, url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] ?? 5180);
  startServer(port).then(({ url }) => console.log(`serving ${ROOT}\n  ${url}/`));
}

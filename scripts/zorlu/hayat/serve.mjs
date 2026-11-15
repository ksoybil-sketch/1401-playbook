// Firebase Hosting benzeri statik sunucu: dosya yoksa index.html (200). /__deploy?dir=... ile kök değişir.
import http from 'http'; import { gzipSync } from 'zlib'; import { readFile, stat } from 'fs/promises'; import { join, extname } from 'path';
let root = process.argv[2]; const PORT = +process.argv[3] || 5180;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__deploy') { root = u.searchParams.get('dir'); res.end('ok ' + root); return; }
  let p = join(root, decodeURIComponent(u.pathname));
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); } catch { p = join(root, 'index.html'); }
  try {
    const body = await readFile(p);
    const h = { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' };
    if (u.pathname.startsWith('/assets/') && !p.endsWith('index.html')) h['Cache-Control'] = 'public, max-age=31536000, immutable'; else h['Cache-Control'] = 'no-cache';
    let out = body;
    if (/gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|svg|css/.test(h['Content-Type'])) { out = gzipSync(body); h['Content-Encoding'] = 'gzip'; }
    res.writeHead(200, h); res.end(out);
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT, () => console.log('serve', PORT, root));

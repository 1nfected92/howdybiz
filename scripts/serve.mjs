import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(process.env.HOWDY_SERVE_ROOT || '.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/howdybiz\//, '/');
  const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root + '/')) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(file).catch(()=>readFile(resolve(root,'public',path.slice(1)))); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => console.log('HowdyBiz: http://localhost:4173/howdybiz/'));

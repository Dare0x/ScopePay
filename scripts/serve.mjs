// Static preview server for dist/. Set SCOPEPAY_CONFIG_DIR to serve contract.json and
// registry.json from another folder (the local test chain writes one to tools/local).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const configDir = process.env.SCOPEPAY_CONFIG_DIR && path.resolve(process.env.SCOPEPAY_CONFIG_DIR);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const name = pathname === '/' ? 'index.html' : pathname.slice(1);
  let file = path.join(root, name);
  if (configDir && ['contract.json', 'registry.json'].includes(name)) file = path.join(configDir, name);
  const allowed = file.startsWith(root) || (configDir && file.startsWith(configDir));
  if (!allowed || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, {'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
});
const port = Number(process.env.PORT ?? 4173);
server.listen(port, () => console.log(`ScopePay preview: http://localhost:${port}${configDir ? ` (config from ${configDir})` : ''}`));

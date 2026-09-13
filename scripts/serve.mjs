import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, {'Content-Type':types[path.extname(file)] ?? 'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(file).pipe(res);
});
server.listen(Number(process.env.PORT ?? 4173), () => console.log(`ScopePay preview: http://localhost:${process.env.PORT ?? 4173}`));

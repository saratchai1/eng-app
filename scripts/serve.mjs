import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portArg >= 0 && process.argv[portArg + 1]) || 5173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.woff2':'font/woff2'};
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    let name = decodeURIComponent(url.pathname);
    if (name === '/') name = '/index.html';
    const file = path.resolve(root, '.' + name);
    const relative = path.relative(root,file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(p => p.startsWith('.')) || !['src','public','index.html'].includes(relative.split(path.sep)[0])) {
      res.writeHead(403);res.end('Forbidden');return;
    }
    if (!(await stat(file)).isFile()) throw new Error('not file');
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(await readFile(file));
  } catch { res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}); res.end('ไม่พบไฟล์'); }
});
server.listen(port,'0.0.0.0',()=>console.log(`ENG APP is ready at http://localhost:${port}`));

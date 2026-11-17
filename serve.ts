// serve.ts — a small static server for local testing (Node 22, stdlib
// only). Serves this repository's app/ on http://localhost:8080 so the
// frontend can be opened in a desktop browser against the live
// make.fun API:
//   node serve.ts            (port 8080)
//   node serve.ts --port 9000
// A development convenience, not a production server: it only reads
// files under app/, refuses anything outside it, and sends no-store
// so a changed file is never hidden behind a stale cache while
// testing. It also answers gzip when the client asks, so the
// first-load size can be measured honestly.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGzip } from 'node:zlib';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('./app', import.meta.url)));

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--port');
const wanted = flagIndex === -1 ? 8080 : Number(args[flagIndex + 1]);
const port = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const GZIPPABLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);

function safePath(rawPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(appRoot, normalize(pathname)));
  if (file !== appRoot && !file.startsWith(appRoot + sep)) return null;
  return file;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const file = safePath(url.pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('not a file');
    size = info.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  const ext = extname(file).toLowerCase();
  const headers = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  };
  const acceptsGzip = (request.headers['accept-encoding'] || '').includes('gzip');
  if (GZIPPABLE.has(ext) && acceptsGzip) {
    headers['content-encoding'] = 'gzip';
    response.writeHead(200, headers);
    createReadStream(file).pipe(createGzip({ level: 9 })).pipe(response);
    return;
  }
  headers['content-length'] = size;
  response.writeHead(200, headers);
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Lumen v2 app/ is on http://localhost:${port}`);
});

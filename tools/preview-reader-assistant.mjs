import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../prototypes/reading-assistant');
const args = process.argv.slice(2);
const port =
  args.length === 0 ? 4178 : args.length === 2 && args[0] === '--port' ? Number(args[1]) : NaN;
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Usage: node tools/preview-reader-assistant.mjs [--port 4178]');
}
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const type = contentTypes[extname(file)];
    if (!file.startsWith(root + sep) || !type) {
      response.writeHead(404).end();
      return;
    }
    const data = await readFile(file);
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch {
    response.writeHead(404).end();
  }
});
server.on('error', (error) => {
  process.stderr.write(`Reader prototype: ${error.message}\n`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Neo reader prototype: http://127.0.0.1:${port}/\n`);
});

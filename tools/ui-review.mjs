import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--port')) {
  throw new Error('Usage: node tools/ui-review.mjs [--port PORT]');
}
const port = args.length ? Number(args[1]) : 6217;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const example = resolve(root, 'assets/ui-review/examples');
const result = await build({
  entryPoints: [resolve(example, 'app.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'transform',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const files = new Map([
  ['/', ['text/html; charset=utf-8', await readFile(resolve(example, 'index.html'))]],
  ['/app.js', ['text/javascript; charset=utf-8', result.outputFiles[0].contents]],
  ['/style.css', ['text/css; charset=utf-8', await readFile(resolve(example, 'style.css'))]],
]);
const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const file = files.get(path);
  if (request.method !== 'GET' || !file) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': file[0], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(file[1]);
});
server.listen(port, '127.0.0.1', () => console.log(`UI review ready: http://127.0.0.1:${port}/`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

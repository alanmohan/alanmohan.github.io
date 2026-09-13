#!/usr/bin/env node
/**
 * Minimal static file server for local play.
 *
 * Uses only the Node standard library, so it needs no `npm install`. The game
 * itself needs no server to be *built*, but browsers refuse to load ES modules
 * over `file://` for security reasons, so any static server will do. This is
 * simply the one with the fewest prerequisites.
 *
 * Usage:
 *   node tools/serve.mjs [--port 8080] [--host 127.0.0.1]
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `.js` must be served as a JavaScript type or browsers reject the module.
 * This is the one header that genuinely matters here.
 */
const MIME_TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  })
);

function parseArgs(argv) {
  const options = { port: 8080, host: '127.0.0.1' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--port' || arg === '-p') && argv[i + 1]) {
      options.port = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--host' && argv[i + 1]) {
      options.host = argv[i + 1];
      i += 1;
    }
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    console.error(`Invalid port: ${options.port}`);
    process.exit(1);
  }
  return options;
}

/**
 * Resolves a request path to a file inside the project, refusing anything that
 * escapes the project root.
 * @returns {string|null}
 */
function resolveRequestPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';
  const candidate = resolve(join(ROOT, normalize(pathname)));

  // Path traversal guard: the result must stay inside the project root.
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;
  return candidate;
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers
  });
  response.end(body);
}

const { port, host } = parseArgs(process.argv.slice(2));

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    send(response, 400, 'Bad request');
    return;
  }

  try {
    let target = filePath;
    let info = await stat(target);
    if (info.isDirectory()) {
      target = join(target, 'index.html');
      info = await stat(target);
    }

    response.writeHead(200, {
      'Content-Type': MIME_TYPES.get(extname(target).toLowerCase()) || 'application/octet-stream',
      'Content-Length': info.size,
      // Always revalidate, so edits show up on reload during development.
      'Cache-Control': 'no-cache'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(target).pipe(response);
  } catch {
    send(response, 404, 'Not found');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: node tools/serve.mjs --port ${port + 1}`);
  } else {
    console.error(error.message);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Lane Hopper is being served from ${ROOT}`);
  console.log(`  http://${host}:${port}/\n`);
  console.log('Press Ctrl+C to stop.');
});

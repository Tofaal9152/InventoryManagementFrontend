import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as proxyRequest } from 'node:http';
import { extname, normalize, relative, resolve } from 'node:path';

const rootDirectory = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function isSafeProjectPath(filePath) {
  const pathFromRoot = relative(rootDirectory, filePath);
  return pathFromRoot && !pathFromRoot.startsWith('..') && !pathFromRoot.includes('../');
}

function sendFile(response, filePath) {
  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
}

/**
 * In an externally served frontend the browser uses the same-origin `/api/`
 * base URL. Forward that prefix to Django in development so an ngrok tunnel to
 * this server exposes both the UI and the API.
 */
function proxyApiRequest(request, response, requestUrl) {
  const target = new URL(apiProxyTarget);
  const targetPath = `${target.pathname.replace(/\/$/, '')}${requestUrl.pathname.replace(/^\/api/, '')}${requestUrl.search}`;
  const upstream = proxyRequest(
    {
      hostname: target.hostname,
      port: target.port || 80,
      method: request.method,
      path: targetPath,
      headers: { ...request.headers, host: target.host }
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    }
  );

  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: 'The API server is unavailable.' }));
    }
  });
  request.pipe(upstream);
}

createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (apiProxyTarget && (pathname === '/api' || pathname.startsWith('/api/'))) {
    proxyApiRequest(request, response, requestUrl);
    return;
  }

  const candidatePath = normalize(resolve(rootDirectory, `.${pathname}`));

  if (isSafeProjectPath(candidatePath) && existsSync(candidatePath) && statSync(candidatePath).isFile()) {
    sendFile(response, candidatePath);
    return;
  }

  sendFile(response, resolve(rootDirectory, 'index.html'));
}).listen(port, () => {
  console.log(`Component Inventory is running at http://localhost:${port}`);
  if (apiProxyTarget) console.log(`API requests at /api/ proxy to ${apiProxyTarget}`);
});
// {
//   "name": "components-inventory-management",
//   "version": "0.1.0",
//   "private": true,
//   "type": "module",
//   "scripts": {
//     "dev": "node server.js",
//     "start": "node server.js",
//     "test": "node tests/demo-workflow.mjs"
//   }
// }

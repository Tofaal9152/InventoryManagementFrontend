import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, relative, resolve } from 'node:path';

const rootDirectory = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);

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

createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const candidatePath = normalize(resolve(rootDirectory, `.${pathname}`));

  if (isSafeProjectPath(candidatePath) && existsSync(candidatePath) && statSync(candidatePath).isFile()) {
    sendFile(response, candidatePath);
    return;
  }

  sendFile(response, resolve(rootDirectory, 'index.html'));
}).listen(port, () => {
  console.log(`Component Inventory is running at http://localhost:${port}`);
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

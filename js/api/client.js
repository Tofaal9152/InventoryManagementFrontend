import { APP_CONFIG } from '../config.js';

export class ApiRequestError extends Error {
  constructor(message, { status = 0, fields = {} } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.fields = fields;
  }
}

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  return document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length) || '';
}

export async function apiRequest(path, { method = 'GET', body, headers = {}, fetcher = fetch } = {}) {
  const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  const requestHeaders = new Headers({ Accept: 'application/json', ...headers });
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  if (unsafeMethod) {
    const csrfToken = readCookie('csrftoken');
    if (csrfToken) requestHeaders.set('X-CSRFToken', csrfToken);
  }

  let response;
  try {
    response = await fetcher(`${APP_CONFIG.apiBaseUrl}${path}`, {
      method,
      headers: requestHeaders,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiRequestError('Network error. Check the server connection and try again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const fields = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const message = fields.detail || fields.message || 'The request could not be completed.';
    throw new ApiRequestError(message, { status: response.status, fields });
  }
  return payload;
}

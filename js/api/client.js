import { APP_CONFIG } from '../config.js';
import { clearSession, getAccessToken, getRefreshToken, updateTokens } from './tokens.js';

const REFRESH_PATH = 'get-access-token/';
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export class ApiRequestError extends Error {
  constructor(message, { status = 0, fields = {}, sessionExpired = false } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.fields = fields;
    this.sessionExpired = sessionExpired;
  }

  get isNetworkError() {
    return this.status === 0;
  }

  get isPermissionError() {
    return this.status === 403;
  }

  get isValidationError() {
    return this.status === 400 || this.status === 422;
  }
}

export function buildUrl(path, params) {
  const base = APP_CONFIG.apiBaseUrl.endsWith('/') ? APP_CONFIG.apiBaseUrl : `${APP_CONFIG.apiBaseUrl}/`;
  const url = `${base}${String(path).replace(/^\/+/, '')}`;
  const query = buildQuery(params);
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
}

export function buildQuery(params) {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else search.append(key, value);
  });
  return search.toString();
}

function isFormData(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function flattenFieldErrors(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return Object.entries(payload).reduce((fields, [key, value]) => {
    if (Array.isArray(value)) fields[key] = value.filter((item) => typeof item === 'string').join(' ');
    else if (typeof value === 'string') fields[key] = value;
    return fields;
  }, {});
}

function errorMessageFrom(payload, status) {
  const fields = flattenFieldErrors(payload);
  const named = fields.detail || fields.message || fields.non_field_errors;
  if (named) return named;
  const firstField = Object.keys(fields).find((key) => fields[key]);
  if (firstField) return fields[firstField];
  if (status === 403) return 'Your role does not allow this action.';
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 404) return 'That record no longer exists.';
  if (status >= 500) return 'The server could not complete the request. Try again.';
  return 'The request could not be completed.';
}

async function readPayload(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function send(path, { method, body, headers, params, fetcher, withAuth }) {
  const requestHeaders = new Headers({ Accept: 'application/json', ...headers });
  const sendsJson = body !== undefined && !isFormData(body);
  if (sendsJson) requestHeaders.set('Content-Type', 'application/json');

  // ngrok's free tunnel shows an HTML warning page to browser XHR requests
  // unless this header is present. The frontend proxy keeps these calls
  // same-origin, so this does not require a CORS preflight.
  if (globalThis.location?.hostname?.endsWith('.ngrok-free.dev')) {
    requestHeaders.set('ngrok-skip-browser-warning', 'true');
  }

  if (withAuth) {
    const token = getAccessToken();
    if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  try {
    return await fetcher(buildUrl(path, params), {
      method,
      headers: requestHeaders,
      credentials: 'omit',
      body: body === undefined ? undefined : sendsJson ? JSON.stringify(body) : body
    });
  } catch {
    throw new ApiRequestError('Network error. Check that the server is running and try again.');
  }
}

async function refreshAccessToken(fetcher) {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  const response = await send(REFRESH_PATH, {
    method: 'POST',
    body: { refresh },
    headers: {},
    params: undefined,
    fetcher,
    withAuth: false
  });

  if (!response.ok) return false;
  const payload = await readPayload(response);
  if (!payload?.access) return false;
  updateTokens({ access: payload.access, refresh: payload.refresh });
  return true;
}

/**
 * One request against the backend.
 *
 * Adds the bearer token, refreshes it once on a 401 and retries, converts DRF's
 * `{field: [message]}` body into `ApiRequestError.fields`, and passes `FormData`
 * through untouched so uploads keep their multipart boundary.
 */
export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    params,
    fetcher = fetch,
    auth = true,
    raw = false
  } = options;

  const upperMethod = method.toUpperCase();
  const request = { method: upperMethod, body, headers, params, fetcher, withAuth: auth };

  let response = await send(path, request);

  const canRetry = response.status === 401 && auth && String(path).replace(/^\/+/, '') !== REFRESH_PATH;
  if (canRetry) {
    let refreshed = false;
    try {
      refreshed = await refreshAccessToken(fetcher);
    } catch {
      refreshed = false;
    }
    if (refreshed) response = await send(path, request);
    else {
      clearSession();
      throw new ApiRequestError('Your session has expired. Sign in again.', {
        status: 401,
        sessionExpired: true
      });
    }
  }

  if (!response.ok) {
    const payload = await readPayload(response);
    throw new ApiRequestError(errorMessageFrom(payload, response.status), {
      status: response.status,
      fields: flattenFieldErrors(payload),
      sessionExpired: response.status === 401
    });
  }

  if (raw) return response;
  if (!SAFE_METHODS.includes(upperMethod) && response.status === 204) return null;
  return readPayload(response);
}

/**
 * A paginated list endpoint, flattened to what the pages expect.
 * DRF returns `{count, next, previous, results}`; a plain array is passed through.
 */
export async function apiList(path, options = {}) {
  const payload = await apiRequest(path, options);
  if (Array.isArray(payload)) return { items: payload, total: payload.length, next: null, previous: null };
  if (!payload || typeof payload !== 'object') return { items: [], total: 0, next: null, previous: null };
  const items = Array.isArray(payload.results) ? payload.results : [];
  return {
    items,
    total: typeof payload.count === 'number' ? payload.count : items.length,
    next: payload.next || null,
    previous: payload.previous || null
  };
}

/** A binary response (exports, label sheets) as a Blob the caller can save. */
export async function apiBlob(path, options = {}) {
  const response = await apiRequest(path, { ...options, raw: true });
  return response.blob();
}

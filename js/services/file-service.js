import { APP_CONFIG } from '../config.js';
import { apiRequest, buildUrl } from '../api/client.js';
import { toNumber } from '../api/mappers/library.js';

/** Uploads, exports and the two-step import. All multipart or binary. */

export class FileTransferError extends Error {
  constructor(message, { fields = {} } = {}) {
    super(message);
    this.name = 'FileTransferError';
    this.fields = fields;
  }
}

function requireLiveMode() {
  if (APP_CONFIG.mode === 'demo') {
    throw new FileTransferError('File transfers are only available against the backend.');
  }
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

// The storage service is proxied, and `utils/views.py` passes its body through
// as `url` whenever it has no `url` key of its own. In practice that means
// `{"url": {"filename": ..., "stored_path": "https://…"}}`, so the URL has to be
// dug out rather than trusted to be a string.
const URL_KEYS = ['stored_path', 'url', 'file_url', 'secure_url', 'location', 'path', 'link'];

function extractUrl(value, depth = 0) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || depth > 2) return '';

  for (const key of URL_KEYS) {
    const found = extractUrl(value[key], depth + 1);
    if (found) return found;
  }
  return '';
}

/**
 * Sends a file to the backend's storage proxy and returns its hosted URL —
 * the string that `image_url` on a component stores. Nothing but a URL string
 * may come out of here: an object would end up serialised into the payload.
 */
export async function uploadFile(file) {
  requireLiveMode();
  if (!file) throw new FileTransferError('Choose a file to upload.');
  if (file.size > MAX_UPLOAD_BYTES) throw new FileTransferError('Files must be 20 MB or smaller.');

  const body = new FormData();
  body.append('file', file);

  const payload = await apiRequest('upload/', { method: 'POST', body });
  const url = extractUrl(payload?.url) || extractUrl(payload?.data) || extractUrl(payload);
  if (!url) throw new FileTransferError('The upload did not return a file URL.');
  return url;
}

export { extractUrl as extractUploadUrl };

/** Saves a response body to the user's machine. */
function saveBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(href), 10000);
}

function filenameFrom(response, fallback) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * Downloads an export or template. `format` is `xlsx` or `csv`; the backend
 * uses `?export=` because DRF reserves `?format=`.
 */
export async function downloadExport(path, { params = {}, format = 'xlsx', filename } = {}) {
  requireLiveMode();
  const response = await apiRequest(path, { params: { ...params, export: format }, raw: true });
  const blob = await response.blob();
  saveBlob(blob, filenameFrom(response, filename || `export.${format}`));
  return blob.size;
}

/** Opens the printable label sheet, which the backend returns as HTML. */
export function labelSheetUrl(params = {}) {
  return buildUrl('inventory/labels/', params);
}

function importForm(file, columnMapping) {
  const body = new FormData();
  body.append('file', file);
  if (columnMapping && Object.keys(columnMapping).length) {
    body.append('column_mapping', JSON.stringify(columnMapping));
  }
  return body;
}

function mapImportPreview(payload) {
  const summary = payload?.summary || {};
  return {
    headers: payload?.headers || [],
    columnMapping: payload?.column_mapping || {},
    toCreate: payload?.to_create || [],
    toUpdate: payload?.to_update || [],
    rejected: payload?.rejected || [],
    summary: {
      toCreate: toNumber(summary.to_create),
      toUpdate: toNumber(summary.to_update),
      rejected: toNumber(summary.rejected)
    }
  };
}

function checkImportFile(file) {
  if (!file) throw new FileTransferError('Choose a .xlsx or .csv file.');
  if (file.size > MAX_IMPORT_BYTES) throw new FileTransferError('Import files must be 10 MB or smaller.');
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new FileTransferError('Only .xlsx and .csv files can be imported.');
}

/** Validates the file and reports what would change. Saves nothing. */
export async function previewImport(kind, file, columnMapping) {
  requireLiveMode();
  checkImportFile(file);
  const payload = await apiRequest(`${kind}/import/preview/`, { method: 'POST', body: importForm(file, columnMapping) });
  return mapImportPreview(payload);
}

/** Applies every valid row in one transaction; rejected rows are skipped. */
export async function commitImport(kind, file, columnMapping) {
  requireLiveMode();
  checkImportFile(file);
  const payload = await apiRequest(`${kind}/import/commit/`, { method: 'POST', body: importForm(file, columnMapping) });
  return mapImportPreview(payload);
}

export async function downloadImportTemplate(kind, format = 'xlsx') {
  return downloadExport(`${kind}/import/template/`, { format, filename: `${kind}-import-template.${format}` });
}

import { APP_CONFIG } from '../config.js';
import { apiList, apiRequest } from '../api/client.js';
import { mapCategory, mapUnit } from '../api/mappers/library.js';

/**
 * Categories and units — the Library's reference data.
 * Read by any signed-in role; written by Admin and Manager.
 */

export class ReferenceValidationError extends Error {
  constructor(errors) {
    super('The record could not be saved.');
    this.name = 'ReferenceValidationError';
    this.errors = errors;
  }
}

const CATEGORY_FIELDS = Object.freeze({ name: 'name', description: 'description' });
const UNIT_FIELDS = Object.freeze({ name: 'name', symbol: 'symbol', allows_fraction: 'allowFraction' });

function toValidationError(error, fieldMap, fallbackField) {
  const errors = {};
  Object.entries(error.fields || {}).forEach(([apiName, message]) => {
    const field = fieldMap[apiName];
    if (field) errors[field] = message;
  });
  if (!Object.keys(errors).length) errors[fallbackField] = error.message;
  return new ReferenceValidationError(errors);
}

function requireLiveMode() {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('Editing reference data is only available against the backend.');
  }
}

async function write(path, { method, body, fieldMap, fallbackField }) {
  try {
    return await apiRequest(path, { method, body });
  } catch (error) {
    if (error?.name === 'ApiRequestError' && error.isValidationError) {
      throw toValidationError(error, fieldMap, fallbackField);
    }
    throw error;
  }
}

export async function listCategories() {
  requireLiveMode();
  const { items } = await apiList('library/categories/', { params: { page_size: 100 } });
  return items.map(mapCategory);
}

export async function saveCategory({ id, name, description = '' }) {
  requireLiveMode();
  const body = { name: String(name || '').trim(), description: String(description || '').trim() };
  if (!body.name) throw new ReferenceValidationError({ name: 'Category name is required.' });

  const dto = await write(id ? `library/categories/${encodeURIComponent(id)}/` : 'library/categories/', {
    method: id ? 'PATCH' : 'POST',
    body,
    fieldMap: CATEGORY_FIELDS,
    fallbackField: 'name'
  });
  return mapCategory(dto);
}

/** Blocked by the server while components still belong to it — use reassign first. */
export async function deleteCategory(categoryId) {
  requireLiveMode();
  return apiRequest(`library/categories/${encodeURIComponent(categoryId)}/`, { method: 'DELETE' });
}

/** Moves every component to another category, optionally deleting this one after. */
export async function reassignCategory({ categoryId, targetCategoryId, deleteAfter = false }) {
  requireLiveMode();
  if (!targetCategoryId) throw new ReferenceValidationError({ targetCategoryId: 'Choose the category to move components into.' });

  return write(`library/categories/${encodeURIComponent(categoryId)}/reassign/`, {
    method: 'POST',
    body: { target_category: targetCategoryId, delete_after: Boolean(deleteAfter) },
    fieldMap: { target_category: 'targetCategoryId' },
    fallbackField: 'targetCategoryId'
  });
}

export async function listUnits() {
  requireLiveMode();
  const { items } = await apiList('library/units/', { params: { page_size: 100 } });
  return items.map(mapUnit);
}

export async function saveUnit({ id, name, symbol, allowFraction = false }) {
  requireLiveMode();
  const errors = {};
  const body = {
    name: String(name || '').trim(),
    symbol: String(symbol || '').trim(),
    allows_fraction: Boolean(allowFraction)
  };
  if (!body.name) errors.name = 'Unit name is required.';
  if (!body.symbol) errors.symbol = 'Symbol is required.';
  if (Object.keys(errors).length) throw new ReferenceValidationError(errors);

  const dto = await write(id ? `library/units/${encodeURIComponent(id)}/` : 'library/units/', {
    method: id ? 'PATCH' : 'POST',
    body,
    fieldMap: UNIT_FIELDS,
    fallbackField: 'name'
  });
  return mapUnit(dto);
}

/** Blocked while components use it, and fractions cannot be turned off mid-use. */
export async function deleteUnit(unitId) {
  requireLiveMode();
  return apiRequest(`library/units/${encodeURIComponent(unitId)}/`, { method: 'DELETE' });
}

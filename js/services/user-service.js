import { APP_CONFIG } from '../config.js';
import { apiList, apiRequest } from '../api/client.js';
import { mapUser, roleCode } from '../api/mappers/administration.js';

/** User administration. Admin only — the server enforces it on every call. */

export class UserValidationError extends Error {
  constructor(errors) {
    super('The user could not be saved.');
    this.name = 'UserValidationError';
    this.errors = errors;
  }
}

const FIELD_BY_API_NAME = Object.freeze({
  email: 'email',
  role: 'role',
  first_name: 'firstName',
  last_name: 'lastName',
  password: 'password',
  username: 'email'
});

function requireLiveMode() {
  if (APP_CONFIG.mode === 'demo') {
    throw new Error('User administration is only available against the backend.');
  }
}

function toValidationError(error) {
  const errors = {};
  Object.entries(error.fields || {}).forEach(([apiName, message]) => {
    const field = FIELD_BY_API_NAME[apiName];
    if (field && !errors[field]) errors[field] = message;
  });
  if (!Object.keys(errors).length) errors.email = error.message;
  return new UserValidationError(errors);
}

export async function listUsers({ activeOnly = false } = {}) {
  requireLiveMode();
  const { items } = await apiList('administrator/users/', {
    params: { is_active: activeOnly ? 'true' : '', page_size: 100 }
  });
  return items.map(mapUser);
}

export async function saveUser({ id, email, role, firstName = '', lastName = '', password = '' }) {
  requireLiveMode();

  const errors = {};
  const trimmedEmail = String(email || '').trim();
  if (!trimmedEmail) errors.email = 'Email address is required.';
  if (!role) errors.role = 'Choose a role.';
  if (!id && !password) errors.password = 'Set a password for the new user.';
  if (Object.keys(errors).length) throw new UserValidationError(errors);

  const body = {
    email: trimmedEmail,
    role: roleCode(role),
    first_name: String(firstName || '').trim(),
    last_name: String(lastName || '').trim()
  };
  if (!id) body.password = password;

  try {
    const dto = id
      ? await apiRequest(`administrator/users/${encodeURIComponent(id)}/`, { method: 'PATCH', body })
      : await apiRequest('administrator/users/', { method: 'POST', body });
    return mapUser(dto?.data || dto);
  } catch (error) {
    if (error?.name === 'ApiRequestError' && error.isValidationError) throw toValidationError(error);
    throw error;
  }
}

/** Users are never deleted — deactivating keeps their movement history intact. */
export async function setUserActive(userId, active) {
  requireLiveMode();
  const action = active ? 'reactivate' : 'deactivate';
  const dto = await apiRequest(`administrator/users/${encodeURIComponent(userId)}/${action}/`, { method: 'POST' });
  return mapUser(dto?.data || dto);
}

export async function sendPasswordReset(userId) {
  requireLiveMode();
  return apiRequest(`administrator/users/${encodeURIComponent(userId)}/send-password-reset/`, { method: 'POST' });
}

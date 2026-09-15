import { ApiRequestError, apiRequest } from '../api/client.js';
import { mapSignIn, roleLabel } from '../api/mappers/auth.js';
import {
  clearSession,
  getCurrentUser,
  getRefreshToken,
  getRole,
  isSignedIn,
  setSession,
  subscribeToSession
} from '../api/tokens.js';

export class SignInError extends Error {
  constructor(message, { fields = {} } = {}) {
    super(message);
    this.name = 'SignInError';
    this.fields = fields;
  }
}

/**
 * Exchanges email + password for JWT credentials and stores the session.
 * Auth always talks to the real backend: demo mode only governs domain data.
 */
export async function signIn({ email, password }) {
  const trimmedEmail = String(email || '').trim();
  const fields = {};
  if (!trimmedEmail) fields.email = 'Enter your email address.';
  if (!password) fields.password = 'Enter your password.';
  if (Object.keys(fields).length) {
    throw new SignInError('Fill in both fields to sign in.', { fields });
  }

  let payload;
  try {
    payload = await apiRequest('rest-auth/login/', {
      method: 'POST',
      auth: false,
      body: { email: trimmedEmail, password }
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      throw new SignInError(error.message, { fields: error.fields });
    }
    throw error;
  }

  const session = mapSignIn(payload);
  if (!session.access) {
    throw new SignInError('The server did not return a session. Try again.');
  }

  setSession(session);
  return session;
}

/**
 * Blacklists the refresh token, then clears the local session.
 * The local session is cleared even when the request fails, so a user is never
 * left signed in on this device because the server was unreachable.
 */
export async function signOut() {
  const refresh = getRefreshToken();
  try {
    if (refresh) await apiRequest('rest-auth/logout/', { method: 'POST', body: { refresh } });
  } catch {
    /* the token expires on its own; clearing locally is what matters */
  } finally {
    clearSession();
  }
}

export function getSignedInUser() {
  return getCurrentUser();
}

export function getSignedInRole() {
  return getRole();
}

export function getSignedInRoleLabel() {
  return roleLabel(getRole());
}

export { isSignedIn, subscribeToSession };

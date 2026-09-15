const STORAGE_KEY = 'inventory.session';

const ROLES = Object.freeze({ ADMIN: 'ADMIN', MANAGER: 'MANAGER', STAFF: 'STAFF' });

const emptySession = Object.freeze({ access: '', refresh: '', role: '', user: null });

let memorySession = emptySession;
const listeners = new Set();

function readStorage() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value) {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function normalise(session) {
  if (!session || typeof session !== 'object') return emptySession;
  return Object.freeze({
    access: typeof session.access === 'string' ? session.access : '',
    refresh: typeof session.refresh === 'string' ? session.refresh : '',
    role: ROLES[session.role] || '',
    user: session.user && typeof session.user === 'object' ? session.user : null
  });
}

export function getSession() {
  const stored = readStorage();
  if (stored === null) return memorySession;
  try {
    return normalise(JSON.parse(stored));
  } catch {
    writeStorage(null);
    return emptySession;
  }
}

function publish(session) {
  listeners.forEach((listener) => {
    try {
      listener(session);
    } catch {
      /* a broken listener must not break the session write */
    }
  });
}

export function setSession(session) {
  const next = normalise(session);
  memorySession = next;
  writeStorage(JSON.stringify(next));
  publish(next);
  return next;
}

export function updateTokens({ access, refresh }) {
  const current = getSession();
  return setSession({
    ...current,
    access: access || current.access,
    refresh: refresh || current.refresh
  });
}

export function clearSession() {
  memorySession = emptySession;
  writeStorage(null);
  publish(emptySession);
  return emptySession;
}

export function subscribeToSession(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken() {
  return getSession().access;
}

export function getRefreshToken() {
  return getSession().refresh;
}

export function getRole() {
  return getSession().role;
}

export function getCurrentUser() {
  return getSession().user;
}

export function isSignedIn() {
  return Boolean(getSession().access);
}

export function hasRole(...roles) {
  const role = getRole();
  return Boolean(role) && roles.includes(role);
}

export function isAdmin() {
  return hasRole(ROLES.ADMIN);
}

export function canManage() {
  return hasRole(ROLES.ADMIN, ROLES.MANAGER);
}

export { ROLES };

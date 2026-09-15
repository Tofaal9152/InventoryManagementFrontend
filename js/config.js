const DEFAULT_MODE = 'live';

/**
 * 'live' calls the backend; 'demo' reads the seeded localStorage store, which
 * is how the UI can be worked on with no server running.
 *
 * Resolved once at load, in this order:
 *   1. `?mode=demo` in the URL — switches and remembers, for a quick look
 *   2. `localStorage['inventory.mode']` — what was chosen last
 *   3. `INVENTORY_MODE` in the environment — how the test suite pins demo mode
 */
function resolveMode() {
  try {
    const requested = new URLSearchParams(window.location.search).get('mode');
    if (requested === 'demo' || requested === 'live') {
      window.localStorage.setItem('inventory.mode', requested);
      return requested;
    }
    const stored = window.localStorage.getItem('inventory.mode');
    if (stored === 'demo' || stored === 'live') return stored;
  } catch {
    /* no window or storage: fall through to the environment or the default */
  }

  const fromEnvironment = globalThis.process?.env?.INVENTORY_MODE;
  return fromEnvironment === 'demo' || fromEnvironment === 'live' ? fromEnvironment : DEFAULT_MODE;
}

const LOCAL_API_URL = 'http://localhost:8000/';

/**
 * There is no build step here, so there is no `.env` — nothing can inject a
 * variable into the browser. The API base is resolved at load instead:
 *
 *   1. `localStorage['inventory.apiBaseUrl']` — per-machine override, set once
 *      from the console when pointing at a different backend
 *   2. localhost / 127.0.0.1 — the Django dev server on :8000
 *   3. anywhere else — same origin, so a deployment can proxy `/api` to Django
 *      without this file changing
 */
function resolveApiBaseUrl() {
  try {
    const stored = window.localStorage.getItem('inventory.apiBaseUrl');
    if (stored) return stored.endsWith('/') ? stored : `${stored}/`;
  } catch {
    /* no storage: fall through */
  }

  const hostname = globalThis.location?.hostname || '';
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return LOCAL_API_URL;
  return '/api/';
}

export const APP_CONFIG = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(),
  mode: resolveMode(),
  appName: 'Inventory Manager'
});

export const NAVIGATION = Object.freeze([
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/library', label: 'Library', icon: 'library' },
  { path: '/inventory', label: 'Drawer', icon: 'drawer' },
  { path: '/projects', label: 'Projects', icon: 'projects' },
  { path: '/requisitions', label: 'Requisitions', icon: 'requisitions' },
  { path: '/reports', label: 'Reports', icon: 'reports' },
  { path: '/settings/cabinets', label: 'Settings', icon: 'settings', adminOnly: true },
  { path: '/audit-log', label: 'Audit log', icon: 'audit-log', adminOnly: true }
]);

export const DEFAULT_ROUTE = '/dashboard';

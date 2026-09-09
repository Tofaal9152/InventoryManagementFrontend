export const APP_CONFIG = Object.freeze({
  apiBaseUrl: '/api',
  mode: 'demo',
  appName: 'Inventory Manager'
});

export const NAVIGATION = Object.freeze([
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/library', label: 'Library' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/projects', label: 'Projects' },
  { path: '/requisitions', label: 'Requisitions' },
  { path: '/reports', label: 'Reports' },
  { path: '/settings/cabinets', label: 'Administration' },
  { path: '/audit-log', label: 'Audit log' }
]);

export const DEFAULT_ROUTE = '/dashboard';

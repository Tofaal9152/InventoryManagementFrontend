export const APP_CONFIG = Object.freeze({
  apiBaseUrl: '/api',
  mode: 'demo',
  appName: 'Inventory Manager'
});

export const NAVIGATION = Object.freeze([
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/library', label: 'Library', icon: 'library' },
  { path: '/inventory', label: 'Drawer', icon: 'drawer' },
  { path: '/projects', label: 'Projects', icon: 'projects' },
  { path: '/requisitions', label: 'Requisitions', icon: 'requisitions' },
  { path: '/reports', label: 'Reports', icon: 'reports' },
  { path: '/settings/cabinets', label: 'Settings', icon: 'settings' },
  { path: '/audit-log', label: 'Audit log', icon: 'audit-log' }
]);

export const DEFAULT_ROUTE = '/dashboard';

import { escapeHtml } from '../utils/dom.js';

const ICONS = Object.freeze({
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5"/><rect x="3" y="13" width="7.5" height="8" rx="1.5"/>',
  library: '<path d="M12 7.5c-1.7-1.5-3.8-2.3-6.8-2.3H4v12.6h1.2c3 0 5.1.8 6.8 2.3"/><path d="M12 7.5c1.7-1.5 3.8-2.3 6.8-2.3H20v12.6h-1.2c-3 0-5.1.8-6.8 2.3"/><path d="M12 7.5v12.6"/>',
  drawer: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 12h17"/><path d="M9.5 7.75h5"/><path d="M9.5 16.25h5"/>',
  projects: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h3.9a1.5 1.5 0 0 1 1.2.6l1 1.4H19A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  requisitions: '<path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="M9.5 11.5h5"/><path d="M9.5 15.5h5"/>',
  reports: '<path d="M4 20h16"/><path d="M7.5 20v-5"/><path d="M12 20V8.5"/><path d="M16.5 20v-8"/>',
  settings: '<path d="M4 7.5h9"/><path d="M17 7.5h3"/><circle cx="15" cy="7.5" r="2"/><path d="M4 16.5h3"/><path d="M11 16.5h9"/><circle cx="9" cy="16.5" r="2"/>',
  'audit-log': '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4.2h4.2"/><path d="M12 8v4.3l3 1.8"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  back: '<path d="M20 12H4.5"/><path d="m10.5 6-6 6 6 6"/>',
  edit: '<path d="M4.5 19.5h4L19 9a2.12 2.12 0 0 0-3-3L5.5 16.5z"/><path d="m13.5 7 3.5 3.5"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="m6.5 7 .8 11.1a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5L17.5 7"/>',
  import: '<path d="M12 3.5v9"/><path d="m8.2 9 3.8 3.8L15.8 9"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  export: '<path d="M12 13V3.5"/><path d="M8.2 7.3 12 3.5l3.8 3.8"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  label: '<path d="M11.5 3.5H19A1.5 1.5 0 0 1 20.5 5v7.5a1.5 1.5 0 0 1-.44 1.06l-6.5 6.5a1.5 1.5 0 0 1-2.12 0l-7.5-7.5a1.5 1.5 0 0 1 0-2.12l6.5-6.5A1.5 1.5 0 0 1 11.5 3.5z"/><circle cx="16" cy="8" r="1.4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20.5 4v4.5H16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m15.8 15.8 4.2 4.2"/>',
  take: '<path d="M12 14V5"/><path d="m8.5 8.5 3.5-3.5 3.5 3.5"/><path d="M5 13.5v4A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5v-4"/>',
  return: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-4"/>',
  transfer: '<path d="M4 9h13"/><path d="M13.5 5.5 17 9l-3.5 3.5"/><path d="M20 15H7"/><path d="M10.5 11.5 7 15l3.5 3.5"/>',
  assign: '<path d="m12 3 8.5 4.5L12 12 3.5 7.5z"/><path d="m4.5 12 7.5 4 7.5-4"/><path d="m4.5 16.5 7.5 4 7.5-4"/>',
  component: '<path d="M20.5 8.2v7.6a1.5 1.5 0 0 1-.8 1.3l-7 3.8a1.5 1.5 0 0 1-1.4 0l-7-3.8a1.5 1.5 0 0 1-.8-1.3V8.2a1.5 1.5 0 0 1 .8-1.3l7-3.8a1.5 1.5 0 0 1 1.4 0l7 3.8a1.5 1.5 0 0 1 .8 1.3z"/><path d="m3.7 7.4 8.3 4.5 8.3-4.5"/><path d="M12 20.5v-8.6"/>',
  datasheet: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M13.5 3.5V8.5h5"/><path d="M8.5 13h7"/><path d="M8.5 16.5h7"/>',
  'external-link': '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5h5"/>',
  'requisition-raise': '<path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="M12 10.5v5"/><path d="M9.5 13h5"/>',
  status: '<path d="M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="m9.5 13.5 2 2 3.5-3.7"/>',
  alert: '<path d="M12 4.5 3.6 19a1.2 1.2 0 0 0 1 1.8h14.8a1.2 1.2 0 0 0 1-1.8z"/><path d="M12 10v4"/><path d="M12 17.2h.01"/>',
  success: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v4.6"/><path d="M12 16.1h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11.2V16"/><path d="M12 8h.01"/>',
  'chevron-left': '<path d="M14.5 6 8.5 12l6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  view: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17"/><path d="M9.5 9.5v10"/>',
  cabinet: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 5.75h4"/><path d="M10 12h4"/><path d="M10 18.25h4"/>',
  brand: '<rect x="2.75" y="3.25" width="18.5" height="17.5" rx="3.5"/><path d="M2.75 12h18.5"/><path d="M9 7.6h6"/><path d="M9 16.4h6"/>'
});

const STATUS_ICONS = Object.freeze({
  success: 'success',
  warning: 'alert',
  danger: 'error',
  neutral: 'info'
});

export function hasIcon(name) {
  return Boolean(ICONS[name]);
}

export function renderIcon(name, { className = 'icon', label = '' } = {}) {
  const shapes = ICONS[name];
  if (!shapes) return '';
  const accessibility = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  return `<svg class="${escapeHtml(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false" ${accessibility}>${shapes}</svg>`;
}

export function renderStatusIcon(statusClass, options) {
  return renderIcon(STATUS_ICONS[statusClass] || STATUS_ICONS.neutral, options);
}

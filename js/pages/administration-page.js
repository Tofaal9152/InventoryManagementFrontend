import { CabinetConfigurationError, getAdministrationData, getAuditLog, updateCabinetDimensions } from '../services/administration-service.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../utils/dom.js';
import { formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon } from '../ui/icons.js';

const sections = Object.freeze({
  '/settings/cabinets': { title: 'Cabinet settings', eyebrow: 'Administration', description: 'Change the 2D cabinet grid only when no assigned drawer would be removed.' },
  '/settings/categories': { title: 'Categories', eyebrow: 'Administration', description: 'Reference groups used by the Library catalog.' },
  '/settings/units': { title: 'Units', eyebrow: 'Administration', description: 'Units define their display symbol and whether decimal quantities are allowed.' },
  '/settings/users': { title: 'Users & roles', eyebrow: 'Administration', description: 'The v1 roles are fixed: Admin, Manager and Staff.' }
});
let administrationController;
let auditLogFilters = { query: '', entity: 'all', action: 'all', from: '', to: '' };

function administrationNav(route) {
  return `<nav class="administration-nav" aria-label="Administration sections">${Object.entries(sections).map(([path, section]) => `<a href="${path}" data-route-link ${path === route ? 'aria-current="page"' : ''}>${section.title}</a>`).join('')}</nav>`;
}

function renderCategoryTable(categories) {
  return `<div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Category</th><th>Description</th><th>Components</th><th>Total stock</th></tr></thead><tbody>${categories.map((category) => `<tr><td>${escapeHtml(category.name)}</td><td>${escapeHtml(category.description || '—')}</td><td>${category.componentCount}</td><td>${formatQuantity(category.totalQuantity)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderUnitTable(units) {
  return `<div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Unit</th><th>Symbol</th><th>Quantity rule</th><th>Components using it</th></tr></thead><tbody>${units.map((unit) => `<tr><td>${escapeHtml(unit.name)}</td><td>${escapeHtml(unit.symbol)}</td><td>${unit.allowFraction ? 'Decimal permitted' : 'Whole quantities only'}</td><td>${unit.componentCount}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderUsersTable(users, roles) {
  return `<div class="administration-role-note">Available v1 roles: ${roles.map((role) => `<span class="status-badge status-badge--neutral">${role}</span>`).join('')}</div><div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>User</th><th>Role</th><th>Status</th></tr></thead><tbody>${users.map((user) => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.role)}</td><td><span class="status-badge status-badge--${user.active ? 'success' : 'neutral'}">${user.active ? 'Active' : 'Inactive'}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function renderCabinets(cabinets) {
  return cabinets.map((cabinet) => `<section class="detail-card"><h3>${escapeHtml(cabinet.name)}</h3><p class="administration-caption">${cabinet.occupiedDrawerCount} assigned drawers out of ${cabinet.drawers.length}.</p><form class="cabinet-config-form" data-cabinet-config data-cabinet-id="${cabinet.id}"><div class="field"><label class="field__label" for="rows-${cabinet.id}">Rows</label><input class="field__control" id="rows-${cabinet.id}" name="rows" type="number" min="1" max="9" value="${cabinet.rows}" required></div><div class="field"><label class="field__label" for="columns-${cabinet.id}">Columns</label><input class="field__control" id="columns-${cabinet.id}" name="columnCount" type="number" min="1" max="26" value="${cabinet.columns.length}" required></div><button class="button" type="submit">${renderIcon('check')}Check and save</button></form><p class="administration-caption">Reducing a dimension is blocked when any removed drawer has a component assigned or stock.</p></section>`).join('');
}

function renderCabinetActions() {
  return `<section class="administration-placeholder-grid" aria-label="Future backend tools"><article><h3>Import inventory</h3><p>Template, column mapping and atomic validation will connect to the future import endpoint.</p><button class="button button--secondary" type="button" data-admin-placeholder>${renderIcon('import')}Import placeholder</button></article><article><h3>Export inventory</h3><p>The active filters and selected columns will be supplied to a CSV/XLSX export endpoint.</p><button class="button button--secondary" type="button" data-admin-placeholder>${renderIcon('export')}Export placeholder</button></article><article><h3>Drawer labels & QR</h3><p>Printable labels will be generated server-side from current drawer locations.</p><button class="button button--secondary" type="button" data-admin-placeholder>${renderIcon('label')}Label placeholder</button></article></section>`;
}

function filterAuditEvents(events) {
  const query = auditLogFilters.query.trim().toLowerCase();
  return events.filter((event) => {
    const date = String(event.timestamp || '').slice(0, 10);
    const searchableText = [event.entity, event.action, event.summary, event.actor?.name].join(' ').toLowerCase();
    return (!query || searchableText.includes(query))
      && (auditLogFilters.entity === 'all' || event.entity === auditLogFilters.entity)
      && (auditLogFilters.action === 'all' || event.action === auditLogFilters.action)
      && (!auditLogFilters.from || date >= auditLogFilters.from)
      && (!auditLogFilters.to || date <= auditLogFilters.to);
  });
}

function renderAuditRows(events) {
  return events.map((event) => `<tr><td>${formatDateTime(event.timestamp)}</td><td>${escapeHtml(event.entity)}</td><td>${escapeHtml(event.action)}</td><td>${escapeHtml(event.summary)}</td><td>${escapeHtml(event.actor?.name || 'System')}</td></tr>`).join('') || '<tr><td colspan="5">No audit events match these filters.</td></tr>';
}

function updateAuditLogResults(container, events) {
  const filteredEvents = filterAuditEvents(events);
  const tableBody = container.querySelector('[data-audit-results]');
  const count = container.querySelector('[data-audit-count]');
  const clearButton = container.querySelector('[data-clear-audit-filters]');
  if (tableBody) tableBody.innerHTML = renderAuditRows(filteredEvents);
  if (count) count.textContent = `${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'}`;
  if (clearButton) clearButton.disabled = Object.values(auditLogFilters).every((value) => !value || value === 'all');
}

export async function renderAdministrationPage(container, route) {
  destroyAdministrationPage();
  const section = sections[route];
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading administration…</h2></section>';
  const data = await getAdministrationData();
  let content = '';
  if (route === '/settings/cabinets') content = `<div class="administration-cabinet-grid">${renderCabinets(data.cabinets)}</div>${renderCabinetActions()}`;
  if (route === '/settings/categories') content = renderCategoryTable(data.categories);
  if (route === '/settings/units') content = renderUnitTable(data.units);
  if (route === '/settings/users') content = renderUsersTable(data.users, data.roles);
  container.innerHTML = `<section class="administration-page" aria-label="${section.title}">${administrationNav(route)}<section class="administration-content">${content}</section></section>`;
  administrationController = new AbortController();
  container.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-cabinet-config]');
    if (!form) return;
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      await updateCabinetDimensions({ cabinetId: form.dataset.cabinetId, ...Object.fromEntries(new FormData(form)) });
      showToast('Cabinet dimensions updated.');
      await renderAdministrationPage(container, route);
    } catch (error) { showToast(error instanceof CabinetConfigurationError ? error.message : 'Cabinet settings could not be saved.', { type: 'error' }); } finally { submitButton.disabled = false; }
  }, { signal: administrationController.signal });
  container.addEventListener('click', (event) => { if (event.target.closest('[data-admin-placeholder]')) showToast('This control is ready to connect to its backend endpoint.'); }, { signal: administrationController.signal });
}

export async function renderAuditLogPage(container) {
  destroyAdministrationPage();
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading audit log…</h2></section>';
  const events = await getAuditLog();
  const entities = [...new Set(events.map((event) => event.entity))].sort();
  const actions = [...new Set(events.map((event) => event.action))].sort();
  const filteredEvents = filterAuditEvents(events);
  container.innerHTML = `
    <section class="administration-page" aria-label="Audit log">
      <section class="audit-toolbar" aria-label="Filter audit log">
        <label class="audit-search"><span class="visually-hidden">Search audit log</span><input class="field__control" type="search" value="${escapeHtml(auditLogFilters.query)}" placeholder="Search summary or actor" data-audit-filter="query"></label>
        <label><span class="visually-hidden">Filter by entity</span><select class="field__control" data-audit-filter="entity"><option value="all">All entities</option>${entities.map((entity) => `<option value="${escapeHtml(entity)}" ${auditLogFilters.entity === entity ? 'selected' : ''}>${escapeHtml(entity)}</option>`).join('')}</select></label>
        <label><span class="visually-hidden">Filter by action</span><select class="field__control" data-audit-filter="action"><option value="all">All actions</option>${actions.map((action) => `<option value="${escapeHtml(action)}" ${auditLogFilters.action === action ? 'selected' : ''}>${escapeHtml(action)}</option>`).join('')}</select></label>
        <label><span class="visually-hidden">From date</span><input class="field__control" type="date" value="${escapeHtml(auditLogFilters.from)}" data-audit-filter="from" aria-label="From date"></label>
        <label><span class="visually-hidden">To date</span><input class="field__control" type="date" value="${escapeHtml(auditLogFilters.to)}" data-audit-filter="to" aria-label="To date"></label>
        <button class="table-action" type="button" data-clear-audit-filters ${Object.values(auditLogFilters).every((value) => !value || value === 'all') ? 'disabled' : ''}>${renderIcon('close')}Clear filters</button>
      </section>
      <div class="audit-result-meta"><span data-audit-count>${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'}</span></div>
      <div class="library-table-wrap"><table class="library-table"><thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Summary</th><th>Actor</th></tr></thead><tbody data-audit-results>${renderAuditRows(filteredEvents)}</tbody></table></div>
    </section>
  `;
  administrationController = new AbortController();
  container.addEventListener('input', (event) => {
    const filter = event.target.dataset.auditFilter;
    if (!filter) return;
    auditLogFilters = { ...auditLogFilters, [filter]: event.target.value };
    updateAuditLogResults(container, events);
  }, { signal: administrationController.signal });
  container.addEventListener('change', (event) => {
    const filter = event.target.dataset.auditFilter;
    if (!filter) return;
    auditLogFilters = { ...auditLogFilters, [filter]: event.target.value };
    updateAuditLogResults(container, events);
  }, { signal: administrationController.signal });
  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-clear-audit-filters]')) return;
    auditLogFilters = { query: '', entity: 'all', action: 'all', from: '', to: '' };
    container.querySelectorAll('[data-audit-filter]').forEach((control) => { control.value = auditLogFilters[control.dataset.auditFilter]; });
    updateAuditLogResults(container, events);
  }, { signal: administrationController.signal });
}

export function destroyAdministrationPage() {
  administrationController?.abort();
  administrationController = null;
}

import { CabinetConfigurationError, getAdministrationData, getAuditLog, updateCabinetDimensions } from '../services/administration-service.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../utils/dom.js';
import { formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon } from '../ui/icons.js';
import { APP_CONFIG } from '../config.js';
import { canAdministerUsers, canConfigureCabinet, canManageLibrary } from '../services/permission-service.js';
import { openUserModal } from '../ui/user-modal.js';
import { sendPasswordReset, setUserActive } from '../services/user-service.js';
import { openImportModal } from '../ui/import-modal.js';
import { downloadExport, labelSheetUrl } from '../services/file-service.js';
import { openCategoryModal, openCategoryReassignModal, openUnitModal } from '../ui/reference-modal.js';
import { deleteCategory, deleteUnit } from '../services/reference-service.js';
import { confirmAction } from '../ui/confirm-dialog.js';
import { renderErrorState, renderLoadingState } from '../ui/async-state.js';

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

function referenceToolbar(label, attribute) {
  if (!canManageLibrary() || APP_CONFIG.mode === 'demo') return '';
  return `<div class="page-actions"><button class="button" type="button" ${attribute}>${renderIcon('plus')}${label}</button></div>`;
}

function rowActions(editAttribute, deleteAttribute, id) {
  if (!canManageLibrary() || APP_CONFIG.mode === 'demo') return '';
  return `
    <td class="table-actions">
      <button class="table-action" type="button" ${editAttribute}="${escapeHtml(id)}">${renderIcon('edit')}Edit</button>
      <button class="table-action" type="button" ${deleteAttribute}="${escapeHtml(id)}">${renderIcon('trash')}Delete</button>
    </td>
  `;
}

function renderCategoryTable(categories) {
  const editable = canManageLibrary() && APP_CONFIG.mode !== 'demo';

  if (!categories.length) {
    return `${referenceToolbar('New category', 'data-create-category')}
      <section class="state-panel">
        <h3 class="state-panel__title">${renderIcon('library')}No categories yet</h3>
        <p class="state-panel__description">${editable ? 'Create a category so Library components can be grouped.' : 'An Admin or Manager needs to create the first category.'}</p>
      </section>`;
  }

  return `${referenceToolbar('New category', 'data-create-category')}
    <div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Category</th><th>Description</th><th>Components</th><th>Total stock</th>${editable ? '<th aria-label="Actions"></th>' : ''}</tr></thead><tbody>${categories.map((category) => `<tr><td>${escapeHtml(category.name)}</td><td>${escapeHtml(category.description || '—')}</td><td>${category.componentCount}</td><td>${formatQuantity(category.totalQuantity)}</td>${rowActions('data-edit-category', 'data-delete-category', category.id)}</tr>`).join('')}</tbody></table></div>`;
}

function renderUnitTable(units) {
  const editable = canManageLibrary() && APP_CONFIG.mode !== 'demo';

  if (!units.length) {
    return `${referenceToolbar('New unit', 'data-create-unit')}
      <section class="state-panel">
        <h3 class="state-panel__title">${renderIcon('component')}No units yet</h3>
        <p class="state-panel__description">${editable ? 'Create a unit so quantities have something to be measured in.' : 'An Admin or Manager needs to create the first unit.'}</p>
      </section>`;
  }

  return `${referenceToolbar('New unit', 'data-create-unit')}
    <div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Unit</th><th>Symbol</th><th>Quantity rule</th><th>Components using it</th>${editable ? '<th aria-label="Actions"></th>' : ''}</tr></thead><tbody>${units.map((unit) => `<tr><td>${escapeHtml(unit.name)}</td><td>${escapeHtml(unit.symbol)}</td><td>${unit.allowFraction || unit.allowsFraction ? 'Decimal permitted' : 'Whole quantities only'}</td><td>${unit.componentCount}</td>${rowActions('data-edit-unit', 'data-delete-unit', unit.id)}</tr>`).join('')}</tbody></table></div>`;
}

function renderUsersTable(users, roles) {
  const editable = canAdministerUsers() && APP_CONFIG.mode !== 'demo';
  const roleNote = `<div class="administration-role-note">Available v1 roles: ${roles.map((role) => `<span class="status-badge status-badge--neutral">${role}</span>`).join('')}</div>`;

  if (!users.length) {
    return `${roleNote}
      ${editable ? `<div class="page-actions"><button class="button" type="button" data-create-user>${renderIcon('plus')}New user</button></div>` : ''}
      <section class="state-panel">
        <h3 class="state-panel__title">${renderIcon('alert')}No users to show</h3>
        <p class="state-panel__description">${editable ? 'Create the first user, or check that you are signed in as an Admin.' : 'Only an Admin can see and manage users.'}</p>
      </section>`;
  }

  return `${roleNote}
    ${editable ? `<div class="page-actions"><button class="button" type="button" data-create-user>${renderIcon('plus')}New user</button></div>` : ''}
    <div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>User</th><th>Role</th><th>Status</th>${editable ? '<th aria-label="Actions"></th>' : ''}</tr></thead><tbody>${users.map((user) => {
      const isActive = user.isActive ?? user.active;
      return `<tr>
        <td><strong>${escapeHtml(user.name)}</strong><span class="table-secondary">${escapeHtml(user.email || '')}</span></td>
        <td>${escapeHtml(user.role)}</td>
        <td><span class="status-badge status-badge--${isActive ? 'success' : 'neutral'}">${isActive ? 'Active' : 'Deactivated'}</span></td>
        ${editable ? `<td class="table-actions">
          <button class="table-action" type="button" data-edit-user="${escapeHtml(user.id)}">${renderIcon('edit')}Edit</button>
          <button class="table-action" type="button" data-reset-password="${escapeHtml(user.id)}">${renderIcon('refresh')}Reset password</button>
          <button class="table-action" type="button" data-toggle-user="${escapeHtml(user.id)}" data-active="${isActive}">${renderIcon(isActive ? 'close' : 'check')}${isActive ? 'Deactivate' : 'Reactivate'}</button>
        </td>` : ''}
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderCabinets(cabinets) {
  return cabinets.map((cabinet) => `<section class="detail-card"><h3>${escapeHtml(cabinet.name)}</h3><p class="administration-caption">${cabinet.occupiedDrawerCount} assigned drawers out of ${cabinet.drawers.length}.</p><form class="cabinet-config-form" data-cabinet-config data-cabinet-id="${cabinet.id}"><div class="field"><label class="field__label" for="rows-${cabinet.id}">Rows</label><input class="field__control" id="rows-${cabinet.id}" name="rows" type="number" min="1" max="9" value="${cabinet.rows}" required></div><div class="field"><label class="field__label" for="columns-${cabinet.id}">Columns</label><input class="field__control" id="columns-${cabinet.id}" name="columnCount" type="number" min="1" max="26" value="${cabinet.columns.length}" required></div><button class="button" type="submit">${renderIcon('check')}Check and save</button></form><p class="administration-caption">Reducing a dimension is blocked when any removed drawer has a component assigned or stock.</p></section>`).join('');
}

function renderCabinetActions() {
  const live = APP_CONFIG.mode !== 'demo';
  const canImport = canManageLibrary() && live;

  return `<section class="administration-placeholder-grid" aria-label="Import, export and labels">
    <article>
      <h3>Import inventory</h3>
      <p>Load component definitions or chamber quantities from a spreadsheet. The file is checked before anything is saved.</p>
      ${canImport
        ? `<button class="button button--secondary" type="button" data-import="library">${renderIcon('import')}Import components</button>
           <button class="button button--secondary" type="button" data-import="inventory">${renderIcon('import')}Import stock</button>`
        : `<button class="button button--secondary" type="button" data-admin-placeholder>${renderIcon('import')}Import placeholder</button>`}
    </article>
    <article>
      <h3>Export inventory</h3>
      <p>Download the component catalogue or the stock entries as a spreadsheet.</p>
      ${canImport
        ? `<button class="button button--secondary" type="button" data-export="library/components/export/">${renderIcon('export')}Export components</button>
           <button class="button button--secondary" type="button" data-export="inventory/stock-entries/export/">${renderIcon('export')}Export stock</button>`
        : `<button class="button button--secondary" type="button" data-admin-placeholder>${renderIcon('export')}Export placeholder</button>`}
    </article>
    <article>
      <h3>Drawer labels &amp; QR</h3>
      <p>A printable sheet of drawer labels with QR codes that open the chamber.</p>
      ${live
        ? `<a class="button button--secondary" href="${labelSheetUrl()}" target="_blank" rel="noreferrer">${renderIcon('label')}Open label sheet${renderIcon('external-link')}</a>`
        : `<button class="button button--secondary" type="button" data-admin-placeholder>${renderIcon('label')}Label placeholder</button>`}
    </article>
  </section>`;
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

/** Deactivating keeps the user's history; the backend never deletes a user. */
async function handleToggleUser({ user, button, reload }) {
  const deactivating = button.dataset.active === 'true';
  const confirmed = await confirmAction({
    title: deactivating ? `Deactivate ${user.name || user.email}?` : `Reactivate ${user.name || user.email}?`,
    description: deactivating
      ? 'They can no longer sign in. Their movements, requisitions and audit trail are kept, and you can reactivate them later.'
      : 'They will be able to sign in again with their existing password.',
    confirmLabel: deactivating ? 'Deactivate user' : 'Reactivate user',
    tone: deactivating ? 'danger' : 'default'
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await setUserActive(user.id, !deactivating);
    showToast(deactivating ? 'User deactivated.' : 'User reactivated.');
    await reload();
  } catch (error) {
    button.disabled = false;
    showToast(error?.message || 'The user could not be updated.', { type: 'error' });
  }
}

async function handlePasswordReset({ user, button }) {
  const confirmed = await confirmAction({
    title: `Send a password reset to ${user.email}?`,
    description: 'They receive an email with a link to set a new password. Their current password keeps working until they use it.',
    confirmLabel: 'Send reset email',
    tone: 'default'
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await sendPasswordReset(user.id);
    showToast('Password reset email sent.');
  } catch (error) {
    showToast(error?.message || 'The reset email could not be sent.', { type: 'error' });
  } finally {
    button.disabled = false;
  }
}

/**
 * A category holding components cannot be deleted; rather than a dead end, the
 * user is offered the reassign flow the backend documents.
 */
async function handleDeleteCategory({ category, categories, button, reload }) {
  if (category.componentCount > 0) {
    openCategoryReassignModal({ category, categories, onReassigned: reload });
    return;
  }

  const confirmed = await confirmAction({
    title: `Delete ${category.name}?`,
    description: 'The category is empty, so nothing else changes. The deletion is written to the audit log.',
    confirmLabel: 'Delete category'
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await deleteCategory(category.id);
    showToast('Category deleted.');
    await reload();
  } catch (error) {
    button.disabled = false;
    showToast(error?.message || 'The category could not be deleted.', { type: 'error' });
  }
}

async function handleDeleteUnit({ unit, button, reload }) {
  const inUse = unit.componentCount > 0;
  const confirmed = await confirmAction({
    title: `Delete ${unit.name}?`,
    description: inUse
      ? `${unit.componentCount} component${unit.componentCount === 1 ? ' uses' : 's use'} this unit, so the server will refuse. Move them to another unit first.`
      : 'No component uses this unit, so nothing else changes.',
    confirmLabel: 'Delete unit'
  });
  if (!confirmed) return;

  button.disabled = true;
  try {
    await deleteUnit(unit.id);
    showToast('Unit deleted.');
    await reload();
  } catch (error) {
    button.disabled = false;
    showToast(error?.message || 'The unit could not be deleted.', { type: 'error' });
  }
}

export async function renderAdministrationPage(container, route) {
  destroyAdministrationPage();
  const section = sections[route];
  renderLoadingState(container, { title: 'Loading administration…', description: 'Preparing settings.' });

  let data;
  try {
    data = await getAdministrationData();
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load settings',
      onRetry: () => renderAdministrationPage(container, route)
    });
    return;
  }
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
    if (submitButton.disabled) return;

    const values = Object.fromEntries(new FormData(form));
    const cabinet = data.cabinets.find((item) => item.id === form.dataset.cabinetId);
    const currentDrawers = (cabinet?.rows || 0) * (cabinet?.columnCount || cabinet?.columns?.length || 0);
    const nextDrawers = Number(values.rows) * Number(values.columnCount);

    // Shrinking can remove drawers, so say how many before anything is sent.
    if (cabinet && nextDrawers < currentDrawers) {
      const confirmed = await confirmAction({
        title: `Shrink ${cabinet.name}?`,
        description: `This removes ${currentDrawers - nextDrawers} drawer${currentDrawers - nextDrawers === 1 ? '' : 's'} from the grid. `
          + 'The server refuses if any removed chamber still holds stock, and removed drawers keep their movement history.',
        confirmLabel: 'Resize cabinet'
      });
      if (!confirmed) return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');

    try {
      await updateCabinetDimensions({ cabinetId: form.dataset.cabinetId, name: cabinet?.name, ...values });
      showToast('Cabinet dimensions updated.');
      await renderAdministrationPage(container, route);
    } catch (error) {
      showToast(error instanceof CabinetConfigurationError ? error.message : 'Cabinet settings could not be saved.', { type: 'error' });
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  }, { signal: administrationController.signal });
  container.addEventListener('click', async (event) => {
    if (event.target.closest('[data-admin-placeholder]')) {
      showToast('This control is ready to connect to its backend endpoint.');
      return;
    }

    const reload = () => renderAdministrationPage(container, route);

    if (event.target.closest('[data-create-category]')) {
      openCategoryModal({ onSaved: reload });
      return;
    }
    if (event.target.closest('[data-create-unit]')) {
      openUnitModal({ onSaved: reload });
      return;
    }

    const editCategory = event.target.closest('[data-edit-category]');
    if (editCategory) {
      const category = data.categories.find((item) => item.id === editCategory.dataset.editCategory);
      if (category) openCategoryModal({ category, onSaved: reload });
      return;
    }

    const editUnit = event.target.closest('[data-edit-unit]');
    if (editUnit) {
      const unit = data.units.find((item) => item.id === editUnit.dataset.editUnit);
      if (unit) openUnitModal({ unit, onSaved: reload });
      return;
    }

    const removeCategory = event.target.closest('[data-delete-category]');
    if (removeCategory) {
      const category = data.categories.find((item) => item.id === removeCategory.dataset.deleteCategory);
      if (category) await handleDeleteCategory({ category, categories: data.categories, button: removeCategory, reload });
      return;
    }

    const removeUnit = event.target.closest('[data-delete-unit]');
    if (removeUnit) {
      const unit = data.units.find((item) => item.id === removeUnit.dataset.deleteUnit);
      if (unit) await handleDeleteUnit({ unit, button: removeUnit, reload });
      return;
    }

    const importButton = event.target.closest('[data-import]');
    if (importButton) {
      openImportModal({ kind: importButton.dataset.import, onImported: reload });
      return;
    }

    const exportButton = event.target.closest('[data-export]');
    if (exportButton) {
      exportButton.disabled = true;
      exportButton.setAttribute('aria-busy', 'true');
      try {
        await downloadExport(exportButton.dataset.export, { filename: 'inventory-export.xlsx' });
        showToast('Export downloaded.');
      } catch (error) {
        showToast(error?.message || 'The export could not be downloaded.', { type: 'error' });
      } finally {
        exportButton.disabled = false;
        exportButton.removeAttribute('aria-busy');
      }
      return;
    }

    if (event.target.closest('[data-create-user]')) {
      openUserModal({ onSaved: reload });
      return;
    }

    const editUser = event.target.closest('[data-edit-user]');
    if (editUser) {
      const user = data.users.find((item) => item.id === editUser.dataset.editUser);
      if (user) openUserModal({ user, onSaved: reload });
      return;
    }

    const toggleUser = event.target.closest('[data-toggle-user]');
    if (toggleUser) {
      const user = data.users.find((item) => item.id === toggleUser.dataset.toggleUser);
      if (user) await handleToggleUser({ user, button: toggleUser, reload });
      return;
    }

    const resetPassword = event.target.closest('[data-reset-password]');
    if (resetPassword) {
      const user = data.users.find((item) => item.id === resetPassword.dataset.resetPassword);
      if (user) await handlePasswordReset({ user, button: resetPassword });
    }
  }, { signal: administrationController.signal });
}

export async function renderAuditLogPage(container) {
  destroyAdministrationPage();
  renderLoadingState(container, { title: 'Loading audit log…', description: 'Preparing recorded changes.' });

  let events;
  try {
    events = await getAuditLog();
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load the audit log',
      onRetry: () => renderAuditLogPage(container)
    });
    return;
  }
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

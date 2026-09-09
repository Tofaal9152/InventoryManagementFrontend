import {
  getComponent,
  getComponentDetails,
  getComponentReferenceData,
  listComponents
} from '../services/component-service.js';
import { openComponentModal } from '../ui/component-modal.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatDateTime, formatQuantity } from '../utils/formatters.js';

const pageSize = 8;
let libraryState = { query: '', categoryId: '', unitId: '', stockStatus: 'all', page: 1 };
let searchTimeout;
let libraryEventController;

function statusClass(stockState) {
  return stockState === 'stocked' ? 'success' : stockState === 'low' ? 'warning' : stockState === 'out' ? 'danger' : 'neutral';
}

function renderStatusBadge(component) {
  return `<span class="status-badge status-badge--${statusClass(component.stockState)}">${component.stockLabel}</span>`;
}

function renderLibraryRows(components) {
  return components.map((component) => `
    <tr>
      <td>
        <a class="component-name-link" href="/library/${component.id}" data-route-link>${escapeHtml(component.name)}</a>
        <span class="table-secondary">${escapeHtml(component.manufacturer || 'No manufacturer')}</span>
      </td>
      <td>${escapeHtml(component.partNumber || '—')}</td>
      <td>${escapeHtml(component.category?.name || '—')}</td>
      <td>${escapeHtml(component.unit?.symbol || '—')}</td>
      <td>
        <strong>${formatQuantity(component.totalQuantity, component.unit?.symbol)}</strong>
        <span class="table-secondary">${component.locationCount} location${component.locationCount === 1 ? '' : 's'}</span>
      </td>
      <td>${renderStatusBadge(component)}</td>
      <td>${formatCurrency(component.lastBuyingPrice)}</td>
      <td class="table-actions">
        <button class="table-action" type="button" data-edit-component-id="${component.id}">Edit</button>
      </td>
    </tr>
  `).join('');
}

function renderPagination(totalItems) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  return `
    <div class="library-pagination">
      <span>${totalItems} component${totalItems === 1 ? '' : 's'}</span>
      <div>
        <button class="table-action" type="button" data-library-page="previous" ${libraryState.page === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${libraryState.page} of ${pageCount}</span>
        <button class="table-action" type="button" data-library-page="next" ${libraryState.page === pageCount ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;
}

function bindLibraryEvents(container, totalItems, signal) {
  container.addEventListener('input', (event) => {
    if (event.target.matches('[data-library-search]')) {
      window.clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        libraryState = { ...libraryState, query: event.target.value, page: 1 };
        renderLibraryPage(container);
      }, 180);
    }
  }, { signal });

  container.addEventListener('change', (event) => {
    const field = event.target.dataset.libraryFilter;
    if (field) {
      libraryState = { ...libraryState, [field]: event.target.value, page: 1 };
      renderLibraryPage(container);
    }
  }, { signal });

  container.addEventListener('click', async (event) => {
    if (event.target.closest('[data-create-component]')) {
      await openComponentModal({ onSaved: () => renderLibraryPage(container) });
      return;
    }

    const editButton = event.target.closest('[data-edit-component-id]');
    if (editButton) {
      const component = await getComponent(editButton.dataset.editComponentId);
      if (component) {
        await openComponentModal({ component, onSaved: () => renderLibraryPage(container) });
      }
      return;
    }

    const pageButton = event.target.closest('[data-library-page]');
    if (pageButton) {
      const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
      const offset = pageButton.dataset.libraryPage === 'next' ? 1 : -1;
      libraryState = { ...libraryState, page: Math.max(1, Math.min(pageCount, libraryState.page + offset)) };
      await renderLibraryPage(container);
    }
  }, { signal });
}

export async function renderLibraryPage(container) {
  destroyLibraryPage();
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading Library…</h2><p class="state-panel__description">Preparing component records.</p></section>';
  const [references, components] = await Promise.all([
    getComponentReferenceData(),
    listComponents(libraryState)
  ]);
  const pageCount = Math.max(1, Math.ceil(components.length / pageSize));
  libraryState.page = Math.min(libraryState.page, pageCount);
  const startIndex = (libraryState.page - 1) * pageSize;
  const visibleComponents = components.slice(startIndex, startIndex + pageSize);

  container.innerHTML = `
    <section class="library-page" aria-label="Component library">
      <div class="route-actions">
        <button class="button" type="button" data-create-component>New component</button>
      </div>
      <section class="library-filters" aria-label="Library filters">
        <label class="library-search">
          <span class="visually-hidden">Search components</span>
          <input class="field__control" type="search" placeholder="Search name, part number or location" value="${escapeHtml(libraryState.query)}" data-library-search>
        </label>
        <select class="field__control" data-library-filter="categoryId" aria-label="Filter by category">
          <option value="">All categories</option>
          ${references.categories.map((category) => `<option value="${category.id}" ${libraryState.categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
        </select>
        <select class="field__control" data-library-filter="unitId" aria-label="Filter by unit">
          <option value="">All units</option>
          ${references.units.map((unit) => `<option value="${unit.id}" ${libraryState.unitId === unit.id ? 'selected' : ''}>${escapeHtml(unit.name)}</option>`).join('')}
        </select>
        <select class="field__control" data-library-filter="stockStatus" aria-label="Filter by stock status">
          <option value="all">All stock states</option>
          <option value="stocked" ${libraryState.stockStatus === 'stocked' ? 'selected' : ''}>In stock</option>
          <option value="low" ${libraryState.stockStatus === 'low' ? 'selected' : ''}>Low stock</option>
          <option value="out" ${libraryState.stockStatus === 'out' ? 'selected' : ''}>Out of stock</option>
        </select>
      </section>
      ${visibleComponents.length ? `
        <div class="library-table-wrap">
          <table class="library-table">
            <thead><tr><th>Component</th><th>Part number</th><th>Category</th><th>Unit</th><th>Total stock</th><th>Status</th><th>Last price</th><th aria-label="Actions"></th></tr></thead>
            <tbody>${renderLibraryRows(visibleComponents)}</tbody>
          </table>
        </div>
        ${renderPagination(components.length)}
      ` : '<section class="state-panel"><h3 class="state-panel__title">No components found</h3><p class="state-panel__description">Change the filters or create a new Library component.</p></section>'}
    </section>
  `;

  libraryEventController = new AbortController();
  bindLibraryEvents(container, components.length, libraryEventController.signal);
}

export async function renderComponentDetailsPage(container, componentId) {
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading component…</h2><p class="state-panel__description">Preparing component details.</p></section>';
  const component = await getComponentDetails(componentId);

  if (!component) {
    container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Component not found</h2><p class="state-panel__description">This Library record does not exist or may have been removed.</p><a class="button" href="/library" data-route-link>Back to Library</a></section>';
    return;
  }

  const locationRows = component.locations.length ? component.locations.map((location) => `
    <tr><td>${escapeHtml(location.cabinetName)}</td><td>${location.drawerCode}</td><td>${formatQuantity(location.quantity, component.unit?.symbol)}</td><td>${location.sectionCount}</td></tr>
  `).join('') : '<tr><td colspan="4">This component has not been assigned to a drawer.</td></tr>';
  const movementRows = component.movements.length ? component.movements.map((movement) => `
    <tr><td>${escapeHtml(movement.type)}</td><td>${formatQuantity(movement.quantity, component.unit?.symbol)}</td><td>${escapeHtml(movement.locationLabel || '—')}</td><td>${formatDateTime(movement.timestamp)}</td></tr>
  `).join('') : '<tr><td colspan="4">No movement records yet.</td></tr>';

  container.innerHTML = `
    <section class="component-details-page" aria-labelledby="component-details-title">
      <a class="back-link" href="/library" data-route-link>Back to Library</a>
      <header class="component-details-header">
        <div>
          <p class="eyebrow">${escapeHtml(component.category?.name || 'Component')}</p>
          <h2 id="component-details-title">${escapeHtml(component.name)}</h2>
          <p>${escapeHtml(component.partNumber || 'No part number')} · ${escapeHtml(component.manufacturer || 'No manufacturer')}</p>
        </div>
        <div class="component-details-header__status">
          ${renderStatusBadge(component)}
          <strong>${formatQuantity(component.totalQuantity, component.unit?.symbol)}</strong>
          <span>total available</span>
        </div>
      </header>
      <div class="component-details-grid">
        <section class="detail-card">
          <h3>Details</h3>
          <dl class="component-facts">
            <div><dt>Category</dt><dd>${escapeHtml(component.category?.name || '—')}</dd></div>
            <div><dt>Unit</dt><dd>${escapeHtml(component.unit?.name || '—')}</dd></div>
            <div><dt>Minimum quantity</dt><dd>${formatQuantity(component.minimumQuantity, component.unit?.symbol)}</dd></div>
            <div><dt>Last buying price</dt><dd>${formatCurrency(component.lastBuyingPrice)}</dd></div>
          </dl>
          <p class="component-description">${escapeHtml(component.description || 'No description supplied.')}</p>
          ${component.datasheetUrl ? `<a class="detail-link" href="${escapeHtml(component.datasheetUrl)}" target="_blank" rel="noreferrer">Open datasheet</a>` : ''}
        </section>
        <section class="detail-card detail-card--wide">
          <h3>Stock by location</h3>
          <div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Cabinet</th><th>Drawer</th><th>Quantity</th><th>Sections</th></tr></thead><tbody>${locationRows}</tbody></table></div>
        </section>
        <section class="detail-card detail-card--wide">
          <h3>Movement history</h3>
          <div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Type</th><th>Quantity</th><th>Location</th><th>When</th></tr></thead><tbody>${movementRows}</tbody></table></div>
        </section>
      </div>
    </section>
  `;
}

export function destroyLibraryPage() {
  window.clearTimeout(searchTimeout);
  libraryEventController?.abort();
  libraryEventController = undefined;
}

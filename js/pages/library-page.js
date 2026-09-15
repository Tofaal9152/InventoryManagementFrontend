import {
  getComponent,
  getComponentDetails,
  getComponentReferenceData,
  listComponents,
  setComponentArchived
} from '../services/component-service.js';
import { openComponentModal } from '../ui/component-modal.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon, renderStatusIcon } from '../ui/icons.js';
import { canManageLibrary } from '../services/permission-service.js';
import { renderErrorState, renderLoadingState } from '../ui/async-state.js';
import { confirmAction } from '../ui/confirm-dialog.js';
import { downloadExport } from '../services/file-service.js';
import { showToast } from '../ui/toast.js';
import { APP_CONFIG } from '../config.js';

const pageSize = 8;
let libraryState = { query: '', categoryId: '', unitId: '', stockStatus: 'all', page: 1 };
let searchTimeout;
let libraryEventController;
let componentDetailsEventController;

function statusClass(stockState) {
  return stockState === 'stocked' ? 'success' : stockState === 'low' ? 'warning' : stockState === 'out' ? 'danger' : 'neutral';
}

function renderStatusBadge(component) {
  const badgeClass = statusClass(component.stockState);
  return `<span class="status-badge status-badge--${badgeClass}">${renderStatusIcon(badgeClass)}${component.stockLabel}</span>`;
}

function renderComponentImage(component) {
  return component.image?.dataUrl
    ? `<img class="component-thumbnail" src="${escapeHtml(component.image.dataUrl)}" alt="${escapeHtml(component.name)}">`
    : '<span class="component-thumbnail component-thumbnail--empty">No image</span>';
}

function renderLibraryRows(components) {
  return components.map((component) => `
    <tr>
      <td>${renderComponentImage(component)}</td>
      <td>
        <a class="component-name-link" href="/library/${component.id}" data-route-link>${escapeHtml(component.name)}</a>
        <span class="table-secondary">${escapeHtml(component.manufacturer || 'No manufacturer')}</span>
      </td>
      <td>${escapeHtml(component.partNumber || '—')}</td>
      <td>${escapeHtml(component.category?.name || '—')}</td>
      <td>${escapeHtml(component.unit?.symbol || '—')}</td>
      <td>${formatQuantity(component.totalQuantity, component.unit?.symbol)}</td>
      <td>${formatCurrency(component.lastBuyingPrice)}</td>
      <td>${formatCurrency(component.deliveryCharge)}</td>
      <td>${component.locationCount}</td>
      <td>${formatDateTime(component.updatedOn)}</td>
      <td class="table-actions">
        <a class="table-action" href="/library/${component.id}" data-route-link>${renderIcon('view')}View details</a>
        ${canManageLibrary() ? `<button class="table-action" type="button" data-edit-component-id="${component.id}">${renderIcon('edit')}Edit</button>` : ''}
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
        <button class="table-action" type="button" data-library-page="previous" ${libraryState.page === 1 ? 'disabled' : ''}>${renderIcon('chevron-left')}Previous</button>
        <span>Page ${libraryState.page} of ${pageCount}</span>
        <button class="table-action" type="button" data-library-page="next" ${libraryState.page === pageCount ? 'disabled' : ''}>Next${renderIcon('chevron-right')}</button>
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

    const exportButton = event.target.closest('[data-export-components]');
    if (exportButton) {
      exportButton.disabled = true;
      exportButton.setAttribute('aria-busy', 'true');
      try {
        // Exports honour the filters on screen, so you get what you are looking at.
        await downloadExport('library/components/export/', {
          params: {
            search: libraryState.query || '',
            category: libraryState.categoryId || '',
            unit: libraryState.unitId || '',
            stock_status: { stocked: 'in_stock', low: 'below_minimum', out: 'out_of_stock' }[libraryState.stockStatus] || ''
          },
          filename: 'components.xlsx'
        });
        showToast('Export downloaded.');
      } catch (error) {
        showToast(error?.message || 'The export could not be downloaded.', { type: 'error' });
      } finally {
        exportButton.disabled = false;
        exportButton.removeAttribute('aria-busy');
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
  renderLoadingState(container, { title: 'Loading Library…', description: 'Preparing component records.' });

  let references;
  let components;
  try {
    [references, components] = await Promise.all([
      getComponentReferenceData(),
      listComponents(libraryState)
    ]);
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load the Library',
      onRetry: () => renderLibraryPage(container)
    });
    return;
  }
  const pageCount = Math.max(1, Math.ceil(components.length / pageSize));
  libraryState.page = Math.min(libraryState.page, pageCount);
  const startIndex = (libraryState.page - 1) * pageSize;
  const visibleComponents = components.slice(startIndex, startIndex + pageSize);

  container.innerHTML = `
    <section class="library-page" aria-label="Component library">
      <section class="library-toolbar" aria-label="Library controls">
        <section class="library-filters" aria-label="Library filters">
          <label class="library-search">
            <span class="visually-hidden">Search components</span>
            ${renderIcon('search', { className: 'library-search__icon' })}
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
        ${canManageLibrary() && APP_CONFIG.mode !== 'demo'
          ? `<button class="button button--secondary" type="button" data-export-components>${renderIcon('export')}Export</button>`
          : ''}
        ${canManageLibrary() ? `<button class="button" type="button" data-create-component>${renderIcon('plus')}New component</button>` : ''}
      </section>
      ${visibleComponents.length ? `
        <div class="library-table-wrap">
          <table class="library-table">
            <thead><tr><th>Image</th><th>Component</th><th>Part number</th><th>Category</th><th>Unit</th><th>Total stock</th><th>Last price</th><th>Delivery</th><th>Locations</th><th>Updated</th><th aria-label="Actions"></th></tr></thead>
            <tbody>${renderLibraryRows(visibleComponents)}</tbody>
          </table>
        </div>
        ${renderPagination(components.length)}
      ` : `<section class="state-panel"><h3 class="state-panel__title">${renderIcon('search')}No components found</h3><p class="state-panel__description">${canManageLibrary() ? 'Change the filters or create a new Library component.' : 'Change the filters to see other components.'}</p></section>`}
    </section>
  `;

  libraryEventController = new AbortController();
  bindLibraryEvents(container, components.length, libraryEventController.signal);
}

async function handleArchive(container, componentId, component, button) {
  const archiving = button.dataset.archived !== 'true';
  const stockNote = component.totalQuantity > 0
    ? ` It still holds ${formatQuantity(component.totalQuantity, component.unit?.symbol)} in ${component.locationCount} location${component.locationCount === 1 ? '' : 's'}; that stock and its history stay.`
    : '';

  const confirmed = await confirmAction({
    title: archiving ? `Archive ${component.name}?` : `Restore ${component.name}?`,
    description: archiving
      ? `It will be hidden from the Library and cannot receive new stock or requisitions.${stockNote}`
      : 'It will appear in the Library again and can receive stock and requisitions.',
    confirmLabel: archiving ? 'Archive component' : 'Restore component',
    tone: archiving ? 'danger' : 'default'
  });
  if (!confirmed) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');

  try {
    await setComponentArchived(componentId, archiving);
    showToast(archiving ? 'Component archived.' : 'Component restored.');
    await renderComponentDetailsPage(container, componentId);
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    showToast(error?.message || 'The component could not be updated.', { type: 'error' });
  }
}

export async function renderComponentDetailsPage(container, componentId) {
  destroyLibraryPage();
  renderLoadingState(container, { title: 'Loading component…', description: 'Preparing component details.' });

  let component;
  try {
    component = await getComponentDetails(componentId);
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load this component',
      onRetry: () => renderComponentDetailsPage(container, componentId)
    });
    return;
  }

  if (!component) {
    container.innerHTML = `<section class="state-panel"><h2 class="state-panel__title">${renderIcon('alert')}Component not found</h2><p class="state-panel__description">This Library record does not exist or may have been removed.</p><a class="button" href="/library" data-route-link>${renderIcon('back')}Back to Library</a></section>`;
    return;
  }

  const locationRows = component.locations.length ? component.locations.map((location) => `
    <tr><td><strong>${escapeHtml(location.cabinetName)}</strong><span class="table-secondary">Drawer ${escapeHtml(location.drawerCode)}</span></td><td>${formatQuantity(location.quantity, component.unit?.symbol)}</td><td>${location.sectionCount}</td></tr>
  `).join('') : '<tr><td colspan="3">This component has not been assigned to a drawer.</td></tr>';
  const activityItems = component.movements.length ? component.movements.map((movement) => `
    <li class="component-activity__item">
      <span class="component-activity__type component-activity__type--${escapeHtml(movement.type.toLowerCase())}">${escapeHtml(movement.type)}</span>
      <div><strong>${formatQuantity(movement.quantity, component.unit?.symbol)}</strong><span>${escapeHtml(movement.locationLabel || 'No drawer')} · ${formatDateTime(movement.timestamp)}</span></div>
    </li>
  `).join('') : '<li class="component-activity__empty">No movement records yet.</li>';

  container.innerHTML = `
    <section class="component-details-page" aria-labelledby="component-details-title">
      <div class="component-detail-topline">
        <a class="back-link" href="/library" data-route-link>${renderIcon('back')}Back to Library</a>
        <div class="component-detail-topline__actions">
          ${component.datasheetUrl ? `<a class="button button--secondary" href="${escapeHtml(component.datasheetUrl)}" target="_blank" rel="noreferrer">${renderIcon('datasheet')}Datasheet${renderIcon('external-link')}</a>` : ''}
          ${canManageLibrary() ? `<button class="button" type="button" data-edit-detail-component="${component.id}">${renderIcon('edit')}Edit component</button>` : ''}
          ${canManageLibrary() && APP_CONFIG.mode !== 'demo'
            ? `<button class="button button--${component.isArchived ? 'secondary' : 'danger'}" type="button"
                       data-archive-component="${component.id}" data-archived="${component.isArchived}">
                 ${renderIcon(component.isArchived ? 'refresh' : 'trash')}${component.isArchived ? 'Restore component' : 'Archive component'}
               </button>`
            : ''}
        </div>
      </div>
      <div class="component-detail-workspace">
        <div class="component-detail-main">
          <header class="component-hero">
            <div class="component-hero__image">${renderComponentImage(component)}</div>
            <div class="component-hero__identity">
              <p class="eyebrow">${escapeHtml(component.manufacturer || component.category?.name || 'Library component')}</p>
              <h2 id="component-details-title">${escapeHtml(component.name)}</h2>
              <dl>
                <div><dt>Part number / MPN</dt><dd>${escapeHtml(component.partNumber || 'Not supplied')}</dd></div>
                <div><dt>Category</dt><dd>${escapeHtml(component.category?.name || '—')}</dd></div>
              </dl>
            </div>
            <div class="component-hero__stock">
              ${renderStatusBadge(component)}
              <strong>${formatQuantity(component.totalQuantity, component.unit?.symbol)}</strong>
              <span>available across ${component.locationCount} location${component.locationCount === 1 ? '' : 's'}</span>
            </div>
          </header>
          <div class="component-overview-label">Overview</div>
          <div class="component-detail-columns">
            <section class="detail-card component-location-card">
              <div class="detail-card__heading"><div><h3>Location overview</h3><p>${formatQuantity(component.totalQuantity, component.unit?.symbol)} in storage</p></div><a class="detail-link" href="/inventory" data-route-link>Open Inventory</a></div>
              <div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Location</th><th>Quantity</th><th>Sections</th></tr></thead><tbody>${locationRows}</tbody></table></div>
            </section>
            <div class="component-record-stack">
              <section class="detail-card">
                <h3>Component record</h3>
                <dl class="component-facts">
                  <div><dt>Unit</dt><dd>${escapeHtml(component.unit?.name || '—')}</dd></div>
                  <div><dt>Minimum stock</dt><dd>${formatQuantity(component.minimumQuantity, component.unit?.symbol)}</dd></div>
                  <div><dt>Created</dt><dd>${formatDateTime(component.createdOn)}</dd></div>
                  <div><dt>Updated</dt><dd>${formatDateTime(component.updatedOn)}</dd></div>
                </dl>
                <p class="component-description">${escapeHtml(component.description || 'No description supplied.')}</p>
              </section>
              <section class="detail-card component-pricing-card">
                <h3>Pricing</h3>
                <dl class="component-price-facts"><div><dt>Last buying price</dt><dd>${formatCurrency(component.lastBuyingPrice)}</dd></div><div><dt>Delivery charge</dt><dd>${formatCurrency(component.deliveryCharge)}</dd></div></dl>
              </section>
            </div>
          </div>
        </div>
        <aside class="component-activity" aria-label="Component activity">
          <header><div><p class="eyebrow">Recent events</p><h3>Activity history</h3></div><span>${component.movements.length} event${component.movements.length === 1 ? '' : 's'}</span></header>
          <ol>${activityItems}</ol>
        </aside>
      </div>
    </section>
  `;

  componentDetailsEventController = new AbortController();
  container.addEventListener('click', async (event) => {
    const archiveButton = event.target.closest('[data-archive-component]');
    if (archiveButton) {
      await handleArchive(container, componentId, component, archiveButton);
      return;
    }

    const editButton = event.target.closest('[data-edit-detail-component]');
    if (!editButton) return;
    const editableComponent = await getComponent(editButton.dataset.editDetailComponent);
    if (editableComponent) {
      await openComponentModal({ component: editableComponent, onSaved: () => renderComponentDetailsPage(container, componentId) });
    }
  }, { signal: componentDetailsEventController.signal });
}

export function destroyLibraryPage() {
  window.clearTimeout(searchTimeout);
  libraryEventController?.abort();
  libraryEventController = undefined;
  componentDetailsEventController?.abort();
  componentDetailsEventController = undefined;
}

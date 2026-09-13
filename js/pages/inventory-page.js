import { getInventoryWorkspace, subscribeToInventoryChanges } from '../services/inventory-service.js';
import { openAssignmentModal } from '../ui/assign-component-modal.js';
import { openCreateCabinetModal } from '../ui/create-cabinet-modal.js';
import { openComponentModal } from '../ui/component-modal.js';
import { openStockOperationModal } from '../ui/stock-operation-modal.js';
import { escapeHtml } from '../utils/dom.js';
import { formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon, renderStatusIcon } from '../ui/icons.js';

const filterDefinitions = [
  { id: 'all', label: 'All' },
  { id: 'empty', label: 'Empty' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' }
];

let workspace;
let selectedCabinetId;
let selectedDrawerId;
let activeFilter = 'all';
let drawerViewMode = 'grid';
let isDrawerPanelOpen = false;
let unsubscribeFromInventory;
let inventoryEventController;

function getSelectedCabinet() {
  return workspace.cabinets.find((cabinet) => cabinet.id === selectedCabinetId) || workspace.cabinets[0];
}

function getSelectedDrawer() {
  return getSelectedCabinet().drawers.find((drawer) => drawer.id === selectedDrawerId) || getSelectedCabinet().drawers[0];
}

function getDrawerCounts(cabinet) {
  return cabinet.drawers.reduce((counts, drawer) => {
    counts.all += 1;
    counts[drawer.stockState] += 1;
    return counts;
  }, { all: 0, empty: 0, low: 0, out: 0, stocked: 0 });
}

function renderCabinetBrowser() {
  return workspace.groups.map((group) => `
    <section class="cabinet-group">
      <div class="cabinet-group__header">
        <div>
          <p class="cabinet-group__name">${escapeHtml(group.name)}</p>
          <span>${group.cabinets.length} cabinet${group.cabinets.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div class="cabinet-list">
        ${group.cabinets.map((cabinet) => `
          <button class="cabinet-list__item ${cabinet.id === selectedCabinetId ? 'is-selected' : ''}" type="button" data-cabinet-id="${cabinet.id}" aria-pressed="${cabinet.id === selectedCabinetId}">
            <span>
              <strong>${escapeHtml(cabinet.name)}</strong>
              <small>${cabinet.drawerCount} drawers</small>
            </span>
          </button>
        `).join('')}
      </div>
    </section>
  `).join('');
}

function renderFilterButtons(cabinet) {
  const counts = getDrawerCounts(cabinet);

  return filterDefinitions.map(({ id, label }) => `
    <button class="filter-chip ${activeFilter === id ? 'is-active' : ''}" type="button" data-inventory-filter="${id}" aria-pressed="${activeFilter === id}">
      ${label}<span>${counts[id]}</span>
    </button>
  `).join('');
}

function drawerStatusClass(drawer) {
  if (drawer.stockState === 'stocked') return 'success';
  if (drawer.stockState === 'low') return 'warning';
  return drawer.stockState === 'out' ? 'danger' : 'neutral';
}

function renderDrawerCell(drawer) {
  const isSelected = drawer.id === selectedDrawerId;
  const componentName = drawer.component ? drawer.component.name : 'Empty drawer';
  const componentDetail = drawer.component
    ? drawer.component.partNumber || 'No part number'
    : 'Ready to assign from Library';
  const quantity = drawer.component ? formatQuantity(drawer.quantity, drawer.unit.symbol) : 'No stock assigned';
  const tooltip = [
    `Drawer ${drawer.code}`,
    `State: ${drawer.stockLabel}`,
    `Component: ${componentName}`,
    componentDetail,
    `Quantity: ${quantity}`,
    `Sections: ${drawer.sectionCount}`,
    drawer.note ? `Note: ${drawer.note}` : ''
  ].filter(Boolean).join('\n');

  return `
    <button class="drawer-cell drawer-cell--${drawer.stockState} ${isSelected ? 'is-selected' : ''}" type="button" data-drawer-id="${drawer.id}" aria-pressed="${isSelected}" aria-label="${escapeHtml(tooltip.replaceAll('\n', ', '))}" title="${escapeHtml(tooltip)}">
      <span class="drawer-cell__front">
        <span class="drawer-cell__info">
          <span class="drawer-cell__identity">
            <span class="drawer-cell__plate">${drawer.code}</span>
            <span class="drawer-cell__led" aria-hidden="true"></span>
          </span>
          <span class="drawer-cell__label">${drawer.stockLabel}</span>
        </span>
        <span class="drawer-cell__handle" aria-hidden="true"></span>
      </span>
    </button>
  `;
}

function renderDrawerGrid(cabinet) {
  const drawers = getVisibleDrawers(cabinet);

  if (!drawers.length) {
    return '<p class="cabinet-grid__empty">No drawers match this filter.</p>';
  }

  return drawers.map(renderDrawerCell).join('');
}

function getVisibleDrawers(cabinet) {
  return activeFilter === 'all'
    ? cabinet.drawers
    : cabinet.drawers.filter((drawer) => drawer.stockState === activeFilter);
}

function renderDrawerTable(cabinet) {
  const drawers = getVisibleDrawers(cabinet);
  const rows = drawers.length ? drawers.map((drawer) => `
    <tr class="${drawer.id === selectedDrawerId ? 'is-selected' : ''}">
      <td><button class="drawer-table__code" type="button" data-drawer-id="${drawer.id}" aria-pressed="${drawer.id === selectedDrawerId}">${drawer.code}</button></td>
      <td><strong>${drawer.component ? escapeHtml(drawer.component.name) : 'Available drawer'}</strong><span class="table-secondary">${drawer.component ? escapeHtml(drawer.component.partNumber || 'No part number') : 'No component assigned'}</span></td>
      <td>${drawer.component ? formatQuantity(drawer.quantity, drawer.unit.symbol) : '—'}</td>
      <td><span class="status-badge status-badge--${drawerStatusClass(drawer)}">${renderStatusIcon(drawerStatusClass(drawer))}${drawer.stockLabel}</span></td>
      <td>${drawer.sectionCount}</td>
      <td>${escapeHtml(drawer.note || '—')}</td>
    </tr>
  `).join('') : '<tr><td colspan="6">No drawers match this filter.</td></tr>';

  return `<div class="drawer-table-wrap"><table class="drawer-table"><thead><tr><th>Drawer</th><th>Component</th><th>Quantity</th><th>State</th><th>Sections</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderDrawerView(cabinet) {
  if (drawerViewMode === 'table') {
    return renderDrawerTable(cabinet);
  }

  return `<div class="cabinet-grid-scroll" tabindex="0" aria-label="Scrollable cabinet drawer grid"><div class="cabinet-grid cabinet-grid--${cabinet.columns.length}" aria-label="Cabinet drawers">${renderDrawerGrid(cabinet)}</div></div>`;
}

function renderViewToggle() {
  return `<div class="drawer-view-toggle" aria-label="Drawer view mode"><button type="button" class="drawer-view-toggle__button ${drawerViewMode === 'grid' ? 'is-active' : ''}" data-drawer-view="grid" aria-pressed="${drawerViewMode === 'grid'}">${renderIcon('grid')}Grid view</button><button type="button" class="drawer-view-toggle__button ${drawerViewMode === 'table' ? 'is-active' : ''}" data-drawer-view="table" aria-pressed="${drawerViewMode === 'table'}">${renderIcon('table')}Table view</button></div>`;
}

function renderDrawerDetails(drawer, cabinet) {
  if (!drawer.component) {
    return `
      <div class="drawer-panel__heading">
        <div>
          <p class="eyebrow">Selected drawer</p>
          <h2>${drawer.code}</h2>
        </div>
        <div class="drawer-panel__heading-actions">
          <span class="status-badge status-badge--neutral">${renderStatusIcon('neutral')}Empty</span>
          <button class="button button--secondary drawer-panel__close" type="button" data-close-drawer-panel>${renderIcon('close')}Close</button>
        </div>
      </div>
      <div class="drawer-panel__empty">
        <h3>This drawer is available.</h3>
        <p>${escapeHtml(cabinet.name)} · ${drawer.code} has no component assigned.</p>
        <button class="button" type="button" data-assign-drawer-id="${drawer.id}">${renderIcon('assign')}Assign from Library</button>
      </div>
    `;
  }

  const statusClass = drawer.stockState === 'stocked' ? 'success' : drawer.stockState === 'low' ? 'warning' : 'danger';
  const component = drawer.component;
  const movementItems = drawer.movements.length ? drawer.movements.map((movement) => `
    <li>
      <span class="drawer-movement__type">${escapeHtml(movement.type)}</span>
      <span>${formatQuantity(movement.quantity, drawer.unit.symbol)} · ${formatDateTime(movement.timestamp)}</span>
    </li>
  `).join('') : '<li><span>No stock activity yet.</span></li>';

  return `
    <div class="drawer-panel__heading">
      <div>
        <p class="eyebrow">Selected drawer</p>
        <h2>${drawer.code}</h2>
      </div>
      <div class="drawer-panel__heading-actions">
        <span class="status-badge status-badge--${statusClass}">${renderStatusIcon(statusClass)}${drawer.stockLabel}</span>
        <button class="button button--secondary drawer-panel__close" type="button" data-close-drawer-panel>${renderIcon('close')}Close</button>
      </div>
    </div>
    <section class="component-summary">
      <div>
        <h3><a class="component-summary__link" href="/library/${component.id}" data-route-link>${escapeHtml(component.name)}</a></h3>
        <p>${escapeHtml(component.partNumber || 'No part number')}</p>
      </div>
    </section>
    <dl class="drawer-details">
      <div>
        <dt>Available quantity</dt>
        <dd>${formatQuantity(drawer.quantity, drawer.unit.symbol)}</dd>
      </div>
      <div>
        <dt>Location</dt>
        <dd>${escapeHtml(cabinet.name)} · ${drawer.code}</dd>
      </div>
      <div>
        <dt>Sections</dt>
        <dd>${drawer.sectionCount}</dd>
      </div>
      <div>
        <dt>Minimum stock</dt>
        <dd>${formatQuantity(component.minimumQuantity, drawer.unit.symbol)}</dd>
      </div>
    </dl>
    ${drawer.note ? `<p class="drawer-note"><strong>Note:</strong> ${escapeHtml(drawer.note)}</p>` : ''}
    <div class="drawer-actions" aria-label="Stock actions for ${drawer.code}">
      <button class="button" type="button" data-stock-operation="add">${renderIcon('plus')}Add</button>
      <button class="button button--secondary" type="button" data-stock-operation="take" ${drawer.quantity <= 0 ? 'disabled' : ''}>${renderIcon('take')}Take</button>
      <button class="button button--secondary" type="button" data-stock-operation="return">${renderIcon('return')}Return</button>
      <button class="button button--secondary" type="button" data-stock-operation="transfer" ${drawer.quantity <= 0 ? 'disabled' : ''}>${renderIcon('transfer')}Transfer</button>
    </div>
    <section class="drawer-movements" aria-labelledby="drawer-movements-title">
      <h3 id="drawer-movements-title">Recent activity</h3>
      <ul>${movementItems}</ul>
    </section>
  `;
}

function updateSelection(container) {
  const cabinet = getSelectedCabinet();
  const drawer = getSelectedDrawer();

  container.querySelectorAll('[data-drawer-id]').forEach((button) => {
    const isSelected = button.dataset.drawerId === drawer.id;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
  container.querySelectorAll('.drawer-table tbody tr').forEach((row) => {
    row.classList.toggle('is-selected', row.querySelector('[data-drawer-id]')?.dataset.drawerId === drawer.id);
  });
  container.querySelector('.drawer-panel').innerHTML = renderDrawerDetails(drawer, cabinet);
  updateDrawerPanelState(container);
}

function updateDrawerPanelState(container) {
  const panel = container.querySelector('.drawer-panel');
  const backdrop = container.querySelector('.drawer-panel-backdrop');

  panel.classList.toggle('is-open', isDrawerPanelOpen);
  backdrop.classList.toggle('is-open', isDrawerPanelOpen);
  panel.setAttribute('aria-hidden', String(!isDrawerPanelOpen));
  panel.inert = !isDrawerPanelOpen;
}

function openDrawerPanel(container) {
  isDrawerPanelOpen = true;
  updateSelection(container);
  requestAnimationFrame(() => container.querySelector('[data-close-drawer-panel]')?.focus());
}

function closeDrawerPanel(container) {
  isDrawerPanelOpen = false;
  updateDrawerPanelState(container);
}

function updateCabinetWorkspace(container) {
  const cabinet = getSelectedCabinet();
  const selectedDrawerIsVisible = activeFilter === 'all' || getSelectedDrawer().stockState === activeFilter;

  if (!selectedDrawerIsVisible) {
    const firstVisibleDrawer = cabinet.drawers.find((drawer) => drawer.stockState === activeFilter);
    selectedDrawerId = firstVisibleDrawer?.id || cabinet.drawers[0].id;
  }

  container.querySelector('.cabinet-browser__content').innerHTML = renderCabinetBrowser();
  container.querySelector('.inventory-heading__title').textContent = cabinet.name;
  container.querySelector('.inventory-heading__meta').textContent = `${cabinet.drawerCount} drawers · ${cabinet.rows} rows · ${cabinet.columns.length} columns`;
  container.querySelector('.inventory-filters').innerHTML = renderFilterButtons(cabinet);
  container.querySelector('.drawer-view-toggle-container').innerHTML = renderViewToggle();
  container.querySelector('.drawer-view').innerHTML = renderDrawerView(cabinet);
  updateSelection(container);
}

function bindInventoryEvents(container) {
  inventoryEventController = new AbortController();
  container.addEventListener('click', async (event) => {
    const drawerButton = event.target.closest('[data-drawer-id]');
    const filterButton = event.target.closest('[data-inventory-filter]');
    const viewButton = event.target.closest('[data-drawer-view]');
    const cabinetButton = event.target.closest('[data-cabinet-id]');
    const createCabinetButton = event.target.closest('[data-create-cabinet]');
    const createComponentButton = event.target.closest('[data-create-library-component]');
    const assignButton = event.target.closest('[data-assign-drawer-id]');
    const operationButton = event.target.closest('[data-stock-operation]');
    const closePanelButton = event.target.closest('[data-close-drawer-panel]');

    if (closePanelButton) {
      closeDrawerPanel(container);
      return;
    }

    if (drawerButton) {
      selectedDrawerId = drawerButton.dataset.drawerId;
      openDrawerPanel(container);
      return;
    }
    if (filterButton) {
      activeFilter = filterButton.dataset.inventoryFilter;
      updateCabinetWorkspace(container);
      return;
    }
    if (viewButton) {
      drawerViewMode = viewButton.dataset.drawerView;
      updateCabinetWorkspace(container);
      return;
    }
    if (cabinetButton) {
      selectedCabinetId = cabinetButton.dataset.cabinetId;
      selectedDrawerId = getSelectedCabinet().drawers[0].id;
      activeFilter = 'all';
      updateCabinetWorkspace(container);
      return;
    }
    if (createCabinetButton) {
      await openCreateCabinetModal({
        onCreated: async (cabinet) => {
          selectedCabinetId = cabinet.id;
          selectedDrawerId = cabinet.drawers[0]?.id;
          activeFilter = 'all';
          await renderInventoryPage(container, { preserveSelection: true });
        }
      });
      return;
    }
    if (createComponentButton) {
      await openComponentModal();
      return;
    }
    if (assignButton) {
      const drawer = getSelectedCabinet().drawers.find((item) => item.id === assignButton.dataset.assignDrawerId);
      openAssignmentModal({ cabinet: getSelectedCabinet(), drawer });
      return;
    }
    if (operationButton && !operationButton.disabled) {
      openStockOperationModal({
        operation: operationButton.dataset.stockOperation,
        cabinet: getSelectedCabinet(),
        drawer: getSelectedDrawer()
      });
    }
  }, { signal: inventoryEventController.signal });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isDrawerPanelOpen) {
      closeDrawerPanel(container);
    }
  }, { signal: inventoryEventController.signal });
}

export async function renderInventoryPage(container, { preserveSelection = false } = {}) {
  inventoryEventController?.abort();
  inventoryEventController = null;
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading cabinet…</h2><p class="state-panel__description">Preparing the drawer map.</p></section>';
  workspace = await getInventoryWorkspace();
  selectedCabinetId = preserveSelection ? selectedCabinetId : undefined;
  selectedDrawerId = preserveSelection ? selectedDrawerId : undefined;
  selectedCabinetId = selectedCabinetId || workspace.cabinets[0]?.id;
  selectedDrawerId = selectedDrawerId || getSelectedCabinet()?.drawers[0]?.id;

  if (!workspace.cabinets.length) {
    container.innerHTML = `<section class="state-panel"><h2 class="state-panel__title">${renderIcon('cabinet')}No cabinets yet</h2><p class="state-panel__description">Create a cabinet to start mapping stock locations.</p><button class="button" type="button" data-create-cabinet>${renderIcon('plus')}New cabinet</button><button class="button button--secondary" type="button" data-create-library-component>${renderIcon('component')}New Library component</button></section>`;
    bindInventoryEvents(container);
    unsubscribeFromInventory = subscribeToInventoryChanges(() => {
      unsubscribeFromInventory?.();
      unsubscribeFromInventory = undefined;
      renderInventoryPage(container, { preserveSelection: true });
    });
    return;
  }

  container.innerHTML = `
    <section class="inventory-workspace" aria-label="Cabinet inventory workspace">
      <aside class="cabinet-browser">
        <div class="cabinet-browser__title">
          <div class="cabinet-browser__actions">
            <button class="button button--secondary" type="button" data-create-cabinet>${renderIcon('cabinet')}New cabinet</button>
            <button class="button button--secondary" type="button" data-create-library-component>${renderIcon('component')}New Library component</button>
          </div>
        </div>
        <div class="cabinet-browser__content"></div>
      </aside>
      <section class="cabinet-stage" aria-labelledby="inventory-cabinet-title">
        <header class="inventory-heading">
          <div class="inventory-heading__summary">
            <h2 id="inventory-cabinet-title" class="inventory-heading__title"></h2>
            <p class="inventory-heading__meta"></p>
          </div>
          <div class="drawer-view-toggle-container"></div>
          <div class="inventory-filters" aria-label="Drawer filters"></div>
        </header>
        <div class="drawer-view"></div>
      </section>
      <button class="drawer-panel-backdrop" type="button" data-close-drawer-panel aria-label="Close drawer details"></button>
      <aside class="drawer-panel" aria-live="polite" aria-hidden="true"></aside>
    </section>
  `;

  bindInventoryEvents(container);
  updateCabinetWorkspace(container);
  unsubscribeFromInventory = subscribeToInventoryChanges(() => {
    unsubscribeFromInventory?.();
    unsubscribeFromInventory = undefined;
    renderInventoryPage(container, { preserveSelection: true });
  });
}

export function destroyInventoryPage() {
  inventoryEventController?.abort();
  inventoryEventController = null;
  unsubscribeFromInventory?.();
  unsubscribeFromInventory = undefined;
  workspace = undefined;
  selectedCabinetId = undefined;
  selectedDrawerId = undefined;
  activeFilter = 'all';
  drawerViewMode = 'grid';
  isDrawerPanelOpen = false;
}

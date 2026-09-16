import { APP_CONFIG } from '../config.js';
import { getInventoryWorkspace, subscribeToInventoryChanges } from '../services/inventory-service.js';
import { openAssignmentModal } from '../ui/assign-component-modal.js';
import { openCreateCabinetModal } from '../ui/create-cabinet-modal.js';
import { openComponentModal } from '../ui/component-modal.js';
import { openStockOperationModal } from '../ui/stock-operation-modal.js';
import { openAdjustStockModal } from '../ui/adjust-stock-modal.js';
import { openDrawerChambersModal } from '../ui/drawer-chambers-modal.js';
import { escapeHtml } from '../utils/dom.js';
import { formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon, renderStatusIcon } from '../ui/icons.js';
import { canAdjustStock, canConfigureCabinet, canManageLibrary, canManageStock, canMoveStock, readOnlyNotice } from '../services/permission-service.js';
import { renderErrorState, renderLoadingState } from '../ui/async-state.js';
import { confirmAction } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { deleteStockEntry } from '../services/inventory-service.js';

const filterDefinitions = [
  { id: 'all', label: 'All' },
  { id: 'empty', label: 'Empty' },
  { id: 'low', label: 'Low stock' },
  { id: 'out', label: 'Out of stock' }
];

const DRAWER_VIEW_STORAGE_KEY = 'inventory.drawerView';

function getSavedDrawerView() {
  try {
    const view = window.localStorage.getItem(DRAWER_VIEW_STORAGE_KEY);
    return view === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid';
  }
}

function saveDrawerView(view) {
  try {
    window.localStorage.setItem(DRAWER_VIEW_STORAGE_KEY, view);
  } catch {
    // Storage can be unavailable in private browsing; keep the current view in memory.
  }
}

let workspace;
let selectedCabinetId;
let selectedDrawerId;
let selectedChamberId;
let activeFilter = 'all';
let drawerViewMode = getSavedDrawerView();
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
  const multiChamber = drawer.isMultiChamber;
  const componentName = multiChamber
    ? `${drawer.occupiedChamberCount} of ${drawer.chamberCount} chambers in use`
    : drawer.component ? drawer.component.name : 'Empty drawer';
  const componentDetail = multiChamber
    ? drawer.chambers.filter((chamber) => chamber.component).map((chamber) => `${chamber.code}: ${chamber.component.name}`).join('\n')
    : drawer.component ? drawer.component.partNumber || 'No part number' : 'Ready to assign from Library';
  const quantity = drawer.component || multiChamber
    ? formatQuantity(drawer.quantity, drawer.unit.symbol)
    : 'No stock assigned';
  const tooltip = [
    `Drawer ${drawer.code}`,
    `State: ${drawer.stockLabel}`,
    `Component: ${componentName}`,
    componentDetail,
    `Quantity: ${quantity}`,
    `Chambers: ${drawer.chamberCount}`,
    drawer.note ? `Note: ${drawer.note}` : ''
  ].filter(Boolean).join('\n');

  return `
    <button class="drawer-cell drawer-cell--${drawer.stockState} ${isSelected ? 'is-selected' : ''}" type="button" data-drawer-id="${drawer.id}" aria-pressed="${isSelected}" aria-label="${escapeHtml(tooltip.replaceAll('\n', ', '))}">
      <span class="drawer-cell__front">
        <span class="drawer-cell__info">
          <span class="drawer-cell__identity">
            <span class="drawer-cell__plate">${drawer.code}</span>
            <span class="drawer-cell__led" aria-hidden="true"></span>
          </span>
          <span class="drawer-cell__label">${drawer.stockLabel}</span>
          ${drawer.isMultiChamber ? `<span class="drawer-cell__chambers">${drawer.occupiedChamberCount}/${drawer.chamberCount} chambers</span>` : ''}
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
  const rows = drawers.length ? drawers.map((drawer) => {
    const occupiedChambers = drawer.chambers.filter((chamber) => chamber.component);
    const componentSummary = drawer.isMultiChamber
      ? `${occupiedChambers.length} of ${drawer.chamberCount} chambers occupied`
      : drawer.component?.name || 'Available drawer';
    const componentDetail = drawer.isMultiChamber
      ? (occupiedChambers.length
        ? occupiedChambers.map((chamber) => `${escapeHtml(chamber.code)} · ${escapeHtml(chamber.component.name)}`).join(' &nbsp;•&nbsp; ')
        : 'No components assigned')
      : drawer.component?.partNumber || 'No component assigned';
    const quantity = drawer.isMultiChamber
      ? `${occupiedChambers.length} occupied`
      : drawer.component ? formatQuantity(drawer.quantity, drawer.unit.symbol) : '—';

    return `
    <tr class="${drawer.id === selectedDrawerId ? 'is-selected' : ''}" data-drawer-id="${drawer.id}">
      <td><button class="drawer-table__code" type="button" data-drawer-id="${drawer.id}" aria-pressed="${drawer.id === selectedDrawerId}">${drawer.code}</button></td>
      <td><strong>${escapeHtml(componentSummary)}</strong><span class="table-secondary drawer-table__component-detail">${componentDetail}</span></td>
      <td>${quantity}</td>
      <td><span class="status-badge status-badge--${drawerStatusClass(drawer)}">${renderStatusIcon(drawerStatusClass(drawer))}${drawer.stockLabel}</span></td>
      <td>${drawer.chamberCount}</td>
      <td>${escapeHtml(drawer.note || '—')}</td>
    </tr>
  `;
  }).join('') : '<tr><td colspan="6">No drawers match this filter.</td></tr>';

  return `<div class="drawer-table-wrap"><table class="drawer-table"><thead><tr><th>Drawer</th><th>Component</th><th>Quantity</th><th>State</th><th>Chambers</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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

/**
 * A chamber presented as a drawer, so the panel, the modals and the stock
 * services all speak one shape. `locationCode` is what the API addresses.
 */
function chamberTarget(drawer, chamber) {
  return {
    ...drawer,
    // This is a chamber-level detail view. Chambers cannot be subdivided;
    // only their parent drawer owns the chamber count.
    isChamber: true,
    isMultiChamber: false,
    code: chamber.code,
    locationCode: chamber.code,
    component: chamber.component,
    quantity: chamber.quantity,
    unit: chamber.unit,
    note: chamber.note,
    stockState: chamber.stockState,
    stockLabel: chamber.stockLabel,
    chamberId: chamber.id,
    stockEntryId: chamber.stockEntryId
  };
}

/**
 * Removing an empty stock entry frees the chamber for another component.
 * The backend refuses while stock remains, so the button only shows at zero.
 */
async function handleFreeChamber(container, button) {
  const target = getStockTarget();
  const confirmed = await confirmAction({
    title: `Free chamber ${target.code}?`,
    description: `${target.component?.name || 'This component'} holds no stock here. Removing the entry frees the chamber for a different component; the movement history stays.`,
    confirmLabel: 'Free chamber'
  });
  if (!confirmed) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');

  try {
    await deleteStockEntry(button.dataset.removeStockEntry);
    showToast('Chamber freed.');
    await renderInventoryPage(container, { preserveSelection: true });
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    showToast(error?.message || 'The chamber could not be freed.', { type: 'error' });
  }
}

/** The drawer or chamber an action applies to right now. */
function getStockTarget() {
  const drawer = getSelectedDrawer();
  if (!drawer?.isMultiChamber) return drawer;
  const chamber = drawer.chambers.find((item) => item.id === selectedChamberId);
  return chamber ? chamberTarget(drawer, chamber) : drawer;
}

/** A drawer with several chambers: the panel lists them so one can be picked. */
function renderChamberList(drawer, cabinet) {
  const rows = drawer.chambers.map((chamber) => {
    const isSelected = chamber.id === selectedChamberId;
    const statusClass = chamber.stockState === 'stocked' ? 'success'
      : chamber.stockState === 'low' ? 'warning'
        : chamber.stockState === 'out' ? 'danger' : 'neutral';
    return `
      <li>
        <button class="chamber-row ${isSelected ? 'is-selected' : ''}" type="button"
                data-chamber-id="${chamber.id}" aria-pressed="${isSelected}">
          <span class="chamber-row__code">${escapeHtml(chamber.code)}</span>
          <span class="chamber-row__component">
            <strong>${escapeHtml(chamber.component?.name || 'Empty chamber')}</strong>
            <span>${chamber.component ? formatQuantity(chamber.quantity, chamber.unit.symbol) : 'No component assigned'}</span>
          </span>
          <span class="status-badge status-badge--${statusClass}">${renderStatusIcon(statusClass)}${chamber.stockLabel}</span>
        </button>
      </li>
    `;
  }).join('');

  return `
    <div class="drawer-panel__heading">
      <div>
        <p class="eyebrow">Selected drawer</p>
        <h2>${drawer.code}</h2>
      </div>
      <div class="drawer-panel__heading-actions">
        <span class="status-badge status-badge--${drawer.stockState === 'stocked' ? 'success' : drawer.stockState === 'low' ? 'warning' : drawer.stockState === 'out' ? 'danger' : 'neutral'}">${renderStatusIcon(drawer.stockState === 'stocked' ? 'success' : drawer.stockState === 'low' ? 'warning' : drawer.stockState === 'out' ? 'danger' : 'neutral')}${drawer.stockLabel}</span>
        <button class="button button--secondary drawer-panel__close" type="button" data-close-drawer-panel>${renderIcon('close')}Close</button>
      </div>
    </div>
    <section class="chamber-list" aria-label="Chambers in drawer ${escapeHtml(drawer.code)}">
      <p class="drawer-panel__note">${escapeHtml(cabinet.name)} · ${drawer.code} is divided into ${drawer.chamberCount} chambers. Choose one to see its stock.</p>
      <ul>${rows}</ul>
      ${canConfigureCabinet() && APP_CONFIG.mode !== 'demo'
        ? `<button class="button button--secondary chamber-list__edit" type="button" data-edit-chambers>${renderIcon('edit')}Change chamber count</button>`
        : ''}
    </section>
  `;
}

function renderDrawerDetails(drawer, cabinet) {
  if (drawer.isMultiChamber) {
    const chamber = drawer.chambers.find((item) => item.id === selectedChamberId);
    if (!chamber) return renderChamberList(drawer, cabinet);
    // A chosen chamber reuses the single-drawer panel, with a way back to the list.
    return `
      <button class="back-link chamber-back" type="button" data-clear-chamber>${renderIcon('back')}All chambers in ${escapeHtml(drawer.code)}</button>
      ${renderDrawerDetails(chamberTarget(drawer, chamber), cabinet)}
    `;
  }

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
      <section class="drawer-empty-state" aria-label="Available drawer ${escapeHtml(drawer.code)}">
        <div class="drawer-empty-state__intro">
          <span class="drawer-empty-state__icon">${renderIcon('drawer')}</span>
          <div>
            <p class="eyebrow">Available storage</p>
            <h3>Ready for a component</h3>
            <p>${escapeHtml(cabinet.name)} · ${drawer.code} has no component assigned yet.</p>
          </div>
        </div>
        ${canManageStock() || (!drawer.isChamber && canConfigureCabinet() && APP_CONFIG.mode !== 'demo') ? `<div class="drawer-empty-state__actions">
          ${canManageStock() ? `<button class="button" type="button" data-assign-drawer-id="${drawer.id}">${renderIcon('assign')}Assign from Library</button>` : ''}
          ${!drawer.isChamber && canConfigureCabinet() && APP_CONFIG.mode !== 'demo'
            ? `<button class="button button--secondary" type="button" data-edit-chambers>${renderIcon('edit')}Add chambers</button>`
            : ''}
        </div>` : `<p class="drawer-empty-state__notice">${readOnlyNotice('this empty drawer')}</p>`}
      </section>
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
        <dt>Chambers</dt>
        <dd>${drawer.chamberCount}</dd>
      </div>
      <div>
        <dt>Minimum stock</dt>
        <dd>${formatQuantity(component.minimumQuantity, drawer.unit.symbol)}</dd>
      </div>
    </dl>
    ${drawer.note ? `<p class="drawer-note"><strong>Note:</strong> ${escapeHtml(drawer.note)}</p>` : ''}
    <div class="drawer-actions" aria-label="Stock actions for ${drawer.code}">
      ${canManageStock() ? `<button class="button" type="button" data-stock-operation="add">${renderIcon('plus')}Add</button>` : ''}
      ${canMoveStock() ? `<button class="button${canManageStock() ? ' button--secondary' : ''}" type="button" data-stock-operation="take" ${drawer.quantity <= 0 ? 'disabled' : ''}>${renderIcon('take')}Take</button>` : ''}
      ${canMoveStock() ? `<button class="button button--secondary" type="button" data-stock-operation="return">${renderIcon('return')}Return</button>` : ''}
      ${canManageStock() ? `<button class="button button--secondary" type="button" data-stock-operation="transfer" ${drawer.quantity <= 0 ? 'disabled' : ''}>${renderIcon('transfer')}Transfer</button>` : ''}
      ${canAdjustStock() && APP_CONFIG.mode !== 'demo' && drawer.locationCode
        ? `<button class="button button--secondary" type="button" data-adjust-stock>${renderIcon('edit')}Adjust</button>`
        : ''}
      ${canManageStock() && APP_CONFIG.mode !== 'demo' && drawer.stockEntryId && drawer.quantity <= 0
        ? `<button class="button button--danger" type="button" data-remove-stock-entry="${drawer.stockEntryId}">${renderIcon('trash')}Free chamber</button>`
        : ''}
    </div>
    ${!drawer.isChamber && canConfigureCabinet() && APP_CONFIG.mode !== 'demo'
      ? `<button class="button button--secondary" type="button" data-edit-chambers>${renderIcon('edit')}Add chambers</button>`
      : ''}
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

/** Re-renders just the panel body — used when a chamber is picked or cleared. */
function updateDrawerPanel(container) {
  const cabinet = getSelectedCabinet();
  const drawer = getSelectedDrawer();
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

    const chamberButton = event.target.closest('[data-chamber-id]');
    if (chamberButton) {
      selectedChamberId = chamberButton.dataset.chamberId;
      updateDrawerPanel(container);
      return;
    }

    if (event.target.closest('[data-clear-chamber]')) {
      selectedChamberId = undefined;
      updateDrawerPanel(container);
      return;
    }

    if (drawerButton) {
      // A different drawer starts from its chamber list again.
      if (selectedDrawerId !== drawerButton.dataset.drawerId) selectedChamberId = undefined;
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
      drawerViewMode = viewButton.dataset.drawerView === 'table' ? 'table' : 'grid';
      saveDrawerView(drawerViewMode);
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
          // The save response is cabinet configuration only; the following
          // drawer-map reload supplies the new drawers and selects its first.
          selectedDrawerId = undefined;
          selectedChamberId = undefined;
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
      const target = getStockTarget();
      const drawer = target?.id === assignButton.dataset.assignDrawerId
        ? target
        : getSelectedCabinet().drawers.find((item) => item.id === assignButton.dataset.assignDrawerId);
      openAssignmentModal({
        cabinet: getSelectedCabinet(),
        drawer,
        onAssigned: () => renderInventoryPage(container, { preserveSelection: true })
      });
      return;
    }
    const chambersButton = event.target.closest('[data-edit-chambers]');
    if (chambersButton) {
      openDrawerChambersModal({
        drawer: getSelectedDrawer(),
        onSaved: () => renderInventoryPage(container, { preserveSelection: true })
      });
      return;
    }

    const adjustButton = event.target.closest('[data-adjust-stock]');
    if (adjustButton) {
      openAdjustStockModal({
        cabinet: getSelectedCabinet(),
        drawer: getStockTarget(),
        onAdjusted: () => renderInventoryPage(container, { preserveSelection: true })
      });
      return;
    }

    const removeEntryButton = event.target.closest('[data-remove-stock-entry]');
    if (removeEntryButton) {
      await handleFreeChamber(container, removeEntryButton);
      return;
    }

    if (operationButton && !operationButton.disabled) {
      openStockOperationModal({
        operation: operationButton.dataset.stockOperation,
        cabinet: getSelectedCabinet(),
        drawer: getStockTarget(),
        onCompleted: () => renderInventoryPage(container, { preserveSelection: true })
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
  renderLoadingState(container, { title: 'Loading cabinet…', description: 'Preparing the drawer map.' });

  try {
    workspace = await getInventoryWorkspace();
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load the cabinet',
      onRetry: () => renderInventoryPage(container, { preserveSelection })
    });
    return;
  }
  selectedCabinetId = preserveSelection ? selectedCabinetId : undefined;
  selectedDrawerId = preserveSelection ? selectedDrawerId : undefined;
  selectedChamberId = preserveSelection ? selectedChamberId : undefined;
  selectedCabinetId = selectedCabinetId || workspace.cabinets[0]?.id;
  selectedDrawerId = selectedDrawerId || getSelectedCabinet()?.drawers[0]?.id;

  if (!workspace.cabinets.length) {
    container.innerHTML = `
      <section class="state-panel">
        <h2 class="state-panel__title">${renderIcon('cabinet')}No cabinet configured yet</h2>
        <p class="state-panel__description">${canConfigureCabinet()
          ? 'Set the cabinet up with its rows and columns to start mapping stock locations.'
          : 'An Admin needs to set up the cabinet before drawers and stock can be used.'}</p>
        ${canConfigureCabinet() ? `<button class="button" type="button" data-create-cabinet>${renderIcon('plus')}Set up cabinet</button>` : ''}
        ${canManageLibrary() ? `<button class="button button--secondary" type="button" data-create-library-component>${renderIcon('component')}New Library component</button>` : ''}
      </section>
    `;
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
      <section class="cabinet-stage" aria-labelledby="inventory-cabinet-title">
        <header class="inventory-heading">
          <div class="inventory-heading__summary">
            <h2 id="inventory-cabinet-title" class="inventory-heading__title"></h2>
            <p class="inventory-heading__meta"></p>
          </div>
          <div class="inventory-heading__controls">
            <div class="inventory-heading__actions">
              ${canConfigureCabinet() ? `<button class="button button--secondary" type="button" data-create-cabinet>${renderIcon('cabinet')}${APP_CONFIG.mode === 'demo' ? 'New cabinet' : 'Cabinet layout'}</button>` : ''}
              ${canManageLibrary() ? `<button class="button button--secondary" type="button" data-create-library-component>${renderIcon('component')}New Library component</button>` : ''}
            </div>
            <div class="drawer-view-toggle-container"></div>
          </div>
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
  selectedChamberId = undefined;
  activeFilter = 'all';
  drawerViewMode = getSavedDrawerView();
  isDrawerPanelOpen = false;
}

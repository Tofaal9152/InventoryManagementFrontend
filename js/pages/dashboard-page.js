import { getDashboardData } from '../services/report-service.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatDateTime, formatQuantity } from '../utils/formatters.js';

let dashboardFilter = { type: 'all', componentId: 'all' };
let dashboardController;

function renderMovementList(movements) {
  if (!movements.length) {
    return '<p class="overview-list__empty">No movements match these filters.</p>';
  }

  return movements.slice(0, 5).map((movement) => `
    <div><strong>${escapeHtml(movement.type)} · ${escapeHtml(movement.component?.name || 'Component')}</strong><span>${formatQuantity(movement.quantity, movement.component?.unit?.symbol)} · ${formatDateTime(movement.timestamp)}</span></div>
  `).join('');
}

function getFilteredMovements(movements) {
  return movements.filter((movement) => (
    (dashboardFilter.type === 'all' || movement.type === dashboardFilter.type)
    && (dashboardFilter.componentId === 'all' || movement.componentId === dashboardFilter.componentId)
  ));
}

export function destroyDashboardPage() {
  dashboardController?.abort();
  dashboardController = undefined;
}

export async function renderDashboardPage(container) {
  destroyDashboardPage();
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading dashboard…</h2></section>';
  const data = await getDashboardData();
  const cards = [
    ['Components', data.componentCount], ['Total stock', data.totalStock], ['Stock value', formatCurrency(data.totalValue)], ['Low stock', data.lowStockCount], ['Out of stock', data.outOfStockCount], ['Pending requisitions', data.pendingRequisitionCount], ['Drawer utilisation', `${data.drawerUtilisation}%`]
  ];
  const movementTypes = [...new Set(data.movements.map((movement) => movement.type))];
  const movementComponents = [...new Map(data.movements.filter((movement) => movement.component).map((movement) => [movement.componentId, movement.component])).values()];
  const filteredMovements = getFilteredMovements(data.movements);

  container.innerHTML = `
    <section class="overview-page" aria-label="Dashboard summary">
      <div class="stat-grid">${cards.map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`).join('')}</div>
      <section class="overview-card">
        <div class="overview-card__heading"><h3>Recent movements</h3><a href="/reports" data-route-link>View reports</a></div>
        <div class="dashboard-activity-tools">
          <div class="dashboard-activity-filters" aria-label="Filter recent movements">
            <label class="field"><span class="field__label">Operation</span><select class="field__control" data-dashboard-filter="type"><option value="all">All operations</option>${movementTypes.map((type) => `<option value="${escapeHtml(type)}" ${dashboardFilter.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select></label>
            <label class="field"><span class="field__label">Component</span><select class="field__control" data-dashboard-filter="componentId"><option value="all">All components</option>${movementComponents.map((component) => `<option value="${escapeHtml(component.id)}" ${dashboardFilter.componentId === component.id ? 'selected' : ''}>${escapeHtml(component.name)}</option>`).join('')}</select></label>
            <div class="dashboard-activity-filter-actions"><button class="table-action" type="button" data-dashboard-clear ${dashboardFilter.type === 'all' && dashboardFilter.componentId === 'all' ? 'disabled' : ''}>Clear filters</button></div>
          </div>
          <span class="dashboard-activity-count">${filteredMovements.length} matching movement${filteredMovements.length === 1 ? '' : 's'}</span>
        </div>
        <div class="overview-list">${renderMovementList(filteredMovements)}</div>
      </section>
    </section>
  `;

  dashboardController = new AbortController();
  container.addEventListener('change', (event) => {
    const filter = event.target.dataset.dashboardFilter;
    if (!filter) return;
    dashboardFilter = { ...dashboardFilter, [filter]: event.target.value };
    renderDashboardPage(container);
  }, { signal: dashboardController.signal });
  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-dashboard-clear]')) return;
    dashboardFilter = { type: 'all', componentId: 'all' };
    renderDashboardPage(container);
  }, { signal: dashboardController.signal });
}

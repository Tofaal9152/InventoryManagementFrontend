import { getDashboardData } from '../services/report-service.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderErrorState, renderLoadingState } from '../ui/async-state.js';

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

function renderMostConsumedComponents(components, days) {
  if (!components.length) {
    return `<p class="overview-list__empty">No stock has been taken in the last ${days} days.</p>`;
  }

  return `<ol class="dashboard-consumption-list">${components.map((component, index) => `
    <li>
      <span class="dashboard-consumption-list__rank">${index + 1}</span>
      <span class="dashboard-consumption-list__component"><strong>${escapeHtml(component.name)}</strong>${component.partNumber ? `<small>${escapeHtml(component.partNumber)}</small>` : ''}</span>
      <strong class="dashboard-consumption-list__quantity">${formatQuantity(component.quantityConsumed, component.unit?.symbol)}</strong>
    </li>
  `).join('')}</ol>`;
}

export function destroyDashboardPage() {
  dashboardController?.abort();
  dashboardController = undefined;
}

export async function renderDashboardPage(container) {
  destroyDashboardPage();
  renderLoadingState(container, { title: 'Loading dashboard…', description: 'Preparing stock summary and recent activity.' });

  let data;
  try {
    data = await getDashboardData();
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load the dashboard',
      onRetry: () => renderDashboardPage(container)
    });
    return;
  }
  const chambers = data.chamberSummary || { total: 0, inUse: data.totalStock || 0, empty: 0 };
  const cards = [
    ['Components', data.componentCount], ['Chambers', `${chambers.inUse} / ${chambers.total}`, `${chambers.empty} available`], ['Stock value', formatCurrency(data.totalValue)], ['Low stock', data.lowStockCount], ['Out of stock', data.outOfStockCount], ['Pending requisitions', data.pendingRequisitionCount], ['Drawer utilisation', `${data.drawerUtilisation}%`]
  ];
  // Prefer the role-aware recent activity returned by the dashboard endpoint.
  // The wider movement list remains a compatibility fallback for older APIs.
  const dashboardMovements = data.recentMovements?.length ? data.recentMovements : data.movements;
  const movementTypes = [...new Set(dashboardMovements.map((movement) => movement.type))];
  const movementComponents = [...new Map(dashboardMovements.filter((movement) => movement.component).map((movement) => [movement.componentId, movement.component])).values()];
  const filteredMovements = getFilteredMovements(dashboardMovements);

  container.innerHTML = `
    <section class="overview-page" aria-label="Dashboard summary">
      <div class="stat-grid">${cards.map(([label, value, hint]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ''}</article>`).join('')}</div>
      <section class="dashboard-insights" aria-label="Stock insights">
        <article class="overview-card">
          <div class="overview-card__heading"><div><h3>Most consumed components</h3><p class="dashboard-insight__hint">Net stock taken in the last ${data.consumptionDays || 30} days</p></div></div>
          ${renderMostConsumedComponents(data.mostConsumedComponents || [], data.consumptionDays || 30)}
        </article>
      </section>
      <section class="overview-card">
        <div class="overview-card__heading"><h3>Recent movements</h3><a href="/reports" data-route-link>View reports</a></div>
        <div class="dashboard-activity-tools">
          <div class="dashboard-activity-filters" aria-label="Filter recent movements">
            <label class="field"><span class="field__label">Operation</span><select class="field__control" data-dashboard-filter="type"><option value="all">All operations</option>${movementTypes.map((type) => `<option value="${escapeHtml(type)}" ${dashboardFilter.type === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select></label>
            <label class="field"><span class="field__label">Component</span><select class="field__control" data-dashboard-filter="componentId"><option value="all">All components</option>${movementComponents.map((component) => `<option value="${escapeHtml(component.id)}" ${dashboardFilter.componentId === component.id ? 'selected' : ''}>${escapeHtml(component.name)}</option>`).join('')}</select></label>
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
}

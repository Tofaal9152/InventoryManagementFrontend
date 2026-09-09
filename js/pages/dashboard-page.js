import { getDashboardData } from '../services/report-service.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatDateTime, formatQuantity } from '../utils/formatters.js';

export async function renderDashboardPage(container) {
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading dashboard…</h2></section>';
  const data = await getDashboardData();
  const cards = [
    ['Components', data.componentCount], ['Total stock', data.totalStock], ['Stock value', formatCurrency(data.totalValue)], ['Low stock', data.lowStockCount], ['Out of stock', data.outOfStockCount], ['Pending requisitions', data.pendingRequisitionCount], ['Drawer utilisation', `${data.drawerUtilisation}%`]
  ];
  const movements = data.recentMovements.map((movement) => `<div><strong>${escapeHtml(movement.type)} · ${escapeHtml(movement.component?.name || 'Component')}</strong><span>${formatQuantity(movement.quantity, movement.component?.unit?.symbol)} · ${formatDateTime(movement.timestamp)}</span></div>`).join('') || '<p>No movement yet.</p>';

  container.innerHTML = `
    <section class="overview-page" aria-label="Dashboard summary">
      <div class="stat-grid">${cards.map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`).join('')}</div>
      <section class="overview-card"><div class="overview-card__heading"><h3>Recent movements</h3><a href="/reports" data-route-link>View reports</a></div><div class="overview-list">${movements}</div></section>
    </section>
  `;
}

import { getProjectDetails, listProjectSummaries } from '../services/project-service.js';
import { openCreateProjectModal } from '../ui/project-modal.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon, renderStatusIcon } from '../ui/icons.js';

let projectsController;

export function destroyProjectsPage() {
  projectsController?.abort();
  projectsController = null;
}

export async function renderProjectsPage(container) {
  destroyProjectsPage();
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading projects…</h2></section>';
  const projects = await listProjectSummaries();
  const cards = projects.map((project) => `<a class="project-card" href="/projects/${project.id}" data-route-link><span class="status-badge status-badge--${project.status === 'Active' ? 'success' : 'neutral'}">${renderStatusIcon(project.status === 'Active' ? 'success' : 'neutral')}${project.status}</span><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.description || 'No description')}</p><div><strong>${project.takeCount}</strong><span>take operations</span></div><small>${formatCurrency(project.estimatedValue)} estimated consumption</small></a>`).join('');
  container.innerHTML = `<section class="overview-page" aria-label="Projects"><div class="page-actions"><button class="button" type="button" data-create-project>${renderIcon('plus')}New project</button></div><div class="project-grid">${cards}</div></section>`;
  projectsController = new AbortController();
  container.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-create-project]')) return;
    openCreateProjectModal({ onCreated: () => renderProjectsPage(container) });
  }, { signal: projectsController.signal });
}

export async function renderProjectDetailsPage(container, projectId) {
  destroyProjectsPage();
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading project…</h2></section>';
  const project = await getProjectDetails(projectId);
  if (!project) { container.innerHTML = `<section class="state-panel"><h2 class="state-panel__title">${renderIcon('alert')}Project not found</h2><a class="button" href="/projects" data-route-link>${renderIcon('back')}Back to Projects</a></section>`; return; }
  const consumptionRows = project.consumption.length ? project.consumption.map((item) => `<tr><td>${escapeHtml(item.component?.name || 'Component')}</td><td>${formatQuantity(item.quantity, item.component?.unit?.symbol)}</td><td>${formatCurrency(item.estimatedValue)}</td></tr>`).join('') : '<tr><td colspan="3">No components consumed for this project yet.</td></tr>';
  const historyRows = project.movements.length ? project.movements.map((item) => `<tr><td>${escapeHtml(item.note || 'Take')}</td><td>${formatQuantity(item.quantity)}</td><td>${formatDateTime(item.timestamp)}</td></tr>`).join('') : '<tr><td colspan="3">No project activity yet.</td></tr>';
  const total = project.consumption.reduce((sum, item) => sum + item.estimatedValue, 0);
  container.innerHTML = `<section class="component-details-page"><a class="back-link" href="/projects" data-route-link>${renderIcon('back')}Back to Projects</a><header class="overview-header"><div><p class="eyebrow">${project.status}</p><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.description || 'No description')}</p></div><div class="project-total"><strong>${formatCurrency(total)}</strong><span>estimated consumption</span></div></header><section class="detail-card detail-card--wide"><h3>Components consumed</h3><div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Component</th><th>Quantity</th><th>Estimated value</th></tr></thead><tbody>${consumptionRows}</tbody></table></div></section><section class="detail-card detail-card--wide"><h3>Project activity</h3><div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Note</th><th>Quantity</th><th>When</th></tr></thead><tbody>${historyRows}</tbody></table></div></section></section>`;
}

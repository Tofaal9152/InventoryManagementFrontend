import { deleteProject, getProjectDetails, listProjectSummaries, setProjectClosed } from '../services/project-service.js';
import { openCreateProjectModal, openEditProjectModal } from '../ui/project-modal.js';
import { escapeHtml } from '../utils/dom.js';
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon, renderStatusIcon } from '../ui/icons.js';
import { canManageProjects } from '../services/permission-service.js';
import { renderErrorState, renderLoadingState } from '../ui/async-state.js';
import { confirmAction } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { APP_CONFIG } from '../config.js';

let projectsController;

function requisitionStatusClass(status) {
  return status === 'Received' ? 'success' : status === 'Rejected' || status === 'Cancelled' ? 'danger' : status === 'Pending' ? 'warning' : 'neutral';
}

export function destroyProjectsPage() {
  projectsController?.abort();
  projectsController = null;
}

export async function renderProjectsPage(container) {
  destroyProjectsPage();
  renderLoadingState(container, { title: 'Loading projects…', description: 'Preparing project records.' });

  let projects;
  try {
    projects = await listProjectSummaries();
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load projects',
      onRetry: () => renderProjectsPage(container)
    });
    return;
  }
  const canManage = canManageProjects() && APP_CONFIG.mode !== 'demo';
  const cards = projects.map((project) => `<article class="project-card">
    <div class="project-card__header">
      <span class="status-badge status-badge--${project.status === 'Active' ? 'success' : 'neutral'}">${renderStatusIcon(project.status === 'Active' ? 'success' : 'neutral')}${project.status}</span>
      ${canManage ? `<div class="project-card__actions"><button class="table-action" type="button" data-edit-project="${escapeHtml(project.id)}">${renderIcon('edit')}Edit</button><button class="table-action table-action--danger" type="button" data-delete-project="${escapeHtml(project.id)}">${renderIcon('trash')}Delete</button></div>` : ''}
    </div>
    <a class="project-card__body" href="/projects/${project.id}" data-route-link aria-label="Open ${escapeHtml(project.name)} project">
      <h3>${escapeHtml(project.name)}</h3>
      <p>${escapeHtml(project.description || 'No description added yet.')}</p>
      <div class="project-card__metrics"><span><strong>${project.takeCount}</strong> stock take${project.takeCount === 1 ? '' : 's'}</span><span><strong>${formatCurrency(project.estimatedValue)}</strong> estimated use</span></div>
    </a>
  </article>`).join('');
  container.innerHTML = `<section class="overview-page" aria-label="Projects"><div class="page-actions">${canManageProjects() ? `<button class="button" type="button" data-create-project>${renderIcon('plus')}New project</button>` : ''}</div><div class="project-grid">${cards}</div></section>`;
  projectsController = new AbortController();
  container.addEventListener('click', async (event) => {
    if (event.target.closest('[data-create-project]')) {
      openCreateProjectModal({ onCreated: () => renderProjectsPage(container) });
      return;
    }

    const editButton = event.target.closest('[data-edit-project]');
    if (editButton) {
      const project = projects.find((item) => String(item.id) === editButton.dataset.editProject);
      if (project) openEditProjectModal({ project, onSaved: () => renderProjectsPage(container) });
      return;
    }

    const deleteButton = event.target.closest('[data-delete-project]');
    if (deleteButton) {
      const project = projects.find((item) => String(item.id) === deleteButton.dataset.deleteProject);
      if (project) await handleProjectDelete(container, project, deleteButton);
    }
  }, { signal: projectsController.signal });
}

async function handleProjectStatusToggle(container, project, button) {
  const closing = button.dataset.closed !== 'true';
  const confirmed = await confirmAction({
    title: closing ? `Close ${project.name}?` : `Reopen ${project.name}?`,
    description: closing
      ? 'Stock can no longer be taken against this project. Its consumption history and estimated value stay.'
      : 'The project becomes selectable again when taking stock.',
    confirmLabel: closing ? 'Close project' : 'Reopen project',
    tone: closing ? 'danger' : 'default'
  });
  if (!confirmed) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');

  try {
    await setProjectClosed(project.id, closing);
    showToast(closing ? 'Project closed.' : 'Project reopened.');
    await renderProjectDetailsPage(container, project.id);
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    showToast(error?.message || 'The project could not be updated.', { type: 'error' });
  }
}

async function handleProjectDelete(container, project, button) {
  const confirmed = await confirmAction({
    title: `Delete ${project.name}?`,
    description: 'This permanently deletes the project only when it has no linked stock movements or requisitions. Otherwise, close it to keep its history.',
    confirmLabel: 'Delete project',
    tone: 'danger'
  });
  if (!confirmed) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await deleteProject(project.id);
    showToast('Project deleted.');
    await renderProjectsPage(container);
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    showToast(error?.message || 'This project cannot be deleted while it is referenced. Close it instead.', { type: 'error' });
  }
}

export async function renderProjectDetailsPage(container, projectId) {
  destroyProjectsPage();
  renderLoadingState(container, { title: 'Loading project…', description: 'Preparing project details.' });

  let project;
  try {
    project = await getProjectDetails(projectId);
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load this project',
      onRetry: () => renderProjectDetailsPage(container, projectId)
    });
    return;
  }
  if (!project) { container.innerHTML = `<section class="state-panel"><h2 class="state-panel__title">${renderIcon('alert')}Project not found</h2><a class="button" href="/projects" data-route-link>${renderIcon('back')}Back to Projects</a></section>`; return; }
  const consumptionRows = project.consumption.length ? project.consumption.map((item) => `<tr><td><strong>${escapeHtml(item.component?.name || 'Component')}</strong>${item.component?.partNumber ? `<span class="table-secondary">${escapeHtml(item.component.partNumber)}</span>` : ''}</td><td>${formatQuantity(item.quantityTaken, item.component?.unit?.symbol)}</td><td>${formatQuantity(item.quantityReturned, item.component?.unit?.symbol)}</td><td>${formatQuantity(item.quantity, item.component?.unit?.symbol)}</td><td>${formatCurrency(item.estimatedValue)}</td></tr>`).join('') : '<tr><td colspan="5">No components consumed for this project yet.</td></tr>';
  const requisitionRows = project.requisitions.length ? project.requisitions.map((item) => `<tr><td><a class="component-name-link" href="/requisitions/${item.id}" data-route-link>${escapeHtml(item.reference || `Request ${item.id}`)}</a></td><td><strong>${escapeHtml(item.component?.name || item.partName || 'Requested part')}</strong>${item.component?.partNumber ? `<span class="table-secondary">${escapeHtml(item.component.partNumber)}</span>` : ''}${item.reason ? `<span class="table-secondary">${escapeHtml(item.reason)}</span>` : ''}</td><td>${formatQuantity(item.quantity, item.component?.unit?.symbol)}</td><td><span class="status-badge status-badge--${requisitionStatusClass(item.status)}">${renderStatusIcon(requisitionStatusClass(item.status))}${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.requestedBy?.name || '—')}</td><td>${formatDate(item.neededBy)}</td></tr>`).join('') : '<tr><td colspan="6">No requisitions are linked to this project.</td></tr>';
  const historyRows = project.movements.length ? project.movements.map((item) => `<tr><td>${escapeHtml(item.note || 'Take')}</td><td>${formatQuantity(item.quantity)}</td><td>${formatDateTime(item.timestamp)}</td></tr>`).join('') : '<tr><td colspan="3">No project activity yet.</td></tr>';
  const total = project.estimatedValue;
  container.innerHTML = `<section class="component-details-page"><a class="back-link" href="/projects" data-route-link>${renderIcon('back')}Back to Projects</a><header class="overview-header"><div><p class="eyebrow">${project.status}</p><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.description || 'No description')}</p></div><div class="project-total"><strong>${formatCurrency(total)}</strong><span>estimated consumption</span>${
  canManageProjects() && APP_CONFIG.mode !== 'demo'
    ? `<div class="project-total__actions"><button class="button button--secondary" type="button" data-edit-project>${renderIcon('edit')}Edit</button><button class="button button--secondary" type="button" data-toggle-project-status data-closed="${project.isClosed}">${renderIcon(project.isClosed ? 'refresh' : 'close')}${project.isClosed ? 'Reopen project' : 'Close project'}</button><button class="button button--danger" type="button" data-delete-project>${renderIcon('trash')}Delete</button></div>`
    : ''
}</div></header><section class="detail-card detail-card--wide"><h3>Project information</h3><dl class="detail-list"><div><dt>Created by</dt><dd>${escapeHtml(project.createdBy || '—')}</dd></div><div><dt>Created</dt><dd>${formatDateTime(project.createdOn)}</dd></div><div><dt>Last updated</dt><dd>${formatDateTime(project.updatedOn)}</dd></div><div><dt>Linked requisitions</dt><dd>${project.requisitions.length}</dd></div></dl></section><section class="detail-card detail-card--wide"><h3>Components consumed</h3><div class="library-table-wrap"><table class="library-table library-table--compact project-consumption-table"><thead><tr><th>Component</th><th>Taken</th><th>Returned</th><th>Net used</th><th>Estimated value</th></tr></thead><tbody>${consumptionRows}</tbody></table></div></section><section class="detail-card detail-card--wide"><h3>Linked requisitions</h3><div class="library-table-wrap"><table class="library-table library-table--compact project-requisition-table"><thead><tr><th>Request</th><th>Component / reason</th><th>Quantity</th><th>Status</th><th>Requested by</th><th>Needed by</th></tr></thead><tbody>${requisitionRows}</tbody></table></div></section><section class="detail-card detail-card--wide"><h3>Project activity</h3><div class="library-table-wrap"><table class="library-table library-table--compact"><thead><tr><th>Note</th><th>Quantity</th><th>When</th></tr></thead><tbody>${historyRows}</tbody></table></div></section></section>`;

  projectsController = new AbortController();
  container.addEventListener('click', async (event) => {
    if (event.target.closest('[data-edit-project]')) {
      openEditProjectModal({ project, onSaved: () => renderProjectDetailsPage(container, project.id) });
      return;
    }
    const toggle = event.target.closest('[data-toggle-project-status]');
    if (toggle) {
      await handleProjectStatusToggle(container, project, toggle);
      return;
    }
    const deleteButton = event.target.closest('[data-delete-project]');
    if (deleteButton) await handleProjectDelete(container, project, deleteButton);
  }, { signal: projectsController.signal });
}

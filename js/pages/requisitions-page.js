import {
  RequisitionValidationError,
  createRequisition,
  getAllowedRequisitionStatuses,
  getRequisition,
  getRequisitionReferenceData,
  listRequisitions,
  updateRequisitionStatus
} from '../services/requisition-service.js';
import { clearFormErrors, setFieldError } from '../ui/form-fields.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../utils/dom.js';
import { formatDate, formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon, renderStatusIcon } from '../ui/icons.js';

let requisitionController;
let requisitionFilter = 'all';

function statusClass(status) {
  return status === 'Received' ? 'success' : status === 'Rejected' || status === 'Cancelled' ? 'danger' : status === 'Pending' ? 'warning' : 'neutral';
}

function requisitionName(requisition) {
  return requisition.component?.name || requisition.freeTextPartName || 'Requested part';
}

function selectOptions(items, selectedId, emptyLabel, label = (item) => item.name) {
  return `<option value="">${emptyLabel}</option>${items.map((item) => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('')}`;
}

async function openRequisitionForm(container) {
  const references = await getRequisitionReferenceData();
  const form = document.createElement('form');
  form.noValidate = true;
  form.innerHTML = `
    <div class="requisition-form-grid">
      <div class="field field--wide"><label class="field__label" for="requisition-component">Library component <span aria-hidden="true">(optional for free text)</span></label><select class="field__control" id="requisition-component" name="componentId" aria-describedby="requisition-component-error">${selectOptions(references.components, '', 'Choose a Library component')}</select><span class="field__error" id="requisition-component-error"></span></div>
      <div class="field field--wide"><label class="field__label" for="requisition-free-text">Requested part name <span aria-hidden="true">(if not in Library)</span></label><input class="field__control" id="requisition-free-text" name="freeTextPartName" aria-describedby="requisition-free-text-error"><span class="field__error" id="requisition-free-text-error"></span></div>
      <div class="field"><label class="field__label" for="requisition-quantity">Quantity</label><input class="field__control" id="requisition-quantity" name="quantity" type="number" min="0.001" step="0.001" aria-describedby="requisition-quantity-error" required><span class="field__error" id="requisition-quantity-error"></span></div>
      <div class="field"><label class="field__label" for="requisition-unit">Unit</label><select class="field__control" id="requisition-unit" name="unitId" aria-describedby="requisition-unit-error" required>${selectOptions(references.units, '', 'Choose a unit', (unit) => `${unit.name} (${unit.symbol})`)}</select><span class="field__error" id="requisition-unit-error"></span></div>
      <div class="field"><label class="field__label" for="requisition-project">Project <span aria-hidden="true">(optional)</span></label><select class="field__control" id="requisition-project" name="projectId" aria-describedby="requisition-project-error">${selectOptions(references.projects, '', 'No project')}</select><span class="field__error" id="requisition-project-error"></span></div>
      <div class="field"><label class="field__label" for="requisition-needed-by">Needed by <span aria-hidden="true">(optional)</span></label><input class="field__control" id="requisition-needed-by" name="neededBy" type="date" aria-describedby="requisition-needed-by-error"><span class="field__error" id="requisition-needed-by-error"></span></div>
      <div class="field field--wide"><label class="field__label" for="requisition-note">Reason / note</label><textarea class="field__control" id="requisition-note" name="note" rows="3"></textarea></div>
    </div>
    <div class="dialog__actions"><button class="button button--secondary" type="button" data-requisition-cancel>${renderIcon('close')}Cancel</button><button class="button" type="submit">${renderIcon('requisition-raise')}Raise requisition</button></div>`;
  let modal;
  modal = openModal({ title: 'Raise requisition', description: 'Request a Library component or a part that is not yet in the catalog.', content: form });
  form.querySelector('[data-requisition-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.elements.componentId.addEventListener('change', () => {
    const component = references.components.find((item) => item.id === form.elements.componentId.value);
    if (component) form.elements.unitId.value = component.unitId;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      await createRequisition(Object.fromEntries(new FormData(form)));
      modal.close('saved');
      showToast('Requisition raised.');
      await renderRequisitionsPage(container);
    } catch (error) {
      if (error instanceof RequisitionValidationError) Object.entries(error.errors).forEach(([field, message]) => {
        const control = form.elements.namedItem(field);
        if (control) setFieldError(control, message);
      }); else showToast('The requisition could not be saved.', { type: 'error' });
    } finally { submitButton.disabled = false; }
  });
}

async function openStatusForm(container, requisition) {
  const allowedStatuses = getAllowedRequisitionStatuses(requisition.status);
  const form = document.createElement('form');
  form.noValidate = true;
  form.innerHTML = `<div class="field"><label class="field__label" for="requisition-status">New status</label><select class="field__control" id="requisition-status" name="status">${allowedStatuses.map((status) => `<option value="${status}">${status}</option>`).join('')}</select></div><div class="field"><label class="field__label" for="requisition-status-note">Note <span aria-hidden="true">(optional)</span></label><textarea class="field__control" id="requisition-status-note" name="note" rows="3"></textarea></div><div class="dialog__actions"><button class="button button--secondary" type="button" data-status-cancel>${renderIcon('close')}Cancel</button><button class="button" type="submit">${renderIcon('status')}Update status</button></div>`;
  let modal;
  modal = openModal({ title: `Update ${requisition.id}`, description: `Current status: ${requisition.status}`, content: form });
  form.querySelector('[data-status-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      await updateRequisitionStatus({ requisitionId: requisition.id, ...Object.fromEntries(new FormData(form)) });
      modal.close('saved');
      showToast('Requisition status updated.');
      await renderRequisitionDetailsPage(container, requisition.id);
    } catch (error) { showToast(error.message || 'The status could not be updated.', { type: 'error' }); } finally { submitButton.disabled = false; }
  });
}

export function destroyRequisitionsPage() {
  requisitionController?.abort();
  requisitionController = null;
}

export async function renderRequisitionsPage(container) {
  destroyRequisitionsPage();
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading requisitions…</h2></section>';
  const requisitions = await listRequisitions({ status: requisitionFilter });
  const rows = requisitions.length ? requisitions.map((requisition) => `<tr><td><a class="component-name-link" href="/requisitions/${requisition.id}" data-route-link>${requisition.id}</a></td><td>${escapeHtml(requisitionName(requisition))}</td><td>${formatQuantity(requisition.quantity, requisition.unit?.symbol)}</td><td>${escapeHtml(requisition.requester?.name || '—')}</td><td>${escapeHtml(requisition.project?.name || '—')}</td><td><span class="status-badge status-badge--${statusClass(requisition.status)}">${renderStatusIcon(statusClass(requisition.status))}${requisition.status}</span></td><td>${formatDate(requisition.createdOn)}</td><td>${formatDate(requisition.neededBy)}</td><td>${requisition.daysInStatus} day${requisition.daysInStatus === 1 ? '' : 's'}</td></tr>`).join('') : '<tr><td colspan="9">No requisitions match this filter.</td></tr>';
  container.innerHTML = `<section class="requisitions-page" aria-label="Requisitions"><section class="requisition-toolbar"><label class="field"><span class="visually-hidden">Filter requisitions by status</span><select class="field__control" data-requisition-filter><option value="all">All statuses</option>${['Pending', 'Approved', 'Ordered', 'Received', 'Rejected', 'Cancelled'].map((status) => `<option value="${status}" ${requisitionFilter === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label><button class="button" type="button" data-create-requisition>${renderIcon('plus')}Raise requisition</button></section><div class="library-table-wrap"><table class="library-table"><thead><tr><th>Request ID</th><th>Component / part</th><th>Quantity</th><th>Requested by</th><th>Project</th><th>Status</th><th>Created</th><th>Needed by</th><th>Age</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  requisitionController = new AbortController();
  container.addEventListener('click', async (event) => { if (event.target.closest('[data-create-requisition]')) await openRequisitionForm(container); }, { signal: requisitionController.signal });
  container.addEventListener('change', async (event) => { if (event.target.matches('[data-requisition-filter]')) { requisitionFilter = event.target.value; await renderRequisitionsPage(container); } }, { signal: requisitionController.signal });
}

export async function renderRequisitionDetailsPage(container, requisitionId) {
  destroyRequisitionsPage();
  container.innerHTML = '<section class="state-panel"><h2 class="state-panel__title">Loading requisition…</h2></section>';
  const requisition = await getRequisition(requisitionId);
  if (!requisition) { container.innerHTML = `<section class="state-panel"><h2 class="state-panel__title">${renderIcon('alert')}Requisition not found</h2><a class="button" href="/requisitions" data-route-link>${renderIcon('back')}Back to Requisitions</a></section>`; return; }
  const history = requisition.statusHistory.slice().reverse().map((event) => `<li><strong>${escapeHtml(event.toStatus)}</strong><span>${escapeHtml(event.note || 'No note')} · ${formatDateTime(event.timestamp)}</span></li>`).join('');
  const canUpdate = getAllowedRequisitionStatuses(requisition.status).length > 0;
  container.innerHTML = `<section class="requisition-details-page" aria-labelledby="requisition-title"><a class="back-link" href="/requisitions" data-route-link>${renderIcon('back')}Back to Requisitions</a><header class="overview-header"><div><p class="eyebrow">${requisition.id}</p><h2 id="requisition-title">${escapeHtml(requisitionName(requisition))}</h2><p>${formatQuantity(requisition.quantity, requisition.unit?.symbol)} · ${escapeHtml(requisition.project?.name || 'No project')}</p></div><div class="requisition-detail-actions"><span class="status-badge status-badge--${statusClass(requisition.status)}">${renderStatusIcon(statusClass(requisition.status))}${requisition.status}</span>${canUpdate ? `<button class="button" type="button" data-update-requisition-status>${renderIcon('status')}Update status</button>` : ''}</div></header><div class="requisition-details-grid"><section class="detail-card"><h3>Request details</h3><dl class="detail-list"><div><dt>Requested by</dt><dd>${escapeHtml(requisition.requester?.name || '—')}</dd></div><div><dt>Created</dt><dd>${formatDateTime(requisition.createdOn)}</dd></div><div><dt>Needed by</dt><dd>${formatDate(requisition.neededBy)}</dd></div><div><dt>Note</dt><dd>${escapeHtml(requisition.note || 'No note')}</dd></div></dl></section><section class="detail-card"><h3>Status history</h3><ol class="status-history">${history}</ol></section></div></section>`;
  requisitionController = new AbortController();
  container.addEventListener('click', async (event) => { if (event.target.closest('[data-update-requisition-status]')) await openStatusForm(container, requisition); }, { signal: requisitionController.signal });
}

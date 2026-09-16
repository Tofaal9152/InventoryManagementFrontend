import {
  RequisitionValidationError,
  createRequisition,
  getAllowedRequisitionStatuses,
  getRequisition,
  getRequisitionReferenceData,
  listRequisitions,
  updateRequisitionStatus
} from '../services/requisition-service.js';
import { clearFieldErrorOnChange, clearFormErrors, setFieldError } from '../ui/form-fields.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { escapeHtml } from '../utils/dom.js';
import { formatDate, formatDateTime, formatQuantity } from '../utils/formatters.js';
import { renderIcon, renderStatusIcon } from '../ui/icons.js';
import { canDecideRequisitions, canRaiseRequisitions } from '../services/permission-service.js';
import { APP_CONFIG } from '../config.js';
import { confirmAction } from '../ui/confirm-dialog.js';
import { renderErrorState, renderLoadingState } from '../ui/async-state.js';
import { openReceiveRequisitionModal } from '../ui/receive-requisition-modal.js';
import { getCurrentUser } from '../api/tokens.js';

let requisitionController;
let requisitionFilter = 'all';

function statusClass(status) {
  return status === 'Received' ? 'success' : status === 'Rejected' || status === 'Cancelled' ? 'danger' : status === 'Pending' ? 'warning' : 'neutral';
}

function requisitionName(requisition) {
  return requisition.component?.name || requisition.freeTextPartName || 'Requested part';
}

/** The API only permits a requester to cancel their own Pending requisition. */
function canCancelOwnPendingRequisition(requisition) {
  const currentUser = getCurrentUser();
  const currentUserId = String(currentUser?.id ?? currentUser?.pk ?? '');
  return Boolean(currentUserId)
    && requisition.status === 'Pending'
    && String(requisition.requester?.id ?? '') === currentUserId;
}

function renderRequisitionListActions(requisition) {
  const detailLink = `<a class="table-action" href="/requisitions/${requisition.id}" data-route-link>${renderIcon('view')}View</a>`;
  if (canDecideRequisitions()) {
    return `<td class="table-actions"><a class="table-action" href="/requisitions/${requisition.id}" data-route-link>${renderIcon('status')}Manage</a></td>`;
  }
  if (canCancelOwnPendingRequisition(requisition)) {
    return `<td class="table-actions">${detailLink}<button class="table-action" type="button" data-cancel-requisition="${escapeHtml(requisition.id)}">${renderIcon('close')}Cancel</button></td>`;
  }
  return `<td class="table-actions">${detailLink}</td>`;
}

async function cancelOwnPendingRequisition(container, requisition, button) {
  const confirmed = await confirmAction({
    title: `Cancel ${requisition.reference || requisition.id}?`,
    description: 'This cancels the pending requisition. It remains in the history and cannot be edited or deleted.',
    confirmLabel: 'Cancel requisition',
    tone: 'danger'
  });
  if (!confirmed) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    await updateRequisitionStatus({ requisitionId: requisition.id, status: 'Cancelled' });
    showToast('Requisition cancelled.');
    await renderRequisitionsPage(container);
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    showToast(error?.message || 'The requisition could not be cancelled.', { type: 'error' });
  }
}

function selectOptions(items, selectedId, emptyLabel, label = (item) => item.name) {
  return `<option value="">${emptyLabel}</option>${items.map((item) => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('')}`;
}

async function openRequisitionForm(container) {
  const references = await getRequisitionReferenceData();
  const form = document.createElement('form');
  form.className = 'requisition-form';
  form.noValidate = true;
  form.innerHTML = `
    <p class="requisition-form__required-note"><span aria-hidden="true">*</span> Required to submit a stock request.</p>
    <fieldset class="requisition-form__section">
      <legend><span class="requisition-form__step" aria-hidden="true">1</span> Part requested</legend>
      <p class="requisition-form__section-hint">Choose one route: select a part that already exists in the Library, or name a new part for procurement.</p>
      <div class="requisition-form-grid">
        <div class="field field--wide"><label class="field__label" for="requisition-component">Library component</label><select class="field__control" id="requisition-component" name="componentId" aria-describedby="requisition-component-error">${selectOptions(references.components, '', 'Choose a Library component')}</select><span class="field__hint">Choosing a component fills its usual unit automatically.</span><span class="field__error" id="requisition-component-error"></span></div>
        <div class="field field--wide"><label class="field__label" for="requisition-free-text">Or request a new part</label><input class="field__control" id="requisition-free-text" name="freeTextPartName" placeholder="e.g. 12 V panel-mount socket" autocomplete="off" aria-describedby="requisition-free-text-error"><span class="field__hint">Use this only when the part does not exist in the Library yet.</span><span class="field__error" id="requisition-free-text-error"></span></div>
      </div>
      <p class="requisition-form__selection" data-requisition-selection aria-live="polite">Choose a Library component or enter a new part name.</p>
    </fieldset>
    <fieldset class="requisition-form__section">
      <legend><span class="requisition-form__step" aria-hidden="true">2</span> Quantity and timing</legend>
      <div class="requisition-form-grid">
        <div class="field"><label class="field__label" for="requisition-quantity">Quantity <span class="requisition-form__required" aria-hidden="true">*</span></label><input class="field__control" id="requisition-quantity" name="quantity" type="number" min="0.001" step="0.001" inputmode="decimal" placeholder="0" aria-describedby="requisition-quantity-error" required><span class="field__error" id="requisition-quantity-error"></span></div>
        <div class="field"><label class="field__label" for="requisition-unit">Unit <span class="requisition-form__required" aria-hidden="true">*</span></label><select class="field__control" id="requisition-unit" name="unitId" aria-describedby="requisition-unit-error" required>${selectOptions(references.units, '', 'Choose a unit', (unit) => `${unit.name} (${unit.symbol})`)}</select><span class="field__hint" data-requisition-unit-hint>Choose the unit for this request.</span><span class="field__error" id="requisition-unit-error"></span></div>
        <div class="field"><label class="field__label" for="requisition-project">Project <span aria-hidden="true">(optional)</span></label><select class="field__control" id="requisition-project" name="projectId" aria-describedby="requisition-project-error">${selectOptions(references.projects, '', 'No project')}</select><span class="field__hint">Tags consumed stock to a project.</span><span class="field__error" id="requisition-project-error"></span></div>
        <div class="field"><label class="field__label" for="requisition-needed-by">Needed by <span aria-hidden="true">(optional)</span></label><input class="field__control" id="requisition-needed-by" name="neededBy" type="date" aria-describedby="requisition-needed-by-error"><span class="field__hint">Helps prioritise procurement.</span><span class="field__error" id="requisition-needed-by-error"></span></div>
      </div>
    </fieldset>
    <fieldset class="requisition-form__section">
      <legend><span class="requisition-form__step" aria-hidden="true">3</span> Reason <span aria-hidden="true">(optional)</span></legend>
      <div class="field"><label class="field__label" for="requisition-note">Reason / note</label><textarea class="field__control" id="requisition-note" name="note" rows="3" placeholder="What work is this needed for, or what specification matters?" aria-describedby="requisition-note-error"></textarea><span class="field__error" id="requisition-note-error"></span></div>
    </fieldset>
    <div class="dialog__actions"><button class="button button--secondary" type="button" data-requisition-cancel>${renderIcon('close')}Cancel</button><button class="button" type="submit">${renderIcon('requisition-raise')}<span data-requisition-submit-label>Raise requisition</span></button></div>`;
  let modal;
  modal = openModal({ title: 'Raise requisition', description: 'Request a Library component or a part that is not yet in the catalog.', content: form });
  form.querySelector('[data-requisition-cancel]').addEventListener('click', () => modal.close('cancelled'));
  clearFieldErrorOnChange(form);
  const componentInput = form.elements.componentId;
  const freeTextInput = form.elements.freeTextPartName;
  const unitInput = form.elements.unitId;
  const quantityInput = form.elements.quantity;
  const selectionHint = form.querySelector('[data-requisition-selection]');
  const unitHint = form.querySelector('[data-requisition-unit-hint]');

  const updateUnitGuidance = () => {
    const unit = references.units.find((item) => item.id === unitInput.value);
    if (!unit) {
      quantityInput.step = '0.001';
      unitHint.textContent = 'Choose the unit for this request.';
      return;
    }
    const allowsFraction = unit.allowsFraction ?? unit.allowFraction === true;
    quantityInput.step = allowsFraction ? '0.001' : '1';
    unitHint.textContent = `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ''}: ${allowsFraction ? 'decimal quantities are allowed.' : 'whole quantities only.'}`;
  };

  const chooseComponent = () => {
    const component = references.components.find((item) => item.id === form.elements.componentId.value);
    if (!component) {
      freeTextInput.disabled = false;
      selectionHint.textContent = freeTextInput.value.trim() ? 'New part request selected.' : 'Choose a Library component or enter a new part name.';
      updateUnitGuidance();
      return;
    }
    freeTextInput.value = '';
    freeTextInput.disabled = true;
    unitInput.value = component.unitId;
    selectionHint.textContent = `${component.name} will be requested from the Library catalog.`;
    updateUnitGuidance();
  };

  componentInput.addEventListener('change', chooseComponent);
  freeTextInput.addEventListener('input', () => {
    componentInput.disabled = Boolean(freeTextInput.value.trim());
    selectionHint.textContent = freeTextInput.value.trim() ? 'New part request selected.' : 'Choose a Library component or enter a new part name.';
  });
  unitInput.addEventListener('change', updateUnitGuidance);
  updateUnitGuidance();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const submitButton = form.querySelector('[type="submit"]');
    const submitLabel = form.querySelector('[data-requisition-submit-label]');
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (submitLabel) submitLabel.textContent = 'Raising…';
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
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      if (submitLabel) submitLabel.textContent = 'Raise requisition';
    }
  });
}

async function openStatusForm(container, requisition) {
  // In live mode the server already said which moves this user may make.
  const allowedStatuses = APP_CONFIG.mode === 'demo'
    ? getAllowedRequisitionStatuses(requisition.status)
    : getAllowedRequisitionStatuses(requisition);
  // RECEIVED is not a normal status-only transition: the server requires a
  // destination chamber and quantity so it can create the stock movement.
  const statusOnlyOptions = allowedStatuses.filter((status) => status !== 'Received');
  if (!statusOnlyOptions.length) return;
  const defaultStatus = requisition.status === 'Approved' && statusOnlyOptions.includes('Ordered')
    ? 'Ordered'
    : statusOnlyOptions[0];
  const form = document.createElement('form');
  form.noValidate = true;
  form.innerHTML = `<div class="field"><label class="field__label" for="requisition-status">New status</label><select class="field__control" id="requisition-status" name="status">${statusOnlyOptions.map((status) => `<option value="${status}" ${status === defaultStatus ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div class="field"><label class="field__label" for="requisition-status-note">Note <span aria-hidden="true">(optional)</span></label><textarea class="field__control" id="requisition-status-note" name="note" rows="3"></textarea></div><div class="dialog__actions"><button class="button button--secondary" type="button" data-status-cancel>${renderIcon('close')}Cancel</button><button class="button" type="submit">${renderIcon('status')}Update status</button></div>`;
  let modal;
  modal = openModal({ title: `Update ${requisition.reference || requisition.id}`, description: `Current status: ${requisition.status}`, content: form });
  form.querySelector('[data-status-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    const values = Object.fromEntries(new FormData(form));
    const confirmed = await confirmAction({
      title: `Move ${requisition.reference || requisition.id} to ${values.status}?`,
      description: values.status === 'Cancelled' || values.status === 'Rejected'
        ? 'This ends the requisition. The history and your note are kept.'
        : 'The change is recorded in the status history with your note.',
      confirmLabel: `Set ${values.status}`,
      tone: values.status === 'Cancelled' || values.status === 'Rejected' ? 'danger' : 'default'
    });
    if (!confirmed) {
      submitButton.disabled = false;
      return;
    }

    try {
      await updateRequisitionStatus({ requisitionId: requisition.id, ...values });
      modal.close('saved');
      showToast('Requisition status updated.');
      await renderRequisitionDetailsPage(container, requisition.id);
    } catch (error) {
      const message = error instanceof RequisitionValidationError
        ? error.errors.status || error.message
        : error.message || 'The status could not be updated.';
      showToast(message, { type: 'error' });
      submitButton.disabled = false;
    }
  });
}

export function destroyRequisitionsPage() {
  requisitionController?.abort();
  requisitionController = null;
}

export async function renderRequisitionsPage(container) {
  destroyRequisitionsPage();
  renderLoadingState(container, { title: 'Loading requisitions…', description: 'Preparing requests.' });

  let requisitions;
  try {
    requisitions = await listRequisitions({ status: requisitionFilter });
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load requisitions',
      onRetry: () => renderRequisitionsPage(container)
    });
    return;
  }
  const rows = requisitions.length ? requisitions.map((requisition) => `<tr><td><a class="component-name-link" href="/requisitions/${requisition.id}" data-route-link>${requisition.id}</a></td><td>${escapeHtml(requisitionName(requisition))}</td><td>${formatQuantity(requisition.quantity, requisition.unit?.symbol)}</td><td>${escapeHtml(requisition.requester?.name || '—')}</td><td>${escapeHtml(requisition.project?.name || '—')}</td><td><span class="status-badge status-badge--${statusClass(requisition.status)}">${renderStatusIcon(statusClass(requisition.status))}${requisition.status}</span></td><td>${formatDate(requisition.createdOn)}</td><td>${formatDate(requisition.neededBy)}</td><td>${requisition.daysInStatus} day${requisition.daysInStatus === 1 ? '' : 's'}</td>${renderRequisitionListActions(requisition)}</tr>`).join('') : '<tr><td colspan="10">No requisitions match this filter.</td></tr>';
  container.innerHTML = `<section class="requisitions-page" aria-label="Requisitions"><section class="requisition-toolbar"><label class="field"><span class="visually-hidden">Filter requisitions by status</span><select class="field__control" data-requisition-filter><option value="all">All statuses</option>${['Pending', 'Approved', 'Ordered', 'Received', 'Rejected', 'Cancelled'].map((status) => `<option value="${status}" ${requisitionFilter === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>${canRaiseRequisitions() ? `<button class="button" type="button" data-create-requisition>${renderIcon('plus')}Raise requisition</button>` : ''}</section><p class="administration-caption">Requisitions are not editable or deletable after submission. Use the permitted workflow actions instead.</p><div class="library-table-wrap"><table class="library-table"><thead><tr><th>Request ID</th><th>Component / part</th><th>Quantity</th><th>Requested by</th><th>Project</th><th>Status</th><th>Created</th><th>Needed by</th><th>Age</th><th aria-label="Actions"></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  requisitionController = new AbortController();
  container.addEventListener('click', async (event) => {
    if (event.target.closest('[data-create-requisition]')) {
      await openRequisitionForm(container);
      return;
    }
    const cancelButton = event.target.closest('[data-cancel-requisition]');
    if (cancelButton) {
      const requisition = requisitions.find((item) => item.id === cancelButton.dataset.cancelRequisition);
      if (requisition && canCancelOwnPendingRequisition(requisition)) {
        await cancelOwnPendingRequisition(container, requisition, cancelButton);
      }
    }
  }, { signal: requisitionController.signal });
  container.addEventListener('change', async (event) => { if (event.target.matches('[data-requisition-filter]')) { requisitionFilter = event.target.value; await renderRequisitionsPage(container); } }, { signal: requisitionController.signal });
}

export async function renderRequisitionDetailsPage(container, requisitionId) {
  destroyRequisitionsPage();
  renderLoadingState(container, { title: 'Loading requisition…', description: 'Preparing the request.' });

  let requisition;
  try {
    requisition = await getRequisition(requisitionId);
  } catch (error) {
    renderErrorState(container, {
      error,
      title: 'Could not load this requisition',
      onRetry: () => renderRequisitionDetailsPage(container, requisitionId)
    });
    return;
  }
  if (!requisition) { container.innerHTML = `<section class="state-panel"><h2 class="state-panel__title">${renderIcon('alert')}Requisition not found</h2><a class="button" href="/requisitions" data-route-link>${renderIcon('back')}Back to Requisitions</a></section>`; return; }
  const history = requisition.statusHistory.slice().reverse().map((event) => `<li><strong>${escapeHtml(event.toStatus)}</strong><span>${escapeHtml(event.note || 'No note')} · ${formatDateTime(event.timestamp)}</span></li>`).join('');
  const allowed = APP_CONFIG.mode === 'demo'
    ? getAllowedRequisitionStatuses(requisition.status)
    : getAllowedRequisitionStatuses(requisition);
  // Receiving has its own endpoint because it puts stock into a chamber.
  const canReceive = APP_CONFIG.mode !== 'demo' && allowed.includes('Received') && canDecideRequisitions();
  const canUpdate = allowed.filter((status) => status !== 'Received').length > 0;
  container.innerHTML = `<section class="requisition-details-page" aria-labelledby="requisition-title"><a class="back-link" href="/requisitions" data-route-link>${renderIcon('back')}Back to Requisitions</a><header class="overview-header"><div><h2 id="requisition-title">${escapeHtml(requisitionName(requisition))}</h2><p>${formatQuantity(requisition.quantity, requisition.unit?.symbol)} · ${escapeHtml(requisition.project?.name || 'No project')}</p></div><div class="requisition-detail-actions"><span class="status-badge status-badge--${statusClass(requisition.status)}">${renderStatusIcon(statusClass(requisition.status))}${requisition.status}</span>${canUpdate ? `<button class="button" type="button" data-update-requisition-status>${renderIcon('status')}Update status</button>` : ''}
${canReceive ? `<button class="button button--secondary" type="button" data-receive-requisition>${renderIcon('import')}Receive stock</button>` : ''}</div></header><div class="requisition-details-grid"><section class="detail-card"><h3>Request details</h3><dl class="detail-list"><div><dt>Requested by</dt><dd>${escapeHtml(requisition.requester?.name || '—')}</dd></div><div><dt>Created</dt><dd>${formatDateTime(requisition.createdOn)}</dd></div><div><dt>Needed by</dt><dd>${formatDate(requisition.neededBy)}</dd></div><div><dt>Note</dt><dd>${escapeHtml(requisition.note || 'No note')}</dd></div></dl></section><section class="detail-card"><h3>Status history</h3><ol class="status-history">${history}</ol></section></div></section>`;
  requisitionController = new AbortController();
  container.addEventListener('click', async (event) => {
    if (event.target.closest('[data-update-requisition-status]')) {
      await openStatusForm(container, requisition);
      return;
    }
    if (event.target.closest('[data-receive-requisition]')) {
      openReceiveRequisitionModal({
        requisition,
        onReceived: () => renderRequisitionDetailsPage(container, requisition.id)
      });
    }
  }, { signal: requisitionController.signal });
}

import { RequisitionValidationError, receiveRequisition } from '../services/requisition-service.js';
import { getInventoryWorkspace } from '../services/inventory-service.js';
import { getComponentReferenceData } from '../services/component-service.js';
import { clearFieldErrorOnChange, clearFormErrors, setFieldError } from './form-fields.js';
import { confirmAction } from './confirm-dialog.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';
import { formatQuantity } from '../utils/formatters.js';

/** Every chamber, so the delivered stock can be put somewhere specific. */
function chamberOptions(workspace, requisition) {
  return workspace.cabinets.flatMap((cabinet) => cabinet.drawers.flatMap((drawer) => drawer.chambers.map((chamber) => {
    const taken = chamber.component && requisition.componentId && chamber.component.id !== requisition.componentId;
    const label = chamber.component ? `${chamber.code} · ${chamber.component.name}` : `${chamber.code} · Empty`;
    return `<option value="${escapeHtml(chamber.code)}" ${taken ? 'disabled' : ''}>${escapeHtml(label)}${taken ? ' (holds another component)' : ''}</option>`;
  }))).join('');
}

export async function openReceiveRequisitionModal({ requisition, onReceived } = {}) {
  const needsCategory = !requisition.componentId;
  const [workspace, references] = await Promise.all([
    getInventoryWorkspace(),
    needsCategory ? getComponentReferenceData() : Promise.resolve({ categories: [] })
  ]);

  const form = document.createElement('form');
  form.className = 'receive-requisition-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="requisition-receipt-summary">
      <strong>${escapeHtml(requisition.partName)}</strong>
      <span>${escapeHtml(requisition.reference)} · ${formatQuantity(requisition.quantity, requisition.unit?.symbol)} requested</span>
    </div>
    <div class="requisition-form-grid">
    <div class="field field--wide">
      <label class="field__label" for="receive-location">Destination chamber <span class="requisition-form__required" aria-hidden="true">*</span></label>
      <select class="field__control" id="receive-location" name="locationCode" aria-describedby="receive-location-error" required>
        <option value="">Choose a chamber</option>
        ${chamberOptions(workspace, requisition)}
      </select>
      <span class="field__hint">Only empty chambers or chambers holding this same component are available.</span>
      <span class="field__error" id="receive-location-error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="receive-quantity">Delivered quantity (${escapeHtml(requisition.unit?.symbol || '')}) <span class="requisition-form__required" aria-hidden="true">*</span></label>
      <input class="field__control" id="receive-quantity" name="quantity" type="number" min="0.001" step="0.001"
             inputmode="decimal" value="${requisition.quantity}" aria-describedby="receive-quantity-error" required>
      <span class="field__hint">Change this if the delivered amount differs from the request.</span>
      <span class="field__error" id="receive-quantity-error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="receive-price">Unit price (BDT) <span aria-hidden="true">(optional)</span></label>
      <input class="field__control" id="receive-price" name="unitPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-describedby="receive-price-error">
      <span class="field__error" id="receive-price-error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="receive-delivery">Delivery charge (BDT) <span aria-hidden="true">(optional)</span></label>
      <input class="field__control" id="receive-delivery" name="deliveryCharge" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" aria-describedby="receive-delivery-error">
      <span class="field__error" id="receive-delivery-error"></span>
    </div>
    ${needsCategory ? `
      <div class="field">
        <label class="field__label" for="receive-category">Category for the new component <span class="requisition-form__required" aria-hidden="true">*</span></label>
        <select class="field__control" id="receive-category" name="categoryId" aria-describedby="receive-category-error" required>
          <option value="">Choose a category</option>
          ${references.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('')}
        </select>
        <span class="field__error" id="receive-category-error"></span>
      </div>
    ` : ''}
    <div class="field field--wide">
      <label class="field__label" for="receive-note">Note <span aria-hidden="true">(optional)</span></label>
      <input class="field__control" id="receive-note" name="note" type="text" placeholder="Invoice number, supplier…" aria-describedby="receive-note-error">
      <span class="field__error" id="receive-note-error"></span>
    </div>
    </div>
    <p class="requisition-receipt-warning">Receiving adds stock immediately and marks this requisition as received.</p>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-receive-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon('import')}<span data-receive-submit-label>Receive stock</span></button>
    </div>
  `;

  const modal = openModal({
    title: `Receive ${requisition.reference}`,
    description: needsCategory
      ? `${requisition.partName} is not in the Library yet — receiving creates it, then adds the stock.`
      : `Adds the delivered ${requisition.partName} to the chamber you choose.`,
    content: form
  });

  form.querySelector('[data-receive-cancel]').addEventListener('click', () => modal.close('cancelled'));
  clearFieldErrorOnChange(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton.disabled) return;
    clearFormErrors(form);
    const submitLabel = form.querySelector('[data-receive-submit-label]');

    const values = Object.fromEntries(new FormData(form));
    const confirmed = await confirmAction({
      title: `Receive ${formatQuantity(Number(values.quantity), requisition.unit?.symbol)} into ${values.locationCode || 'a chamber'}?`,
      description: 'The stock is added immediately and the requisition is closed as received. This cannot be undone from here.',
      confirmLabel: 'Receive stock',
      tone: 'default'
    });
    if (!confirmed) return;

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (submitLabel) submitLabel.textContent = 'Receiving…';

    try {
      await receiveRequisition({ requisitionId: requisition.id, ...values });
      modal.close('received');
      showToast('Stock received.');
      await onReceived?.();
    } catch (error) {
      if (error instanceof RequisitionValidationError) {
        Object.entries(error.errors).forEach(([name, message]) => {
          if (!message) return;
          const control = form.elements.namedItem(name);
          if (control) setFieldError(control, message);
          else showToast(message, { type: 'error' });
        });
      } else {
        showToast(error?.message || 'The stock could not be received.', { type: 'error' });
      }
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      if (submitLabel) submitLabel.textContent = 'Receive stock';
    }
  });
}

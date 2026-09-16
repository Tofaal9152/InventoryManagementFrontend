import { StockOperationValidationError, adjustStock } from '../services/inventory-service.js';
import { clearFieldErrorOnChange, clearFormErrors, setFieldError } from './form-fields.js';
import { confirmAction } from './confirm-dialog.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';
import { formatQuantity } from '../utils/formatters.js';

/**
 * Adjust overwrites a counted quantity instead of moving stock, so it is Admin
 * only, always needs a reason, and confirms the difference before it is sent.
 */
export function openAdjustStockModal({ cabinet, drawer, onAdjusted } = {}) {
  const symbol = drawer.unit?.symbol || '';
  const form = document.createElement('form');
  form.className = 'stock-operation-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="stock-operation-form__grid">
      <div class="field">
        <label class="field__label" for="adjust-quantity">Counted quantity (${escapeHtml(symbol)}) <span class="inventory-form__required" aria-hidden="true">*</span></label>
        <input class="field__control" id="adjust-quantity" name="quantity" type="number" min="0" step="0.001"
               inputmode="decimal" value="${drawer.quantity}" aria-describedby="adjust-quantity-error" required>
        <span class="field__hint">Enter the physical count, not the amount to add or remove.</span>
        <span class="field__error" id="adjust-quantity-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="adjust-reason">Reason <span class="inventory-form__required" aria-hidden="true">*</span></label>
        <input class="field__control" id="adjust-reason" name="note" type="text"
               placeholder="Physical count found 2 missing" aria-describedby="adjust-reason-error" required>
        <span class="field__error" id="adjust-reason-error"></span>
      </div>
    </div>
    <p class="stock-operation-form__hint">
      System quantity is ${formatQuantity(drawer.quantity, symbol)}. The difference is recorded in the audit log.
    </p>
    <p class="stock-operation-form__preview" data-adjustment-preview aria-live="polite"></p>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-adjust-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon('check')}Adjust stock</button>
    </div>
  `;

  const modal = openModal({
    title: 'Adjust stock',
    description: `Correct the recorded quantity for ${cabinet.name} · ${drawer.code}.`,
    content: form
  });

  form.querySelector('[data-adjust-cancel]').addEventListener('click', () => modal.close('cancelled'));
  clearFieldErrorOnChange(form);
  const adjustmentPreview = form.querySelector('[data-adjustment-preview]');
  const updateAdjustmentPreview = () => {
    const counted = Number(form.elements.quantity.value);
    if (!Number.isFinite(counted) || counted < 0) {
      adjustmentPreview.textContent = 'Enter a non-negative physical count to preview the adjustment.';
      return;
    }
    const difference = counted - drawer.quantity;
    adjustmentPreview.textContent = difference === 0
      ? 'No adjustment will be made because this matches the system quantity.'
      : `This will ${difference > 0 ? 'add' : 'remove'} ${formatQuantity(Math.abs(difference), symbol)}.`;
  };
  form.elements.quantity.addEventListener('input', updateAdjustmentPreview);
  updateAdjustmentPreview();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton.disabled) return;
    clearFormErrors(form);

    const newQuantity = Number(form.elements.quantity.value);
    const reason = form.elements.note.value.trim();

    if (!Number.isFinite(newQuantity) || newQuantity < 0) {
      setFieldError(form.elements.quantity, 'Enter a quantity of zero or more.');
      return;
    }
    if (!reason) {
      setFieldError(form.elements.note, 'Give a reason for the adjustment.');
      return;
    }

    const difference = newQuantity - drawer.quantity;
    if (difference === 0) {
      setFieldError(form.elements.quantity, 'That is already the recorded quantity.');
      return;
    }

    const confirmed = await confirmAction({
      title: `Adjust ${drawer.code} to ${formatQuantity(newQuantity, symbol)}?`,
      description: `This ${difference > 0 ? 'adds' : 'removes'} ${formatQuantity(Math.abs(difference), symbol)} `
        + `without a stock movement, and is written to the audit log with your reason.`,
      confirmLabel: 'Adjust stock'
    });
    if (!confirmed) return;

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');

    try {
      await adjustStock({ locationCode: drawer.locationCode, newQuantity, reason });
      modal.close('adjusted');
      showToast('Stock adjusted.');
      await onAdjusted?.();
    } catch (error) {
      if (error instanceof StockOperationValidationError) {
        Object.entries(error.errors).forEach(([name, message]) => {
          const control = form.elements.namedItem(name);
          if (control) setFieldError(control, message);
        });
      } else {
        showToast(error?.message || 'The adjustment could not be saved.', { type: 'error' });
      }
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });
}

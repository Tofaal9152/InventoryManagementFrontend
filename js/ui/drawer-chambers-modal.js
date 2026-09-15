import { CabinetValidationError, updateDrawerChambers } from '../services/inventory-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { confirmAction } from './confirm-dialog.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';

/**
 * A drawer can be divided into 1-9 chambers, each holding its own component.
 * Growing adds empty chambers with the next codes; shrinking is refused by the
 * server while a removed chamber still holds stock, so the ones at risk are
 * named before anything is sent.
 */
export function openDrawerChambersModal({ drawer, onSaved } = {}) {
  const current = drawer.chamberCount || 1;
  const form = document.createElement('form');
  form.className = 'cabinet-create-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="field">
      <label class="field__label" for="drawer-chambers">Chambers in ${escapeHtml(drawer.code)}</label>
      <input class="field__control" id="drawer-chambers" name="chamberCount" type="number" min="1" max="9" step="1"
             value="${current}" aria-describedby="drawer-chambers-error" required>
      <span class="field__error" id="drawer-chambers-error"></span>
    </div>
    <p class="cabinet-create-form__hint">
      Chamber codes follow the drawer, such as ${escapeHtml(drawer.code)}1 and ${escapeHtml(drawer.code)}2.
      Stock is held per chamber, so each one can hold a different component.
    </p>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-chambers-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon('check')}<span data-chambers-label>Save chambers</span></button>
    </div>
  `;

  const modal = openModal({
    title: `Subdivide drawer ${drawer.code}`,
    description: `${drawer.code} currently has ${current} chamber${current === 1 ? '' : 's'}, ${drawer.occupiedChamberCount} in use.`,
    content: form
  });

  form.querySelector('[data-chambers-cancel]').addEventListener('click', () => modal.close('cancelled'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    const submitLabel = form.querySelector('[data-chambers-label]');
    if (submitButton.disabled) return;

    clearFormErrors(form);
    const next = Number(form.elements.chamberCount.value);

    if (!Number.isInteger(next) || next < 1 || next > 9) {
      setFieldError(form.elements.chamberCount, 'A drawer can have 1 to 9 chambers.');
      return;
    }
    if (next === current) {
      setFieldError(form.elements.chamberCount, `${drawer.code} already has ${current} chamber${current === 1 ? '' : 's'}.`);
      return;
    }

    if (next < current) {
      const removed = drawer.chambers.slice(next);
      const withStock = removed.filter((chamber) => chamber.component);
      const confirmed = await confirmAction({
        title: `Reduce ${drawer.code} to ${next} chamber${next === 1 ? '' : 's'}?`,
        description: withStock.length
          ? `${withStock.map((chamber) => chamber.code).join(', ')} still hold stock, so the server will refuse. Move or take that stock first.`
          : `${removed.map((chamber) => chamber.code).join(', ')} will be removed. They are empty, and their movement history is kept.`,
        confirmLabel: 'Save chambers'
      });
      if (!confirmed) return;
    }

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (submitLabel) submitLabel.textContent = 'Saving…';

    try {
      await updateDrawerChambers(drawer.id, next);
      modal.close('saved');
      showToast(`${drawer.code} now has ${next} chamber${next === 1 ? '' : 's'}.`);
      await onSaved?.();
    } catch (error) {
      if (error instanceof CabinetValidationError) {
        setFieldError(form.elements.chamberCount, error.errors.chamberCount || 'The drawer could not be updated.');
      } else {
        showToast(error?.message || 'The drawer could not be updated.', { type: 'error' });
      }
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      if (submitLabel) submitLabel.textContent = 'Save chambers';
    }
  });
}

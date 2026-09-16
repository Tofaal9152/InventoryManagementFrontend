import { listComponents } from '../services/component-service.js';
import { assignComponentToDrawer, DrawerAssignmentValidationError } from '../services/inventory-service.js';
import { clearFieldErrorOnChange, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/dom.js';
import { renderIcon } from './icons.js';

function getFieldValue(form, name) {
  return new FormData(form).get(name);
}

export async function openAssignmentModal({ cabinet, drawer, onAssigned } = {}) {
  const components = await listComponents();
  const form = document.createElement('form');

  form.className = 'assignment-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="inventory-form__context">
      <strong>${escapeHtml(cabinet.name)} · ${escapeHtml(drawer.code)}</strong>
      <span>${drawer.component ? 'This chamber is already assigned.' : 'This empty chamber can hold one Library component.'}</span>
    </div>
    <div class="field">
      <label class="field__label" for="assignment-component">Library component <span class="inventory-form__required" aria-hidden="true">*</span></label>
      <select class="field__control" id="assignment-component" name="componentId" aria-describedby="assignment-component-error" required>
        <option value="">Choose a component</option>
        ${components.map((component) => `<option value="${component.id}">${escapeHtml(component.name)} · ${escapeHtml(component.partNumber || 'No MPN')}</option>`).join('')}
      </select>
      <span class="field__hint">The component stays in the Library; this only assigns its storage location.</span>
      <span class="field__error" id="assignment-component-error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="assignment-quantity">Initial quantity <span class="inventory-form__required" aria-hidden="true">*</span></label>
      <input class="field__control" id="assignment-quantity" name="quantity" type="number" min="0.001" step="0.001" inputmode="decimal" value="1" aria-describedby="assignment-quantity-error" required>
      <span class="field__hint">This creates the first stock record for this location.</span>
      <span class="field__error" id="assignment-quantity-error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="assignment-note">Note <span aria-hidden="true">(optional)</span></label>
      <textarea class="field__control" id="assignment-note" name="note" rows="3"></textarea>
    </div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-assignment-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon('assign')}Assign component</button>
    </div>
  `;

  let modal;
  modal = openModal({
    title: `Assign to ${drawer.code}`,
    description: `Choose a Library component for ${cabinet.name} · ${drawer.code}.`,
    content: form
  });

  form.querySelector('[data-assignment-cancel]').addEventListener('click', () => modal.close('cancelled'));
  clearFieldErrorOnChange(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      await assignComponentToDrawer({
        cabinetId: cabinet.id,
        drawerId: drawer.id,
        locationCode: drawer.locationCode || '',
        componentId: getFieldValue(form, 'componentId'),
        quantity: getFieldValue(form, 'quantity'),
        note: getFieldValue(form, 'note')
      });
      modal.close('assigned');
      showToast(`${drawer.code} has been assigned.`);
      await onAssigned?.();
    } catch (error) {
      if (error instanceof DrawerAssignmentValidationError) {
        Object.entries(error.errors).forEach(([field, message]) => {
          const control = form.elements.namedItem(field);
          if (control) {
            setFieldError(control, message);
          }
        });
      } else {
        showToast('The component could not be assigned. Please try again.', { type: 'error' });
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}

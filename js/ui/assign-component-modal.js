import { listComponents } from '../services/component-service.js';
import { assignComponentToDrawer, DrawerAssignmentValidationError } from '../services/inventory-service.js';
import { setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/dom.js';

function getFieldValue(form, name) {
  return new FormData(form).get(name);
}

export async function openAssignmentModal({ cabinet, drawer }) {
  const components = await listComponents();
  const form = document.createElement('form');

  form.className = 'assignment-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="field">
      <label class="field__label" for="assignment-component">Library component</label>
      <select class="field__control" id="assignment-component" name="componentId" aria-describedby="assignment-component-error" required>
        <option value="">Choose a component</option>
        ${components.map((component) => `<option value="${component.id}">${escapeHtml(component.name)} · ${escapeHtml(component.partNumber || 'No MPN')}</option>`).join('')}
      </select>
      <span class="field__error" id="assignment-component-error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="assignment-quantity">Initial quantity</label>
      <input class="field__control" id="assignment-quantity" name="quantity" type="number" min="0.001" step="0.001" value="1" aria-describedby="assignment-quantity-error" required>
      <span class="field__error" id="assignment-quantity-error"></span>
    </div>
    <div class="field">
      <label class="field__label" for="assignment-note">Note <span aria-hidden="true">(optional)</span></label>
      <textarea class="field__control" id="assignment-note" name="note" rows="3"></textarea>
    </div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-assignment-cancel>Cancel</button>
      <button class="button" type="submit">Assign component</button>
    </div>
  `;

  let modal;
  modal = openModal({
    title: `Assign to ${drawer.code}`,
    description: `Choose a Library component for ${cabinet.name} · ${drawer.code}.`,
    content: form
  });

  form.querySelector('[data-assignment-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      await assignComponentToDrawer({
        cabinetId: cabinet.id,
        drawerId: drawer.id,
        componentId: getFieldValue(form, 'componentId'),
        quantity: getFieldValue(form, 'quantity'),
        note: getFieldValue(form, 'note')
      });
      modal.close('assigned');
      showToast(`${drawer.code} has been assigned.`);
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

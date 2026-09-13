import { CabinetValidationError, createCabinet, getInventoryWorkspace } from '../services/inventory-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/dom.js';
import { renderIcon } from './icons.js';

function getPayload(form) {
  return Object.fromEntries(new FormData(form));
}

export async function openCreateCabinetModal({ onCreated } = {}) {
  const workspace = await getInventoryWorkspace();
  const form = document.createElement('form');
  form.className = 'cabinet-create-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="cabinet-create-form__grid">
      <div class="field field--wide">
        <label class="field__label" for="cabinet-name">Cabinet name</label>
        <input class="field__control" id="cabinet-name" name="name" type="text" maxlength="80" autocomplete="off" aria-describedby="cabinet-name-error" required>
        <span class="field__error" id="cabinet-name-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="cabinet-group">Cabinet group</label>
        <select class="field__control" id="cabinet-group" name="groupId" aria-describedby="cabinet-group-error" required>
          <option value="">Choose a group</option>
          ${workspace.groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('')}
        </select>
        <span class="field__error" id="cabinet-group-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="cabinet-rows">Rows</label>
        <input class="field__control" id="cabinet-rows" name="rows" type="number" min="1" max="9" step="1" value="4" aria-describedby="cabinet-rows-error" required>
        <span class="field__error" id="cabinet-rows-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="cabinet-columns">Columns</label>
        <input class="field__control" id="cabinet-columns" name="columnCount" type="number" min="1" max="26" step="1" value="4" aria-describedby="cabinet-columns-error" required>
        <span class="field__error" id="cabinet-columns-error"></span>
      </div>
    </div>
    <p class="cabinet-create-form__hint">Drawer labels are generated automatically, such as A1, B1, A2 and B2.</p>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-cabinet-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon('cabinet')}Create cabinet</button>
    </div>
  `;

  const modal = openModal({
    title: 'Create cabinet',
    description: 'Set the storage group and drawer layout for this cabinet.',
    content: form
  });

  form.querySelector('[data-cabinet-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    clearFormErrors(form);

    try {
      const cabinet = await createCabinet(getPayload(form));
      modal.close('created');
      showToast(`${cabinet.name} has been created.`);
      await onCreated?.(cabinet);
    } catch (error) {
      if (error instanceof CabinetValidationError) {
        Object.entries(error.errors).forEach(([field, message]) => {
          const control = form.elements.namedItem(field);
          if (control) setFieldError(control, message);
        });
      } else {
        showToast('The cabinet could not be created. Please try again.', { type: 'error' });
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}

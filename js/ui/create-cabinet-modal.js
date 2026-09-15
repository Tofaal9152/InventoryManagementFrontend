import { CabinetValidationError, createCabinet, getInventoryWorkspace } from '../services/inventory-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { confirmAction } from './confirm-dialog.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/dom.js';
import { renderIcon } from './icons.js';
import { APP_CONFIG } from '../config.js';

function getPayload(form) {
  return Object.fromEntries(new FormData(form));
}

/**
 * The backend keeps a single cabinet: `PUT inventory/cabinet/` creates it the
 * first time and changes its layout afterwards. So this modal is "set up" when
 * there is nothing yet and "change layout" once there is — never a second
 * cabinet, which would quietly overwrite the first.
 */
export async function openCreateCabinetModal({ onCreated } = {}) {
  const workspace = await getInventoryWorkspace();
  const live = APP_CONFIG.mode !== 'demo';
  const existing = live ? workspace.cabinets[0] || null : null;
  const form = document.createElement('form');
  form.className = 'cabinet-create-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="cabinet-create-form__grid">
      <div class="field field--wide">
        <label class="field__label" for="cabinet-name">Cabinet name</label>
        <input class="field__control" id="cabinet-name" name="name" type="text" maxlength="80" autocomplete="off"
               value="${escapeHtml(existing?.name || '')}" aria-describedby="cabinet-name-error" required>
        <span class="field__error" id="cabinet-name-error"></span>
      </div>
      ${live ? '' : `
      <div class="field field--wide">
        <label class="field__label" for="cabinet-group">Cabinet group</label>
        <select class="field__control" id="cabinet-group" name="groupId" aria-describedby="cabinet-group-error" required>
          <option value="">Choose a group</option>
          ${workspace.groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join('')}
        </select>
        <span class="field__error" id="cabinet-group-error"></span>
      </div>`}
      <div class="field">
        <label class="field__label" for="cabinet-rows">Rows</label>
        <input class="field__control" id="cabinet-rows" name="rows" type="number" min="1" max="9" step="1" value="${existing?.rows || 4}" aria-describedby="cabinet-rows-error" required>
        <span class="field__error" id="cabinet-rows-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="cabinet-columns">Columns</label>
        <input class="field__control" id="cabinet-columns" name="columnCount" type="number" min="1" max="26" step="1" value="${existing?.columnCount || 4}" aria-describedby="cabinet-columns-error" required>
        <span class="field__error" id="cabinet-columns-error"></span>
      </div>
    </div>
    <p class="cabinet-create-form__hint">Drawer labels are generated automatically, such as A1, B1, A2 and B2.</p>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-cabinet-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon(existing ? 'check' : 'cabinet')}<span data-cabinet-submit-label>${existing ? 'Save layout' : 'Create cabinet'}</span></button>
    </div>
  `;

  const modal = openModal({
    title: existing ? `Cabinet layout · ${existing.name}` : 'Set up the cabinet',
    description: existing
      ? 'Change the grid. Growing it adds empty drawers; shrinking is blocked while a removed chamber still holds stock.'
      : 'Name the cabinet and set its drawer grid. Each drawer starts with one chamber.',
    content: form
  });

  form.querySelector('[data-cabinet-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    const submitLabel = form.querySelector('[data-cabinet-submit-label]');
    if (submitButton.disabled) return;
    clearFormErrors(form);

    const values = getPayload(form);

    // Shrinking can take drawers away, so say how many before sending anything.
    if (existing) {
      const currentDrawers = existing.rows * existing.columnCount;
      const nextDrawers = Number(values.rows) * Number(values.columnCount);
      if (nextDrawers < currentDrawers) {
        const removed = currentDrawers - nextDrawers;
        const confirmed = await confirmAction({
          title: `Shrink ${existing.name} to ${values.rows} × ${values.columnCount}?`,
          description: `This removes ${removed} drawer${removed === 1 ? '' : 's'} from the grid. The server refuses if any removed chamber still holds stock, and removed drawers keep their movement history.`,
          confirmLabel: 'Save layout'
        });
        if (!confirmed) return;
      }
    }

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (submitLabel) submitLabel.textContent = existing ? 'Saving…' : 'Creating…';

    try {
      const cabinet = await createCabinet(values);
      modal.close('created');
      showToast(existing ? `${cabinet.name} layout saved.` : `${cabinet.name} has been created.`);
      await onCreated?.(cabinet);
    } catch (error) {
      if (error instanceof CabinetValidationError) {
        Object.entries(error.errors).forEach(([field, message]) => {
          const control = form.elements.namedItem(field);
          if (control && message) setFieldError(control, message);
        });
      } else {
        showToast(error?.message || 'The cabinet could not be saved. Please try again.', { type: 'error' });
      }
      // Only re-enable on failure: a success closes the modal.
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      if (submitLabel) submitLabel.textContent = existing ? 'Save layout' : 'Create cabinet';
    }
  });
}

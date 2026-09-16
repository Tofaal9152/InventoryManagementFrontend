import { UserValidationError, saveUser } from '../services/user-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';

const ROLES = ['Admin', 'Manager', 'Staff'];

function field({ id, name, label, value = '', type = 'text', required = true, hint = '', wide = false, readOnly = false }) {
  return `
    <div class="field${wide ? ' field--wide' : ''}">
      <label class="field__label" for="${id}">${label}${required ? '' : ' (optional)'}</label>
      <input class="field__control" id="${id}" name="${name}" type="${type}" value="${escapeHtml(value)}"
             aria-describedby="${id}-error" ${required ? 'required' : ''} ${readOnly ? 'readonly aria-readonly="true"' : ''} ${type === 'password' ? 'autocomplete="new-password"' : ''}>
      ${hint ? `<span class="field__hint">${hint}</span>` : ''}
      <span class="field__error" id="${id}-error"></span>
    </div>
  `;
}

export function openUserModal({ user = null, isSelf = false, onSaved } = {}) {
  const form = document.createElement('form');
  form.className = 'library-form-grid';
  form.noValidate = true;
  form.innerHTML = `
    ${field({ id: 'user-email', name: 'email', label: 'Email address', value: user?.email || '', type: 'email', readOnly: isSelf })}
    <div class="field">
      <label class="field__label" for="user-role">Role</label>
      <select class="field__control" id="user-role" name="role" aria-describedby="user-role-error" required ${isSelf ? 'disabled aria-disabled="true"' : ''}>
        ${ROLES.map((role) => `<option value="${role}" ${user?.role === role ? 'selected' : ''}>${role}</option>`).join('')}
      </select>
      ${isSelf ? `<input type="hidden" name="role" value="${escapeHtml(user?.role || '')}">` : ''}
      ${isSelf ? '<span class="field__hint">Your own role cannot be changed here.</span>' : ''}
      <span class="field__error" id="user-role-error"></span>
    </div>
    ${field({ id: 'user-first-name', name: 'firstName', label: 'First name', value: user?.firstName || '', required: false })}
    ${field({ id: 'user-last-name', name: 'lastName', label: 'Last name', value: user?.lastName || '', required: false })}
    ${user ? '' : field({ id: 'user-password', name: 'password', label: 'Temporary password', type: 'password', hint: 'Share it with the user, then ask them to change it.', wide: true })}
    <div class="dialog__actions user-form__actions">
      <button class="button button--secondary" type="button" data-user-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon(user ? 'check' : 'plus')}${user ? 'Save changes' : 'Create user'}</button>
    </div>
  `;

  const modal = openModal({
    title: user ? `Edit ${user.name || user.email}` : 'New user',
    description: user
      ? isSelf
        ? 'You can update your display name here. Your email and role are protected in user management.'
        : 'Change the role or name. Email changes also change how they sign in.'
      : 'The user signs in with this email and the password you set here.',
    content: form
  });

  form.querySelector('[data-user-cancel]').addEventListener('click', () => modal.close('cancelled'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton.disabled) return;

    clearFormErrors(form);
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');

    try {
      await saveUser({ id: user?.id, ...Object.fromEntries(new FormData(form)) });
      modal.close('saved');
      showToast(user ? 'User updated.' : 'User created.');
      await onSaved?.();
    } catch (error) {
      if (error instanceof UserValidationError) {
        Object.entries(error.errors).forEach(([name, message]) => {
          const control = form.elements.namedItem(name);
          if (control) setFieldError(control, message);
        });
      } else {
        showToast(error?.message || 'The user could not be saved.', { type: 'error' });
      }
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });
}

import {
  ReferenceValidationError,
  reassignCategory,
  saveCategory,
  saveUnit
} from '../services/reference-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';

function textField({ id, name, label, value = '', placeholder = '', required = true }) {
  return `
    <div class="field field--wide">
      <label class="field__label" for="${id}">${label}${required ? '' : ' (optional)'}</label>
      <input class="field__control" id="${id}" name="${name}" type="text" value="${escapeHtml(value)}"
             placeholder="${escapeHtml(placeholder)}" aria-describedby="${id}-error" ${required ? 'required' : ''}>
      <span class="field__error" id="${id}-error"></span>
    </div>
  `;
}

function bindSubmit(form, modal, { submit, onDone, successMessage }) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton.disabled) return;

    clearFormErrors(form);
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');

    try {
      const values = Object.fromEntries(new FormData(form));
      await submit(values, form);
      modal.close('saved');
      showToast(successMessage);
      await onDone?.();
    } catch (error) {
      if (error instanceof ReferenceValidationError) {
        Object.entries(error.errors).forEach(([name, message]) => {
          const control = form.elements.namedItem(name);
          if (control) setFieldError(control, message);
        });
      } else {
        showToast(error?.message || 'The record could not be saved.', { type: 'error' });
      }
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });
}

function actions(cancelAttribute, label, icon) {
  return `
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" ${cancelAttribute}>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon(icon)}${label}</button>
    </div>
  `;
}

export function openCategoryModal({ category = null, onSaved } = {}) {
  const form = document.createElement('form');
  form.className = 'library-form-grid';
  form.noValidate = true;
  form.innerHTML = `
    ${textField({ id: 'category-name', name: 'name', label: 'Category name', value: category?.name || '', placeholder: 'Motors' })}
    ${textField({ id: 'category-description', name: 'description', label: 'Description', value: category?.description || '', placeholder: 'DC, servo and stepper motors', required: false })}
    ${actions('data-category-cancel', category ? 'Save changes' : 'Create category', category ? 'check' : 'plus')}
  `;

  const modal = openModal({
    title: category ? 'Edit category' : 'New category',
    description: category ? 'Rename the category or update its description.' : 'Group Library components under a new category.',
    content: form
  });

  form.querySelector('[data-category-cancel]').addEventListener('click', () => modal.close('cancelled'));
  bindSubmit(form, modal, {
    submit: (values) => saveCategory({ id: category?.id, ...values }),
    onDone: onSaved,
    successMessage: category ? 'Category updated.' : 'Category created.'
  });
}

export function openUnitModal({ unit = null, onSaved } = {}) {
  const form = document.createElement('form');
  form.className = 'library-form-grid';
  form.noValidate = true;
  form.innerHTML = `
    ${textField({ id: 'unit-name', name: 'name', label: 'Unit name', value: unit?.name || '', placeholder: 'Metre' })}
    ${textField({ id: 'unit-symbol', name: 'symbol', label: 'Symbol', value: unit?.symbol || '', placeholder: 'm' })}
    <div class="field field--wide">
      <label class="field__checkbox" for="unit-fraction">
        <input id="unit-fraction" name="allowFraction" type="checkbox" ${unit?.allowsFraction || unit?.allowFraction ? 'checked' : ''}>
        <span>Allow decimal quantities</span>
      </label>
      <span class="field__error" id="unit-fraction-error"></span>
    </div>
    ${actions('data-unit-cancel', unit ? 'Save changes' : 'Create unit', unit ? 'check' : 'plus')}
  `;

  const modal = openModal({
    title: unit ? 'Edit unit' : 'New unit',
    description: unit ? 'Update the unit used by Library components.' : 'Add a unit components can be measured in.',
    content: form
  });

  form.querySelector('[data-unit-cancel]').addEventListener('click', () => modal.close('cancelled'));
  bindSubmit(form, modal, {
    submit: (values) => saveUnit({
      id: unit?.id,
      name: values.name,
      symbol: values.symbol,
      allowFraction: values.allowFraction === 'on'
    }),
    onDone: onSaved,
    successMessage: unit ? 'Unit updated.' : 'Unit created.'
  });
}

/**
 * A category that still holds components cannot be deleted outright: its
 * components must be moved somewhere first. This is that flow, in one dialog.
 */
export function openCategoryReassignModal({ category, categories, onReassigned } = {}) {
  const options = categories
    .filter((candidate) => candidate.id !== category.id)
    .map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.name)}</option>`)
    .join('');

  const form = document.createElement('form');
  form.className = 'library-form-grid';
  form.noValidate = true;
  form.innerHTML = `
    <div class="field field--wide">
      <label class="field__label" for="reassign-target">Move ${category.componentCount} component${category.componentCount === 1 ? '' : 's'} into</label>
      <select class="field__control" id="reassign-target" name="targetCategoryId" aria-describedby="reassign-target-error" required>
        ${options || '<option value="">No other category exists</option>'}
      </select>
      <span class="field__error" id="reassign-target-error"></span>
    </div>
    <div class="field field--wide">
      <label class="field__checkbox" for="reassign-delete">
        <input id="reassign-delete" name="deleteAfter" type="checkbox" checked>
        <span>Delete “${escapeHtml(category.name)}” afterwards</span>
      </label>
    </div>
    ${actions('data-reassign-cancel', 'Move components', 'transfer')}
  `;

  const modal = openModal({
    title: `Reassign ${category.name}`,
    description: 'Every component in this category moves to the category you choose. Each move is audited.',
    content: form
  });

  form.querySelector('[data-reassign-cancel]').addEventListener('click', () => modal.close('cancelled'));
  bindSubmit(form, modal, {
    submit: (values) => reassignCategory({
      categoryId: category.id,
      targetCategoryId: values.targetCategoryId,
      deleteAfter: values.deleteAfter === 'on'
    }),
    onDone: onReassigned,
    successMessage: 'Components reassigned.'
  });
}

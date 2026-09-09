import {
  ComponentValidationError,
  getComponentReferenceData,
  saveComponent
} from '../services/component-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/dom.js';

function componentFormMarkup(component, references) {
  const value = (field) => escapeHtml(component?.[field] ?? '');
  const selectOptions = (records, selectedId, emptyLabel) => `
    <option value="">${emptyLabel}</option>
    ${records.map((record) => `<option value="${record.id}" ${record.id === selectedId ? 'selected' : ''}>${escapeHtml(record.name)}${record.symbol ? ` (${escapeHtml(record.symbol)})` : ''}</option>`).join('')}
  `;

  return `
    <div class="library-form-grid">
      <div class="field field--wide">
        <label class="field__label" for="component-name">Component name</label>
        <input class="field__control" id="component-name" name="name" value="${value('name')}" aria-describedby="component-name-error" required>
        <span class="field__error" id="component-name-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="component-part-number">Part number / MPN</label>
        <input class="field__control" id="component-part-number" name="partNumber" value="${value('partNumber')}" aria-describedby="component-part-number-error">
        <span class="field__error" id="component-part-number-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="component-manufacturer">Manufacturer</label>
        <input class="field__control" id="component-manufacturer" name="manufacturer" value="${value('manufacturer')}">
      </div>
      <div class="field">
        <label class="field__label" for="component-category">Category</label>
        <select class="field__control" id="component-category" name="categoryId" aria-describedby="component-category-error" required>
          ${selectOptions(references.categories, component?.categoryId, 'Choose a category')}
        </select>
        <span class="field__error" id="component-category-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="component-unit">Unit</label>
        <select class="field__control" id="component-unit" name="unitId" aria-describedby="component-unit-error" required>
          ${selectOptions(references.units, component?.unitId, 'Choose a unit')}
        </select>
        <span class="field__error" id="component-unit-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="component-minimum">Minimum quantity</label>
        <input class="field__control" id="component-minimum" name="minimumQuantity" type="number" min="0" step="0.001" value="${value('minimumQuantity') || '0'}" aria-describedby="component-minimum-error">
        <span class="field__error" id="component-minimum-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="component-price">Last buying price (BDT)</label>
        <input class="field__control" id="component-price" name="lastBuyingPrice" type="number" min="0" step="0.01" value="${value('lastBuyingPrice') || '0'}" aria-describedby="component-price-error">
        <span class="field__error" id="component-price-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="component-datasheet">Datasheet URL</label>
        <input class="field__control" id="component-datasheet" name="datasheetUrl" type="url" value="${value('datasheetUrl')}" aria-describedby="component-datasheet-error">
        <span class="field__error" id="component-datasheet-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="component-description">Description <span aria-hidden="true">(optional)</span></label>
        <textarea class="field__control" id="component-description" name="description" rows="3">${value('description')}</textarea>
      </div>
    </div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-component-cancel>Cancel</button>
      <button class="button" type="submit">${component?.id ? 'Save changes' : 'Create component'}</button>
    </div>
  `;
}

export async function openComponentModal({ component = null, onSaved } = {}) {
  const references = await getComponentReferenceData();
  const form = document.createElement('form');
  form.className = 'component-form';
  form.noValidate = true;
  form.innerHTML = componentFormMarkup(component, references);

  const modal = openModal({
    title: component ? 'Edit component' : 'Create component',
    description: component ? 'Update the Library record. Stock quantities remain in Inventory.' : 'Create a reusable master component in the Library.',
    content: form
  });

  form.querySelector('[data-component-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors(form);
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      const savedComponent = await saveComponent({ id: component?.id, ...Object.fromEntries(new FormData(form)) });
      modal.close('saved');
      showToast(component ? 'Component updated.' : 'Component created.');
      await onSaved?.(savedComponent);
    } catch (error) {
      if (error instanceof ComponentValidationError) {
        Object.entries(error.errors).forEach(([field, message]) => {
          const control = form.elements.namedItem(field);
          if (control) setFieldError(control, message);
        });
      } else {
        showToast('The component could not be saved. Please try again.', { type: 'error' });
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}

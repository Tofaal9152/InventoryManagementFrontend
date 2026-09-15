import {
  ComponentValidationError,
  getComponentReferenceData,
  saveComponent
} from '../services/component-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maximumImageSize = 2 * 1024 * 1024;

function imagePreviewMarkup(image) {
  if (!image?.dataUrl) {
    return '<span class="component-image-preview__empty">No image selected</span>';
  }

  return `<img src="${escapeHtml(image.dataUrl)}" alt="Current component image">`;
}

function validateImageFile(file) {
  if (!file) return '';
  if (!acceptedImageTypes.has(file.type)) return 'Choose a JPG, PNG or WEBP image.';
  if (file.size > maximumImageSize) return 'Image must be 2 MB or smaller.';
  return '';
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve({
      dataUrl: String(reader.result),
      name: file.name,
      type: file.type,
      size: file.size
    }), { once: true });
    reader.addEventListener('error', () => reject(new Error('Image could not be read.')), { once: true });
    reader.readAsDataURL(file);
  });
}

function componentFormMarkup(component, references) {
  const value = (field) => escapeHtml(component?.[field] ?? '');
  const selectOptions = (records, selectedId, emptyLabel) => `
    <option value="">${emptyLabel}</option>
    ${records.map((record) => `<option value="${record.id}" ${record.id === selectedId ? 'selected' : ''}>${escapeHtml(record.name)}${record.symbol ? ` (${escapeHtml(record.symbol)})` : ''}</option>`).join('')}
  `;

  return `
    <div class="library-form-grid">
      <div class="field field--wide">
        <label class="field__label" for="component-image">Image <span aria-hidden="true">(optional)</span></label>
        <input class="field__control" id="component-image" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="component-image-error">
        <span class="field__error" id="component-image-error"></span>
        <div class="component-image-preview" data-component-image-preview>${imagePreviewMarkup(component?.image)}</div>
        <span class="component-image-hint">JPG, PNG or WEBP. Maximum file size: 2 MB.</span>
        ${component?.image ? '<label class="component-image-remove"><input type="checkbox" name="removeImage"> Remove current image</label>' : ''}
      </div>
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
        <input class="field__control" id="component-manufacturer" name="manufacturer" value="${value('manufacturer')}" aria-describedby="component-manufacturer-error">
        <span class="field__error" id="component-manufacturer-error"></span>
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
      <div class="field">
        <label class="field__label" for="component-delivery-charge">Delivery charge (BDT)</label>
        <input class="field__control" id="component-delivery-charge" name="deliveryCharge" type="number" min="0" step="0.01" value="${value('deliveryCharge') || '0'}" aria-describedby="component-delivery-charge-error">
        <span class="field__error" id="component-delivery-charge-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="component-datasheet">Datasheet <span aria-hidden="true">(optional)</span></label>
        <input class="field__control" id="component-datasheet" name="datasheetUrl" type="url"
               placeholder="https://example.com/datasheet.pdf" value="${value('datasheetUrl')}"
               aria-describedby="component-datasheet-error">
        <span class="field__error" id="component-datasheet-error"></span>
        <div class="field-upload">
          <span class="field-upload__or">or upload a file</span>
          <input class="field__control field-upload__input" id="component-datasheet-file" name="datasheetFile" type="file"
                 accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,application/pdf"
                 aria-describedby="component-datasheet-file-error">
          <span class="field__error" id="component-datasheet-file-error"></span>
          <span class="component-image-hint" data-datasheet-hint>A chosen file is uploaded on save and replaces the URL above. Maximum 20 MB.</span>
        </div>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="component-description">Description <span aria-hidden="true">(optional)</span></label>
        <textarea class="field__control" id="component-description" name="description" rows="3" aria-describedby="component-description-error">${value('description')}</textarea>
        <span class="field__error" id="component-description-error"></span>
      </div>
    </div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-component-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon(component?.id ? 'check' : 'plus')}${component?.id ? 'Save changes' : 'Create component'}</button>
    </div>
  `;
}

export async function openComponentModal({ component = null, onSaved } = {}) {
  const references = await getComponentReferenceData();
  const form = document.createElement('form');
  form.className = 'component-form';
  form.noValidate = true;
  form.innerHTML = componentFormMarkup(component, references);
  const imageInput = form.elements.imageFile;
  const imagePreview = form.querySelector('[data-component-image-preview]');

  const datasheetInput = form.elements.datasheetFile;
  const datasheetUrlInput = form.elements.datasheetUrl;
  const datasheetHint = form.querySelector('[data-datasheet-hint]');

  datasheetInput.addEventListener('change', () => {
    const file = datasheetInput.files?.[0];
    setFieldError(datasheetInput, file && file.size > 20 * 1024 * 1024 ? 'Files must be 20 MB or smaller.' : '');
    datasheetUrlInput.disabled = Boolean(file);
    datasheetHint.textContent = file
      ? `“${file.name}” will be uploaded on save and used as the datasheet link.`
      : 'A chosen file is uploaded on save and replaces the URL above. Maximum 20 MB.';
  });

  imageInput.addEventListener('change', () => {
    const imageFile = imageInput.files?.[0];
    const error = validateImageFile(imageFile);
    setFieldError(imageInput, error);
    if (!imageFile || error) return;
    imagePreview.innerHTML = `<img src="${URL.createObjectURL(imageFile)}" alt="Selected component image">`;
  });

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
      const imageFile = imageInput.files?.[0];
      const imageError = validateImageFile(imageFile);
      if (imageError) {
        setFieldError(imageInput, imageError);
        return;
      }
      const formData = Object.fromEntries(new FormData(form));
      delete formData.imageFile;
      delete formData.removeImage;
      delete formData.datasheetFile;

      const datasheetFile = datasheetInput.files?.[0] || null;
      if (datasheetFile && datasheetFile.size > 20 * 1024 * 1024) {
        setFieldError(datasheetInput, 'Files must be 20 MB or smaller.');
        return;
      }
      const image = imageFile ? await readImageFile(imageFile) : form.elements.removeImage?.checked ? null : component?.image || null;
      // Live mode uploads the raw file; demo mode keeps the data URL it just read.
      const savedComponent = await saveComponent({ id: component?.id, ...formData, image, imageFile, datasheetFile });
      modal.close('saved');
      showToast(component ? 'Component updated.' : 'Component created.');
      await onSaved?.(savedComponent);
    } catch (error) {
      if (error instanceof ComponentValidationError) {
        Object.entries(error.errors).forEach(([field, message]) => {
          const control = form.elements.namedItem(field === 'image' ? 'imageFile' : field);
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

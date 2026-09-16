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
    <p class="component-form__required-note"><span aria-hidden="true">*</span> Required to create a reusable Library record.</p>
    <fieldset class="component-form__section">
      <legend><span class="component-form__step" aria-hidden="true">1</span> Component details</legend>
      <p class="component-form__section-hint">Start with the information someone needs to identify and find this part.</p>
      <div class="library-form-grid">
        <div class="field field--wide">
          <label class="field__label" for="component-name">Component name <span class="component-form__required" aria-hidden="true">*</span></label>
          <input class="field__control" id="component-name" name="name" value="${value('name')}" placeholder="e.g. 10 kΩ resistor" autocomplete="off" aria-describedby="component-name-error" required>
          <span class="field__error" id="component-name-error"></span>
        </div>
        <div class="field">
          <label class="field__label" for="component-category">Category <span class="component-form__required" aria-hidden="true">*</span></label>
          <select class="field__control" id="component-category" name="categoryId" aria-describedby="component-category-error" required>
            ${selectOptions(references.categories, component?.categoryId, 'Choose a category')}
          </select>
          <span class="field__hint">Groups similar parts in the Library.</span>
          <span class="field__error" id="component-category-error"></span>
        </div>
        <div class="field">
          <label class="field__label" for="component-unit">Unit <span class="component-form__required" aria-hidden="true">*</span></label>
          <select class="field__control" id="component-unit" name="unitId" aria-describedby="component-unit-error" data-component-unit required>
            ${selectOptions(references.units, component?.unitId, 'Choose a unit')}
          </select>
          <span class="field__hint" data-component-unit-hint>Choose the unit used for stock movements.</span>
          <span class="field__error" id="component-unit-error"></span>
        </div>
        <div class="field">
          <label class="field__label" for="component-part-number">Part number / MPN <span aria-hidden="true">(optional)</span></label>
          <input class="field__control" id="component-part-number" name="partNumber" value="${value('partNumber')}" placeholder="e.g. RC0603FR-0710KL" autocomplete="off" aria-describedby="component-part-number-error">
          <span class="field__hint">Must be unique when supplied.</span>
          <span class="field__error" id="component-part-number-error"></span>
        </div>
        <div class="field">
          <label class="field__label" for="component-manufacturer">Manufacturer <span aria-hidden="true">(optional)</span></label>
          <input class="field__control" id="component-manufacturer" name="manufacturer" value="${value('manufacturer')}" placeholder="e.g. Yageo" autocomplete="organization" aria-describedby="component-manufacturer-error">
          <span class="field__error" id="component-manufacturer-error"></span>
        </div>
        <div class="field field--wide component-image-field">
          <div class="component-image-field__copy">
            <label class="field__label" for="component-image">Reference image <span aria-hidden="true">(optional)</span></label>
            <span class="field__hint">JPG, PNG or WEBP, up to 2 MB. A clear image helps identify parts at the cabinet.</span>
            <input class="field__control" id="component-image" name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="component-image-error">
            <span class="field__error" id="component-image-error"></span>
            ${component?.image ? '<label class="component-image-remove"><input type="checkbox" name="removeImage"> Remove current image</label>' : ''}
          </div>
          <div class="component-image-preview" data-component-image-preview>${imagePreviewMarkup(component?.image)}</div>
        </div>
      </div>
    </fieldset>
    <fieldset class="component-form__section">
      <legend><span class="component-form__step" aria-hidden="true">2</span> Stock and purchasing defaults</legend>
      <p class="component-form__section-hint">These values do not add stock. They set the low-stock threshold and give future receipts a starting cost.</p>
      <div class="library-form-grid library-form-grid--three">
        <div class="field">
          <label class="field__label" for="component-minimum">Low-stock threshold</label>
          <input class="field__control" id="component-minimum" name="minimumQuantity" type="number" min="0" step="0.001" inputmode="decimal" value="${value('minimumQuantity') || '0'}" aria-describedby="component-minimum-error" data-component-minimum>
          <span class="field__hint">Alert when total stock reaches this amount.</span>
          <span class="field__error" id="component-minimum-error"></span>
        </div>
        <div class="field">
          <label class="field__label" for="component-price">Last buying price (BDT)</label>
          <input class="field__control" id="component-price" name="lastBuyingPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${value('lastBuyingPrice') || '0'}" aria-describedby="component-price-error">
          <span class="field__hint">Per-unit purchase cost before delivery.</span>
          <span class="field__error" id="component-price-error"></span>
        </div>
        <div class="field">
          <label class="field__label" for="component-delivery-charge">Delivery charge (BDT)</label>
          <input class="field__control" id="component-delivery-charge" name="deliveryCharge" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${value('deliveryCharge') || '0'}" aria-describedby="component-delivery-charge-error">
          <span class="field__hint">The delivery amount from the last purchase.</span>
          <span class="field__error" id="component-delivery-charge-error"></span>
        </div>
      </div>
    </fieldset>
    <fieldset class="component-form__section">
      <legend><span class="component-form__step" aria-hidden="true">3</span> Documents and notes <span aria-hidden="true">(optional)</span></legend>
      <p class="component-form__section-hint">Keep a datasheet or a short note where the next person can find it.</p>
      <div class="library-form-grid">
        <div class="field field--wide">
          <label class="field__label" for="component-datasheet">Datasheet link</label>
          <input class="field__control" id="component-datasheet" name="datasheetUrl" type="url"
                 placeholder="https://example.com/datasheet.pdf" value="${value('datasheetUrl')}"
                 aria-describedby="component-datasheet-error">
          <span class="field__hint">Paste a public URL, or choose a local file below.</span>
          <span class="field__error" id="component-datasheet-error"></span>
          <div class="field-upload">
            <span class="field-upload__or">or upload a datasheet</span>
            <input class="field__control field-upload__input" id="component-datasheet-file" name="datasheetFile" type="file"
                   accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*,application/pdf"
                   aria-describedby="component-datasheet-file-error">
            <span class="field__error" id="component-datasheet-file-error"></span>
            <span class="component-image-hint" data-datasheet-hint>A selected file is uploaded on save and replaces the link above. Maximum 20 MB.</span>
          </div>
        </div>
        <div class="field field--wide">
          <label class="field__label" for="component-description">Description</label>
          <textarea class="field__control" id="component-description" name="description" rows="3" placeholder="Key specifications, package type, compatible equipment, or handling notes." aria-describedby="component-description-error">${value('description')}</textarea>
          <span class="field__error" id="component-description-error"></span>
        </div>
      </div>
    </fieldset>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-component-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon(component?.id ? 'check' : 'plus')}<span data-component-submit-label>${component?.id ? 'Save changes' : 'Create component'}</span></button>
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
  const unitInput = form.elements.unitId;
  const unitHint = form.querySelector('[data-component-unit-hint]');
  const minimumInput = form.elements.minimumQuantity;
  const initialImageMarkup = imagePreviewMarkup(component?.image);

  const updateUnitGuidance = () => {
    const unit = references.units.find((item) => item.id === unitInput.value);
    if (!unit) {
      minimumInput.step = '0.001';
      unitHint.textContent = 'Choose the unit used for stock movements.';
      return;
    }
    const allowsFraction = unit.allowsFraction ?? unit.allowFraction === true;
    minimumInput.step = allowsFraction ? '0.001' : '1';
    unitHint.textContent = `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ''}: ${allowsFraction ? 'decimal quantities are allowed.' : 'whole quantities only.'}`;
  };

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
    if (!imageFile) {
      imagePreview.innerHTML = initialImageMarkup;
      return;
    }
    if (error) return;
    imagePreview.innerHTML = `<img src="${URL.createObjectURL(imageFile)}" alt="Selected component image">`;
  });

  unitInput.addEventListener('change', updateUnitGuidance);
  updateUnitGuidance();

  form.addEventListener('input', (event) => {
    const control = event.target.closest('[aria-describedby]');
    if (control) setFieldError(control, '');
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
    const submitLabel = form.querySelector('[data-component-submit-label]');
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (submitLabel) submitLabel.textContent = component ? 'Saving…' : 'Creating…';

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
      submitButton.removeAttribute('aria-busy');
      if (submitLabel) submitLabel.textContent = component ? 'Save changes' : 'Create component';
    }
  });
}

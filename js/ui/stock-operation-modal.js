import { listProjects } from '../services/project-service.js';
import {
  addStock,
  getInventoryWorkspace,
  returnStock,
  StockOperationValidationError,
  takeStock,
  transferStock
} from '../services/inventory-service.js';
import { setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../utils/dom.js';
import { formatQuantity } from '../utils/formatters.js';

const operationLabels = {
  add: 'Add stock',
  take: 'Take stock',
  return: 'Return stock',
  transfer: 'Transfer stock'
};

function field(label, name, { type = 'text', value = '', min = '', step = '', required = false, placeholder = '' } = {}) {
  const controlId = `stock-operation-${name}`;
  const attributes = [
    `id="${controlId}"`,
    `name="${name}"`,
    `type="${type}"`,
    `value="${escapeHtml(value)}"`,
    `aria-describedby="${controlId}-error"`,
    required ? 'required' : '',
    min !== '' ? `min="${min}"` : '',
    step !== '' ? `step="${step}"` : '',
    placeholder ? `placeholder="${escapeHtml(placeholder)}"` : ''
  ].filter(Boolean).join(' ');

  return `
    <div class="field">
      <label class="field__label" for="${controlId}">${label}${required ? '' : ' (optional)'}</label>
      <input class="field__control" ${attributes}>
      <span class="field__error" id="${controlId}-error"></span>
    </div>
  `;
}

function noteField(required) {
  return `
    <div class="field field--wide">
      <label class="field__label" for="stock-operation-note">Note${required ? '' : ' (optional)'}</label>
      <textarea class="field__control" id="stock-operation-note" name="note" rows="3" aria-describedby="stock-operation-note-error" ${required ? 'required' : ''}></textarea>
      <span class="field__error" id="stock-operation-note-error"></span>
    </div>
  `;
}

function transferDestinationField(cabinet, drawer) {
  const options = cabinet.drawers
    .filter((candidate) => candidate.id !== drawer.id)
    .map((candidate) => {
      const unavailable = candidate.componentId && candidate.componentId !== drawer.componentId;
      const descriptor = candidate.component ? ` · ${candidate.component.name}` : ' · Empty';
      return `<option value="${candidate.id}" ${unavailable ? 'disabled' : ''}>${escapeHtml(candidate.code)}${escapeHtml(descriptor)}${unavailable ? ' (unavailable)' : ''}</option>`;
    }).join('');

  return `
    <div class="field field--wide">
      <label class="field__label" for="stock-operation-destination">Destination drawer</label>
      <select class="field__control" id="stock-operation-destination" name="destinationDrawerId" aria-describedby="stock-operation-destinationDrawerId-error" required>
        <option value="">Choose a drawer</option>
        ${options}
      </select>
      <span class="field__error" id="stock-operation-destinationDrawerId-error"></span>
    </div>
  `;
}

function projectField(projects) {
  return `
    <div class="field field--wide">
      <label class="field__label" for="stock-operation-project">Project (optional)</label>
      <select class="field__control" id="stock-operation-project" name="projectId" aria-describedby="stock-operation-projectId-error">
        <option value="">No project tag</option>
        ${projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('')}
      </select>
      <span class="field__error" id="stock-operation-projectId-error"></span>
    </div>
  `;
}

function operationFields(operation, cabinet, drawer, projects) {
  const quantity = field(`Quantity (${drawer.unit.symbol})`, 'quantity', { type: 'number', value: '1', min: '0.001', step: '0.001', required: true });

  if (operation === 'add') {
    return `<div class="stock-operation-form__grid">${quantity}${field('Unit price (BDT)', 'unitPrice', { type: 'number', min: '0', step: '0.01' })}${field('Delivery charge (BDT)', 'deliveryCharge', { type: 'number', min: '0', step: '0.01' })}${noteField(false)}</div>`;
  }
  if (operation === 'take') {
    return `<div class="stock-operation-form__grid">${quantity}${projectField(projects)}${noteField(false)}</div>`;
  }
  if (operation === 'return') {
    return `<div class="stock-operation-form__grid">${quantity}${noteField(true)}</div>`;
  }
  return `<div class="stock-operation-form__grid">${transferDestinationField(cabinet, drawer)}${quantity}${noteField(false)}</div>`;
}

function getFormPayload(form) {
  return Object.fromEntries(new FormData(form));
}

async function performOperation(operation, payload) {
  if (operation === 'add') return addStock(payload);
  if (operation === 'take') return takeStock(payload);
  if (operation === 'return') return returnStock(payload);
  return transferStock(payload);
}

export async function openStockOperationModal({ operation, cabinet, drawer }) {
  const [projects, workspace] = await Promise.all([listProjects({ activeOnly: true }), getInventoryWorkspace()]);
  const currentCabinet = workspace.cabinets.find((item) => item.id === cabinet.id) || cabinet;
  const currentDrawer = currentCabinet.drawers.find((item) => item.id === drawer.id) || drawer;
  const form = document.createElement('form');

  form.className = 'stock-operation-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="stock-operation-source">
      <strong>${escapeHtml(currentDrawer.component.name)}</strong>
      <span>${escapeHtml(currentCabinet.name)} · ${currentDrawer.code} · ${formatQuantity(currentDrawer.quantity, currentDrawer.unit.symbol)} available</span>
    </div>
    ${operationFields(operation, currentCabinet, currentDrawer, projects)}
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-stock-operation-cancel>Cancel</button>
      <button class="button" type="submit">${operationLabels[operation]}</button>
    </div>
  `;

  let modal;
  modal = openModal({
    title: operationLabels[operation],
    description: `Update stock for ${currentCabinet.name} · ${currentDrawer.code}.`,
    content: form
  });

  form.querySelector('[data-stock-operation-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    form.querySelectorAll('.field__error').forEach((element) => { element.textContent = ''; });
    form.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.setAttribute('aria-invalid', 'false'));

    try {
      const formData = getFormPayload(form);
      await performOperation(operation, {
        cabinetId: currentCabinet.id,
        drawerId: currentDrawer.id,
        ...formData
      });
      modal.close('saved');
      showToast(`${operationLabels[operation]} completed.`);
    } catch (error) {
      if (error instanceof StockOperationValidationError) {
        Object.entries(error.errors).forEach(([name, message]) => {
          const control = form.elements.namedItem(name);
          if (control) setFieldError(control, message);
        });
      } else {
        showToast('The stock operation could not be completed. Please try again.', { type: 'error' });
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}

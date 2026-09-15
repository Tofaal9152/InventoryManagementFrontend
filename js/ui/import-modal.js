import {
  FileTransferError,
  commitImport,
  downloadImportTemplate,
  previewImport
} from '../services/file-service.js';
import { confirmAction } from './confirm-dialog.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';

const COPY = Object.freeze({
  library: {
    title: 'Import components',
    description: 'Create or update Library components from a spreadsheet. Rows are matched by part number, or by name when it is blank.'
  },
  inventory: {
    title: 'Import stock',
    description: 'Set chamber quantities from a spreadsheet. Nothing is saved until you commit.'
  }
});

function rejectedList(rows) {
  if (!rows.length) return '';
  const items = rows.slice(0, 10).map((row) => `
    <li><strong>Row ${escapeHtml(String(row.row ?? '?'))}</strong> ${escapeHtml(row.reason || row.error || 'Rejected')}</li>
  `).join('');
  const more = rows.length > 10 ? `<li>…and ${rows.length - 10} more</li>` : '';
  return `<ul class="import-rejects">${items}${more}</ul>`;
}

function summaryMarkup(preview) {
  const { toCreate, toUpdate, rejected } = preview.summary;
  return `
    <div class="import-summary" role="status">
      <div><strong>${toCreate}</strong><span>to create</span></div>
      <div><strong>${toUpdate}</strong><span>to update</span></div>
      <div class="${rejected ? 'is-rejected' : ''}"><strong>${rejected}</strong><span>rejected</span></div>
    </div>
    ${rejected ? `<p class="import-note">${renderIcon('alert')}Rejected rows are skipped; everything else still applies.</p>${rejectedList(preview.rejected)}` : ''}
  `;
}

/**
 * Import is deliberately two steps: preview validates and saves nothing, then
 * commit applies the valid rows in one transaction.
 */
export function openImportModal({ kind = 'library', onImported } = {}) {
  const copy = COPY[kind] || COPY.library;
  const form = document.createElement('form');
  form.className = 'import-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="field field--wide">
      <label class="field__label" for="import-file">Spreadsheet (.xlsx or .csv, max 10 MB)</label>
      <input class="field__control" id="import-file" name="file" type="file" accept=".xlsx,.csv" aria-describedby="import-file-error" required>
      <span class="field__error" id="import-file-error"></span>
    </div>
    <p class="import-note">
      ${renderIcon('info')}Not sure about the columns?
      <button class="link-button" type="button" data-download-template>Download the template</button>
    </p>
    <div data-import-result hidden></div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-import-cancel>${renderIcon('close')}Cancel</button>
      <button class="button button--secondary" type="button" data-import-preview>${renderIcon('view')}Check file</button>
      <button class="button" type="button" data-import-commit disabled>${renderIcon('import')}Import rows</button>
    </div>
  `;

  const modal = openModal({ title: copy.title, description: copy.description, content: form });

  const fileInput = form.elements.file;
  const errorText = form.querySelector('#import-file-error');
  const result = form.querySelector('[data-import-result]');
  const previewButton = form.querySelector('[data-import-preview]');
  const commitButton = form.querySelector('[data-import-commit]');
  let preview = null;

  const setError = (message) => {
    errorText.textContent = message || '';
    fileInput.setAttribute('aria-invalid', message ? 'true' : 'false');
  };

  const busy = (button, isBusy, label) => {
    button.disabled = isBusy;
    button.setAttribute('aria-busy', String(isBusy));
    if (label) button.lastElementChild?.replaceWith?.(label);
  };

  fileInput.addEventListener('change', () => {
    preview = null;
    commitButton.disabled = true;
    result.hidden = true;
    result.innerHTML = '';
    setError('');
  });

  form.querySelector('[data-import-cancel]').addEventListener('click', () => modal.close('cancelled'));

  form.querySelector('[data-download-template]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await downloadImportTemplate(kind);
    } catch (error) {
      showToast(error?.message || 'The template could not be downloaded.', { type: 'error' });
    } finally {
      button.disabled = false;
    }
  });

  previewButton.addEventListener('click', async () => {
    setError('');
    const file = fileInput.files?.[0];

    busy(previewButton, true);
    try {
      preview = await previewImport(kind, file);
      result.innerHTML = summaryMarkup(preview);
      result.hidden = false;
      commitButton.disabled = preview.summary.toCreate + preview.summary.toUpdate === 0;
      if (commitButton.disabled) showToast('Nothing in that file can be imported.', { type: 'error' });
    } catch (error) {
      preview = null;
      commitButton.disabled = true;
      if (error instanceof FileTransferError) setError(error.message);
      else showToast(error?.message || 'The file could not be checked.', { type: 'error' });
    } finally {
      busy(previewButton, false);
    }
  });

  commitButton.addEventListener('click', async () => {
    if (!preview) return;
    const { toCreate, toUpdate, rejected } = preview.summary;

    const confirmed = await confirmAction({
      title: `Import ${toCreate + toUpdate} row${toCreate + toUpdate === 1 ? '' : 's'}?`,
      description: `${toCreate} created, ${toUpdate} updated${rejected ? `, ${rejected} skipped` : ''}. `
        + 'Applied in one transaction and written to the audit log.',
      confirmLabel: 'Import rows',
      tone: 'default'
    });
    if (!confirmed) return;

    busy(commitButton, true);
    try {
      const committed = await commitImport(kind, fileInput.files?.[0]);
      modal.close('imported');
      showToast(`${committed.summary.toCreate + committed.summary.toUpdate} rows imported.`);
      await onImported?.();
    } catch (error) {
      showToast(error?.message || 'The import could not be completed.', { type: 'error' });
      busy(commitButton, false);
    }
  });
}

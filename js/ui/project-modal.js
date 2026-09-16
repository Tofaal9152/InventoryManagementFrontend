import { ProjectValidationError, createProject, updateProject } from '../services/project-service.js';
import { clearFieldErrorOnChange, clearFormErrors, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { renderIcon } from './icons.js';
import { escapeHtml } from '../utils/dom.js';

export function openCreateProjectModal({ onCreated } = {}) {
  const form = document.createElement('form');
  form.className = 'project-form';
  form.noValidate = true;
  form.innerHTML = `
    <p class="project-form__required-note"><span aria-hidden="true">*</span> Required to create a project that can be used for stock take operations.</p>
    <div class="project-form__grid">
      <div class="field field--wide">
        <label class="field__label" for="project-name">Project name <span class="project-form__required" aria-hidden="true">*</span></label>
        <input class="field__control" id="project-name" name="name" type="text" maxlength="100" placeholder="e.g. Workshop automation upgrade" autocomplete="off" aria-describedby="project-name-error" required>
        <span class="field__hint">Use the name your team will recognise when tagging taken stock.</span>
        <span class="field__error" id="project-name-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="project-status">Status</label>
        <select class="field__control" id="project-status" name="status" aria-describedby="project-status-error">
          <option value="Active">Active</option>
          <option value="Closed">Closed</option>
        </select>
        <span class="field__hint" data-project-status-hint aria-live="polite"></span>
        <span class="field__error" id="project-status-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="project-description">Description <span aria-hidden="true">(optional)</span></label>
        <textarea class="field__control" id="project-description" name="description" rows="4" maxlength="1000" placeholder="State the purpose, owner, or key work this stock supports." aria-describedby="project-description-error" data-project-description></textarea>
        <div class="project-form__description-meta"><span class="field__hint">A short description makes project records easier to identify later.</span><span data-project-description-count aria-live="polite">0 / 1000</span></div>
        <span class="field__error" id="project-description-error"></span>
      </div>
    </div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-project-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon('projects')}<span data-project-submit-label>Create project</span></button>
    </div>
  `;

  const modal = openModal({
    title: 'Create project',
    description: 'Projects can be selected when recording component take operations.',
    content: form
  });
  form.querySelector('[data-project-cancel]').addEventListener('click', () => modal.close('cancelled'));
  clearFieldErrorOnChange(form);

  const statusInput = form.elements.status;
  const statusHint = form.querySelector('[data-project-status-hint]');
  const updateStatusHint = () => {
    statusHint.textContent = statusInput.value === 'Closed'
      ? 'Closed projects are kept for reporting, but cannot be selected for new stock takes.'
      : 'Active projects can be selected when recording stock takes.';
  };
  statusInput.addEventListener('change', updateStatusHint);
  updateStatusHint();

  const descriptionInput = form.elements.description;
  const descriptionCount = form.querySelector('[data-project-description-count]');
  const updateDescriptionCount = () => {
    descriptionCount.textContent = `${descriptionInput.value.length} / 1000`;
  };
  descriptionInput.addEventListener('input', updateDescriptionCount);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    const submitLabel = form.querySelector('[data-project-submit-label]');
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (submitLabel) submitLabel.textContent = 'Creating…';
    clearFormErrors(form);
    try {
      const project = await createProject(Object.fromEntries(new FormData(form)));
      modal.close('created');
      showToast(`${project.name} has been created.`);
      await onCreated?.(project);
    } catch (error) {
      if (error instanceof ProjectValidationError) {
        Object.entries(error.errors).forEach(([field, message]) => {
          const control = form.elements.namedItem(field);
          if (control) setFieldError(control, message);
        });
      } else {
        showToast('The project could not be created. Please try again.', { type: 'error' });
      }
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      if (submitLabel) submitLabel.textContent = 'Create project';
    }
  });
}

/** Edit only the fields the project PATCH endpoint accepts; close/reopen owns status. */
export function openEditProjectModal({ project, onSaved } = {}) {
  const form = document.createElement('form');
  form.className = 'project-form';
  form.noValidate = true;
  form.innerHTML = `
    <p class="project-form__required-note"><span aria-hidden="true">*</span> Required fields</p>
    <div class="project-form__grid">
      <div class="field field--wide">
        <label class="field__label" for="edit-project-name">Project name <span class="project-form__required" aria-hidden="true">*</span></label>
        <input class="field__control" id="edit-project-name" name="name" type="text" maxlength="255" value="${escapeHtml(project.name || '')}" autocomplete="off" aria-describedby="edit-project-name-error" required>
        <span class="field__hint">Use a unique, recognisable project name.</span>
        <span class="field__error" id="edit-project-name-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="edit-project-description">Description <span aria-hidden="true">(optional)</span></label>
        <textarea class="field__control" id="edit-project-description" name="description" rows="4" maxlength="1000" aria-describedby="edit-project-description-error" data-edit-project-description>${escapeHtml(project.description || '')}</textarea>
        <div class="project-form__description-meta"><span class="field__hint">To close or reopen this project, use the separate project status action.</span><span data-edit-project-description-count aria-live="polite"></span></div>
        <span class="field__error" id="edit-project-description-error"></span>
      </div>
    </div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-edit-project-cancel>${renderIcon('close')}Cancel</button>
      <button class="button" type="submit">${renderIcon('check')}<span data-edit-project-submit-label>Save changes</span></button>
    </div>
  `;

  const modal = openModal({
    title: `Edit ${project.name}`,
    description: 'Update the project name or description. Status is managed separately so its history remains clear.',
    content: form
  });
  form.querySelector('[data-edit-project-cancel]').addEventListener('click', () => modal.close('cancelled'));
  clearFieldErrorOnChange(form);
  const descriptionInput = form.elements.description;
  const descriptionCount = form.querySelector('[data-edit-project-description-count]');
  const updateDescriptionCount = () => { descriptionCount.textContent = `${descriptionInput.value.length} / 1000`; };
  descriptionInput.addEventListener('input', updateDescriptionCount);
  updateDescriptionCount();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton.disabled) return;
    const submitLabel = form.querySelector('[data-edit-project-submit-label]');
    clearFormErrors(form);
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    if (submitLabel) submitLabel.textContent = 'Saving…';
    try {
      await updateProject({ id: project.id, ...Object.fromEntries(new FormData(form)) });
      modal.close('saved');
      showToast('Project updated.');
      await onSaved?.();
    } catch (error) {
      if (error instanceof ProjectValidationError) {
        Object.entries(error.errors).forEach(([field, message]) => {
          const control = form.elements.namedItem(field);
          if (control && message) setFieldError(control, message);
        });
        if (error.errors.form) showToast(error.errors.form, { type: 'error' });
      } else {
        showToast(error?.message || 'The project could not be updated.', { type: 'error' });
      }
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      if (submitLabel) submitLabel.textContent = 'Save changes';
    }
  });
}

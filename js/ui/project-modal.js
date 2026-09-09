import { ProjectValidationError, createProject } from '../services/project-service.js';
import { clearFormErrors, setFieldError } from './form-fields.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';

export function openCreateProjectModal({ onCreated } = {}) {
  const form = document.createElement('form');
  form.className = 'project-form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="project-form__grid">
      <div class="field field--wide">
        <label class="field__label" for="project-name">Project name</label>
        <input class="field__control" id="project-name" name="name" type="text" maxlength="100" autocomplete="off" aria-describedby="project-name-error" required>
        <span class="field__error" id="project-name-error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="project-status">Status</label>
        <select class="field__control" id="project-status" name="status" aria-describedby="project-status-error">
          <option value="Active">Active</option>
          <option value="Closed">Closed</option>
        </select>
        <span class="field__error" id="project-status-error"></span>
      </div>
      <div class="field field--wide">
        <label class="field__label" for="project-description">Description <span aria-hidden="true">(optional)</span></label>
        <textarea class="field__control" id="project-description" name="description" rows="4" maxlength="1000" aria-describedby="project-description-error"></textarea>
        <span class="field__error" id="project-description-error"></span>
      </div>
    </div>
    <div class="dialog__actions">
      <button class="button button--secondary" type="button" data-project-cancel>Cancel</button>
      <button class="button" type="submit">Create project</button>
    </div>
  `;

  const modal = openModal({
    title: 'Create project',
    description: 'Projects can be selected when recording component take operations.',
    content: form
  });
  form.querySelector('[data-project-cancel]').addEventListener('click', () => modal.close('cancelled'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
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
    }
  });
}

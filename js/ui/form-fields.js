export function setFieldError(control, message) {
  const errorElement = document.querySelector(`#${control.getAttribute('aria-describedby')}`);
  control.setAttribute('aria-invalid', message ? 'true' : 'false');

  if (errorElement) {
    errorElement.textContent = message || '';
  }
}

export function clearFormErrors(form) {
  form.querySelectorAll('[aria-invalid="true"]').forEach((control) => {
    control.setAttribute('aria-invalid', 'false');
  });
  form.querySelectorAll('.field__error').forEach((element) => {
    element.textContent = '';
  });
}

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

/** Clear a field's previous message as soon as the user changes that field. */
export function clearFieldErrorOnChange(form) {
  const clear = (event) => {
    const control = event.target.closest?.('[aria-describedby]');
    if (control) setFieldError(control, '');
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);
}

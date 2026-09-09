let toastRegion;

function getToastRegion() {
  if (toastRegion) {
    return toastRegion;
  }

  toastRegion = document.createElement('div');
  toastRegion.className = 'toast-region';
  toastRegion.setAttribute('aria-live', 'polite');
  toastRegion.setAttribute('aria-atomic', 'true');
  document.body.append(toastRegion);
  return toastRegion;
}

export function showToast(message, { type = 'success', duration = 3500 } = {}) {
  const toast = document.createElement('div');
  const closeButton = document.createElement('button');
  const messageElement = document.createElement('span');
  let timeoutId;

  toast.className = `toast toast--${type}`;
  messageElement.textContent = message;
  closeButton.className = 'toast__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Dismiss notification');
  closeButton.textContent = '×';

  const dismiss = () => {
    clearTimeout(timeoutId);
    toast.remove();
  };

  closeButton.addEventListener('click', dismiss);
  toast.append(messageElement, closeButton);
  getToastRegion().append(toast);
  timeoutId = window.setTimeout(dismiss, duration);

  return dismiss;
}

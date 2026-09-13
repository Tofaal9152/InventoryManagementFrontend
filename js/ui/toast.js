import { renderIcon } from './icons.js';

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

  const body = document.createElement('div');

  toast.className = `toast toast--${type}`;
  body.className = 'toast__body';
  body.innerHTML = renderIcon(type === 'error' ? 'error' : 'success', { className: 'icon toast__icon' });
  messageElement.textContent = message;
  body.append(messageElement);
  closeButton.className = 'toast__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Dismiss notification');
  closeButton.innerHTML = renderIcon('close');

  const dismiss = () => {
    clearTimeout(timeoutId);
    toast.remove();
  };

  closeButton.addEventListener('click', dismiss);
  toast.append(body, closeButton);
  getToastRegion().append(toast);
  timeoutId = window.setTimeout(dismiss, duration);

  return dismiss;
}

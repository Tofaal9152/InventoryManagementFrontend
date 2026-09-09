import { openModal } from './modal.js';

export function confirmAction({ title, description, confirmLabel = 'Confirm', tone = 'danger' }) {
  return new Promise((resolve) => {
    const actions = document.createElement('div');
    const cancelButton = document.createElement('button');
    const confirmButton = document.createElement('button');

    actions.className = 'dialog__actions';
    cancelButton.className = 'button button--secondary';
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    confirmButton.className = `button ${tone === 'danger' ? 'button--danger' : ''}`;
    confirmButton.type = 'button';
    confirmButton.textContent = confirmLabel;
    actions.append(cancelButton, confirmButton);

    const { close } = openModal({
      title,
      description,
      content: actions,
      onClose: (result) => resolve(result === 'confirmed')
    });

    cancelButton.addEventListener('click', () => close('cancelled'));
    confirmButton.addEventListener('click', () => close('confirmed'));
  });
}

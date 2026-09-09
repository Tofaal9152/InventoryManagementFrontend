export function openModal({ title, description = '', content, onClose }) {
  const activeElement = document.activeElement;
  const dialog = document.createElement('dialog');
  const wrapper = document.createElement('div');
  const heading = document.createElement('h2');
  const descriptionElement = document.createElement('p');

  dialog.className = 'dialog';
  wrapper.className = 'dialog__content';
  heading.className = 'dialog__title';
  heading.textContent = title;
  descriptionElement.className = 'dialog__description';
  descriptionElement.textContent = description;
  wrapper.append(heading);

  if (description) {
    wrapper.append(descriptionElement);
  }
  if (content) {
    wrapper.append(content);
  }

  dialog.append(wrapper);
  document.body.append(dialog);

  const close = (result = 'dismissed') => {
    if (dialog.open) {
      dialog.close(result);
    }
  };

  dialog.addEventListener('close', () => {
    dialog.remove();
    activeElement?.focus?.();
    onClose?.(dialog.returnValue || 'dismissed');
  }, { once: true });

  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;

    const bounds = dialog.getBoundingClientRect();
    const clickedInsideDialog = event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;

    if (!clickedInsideDialog) {
      close('dismissed');
    }
  });

  dialog.showModal();
  return { close, dialog };
}

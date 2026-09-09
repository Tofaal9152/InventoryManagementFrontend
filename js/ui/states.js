export function createStatePanel({ title, description, action } = {}) {
  const panel = document.createElement('section');
  const heading = document.createElement('h2');
  const body = document.createElement('p');

  panel.className = 'state-panel';
  heading.className = 'state-panel__title';
  body.className = 'state-panel__description';
  heading.textContent = title || 'Nothing to show yet';
  body.textContent = description || '';
  panel.append(heading, body);

  if (action) {
    panel.append(action);
  }

  return panel;
}

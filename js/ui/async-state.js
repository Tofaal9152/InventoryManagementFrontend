import { escapeHtml } from '../utils/dom.js';
import { renderIcon } from './icons.js';

/**
 * The loading and error panels every data page shows while it talks to the API.
 * Kept in one place so a page never sits on a dead "Loading…" screen.
 */

export function renderLoadingState(container, { title = 'Loading…', description = '' } = {}) {
  container.innerHTML = `
    <section class="state-panel" aria-busy="true" aria-live="polite">
      <h2 class="state-panel__title">${renderIcon('refresh')}${escapeHtml(title)}</h2>
      ${description ? `<p class="state-panel__description">${escapeHtml(description)}</p>` : ''}
      <div class="state-panel__skeleton" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </section>
  `;
}

/**
 * A failed load, with the next move attached. A 401 is left alone: the shell
 * already redirects to the login screen, so an error panel would only flash.
 */
export function renderErrorState(container, { error, title = 'Could not load this page', onRetry } = {}) {
  if (error?.sessionExpired) return;

  const message = error?.message || 'Something went wrong. Try again.';
  const isPermission = error?.status === 403;

  container.innerHTML = `
    <section class="state-panel state-panel--error" role="alert">
      <h2 class="state-panel__title">${renderIcon(isPermission ? 'info' : 'alert')}${escapeHtml(isPermission ? 'Not available for your role' : title)}</h2>
      <p class="state-panel__description">${escapeHtml(message)}</p>
      ${onRetry && !isPermission
        ? `<button class="button button--secondary" type="button" data-state-retry>${renderIcon('refresh')}Try again</button>`
        : ''}
    </section>
  `;

  const retry = container.querySelector('[data-state-retry]');
  retry?.addEventListener('click', async () => {
    retry.disabled = true;
    retry.setAttribute('aria-busy', 'true');
    await onRetry();
  }, { once: true });
}

/** Wraps a page load so loading, error and retry behave the same everywhere. */
export async function loadInto(container, load, { loading = {}, errorTitle, retry } = {}) {
  renderLoadingState(container, loading);
  try {
    return await load();
  } catch (error) {
    renderErrorState(container, { error, title: errorTitle, onRetry: retry });
    return undefined;
  }
}

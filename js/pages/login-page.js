import { APP_CONFIG } from '../config.js';
import { SignInError, signIn } from '../services/auth-service.js';
import { clearFormErrors, setFieldError } from '../ui/form-fields.js';
import { renderIcon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

let loginController;

export function destroyLoginPage() {
  loginController?.abort();
  loginController = null;
}

function field({ name, label, type, autocomplete }) {
  const id = `login-${name}`;
  return `
    <div class="field">
      <label class="field__label" for="${id}">${label}</label>
      <input class="field__control" id="${id}" name="${name}" type="${type}" autocomplete="${autocomplete}"
             aria-describedby="${id}-error" required>
      <span class="field__error" id="${id}-error"></span>
    </div>
  `;
}

export function renderLoginPage(container, { onSignedIn, reason = '' } = {}) {
  destroyLoginPage();

  container.innerHTML = `
    <section class="login-page" aria-labelledby="login-title">
      <div class="login-card">
        <div class="login-card__brand">
          ${renderIcon('brand', { className: 'login-card__mark' })}
          <div>
            <h1 class="login-card__title" id="login-title">${APP_CONFIG.appName}</h1>
            <p class="login-card__subtitle">Sign in to manage components and stock.</p>
          </div>
        </div>

        <p class="login-card__notice" data-login-notice ${reason ? '' : 'hidden'}>
          ${renderIcon('info')}<span>${reason}</span>
        </p>

        <form class="login-form" novalidate data-login-form>
          ${field({ name: 'email', label: 'Email address', type: 'email', autocomplete: 'username' })}
          ${field({ name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' })}

          <p class="login-form__error" role="alert" data-login-error hidden></p>

          <button class="button login-form__submit" type="submit" data-login-submit>
            ${renderIcon('check')}<span data-login-submit-label>Sign in</span>
          </button>
        </form>
      </div>
    </section>
  `;

  loginController = new AbortController();
  const form = container.querySelector('[data-login-form]');
  const submit = container.querySelector('[data-login-submit]');
  const submitLabel = container.querySelector('[data-login-submit-label]');
  const errorBox = container.querySelector('[data-login-error]');

  const showFormError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  };

  const setBusy = (busy) => {
    submit.disabled = busy;
    submit.setAttribute('aria-busy', String(busy));
    submitLabel.textContent = busy ? 'Signing in…' : 'Sign in';
    form.elements.email.disabled = busy;
    form.elements.password.disabled = busy;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;

    clearFormErrors(form);
    showFormError('');
    setBusy(true);

    try {
      const session = await signIn({
        email: form.elements.email.value,
        password: form.elements.password.value
      });
      showToast(`Signed in as ${session.user?.fullName || session.user?.email || 'user'}.`);
      onSignedIn?.(session);
    } catch (error) {
      if (!(error instanceof SignInError)) throw error;

      const { fields } = error;
      if (fields.email) setFieldError(form.elements.email, fields.email);
      if (fields.password) setFieldError(form.elements.password, fields.password);

      const handled = Boolean(fields.email || fields.password);
      showFormError(handled && fields.email && fields.password ? '' : error.message);

      const focusTarget = fields.email ? form.elements.email : form.elements.password;
      setBusy(false);
      focusTarget.focus();
      return;
    }

    setBusy(false);
  }, { signal: loginController.signal });

  form.elements.email.focus();
}

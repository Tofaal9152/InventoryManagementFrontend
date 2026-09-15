import { APP_CONFIG, DEFAULT_ROUTE, NAVIGATION } from './config.js';
import { initializeRouter, navigateTo } from './router.js';
import { initialiseDemoSession, resetDemoSession } from './services/demo-session-service.js';
import { confirmAction } from './ui/confirm-dialog.js';
import { showToast } from './ui/toast.js';
import { renderIcon } from './ui/icons.js';
import { escapeHtml } from './utils/dom.js';
import { destroyInventoryPage, renderInventoryPage } from './pages/inventory-page.js';
import { destroyLibraryPage, renderComponentDetailsPage, renderLibraryPage } from './pages/library-page.js';
import { destroyDashboardPage, renderDashboardPage } from './pages/dashboard-page.js';
import { destroyProjectsPage, renderProjectDetailsPage, renderProjectsPage } from './pages/projects-page.js';
import { renderReportsPage } from './pages/reports-page.js';
import { destroyRequisitionsPage, renderRequisitionDetailsPage, renderRequisitionsPage } from './pages/requisitions-page.js';
import { destroyAdministrationPage, renderAdministrationPage, renderAuditLogPage } from './pages/administration-page.js';
import { destroyLoginPage, renderLoginPage } from './pages/login-page.js';
import { canAdministerUsers, getEffectiveRole } from './services/permission-service.js';
import {
  getSignedInRoleLabel,
  getSignedInUser,
  isSignedIn,
  signOut,
  subscribeToSession
} from './services/auth-service.js';

const routeView = document.querySelector('#route-view');
const navigationRoot = document.querySelector('#primary-nav');
const appSidebar = document.querySelector('.app-sidebar');
const menuToggle = document.querySelector('#menu-toggle');
const sidebarAccount = document.querySelector('#sidebar-account');

const pageCopy = {
  '/dashboard': {
    title: 'Dashboard',
    heading: 'Inventory workspace is ready.',
    description: 'The application shell and clean routes are in place. Demo inventory, drawers and stock activity will be added in the next steps.',
    cards: [
      ['Library', 'Master component catalog will live here.'],
      ['Inventory', '2D cabinet drawers and stock actions are planned here.'],
      ['Projects', 'Optional project tags will connect to Take operations.']
    ]
  },
  '/inventory': {
    title: 'Inventory',
    heading: 'Cabinet inventory is being prepared.',
    description: 'This route is ready for the 2D cabinet workspace. Cabinet groups, drawer selection and the right-side details panel are planned for Step 3.',
    cards: [
      ['2D only', 'No 3D, canvas or WebGL will be used.'],
      ['Lightweight', 'The layout is designed for Raspberry Pi-friendly rendering.'],
      ['Connected later', 'The screen will use services that can switch from demo data to the backend API.']
    ]
  }
};

function visibleNavigation() {
  return NAVIGATION.filter(({ adminOnly }) => !adminOnly || canAdministerUsers());
}

function renderNotPermittedPage(label) {
  return `
    <section class="state-panel" aria-labelledby="not-permitted-title">
      <h2 class="state-panel__title" id="not-permitted-title">${renderIcon('alert')}${escapeHtml(label)} is not available for your role</h2>
      <p class="state-panel__description">This area is limited to Admins. Ask an Admin if you need access.</p>
      <a class="button" href="${DEFAULT_ROUTE}" data-route-link>${renderIcon('dashboard')}Go to dashboard</a>
    </section>
  `;
}

function renderNavigation(activePath) {
  navigationRoot.innerHTML = visibleNavigation().map(({ path, label, icon }) => `
    <a class="nav-link" href="${path}" data-route-link ${path === activePath ? 'aria-current="page"' : ''}>
      ${renderIcon(icon, { className: 'nav-link__icon' })}
      <span class="nav-link__label">${label}</span>
    </a>
  `).join('');
}

function closeNavigation() {
  appSidebar.classList.remove('is-navigation-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
}

function renderPlannedPage(route) {
  const navigationItem = NAVIGATION.find(({ path }) => path === route);
  const title = navigationItem?.label || 'Page';

  return `
    <section class="foundation-panel" aria-labelledby="route-heading">
      <div>
        <p class="eyebrow">Planned route</p>
        <h2 id="route-heading">${title} will be built in a later step.</h2>
      </div>
      <p>This page route is available now so the navigation and future API integration use clean, stable URLs from the beginning.</p>
      <a class="button" href="${DEFAULT_ROUTE}" data-route-link>${renderIcon('back')}Back to dashboard</a>
    </section>
  `;
}

function renderNotFoundPage() {
  return `
    <section class="not-found" aria-labelledby="not-found-title">
      <p class="eyebrow">404</p>
      <h2 id="not-found-title">This page is not available.</h2>
      <p>Use the navigation to return to the inventory workspace.</p>
      <a class="button" href="${DEFAULT_ROUTE}" data-route-link>${renderIcon('dashboard')}Go to dashboard</a>
    </section>
  `;
}

function renderFoundationPage(page) {
  const cards = page.cards.map(([title, description]) => `
    <article class="foundation-card">
      <strong>${title}</strong>
      <span>${description}</span>
    </article>
  `).join('');

  return `
    <section class="foundation-panel" aria-labelledby="route-heading">
      <div>
        <p class="eyebrow">${APP_CONFIG.mode} mode</p>
        <h2 id="route-heading">${page.heading}</h2>
      </div>
      <p>${page.description}</p>
      <div class="foundation-grid">${cards}</div>
      ${page.title === 'Dashboard' ? `<button class="button button--secondary" type="button" data-reset-demo>${renderIcon('refresh')}Reset demo data</button>` : ''}
    </section>
  `;
}

function renderAccountFooter() {
  const dataLabel = APP_CONFIG.mode === 'demo' ? 'Demo data' : 'Live data';

  if (!isSignedIn()) {
    sidebarAccount.innerHTML = `
      <div class="sidebar-account">
        <div class="sidebar-account__identity">
          <span class="sidebar-account__name">Not signed in</span>
          <span class="sidebar-account__role">${dataLabel}</span>
        </div>
        <a class="sidebar-account__action" href="/login" data-route-link>
          ${renderIcon('view')}<span>Sign in</span>
        </a>
      </div>
    `;
    return;
  }

  const user = getSignedInUser();
  sidebarAccount.innerHTML = `
    <div class="sidebar-account">
      <div class="sidebar-account__identity">
        <span class="sidebar-account__name">${escapeHtml(user?.fullName || user?.email || 'Signed in')}</span>
        <span class="sidebar-account__role">${getSignedInRoleLabel()} · ${dataLabel}</span>
      </div>
      <button class="sidebar-account__action" type="button" data-sign-out>
        ${renderIcon('back')}<span data-sign-out-label>Sign out</span>
      </button>
    </div>
  `;
}

/**
 * Demo mode browses without a backend, so the guard only applies to live data.
 * The login route itself always renders, which is how a demo session signs in.
 */
function requiresSignIn(route) {
  return APP_CONFIG.mode !== 'demo' && route !== '/login' && !isSignedIn();
}

let routeBeforeSignIn = null;

function renderSignIn(reason = '') {
  document.title = `Sign in | ${APP_CONFIG.appName}`;
  document.body.classList.add('is-signed-out');
  renderAccountFooter();
  renderLoginPage(routeView, {
    reason,
    onSignedIn: () => {
      const target = routeBeforeSignIn && routeBeforeSignIn !== '/login' ? routeBeforeSignIn : DEFAULT_ROUTE;
      routeBeforeSignIn = null;
      navigateTo(target);
    }
  });
}

async function renderRoute(route) {
  const libraryDetailMatch = route?.match(/^\/library\/([^/]+)$/);
  const projectDetailMatch = route?.match(/^\/projects\/([^/]+)$/);
  const requisitionDetailMatch = route?.match(/^\/requisitions\/([^/]+)$/);
  const settingsRoute = route?.startsWith('/settings/') ? '/settings/cabinets' : route;
  const navigationPath = libraryDetailMatch ? '/library' : projectDetailMatch ? '/projects' : requisitionDetailMatch ? '/requisitions' : settingsRoute;
  const page = navigationPath ? pageCopy[navigationPath] : null;
  const navigationItem = NAVIGATION.find(({ path }) => path === navigationPath);

  destroyInventoryPage();
  destroyLibraryPage();
  destroyProjectsPage();
  destroyDashboardPage();
  destroyRequisitionsPage();
  destroyAdministrationPage();
  destroyLoginPage();

  if (requiresSignIn(route)) {
    routeBeforeSignIn = route;
    renderSignIn('Sign in to continue.');
    return;
  }

  if (route === '/login') {
    if (isSignedIn()) {
      navigateTo(DEFAULT_ROUTE);
      return;
    }
    renderSignIn();
    return;
  }

  document.body.classList.remove('is-signed-out');
  renderAccountFooter();

  if ((navigationPath === '/settings/cabinets' || navigationPath === '/audit-log') && !canAdministerUsers()) {
    const label = navigationItem?.label || 'This page';
    document.title = `${label} | ${APP_CONFIG.appName}`;
    renderNavigation(null);
    closeNavigation();
    routeView.innerHTML = renderNotPermittedPage(label);
    return;
  }

  const routeTitle = libraryDetailMatch ? 'Component details' : projectDetailMatch ? 'Project details' : requisitionDetailMatch ? 'Requisition details' : page?.title || navigationItem?.label || 'Page not found';
  document.title = `${routeTitle} | ${APP_CONFIG.appName}`;
  renderNavigation(navigationPath);
  closeNavigation();

  if (route === '/dashboard') {
    await renderDashboardPage(routeView);
    return;
  }
  if (route === '/inventory') {
    await renderInventoryPage(routeView);
    return;
  }
  if (route === '/library') {
    await renderLibraryPage(routeView);
    return;
  }
  if (libraryDetailMatch) {
    await renderComponentDetailsPage(routeView, decodeURIComponent(libraryDetailMatch[1]));
    return;
  }
  if (route === '/projects') {
    await renderProjectsPage(routeView);
    return;
  }
  if (projectDetailMatch) {
    await renderProjectDetailsPage(routeView, decodeURIComponent(projectDetailMatch[1]));
    return;
  }
  if (route === '/reports') {
    await renderReportsPage(routeView);
    return;
  }
  if (route === '/requisitions') {
    await renderRequisitionsPage(routeView);
    return;
  }
  if (requisitionDetailMatch) {
    await renderRequisitionDetailsPage(routeView, decodeURIComponent(requisitionDetailMatch[1]));
    return;
  }
  if (route?.startsWith('/settings/')) {
    await renderAdministrationPage(routeView, route);
    return;
  }
  if (route === '/audit-log') {
    await renderAuditLogPage(routeView);
    return;
  }

  routeView.innerHTML = !route ? renderNotFoundPage() : page ? renderFoundationPage(page) : renderPlannedPage(route);
}

document.addEventListener('click', async (event) => {
  const signOutButton = event.target.closest('[data-sign-out]');
  if (!signOutButton) return;

  const confirmed = await confirmAction({
    title: 'Sign out?',
    description: 'You will need your email and password to sign back in.',
    confirmLabel: 'Sign out',
    tone: 'default'
  });
  if (!confirmed) return;

  const label = signOutButton.querySelector('[data-sign-out-label]');
  signOutButton.disabled = true;
  if (label) label.textContent = 'Signing out…';

  await signOut();
  showToast('You have been signed out.');
  navigateTo('/login');
});

// The server is the authority on permissions: a 403 that slipped past a hidden
// control is explained once, calmly, instead of surfacing as an unhandled error.
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error?.name !== 'ApiRequestError') return;
  if (error.status === 403) {
    event.preventDefault();
    showToast(error.message || 'Your role does not allow this action.', { type: 'error' });
    return;
  }
  if (error.sessionExpired) {
    event.preventDefault();
  }
});

// A refresh that fails clears the session from inside the API client; land on
// the login screen instead of leaving a half-dead page behind.
subscribeToSession((session) => {
  if (session.access) return;
  renderAccountFooter();
  if (window.location.pathname !== '/login' && APP_CONFIG.mode !== 'demo') {
    routeBeforeSignIn = window.location.pathname;
    navigateTo('/login');
  }
});

document.addEventListener('click', async (event) => {
  const resetButton = event.target.closest('[data-reset-demo]');
  if (!resetButton) {
    return;
  }

  const confirmed = await confirmAction({
    title: 'Reset demo data?',
    description: 'This will restore the original sample components, cabinets, projects and movements for this browser.',
    confirmLabel: 'Reset data'
  });

  if (confirmed) {
    await resetDemoSession();
    showToast('Demo data has been reset.');
  }
});

menuToggle.addEventListener('click', () => {
  const willOpen = !appSidebar.classList.contains('is-navigation-open');
  appSidebar.classList.toggle('is-navigation-open', willOpen);
  menuToggle.setAttribute('aria-expanded', String(willOpen));
  menuToggle.setAttribute('aria-label', willOpen ? 'Close navigation' : 'Open navigation');
});

await initialiseDemoSession();
initializeRouter(renderRoute);

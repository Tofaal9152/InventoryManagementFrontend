import { APP_CONFIG, DEFAULT_ROUTE, NAVIGATION } from './config.js';
import { initializeRouter } from './router.js';
import { initialiseDemoSession, resetDemoSession } from './services/demo-session-service.js';
import { confirmAction } from './ui/confirm-dialog.js';
import { showToast } from './ui/toast.js';
import { destroyInventoryPage, renderInventoryPage } from './pages/inventory-page.js';
import { destroyLibraryPage, renderComponentDetailsPage, renderLibraryPage } from './pages/library-page.js';
import { renderDashboardPage } from './pages/dashboard-page.js';
import { renderProjectDetailsPage, renderProjectsPage } from './pages/projects-page.js';
import { renderReportsPage } from './pages/reports-page.js';
import { destroyRequisitionsPage, renderRequisitionDetailsPage, renderRequisitionsPage } from './pages/requisitions-page.js';
import { destroyAdministrationPage, renderAdministrationPage, renderAuditLogPage } from './pages/administration-page.js';

const routeView = document.querySelector('#route-view');
const navigationRoot = document.querySelector('#primary-nav');
const pageTitle = document.querySelector('#page-title');
const appSidebar = document.querySelector('.app-sidebar');
const menuToggle = document.querySelector('#menu-toggle');

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

function renderNavigation(activePath) {
  navigationRoot.innerHTML = NAVIGATION.map(({ path, label }) => `
    <a class="nav-link" href="${path}" data-route-link ${path === activePath ? 'aria-current="page"' : ''}>
      ${label}
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
      <a class="button" href="${DEFAULT_ROUTE}" data-route-link>Back to dashboard</a>
    </section>
  `;
}

function renderNotFoundPage() {
  return `
    <section class="not-found" aria-labelledby="not-found-title">
      <p class="eyebrow">404</p>
      <h2 id="not-found-title">This page is not available.</h2>
      <p>Use the navigation to return to the inventory workspace.</p>
      <a class="button" href="${DEFAULT_ROUTE}" data-route-link>Go to dashboard</a>
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
      ${page.title === 'Dashboard' ? '<button class="button button--secondary" type="button" data-reset-demo>Reset demo data</button>' : ''}
    </section>
  `;
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
  destroyRequisitionsPage();
  destroyAdministrationPage();
  pageTitle.textContent = libraryDetailMatch ? 'Component details' : projectDetailMatch ? 'Project details' : requisitionDetailMatch ? 'Requisition details' : page?.title || navigationItem?.label || 'Page not found';
  document.title = `${pageTitle.textContent} | ${APP_CONFIG.appName}`;
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

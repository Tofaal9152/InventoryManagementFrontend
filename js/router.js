import { DEFAULT_ROUTE, NAVIGATION } from './config.js';

const supportedPaths = new Set(NAVIGATION.map(({ path }) => path));

export function getCurrentRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || DEFAULT_ROUTE;
  return supportedPaths.has(pathname) || /^\/(library|projects|requisitions)\/[^/]+$/.test(pathname) || /^\/settings\/(categories|units|users)$/.test(pathname) ? pathname : null;
}

export function navigateTo(path) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function initializeRouter(onRouteChange) {
  const renderCurrentRoute = () => onRouteChange(getCurrentRoute());

  document.addEventListener('click', (event) => {
    const routeLink = event.target.closest('[data-route-link]');
    if (!routeLink || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    const path = routeLink.getAttribute('href');
    if (!path?.startsWith('/')) {
      return;
    }

    event.preventDefault();
    navigateTo(path);
  });

  window.addEventListener('popstate', renderCurrentRoute);
  renderCurrentRoute();
}

const routes = new Map();
let beforeNavigateHook = null;

export function registerRoute(hash, handler) {
  routes.set(hash, handler);
}

export function setBeforeNavigate(fn) {
  beforeNavigateHook = fn;
}

export function getCurrentRoute() {
  const raw = window.location.hash.replace(/^#/, '').split('?')[0];
  return raw || 'catalogue';
}

export function navigate(route) {
  const target = `#${route.replace(/^#/, '')}`;
  if (window.location.hash === target) {
    handleRouteChange();
  } else {
    window.location.hash = target;
  }
}

export async function handleRouteChange() {
  const route = getCurrentRoute();
  const handler = routes.get(route) || routes.get('catalogue');
  if (beforeNavigateHook) {
    beforeNavigateHook(route);
  }
  if (handler) {
    await handler(route);
  }
}

export function startRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  return handleRouteChange();
}

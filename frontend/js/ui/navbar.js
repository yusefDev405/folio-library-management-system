import { escapeHtml } from './format.js';

let headerEl = null;
let innerEl = null;
let menuEl = null;
let lastObservedWidth = 0;

/**
 * Synchronizes wide inline vs narrow popover navigation without hardcoded breakpoints.
 * Uses a temporary `is-measuring` class to prevent transition flicker and updates
 * `popover` via `setAttribute`/`removeAttribute`.
 */
function syncNavbarLayout() {
  if (!headerEl || !innerEl || !menuEl) return;

  const currentWidth = headerEl.getBoundingClientRect().width;
  const currentlyWide = headerEl.classList.contains('is-wide');
  if (!currentlyWide && currentWidth <= lastObservedWidth && lastObservedWidth > 0) {
    lastObservedWidth = currentWidth;
    return;
  }
  lastObservedWidth = currentWidth;

  const wasOpen = menuEl.matches(':popover-open') || menuEl.classList.contains(':popover-open');

  headerEl.classList.add('is-measuring');
  headerEl.classList.add('is-wide');
  menuEl.removeAttribute('popover');

  const fits = innerEl.scrollWidth <= innerEl.clientWidth;

  if (!fits) {
    headerEl.classList.remove('is-wide');
    menuEl.setAttribute('popover', 'auto');
    if (wasOpen && typeof menuEl.showPopover === 'function') {
      try {
        menuEl.showPopover();
      } catch {
        // ignore if already open
      }
    }
  }

  requestAnimationFrame(() => {
    headerEl?.classList.remove('is-measuring');
  });
}

export function initNavbar() {
  headerEl = document.getElementById('site-header');
  innerEl = headerEl?.querySelector('.header-inner');
  menuEl = document.getElementById('site-menu');
  if (!headerEl || !innerEl || !menuEl) return;

  // Conditional popover polyfill load only if missing
  if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
    import('https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js').catch(() => {});
  }

  const ro = new ResizeObserver(() => syncNavbarLayout());
  ro.observe(headerEl);
  ro.observe(menuEl);
  syncNavbarLayout();
}

export function renderNavbarLinks(links, activeRoute) {
  if (!menuEl) return;
  menuEl.innerHTML = links
    .map(
      (item) =>
        `<li><a href="#${escapeHtml(item.route)}" ${
          item.route === activeRoute ? 'aria-current="page"' : ''
        }>${escapeHtml(item.label)}</a></li>`
    )
    .join('');

  // Close collapsed popover when navigating
  if (!headerEl?.classList.contains('is-wide') && typeof menuEl.hidePopover === 'function') {
    try {
      if (menuEl.matches(':popover-open')) menuEl.hidePopover();
    } catch {
      // ignore
    }
  }
  syncNavbarLayout();
}

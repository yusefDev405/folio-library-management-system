import { apiRequest, setOnUnauthorized } from './api.js';
import { clearSessionLocally, getUser, hasRole, logout, restoreSession, subscribeAuth } from './auth.js';
import { renderAccountPage } from './pages/account.js';
import { renderAdminPage } from './pages/admin.js';
import { renderCataloguePage } from './pages/catalogue.js';
import { renderDeskPage } from './pages/desk.js';
import { renderHoldsPage } from './pages/holds.js';
import { renderLoginPage } from './pages/login.js';
import { renderManageBooksPage } from './pages/manageBooks.js';
import { renderManageMembersPage } from './pages/manageMembers.js';
import { renderMyLoansPage } from './pages/myLoans.js';
import { renderMyReservationsFinesPage } from './pages/myReservationsFines.js';
import { renderNotificationsPage } from './pages/notifications.js';
import { renderReadingListPage } from './pages/readingList.js';
import { renderReportsPage } from './pages/reports.js';
import { renderStocktakePage } from './pages/stocktake.js';
import { getCurrentRoute, navigate, registerRoute, setBeforeNavigate, startRouter } from './router.js';
import { initCommandPalette, openCommandPalette } from './ui/commandPalette.js';
import { initDialog } from './ui/dialog.js';
import { escapeHtml } from './ui/format.js';
import { initNavbar, renderNavbarLinks } from './ui/navbar.js';
import { initThemeSync } from './ui/theme.js';
import { showToast } from './ui/toast.js';

const viewEl = document.getElementById('app-view');
const accountEl = document.getElementById('header-account');
let unreadNotifications = 0;

function getNavLinksForUser(user) {
  const links = [{ route: 'catalogue', label: 'Catalogue' }];

  if (!user) {
    links.push({ route: 'login', label: 'Sign In' });
    return links;
  }

  if (user.role === 'member') {
    links.push({ route: 'my-loans', label: 'My Loans' });
    links.push({ route: 'reading-list', label: 'Reading List' });
    links.push({ route: 'my-account', label: 'Reservations & Fines' });
  }

  if (hasRole('librarian')) {
    links.push({ route: 'desk', label: 'Circulation Desk' });
    links.push({ route: 'holds', label: 'Holds' });
    links.push({ route: 'stocktake', label: 'Stocktake' });
    links.push({ route: 'manage-books', label: 'Books & Copies' });
    links.push({ route: 'manage-members', label: 'Members' });
    links.push({ route: 'reports', label: 'Reports' });
  }

  if (user.role === 'admin') {
    links.push({ route: 'admin', label: 'Admin' });
  }

  return links;
}

function renderAccountHeader(user) {
  const paletteBtn = `<button type="button" class="btn btn-sm" id="btn-cmd-palette" title="Quick Search (Ctrl+K)">Search (Ctrl+K)</button>`;

  if (!user) {
    accountEl.innerHTML = `${paletteBtn}<a class="btn btn-sm btn-primary" href="#login">Sign In</a>`;
    accountEl.querySelector('#btn-cmd-palette')?.addEventListener('click', openCommandPalette);
    return;
  }

  const badgeHtml =
    unreadNotifications > 0
      ? ` <span class="badge badge-danger">${unreadNotifications}</span>`
      : '';

  accountEl.innerHTML = `
    ${paletteBtn}
    <a class="btn btn-sm" href="#notifications">Alerts${badgeHtml}</a>
    <a class="btn btn-sm" href="#account" title="Account, Digital Card & Theme">${escapeHtml(user.role)}</a>
    <button type="button" class="btn btn-sm" id="btn-logout">Sign Out</button>
  `;
  accountEl.querySelector('#btn-cmd-palette')?.addEventListener('click', openCommandPalette);
  accountEl.querySelector('#btn-logout')?.addEventListener('click', async () => {
    await logout();
    unreadNotifications = 0;
    showToast('Signed out.', { tone: 'ok' });
    navigate('catalogue');
  });
}

async function refreshUnreadBadge(user) {
  if (!user) {
    unreadNotifications = 0;
    return;
  }
  try {
    const res = await apiRequest('/me/notifications');
    unreadNotifications = res.meta?.unreadCount ?? 0;
    renderAccountHeader(user);
  } catch {
    // ignore background badge refresh errors
  }
}

function guardRoute(requiredCheck, renderFn) {
  return async () => {
    const user = getUser();
    if (!requiredCheck(user)) {
      if (!user) {
        navigate('login');
      } else {
        viewEl.innerHTML = '<p class="banner banner-danger">You do not have permission to view this page.</p>';
      }
      return;
    }
    try {
      await renderFn(viewEl);
    } catch (err) {
      viewEl.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
    }
  };
}

registerRoute('catalogue', () => renderCataloguePage(viewEl));
registerRoute('login', () => renderLoginPage(viewEl));
registerRoute('my-loans', guardRoute((u) => u?.role === 'member', renderMyLoansPage));
registerRoute('reading-list', guardRoute((u) => u?.role === 'member', renderReadingListPage));
registerRoute('my-account', guardRoute((u) => u?.role === 'member', renderMyReservationsFinesPage));
registerRoute(
  'notifications',
  guardRoute(Boolean, (c) =>
    renderNotificationsPage(c, {
      onUnreadChanged(count) {
        unreadNotifications = count;
        renderAccountHeader(getUser());
      },
    })
  )
);
registerRoute('account', guardRoute(Boolean, renderAccountPage));
registerRoute('desk', guardRoute((u) => u && hasRole('librarian'), renderDeskPage));
registerRoute('holds', guardRoute((u) => u && hasRole('librarian'), renderHoldsPage));
registerRoute('stocktake', guardRoute((u) => u && hasRole('librarian'), renderStocktakePage));
registerRoute('manage-books', guardRoute((u) => u && hasRole('librarian'), renderManageBooksPage));
registerRoute('manage-members', guardRoute((u) => u && hasRole('librarian'), renderManageMembersPage));
registerRoute('reports', guardRoute((u) => u && hasRole('librarian'), renderReportsPage));
registerRoute('admin', guardRoute((u) => u?.role === 'admin', renderAdminPage));

setBeforeNavigate((activeRoute) => {
  const user = getUser();
  renderNavbarLinks(getNavLinksForUser(user), activeRoute);
  renderAccountHeader(user);
});

subscribeAuth((user) => {
  renderNavbarLinks(getNavLinksForUser(user), getCurrentRoute());
  renderAccountHeader(user);
  refreshUnreadBadge(user);
});

setOnUnauthorized(() => {
  clearSessionLocally();
  unreadNotifications = 0;
  navigate('login');
});

initThemeSync();
initDialog();
initNavbar();
initCommandPalette();
const initialUser = await restoreSession();
await refreshUnreadBadge(initialUser);
await startRouter();

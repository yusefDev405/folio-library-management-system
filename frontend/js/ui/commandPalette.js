import { apiRequest } from '../api.js';
import { getUser, hasRole } from '../auth.js';
import { navigate } from '../router.js';
import { closeDialog, openDialog } from './dialog.js';
import { escapeHtml, statusBadge } from './format.js';

function getShortcutRoutes() {
  const user = getUser();
  const routes = [{ label: 'Catalogue Search', route: 'catalogue', hint: 'Public' }];
  if (!user) {
    routes.push({ label: 'Sign In', route: 'login', hint: 'Account' });
    return routes;
  }
  if (user.role === 'member') {
    routes.push(
      { label: 'My Loans & History', route: 'my-loans', hint: 'Member' },
      { label: 'Reading List & Notes', route: 'reading-list', hint: 'Member' },
      { label: 'Reservations & Fines', route: 'my-account', hint: 'Member' }
    );
  }
  if (hasRole('librarian')) {
    routes.push(
      { label: 'Circulation Desk', route: 'desk', hint: 'Librarian' },
      { label: 'Holds Shelf & Queue', route: 'holds', hint: 'Librarian' },
      { label: 'Stocktake Audit', route: 'stocktake', hint: 'Librarian' },
      { label: 'Books & Copies', route: 'manage-books', hint: 'Librarian' },
      { label: 'Members & Fines', route: 'manage-members', hint: 'Librarian' },
      { label: 'Reports & Analytics', route: 'reports', hint: 'Librarian' }
    );
  }
  if (user.role === 'admin') {
    routes.push({ label: 'Administration', route: 'admin', hint: 'Admin' });
  }
  routes.push(
    { label: 'Notifications Inbox', route: 'notifications', hint: 'User' },
    { label: 'Account, Card & Theme', route: 'account', hint: 'Settings' }
  );
  return routes;
}

export function openCommandPalette() {
  const shortcuts = getShortcutRoutes();

  openDialog({
    title: 'Quick Command Palette',
    closedBy: 'any',
    html: `
      <div class="field" style="margin-block-end:0.85rem;">
        <label for="cmd-input">Jump to page or search books, barcodes, or members</label>
        <input id="cmd-input" type="search" placeholder="Type a command, book title, ISBN, barcode, or member..." autocomplete="off" autofocus />
      </div>
      <div id="cmd-results" class="cmd-list" aria-live="polite"></div>
    `,
    onMount(bodyEl) {
      const input = bodyEl.querySelector('#cmd-input');
      const resultsEl = bodyEl.querySelector('#cmd-results');
      let debounceId = null;

      function renderShortcuts(filter = '') {
        const q = filter.toLowerCase();
        const filtered = shortcuts.filter(
          (s) => !q || s.label.toLowerCase().includes(q) || s.route.toLowerCase().includes(q)
        );
        return filtered
          .map(
            (s) => `
          <button type="button" class="cmd-item" data-nav="${escapeHtml(s.route)}">
            <span>${escapeHtml(s.label)}</span>
            <span class="mono-meta">${escapeHtml(s.hint)}</span>
          </button>`
          )
          .join('');
      }

      function wireNavButtons() {
        resultsEl.querySelectorAll('[data-nav]').forEach((btn) => {
          btn.addEventListener('click', () => {
            closeDialog();
            navigate(btn.dataset.nav);
          });
        });
      }

      resultsEl.innerHTML = renderShortcuts('');
      wireNavButtons();

      input.addEventListener('input', () => {
        const q = input.value.trim();
        clearTimeout(debounceId);
        if (!q) {
          resultsEl.innerHTML = renderShortcuts('');
          wireNavButtons();
          return;
        }
        debounceId = setTimeout(async () => {
          const navHtml = renderShortcuts(q);
          let apiHtml = '';
          try {
            const res = await apiRequest(`/search/quick?q=${encodeURIComponent(q)}`);
            const { books = [], members = [], copies = [] } = res.data;

            for (const b of books) {
              apiHtml += `
                <button type="button" class="cmd-item" data-nav="catalogue">
                  <span><strong>Book:</strong> ${escapeHtml(b.title)} <span class="mono-meta">${escapeHtml(b.isbn)}</span></span>
                  <span>${statusBadge(b.availableCopies > 0 ? 'available' : 'reserved', `${b.availableCopies}/${b.totalCopies}`)}</span>
                </button>`;
            }
            for (const c of copies) {
              apiHtml += `
                <button type="button" class="cmd-item" data-nav="desk">
                  <span><strong>Copy:</strong> <span class="mono">${escapeHtml(c.barcode)}</span> &mdash; ${escapeHtml(c.title)}</span>
                  <span>${statusBadge(c.status)}</span>
                </button>`;
            }
            for (const m of members) {
              apiHtml += `
                <button type="button" class="cmd-item" data-nav="desk">
                  <span><strong>Member:</strong> ${escapeHtml(m.name)} <span class="mono-meta">${escapeHtml(m.memberNumber)}</span></span>
                  <span>${statusBadge(m.status)}</span>
                </button>`;
            }
          } catch {
            // ignore network transient errors in palette
          }

          resultsEl.innerHTML =
            (navHtml + apiHtml) || '<p class="muted">No matching pages or records.</p>';
          wireNavButtons();
        }, 160);
      });
    },
  });
}

export function initCommandPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (
      e.key === '/' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    ) {
      e.preventDefault();
      openCommandPalette();
    }
  });
}

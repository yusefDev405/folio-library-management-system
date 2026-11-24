import { apiRequest } from '../api.js';
import { escapeHtml, statusBadge } from '../ui/format.js';
import { showToast } from '../ui/toast.js';

const SHELVES = [
  { id: 'all', label: 'All Saved' },
  { id: 'want_to_read', label: 'Want to Read' },
  { id: 'reading', label: 'Reading' },
  { id: 'finished', label: 'Finished' },
];

export async function renderReadingListPage(container) {
  let activeShelf = 'all';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">My Reading List</h1>
        <p class="page-subtitle">Organize saved titles by reading stage and keep private study notes.</p>
      </div>
    </div>

    <div class="tab-bar" role="tablist" aria-label="Reading shelves">
      ${SHELVES.map(
        (s) =>
          `<button type="button" role="tab" class="tab-btn" data-shelf="${s.id}" aria-selected="${s.id === 'all'}">${escapeHtml(s.label)}</button>`
      ).join('')}
    </div>

    <div id="reading-list-items" class="desk-stack"></div>
  `;

  const itemsEl = container.querySelector('#reading-list-items');
  const tabs = [...container.querySelectorAll('[data-shelf]')];

  async function refresh() {
    const res = await apiRequest('/me/reading-list');
    const filtered =
      activeShelf === 'all' ? res.data : res.data.filter((item) => item.shelf === activeShelf);

    if (filtered.length === 0) {
      itemsEl.innerHTML =
        '<p class="banner">No books on this shelf yet. Open any book in the Catalogue to save it.</p>';
      return;
    }

    itemsEl.innerHTML = filtered
      .map(
        (item) => `
      <article class="panel" data-book-id="${item.bookId}">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">${escapeHtml(item.title)}</h2>
            <p class="mono-meta">ISBN ${escapeHtml(item.isbn)} &middot; ${escapeHtml(item.categoryName)}</p>
          </div>
          ${
            item.availableCopies > 0
              ? statusBadge('available', `${item.availableCopies}/${item.totalCopies} available`)
              : statusBadge('reserved', '0 available')
          }
        </div>
        <form class="form-grid reading-item-form" data-book-id="${item.bookId}">
          <div class="form-row-2">
            <div class="field">
              <label for="shelf-${item.bookId}">Shelf</label>
              <select id="shelf-${item.bookId}" name="shelf">
                <option value="want_to_read" ${item.shelf === 'want_to_read' ? 'selected' : ''}>Want to Read</option>
                <option value="reading" ${item.shelf === 'reading' ? 'selected' : ''}>Reading</option>
                <option value="finished" ${item.shelf === 'finished' ? 'selected' : ''}>Finished</option>
              </select>
            </div>
            <div class="field">
              <label for="notes-${item.bookId}">Personal Notes</label>
              <input id="notes-${item.bookId}" name="notes" type="text" value="${escapeHtml(item.notes)}" placeholder="Chapter notes or call number reminder" />
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="submit" class="btn btn-sm btn-primary">Save Changes</button>
            <button type="button" class="btn btn-sm" data-remove-rl="${item.bookId}">Remove</button>
          </div>
        </form>
      </article>
    `
      )
      .join('');

    itemsEl.querySelectorAll('.reading-item-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await apiRequest(`/me/reading-list/${form.dataset.bookId}`, {
          method: 'PATCH',
          body: {
            shelf: form.shelf.value,
            notes: form.notes.value.trim(),
          },
        });
        showToast('Reading list updated.', { tone: 'ok' });
        refresh();
      });
    });

    itemsEl.querySelectorAll('[data-remove-rl]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/me/reading-list/${btn.dataset.removeRl}`, { method: 'DELETE' });
        showToast('Removed from reading list.', { tone: 'ok' });
        refresh();
      });
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeShelf = tab.dataset.shelf;
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      refresh();
    });
  });

  await refresh();
}

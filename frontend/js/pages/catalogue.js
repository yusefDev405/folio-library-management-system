import { apiRequest } from '../api.js';
import { getUser } from '../auth.js';
import { openDialog } from '../ui/dialog.js';
import { formatCitations } from '../ui/export.js';
import { escapeHtml, formatDate, statusBadge } from '../ui/format.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderCataloguePage(container) {
  const state = {
    q: '',
    category: '',
    author: '',
    available: '',
    sort: 'title',
    page: 1,
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Library Catalogue</h1>
        <p class="page-subtitle">Search physical titles, shelf locations, reader reviews, citations, and live copy availability.</p>
      </div>
    </div>

    <section class="panel" aria-label="Catalogue search filters">
      <form id="catalogue-search-form" class="search-bar">
        <div class="field">
          <label for="cat-q">Title or keyword</label>
          <span id="cat-q-hint" class="hint">Full-text search across titles and descriptions</span>
          <input id="cat-q" name="q" type="search" placeholder="e.g. Algorithms, Kleppmann, distributed" aria-describedby="cat-q-hint" />
        </div>
        <div class="field">
          <label for="cat-category">Category</label>
          <select id="cat-category" name="category"><option value="">All categories</option></select>
        </div>
        <div class="field">
          <label for="cat-author">Author</label>
          <select id="cat-author" name="author"><option value="">All authors</option></select>
        </div>
        <div class="field">
          <label for="cat-available">Availability</label>
          <select id="cat-available" name="available">
            <option value="">Any status</option>
            <option value="true">Available now</option>
            <option value="false">Checked out / held</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Search</button>
      </form>

      <div id="catalogue-results" aria-live="polite"></div>
      <div id="catalogue-pagination" class="pagination-bar"></div>
    </section>
  `;

  const form = container.querySelector('#catalogue-search-form');
  const resultsEl = container.querySelector('#catalogue-results');
  const paginationEl = container.querySelector('#catalogue-pagination');
  const categorySelect = container.querySelector('#cat-category');
  const authorSelect = container.querySelector('#cat-author');

  const [catsRes, authorsRes] = await Promise.all([
    apiRequest('/categories'),
    apiRequest('/authors'),
  ]);

  for (const c of catsRes.data) {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.name;
    categorySelect.append(opt);
  }
  for (const a of authorsRes.data) {
    const opt = document.createElement('option');
    opt.value = String(a.id);
    opt.textContent = a.name;
    authorSelect.append(opt);
  }

  async function loadBooks() {
    resultsEl.innerHTML = '<p class="muted">Loading catalogue...</p>';
    const params = new URLSearchParams({
      page: String(state.page),
      limit: '12',
      sort: state.sort,
    });
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    if (state.author) params.set('author', state.author);
    if (state.available) params.set('available', state.available);

    const res = await apiRequest(`/books?${params.toString()}`);
    const books = res.data;
    const { page, limit, total } = res.meta;

    if (books.length === 0) {
      resultsEl.innerHTML = '<p class="banner">No matching books were found in the catalogue.</p>';
      paginationEl.innerHTML = '';
      return;
    }

    resultsEl.innerHTML = `
      <div class="book-list">
        ${books
          .map((book) => {
            const authors = book.authors.map((a) => escapeHtml(a.name)).join(', ') || 'Unknown';
            const badge =
              book.availableCopies > 0
                ? statusBadge('available', `${book.availableCopies} of ${book.totalCopies} available`)
                : statusBadge('reserved', `0 of ${book.totalCopies} available`);
            return `
              <article class="book-card">
                <div>
                  <h2 class="book-card-title">${escapeHtml(book.title)}</h2>
                  <p class="book-card-meta">${authors}${book.publishedYear ? ` &middot; ${book.publishedYear}` : ''}</p>
                  <p class="mono-meta">ISBN ${escapeHtml(book.isbn)} &middot; ${escapeHtml(book.categoryName || 'General')}</p>
                </div>
                <p class="muted">${escapeHtml((book.description || '').slice(0, 130))}${(book.description || '').length > 130 ? '...' : ''}</p>
                <div class="book-card-footer">
                  ${badge}
                  <button type="button" class="btn btn-sm" data-book-id="${book.id}">Details &amp; Copies</button>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;

    const totalPages = Math.max(1, Math.ceil(total / limit));
    paginationEl.innerHTML = `
      <span class="muted">Showing ${books.length} of ${total} title${total === 1 ? '' : 's'} (Page ${page} of ${totalPages})</span>
      <div style="display:flex;gap:0.5rem;">
        <button type="button" class="btn btn-sm" id="cat-prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <button type="button" class="btn btn-sm" id="cat-next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    `;

    paginationEl.querySelector('#cat-prev')?.addEventListener('click', () => {
      state.page = Math.max(1, state.page - 1);
      loadBooks();
    });
    paginationEl.querySelector('#cat-next')?.addEventListener('click', () => {
      state.page = Math.min(totalPages, state.page + 1);
      loadBooks();
    });

    resultsEl.querySelectorAll('[data-book-id]').forEach((btn) => {
      btn.addEventListener('click', () => openBookDetailsDialog(Number(btn.dataset.bookId)));
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    state.q = form.q.value.trim();
    state.category = form.category.value;
    state.author = form.author.value;
    state.available = form.available.value;
    state.page = 1;
    loadBooks();
  });

  await loadBooks();
}

async function openBookDetailsDialog(bookId) {
  const [bookRes, reviewsRes] = await Promise.all([
    apiRequest(`/books/${bookId}`),
    apiRequest(`/books/${bookId}/reviews`),
  ]);
  const book = bookRes.data;
  const revData = reviewsRes.data;
  const user = getUser();
  const isMember = user?.role === 'member';
  const canReserve = isMember && book.availableCopies === 0 && book.totalCopies > 0;
  const citations = formatCitations(book);

  const copiesTable = renderResponsiveTable({
    captionId: `copies-cap-${book.id}`,
    caption: 'Physical Copies',
    emptyText: 'No physical copies catalogued for this title yet.',
    columns: [
      { label: 'Barcode', key: 'barcode', sortable: true, render: (c) => `<span class="mono">${escapeHtml(c.barcode)}</span>` },
      { label: 'Shelf', key: 'shelfLocation', sortable: true, render: (c) => `<span class="mono">${escapeHtml(c.shelfLocation)}</span>` },
      { label: 'Status', key: 'status', sortable: true, render: (c) => statusBadge(c.status) },
    ],
    rows: book.copies,
  });

  const authors = book.authors.map((a) => escapeHtml(a.name)).join(', ') || 'Unknown';
  const ratingText = revData.averageRating
    ? `${revData.averageRating} / 5 (${revData.reviewCount} review${revData.reviewCount === 1 ? '' : 's'})`
    : 'No reviews yet';

  openDialog({
    title: book.title,
    closedBy: 'any',
    html: `
      <p class="muted" style="margin-block-end:0.3rem;"><strong>Authors:</strong> ${authors}</p>
      <p class="mono-meta" style="margin-block-end:0.65rem;">
        ISBN ${escapeHtml(book.isbn)} &middot; ${escapeHtml(book.publisher || '—')} ${book.publishedYear ? `(${book.publishedYear})` : ''} &middot; ${escapeHtml(book.categoryName || 'General')}
      </p>
      <p style="margin-block-end:0.85rem;">${escapeHtml(book.description || 'No description provided.')}</p>
      <p class="muted" style="margin-block-end:0.85rem;font-size:0.875rem;">
        Waiting queue: <strong>${book.waitingReservations}</strong> &middot; Rating: <strong>${escapeHtml(ratingText)}</strong>
      </p>

      ${copiesTable}

      ${
        isMember
          ? `
        <div style="margin-block-start:1rem;padding:0.75rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);">
          <form id="dialog-rl-form" class="scanner-row">
            <div class="field">
              <label for="rl-shelf">Save to Reading List</label>
              <select id="rl-shelf" name="shelf">
                <option value="want_to_read">Want to Read</option>
                <option value="reading">Currently Reading</option>
                <option value="finished">Finished</option>
              </select>
            </div>
            <button type="submit" class="btn btn-sm">Save to List</button>
          </form>
        </div>`
          : ''
      }

      <div style="margin-block-start:1rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-block-end:0.4rem;">
          <strong style="font-size:0.875rem;">Cite This Title</strong>
          <div style="display:flex;gap:0.35rem;">
            <button type="button" class="btn btn-sm" data-cite="apa">APA</button>
            <button type="button" class="btn btn-sm" data-cite="mla">MLA</button>
            <button type="button" class="btn btn-sm" data-cite="bibtex">BibTeX</button>
          </div>
        </div>
        <pre id="cite-preview" class="diff-box" style="margin:0;">${escapeHtml(citations.apa)}</pre>
        <button type="button" class="btn btn-sm" id="btn-copy-cite" style="margin-block-start:0.4rem;">Copy Citation</button>
      </div>

      <div style="margin-block-start:1rem;border-block-start:1px solid var(--border);padding-block-start:0.85rem;">
        <h2 style="font-size:1rem;margin-block-end:0.5rem;">Reader Reviews</h2>
        ${
          revData.reviews.length
            ? `<div style="display:grid;gap:0.5rem;margin-block-end:0.75rem;">
                ${revData.reviews
                  .map(
                    (rv) => `
                  <div style="padding:0.55rem 0.75rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.85rem;">
                    <div style="display:flex;justify-content:space-between;">
                      <strong>${escapeHtml(rv.reviewerName)} &middot; ${rv.rating}/5</strong>
                      <span class="mono-meta">${formatDate(rv.updatedAt)}</span>
                    </div>
                    ${rv.comment ? `<p style="margin-block-start:0.25rem;">${escapeHtml(rv.comment)}</p>` : ''}
                  </div>`
                  )
                  .join('')}
              </div>`
            : '<p class="muted" style="font-size:0.85rem;margin-block-end:0.65rem;">No reader reviews yet.</p>'
        }
        ${
          isMember
            ? `
          <form id="dialog-review-form" class="form-grid">
            <div class="form-row-2">
              <div class="field">
                <label for="rv-rating">Your Rating (1–5)</label>
                <select id="rv-rating" name="rating">
                  <option value="5">5 - Essential</option>
                  <option value="4">4 - Very Good</option>
                  <option value="3">3 - Good</option>
                  <option value="2">2 - Fair</option>
                  <option value="1">1 - Poor</option>
                </select>
              </div>
              <div class="field">
                <label for="rv-comment">Review Note</label>
                <input id="rv-comment" name="comment" type="text" maxlength="500" placeholder="Share a concise review..." />
              </div>
            </div>
            <button type="submit" class="btn btn-sm">Submit Review</button>
          </form>`
            : ''
        }
      </div>

      <div id="reserve-feedback" style="margin-block-start:0.75rem;"></div>
      <div class="dialog-actions">
        ${
          canReserve
            ? '<button type="button" class="btn btn-primary" id="dialog-reserve-btn">Reserve Next Available Copy</button>'
            : ''
        }
        <form method="dialog"><button type="submit" class="btn" autofocus>Close</button></form>
      </div>
    `,
    onMount(bodyEl, dialogEl) {
      enhanceSortableTables(bodyEl);

      const citeBox = bodyEl.querySelector('#cite-preview');
      bodyEl.querySelectorAll('[data-cite]').forEach((btn) => {
        btn.addEventListener('click', () => {
          citeBox.textContent = citations[btn.dataset.cite];
        });
      });
      bodyEl.querySelector('#btn-copy-cite')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(citeBox.textContent);
          showToast('Citation copied to clipboard.', { tone: 'ok' });
        } catch {
          showToast('Copy failed; select and copy manually.', { tone: 'warn' });
        }
      });

      bodyEl.querySelector('#dialog-rl-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const shelf = e.currentTarget.shelf.value;
        await apiRequest('/me/reading-list', {
          method: 'POST',
          body: { bookId: book.id, shelf },
        });
        dialogEl.close();
        showToast(`Saved "${book.title}" to your reading list.`, { tone: 'ok' });
      });

      bodyEl.querySelector('#dialog-review-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.currentTarget;
        await apiRequest(`/books/${book.id}/reviews`, {
          method: 'POST',
          body: {
            rating: Number(f.rating.value),
            comment: f.comment.value.trim(),
          },
        });
        dialogEl.close();
        showToast('Review saved.', { tone: 'ok' });
      });

      const reserveBtn = bodyEl.querySelector('#dialog-reserve-btn');
      const feedback = bodyEl.querySelector('#reserve-feedback');
      reserveBtn?.addEventListener('click', async () => {
        reserveBtn.disabled = true;
        try {
          const r = await apiRequest('/reservations', {
            method: 'POST',
            body: { bookId: book.id },
          });
          dialogEl.close();
          showToast(
            `Reservation placed (#${r.data.queuePosition ?? 1} in queue for "${book.title}").`,
            { tone: 'ok' }
          );
        } catch (err) {
          feedback.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
          reserveBtn.disabled = false;
        }
      });
    },
  });
}

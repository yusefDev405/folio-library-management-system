import { apiRequest } from '../api.js';
import { renderCode39Svg } from '../ui/barcode.js';
import { closeDialog, openDialog } from '../ui/dialog.js';
import { downloadCsv } from '../ui/export.js';
import { escapeHtml, formatDate, statusBadge } from '../ui/format.js';
import { enhanceFormValidation } from '../ui/formValidation.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderManageBooksPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Books &amp; Copies</h1>
        <p class="page-subtitle">Catalogue &amp; edit titles, bulk-import from CSV, print barcode labels, and track copy history.</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button type="button" class="btn" id="btn-import-csv">Bulk CSV Import</button>
        <button type="button" class="btn" id="btn-add-author">+ Author</button>
        <button type="button" class="btn" id="btn-add-category">+ Category</button>
        <button type="button" class="btn btn-primary" id="btn-add-book">+ New Book</button>
      </div>
    </div>

    <section class="panel" id="manage-books-list"></section>
  `;

  const listEl = container.querySelector('#manage-books-list');

  async function refresh() {
    const res = await apiRequest('/books?limit=50&sort=title');
    listEl.innerHTML = renderResponsiveTable({
      captionId: 'manage-books-cap',
      caption: 'Catalogued Titles',
      emptyText: 'No books catalogued yet.',
      columns: [
        { label: 'Title', key: 'title', sortable: true, render: (b) => escapeHtml(b.title) },
        { label: 'ISBN', key: 'isbn', sortable: true, render: (b) => `<span class="mono">${escapeHtml(b.isbn)}</span>` },
        { label: 'Category', key: 'categoryName', sortable: true, render: (b) => escapeHtml(b.categoryName || '—') },
        {
          label: 'Copies',
          key: 'availableCopies',
          sortable: true,
          type: 'number',
          render: (b) => `<span class="mono">${b.availableCopies} / ${b.totalCopies} avail</span>`,
        },
        {
          label: 'Actions',
          render: (b) => `
            <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm" data-edit-book="${b.id}">Edit</button>
              <button type="button" class="btn btn-sm" data-manage-copies="${b.id}">Copies</button>
            </div>
          `,
        },
      ],
      rows: res.data,
    });

    enhanceSortableTables(listEl);

    listEl.querySelectorAll('[data-edit-book]').forEach((btn) => {
      btn.addEventListener('click', () => openEditBookDialog(Number(btn.dataset.editBook), refresh));
    });

    listEl.querySelectorAll('[data-manage-copies]').forEach((btn) => {
      btn.addEventListener('click', () => openManageCopiesDialog(Number(btn.dataset.manageCopies), refresh));
    });
  }

  container.querySelector('#btn-import-csv').addEventListener('click', () => openCsvImportDialog(refresh));

  container.querySelector('#btn-add-author').addEventListener('click', () => {
    openDialog({
      title: 'Add Author',
      closedBy: 'closerequest',
      html: `
        <form id="add-author-form" class="form-grid" novalidate>
          <div class="field">
            <label for="author-name">Author full name</label>
            <input id="author-name" name="name" type="text" required autofocus />
          </div>
          <div id="author-err"></div>
          <div class="dialog-actions">
            <button type="button" class="btn" onclick="this.closest('dialog').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Author</button>
          </div>
        </form>
      `,
      onMount(bodyEl) {
        const form = bodyEl.querySelector('#add-author-form');
        enhanceFormValidation(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!form.checkValidity()) return;
          try {
            await apiRequest('/authors', { method: 'POST', body: { name: form.name.value.trim() } });
            closeDialog();
            showToast('Author added.', { tone: 'ok' });
          } catch (err) {
            bodyEl.querySelector('#author-err').innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
          }
        });
      },
    });
  });

  container.querySelector('#btn-add-category').addEventListener('click', () => {
    openDialog({
      title: 'Add Category',
      closedBy: 'closerequest',
      html: `
        <form id="add-cat-form" class="form-grid" novalidate>
          <div class="field">
            <label for="cat-name">Category name</label>
            <input id="cat-name" name="name" type="text" required autofocus />
          </div>
          <div id="cat-err"></div>
          <div class="dialog-actions">
            <button type="button" class="btn" onclick="this.closest('dialog').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Category</button>
          </div>
        </form>
      `,
      onMount(bodyEl) {
        const form = bodyEl.querySelector('#add-cat-form');
        enhanceFormValidation(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!form.checkValidity()) return;
          try {
            await apiRequest('/categories', { method: 'POST', body: { name: form.name.value.trim() } });
            closeDialog();
            showToast('Category added.', { tone: 'ok' });
          } catch (err) {
            bodyEl.querySelector('#cat-err').innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
          }
        });
      },
    });
  });

  container.querySelector('#btn-add-book').addEventListener('click', async () => {
    const [catsRes, authorsRes] = await Promise.all([
      apiRequest('/categories'),
      apiRequest('/authors'),
    ]);

    openDialog({
      title: 'Catalogue New Book',
      closedBy: 'closerequest',
      html: `
        <form id="add-book-form" class="form-grid" novalidate>
          <div class="form-row-2">
            <div class="field">
              <label for="book-isbn">ISBN (10 or 13 digits)</label>
              <span id="book-isbn-hint" class="hint">Example: 9780134685991</span>
              <input id="book-isbn" name="isbn" type="text" required pattern="[0-9Xx\\-\\s]{10,17}" aria-describedby="book-isbn-hint" data-error="book-isbn-err" autofocus />
              <div id="book-isbn-err" class="error-msg"><span role="img" aria-label="Error">!</span> Enter a valid 10 or 13 character ISBN.</div>
            </div>
            <div class="field">
              <label for="book-year">Published Year</label>
              <input id="book-year" name="publishedYear" type="number" min="1400" max="2100" />
            </div>
          </div>
          <div class="field">
            <label for="book-title">Title</label>
            <input id="book-title" name="title" type="text" required />
          </div>
          <div class="form-row-2">
            <div class="field">
              <label for="book-publisher">Publisher</label>
              <input id="book-publisher" name="publisher" type="text" />
            </div>
            <div class="field">
              <label for="book-category">Category</label>
              <select id="book-category" name="categoryId">
                ${catsRes.data.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label for="book-author">Primary Author</label>
            <select id="book-author" name="authorId" required>
              ${authorsRes.data.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="book-desc">Description</label>
            <textarea id="book-desc" name="description" rows="3"></textarea>
          </div>
          <div id="add-book-err"></div>
          <div class="dialog-actions">
            <button type="button" class="btn" onclick="this.closest('dialog').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Book</button>
          </div>
        </form>
      `,
      onMount(bodyEl) {
        const form = bodyEl.querySelector('#add-book-form');
        enhanceFormValidation(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!form.checkValidity()) return;
          try {
            await apiRequest('/books', {
              method: 'POST',
              body: {
                isbn: form.isbn.value.trim(),
                title: form.title.value.trim(),
                publisher: form.publisher.value.trim() || null,
                publishedYear: form.publishedYear.value ? Number(form.publishedYear.value) : null,
                categoryId: form.categoryId.value ? Number(form.categoryId.value) : null,
                description: form.description.value.trim(),
                authorIds: [Number(form.authorId.value)],
              },
            });
            closeDialog();
            showToast('Book catalogued.', { tone: 'ok' });
            refresh();
          } catch (err) {
            bodyEl.querySelector('#add-book-err').innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
          }
        });
      },
    });
  });

  await refresh();
}

async function openEditBookDialog(bookId, onChanged) {
  const [bookRes, catsRes] = await Promise.all([
    apiRequest(`/books/${bookId}`),
    apiRequest('/categories'),
  ]);
  const book = bookRes.data;

  openDialog({
    title: `Edit Book — ${book.title}`,
    closedBy: 'closerequest',
    html: `
      <form id="edit-book-form" class="form-grid" novalidate>
        <div class="field">
          <label for="eb-title">Title</label>
          <input id="eb-title" name="title" type="text" required value="${escapeHtml(book.title)}" autofocus />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label for="eb-pub">Publisher</label>
            <input id="eb-pub" name="publisher" type="text" value="${escapeHtml(book.publisher || '')}" />
          </div>
          <div class="field">
            <label for="eb-year">Published Year</label>
            <input id="eb-year" name="publishedYear" type="number" min="1400" max="2100" value="${book.publishedYear || ''}" />
          </div>
        </div>
        <div class="field">
          <label for="eb-cat">Category</label>
          <select id="eb-cat" name="categoryId">
            ${catsRes.data
              .map(
                (c) =>
                  `<option value="${c.id}" ${c.id === book.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field">
          <label for="eb-desc">Description</label>
          <textarea id="eb-desc" name="description" rows="3">${escapeHtml(book.description || '')}</textarea>
        </div>
        <div id="eb-err"></div>
        <div class="dialog-actions">
          <button type="button" class="btn" onclick="this.closest('dialog').close()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Changes</button>
        </div>
      </form>
    `,
    onMount(bodyEl) {
      const form = bodyEl.querySelector('#edit-book-form');
      enhanceFormValidation(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) return;
        try {
          await apiRequest(`/books/${book.id}`, {
            method: 'PATCH',
            body: {
              title: form.title.value.trim(),
              publisher: form.publisher.value.trim() || null,
              publishedYear: form.publishedYear.value ? Number(form.publishedYear.value) : null,
              categoryId: form.categoryId.value ? Number(form.categoryId.value) : null,
              description: form.description.value.trim(),
            },
          });
          closeDialog();
          showToast('Book metadata updated.', { tone: 'ok' });
          onChanged();
        } catch (err) {
          bodyEl.querySelector('#eb-err').innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
        }
      });
    },
  });
}

function openCsvImportDialog(onChanged) {
  openDialog({
    title: 'Bulk CSV Book Import',
    closedBy: 'closerequest',
    html: `
      <div class="form-grid">
        <div class="field">
          <label for="csv-file">Choose a .csv file (isbn,title,author,category,publisher,published_year,description)</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" />
        </div>
        <div class="field">
          <label for="csv-text">Or paste CSV rows</label>
          <textarea id="csv-text" rows="6" class="mono" placeholder="isbn,title,author,category,publisher,published_year,description&#10;9780134685991,Effective Java,Joshua Bloch,Software Engineering,Addison-Wesley,2018,Java best practices"></textarea>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button type="button" class="btn" id="btn-csv-preview">Preview &amp; Validate</button>
          <button type="button" class="btn btn-primary" id="btn-csv-commit" disabled>Import Valid Rows</button>
        </div>
        <div id="csv-preview-area"></div>
      </div>
      <div class="dialog-actions">
        <form method="dialog"><button type="submit" class="btn">Close</button></form>
      </div>
    `,
    onMount(bodyEl) {
      const fileInput = bodyEl.querySelector('#csv-file');
      const textArea = bodyEl.querySelector('#csv-text');
      const previewBtn = bodyEl.querySelector('#btn-csv-preview');
      const commitBtn = bodyEl.querySelector('#btn-csv-commit');
      const area = bodyEl.querySelector('#csv-preview-area');
      let lastPreview = null;

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (file) {
          textArea.value = await file.text();
        }
      });

      previewBtn.addEventListener('click', async () => {
        const csvText = textArea.value.trim();
        if (!csvText) return;
        try {
          const res = await apiRequest('/books/import-csv', {
            method: 'POST',
            body: { csvText, dryRun: true },
          });
          lastPreview = res.data;
          commitBtn.disabled = lastPreview.validCount === 0;
          area.innerHTML = `
            <p class="banner ${lastPreview.rejectedCount > 0 ? 'banner-warn' : 'banner-ok'}">
              Valid ISBN rows: <strong>${lastPreview.validCount}</strong> &middot; Rejected rows: <strong>${lastPreview.rejectedCount}</strong>
            </p>
            ${
              lastPreview.rejectedCount > 0
                ? `<button type="button" class="btn btn-sm" id="btn-dl-csv-errors" style="margin-block-start:0.5rem;">Download Rejected Errors CSV</button>`
                : ''
            }
          `;
          area.querySelector('#btn-dl-csv-errors')?.addEventListener('click', () => {
            downloadCsv(
              'import-errors.csv',
              ['line', 'isbn', 'title', 'reason'],
              lastPreview.rejectedRows.map((r) => [r.line, r.isbn, r.title, r.reason])
            );
          });
        } catch (err) {
          area.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
        }
      });

      commitBtn.addEventListener('click', async () => {
        const csvText = textArea.value.trim();
        if (!csvText) return;
        const res = await apiRequest('/books/import-csv', {
          method: 'POST',
          body: { csvText, dryRun: false },
        });
        closeDialog();
        showToast(
          `Imported ${res.data.imported} book(s) (${res.data.skippedDuplicate} duplicate ISBNs skipped).`,
          { tone: 'ok' }
        );
        onChanged();
      });
    },
  });
}

async function openManageCopiesDialog(bookId, onChanged) {
  const res = await apiRequest(`/books/${bookId}`);
  const book = res.data;

  openDialog({
    title: `Copies — ${book.title}`,
    closedBy: 'any',
    html: `
      <form id="add-copy-form" class="scanner-row" style="margin-block-end:0.85rem;">
        <div class="field">
          <label for="copy-barcode">New Barcode</label>
          <input id="copy-barcode" name="barcode" type="text" required placeholder="LIB-001301" autofocus />
        </div>
        <div class="field">
          <label for="copy-shelf">Shelf Location</label>
          <input id="copy-shelf" name="shelfLocation" type="text" required placeholder="CS-DB-02" />
        </div>
        <button type="submit" class="btn btn-primary">Add Copy</button>
      </form>
      <div style="margin-block-end:0.75rem;">
        <button type="button" class="btn btn-sm" id="btn-print-labels">Printable Barcode Labels (${book.copies.length})</button>
      </div>
      <div id="copy-err" style="margin-block-end:0.75rem;"></div>
      <div id="copies-table-wrap">
        ${renderResponsiveTable({
          captionId: `edit-copies-${book.id}`,
          caption: 'Existing Physical Copies',
          emptyText: 'No copies yet.',
          columns: [
            { label: 'Barcode', key: 'barcode', sortable: true, render: (c) => `<span class="mono">${escapeHtml(c.barcode)}</span>` },
            { label: 'Shelf', key: 'shelfLocation', sortable: true, render: (c) => `<span class="mono">${escapeHtml(c.shelfLocation)}</span>` },
            { label: 'Status', key: 'status', sortable: true, render: (c) => statusBadge(c.status) },
            {
              label: 'Actions',
              render: (c) => `
                <div style="display:flex;gap:0.3rem;flex-wrap:wrap;">
                  <button type="button" class="btn btn-sm" data-copy-history="${c.id}">History</button>
                  ${
                    c.status === 'on_loan' || c.status === 'reserved'
                      ? ''
                      : `<button type="button" class="btn btn-sm" data-copy-id="${c.id}" data-status="available">Avail</button>
                         <button type="button" class="btn btn-sm" data-copy-id="${c.id}" data-status="damaged">Damaged</button>
                         <button type="button" class="btn btn-sm" data-copy-id="${c.id}" data-status="lost">Lost</button>`
                  }
                </div>
              `,
            },
          ],
          rows: book.copies,
        })}
      </div>
      <div id="copy-history-area" style="margin-block-start:0.85rem;"></div>
      <div class="dialog-actions">
        <form method="dialog"><button type="submit" class="btn">Done</button></form>
      </div>
    `,
    onMount(bodyEl) {
      enhanceSortableTables(bodyEl);
      const form = bodyEl.querySelector('#add-copy-form');
      const errEl = bodyEl.querySelector('#copy-err');
      const historyArea = bodyEl.querySelector('#copy-history-area');

      bodyEl.querySelector('#btn-print-labels')?.addEventListener('click', () => {
        openDialog({
          title: `Barcode Labels — ${book.title}`,
          closedBy: 'any',
          html: `
            <div class="label-grid print-sheet">
              ${book.copies
                .map(
                  (c) => `
                <div class="label-card">
                  <div style="font-size:0.8rem;font-weight:600;">${escapeHtml(book.title)}</div>
                  <div class="mono-meta">Shelf ${escapeHtml(c.shelfLocation)}</div>
                  ${renderCode39Svg(c.barcode, { height: 34 })}
                </div>
              `
                )
                .join('')}
            </div>
            <div class="dialog-actions">
              <button type="button" class="btn btn-primary" id="btn-print-lbl-now">Print Labels</button>
              <form method="dialog"><button type="submit" class="btn">Close</button></form>
            </div>
          `,
          onMount(b) {
            b.querySelector('#btn-print-lbl-now')?.addEventListener('click', () => window.print());
          },
        });
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.innerHTML = '';
        try {
          await apiRequest(`/books/${book.id}/copies`, {
            method: 'POST',
            body: {
              barcode: form.barcode.value.trim(),
              shelfLocation: form.shelfLocation.value.trim(),
            },
          });
          showToast('Physical copy added.', { tone: 'ok' });
          await onChanged();
          openManageCopiesDialog(bookId, onChanged);
        } catch (err) {
          errEl.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
        }
      });

      bodyEl.querySelectorAll('[data-copy-history]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const histRes = await apiRequest(`/copies/${btn.dataset.copyHistory}/history`);
          const { copy, loans } = histRes.data;
          historyArea.innerHTML = renderResponsiveTable({
            captionId: `hist-copy-${copy.id}`,
            caption: `Loan Timeline — ${copy.barcode}`,
            emptyText: 'No circulation history recorded for this copy yet.',
            columns: [
              { label: 'Member', render: (l) => `${escapeHtml(l.memberName)} (${escapeHtml(l.memberNumber)})` },
              { label: 'Checked Out', render: (l) => `<span class="mono">${formatDate(l.checkedOutAt)}</span>` },
              { label: 'Due', render: (l) => `<span class="mono">${formatDate(l.dueAt)}</span>` },
              { label: 'Returned', render: (l) => `<span class="mono">${l.returnedAt ? formatDate(l.returnedAt) : 'Active'}</span>` },
            ],
            rows: loans,
          });
        });
      });

      bodyEl.querySelectorAll('[data-copy-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiRequest(`/copies/${btn.dataset.copyId}`, {
              method: 'PATCH',
              body: { status: btn.dataset.status },
            });
            showToast(`Copy marked as ${btn.dataset.status}.`, { tone: 'ok' });
            await onChanged();
            openManageCopiesDialog(bookId, onChanged);
          } catch (err) {
            errEl.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
          }
        });
      });
    },
  });
}

import { apiRequest } from '../api.js';
import { downloadLoanIcs } from '../ui/export.js';
import { escapeHtml, formatDate, statusBadge } from '../ui/format.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderMyLoansPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">My Loans &amp; History</h1>
        <p class="page-subtitle">View active due dates, download calendar reminders (.ics), renew eligible items, and inspect past returns.</p>
      </div>
    </div>

    <div class="tab-bar" role="tablist" aria-label="Loan views">
      <button type="button" role="tab" class="tab-btn" id="tab-active-loans" aria-selected="true">Active Loans</button>
      <button type="button" role="tab" class="tab-btn" id="tab-loan-history" aria-selected="false">Loan History</button>
    </div>

    <section class="panel" id="my-loans-content"></section>
  `;

  const contentEl = container.querySelector('#my-loans-content');
  const tabActive = container.querySelector('#tab-active-loans');
  const tabHistory = container.querySelector('#tab-loan-history');

  async function loadActive() {
    tabActive.setAttribute('aria-selected', 'true');
    tabHistory.setAttribute('aria-selected', 'false');
    contentEl.innerHTML = '<p class="muted">Loading active loans...</p>';

    const res = await apiRequest('/me/loans?limit=50');
    const byId = new Map(res.data.map((l) => [String(l.id), l]));

    contentEl.innerHTML = renderResponsiveTable({
      captionId: 'my-active-loans-cap',
      caption: 'Currently Borrowed Items',
      emptyText: 'You have no active loans right now.',
      columns: [
        { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title) },
        { label: 'Barcode', key: 'barcode', sortable: true, render: (r) => `<span class="mono">${escapeHtml(r.barcode)}</span>` },
        { label: 'Checked Out', key: 'checkedOutAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.checkedOutAt)}</span>` },
        { label: 'Due Date', key: 'dueAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.dueAt)}</span>` },
        {
          label: 'Status',
          render: (r) =>
            r.isOverdue
              ? statusBadge('overdue', 'Overdue')
              : statusBadge('active', `Active (${r.renewalsCount}/${r.maxRenewals} renewals)`),
        },
        {
          label: 'Actions',
          render: (r) => `
            <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-primary" data-renew-id="${r.id}" ${
                r.isOverdue || r.renewalsCount >= r.maxRenewals ? 'disabled' : ''
              }>Renew</button>
              <button type="button" class="btn btn-sm" data-ics-id="${r.id}">.ics</button>
            </div>
          `,
        },
      ],
      rows: res.data,
    });

    enhanceSortableTables(contentEl);

    contentEl.querySelectorAll('[data-renew-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const out = await apiRequest(`/loans/${btn.dataset.renewId}/renew`, { method: 'POST' });
          showToast(`Renewed until ${formatDate(out.data.dueAt)}.`, { tone: 'ok' });
          loadActive();
        } catch (err) {
          showToast(err.message, { tone: 'danger' });
          btn.disabled = false;
        }
      });
    });

    contentEl.querySelectorAll('[data-ics-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const loan = byId.get(btn.dataset.icsId);
        if (loan) {
          downloadLoanIcs(loan);
          showToast('Downloaded calendar reminder (.ics).', { tone: 'ok' });
        }
      });
    });
  }

  async function loadHistory() {
    tabActive.setAttribute('aria-selected', 'false');
    tabHistory.setAttribute('aria-selected', 'true');
    contentEl.innerHTML = '<p class="muted">Loading loan history...</p>';

    const res = await apiRequest('/me/loans/history?limit=50');
    contentEl.innerHTML = renderResponsiveTable({
      captionId: 'my-history-cap',
      caption: 'Returned Loan History',
      emptyText: 'No past returned loans found.',
      columns: [
        { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title) },
        { label: 'Barcode', key: 'barcode', sortable: true, render: (r) => `<span class="mono">${escapeHtml(r.barcode)}</span>` },
        { label: 'Checked Out', key: 'checkedOutAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.checkedOutAt)}</span>` },
        { label: 'Due Date', key: 'dueAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.dueAt)}</span>` },
        { label: 'Returned', key: 'returnedAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.returnedAt)}</span>` },
      ],
      rows: res.data,
    });
    enhanceSortableTables(contentEl);
  }

  tabActive.addEventListener('click', loadActive);
  tabHistory.addEventListener('click', loadHistory);
  await loadActive();
}

import { apiRequest } from '../api.js';
import { confirmDialog } from '../ui/dialog.js';
import { escapeHtml, formatDate, formatMoney, statusBadge } from '../ui/format.js';
import { renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderMyReservationsFinesPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Reservations &amp; Fines</h1>
        <p class="page-subtitle">Track waiting queue positions, pickup hold deadlines, and unpaid balances.</p>
      </div>
    </div>

    <div class="desk-stack">
      <section class="panel" id="my-reservations-panel"></section>
      <section class="panel" id="my-fines-panel"></section>
    </div>
  `;

  const resPanel = container.querySelector('#my-reservations-panel');
  const finesPanel = container.querySelector('#my-fines-panel');

  async function loadAll() {
    const [resData, finesData] = await Promise.all([
      apiRequest('/me/reservations'),
      apiRequest('/me/fines'),
    ]);

    resPanel.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">My Reservations</h2>
      </div>
      ${renderResponsiveTable({
        captionId: 'my-res-cap',
        caption: 'Book Reservations and Hold Queue',
        emptyText: 'You have no reservations. Reserve any checked-out book from the Catalogue.',
        columns: [
          { label: 'Title', render: (r) => escapeHtml(r.title) },
          { label: 'Reserved', render: (r) => `<span class="mono">${formatDate(r.reservedAt)}</span>` },
          { label: 'Status', render: (r) => statusBadge(r.status) },
          {
            label: 'Queue / Hold Expiry',
            render: (r) =>
              r.status === 'waiting'
                ? `Position #${r.queuePosition}`
                : r.status === 'ready'
                  ? `Hold until ${formatDate(r.expiresAt)}`
                  : '—',
          },
          {
            label: 'Action',
            render: (r) =>
              ['waiting', 'ready'].includes(r.status)
                ? `<button type="button" class="btn btn-sm" data-cancel-res="${r.id}" data-title="${escapeHtml(r.title)}">Cancel</button>`
                : '—',
          },
        ],
        rows: resData.data,
      })}
    `;

    const unpaidTotal = finesData.data
      .filter((f) => f.status === 'unpaid')
      .reduce((sum, f) => sum + Number(f.amount), 0);

    finesPanel.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">My Fines</h2>
        <span class="badge ${unpaidTotal > 0 ? 'badge-danger' : 'badge-ok'}">
          Unpaid Balance: ${formatMoney(unpaidTotal)}
        </span>
      </div>
      ${renderResponsiveTable({
        captionId: 'my-fines-cap',
        caption: 'Assessed Fines Ledger',
        emptyText: 'You have no assessed fines.',
        columns: [
          { label: 'Book', render: (f) => escapeHtml(f.title) },
          { label: 'Barcode', render: (f) => `<span class="mono">${escapeHtml(f.barcode)}</span>` },
          { label: 'Reason', render: (f) => escapeHtml(f.reason) },
          { label: 'Amount', render: (f) => `<span class="mono">${formatMoney(f.amount)}</span>` },
          { label: 'Status', render: (f) => statusBadge(f.status) },
          { label: 'Assessed', render: (f) => `<span class="mono">${formatDate(f.assessedAt)}</span>` },
        ],
        rows: finesData.data,
      })}
    `;

    resPanel.querySelectorAll('[data-cancel-res]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Cancel reservation?',
          message: `Remove your reservation for "${btn.dataset.title}"?`,
          confirmLabel: 'Cancel Reservation',
          cancelLabel: 'Keep',
        });
        if (!ok) return;
        try {
          await apiRequest(`/reservations/${btn.dataset.cancelRes}`, { method: 'DELETE' });
          showToast('Reservation cancelled.', { tone: 'ok' });
          loadAll();
        } catch (err) {
          showToast(err.message, { tone: 'danger' });
        }
      });
    });
  }

  await loadAll();
}

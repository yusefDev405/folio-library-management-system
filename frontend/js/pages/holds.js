import { apiRequest } from '../api.js';
import { confirmDialog } from '../ui/dialog.js';
import { escapeHtml, formatDate, statusBadge } from '../ui/format.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderHoldsPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Holds Shelf &amp; Reservation Queue</h1>
        <p class="page-subtitle">Manage ready pickup holds and inspect FIFO waiting queues across all titles.</p>
      </div>
    </div>

    <div class="desk-stack">
      <section class="panel" id="ready-holds-panel"></section>
      <section class="panel" id="waiting-queue-panel"></section>
    </div>
  `;

  const readyEl = container.querySelector('#ready-holds-panel');
  const waitingEl = container.querySelector('#waiting-queue-panel');

  async function refresh() {
    const res = await apiRequest('/reservations');
    const readyRows = res.data.filter((r) => r.status === 'ready');
    const waitingRows = res.data.filter((r) => r.status === 'waiting');

    readyEl.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">Ready on Hold Shelf (${readyRows.length})</h2>
      </div>
      ${renderResponsiveTable({
        captionId: 'holds-ready-cap',
        caption: 'Copies Held for Pickup',
        emptyText: 'No copies are currently waiting on the Hold Shelf.',
        columns: [
          { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title) },
          { label: 'Held Barcode', key: 'heldBarcode', sortable: true, render: (r) => `<span class="mono">${escapeHtml(r.heldBarcode || '—')}</span>` },
          { label: 'Member', key: 'memberName', sortable: true, render: (r) => `${escapeHtml(r.memberName)} <span class="mono-meta">(${escapeHtml(r.memberNumber)})</span>` },
          { label: 'Hold Expires', key: 'expiresAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.expiresAt)}</span>` },
          {
            label: 'Actions',
            render: (r) => `
              <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
                ${
                  r.heldBarcode
                    ? `<button type="button" class="btn btn-sm btn-primary" data-checkout-hold="${r.memberId}" data-barcode="${escapeHtml(r.heldBarcode)}">Check Out Hold</button>`
                    : ''
                }
                <button type="button" class="btn btn-sm" data-cancel-hold="${r.id}" data-title="${escapeHtml(r.title)}">Cancel / Pass</button>
              </div>
            `,
          },
        ],
        rows: readyRows,
      })}
    `;

    waitingEl.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">Waiting Queue (${waitingRows.length})</h2>
      </div>
      ${renderResponsiveTable({
        captionId: 'holds-waiting-cap',
        caption: 'FIFO Reservation Waiting List',
        emptyText: 'No members are waiting in the reservation queue.',
        columns: [
          { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title) },
          { label: 'Queue #', key: 'queuePosition', sortable: true, type: 'number', render: (r) => statusBadge('waiting', `#${r.queuePosition}`) },
          { label: 'Member', key: 'memberName', sortable: true, render: (r) => `${escapeHtml(r.memberName)} <span class="mono-meta">(${escapeHtml(r.memberNumber)})</span>` },
          { label: 'Requested', key: 'reservedAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.reservedAt)}</span>` },
          {
            label: 'Action',
            render: (r) =>
              `<button type="button" class="btn btn-sm" data-cancel-hold="${r.id}" data-title="${escapeHtml(r.title)}">Cancel</button>`,
          },
        ],
        rows: waitingRows,
      })}
    `;

    enhanceSortableTables(container);

    readyEl.querySelectorAll('[data-checkout-hold]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const out = await apiRequest('/loans/checkout', {
            method: 'POST',
            body: {
              memberId: Number(btn.dataset.checkoutHold),
              barcode: btn.dataset.barcode,
            },
          });
          showToast(`Hold checked out to ${out.data.memberName} (due ${formatDate(out.data.dueAt)}).`, {
            tone: 'ok',
          });
          refresh();
        } catch (err) {
          showToast(err.message, { tone: 'danger' });
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('[data-cancel-hold]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Cancel reservation?',
          message: `Cancel this reservation for "${btn.dataset.title}"? Ready holds will pass to the next waiting member.`,
          confirmLabel: 'Cancel Reservation',
          cancelLabel: 'Keep',
        });
        if (!ok) return;
        await apiRequest(`/reservations/${btn.dataset.cancelHold}`, { method: 'DELETE' });
        showToast('Reservation updated.', { tone: 'ok' });
        refresh();
      });
    });
  }

  await refresh();
}

import { apiRequest } from '../api.js';
import { closeDialog, openDialog } from '../ui/dialog.js';
import { escapeHtml, formatDate, formatDateTime, formatMoney, statusBadge } from '../ui/format.js';
import { isDeskAudioEnabled, playScanTone, setDeskAudioEnabled } from '../ui/sound.js';
import { showToast } from '../ui/toast.js';

export async function renderDeskPage(container) {
  let selectedMember = null;
  const sessionLog = [];
  const audioOn = isDeskAudioEnabled();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Circulation Desk</h1>
        <p class="page-subtitle">Scanner-ready checkout, return, receipt printing, and lost/damaged settlement.</p>
      </div>
      <label style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.875rem;cursor:pointer;">
        <input type="checkbox" id="desk-audio-toggle" ${audioOn ? 'checked' : ''} />
        <span>Scanner Audio Chimes</span>
      </label>
    </div>

    <div class="desk-layout">
      <section class="panel" aria-labelledby="desk-member-heading">
        <h2 id="desk-member-heading" class="panel-title" style="margin-block-end:0.65rem;">1. Member Lookup</h2>
        <form id="desk-member-form" class="scanner-row">
          <div class="field">
            <label for="desk-member-q">Member number, name, or email</label>
            <input id="desk-member-q" name="q" type="search" placeholder="e.g. MEM-1001 or Sara" autocomplete="off" />
          </div>
          <button type="submit" class="btn btn-primary">Find</button>
        </form>

        <div id="desk-member-results" style="margin-block-start:0.75rem;"></div>
        <div id="desk-selected-member"></div>
      </section>

      <div class="desk-stack">
        <section class="panel" aria-labelledby="desk-checkout-heading">
          <h2 id="desk-checkout-heading" class="panel-title" style="margin-block-end:0.65rem;">2. Check Out Copy</h2>
          <form id="desk-checkout-form" class="scanner-row">
            <div class="field">
              <label for="desk-checkout-barcode">Scan or enter copy barcode</label>
              <span id="checkout-hint" class="hint">Scanner-ready: pressing Enter submits and refocuses for the next item</span>
              <input
                id="desk-checkout-barcode"
                name="barcode"
                type="text"
                required
                placeholder="e.g. LIB-000201"
                autocomplete="off"
                aria-describedby="checkout-hint"
              />
            </div>
            <button type="submit" class="btn btn-primary" id="desk-checkout-btn">Check Out</button>
          </form>
          <div id="desk-checkout-feedback" style="margin-block-start:0.75rem;" aria-live="polite"></div>
        </section>

        <section class="panel" aria-labelledby="desk-return-heading">
          <h2 id="desk-return-heading" class="panel-title" style="margin-block-end:0.65rem;">3. Check In / Return Copy</h2>
          <form id="desk-return-form" class="scanner-row">
            <div class="field">
              <label for="desk-return-barcode">Scan or enter returning barcode</label>
              <span id="return-hint" class="hint">Assesses overdue fines and flags waiting reservation holds automatically</span>
              <input
                id="desk-return-barcode"
                name="barcode"
                type="text"
                required
                placeholder="e.g. LIB-000101"
                autocomplete="off"
                aria-describedby="return-hint"
              />
            </div>
            <button type="submit" class="btn btn-primary" id="desk-return-btn">Return Item</button>
          </form>
          <div id="desk-return-feedback" style="margin-block-start:0.75rem;" aria-live="polite"></div>
        </section>

        <section class="panel" aria-labelledby="desk-log-heading">
          <div class="panel-header">
            <h2 id="desk-log-heading" class="panel-title">Session Activity Log</h2>
          </div>
          <ul id="desk-activity-log" class="desk-log">
            <li class="muted">No desk transactions recorded in this session yet.</li>
          </ul>
        </section>
      </div>
    </div>
  `;

  container.querySelector('#desk-audio-toggle').addEventListener('change', (e) => {
    setDeskAudioEnabled(e.currentTarget.checked);
    if (e.currentTarget.checked) playScanTone('ok');
  });

  const memberForm = container.querySelector('#desk-member-form');
  const memberResultsEl = container.querySelector('#desk-member-results');
  const selectedMemberEl = container.querySelector('#desk-selected-member');
  const checkoutForm = container.querySelector('#desk-checkout-form');
  const checkoutInput = container.querySelector('#desk-checkout-barcode');
  const checkoutFeedback = container.querySelector('#desk-checkout-feedback');
  const returnForm = container.querySelector('#desk-return-form');
  const returnInput = container.querySelector('#desk-return-barcode');
  const returnFeedback = container.querySelector('#desk-return-feedback');
  const logEl = container.querySelector('#desk-activity-log');

  function pushLog(html) {
    sessionLog.unshift(html);
    if (sessionLog.length > 10) sessionLog.pop();
    logEl.innerHTML = sessionLog.map((item) => `<li>${item}</li>`).join('');
  }

  function openReceiptDialog(title, lines) {
    openDialog({
      title,
      closedBy: 'any',
      html: `
        <div class="print-sheet">
          <p class="mono-meta">Folio Library Circulation Slip &middot; ${formatDateTime(new Date().toISOString())}</p>
          <dl class="form-grid" style="margin:0;">
            ${lines
              .map(
                ([k, v]) =>
                  `<div style="display:flex;justify-content:space-between;gap:1rem;border-block-end:1px solid var(--border);padding-block:0.35rem;">
                    <dt class="muted">${escapeHtml(k)}</dt>
                    <dd class="mono" style="margin:0;font-weight:600;">${escapeHtml(v)}</dd>
                  </div>`
              )
              .join('')}
          </dl>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-primary" id="btn-print-slip">Print Receipt</button>
          <form method="dialog"><button type="submit" class="btn">Close</button></form>
        </div>
      `,
      onMount(bodyEl) {
        bodyEl.querySelector('#btn-print-slip')?.addEventListener('click', () => window.print());
      },
    });
  }

  function openReportIssueModal(copyId, barcode, title) {
    openDialog({
      title: `Report Lost / Damaged — ${barcode}`,
      closedBy: 'closerequest',
      html: `
        <p style="margin-block-end:0.75rem;">Closing active loan and updating <strong>${escapeHtml(title)}</strong>.</p>
        <form id="desk-issue-form" class="form-grid">
          <div class="field">
            <label for="issue-status">Condition</label>
            <select id="issue-status" name="status">
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div class="field">
            <label for="issue-fine">Assess Replacement / Damage Fee ($)</label>
            <input id="issue-fine" name="fineAmount" type="number" step="0.50" min="0" value="15.00" />
          </div>
          <div id="issue-err"></div>
          <div class="dialog-actions">
            <button type="button" class="btn" onclick="this.closest('dialog').close()">Cancel</button>
            <button type="submit" class="btn btn-danger">Confirm &amp; Assess</button>
          </div>
        </form>
      `,
      onMount(bodyEl) {
        bodyEl.querySelector('#desk-issue-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.currentTarget;
          try {
            const out = await apiRequest(`/copies/${copyId}/report-issue`, {
              method: 'POST',
              body: {
                status: f.status.value,
                fineAmount: Number(f.fineAmount.value || 0),
              },
            });
            closeDialog();
            showToast(
              `Marked ${barcode} as ${out.data.copy.status}${out.data.fineAmount > 0 ? ` (Fine $${out.data.fineAmount.toFixed(2)})` : ''}.`,
              { tone: 'warn' }
            );
            if (selectedMember) await selectMemberById(selectedMember.id);
          } catch (err) {
            bodyEl.querySelector('#issue-err').innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
          }
        });
      },
    });
  }

  async function selectMemberById(memberId) {
    const res = await apiRequest(`/members/${memberId}`);
    selectedMember = res.data;
    renderSelectedMember();
  }

  function renderSelectedMember() {
    if (!selectedMember) {
      selectedMemberEl.innerHTML =
        '<p class="banner" style="margin-block-start:0.75rem;">Select a member from the list above before checking out items.</p>';
      return;
    }

    const m = selectedMember;
    selectedMemberEl.innerHTML = `
      <div class="member-summary-box">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <div>
            <strong>${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</strong>
            <div class="mono-meta">${escapeHtml(m.memberNumber)} &middot; ${escapeHtml(m.memberType)}</div>
          </div>
          ${statusBadge(m.status)}
        </div>
        <dl class="kv-grid">
          <div class="kv-item">
            <dt>Active Loans</dt>
            <dd class="mono">${m.activeLoans} / ${m.maxLoans}</dd>
          </div>
          <div class="kv-item">
            <dt>Unpaid Fines</dt>
            <dd class="mono">${formatMoney(m.unpaidFines)} / ${formatMoney(m.maxUnpaidFines)}</dd>
          </div>
          <div class="kv-item">
            <dt>Expires</dt>
            <dd class="mono">${formatDate(m.expiresAt)}</dd>
          </div>
        </dl>
        ${
          m.loans.length
            ? `<div style="margin-block-start:0.5rem;">
                 <div class="mono-meta" style="margin-block-end:0.35rem;">Currently borrowed:</div>
                 <ul style="margin:0;padding-inline-start:1.1rem;font-size:0.85rem;display:grid;gap:0.35rem;">
                   ${m.loans
                     .map(
                       (l) =>
                         `<li>
                           <span class="mono">${escapeHtml(l.barcode)}</span> &mdash; ${escapeHtml(l.title)} (due ${formatDate(l.dueAt)})
                           <button type="button" class="btn btn-sm" data-report-copy="${l.copyId}" data-barcode="${escapeHtml(l.barcode)}" data-title="${escapeHtml(l.title)}" style="margin-inline-start:0.35rem;">Lost/Damaged</button>
                         </li>`
                     )
                     .join('')}
                 </ul>
               </div>`
            : '<p class="muted" style="font-size:0.85rem;">No active loans.</p>'
        }
      </div>
    `;

    selectedMemberEl.querySelectorAll('[data-report-copy]').forEach((btn) => {
      btn.addEventListener('click', () =>
        openReportIssueModal(Number(btn.dataset.reportCopy), btn.dataset.barcode, btn.dataset.title)
      );
    });
  }

  async function searchMembers(q) {
    const res = await apiRequest(`/members?q=${encodeURIComponent(q)}&limit=8`);
    if (res.data.length === 0) {
      memberResultsEl.innerHTML = '<p class="muted">No matching members found.</p>';
      return;
    }
    memberResultsEl.innerHTML = `
      <div class="demo-list">
        ${res.data
          .map(
            (m) => `
          <div class="demo-row">
            <div>
              <strong>${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</strong>
              <span class="mono-meta">(${escapeHtml(m.memberNumber)})</span>
              ${statusBadge(m.status)}
            </div>
            <button type="button" class="btn btn-sm" data-pick-member="${m.id}">Select</button>
          </div>`
          )
          .join('')}
      </div>
    `;
    memberResultsEl.querySelectorAll('[data-pick-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectMemberById(Number(btn.dataset.pickMember));
        checkoutInput.focus();
      });
    });
  }

  memberForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchMembers(memberForm.q.value.trim());
  });

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    checkoutFeedback.innerHTML = '';
    if (!selectedMember) {
      playScanTone('error');
      checkoutFeedback.innerHTML =
        '<p class="banner banner-warn">Select a member in step 1 before scanning a checkout barcode.</p>';
      return;
    }
    const barcode = checkoutInput.value.trim();
    if (!barcode) return;

    try {
      const res = await apiRequest('/loans/checkout', {
        method: 'POST',
        body: { memberId: selectedMember.id, barcode },
      });
      const loan = res.data;
      playScanTone('ok');
      checkoutFeedback.innerHTML = `
        <div class="banner banner-ok" style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap;">
          <span>Checked out <strong>${escapeHtml(loan.title)}</strong> (<span class="mono">${escapeHtml(loan.barcode)}</span>) to ${escapeHtml(loan.memberName)}. Due <strong>${formatDate(loan.dueAt)}</strong>.</span>
          <button type="button" class="btn btn-sm" id="btn-co-receipt">Print Receipt</button>
        </div>
      `;
      checkoutFeedback.querySelector('#btn-co-receipt')?.addEventListener('click', () => {
        openReceiptDialog('Checkout Receipt', [
          ['Transaction', 'Checkout'],
          ['Member', `${loan.memberName} (${loan.memberNumber})`],
          ['Title', loan.title],
          ['Barcode', loan.barcode],
          ['Checked Out', formatDate(loan.checkedOutAt)],
          ['Due Date', formatDate(loan.dueAt)],
        ]);
      });
      pushLog(
        `<strong>OUT</strong> &middot; <span class="mono">${escapeHtml(loan.barcode)}</span> (${escapeHtml(loan.title)}) &rarr; ${escapeHtml(loan.memberNumber)} (due ${formatDate(loan.dueAt)})`
      );
      await selectMemberById(selectedMember.id);
    } catch (err) {
      playScanTone('error');
      checkoutFeedback.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
    } finally {
      checkoutInput.value = '';
      checkoutInput.focus();
    }
  });

  returnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    returnFeedback.innerHTML = '';
    const barcode = returnInput.value.trim();
    if (!barcode) return;

    try {
      const res = await apiRequest('/loans/return', {
        method: 'POST',
        body: { barcode },
      });
      const r = res.data;
      playScanTone('ok');

      const fineHtml =
        r.fineAmount > 0
          ? `<div class="banner banner-danger" style="margin-block-start:0.5rem;display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap;">
               <span>Overdue by ${r.daysLate} day${r.daysLate === 1 ? '' : 's'}. Assessed fine: <strong class="mono">${formatMoney(r.fineAmount)}</strong></span>
               <button type="button" class="btn btn-sm btn-primary" id="desk-collect-fine-btn" data-fine-id="${r.fineId}">Collect Payment</button>
             </div>`
          : '';

      const holdHtml = r.handedToReservation
        ? `<div class="banner banner-warn" style="margin-block-start:0.5rem;">
             <strong>Hold Notice:</strong> Place copy on Hold Shelf for <strong>${escapeHtml(r.handedToReservation.memberName)}</strong> (${escapeHtml(r.handedToReservation.memberNumber)}) until ${formatDate(r.handedToReservation.expiresAt)}.
           </div>`
        : '';

      returnFeedback.innerHTML = `
        <div class="banner banner-ok" style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap;">
          <span>Returned <strong>${escapeHtml(r.title)}</strong> (<span class="mono">${escapeHtml(r.barcode)}</span>) from ${escapeHtml(r.memberName)}. Copy status: <strong>${escapeHtml(r.copyStatus)}</strong>.</span>
          <button type="button" class="btn btn-sm" id="btn-ret-receipt">Print Receipt</button>
        </div>
        ${fineHtml}
        ${holdHtml}
      `;

      returnFeedback.querySelector('#btn-ret-receipt')?.addEventListener('click', () => {
        openReceiptDialog('Return Receipt', [
          ['Transaction', 'Return'],
          ['Member', `${r.memberName} (${r.memberNumber})`],
          ['Title', r.title],
          ['Barcode', r.barcode],
          ['Returned At', formatDate(r.returnedAt)],
          ['Days Late', String(r.daysLate)],
          ['Fine Assessed', formatMoney(r.fineAmount)],
          ['Shelf / Hold Status', r.copyStatus],
        ]);
      });

      returnFeedback.querySelector('#desk-collect-fine-btn')?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          await apiRequest(`/fines/${btn.dataset.fineId}/pay`, { method: 'POST' });
          showToast('Fine marked as paid.', { tone: 'ok' });
          btn.replaceWith(document.createTextNode('Paid'));
          if (selectedMember && selectedMember.id === r.memberId) {
            await selectMemberById(selectedMember.id);
          }
        } catch (err) {
          showToast(err.message, { tone: 'danger' });
          btn.disabled = false;
        }
      });

      pushLog(
        `<strong>IN</strong> &middot; <span class="mono">${escapeHtml(r.barcode)}</span> (${escapeHtml(r.title)}) &larr; ${escapeHtml(r.memberNumber)}${r.fineAmount > 0 ? ` &middot; Fine ${formatMoney(r.fineAmount)}` : ''}${r.handedToReservation ? ` &middot; Held for ${escapeHtml(r.handedToReservation.memberNumber)}` : ''}`
      );

      if (selectedMember && selectedMember.id === r.memberId) {
        await selectMemberById(selectedMember.id);
      }
    } catch (err) {
      playScanTone('error');
      returnFeedback.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
    } finally {
      returnInput.value = '';
      returnInput.focus();
    }
  });

  renderSelectedMember();
  await searchMembers('');
}

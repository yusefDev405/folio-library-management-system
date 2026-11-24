import { apiRequest } from '../api.js';
import { closeDialog, openDialog } from '../ui/dialog.js';
import { downloadCsv } from '../ui/export.js';
import { escapeHtml, formatDate, formatMoney, statusBadge } from '../ui/format.js';
import { enhanceFormValidation } from '../ui/formValidation.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderManageMembersPage(container) {
  let lastMembers = [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Members &amp; Fines Desk</h1>
        <p class="page-subtitle">Register library patrons, manage membership status/expiry, export directory CSV, and collect unpaid fines.</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button type="button" class="btn" id="btn-export-members">Export CSV</button>
        <button type="button" class="btn btn-primary" id="btn-add-member">+ Register Member</button>
      </div>
    </div>

    <div class="desk-stack">
      <section class="panel">
        <form id="member-filter-form" class="scanner-row" style="margin-block-end:0.85rem;">
          <div class="field">
            <label for="mem-q">Search members</label>
            <input id="mem-q" name="q" type="search" placeholder="Name, email, or member number" />
          </div>
          <button type="submit" class="btn btn-primary">Filter</button>
        </form>
        <div id="members-table-area"></div>
      </section>

      <section class="panel" id="unpaid-fines-area"></section>
    </div>
  `;

  const membersArea = container.querySelector('#members-table-area');
  const finesArea = container.querySelector('#unpaid-fines-area');
  const filterForm = container.querySelector('#member-filter-form');

  container.querySelector('#btn-export-members').addEventListener('click', () => {
    downloadCsv(
      'folio-members.csv',
      ['Member Number', 'First Name', 'Last Name', 'Email', 'Type', 'Status', 'Active Loans', 'Unpaid Fines', 'Expires At'],
      lastMembers.map((m) => [
        m.memberNumber,
        m.firstName,
        m.lastName,
        m.email,
        m.memberType,
        m.status,
        m.activeLoans,
        m.unpaidFines,
        m.expiresAt,
      ])
    );
  });

  async function refresh() {
    const q = filterForm.q.value.trim();
    const [membersRes, finesRes] = await Promise.all([
      apiRequest(`/members?q=${encodeURIComponent(q)}&limit=50`),
      apiRequest('/fines?status=unpaid&limit=50'),
    ]);
    lastMembers = membersRes.data;

    membersArea.innerHTML = renderResponsiveTable({
      captionId: 'members-list-cap',
      caption: 'Registered Library Members',
      emptyText: 'No members match your filter.',
      columns: [
        { label: 'Member #', key: 'memberNumber', sortable: true, render: (m) => `<span class="mono">${escapeHtml(m.memberNumber)}</span>` },
        { label: 'Name', sortable: true, sortValue: (m) => `${m.lastName} ${m.firstName}`, render: (m) => `${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}` },
        { label: 'Type', key: 'memberType', sortable: true, render: (m) => escapeHtml(m.memberType) },
        { label: 'Status', key: 'status', sortable: true, render: (m) => statusBadge(m.status) },
        { label: 'Loans', key: 'activeLoans', sortable: true, type: 'number', render: (m) => `<span class="mono">${m.activeLoans}/${m.maxLoans}</span>` },
        { label: 'Unpaid', key: 'unpaidFines', sortable: true, type: 'number', render: (m) => `<span class="mono">${formatMoney(m.unpaidFines)}</span>` },
        {
          label: 'Actions',
          render: (m) =>
            `<div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm" data-toggle-status="${m.id}" data-cur="${m.status}">
                ${m.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
              <button type="button" class="btn btn-sm" data-renew-mem="${m.id}">+1 Yr</button>
            </div>`,
        },
      ],
      rows: membersRes.data,
    });

    finesArea.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">Open Unpaid Fines</h2>
      </div>
      ${renderResponsiveTable({
        captionId: 'open-fines-cap',
        caption: 'Unpaid Member Fines',
        emptyText: 'No unpaid fines on record.',
        columns: [
          { label: 'Member #', key: 'memberNumber', sortable: true, render: (f) => `<span class="mono">${escapeHtml(f.memberNumber)}</span>` },
          { label: 'Member', key: 'memberName', sortable: true, render: (f) => escapeHtml(f.memberName) },
          { label: 'Book', key: 'title', sortable: true, render: (f) => escapeHtml(f.title) },
          { label: 'Amount', key: 'amount', sortable: true, type: 'number', render: (f) => `<span class="mono">${formatMoney(f.amount)}</span>` },
          { label: 'Assessed', key: 'assessedAt', sortable: true, render: (f) => `<span class="mono">${formatDate(f.assessedAt)}</span>` },
          {
            label: 'Action',
            render: (f) =>
              `<button type="button" class="btn btn-sm btn-primary" data-pay-fine="${f.id}">Mark Paid</button>`,
          },
        ],
        rows: finesRes.data,
      })}
    `;

    enhanceSortableTables(container);

    membersArea.querySelectorAll('[data-toggle-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextStatus = btn.dataset.cur === 'active' ? 'suspended' : 'active';
        await apiRequest(`/members/${btn.dataset.toggleStatus}`, {
          method: 'PATCH',
          body: { status: nextStatus },
        });
        showToast(`Member status set to ${nextStatus}.`, { tone: 'ok' });
        refresh();
      });
    });

    membersArea.querySelectorAll('[data-renew-mem]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextYear = new Date();
        nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
        await apiRequest(`/members/${btn.dataset.renewMem}`, {
          method: 'PATCH',
          body: { status: 'active', expiresAt: nextYear.toISOString().slice(0, 10) },
        });
        showToast('Membership renewed for 1 year.', { tone: 'ok' });
        refresh();
      });
    });

    finesArea.querySelectorAll('[data-pay-fine]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/fines/${btn.dataset.payFine}/pay`, { method: 'POST' });
        showToast('Fine payment recorded.', { tone: 'ok' });
        refresh();
      });
    });
  }

  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    refresh();
  });

  container.querySelector('#btn-add-member').addEventListener('click', () => {
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    const defaultExpiry = nextYear.toISOString().slice(0, 10);

    openDialog({
      title: 'Register New Member',
      closedBy: 'closerequest',
      html: `
        <form id="register-member-form" class="form-grid" novalidate>
          <div class="form-row-2">
            <div class="field">
              <label for="rm-num">Member Number</label>
              <span class="hint">Example: MEM-1005</span>
              <input id="rm-num" name="memberNumber" type="text" required pattern="[A-Za-z0-9\\-]{3,32}" autofocus />
            </div>
            <div class="field">
              <label for="rm-type">Member Type</label>
              <select id="rm-type" name="memberType">
                <option value="student">Student</option>
                <option value="staff">Staff</option>
                <option value="external">External</option>
              </select>
            </div>
          </div>
          <div class="form-row-2">
            <div class="field">
              <label for="rm-first">First Name</label>
              <input id="rm-first" name="firstName" type="text" required />
            </div>
            <div class="field">
              <label for="rm-last">Last Name</label>
              <input id="rm-last" name="lastName" type="text" required />
            </div>
          </div>
          <div class="form-row-2">
            <div class="field">
              <label for="rm-email">Email</label>
              <input id="rm-email" name="email" type="email" required />
            </div>
            <div class="field">
              <label for="rm-pass">Initial Password</label>
              <span class="hint">8+ chars, upper, lower, digit</span>
              <input id="rm-pass" name="password" type="password" required minlength="8" />
            </div>
          </div>
          <div class="field">
            <label for="rm-exp">Membership Expiry</label>
            <input id="rm-exp" name="expiresAt" type="date" required value="${defaultExpiry}" />
          </div>
          <div id="rm-err"></div>
          <div class="dialog-actions">
            <button type="button" class="btn" onclick="this.closest('dialog').close()">Cancel</button>
            <button type="submit" class="btn btn-primary">Register</button>
          </div>
        </form>
      `,
      onMount(bodyEl) {
        const form = bodyEl.querySelector('#register-member-form');
        enhanceFormValidation(form);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!form.checkValidity()) return;
          try {
            await apiRequest('/members', {
              method: 'POST',
              body: {
                memberNumber: form.memberNumber.value.trim(),
                memberType: form.memberType.value,
                firstName: form.firstName.value.trim(),
                lastName: form.lastName.value.trim(),
                email: form.email.value.trim(),
                password: form.password.value,
                expiresAt: form.expiresAt.value,
              },
            });
            closeDialog();
            showToast('Member registered.', { tone: 'ok' });
            refresh();
          } catch (err) {
            bodyEl.querySelector('#rm-err').innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
          }
        });
      },
    });
  });

  await refresh();
}

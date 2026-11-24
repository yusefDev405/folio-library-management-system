import { apiRequest } from '../api.js';
import { confirmDialog, openDialog } from '../ui/dialog.js';
import { downloadCsv } from '../ui/export.js';
import { escapeHtml, formatDateTime, formatMoney, statusBadge } from '../ui/format.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderAdminPage(container) {
  let auditFilter = { entity: '', from: '', to: '' };
  let lastAuditRows = [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Administration</h1>
        <p class="page-subtitle">Manage loan policies, staff accounts, backups &amp; restore verification, fine waivers, and the audit log.</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button type="button" class="btn" id="btn-gen-reminders">Run Reminders Sweep</button>
        <button type="button" class="btn" id="btn-expire-holds">Run Hold-Expiry Job</button>
      </div>
    </div>

    <div class="desk-stack">
      <section class="panel" id="admin-policies-panel"></section>
      <section class="panel" id="admin-backups-panel"></section>
      <section class="panel" id="admin-users-panel"></section>
      <section class="panel" id="admin-fines-panel"></section>
      <section class="panel" id="admin-audit-panel"></section>
    </div>
  `;

  const policiesEl = container.querySelector('#admin-policies-panel');
  const backupsEl = container.querySelector('#admin-backups-panel');
  const usersEl = container.querySelector('#admin-users-panel');
  const finesEl = container.querySelector('#admin-fines-panel');
  const auditEl = container.querySelector('#admin-audit-panel');

  container.querySelector('#btn-gen-reminders').addEventListener('click', async () => {
    const res = await apiRequest('/admin/generate-reminders', { method: 'POST' });
    showToast(`Generated ${res.data.created} new reminder notification(s).`, { tone: 'ok' });
  });

  container.querySelector('#btn-expire-holds').addEventListener('click', async () => {
    const res = await apiRequest('/admin/expire-holds', { method: 'POST' });
    showToast(
      `Expired ${res.data.expiredCount} hold(s), promoted ${res.data.promotedCount}, released ${res.data.releasedCount}.`,
      { tone: 'ok' }
    );
    loadAll();
  });

  async function loadAuditOnly() {
    const params = new URLSearchParams({ limit: '50' });
    if (auditFilter.entity) params.set('entity', auditFilter.entity);
    if (auditFilter.from) params.set('from', auditFilter.from);
    if (auditFilter.to) params.set('to', `${auditFilter.to}T23:59:59Z`);

    const auditRes = await apiRequest(`/audit-log?${params.toString()}`);
    lastAuditRows = auditRes.data;
    const byId = new Map(lastAuditRows.map((a) => [String(a.id), a]));

    auditEl.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">Audit Trail (Trigger-Written)</h2>
        <button type="button" class="btn btn-sm" id="btn-export-audit">Export CSV</button>
      </div>
      <form id="audit-filter-form" class="scanner-row" style="margin-block-end:0.85rem;">
        <div class="field">
          <label for="af-entity">Entity</label>
          <select id="af-entity" name="entity">
            <option value="">All entities</option>
            <option value="loans" ${auditFilter.entity === 'loans' ? 'selected' : ''}>loans</option>
            <option value="fines" ${auditFilter.entity === 'fines' ? 'selected' : ''}>fines</option>
            <option value="reservations" ${auditFilter.entity === 'reservations' ? 'selected' : ''}>reservations</option>
          </select>
        </div>
        <div class="field">
          <label for="af-from">From Date</label>
          <input id="af-from" name="from" type="date" value="${escapeHtml(auditFilter.from)}" />
        </div>
        <div class="field">
          <label for="af-to">To Date</label>
          <input id="af-to" name="to" type="date" value="${escapeHtml(auditFilter.to)}" />
        </div>
        <button type="submit" class="btn btn-primary">Filter</button>
      </form>
      ${renderResponsiveTable({
        captionId: 'admin-audit-cap',
        caption: 'Recent Audit Log Entries',
        emptyText: 'No audit log entries match your filters.',
        columns: [
          { label: 'Timestamp', key: 'createdAt', sortable: true, render: (a) => `<span class="mono">${formatDateTime(a.createdAt)}</span>` },
          { label: 'Actor', key: 'actorEmail', sortable: true, render: (a) => escapeHtml(a.actorEmail || 'system') },
          { label: 'Entity', key: 'entity', sortable: true, render: (a) => `<span class="mono">${escapeHtml(a.entity)} #${a.entityId}</span>` },
          { label: 'Action', key: 'action', sortable: true, render: (a) => escapeHtml(a.action) },
          {
            label: 'Inspect',
            render: (a) => `<button type="button" class="btn btn-sm" data-audit-diff="${a.id}">View Diff</button>`,
          },
        ],
        rows: lastAuditRows,
      })}
    `;

    enhanceSortableTables(auditEl);

    auditEl.querySelector('#audit-filter-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      auditFilter = {
        entity: f.entity.value,
        from: f.from.value,
        to: f.to.value,
      };
      loadAuditOnly();
    });

    auditEl.querySelector('#btn-export-audit')?.addEventListener('click', () => {
      downloadCsv(
        'folio-audit-log.csv',
        ['ID', 'Timestamp', 'Actor', 'Entity', 'Entity ID', 'Action', 'Old Data', 'New Data'],
        lastAuditRows.map((a) => [
          a.id,
          a.createdAt,
          a.actorEmail || 'system',
          a.entity,
          a.entityId,
          a.action,
          JSON.stringify(a.oldData),
          JSON.stringify(a.newData),
        ])
      );
    });

    auditEl.querySelectorAll('[data-audit-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const entry = byId.get(btn.dataset.auditDiff);
        if (!entry) return;
        openDialog({
          title: `Audit #${entry.id} — ${entry.entity} #${entry.entityId} (${entry.action})`,
          closedBy: 'any',
          html: `
            <p class="mono-meta" style="margin-block-end:0.75rem;">
              Actor: ${escapeHtml(entry.actorEmail || 'system')} &middot; ${formatDateTime(entry.createdAt)}
            </p>
            <div class="diff-grid">
              <div>
                <strong style="font-size:0.85rem;">Old Data</strong>
                <pre class="diff-box">${escapeHtml(JSON.stringify(entry.oldData, null, 2))}</pre>
              </div>
              <div>
                <strong style="font-size:0.85rem;">New Data</strong>
                <pre class="diff-box">${escapeHtml(JSON.stringify(entry.newData, null, 2))}</pre>
              </div>
            </div>
            <div class="dialog-actions">
              <form method="dialog"><button type="submit" class="btn" autofocus>Close</button></form>
            </div>
          `,
        });
      });
    });
  }

  async function loadAll() {
    const [policiesRes, backupsRes, usersRes, finesRes] = await Promise.all([
      apiRequest('/loan-policies'),
      apiRequest('/admin/backups'),
      apiRequest('/users'),
      apiRequest('/fines?status=unpaid&limit=25'),
    ]);

    policiesEl.innerHTML = `
      <div class="panel-header"><h2 class="panel-title">Loan Policies (Database-Driven Rules)</h2></div>
      <div class="split-grid">
        ${policiesRes.data
          .map(
            (p) => `
          <form class="panel policy-form" data-member-type="${escapeHtml(p.memberType)}" style="background:var(--bg);">
            <h3 style="margin-block-end:0.65rem;text-transform:capitalize;">${escapeHtml(p.memberType)}</h3>
            <div class="form-row-2">
              <div class="field"><label>Max Loans</label><input name="maxLoans" type="number" min="0" value="${p.maxLoans}" required /></div>
              <div class="field"><label>Loan Days</label><input name="loanDays" type="number" min="1" value="${p.loanDays}" required /></div>
              <div class="field"><label>Max Renewals</label><input name="maxRenewals" type="number" min="0" value="${p.maxRenewals}" required /></div>
              <div class="field"><label>Daily Fine ($)</label><input name="dailyFine" type="number" step="0.05" min="0" value="${p.dailyFine}" required /></div>
              <div class="field"><label>Max Unpaid ($)</label><input name="maxUnpaidFines" type="number" step="0.50" min="0" value="${p.maxUnpaidFines}" required /></div>
              <div class="field"><label>Hold Days</label><input name="holdDays" type="number" min="1" value="${p.holdDays}" required /></div>
            </div>
            <button type="submit" class="btn btn-sm btn-primary" style="margin-block-start:0.75rem;">Save Policy</button>
          </form>
        `
          )
          .join('')}
      </div>
    `;

    policiesEl.querySelectorAll('.policy-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = form.dataset.memberType;
        await apiRequest(`/loan-policies/${type}`, {
          method: 'PUT',
          body: {
            maxLoans: Number(form.maxLoans.value),
            loanDays: Number(form.loanDays.value),
            maxRenewals: Number(form.maxRenewals.value),
            dailyFine: Number(form.dailyFine.value),
            maxUnpaidFines: Number(form.maxUnpaidFines.value),
            holdDays: Number(form.holdDays.value),
          },
        });
        showToast(`Updated ${type} loan policy.`, { tone: 'ok' });
      });
    });

    backupsEl.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">Database Backups &amp; Restore Verification</h2>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-primary" id="btn-create-backup">Create Snapshot (VACUUM INTO)</button>
          <button type="button" class="btn btn-sm" id="btn-verify-backup" ${backupsRes.data.length === 0 ? 'disabled' : ''}>Verify Latest Restore</button>
        </div>
      </div>
      <div id="backup-verify-result" style="margin-block-end:0.75rem;"></div>
      ${renderResponsiveTable({
        captionId: 'admin-backups-cap',
        caption: 'Saved Compact SQLite Snapshots',
        emptyText: 'No backups created yet.',
        columns: [
          { label: 'Filename', key: 'filename', sortable: true, render: (b) => `<span class="mono">${escapeHtml(b.filename)}</span>` },
          { label: 'Size', key: 'sizeBytes', sortable: true, type: 'number', render: (b) => `<span class="mono">${(b.sizeBytes / 1024).toFixed(1)} KB</span>` },
          { label: 'Modified', key: 'modifiedAt', sortable: true, render: (b) => `<span class="mono">${formatDateTime(b.modifiedAt)}</span>` },
        ],
        rows: backupsRes.data,
      })}
    `;

    backupsEl.querySelector('#btn-create-backup').addEventListener('click', async () => {
      const res = await apiRequest('/admin/backups', { method: 'POST' });
      showToast(`Created ${res.data.filename} (${(res.data.sizeBytes / 1024).toFixed(1)} KB).`, {
        tone: 'ok',
      });
      loadAll();
    });

    backupsEl.querySelector('#btn-verify-backup').addEventListener('click', async () => {
      const res = await apiRequest('/admin/backups/verify', { method: 'POST' });
      const v = res.data;
      backupsEl.querySelector('#backup-verify-result').innerHTML = `
        <p class="banner ${v.ok ? 'banner-ok' : 'banner-danger'}">
          ${v.ok ? 'Restore Verification Passed:' : 'Restore Mismatch:'}
          <strong>${escapeHtml(v.filename)}</strong> &mdash; ${v.tablesVerified} tables, ${v.triggersCount} triggers, ${v.viewsCount} views match live DB.
        </p>
      `;
    });

    usersEl.innerHTML = `
      <div class="panel-header"><h2 class="panel-title">User Accounts</h2></div>
      <form id="create-staff-form" class="scanner-row" style="margin-block-end:0.85rem;">
        <div class="field">
          <label for="st-email">Email</label>
          <input id="st-email" name="email" type="email" required placeholder="staff@library.local" />
        </div>
        <div class="field">
          <label for="st-pass">Password</label>
          <input id="st-pass" name="password" type="password" required minlength="8" placeholder="Min 8 chars, Aa1" />
        </div>
        <div class="field">
          <label for="st-role">Role</label>
          <select id="st-role" name="role">
            <option value="librarian">Librarian</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Create Staff</button>
      </form>
      ${renderResponsiveTable({
        captionId: 'admin-users-cap',
        caption: 'System Logins',
        emptyText: 'No users.',
        columns: [
          { label: 'Email', key: 'email', sortable: true, render: (u) => escapeHtml(u.email) },
          { label: 'Role', key: 'role', sortable: true, render: (u) => escapeHtml(u.role) },
          { label: 'State', key: 'isActive', sortable: true, render: (u) => statusBadge(u.isActive ? 'active' : 'suspended', u.isActive ? 'Active' : 'Disabled') },
          {
            label: 'Action',
            render: (u) =>
              `<button type="button" class="btn btn-sm" data-toggle-user="${u.id}" data-active="${u.isActive}">
                ${u.isActive ? 'Disable' : 'Enable'}
              </button>`,
          },
        ],
        rows: usersRes.data,
      })}
    `;

    usersEl.querySelector('#create-staff-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      try {
        await apiRequest('/users', {
          method: 'POST',
          body: {
            email: form.email.value.trim(),
            password: form.password.value,
            role: form.role.value,
          },
        });
        showToast('Staff account created.', { tone: 'ok' });
        loadAll();
      } catch (err) {
        showToast(err.message, { tone: 'danger' });
      }
    });

    usersEl.querySelectorAll('[data-toggle-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextActive = btn.dataset.active !== 'true';
        await apiRequest(`/users/${btn.dataset.toggleUser}`, {
          method: 'PATCH',
          body: { isActive: nextActive },
        });
        showToast(`User ${nextActive ? 'enabled' : 'disabled'}.`, { tone: 'ok' });
        loadAll();
      });
    });

    finesEl.innerHTML = `
      <div class="panel-header"><h2 class="panel-title">Waive Unpaid Fines (Admin Only)</h2></div>
      ${renderResponsiveTable({
        captionId: 'admin-waive-cap',
        caption: 'Unpaid Fines Eligible for Waiver',
        emptyText: 'No unpaid fines.',
        columns: [
          { label: 'Member', key: 'memberName', sortable: true, render: (f) => `${escapeHtml(f.memberName)} (${escapeHtml(f.memberNumber)})` },
          { label: 'Book', key: 'title', sortable: true, render: (f) => escapeHtml(f.title) },
          { label: 'Amount', key: 'amount', sortable: true, type: 'number', render: (f) => `<span class="mono">${formatMoney(f.amount)}</span>` },
          {
            label: 'Action',
            render: (f) =>
              `<button type="button" class="btn btn-sm btn-danger" data-waive-fine="${f.id}" data-amt="${formatMoney(f.amount)}">Waive</button>`,
          },
        ],
        rows: finesRes.data,
      })}
    `;

    finesEl.querySelectorAll('[data-waive-fine]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Waive unpaid fine?',
          message: `Waive this ${btn.dataset.amt} fine? This change is permanently recorded in the audit log.`,
          confirmLabel: 'Waive Fine',
          cancelLabel: 'Keep Unpaid',
        });
        if (!ok) return;
        await apiRequest(`/fines/${btn.dataset.waiveFine}/waive`, { method: 'POST' });
        showToast('Fine waived.', { tone: 'ok' });
        loadAll();
      });
    });

    enhanceSortableTables(container);
    await loadAuditOnly();
  }

  await loadAll();
}

import { apiRequest } from '../api.js';
import { downloadCsv } from '../ui/export.js';
import { escapeHtml, formatDateTime, statusBadge } from '../ui/format.js';
import { playScanTone } from '../ui/sound.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';
import { showToast } from '../ui/toast.js';

export async function renderStocktakePage(container) {
  let activeSessionId = null;
  let activeTab = 'missing';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Physical Shelf Stocktake</h1>
        <p class="page-subtitle">Scan copies on shelves to reconcile Verified, Missing, Misplaced, and Unexpected items.</p>
      </div>
    </div>

    <div class="desk-layout">
      <section class="panel" aria-labelledby="st-sessions-h">
        <h2 id="st-sessions-h" class="panel-title" style="margin-block-end:0.65rem;">Audit Sessions</h2>
        <form id="st-create-form" class="form-grid" style="margin-block-end:1rem;">
          <div class="field">
            <label for="st-name">New Stocktake Name</label>
            <input id="st-name" name="name" type="text" required placeholder="e.g. CS Database Shelf Audit" />
          </div>
          <div class="form-row-2">
            <div class="field">
              <label for="st-cat">Category Scope</label>
              <select id="st-cat" name="categoryId"><option value="">All Categories</option></select>
            </div>
            <div class="field">
              <label for="st-prefix">Shelf Prefix</label>
              <input id="st-prefix" name="shelfPrefix" type="text" placeholder="e.g. CS-DB" />
            </div>
          </div>
          <button type="submit" class="btn btn-primary">Start Stocktake</button>
        </form>
        <div id="st-sessions-list" class="demo-list"></div>
      </section>

      <section class="panel" id="st-workspace">
        <p class="banner">Select or start a stocktake session on the left to begin scanning shelf barcodes.</p>
      </section>
    </div>
  `;

  const catSelect = container.querySelector('#st-cat');
  const sessionsListEl = container.querySelector('#st-sessions-list');
  const workspaceEl = container.querySelector('#st-workspace');
  const createForm = container.querySelector('#st-create-form');

  const catsRes = await apiRequest('/categories');
  for (const c of catsRes.data) {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.name;
    catSelect.append(opt);
  }

  async function loadSessions() {
    const res = await apiRequest('/stocktakes');
    if (res.data.length === 0) {
      sessionsListEl.innerHTML = '<p class="muted">No stocktake sessions yet.</p>';
      return;
    }
    sessionsListEl.innerHTML = res.data
      .map(
        (s) => `
      <div class="demo-row">
        <div>
          <strong>${escapeHtml(s.name)}</strong> ${statusBadge(s.status === 'open' ? 'active' : 'neutral', s.status)}
          <div class="mono-meta">${s.scanCount} scans &middot; ${escapeHtml(s.categoryName || 'All')} ${s.shelfPrefix ? `(${escapeHtml(s.shelfPrefix)}*)` : ''}</div>
        </div>
        <button type="button" class="btn btn-sm" data-open-st="${s.id}">Open</button>
      </div>
    `
      )
      .join('');

    sessionsListEl.querySelectorAll('[data-open-st]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSessionId = Number(btn.dataset.openSt);
        loadWorkspace();
      });
    });

    if (!activeSessionId && res.data.length > 0) {
      activeSessionId = res.data[0].id;
      loadWorkspace();
    }
  }

  async function loadWorkspace() {
    if (!activeSessionId) return;
    const res = await apiRequest(`/stocktakes/${activeSessionId}`);
    const data = res.data;
    const s = data.session;
    const sum = data.summary;

    workspaceEl.innerHTML = `
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${escapeHtml(s.name)}</h2>
          <p class="mono-meta">Started ${formatDateTime(s.startedAt)} ${s.shelfPrefix ? `&middot; Prefix ${escapeHtml(s.shelfPrefix)}*` : ''}</p>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm" id="st-export-btn">Export Missing CSV</button>
          ${
            s.status === 'open'
              ? '<button type="button" class="btn btn-sm btn-danger" id="st-close-btn">Close Session</button>'
              : statusBadge('neutral', 'Closed')
          }
        </div>
      </div>

      <div class="kpi-strip">
        <div class="kpi-cell"><div class="kpi-label">Expected</div><div class="kpi-value mono">${sum.expectedCount}</div></div>
        <div class="kpi-cell"><div class="kpi-label">Verified</div><div class="kpi-value mono" style="color:var(--ok);">${sum.verifiedCount}</div></div>
        <div class="kpi-cell"><div class="kpi-label">Missing</div><div class="kpi-value mono" style="color:var(--danger);">${sum.missingCount}</div></div>
        <div class="kpi-cell"><div class="kpi-label">Misplaced</div><div class="kpi-value mono" style="color:var(--warn);">${sum.misplacedCount}</div></div>
        <div class="kpi-cell"><div class="kpi-label">Unexpected</div><div class="kpi-value mono">${sum.unexpectedCount}</div></div>
      </div>

      ${
        s.status === 'open'
          ? `
        <form id="st-scan-form" class="scanner-row" style="margin-block-end:0.85rem;">
          <div class="field">
            <label for="st-barcode">Scan Copy Barcode</label>
            <input id="st-barcode" name="barcode" type="text" required placeholder="e.g. LIB-000201" autocomplete="off" autofocus />
          </div>
          <div class="field" style="max-inline-size:170px;">
            <label for="st-shelf">Current Shelf (optional)</label>
            <input id="st-shelf" name="scannedShelf" type="text" placeholder="e.g. CS-AL-02" />
          </div>
          <button type="submit" class="btn btn-primary">Record Scan</button>
        </form>
        <div id="st-scan-feedback" style="margin-block-end:0.85rem;"></div>`
          : ''
      }

      <div class="tab-bar" role="tablist" aria-label="Reconciliation buckets">
        <button type="button" role="tab" class="tab-btn" data-st-tab="missing" aria-selected="${activeTab === 'missing'}">Missing (${sum.missingCount})</button>
        <button type="button" role="tab" class="tab-btn" data-st-tab="verified" aria-selected="${activeTab === 'verified'}">Verified (${sum.verifiedCount})</button>
        <button type="button" role="tab" class="tab-btn" data-st-tab="misplaced" aria-selected="${activeTab === 'misplaced'}">Misplaced (${sum.misplacedCount})</button>
        <button type="button" role="tab" class="tab-btn" data-st-tab="unexpected" aria-selected="${activeTab === 'unexpected'}">Unexpected (${sum.unexpectedCount})</button>
      </div>

      <div id="st-table-area"></div>
    `;

    function renderBucket() {
      const area = workspaceEl.querySelector('#st-table-area');
      const rows = data[activeTab] || [];
      if (activeTab === 'missing') {
        area.innerHTML = renderResponsiveTable({
          captionId: 'st-missing-cap',
          caption: 'Expected Copies Not Yet Scanned',
          emptyText: 'All expected shelf copies have been scanned.',
          columns: [
            { label: 'Barcode', key: 'barcode', sortable: true, render: (r) => `<span class="mono">${escapeHtml(r.barcode)}</span>` },
            { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title) },
            { label: 'Expected Shelf', key: 'shelfLocation', sortable: true, render: (r) => `<span class="mono">${escapeHtml(r.shelfLocation)}</span>` },
            { label: 'Status', key: 'status', render: (r) => statusBadge(r.status) },
          ],
          rows,
        });
      } else {
        area.innerHTML = renderResponsiveTable({
          captionId: `st-${activeTab}-cap`,
          caption: `${activeTab[0].toUpperCase() + activeTab.slice(1)} Scans`,
          emptyText: `No ${activeTab} items recorded.`,
          columns: [
            { label: 'Barcode', key: 'barcode', sortable: true, render: (r) => `<span class="mono">${escapeHtml(r.barcode)}</span>` },
            { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title || 'Unknown Barcode') },
            { label: 'Expected Shelf', key: 'expectedShelf', render: (r) => `<span class="mono">${escapeHtml(r.expectedShelf || '—')}</span>` },
            { label: 'Scanned Shelf', key: 'scannedShelf', render: (r) => `<span class="mono">${escapeHtml(r.scannedShelf || '—')}</span>` },
            { label: 'Result', key: 'classification', render: (r) => statusBadge(r.classification === 'verified' ? 'available' : 'warn', r.classification) },
          ],
          rows,
        });
      }
      enhanceSortableTables(area);
    }

    renderBucket();

    workspaceEl.querySelectorAll('[data-st-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.stTab;
        workspaceEl.querySelectorAll('[data-st-tab]').forEach((t) =>
          t.setAttribute('aria-selected', String(t === tab))
        );
        renderBucket();
      });
    });

    workspaceEl.querySelector('#st-export-btn')?.addEventListener('click', () => {
      downloadCsv(
        `stocktake-${s.id}-missing.csv`,
        ['Barcode', 'Title', 'Expected Shelf', 'Status'],
        data.missing.map((m) => [m.barcode, m.title, m.shelfLocation, m.status])
      );
    });

    workspaceEl.querySelector('#st-close-btn')?.addEventListener('click', async () => {
      await apiRequest(`/stocktakes/${s.id}/close`, { method: 'POST' });
      showToast('Stocktake session closed.', { tone: 'ok' });
      await loadSessions();
      await loadWorkspace();
    });

    const scanForm = workspaceEl.querySelector('#st-scan-form');
    const barcodeInput = workspaceEl.querySelector('#st-barcode');
    const feedbackEl = workspaceEl.querySelector('#st-scan-feedback');

    scanForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const barcode = barcodeInput.value.trim();
      const scannedShelf = scanForm.scannedShelf.value.trim();
      if (!barcode) return;
      try {
        const scanRes = await apiRequest(`/stocktakes/${s.id}/scan`, {
          method: 'POST',
          body: { barcode, scannedShelf },
        });
        const item = scanRes.data;
        const okTone = item.classification === 'verified';
        playScanTone(okTone ? 'ok' : 'error');
        await loadWorkspace();
        const freshFeedback = workspaceEl.querySelector('#st-scan-feedback');
        if (freshFeedback) {
          freshFeedback.innerHTML = `<p class="banner ${okTone ? 'banner-ok' : 'banner-warn'}">Scanned <span class="mono">${escapeHtml(item.barcode)}</span> (${escapeHtml(item.title || 'Unknown')}): <strong>${escapeHtml(item.classification)}</strong></p>`;
        }
        workspaceEl.querySelector('#st-barcode')?.focus();
      } catch (err) {
        playScanTone('error');
        if (feedbackEl) {
          feedbackEl.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
        }
      }
    });
  }

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await apiRequest('/stocktakes', {
      method: 'POST',
      body: {
        name: createForm.name.value.trim(),
        categoryId: createForm.categoryId.value ? Number(createForm.categoryId.value) : null,
        shelfPrefix: createForm.shelfPrefix.value.trim(),
      },
    });
    activeSessionId = res.data.session.id;
    createForm.reset();
    showToast('Stocktake session started.', { tone: 'ok' });
    await loadSessions();
    await loadWorkspace();
  });

  await loadSessions();
}

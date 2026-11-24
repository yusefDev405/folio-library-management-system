import { apiRequest } from '../api.js';
import { downloadCsv } from '../ui/export.js';
import { escapeHtml, formatDate, formatMoney, statusBadge } from '../ui/format.js';
import { enhanceSortableTables, renderResponsiveTable } from '../ui/table.js';

function renderBarChart(rows, labelKey, valueKey, emptyText) {
  if (!rows || rows.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }
  const maxVal = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return `
    <div class="chart-list">
      ${rows
        .map((r) => {
          const val = Number(r[valueKey]) || 0;
          const pct = Math.round((val / maxVal) * 100);
          return `
            <div class="chart-row">
              <span>${escapeHtml(r[labelKey])}</span>
              <div class="chart-track" role="presentation">
                <div class="chart-fill" style="inline-size:${pct}%;"></div>
              </div>
              <span class="mono" style="text-align:end;font-weight:600;">${val}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

export async function renderReportsPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Reports &amp; Usage Analytics</h1>
        <p class="page-subtitle">Collection KPIs, database views, CTE window-function rankings, and CSV exports.</p>
      </div>
    </div>

    <div class="tab-bar" role="tablist" aria-label="Report selection">
      <button type="button" role="tab" class="tab-btn" data-rep="analytics" aria-selected="true">Usage Analytics</button>
      <button type="button" role="tab" class="tab-btn" data-rep="overdue" aria-selected="false">Overdue Loans</button>
      <button type="button" role="tab" class="tab-btn" data-rep="popular" aria-selected="false">Popular Books</button>
      <button type="button" role="tab" class="tab-btn" data-rep="inventory" aria-selected="false">Inventory Status</button>
    </div>

    <section class="panel" id="report-output"></section>
  `;

  const outputEl = container.querySelector('#report-output');
  const tabs = [...container.querySelectorAll('[data-rep]')];

  async function showReport(kind) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.rep === kind)));
    outputEl.innerHTML = '<p class="muted">Running report...</p>';

    if (kind === 'analytics') {
      const res = await apiRequest('/reports/analytics');
      const a = res.data;
      const k = a.kpis;
      outputEl.innerHTML = `
        <div class="kpi-strip">
          <div class="kpi-cell"><div class="kpi-label">Books</div><div class="kpi-value mono">${k.totalBooks}</div></div>
          <div class="kpi-cell"><div class="kpi-label">Physical Copies</div><div class="kpi-value mono">${k.totalCopies}</div></div>
          <div class="kpi-cell"><div class="kpi-label">Active Loans</div><div class="kpi-value mono">${k.activeLoans}</div></div>
          <div class="kpi-cell"><div class="kpi-label">Overdue</div><div class="kpi-value mono" style="color:var(--danger);">${k.overdueLoans}</div></div>
          <div class="kpi-cell"><div class="kpi-label">Active Members</div><div class="kpi-value mono">${k.activeMembers}</div></div>
          <div class="kpi-cell"><div class="kpi-label">Open Holds</div><div class="kpi-value mono">${k.activeHolds}</div></div>
        </div>

        <div class="split-grid">
          <div class="panel" style="background:var(--bg);">
            <h2 class="panel-title" style="margin-block-end:0.75rem;">Loans by Category</h2>
            ${renderBarChart(a.loansByCategory, 'categoryName', 'loanCount', 'No loan data yet.')}
          </div>
          <div class="panel" style="background:var(--bg);">
            <h2 class="panel-title" style="margin-block-end:0.75rem;">Monthly Circulation</h2>
            ${renderBarChart(a.loansByMonth, 'month', 'loanCount', 'No monthly loan activity yet.')}
          </div>
          <div class="panel" style="background:var(--bg);">
            <h2 class="panel-title" style="margin-block-end:0.75rem;">Copy Status Breakdown</h2>
            ${renderBarChart(a.copyStatusBreakdown, 'status', 'copyCount', 'No copies.')}
          </div>
          <div class="panel" style="background:var(--bg);">
            <h2 class="panel-title" style="margin-block-end:0.75rem;">Fines Ledger Summary</h2>
            ${
              a.finesSummary.length
                ? `<div class="demo-list">
                    ${a.finesSummary
                      .map(
                        (f) => `
                      <div class="demo-row">
                        <span>${statusBadge(f.status)} (${f.count})</span>
                        <strong class="mono">${formatMoney(f.totalAmount)}</strong>
                      </div>`
                      )
                      .join('')}
                  </div>`
                : '<p class="muted">No fines assessed.</p>'
            }
          </div>
        </div>
      `;
    } else if (kind === 'overdue') {
      const res = await apiRequest('/reports/overdue');
      outputEl.innerHTML = `
        <div class="panel-header">
          <h2 class="panel-title">Open Overdue Loans</h2>
          <button type="button" class="btn btn-sm" id="rep-csv-btn">Export CSV</button>
        </div>
        ${renderResponsiveTable({
          captionId: 'rep-overdue-cap',
          caption: 'Open Overdue Loans (v_overdue_loans)',
          emptyText: 'No overdue loans right now.',
          columns: [
            { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title) },
            { label: 'Barcode', key: 'barcode', sortable: true, render: (r) => `<span class="mono">${escapeHtml(r.barcode)}</span>` },
            { label: 'Member', key: 'memberName', sortable: true, render: (r) => `${escapeHtml(r.memberName)} (${escapeHtml(r.memberNumber)})` },
            { label: 'Due Date', key: 'dueAt', sortable: true, render: (r) => `<span class="mono">${formatDate(r.dueAt)}</span>` },
            { label: 'Days Overdue', key: 'daysOverdue', sortable: true, type: 'number', render: (r) => statusBadge('overdue', `${r.daysOverdue}d`) },
          ],
          rows: res.data,
        })}
      `;
      enhanceSortableTables(outputEl);
      outputEl.querySelector('#rep-csv-btn')?.addEventListener('click', () => {
        downloadCsv(
          'overdue-loans.csv',
          ['Loan ID', 'Title', 'Barcode', 'Member Number', 'Member Name', 'Due At', 'Days Overdue'],
          res.data.map((r) => [r.loanId, r.title, r.barcode, r.memberNumber, r.memberName, r.dueAt, r.daysOverdue])
        );
      });
    } else if (kind === 'popular') {
      const res = await apiRequest('/reports/popular-books');
      outputEl.innerHTML = `
        <div class="panel-header">
          <h2 class="panel-title">Most Borrowed Titles per Category</h2>
          <button type="button" class="btn btn-sm" id="rep-csv-btn">Export CSV</button>
        </div>
        ${renderResponsiveTable({
          captionId: 'rep-popular-cap',
          caption: 'Most Borrowed Titles per Category (Last 12 Months, RANK() OVER PARTITION)',
          emptyText: 'No borrowing activity recorded in the last year.',
          columns: [
            { label: 'Title', key: 'title', sortable: true, render: (r) => escapeHtml(r.title) },
            { label: 'Category', key: 'categoryName', sortable: true, render: (r) => escapeHtml(r.categoryName) },
            { label: 'Rank', key: 'rankInCategory', sortable: true, type: 'number', render: (r) => `<span class="mono">#${r.rankInCategory}</span>` },
            { label: 'Loans', key: 'loanCount', sortable: true, type: 'number', render: (r) => `<span class="mono">${r.loanCount}</span>` },
          ],
          rows: res.data,
        })}
      `;
      enhanceSortableTables(outputEl);
      outputEl.querySelector('#rep-csv-btn')?.addEventListener('click', () => {
        downloadCsv(
          'popular-books.csv',
          ['Category', 'Rank', 'Title', 'ISBN', 'Loans'],
          res.data.map((r) => [r.categoryName, r.rankInCategory, r.title, r.isbn, r.loanCount])
        );
      });
    } else {
      const res = await apiRequest('/reports/inventory');
      const summaryBadges = res.data.totalsByStatus
        .map((s) => `${statusBadge(s.status)} <strong class="mono">${s.copyCount}</strong>`)
        .join(' &nbsp;&middot;&nbsp; ');

      outputEl.innerHTML = `
        <div class="panel-header">
          <div>${summaryBadges}</div>
          <button type="button" class="btn btn-sm" id="rep-csv-btn">Export CSV</button>
        </div>
        ${renderResponsiveTable({
          captionId: 'rep-inv-cap',
          caption: 'Physical Copies by Category and Status (v_inventory_status)',
          emptyText: 'No copies in inventory.',
          columns: [
            { label: 'Category', key: 'categoryName', sortable: true, render: (r) => escapeHtml(r.categoryName) },
            { label: 'Status', key: 'status', sortable: true, render: (r) => statusBadge(r.status) },
            { label: 'Copies', key: 'copyCount', sortable: true, type: 'number', render: (r) => `<span class="mono">${r.copyCount}</span>` },
          ],
          rows: res.data.byCategoryAndStatus,
        })}
      `;
      enhanceSortableTables(outputEl);
      outputEl.querySelector('#rep-csv-btn')?.addEventListener('click', () => {
        downloadCsv(
          'inventory-status.csv',
          ['Category', 'Status', 'Copies'],
          res.data.byCategoryAndStatus.map((r) => [r.categoryName, r.status, r.copyCount])
        );
      });
    }
  }

  tabs.forEach((t) => t.addEventListener('click', () => showReport(t.dataset.rep)));
  await showReport('analytics');
}

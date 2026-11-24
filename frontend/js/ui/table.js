import { escapeHtml } from './format.js';

let tableIdSeq = 0;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const supportsInvokers =
  typeof HTMLButtonElement !== 'undefined' && 'commandForElement' in HTMLButtonElement.prototype;

/**
 * Renders an accessible, responsive, optionally sortable data table.
 * Sortable headers use `<button type="button" commandfor="..." command="--sort">`,
 * maintain `aria-sort` on the active `<th>` only, and reorder existing `<tr>` nodes.
 */
export function renderResponsiveTable({
  captionId,
  caption,
  columns,
  rows,
  emptyText = 'No records found.',
}) {
  if (!rows || rows.length === 0) {
    return `<p class="banner">${escapeHtml(emptyText)}</p>`;
  }

  tableIdSeq += 1;
  const tableId = `tbl-${tableIdSeq}`;
  const statusId = `${tableId}-sort-status`;
  const anySortable = columns.some((c) => c.sortable);

  const labelVars = columns
    .map((col, idx) => `--label-${idx + 1}: "${escapeHtml(col.label).replace(/"/g, '\\"')}";`)
    .join(' ');

  const headHtml = columns
    .map((col, idx) => {
      if (!col.sortable) {
        return `<th scope="col">${escapeHtml(col.label)}</th>`;
      }
      const dataType = col.type === 'number' ? 'number' : 'string';
      return `<th scope="col" data-col-index="${idx}" data-type="${dataType}">
        <button type="button" class="sort-btn" commandfor="${tableId}" command="--sort">
          <span>${escapeHtml(col.label)}</span>
          <svg class="sort-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path class="sort-asc" d="m18 15-6-6-6 6"/>
            <path class="sort-desc" d="m6 9 6 6 6-6"/>
          </svg>
        </button>
      </th>`;
    })
    .join('');

  const bodyHtml = rows
    .map((row) => {
      const cells = columns
        .map((col, idx) => {
          const val = typeof col.render === 'function' ? col.render(row) : escapeHtml(row[col.key] ?? '—');
          const rawSortVal =
            typeof col.sortValue === 'function'
              ? col.sortValue(row)
              : col.key
                ? row[col.key]
                : undefined;
          const dataAttr =
            rawSortVal !== undefined && rawSortVal !== null
              ? ` data-value="${escapeHtml(String(rawSortVal))}"`
              : '';
          if (idx === 0) {
            return `<th scope="row"${dataAttr}>${val}</th>`;
          }
          return `<td${dataAttr}>${val}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `
    ${anySortable ? `<div id="${statusId}" class="visually-hidden" role="status"></div>` : ''}
    <div tabindex="0" role="region" aria-labelledby="${escapeHtml(captionId)}" class="table-wrapper">
      <table id="${tableId}" class="data-table" ${anySortable ? `data-sortable="true" data-status-id="${statusId}"` : ''} style="${labelVars}">
        <caption id="${escapeHtml(captionId)}">${escapeHtml(caption)}</caption>
        <thead>
          <tr>${headHtml}</tr>
        </thead>
        <tbody>
          ${bodyHtml}
        </tbody>
      </table>
    </div>
  `;
}

function sortTableByButton(table, button) {
  const th = button.closest('th');
  if (!th) return;
  const colIndex = Number(th.dataset.colIndex);
  const type = th.dataset.type || 'string';
  const direction = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';

  for (const header of table.tHead.querySelectorAll('th')) {
    if (header !== th) header.removeAttribute('aria-sort');
  }
  th.setAttribute('aria-sort', direction);

  const tbody = table.tBodies[0];
  if (!tbody) return;
  const rows = [...tbody.rows];
  const factor = direction === 'ascending' ? 1 : -1;

  const keyed = rows.map((row) => {
    const cell = row.cells[colIndex];
    const raw = cell?.dataset.value ?? cell?.textContent.trim() ?? '';
    return { row, raw };
  });

  keyed.sort((a, b) => {
    if (type === 'number') {
      return factor * ((Number(a.raw) || 0) - (Number(b.raw) || 0));
    }
    return factor * collator.compare(a.raw, b.raw);
  });

  for (const item of keyed) {
    if (typeof tbody.moveBefore === 'function') {
      tbody.moveBefore(item.row, null);
    } else {
      tbody.append(item.row);
    }
  }

  const statusEl = table.dataset.statusId ? document.getElementById(table.dataset.statusId) : null;
  if (statusEl) {
    statusEl.textContent = `Sorted by ${button.textContent.trim()}, ${direction}.`;
  }
}

export function enhanceSortableTables(root = document) {
  for (const table of root.querySelectorAll('table[data-sortable="true"]')) {
    if (table.dataset.sortWired === 'true') continue;
    table.dataset.sortWired = 'true';

    table.addEventListener('command', (event) => {
      if (event.command === '--sort' && event.source) {
        sortTableByButton(table, event.source);
      }
    });

    // Fallback ONLY when native Invoker Commands are unsupported
    if (!supportsInvokers) {
      for (const button of table.tHead.querySelectorAll('button[command="--sort"]')) {
        button.addEventListener('click', () => sortTableByButton(table, button));
      }
    }
  }
}

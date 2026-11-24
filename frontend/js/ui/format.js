export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
});

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateFormatter.format(d);
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateTimeFormatter.format(d);
}

export function formatMoney(amount) {
  return currencyFormatter.format(Number(amount || 0));
}

export function statusBadge(status, labelOverride = null) {
  const label = labelOverride || String(status || '').replaceAll('_', ' ');
  let tone = 'neutral';
  if (['available', 'active', 'paid', 'fulfilled'].includes(status)) tone = 'ok';
  else if (['reserved', 'waiting', 'ready'].includes(status)) tone = 'warn';
  else if (['overdue', 'unpaid', 'lost', 'damaged', 'suspended', 'expired'].includes(status)) tone = 'danger';
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

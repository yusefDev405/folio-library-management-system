import { apiRequest } from '../api.js';
import { escapeHtml, formatDateTime, statusBadge } from '../ui/format.js';
import { showToast } from '../ui/toast.js';

export async function renderNotificationsPage(container, { onUnreadChanged } = {}) {
  let showOnlyUnread = false;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Notifications &amp; Reminders</h1>
        <p class="page-subtitle">Due-date reminders, overdue alerts, hold-shelf pickup notices, and fine notifications.</p>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button type="button" class="btn" id="notif-filter-btn">Show Unread Only</button>
        <button type="button" class="btn btn-primary" id="notif-read-all-btn">Mark All Read</button>
      </div>
    </div>

    <section id="notifications-list" class="desk-stack"></section>
  `;

  const listEl = container.querySelector('#notifications-list');
  const filterBtn = container.querySelector('#notif-filter-btn');
  const readAllBtn = container.querySelector('#notif-read-all-btn');

  async function refresh() {
    const res = await apiRequest('/me/notifications');
    if (onUnreadChanged) onUnreadChanged(res.meta.unreadCount);

    const items = showOnlyUnread ? res.data.filter((n) => !n.readAt) : res.data;
    if (items.length === 0) {
      listEl.innerHTML = '<p class="banner">No notifications to display.</p>';
      return;
    }

    listEl.innerHTML = items
      .map((n) => {
        const badgeType =
          n.kind === 'overdue' || n.kind === 'fine_assessed'
            ? 'overdue'
            : n.kind === 'hold_ready' || n.kind === 'due_soon'
              ? 'reserved'
              : 'active';
        return `
          <article class="panel" style="${n.readAt ? 'opacity:0.75;' : 'border-inline-start:4px solid var(--accent);'}">
            <div class="panel-header">
              <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                ${statusBadge(badgeType, n.kind.replaceAll('_', ' '))}
                <h2 class="panel-title">${escapeHtml(n.title)}</h2>
              </div>
              <span class="mono-meta">${formatDateTime(n.createdAt)}</span>
            </div>
            <p style="margin-block-end:0.65rem;">${escapeHtml(n.body)}</p>
            ${
              n.readAt
                ? `<span class="mono-meta">Read ${formatDateTime(n.readAt)}</span>`
                : `<button type="button" class="btn btn-sm" data-mark-read="${n.id}">Mark as Read</button>`
            }
          </article>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-mark-read]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await apiRequest(`/me/notifications/${btn.dataset.markRead}/read`, { method: 'PATCH' });
        refresh();
      });
    });
  }

  filterBtn.addEventListener('click', () => {
    showOnlyUnread = !showOnlyUnread;
    filterBtn.textContent = showOnlyUnread ? 'Show All' : 'Show Unread Only';
    refresh();
  });

  readAllBtn.addEventListener('click', async () => {
    await apiRequest('/me/notifications/read-all', { method: 'POST' });
    showToast('All notifications marked as read.', { tone: 'ok' });
    refresh();
  });

  await refresh();
}

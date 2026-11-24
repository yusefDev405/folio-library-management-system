import { login } from '../auth.js';
import { navigate } from '../router.js';
import { escapeHtml } from '../ui/format.js';
import { enhanceFormValidation } from '../ui/formValidation.js';
import { showToast } from '../ui/toast.js';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@library.local', pass: 'Admin123!', note: 'Staff accounts, loan policies, audit log, waive fines' },
  { role: 'Librarian', email: 'librarian@library.local', pass: 'Librarian123!', note: 'Circulation desk, catalogue, members, reports' },
  { role: 'Member (Student)', email: 'nadia.student@library.local', pass: 'Member123!', note: 'Has active + overdue loan, unpaid fine, waiting reservation' },
  { role: 'Member (Staff)', email: 'omar.staff@library.local', pass: 'Member123!', note: 'Has a ready hold on Book #1 (LIB-000102)' },
  { role: 'Member (External)', email: 'sara.external@library.local', pass: 'Member123!', note: 'Clean account ready for checkout' },
];

export async function renderLoginPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sign In to Folio</h1>
        <p class="page-subtitle">Authenticate with your library member, librarian, or administrator account.</p>
      </div>
    </div>

    <div class="login-shell">
      <section class="panel" aria-labelledby="login-heading">
        <h2 id="login-heading" class="panel-title" style="margin-block-end:0.75rem;">Account Credentials</h2>
        <form id="login-form" class="form-grid" novalidate>
          <div class="field">
            <label for="login-email">Email address</label>
            <span id="login-email-hint" class="hint">Format: name@library.local</span>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autocomplete="email"
              aria-describedby="login-email-hint"
              data-error="login-email-err"
            />
            <div id="login-email-err" class="error-msg">
              <span role="img" aria-label="Error">!</span> Enter a valid email address.
            </div>
          </div>

          <div class="field">
            <label for="login-password">Password</label>
            <span id="login-password-hint" class="hint">Minimum 8 characters</span>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              minlength="8"
              autocomplete="current-password"
              aria-describedby="login-password-hint"
              data-error="login-password-err"
            />
            <div id="login-password-err" class="error-msg">
              <span role="img" aria-label="Error">!</span> Password must be at least 8 characters.
            </div>
          </div>

          <div id="login-server-err" role="alert"></div>
          <button type="submit" class="btn btn-primary" id="login-submit">Sign In</button>
        </form>
      </section>

      <aside class="panel" aria-labelledby="demo-heading">
        <h2 id="demo-heading" class="panel-title" style="margin-block-end:0.4rem;">Seeded Demo Accounts</h2>
        <p class="muted" style="font-size:0.875rem;margin-block-end:0.85rem;">
          Select a seeded account to populate the form for testing each role.
        </p>
        <div class="demo-list">
          ${DEMO_ACCOUNTS.map(
            (acc) => `
            <div class="demo-row">
              <div>
                <strong>${escapeHtml(acc.role)}</strong>
                <div class="mono-meta">${escapeHtml(acc.email)}</div>
                <div class="muted" style="font-size:0.78rem;">${escapeHtml(acc.note)}</div>
              </div>
              <button
                type="button"
                class="btn btn-sm"
                data-fill-email="${escapeHtml(acc.email)}"
                data-fill-pass="${escapeHtml(acc.pass)}"
              >Use</button>
            </div>`
          ).join('')}
        </div>
      </aside>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const errEl = container.querySelector('#login-server-err');
  const submitBtn = container.querySelector('#login-submit');
  enhanceFormValidation(form);

  container.querySelectorAll('[data-fill-email]').forEach((btn) => {
    btn.addEventListener('click', () => {
      form.email.value = btn.dataset.fillEmail;
      form.password.value = btn.dataset.fillPass;
      form.email.focus();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.innerHTML = '';
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector(':invalid');
      firstInvalid?.focus();
      return;
    }

    submitBtn.disabled = true;
    try {
      const user = await login(form.email.value.trim(), form.password.value);
      showToast(`Signed in as ${user.email} (${user.role}).`, { tone: 'ok' });
      if (user.role === 'librarian' || user.role === 'admin') {
        navigate('desk');
      } else {
        navigate('my-loans');
      }
    } catch (err) {
      errEl.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
      submitBtn.disabled = false;
    }
  });
}

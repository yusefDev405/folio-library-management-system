import { apiRequest } from '../api.js';
import { logout } from '../auth.js';
import { navigate } from '../router.js';
import { renderCode39Svg } from '../ui/barcode.js';
import { escapeHtml, formatDate, statusBadge } from '../ui/format.js';
import { enhanceFormValidation } from '../ui/formValidation.js';
import {
  getPaperTint,
  getSchemeOverride,
  getSystemScheme,
  setPaperTint,
  setSchemeOverride,
} from '../ui/theme.js';
import { showToast } from '../ui/toast.js';

export async function renderAccountPage(container) {
  const meRes = await apiRequest('/me');
  const profile = meRes.data;
  const m = profile.member;

  const currentScheme = getSchemeOverride();
  const sysScheme = getSystemScheme();
  const currentPaper = getPaperTint();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Account, Library Card &amp; Preferences</h1>
        <p class="page-subtitle">Manage your password, reading theme, and printable digital library card.</p>
      </div>
    </div>

    <div class="split-grid">
      ${
        m
          ? `
        <section class="panel" aria-labelledby="card-heading">
          <div class="panel-header">
            <h2 id="card-heading" class="panel-title">Digital Library Card</h2>
            <button type="button" class="btn btn-sm no-print" id="btn-print-card">Print Card</button>
          </div>
          <div class="library-card print-sheet">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-family:var(--font-serif);font-size:1.15rem;">Folio Library Card</strong>
              ${statusBadge(m.status)}
            </div>
            <div>
              <div><strong>${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)}</strong></div>
              <div class="mono-meta">${escapeHtml(m.memberType)} &middot; Valid until ${formatDate(m.expiresAt)}</div>
            </div>
            ${renderCode39Svg(m.memberNumber)}
          </div>
        </section>`
          : ''
      }

      <section class="panel" aria-labelledby="theme-heading">
        <h2 id="theme-heading" class="panel-title" style="margin-block-end:0.65rem;">Reading &amp; Display Theme</h2>
        <p class="muted" style="font-size:0.875rem;margin-block-end:0.85rem;">
          By default Folio follows your operating system scheme. You can pin an explicit light or dark scheme below.
        </p>
        <div class="form-grid">
          <fieldset style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.75rem;">
            <legend style="font-weight:600;padding-inline:0.35rem;">Color Scheme</legend>
            <div style="display:grid;gap:0.45rem;">
              <label style="display:flex;align-items:center;gap:0.5rem;">
                <input type="radio" name="scheme" value="system" ${currentScheme === 'system' ? 'checked' : ''} />
                <span>System (Currently ${escapeHtml(sysScheme)})</span>
              </label>
              <label style="display:flex;align-items:center;gap:0.5rem;">
                <input type="radio" name="scheme" value="light" ${currentScheme === 'light' ? 'checked' : ''} />
                <span>Light (Archival Paper)</span>
              </label>
              <label style="display:flex;align-items:center;gap:0.5rem;">
                <input type="radio" name="scheme" value="dark" ${currentScheme === 'dark' ? 'checked' : ''} />
                <span>Dark (Ink Charcoal)</span>
              </label>
            </div>
          </fieldset>

          <div class="field">
            <label for="paper-tint">Light Paper Tone</label>
            <select id="paper-tint">
              <option value="archival" ${currentPaper === 'archival' ? 'selected' : ''}>Crisp Archival Paper</option>
              <option value="sepia" ${currentPaper === 'sepia' ? 'selected' : ''}>Warm Sepia Folio</option>
            </select>
          </div>
        </div>
      </section>

      <section class="panel" aria-labelledby="pw-heading">
        <h2 id="pw-heading" class="panel-title" style="margin-block-end:0.65rem;">Change Password</h2>
        <form id="change-pw-form" class="form-grid" novalidate>
          <div class="field">
            <label for="cur-pw">Current Password</label>
            <input id="cur-pw" name="currentPassword" type="password" required autocomplete="current-password" />
          </div>
          <div class="field">
            <label for="new-pw">New Password</label>
            <span id="new-pw-rules" class="hint">At least 8 characters with uppercase, lowercase, and a number</span>
            <input
              id="new-pw"
              name="newPassword"
              type="password"
              required
              minlength="8"
              pattern="(?=.*\\d)(?=.*[a-z])(?=.*[A-Z]).{8,}"
              autocomplete="new-password"
              aria-describedby="new-pw-rules"
              data-error="new-pw-err"
            />
            <div id="new-pw-err" class="error-msg">
              <span role="img" aria-label="Error">!</span> New password must include 8+ chars, upper, lower, and a digit.
            </div>
          </div>
          <div id="pw-feedback"></div>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </form>
      </section>
    </div>
  `;

  container.querySelector('#btn-print-card')?.addEventListener('click', () => window.print());

  container.querySelectorAll('input[name="scheme"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      setSchemeOverride(radio.value);
      showToast(`Color scheme set to ${radio.value}.`, { tone: 'ok' });
    });
  });

  container.querySelector('#paper-tint')?.addEventListener('change', (e) => {
    setPaperTint(e.target.value);
    showToast(`Paper tone updated to ${e.target.value}.`, { tone: 'ok' });
  });

  const pwForm = container.querySelector('#change-pw-form');
  const pwFeedback = container.querySelector('#pw-feedback');
  enhanceFormValidation(pwForm);

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwFeedback.innerHTML = '';
    if (!pwForm.checkValidity()) {
      pwForm.querySelector(':invalid')?.focus();
      return;
    }
    try {
      await apiRequest('/me/password', {
        method: 'PATCH',
        body: {
          currentPassword: pwForm.currentPassword.value,
          newPassword: pwForm.newPassword.value,
        },
      });
      showToast('Password updated. Please sign in with your new password.', { tone: 'ok' });
      await logout();
      navigate('login');
    } catch (err) {
      pwFeedback.innerHTML = `<p class="banner banner-danger">${escapeHtml(err.message)}</p>`;
    }
  });
}

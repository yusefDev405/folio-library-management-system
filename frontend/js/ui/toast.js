import { escapeHtml } from './format.js';

let toastCounter = 0;

/**
 * Persistent top-layer toast notifications using `popover="manual"`.
 * Suppresses rendering while a modal <dialog> is open so inert background content
 * isn't announced unexpectedly.
 */
export function showToast(message, { tone = 'ok', autoDismissMs = 5500 } = {}) {
  const modalOpen = document.querySelector('dialog:modal');
  if (modalOpen) return;

  const region = document.getElementById('toast-region');
  const liveFallback = document.getElementById('toast-live-fallback');
  if (!region) return;

  toastCounter += 1;
  const id = `toast-${toastCounter}`;
  const toast = document.createElement('div');
  toast.id = id;
  toast.className = 'toast-item';
  toast.dataset.tone = tone;
  toast.setAttribute('popover', 'manual');

  toast.innerHTML = `
    <span class="toast-text">${escapeHtml(message)}</span>
    <button type="button" class="icon-btn toast-close" popovertarget="${id}" popovertargetaction="hide" aria-label="Dismiss notification">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  region.append(toast);

  if (typeof toast.showPopover === 'function') {
    toast.showPopover();
  } else {
    toast.classList.add(':popover-open');
  }

  // Announce visible text only via ariaNotify() or fallback live region
  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(message);
  } else if (liveFallback) {
    liveFallback.textContent = message;
  }

  let timerId = null;
  const scheduleHide = () => {
    if (!autoDismissMs) return;
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      if (toast.contains(document.activeElement)) {
        // Pause dismissal while keyboard focus is inside the toast
        return;
      }
      if (typeof toast.hidePopover === 'function') {
        try {
          toast.hidePopover();
        } catch {
          toast.remove();
        }
      } else {
        toast.remove();
      }
    }, autoDismissMs);
  };

  toast.addEventListener('focusout', () => {
    if (!toast.contains(document.activeElement)) scheduleHide();
  });

  toast.addEventListener('toggle', (e) => {
    if (e.newState === 'closed') {
      clearTimeout(timerId);
      toast.remove();
    }
  });

  toast.querySelector('.toast-close')?.addEventListener('click', () => {
    clearTimeout(timerId);
    if (typeof toast.hidePopover !== 'function') {
      toast.remove();
    }
  });

  scheduleHide();
}

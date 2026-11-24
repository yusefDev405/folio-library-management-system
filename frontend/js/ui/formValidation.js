const linkError = (el, shown) => {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
};

let announcer = null;
let announceTimer = null;
let announcedField = null;

function ensureAnnouncer() {
  if (announcer) return announcer;
  announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.classList.add('visually-hidden');
  document.body.append(announcer);
  return announcer;
}

const spokenText = (node) => {
  const copy = node.cloneNode(true);
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  copy
    .querySelectorAll('[role="img"][aria-label]')
    .forEach((n) => n.replaceWith(`${n.getAttribute('aria-label')}: `));
  return copy.textContent.replace(/\s+/g, ' ').trim();
};

const announceError = (el) => {
  const error = document.getElementById(el.dataset.error);
  if (!error) return;
  const live = ensureAnnouncer();
  const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
  clearTimeout(announceTimer);
  live.textContent = '';
  announcedField = el;
  announceTimer = setTimeout(() => {
    live.textContent = label + spokenText(error);
  }, 500);
};

const flagged = new WeakSet();
const announced = new WeakSet();
const fallbackDirtyState = new WeakMap();
const supportsUserInvalid = typeof CSS !== 'undefined' && CSS.supports?.('selector(:user-invalid)');

const syncAria = (el, announce = false) => {
  if (!el?.matches?.('input, select, textarea')) return;
  const invalid = supportsUserInvalid
    ? el.matches(':user-invalid')
    : el.classList.contains('user-invalid-fallback');

  if (invalid) {
    if (announce && !announced.has(el)) {
      announceError(el);
      announced.add(el);
    }
    el.setAttribute('aria-invalid', 'true');
    linkError(el, true);
    flagged.add(el);
  } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
    el.setAttribute('aria-invalid', 'false');
    linkError(el, false);
    flagged.delete(el);
    announced.delete(el);
    if (announcedField === el && announcer) {
      clearTimeout(announceTimer);
      announcer.textContent = '';
    }
  }
};

/**
 * Enhances a form root with modern `:user-invalid` ARIA syncing and fallback tracking.
 */
export function enhanceFormValidation(root) {
  if (!root) return;
  ensureAnnouncer();

  root.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.hasAttribute('aria-invalid')) el.setAttribute('aria-invalid', 'false');
  });

  if (!supportsUserInvalid) {
    root.addEventListener(
      'blur',
      (e) => {
        const input = e.target;
        if (!input.checkValidity) return;
        const state = fallbackDirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
        state.hasBlurred = true;
        fallbackDirtyState.set(input, state);
        if (state.hasInteracted) {
          const valid = input.validity.valid;
          input.classList.toggle('user-invalid-fallback', !valid);
          input.classList.toggle('user-valid-fallback', valid);
        }
        syncAria(input, true);
      },
      true
    );

    root.addEventListener('input', (e) => {
      const input = e.target;
      if (!input.checkValidity) return;
      const state = fallbackDirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      fallbackDirtyState.set(input, state);
      if (state.hasBlurred) {
        const valid = input.validity.valid;
        input.classList.toggle('user-invalid-fallback', !valid);
        input.classList.toggle('user-valid-fallback', valid);
        syncAria(input, false);
      }
    });

    root.addEventListener(
      'invalid',
      (e) => {
        const input = e.target;
        fallbackDirtyState.set(input, { hasInteracted: true, hasBlurred: true });
        input.classList.add('user-invalid-fallback');
        input.classList.remove('user-valid-fallback');
        announced.add(input);
        syncAria(input, false);
      },
      true
    );
  } else {
    root.addEventListener('blur', (e) => syncAria(e.target, true), true);
    root.addEventListener('input', (e) => {
      if (e.target.hasAttribute('aria-invalid')) syncAria(e.target, false);
    });
    root.addEventListener('change', (e) => syncAria(e.target, true), true);
    root.addEventListener(
      'invalid',
      (e) => {
        announced.add(e.target);
        syncAria(e.target, false);
      },
      true
    );
  }

  root.addEventListener(
    'reset',
    (e) => {
      setTimeout(() => {
        [...(e.target.elements || [])].forEach((el) => {
          fallbackDirtyState.delete(el);
          el.classList?.remove('user-invalid-fallback', 'user-valid-fallback');
          syncAria(el, false);
        });
      });
    },
    true
  );
}

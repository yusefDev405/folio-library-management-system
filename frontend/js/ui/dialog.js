import { escapeHtml } from './format.js';

let dialogEl = null;
let titleEl = null;
let bodyEl = null;
let closeBtn = null;

function installClosedByFallback(dialog) {
  if ('closedBy' in HTMLDialogElement.prototype) return;
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (e) => {
    pressedOutside = dialog.getAttribute('closedby') === 'any' && outside(e);
  });
  dialog.addEventListener('pointerup', (e) => {
    if (pressedOutside && dialog.getAttribute('closedby') === 'any' && outside(e)) {
      dialog.close();
    }
  });
}

export function initDialog() {
  dialogEl = document.getElementById('app-dialog');
  titleEl = document.getElementById('app-dialog-title');
  bodyEl = document.getElementById('app-dialog-body');
  closeBtn = document.getElementById('app-dialog-close');
  if (!dialogEl) return;

  installClosedByFallback(dialogEl);

  closeBtn?.addEventListener('click', () => {
    dialogEl.close('cancel');
  });

  dialogEl.addEventListener('close', () => {
    dialogEl.returnValue = '';
    bodyEl.innerHTML = '';
  });
}

export function openDialog({ title, html, closedBy = 'any', onMount } = {}) {
  if (!dialogEl) return;
  titleEl.textContent = title || 'Details';
  bodyEl.innerHTML = html || '';
  dialogEl.setAttribute('closedby', closedBy);
  dialogEl.showModal();
  if (onMount) onMount(bodyEl, dialogEl);
}

export function closeDialog() {
  if (dialogEl?.open) dialogEl.close();
}

export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
}) {
  return new Promise((resolve) => {
    if (!dialogEl) return resolve(false);
    titleEl.textContent = title;
    dialogEl.setAttribute('closedby', 'closerequest');
    bodyEl.innerHTML = `
      <p>${escapeHtml(message)}</p>
      <form method="dialog" class="dialog-actions">
        <button type="submit" class="btn" value="cancel" autofocus>${escapeHtml(cancelLabel)}</button>
        <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="confirm">${escapeHtml(confirmLabel)}</button>
      </form>
    `;

    const handleClose = () => {
      const confirmed = dialogEl.returnValue === 'confirm';
      dialogEl.returnValue = '';
      dialogEl.removeEventListener('close', handleClose);
      resolve(confirmed);
    };

    dialogEl.addEventListener('close', handleClose);
    dialogEl.showModal();
  });
}

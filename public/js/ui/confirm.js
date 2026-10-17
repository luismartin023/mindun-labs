/**
 * ui/confirm.js — Diálogo de confirmación sobre openModal. Devuelve Promise<bool>.
 */
import { openModal } from './modal.js';

export function confirmDialog({
  title = 'Confirmar',
  message = '',
  danger = false,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
} = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };

    const body = document.createElement('div');
    const p = document.createElement('p');
    p.style.margin = '0 0 6px';
    p.textContent = message;
    body.appendChild(p);

    openModal({
      title,
      body,
      onClose: () => finish(false),
      actions: [
        { label: cancelLabel, kind: 'ghost', onClick: () => finish(false) },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => finish(true) },
      ],
    });
  });
}

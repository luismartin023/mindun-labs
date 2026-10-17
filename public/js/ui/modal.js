/**
 * ui/modal.js — Ventana modal sobre .mc-overlay / .mc-modal.
 * Apila en #modal-root; Esc cierra la superior; focus trap ligero con Tab.
 */
import { escapeHtml } from '../app.js';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {HTMLElement|string} opts.body
 * @param {{label:string, kind?:string, onClick?:Function, closeOnClick?:boolean}[]} [opts.actions]
 *   kind: 'primary' | 'danger' | 'ghost' | 'sm' … (sufijo de .mc-btn--).
 *   onClick({close, el, body}) — si devuelve false no se cierra aunque closeOnClick.
 *   closeOnClick por defecto true.
 * @param {boolean} [opts.wide]  Modal ancho (1100px).
 * @param {boolean} [opts.dismissOnOverlay=true]  Clic fuera cierra.
 * @param {Function} [opts.onClose]
 * @returns {{close:Function, el:HTMLElement, body:HTMLElement}}
 */
export function openModal({ title = '', body, actions = [], wide = false, dismissOnOverlay = true, onClose } = {}) {
  const host = document.getElementById('modal-root') || document.body;

  const overlay = document.createElement('div');
  overlay.className = 'mc-overlay';

  const modal = document.createElement('div');
  modal.className = 'mc-modal';
  if (wide) modal.style.maxWidth = 'min(1100px, 96vw)';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (title) modal.setAttribute('aria-label', title);

  // Cabecera
  const head = document.createElement('div');
  head.className = 'mc-modal__head';
  const h = document.createElement('h2');
  h.className = 'pixel-sm';
  h.innerHTML = escapeHtml(title);
  const x = document.createElement('button');
  x.className = 'mc-iconbtn';
  x.type = 'button';
  x.title = 'Cerrar (Esc)';
  x.setAttribute('aria-label', 'Cerrar');
  x.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2h3v3h2V2h3v3h3v3h-3v3h3v3h-3v-3H8v3H5v-3H2v-3h3V5H3V2zm2 3h3v3H5V5zm3 0h3v3H8V5z"/></svg>';
  x.addEventListener('click', () => api.close());
  head.append(h, x);

  // Cuerpo
  const bodyEl = document.createElement('div');
  bodyEl.className = 'mc-modal__body';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof HTMLElement) bodyEl.appendChild(body);

  // Pie con acciones
  let foot = null;
  if (actions.length) {
    foot = document.createElement('div');
    foot.className = 'mc-modal__foot';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mc-btn${a.kind ? ` mc-btn--${a.kind}` : ''}`;
      b.innerHTML = escapeHtml(a.label);
      b.addEventListener('click', async () => {
        let r;
        try { r = await a.onClick?.({ close: api.close, el: modal, body: bodyEl, btn: b }); }
        catch (err) { console.error(err); r = false; }
        if (r !== false && a.closeOnClick !== false) api.close();
      });
      foot.appendChild(b);
    }
  }

  modal.append(head, bodyEl);
  if (foot) modal.appendChild(foot);
  overlay.appendChild(modal);

  // --- comportamiento ---
  function onKeydown(e) {
    const isTop = host.lastElementChild === overlay;
    if (!isTop) return;
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); return; }
    if (e.key === 'Tab') {
      const focusables = [...modal.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }

  function onOverlayDown(e) {
    if (e.target === overlay && dismissOnOverlay) api.close();
  }

  const api = {
    el: modal,
    body: bodyEl,
    close() {
      if (!overlay.isConnected) return;
      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      try { onClose?.(); } catch { /* noop */ }
    },
  };

  document.addEventListener('keydown', onKeydown, true);
  overlay.addEventListener('mousedown', onOverlayDown);
  host.appendChild(overlay);

  // Foco inicial: primer campo del cuerpo, si no, el botón de cerrar.
  requestAnimationFrame(() => {
    const f = bodyEl.querySelector('input, select, textarea, button');
    (f || x).focus();
  });

  return api;
}

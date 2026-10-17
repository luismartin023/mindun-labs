/**
 * ui/toast.js — Notificaciones tipo Minecraft en la esquina inferior derecha.
 * Usa el contenedor #toasts del shell (index.html).
 */
import { escapeHtml } from '../app.js';

/**
 * @param {string} msg  Texto (se escapa).
 * @param {'info'|'success'|'error'|'warn'} kind
 * @param {number} [ms]  Duración antes de auto-cerrar.
 */
export function toast(msg, kind = 'info', ms = 4000) {
  const root = document.getElementById('toasts') || document.body;
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = escapeHtml(msg);
  el.style.cursor = 'pointer';
  el.title = 'Clic para cerrar';
  el.addEventListener('click', () => el.remove());
  root.appendChild(el);
  const t = setTimeout(() => el.remove(), ms);
  el.addEventListener('click', () => clearTimeout(t));
  return el;
}

toast.success = (m, ms) => toast(m, 'success', ms);
toast.error = (m, ms) => toast(m, 'error', ms ?? 6000);
toast.warn = (m, ms) => toast(m, 'warn', ms ?? 5000);
toast.info = (m, ms) => toast(m, 'info', ms);

/**
 * ui/emptyState.js — Estado vacío estándar (.mc-empty) con acción opcional.
 */
import { escapeHtml } from '../app.js';

/**
 * @param {object} opts
 * @param {string} [opts.icon]  Glifo/emoji decorativo.
 * @param {string} [opts.title]
 * @param {string} [opts.message]
 * @param {string} [opts.actionLabel]
 * @param {Function} [opts.onAction]
 * @returns {HTMLElement}
 */
export function emptyState({ icon = '◇', title = 'Nada por aquí', message = '', actionLabel, onAction } = {}) {
  const el = document.createElement('div');
  el.className = 'mc-empty';

  if (icon) {
    const i = document.createElement('div');
    i.className = 'pixel';
    i.style.fontSize = '24px';
    i.setAttribute('aria-hidden', 'true');
    i.innerHTML = escapeHtml(icon);
    el.appendChild(i);
  }
  if (title) {
    const t = document.createElement('p');
    t.className = 'pixel';
    t.innerHTML = escapeHtml(title);
    el.appendChild(t);
  }
  if (message) {
    const m = document.createElement('p');
    m.innerHTML = escapeHtml(message);
    el.appendChild(m);
  }
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mc-btn mc-btn--primary';
    b.innerHTML = escapeHtml(actionLabel);
    b.addEventListener('click', () => onAction?.());
    el.appendChild(b);
  }
  return el;
}

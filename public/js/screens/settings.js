/**
 * screens/settings.js — Ajustes: preferencias visuales (localStorage +
 * profile.prefs), respaldo/restauración JSON y zona de peligro (reseed dev).
 */
import { savePrefs } from '../app.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { pickAndRestoreBackup } from '../ui/backupFlow.js';

export const title = 'Ajustes';

export async function mount(el, ctx) {
  const { api, bus, prefs } = ctx;
  let sizeSyncTimer = null;
  let pendingCardSize = null;

  let profile = null;
  try { profile = await api.get('/api/profile'); } catch { /* tolerante */ }
  const profilePrefs = profile?.prefs || {};

  el.innerHTML = `<div class="screen-page"><div class="wrap">
    <h2 class="pixel-sm" style="margin:0">Ajustes</h2>
    <div class="mc-panel" id="s-prefs"></div>
    <div class="mc-panel" id="s-backup"></div>
    <div class="mc-panel" id="s-info"></div>
    <div class="mc-panel" id="s-danger" style="border-color:#571e1c"></div>
  </div></div>`;

  const prefsEl = el.querySelector('#s-prefs');
  const backupEl = el.querySelector('#s-backup');
  const infoEl = el.querySelector('#s-info');
  const dangerEl = el.querySelector('#s-danger');

  async function patchPrefs(patch) {
    try {
      await api.patch('/api/profile', { prefs: patch });
    } catch { /* las prefs remotas son opcionales */ }
  }

  function scheduleCardSizeSync(value) {
    pendingCardSize = value;
    clearTimeout(sizeSyncTimer);
    sizeSyncTimer = setTimeout(() => {
      const size = pendingCardSize;
      pendingCardSize = null;
      void patchPrefs({ cardSize: size });
    }, 300);
  }

  function flushCardSizeSync() {
    clearTimeout(sizeSyncTimer);
    if (pendingCardSize === null) return;
    const size = pendingCardSize;
    pendingCardSize = null;
    void patchPrefs({ cardSize: size });
  }

  // ---------- Preferencias visuales ----------
  prefsEl.innerHTML = '<h3 class="pixel-sm" style="margin:0 0 8px">Preferencias de vista</h3>';
  const get = (k, def) => prefs?.[k] ?? profilePrefs[k] ?? def;

  // tamaño de tarjeta
  {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('span');
    lab.className = 'muted'; lab.style.fontSize = '12px';
    lab.textContent = 'Tamaño de tarjeta';
    const r = document.createElement('input');
    r.type = 'range'; r.min = '48'; r.max = '140'; r.step = '4';
    r.value = String(get('cardSize', 76));
    r.style.accentColor = 'var(--accent-gold)';
    const v = document.createElement('span');
    v.className = 'pixel-sm'; v.textContent = `${r.value}px`;
    r.addEventListener('input', () => {
      document.documentElement.style.setProperty('--card-size', `${r.value}px`);
      v.textContent = `${r.value}px`;
      savePrefs({ cardSize: Number(r.value) });
      scheduleCardSizeSync(Number(r.value));
    });
    r.addEventListener('change', flushCardSizeSync);
    row.append(lab, r, v);
    prefsEl.appendChild(row);
  }

  // densidad del grid
  {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('span');
    lab.className = 'muted'; lab.style.fontSize = '12px';
    lab.textContent = 'Densidad del grid';
    const sel = document.createElement('select');
    sel.className = 'mc-select'; sel.style.width = 'auto';
    sel.innerHTML = '<option value="normal">Normal</option><option value="compact">Compacta</option>';
    sel.value = get('density', 'normal');
    sel.addEventListener('change', () => {
      const gap = sel.value === 'compact' ? '4px' : '8px';
      document.documentElement.style.setProperty('--card-gap', gap);
      savePrefs({ density: sel.value });
      patchPrefs({ density: sel.value });
    });
    row.append(lab, sel);
    prefsEl.appendChild(row);
  }

  // checks
  const checks = [
    ['motion3d', 'Animaciones / personaje 3D', true],
    ['showPower', 'Mostrar insignias de poder en tarjetas', true],
  ];
  for (const [key, label, def] of checks) {
    const l = document.createElement('label');
    l.className = 'mc-check';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = get(key, def) !== false;
    c.addEventListener('change', () => {
      savePrefs({ [key]: c.checked });
      patchPrefs({ [key]: c.checked });
      toast.info('Preferencia guardada');
    });
    l.append(c, Object.assign(document.createElement('span'), { textContent: label }));
    prefsEl.appendChild(l);
  }

  // ---------- Respaldo ----------
  backupEl.innerHTML = '<h3 class="pixel-sm" style="margin:0 0 8px">Respaldo</h3>';
  const bRow = document.createElement('div');
  bRow.className = 'row wrap';
  const bExp = document.createElement('button');
  bExp.className = 'mc-btn';
  bExp.textContent = 'Crear respaldo JSON';
  bExp.addEventListener('click', async () => {
    if (bExp.disabled) return;
    bExp.disabled = true;
    try { await api.download('/api/export/backup?format=json', 'respaldo-mindun.json'); }
    catch (e) { toast.error(`No se pudo exportar: ${e.message}`); }
    finally { bExp.disabled = false; }
  });
  const bImp = document.createElement('button');
  bImp.className = 'mc-btn';
  bImp.textContent = 'Restaurar respaldo…';
  bImp.addEventListener('click', () => pickAndRestoreBackup({ api }));
  bRow.append(bExp, bImp);
  const bHint = document.createElement('p');
  bHint.className = 'muted';
  bHint.style.fontSize = '12px';
  bHint.style.margin = '8px 0 0';
  bHint.textContent = 'La restauración siempre muestra una vista previa con conflictos y puede deshacerse desde el lote.';
  backupEl.append(bRow, bHint);

  // ---------- Info de datos ----------
  infoEl.innerHTML = `<h3 class="pixel-sm" style="margin:0 0 8px">Dónde viven los datos</h3>
    <div class="stat-row"><span class="k">Base de datos</span><span class="v">data/mindun.db (SQLite local)</span></div>
    <div class="stat-row"><span class="k">Imágenes</span><span class="v">data/images/&lt;categoría&gt;/</span></div>
    <div class="stat-row"><span class="k">Subidas</span><span class="v">data/images/uploads/</span></div>
    <div class="stat-row"><span class="k">Preferencias</span><span class="v">localStorage «mindun.prefs» + perfil</span></div>`;

  // ---------- Zona de peligro ----------
  dangerEl.innerHTML = `<h3 class="pixel-sm" style="margin:0 0 8px;color:var(--danger)">Zona de peligro</h3>`;
  const dzTxt = document.createElement('p');
  dzTxt.className = 'muted';
  dzTxt.style.fontSize = '12px';
  dzTxt.textContent = 'Re-sembrar vuelve a volcar los datos del wiki sobre la base local. Úsalo solo en desarrollo.';
  const dzBtn = document.createElement('button');
  dzBtn.className = 'mc-btn mc-btn--danger';
  dzBtn.textContent = 'Re-sembrar datos desde wiki';
  dzBtn.addEventListener('click', async () => {
    if (dzBtn.disabled) return;
    const ok = await confirmDialog({
      title: 'Re-sembrar datos', danger: true, confirmLabel: 'Re-sembrar',
      message: 'Esto reimporta el catálogo desde los datos wiki locales. ¿Continuar?',
    });
    if (!ok) return;
    dzBtn.disabled = true;
    try {
      await api.post('/api/dev/reseed', {});
      toast.success('Resiembra completada');
      bus.emit('data:changed');
    } catch (e) {
      if (e.status === 404) {
        toast.warn('Re-sembrar no está disponible en este servidor (solo en builds de desarrollo).');
      } else {
        toast.error(`Falló la resiembra: ${e.message}`);
      }
    } finally { dzBtn.disabled = false; }
  });
  dangerEl.append(dzTxt, dzBtn);

  return () => {
    clearTimeout(sizeSyncTimer);
    if (pendingCardSize !== null) void patchPrefs({ cardSize: pendingCardSize });
  };
}

/**
 * ui/itemForm.js — Formulario modal reutilizable.
 * - {api, item}        → edita ítem de catálogo (PATCH /api/items/:id)
 * - {api, entry, item} → edita copia de inventario (PATCH /api/inventory/:id)
 * - {api}              → crea ítem (POST /api/items) + copia opcional (POST /api/inventory)
 * Guardar → toast + bus.emit('data:changed') + onSaved().
 */
import { bus, escapeHtml } from '../app.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { enchantSlotsEditor, compatibleEnchantments, acceptsEnchants, enchantDropdown, slotOptionsFor } from './enchantSlots.js';
import { categoryLabel, itemTitle, numOrNull, splitList, RARITY_LABELS } from './format.js';

const CATEGORIES = ['melee_weapon', 'ranged_weapon', 'armor', 'artifact'];
const RARITIES = ['common', 'rare', 'unique', 'gilded', 'special', 'unknown'];

function field(labelText, input) {
  const lab = document.createElement('label');
  lab.className = 'mc-label';
  lab.innerHTML = escapeHtml(labelText);
  const w = document.createElement('div');
  w.append(lab, input);
  return w;
}

function inputEl(value = '', type = 'text') {
  const i = document.createElement('input');
  i.className = 'mc-input';
  i.type = type;
  i.value = value ?? '';
  return i;
}

function selectEl(options, current) {
  const s = document.createElement('select');
  s.className = 'mc-select';
  for (const [v, l] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.innerHTML = escapeHtml(l);
    if (v === current) o.selected = true;
    s.appendChild(o);
  }
  return s;
}

function checkEl(labelText, checked) {
  const l = document.createElement('label');
  l.className = 'mc-check';
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = Boolean(checked);
  const s = document.createElement('span');
  s.innerHTML = escapeHtml(labelText);
  l.append(c, s);
  return { wrap: l, input: c };
}

export async function itemFormModal({ api, item, entry, onSaved } = {}) {
  let theItem = item || null;
  if (!theItem && entry?.itemId) {
    theItem = await api.get(`/api/items/${entry.itemId}`).catch(() => null);
  }
  const isCreate = !theItem && !entry;
  const editCatalog = isCreate || Boolean(item);
  const editEntry = Boolean(entry) || isCreate; // en modo crear la sección se activa por checkbox

  // En creación la categoría todavía puede cambiar; se cargan las opciones para el editor.
  let enchMap = {};
  const needsEnch = editEntry && (isCreate || acceptsEnchants(theItem?.category));
  if (needsEnch) {
    try {
      enchMap = Object.fromEntries(
        (await api.getAll('/api/enchantments')).map((e) => [e.id, e]));
    } catch { enchMap = {}; }
  }

  const body = document.createElement('div');
  const err = document.createElement('div');
  err.className = 'mc-field-error';

  // ---------- Sección catálogo ----------
  const catInputs = {};
  if (editCatalog) {
    const h = document.createElement('h3');
    h.className = 'pixel-sm muted';
    h.style.margin = '0 0 4px';
    h.textContent = isCreate ? 'Nuevo ítem de catálogo' : `Editar: ${itemTitle(theItem)}`;
    body.appendChild(h);

    catInputs.name = inputEl(theItem?.name);
    catInputs.localizedName = inputEl(theItem?.localizedName);
    catInputs.category = selectEl(CATEGORIES.map((c) => [c, categoryLabel(c)]), theItem?.category || 'melee_weapon');
    catInputs.rarity = selectEl(RARITIES.map((r) => [r, RARITY_LABELS[r]]), theItem?.rarity || 'unknown');
    catInputs.description = document.createElement('textarea');
    catInputs.description.className = 'mc-textarea';
    catInputs.description.rows = 2;
    catInputs.description.value = theItem?.description || '';
    catInputs.tags = inputEl((theItem?.tags || []).join(', '));
    catInputs.passiveEffects = document.createElement('textarea');
    catInputs.passiveEffects.className = 'mc-textarea';
    catInputs.passiveEffects.rows = 3;
    catInputs.passiveEffects.placeholder = 'Un efecto por línea';
    catInputs.passiveEffects.value = (theItem?.passiveEffects || []).join('\n');
    catInputs.locations = inputEl((theItem?.locations || []).join(', '));

    const row1 = document.createElement('div');
    row1.className = 'row wrap';
    row1.style.alignItems = 'flex-start';
    const fName = field('Nombre (EN) *', catInputs.name);
    fName.style.flex = '1 1 220px';
    const fLoc = field('Nombre en español', catInputs.localizedName);
    fLoc.style.flex = '1 1 220px';
    row1.append(fName, fLoc);

    const row2 = document.createElement('div');
    row2.className = 'row wrap';
    row2.style.alignItems = 'flex-start';
    const fCat = field('Categoría', catInputs.category);
    fCat.style.flex = '1 1 160px';
    const fRar = field('Rareza', catInputs.rarity);
    fRar.style.flex = '1 1 160px';
    row2.append(fCat, fRar);

    body.append(
      row1, row2,
      field('Descripción', catInputs.description),
      field('Etiquetas (separadas por comas)', catInputs.tags),
      field('Efectos pasivos (uno por línea)', catInputs.passiveEffects),
      field('Ubicaciones (separadas por comas)', catInputs.locations),
    );
  }

  // ---------- Sección copia (inventario) ----------
  const entInputs = {};
  const entrySection = document.createElement('div');
  let addCopyCheck = null;
  let catalogItemCreated = false;

  function entryDraftSnapshot() {
    return {
      quantity: entInputs.quantity?.value,
      powerLevel: entInputs.powerLevel?.value,
      itemLevel: entInputs.itemLevel?.value,
      isFavorite: entInputs.isFavorite?.checked,
      isGilded: entInputs.isGilded?.checked,
      notes: entInputs.notes?.value,
      source: entInputs.source?.value,
      selectedEnchantIds: entInputs.selectedEnchantIds,
      enchantTiers: entInputs.enchantTiers,
      gildedEnchantmentId: entInputs.gildedEnchantmentId,
    };
  }

  function buildEntrySection() {
    const previous = entryDraftSnapshot();
    entrySection.innerHTML = '';
    const h = document.createElement('h3');
    h.className = 'pixel-sm muted';
    h.style.margin = '14px 0 4px';
    h.textContent = entry ? `Mi copia · ${itemTitle(theItem)}` : 'Copia en mi inventario';
    entrySection.appendChild(h);

    entInputs.quantity = inputEl(entry?.quantity ?? previous.quantity ?? 1, 'number');
    entInputs.quantity.min = '1';
    entInputs.quantity.step = '1';
    entInputs.powerLevel = inputEl(entry?.powerLevel ?? previous.powerLevel ?? '', 'number');
    entInputs.itemLevel = inputEl(entry?.itemLevel ?? previous.itemLevel ?? '', 'number');
    const fav = checkEl('Favorito', entry?.isFavorite ?? previous.isFavorite);
    entInputs.isFavorite = fav.input;
    const gild = checkEl('Dorado (gilded)', entry?.isGilded ?? previous.isGilded);
    entInputs.isGilded = gild.input;
    entInputs.notes = document.createElement('textarea');
    entInputs.notes.className = 'mc-textarea';
    entInputs.notes.rows = 2;
    entInputs.notes.value = entry?.notes || previous.notes || '';
    entInputs.source = inputEl(entry?.source || previous.source || '');

    const row = document.createElement('div');
    row.className = 'row wrap';
    row.style.alignItems = 'flex-start';
    const fq = field('Cantidad', entInputs.quantity);
    fq.style.flex = '1 1 90px';
    const fp = field('Poder', entInputs.powerLevel);
    fp.style.flex = '1 1 90px';
    const fl = field('Nivel', entInputs.itemLevel);
    fl.style.flex = '1 1 90px';
    row.append(fq, fp, fl);

    const checks = document.createElement('div');
    checks.className = 'row wrap';
    checks.append(fav.wrap, gild.wrap);

    entrySection.append(row, checks, field('Notas', entInputs.notes), field('Procedencia', entInputs.source));

    // Editor de encantamientos seleccionados (dropdown con iconos + niveles)
    const category = isCreate ? catInputs.category.value : theItem?.category;
    if (acceptsEnchants(category)) {
      const eh = document.createElement('p');
      eh.className = 'mc-label';
      eh.textContent = 'Encantamientos elegidos';
      entrySection.appendChild(eh);
      const itemForEnchants = { ...(theItem || {}), category };
      const slotOpts = slotOptionsFor(itemForEnchants, enchMap);
      const priorIds = entry?.selectedEnchantIds || previous.selectedEnchantIds || [null, null, null];
      const validIds = priorIds.map((id, index) =>
        slotOpts[index]?.some((option) => option.id === id) ? id : null);
      const selectedSet = new Set(validIds.filter(Boolean));
      const priorTiers = (entry?.enchantTiers || previous.enchantTiers || [])
        .filter((tier) => selectedSet.has(tier.enchantmentId));
      const editor = enchantSlotsEditor({
        item: itemForEnchants,
        selectedIds: validIds,
        tiers: priorTiers,
        optionsBySlot: slotOpts,
        onChange: (ids, tiers) => {
          entInputs.selectedEnchantIds = ids;
          entInputs.enchantTiers = tiers;
        },
        onTiersChange: (t) => { entInputs.enchantTiers = t; },
      });
      entInputs.selectedEnchantIds = validIds;
      entInputs.enchantTiers = priorTiers;
      entrySection.appendChild(editor);

      // Encantamiento dorado: dropdown con iconos (compatible o fijo)
      const gildRow = document.createElement('div');
      gildRow.style.marginTop = '8px';
      const gildLab = document.createElement('span');
      gildLab.className = 'mc-label';
      gildLab.style.marginBottom = '4px';
      gildLab.textContent = 'Encantamiento dorado (solo si la copia es dorada)';
      const compat = Object.values(enchMap).length
        ? compatibleEnchantments(Object.values(enchMap), category)
        : [];
      const gildedCandidate = entry?.gildedEnchantmentId || previous.gildedEnchantmentId || null;
      entInputs.gildedEnchantmentId = compat.some((option) => option.id === gildedCandidate)
        ? gildedCandidate
        : null;
      const gildDd = enchantDropdown({
        options: compat,
        value: entInputs.gildedEnchantmentId,
        placeholder: 'Sin encantamiento dorado…',
        onPick: (id) => { entInputs.gildedEnchantmentId = id; },
      });
      gildRow.append(gildLab, gildDd);
      const syncGild = () => gildRow.classList.toggle('hidden', !entInputs.isGilded.checked);
      entInputs.isGilded.addEventListener('change', syncGild);
      syncGild();
      entrySection.appendChild(gildRow);
    } else {
      entInputs.selectedEnchantIds = [null, null, null];
      entInputs.enchantTiers = [];
      entInputs.gildedEnchantmentId = null;
    }
  }

  if (isCreate) {
    const c = checkEl('Añadir una copia a mi inventario', true);
    addCopyCheck = c.input;
    c.input.addEventListener('change', () => {
      entrySection.classList.toggle('hidden', !c.input.checked);
    });
    body.appendChild(c.wrap);
    buildEntrySection();
    body.appendChild(entrySection);
    catInputs.category.addEventListener('change', buildEntrySection);
  } else if (editEntry && entry) {
    buildEntrySection();
    body.appendChild(entrySection);
  }

  body.appendChild(err);

  // ---------- Guardar ----------
  async function save() {
    err.textContent = '';
    try {
      let savedItem = theItem;
      if (editCatalog) {
        const payload = {
          name: catInputs.name.value.trim(),
          localizedName: catInputs.localizedName.value.trim() || null,
          category: catInputs.category.value,
          rarity: catInputs.rarity.value,
          description: catInputs.description.value.trim() || null,
          tags: splitList(catInputs.tags.value),
          passiveEffects: catInputs.passiveEffects.value.split('\n').map((s) => s.trim()).filter(Boolean),
          locations: splitList(catInputs.locations.value),
        };
        if (!payload.name) {
          err.textContent = 'El nombre es obligatorio.';
          return false;
        }
        if (isCreate && !catalogItemCreated) {
          savedItem = await api.post('/api/items', payload);
          theItem = savedItem;
          catalogItemCreated = true;
        } else {
          savedItem = await api.patch(`/api/items/${theItem.id}`, payload);
          theItem = savedItem;
        }
      }
      if (entry) {
        const quantity = Number(entInputs.quantity.value);
        if (!Number.isInteger(quantity) || quantity < 1) {
          err.textContent = 'La cantidad debe ser un número entero de al menos 1.';
          return false;
        }
        await api.patch(`/api/inventory/${entry.id}`, {
          quantity,
          powerLevel: numOrNull(entInputs.powerLevel.value),
          itemLevel: numOrNull(entInputs.itemLevel.value),
          isFavorite: entInputs.isFavorite.checked,
          isGilded: entInputs.isGilded.checked,
          notes: entInputs.notes.value.trim() || null,
          source: entInputs.source.value.trim() || null,
          selectedEnchantIds: entInputs.selectedEnchantIds || [null, null, null],
          enchantTiers: entInputs.enchantTiers || [],
          gildedEnchantmentId: entInputs.isGilded.checked ? (entInputs.gildedEnchantmentId || null) : null,
        });
      } else if (isCreate && addCopyCheck?.checked && savedItem?.id) {
        const quantity = Number(entInputs.quantity.value);
        if (!Number.isInteger(quantity) || quantity < 1) {
          err.textContent = 'La cantidad debe ser un número entero de al menos 1.';
          return false;
        }
        await api.post('/api/inventory', {
          itemId: savedItem.id,
          quantity,
          powerLevel: numOrNull(entInputs.powerLevel.value),
          itemLevel: numOrNull(entInputs.itemLevel.value),
          isFavorite: entInputs.isFavorite.checked,
          isGilded: entInputs.isGilded.checked,
          notes: entInputs.notes.value.trim() || null,
          selectedEnchantIds: entInputs.selectedEnchantIds || [null, null, null],
          enchantTiers: entInputs.enchantTiers || [],
          gildedEnchantmentId: entInputs.isGilded.checked ? (entInputs.gildedEnchantmentId || null) : null,
        });
      }
      toast.success('Guardado correctamente');
      bus.emit('data:changed');
      onSaved?.(savedItem);
      return undefined; // cerrar modal
    } catch (e) {
      err.textContent = catalogItemCreated && addCopyCheck?.checked
        ? `El ítem ya está en el catálogo; no se pudo guardar la copia: ${e.message}. Puedes reintentar.`
        : `Error al guardar: ${e.message}`;
      return false;
    }
  }

  openModal({
    title: isCreate ? 'Nuevo ítem' : entry ? 'Editar copia' : 'Editar ítem',
    body,
    wide: true,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
      { label: 'Guardar', kind: 'primary', onClick: save },
    ],
  });
}

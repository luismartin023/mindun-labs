/**
 * ui/dataTable.js — Tabla de datos con ordenación, búsqueda y paginación.
 * Solo clases de components.css (.mc-table-wrap, .mc-table, .searchbar, .mc-btn--sm).
 */
import { escapeHtml } from '../app.js';

/**
 * @param {object} opts
 * @param {{key:string, label:string, render?:Function, sortable?:boolean,
 *          sortValue?:Function, searchText?:Function, width?:string,
 *          hidden?:boolean}[]} opts.columns
 *   render(row) → Node | string (string se trata como HTML).
 * @param {object[]} [opts.rows]
 * @param {number}  [opts.pageSize=25]
 * @param {boolean} [opts.searchable=true]
 * @param {boolean} [opts.selectable]  Checkbox por fila → getSelected().
 * @param {Function} [opts.onRow]      Clic en fila.
 * @param {string}  [opts.emptyMsg]
 * @returns {{el:HTMLElement, setRows:Function, getSelected:Function,
 *            getFiltered:Function, setColumnVisible:Function,
 *            visibleColumnKeys:Function, setSort:Function}}
 */
export function dataTable({
  columns = [], rows = [], pageSize = 25, searchable = true,
  selectable = false, onRow, emptyMsg = 'Sin resultados',
} = {}) {
  const state = {
    rows: [...rows],
    sortKey: null,
    sortDir: 1,
    page: 1,
    search: '',
    selected: new Set(),
    cols: columns.map((c) => ({ sortable: true, ...c })),
    activeRow: null,
  };

  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '8px';
  el.style.minWidth = '0';

  // ---------- helpers internos ----------
  const visibleCols = () => state.cols.filter((c) => !c.hidden);

  function cellText(col, row) {
    if (col.searchText) return String(col.searchText(row) ?? '');
    if (col.render) {
      const v = col.render(row);
      if (v instanceof Node) return v.textContent || '';
      const tmp = document.createElement('div');
      tmp.innerHTML = String(v ?? '');
      return tmp.textContent || '';
    }
    return String(row[col.key] ?? '');
  }

  function getFiltered() {
    const q = state.search.trim().toLowerCase();
    let out = state.rows;
    if (q) {
      const cols = state.cols; // busca en TODAS las columnas, ocultas incluidas
      out = out.filter((r) => cols.some((c) => cellText(c, r).toLowerCase().includes(q)));
    }
    if (state.sortKey) {
      const col = state.cols.find((c) => c.key === state.sortKey);
      if (col) {
        const val = (r) => (col.sortValue ? col.sortValue(r) : r[col.key]);
        out = [...out].sort((a, b) => {
          const va = val(a); const vb = val(b);
          if (va === null || va === undefined) return 1;
          if (vb === null || vb === undefined) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * state.sortDir;
          return String(va).localeCompare(String(vb), 'es') * state.sortDir;
        });
      }
    }
    return out;
  }

  // ---------- render ----------
  function render() {
    el.innerHTML = '';
    const filtered = getFiltered();
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    if (searchable) {
      const bar = document.createElement('div');
      bar.className = 'searchbar';
      const input = document.createElement('input');
      input.className = 'mc-input';
      input.type = 'search';
      input.placeholder = 'Buscar en la tabla…';
      input.value = state.search;
      input.addEventListener('input', () => { state.search = input.value; state.page = 1; render(); });
      bar.appendChild(input);
      el.appendChild(bar);
      // conservar foco tras re-render
      if (document.activeElement === el._searchEl) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      el._searchEl = input;
    }

    const wrap = document.createElement('div');
    wrap.className = 'mc-table-wrap';
    const table = document.createElement('table');
    table.className = 'mc-table';

    // cabecera
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    if (selectable) {
      const th = document.createElement('th');
      th.style.width = '30px';
      const all = document.createElement('input');
      all.type = 'checkbox';
      all.checked = pageRows.length > 0 && pageRows.every((r) => state.selected.has(r));
      all.title = 'Seleccionar página';
      all.addEventListener('click', (e) => e.stopPropagation());
      all.addEventListener('change', () => {
        pageRows.forEach((r) => (all.checked ? state.selected.add(r) : state.selected.delete(r)));
        render();
      });
      th.appendChild(all);
      htr.appendChild(th);
    }
    for (const col of visibleCols()) {
      const th = document.createElement('th');
      th.textContent = col.label + (state.sortKey === col.key ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '');
      if (col.width) th.style.width = col.width;
      if (col.sortable !== false) {
        th.title = 'Ordenar';
        th.addEventListener('click', () => {
          if (state.sortKey === col.key) state.sortDir *= -1;
          else { state.sortKey = col.key; state.sortDir = 1; }
          render();
        });
      } else {
        th.style.cursor = 'default';
      }
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    // cuerpo
    const tbody = document.createElement('tbody');
    if (!pageRows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = visibleCols().length + (selectable ? 1 : 0);
      td.className = 'muted';
      td.style.textAlign = 'center';
      td.style.padding = '22px';
      td.textContent = emptyMsg;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    for (const row of pageRows) {
      const tr = document.createElement('tr');
      if (state.activeRow === row || state.selected.has(row)) tr.className = 'selected';
      if (selectable) {
        const td = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state.selected.has(row);
        cb.addEventListener('click', (e) => e.stopPropagation());
        cb.addEventListener('change', () => {
          cb.checked ? state.selected.add(row) : state.selected.delete(row);
          tr.classList.toggle('selected', cb.checked);
        });
        td.appendChild(cb);
        tr.appendChild(td);
      }
      for (const col of visibleCols()) {
        const td = document.createElement('td');
        if (col.render) {
          const v = col.render(row);
          if (v instanceof Node) td.appendChild(v);
          else td.innerHTML = String(v ?? '');
        } else {
          td.innerHTML = escapeHtml(row[col.key] ?? '—');
        }
        tr.appendChild(td);
      }
      if (onRow) {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
          state.activeRow = row;
          tbody.querySelectorAll('tr.selected').forEach((t) => t.classList.remove('selected'));
          tr.classList.add('selected');
          onRow(row);
        });
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    el.appendChild(wrap);

    // pie de paginación
    const foot = document.createElement('div');
    foot.className = 'row';
    const info = document.createElement('span');
    info.className = 'muted pixel-sm';
    info.textContent = total === 0 ? '0 de 0' : `${start + 1}–${Math.min(start + pageSize, total)} de ${total}`;
    const prev = document.createElement('button');
    prev.className = 'mc-btn mc-btn--sm';
    prev.textContent = '◀ Anterior';
    prev.disabled = state.page <= 1;
    prev.addEventListener('click', () => { state.page -= 1; render(); });
    const next = document.createElement('button');
    next.className = 'mc-btn mc-btn--sm';
    next.textContent = 'Siguiente ▶';
    next.disabled = state.page >= pages;
    next.addEventListener('click', () => { state.page += 1; render(); });
    const right = document.createElement('div');
    right.className = 'row';
    right.append(prev, next);
    foot.append(info, document.createElement('span'), right);
    foot.children[1].className = 'grow';
    el.appendChild(foot);
  }

  render();

  return {
    el,
    setRows(r) { state.rows = [...(r || [])]; state.page = 1; state.selected.clear(); state.activeRow = null; render(); },
    getSelected() { return [...state.selected]; },
    getFiltered,
    setColumnVisible(key, visible) {
      const c = state.cols.find((x) => x.key === key);
      if (c) { c.hidden = !visible; render(); }
    },
    visibleColumnKeys() { return visibleCols().map((c) => c.key); },
    allColumnKeys() { return state.cols.map((c) => c.key); },
    setSort(key, dir = 1) { state.sortKey = key; state.sortDir = dir; render(); },
    setSearch(v) { state.search = String(v ?? ''); state.page = 1; render(); },
  };
}

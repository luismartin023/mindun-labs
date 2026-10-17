# ARCHITECTURE — MINDUN LABS

> Contrato interno de implementación. Todo el código debe respetar este
> documento + `server/domain/model.js` (typedefs) + `schema.sql` (columnas).

## 1. Stack y reglas duras

- Node 26 ESM (`"type":"module"`). Sin TypeScript, sin bundler.
- Frontend: ES modules vanilla servidos desde `public/`. NADA de CDN: Three.js
  y fuentes están en `public/vendor` y `public/assets/fonts`.
- Backend: Express + `node:sqlite`. Rutas delgadas → `application/` → `domain/` (puro) + `infrastructure/db/repositories/`.
- La lógica de combinaciones/puntuación/tier lists vive en `server/domain/` y
  no puede importar Express, SQLite ni DOM.
- Nunca inventar datos: ausente = `null`; UI muestra "Sin registrar".
- Comentarios solo donde aporten; español en textos de UI y docs.

## 2. API REST (prefijo `/api`)

Respuesta estándar: JSON directo; errores `{ error: string, details?: any }`
con código HTTP correcto. Listados soportan `?search=&category=&rarity=&owned=&favorite=&sort=&order=&page=&pageSize=`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/meta` | categorías, rarezas, etiquetas de goals, contadores |
| GET/POST | `/api/items` | listar catálogo (filtros arriba) / crear ítem custom |
| GET/PATCH/DELETE | `/api/items/:id` | detalle (incluye `entries[]` de inventario) / editar / borrar |
| GET/POST | `/api/inventory` | listar copias / añadir copia |
| PATCH/DELETE | `/api/inventory/:id` | editar copia / borrar |
| POST | `/api/inventory/:id/duplicate` | duplicar copia |
| GET/POST | `/api/enchantments` | lista catálogo / crear |
| GET/PATCH/DELETE | `/api/enchantments/:id` | |
| GET/POST | `/api/builds` | |
| GET/PATCH/DELETE | `/api/builds/:id` | incluye `score` calculado al leer |
| POST | `/api/builds/:id/duplicate` | |
| POST | `/api/builds/generate` | body: restricciones → `{ results:[{build,score}], total, truncated }` |
| POST | `/api/builds/score-preview` | body: build parcial → desglose de puntuación |
| GET/POST | `/api/tierlists` | |
| GET/PATCH/DELETE | `/api/tierlists/:id` | |
| GET/POST | `/api/comparisons` | kind: items|builds |
| GET/DELETE | `/api/comparisons/:id` | |
| GET/POST | `/api/table-views` | vistas de tabla guardadas |
| PATCH/DELETE | `/api/table-views/:id` | |
| GET/PATCH | `/api/profile` | perfil único |
| GET | `/api/stats/summary` | contadores por categoría/rareza/estado |
| GET/POST | `/api/assets` | lista / subida (multipart, campo `file`, `category`, `itemId`) |
| PATCH/DELETE | `/api/assets/:id` | |
| GET | `/api/export/:type?format=…` | type: inventory,catalog,item/:id,enchantments,build/:id,builds,tierlist/:id,comparison/:id,profile,backup · format: pdf,txt,xlsx,json |
| POST | `/api/import/backup` | body JSON backup → `{ preview }` o `?confirm=1` aplica |
| POST | `/api/import/catalog` | body JSON array de ítems → upsert por slug con preview |
| GET | `/api/import/schema` | plantilla JSON de importación |

Estáticos: `GET /images/*` → `data/images/` (NO en public/), `GET /*` → `public/`.

## 3. Repositorios (patrón)

`server/infrastructure/db/repositories/<x>Repository.js` exporta una factory
`createXRepository(db)` que devuelve métodos CRUD. Las filas SQL se mapean a
objetos de dominio con `rowToItem`/`itemToRow` (JSON ↔ columnas TEXT vía `J`).
Los repositorios NO conocen HTTP ni validan reglas de negocio (eso es dominio).

Servicios en `server/application/<x>Service.js` combinan repos + lógica de
dominio y son lo que la API invoca.

## 4. Dominio (`server/domain/`)

- `items/filters.js`: `filterItems(items, criteria)` puro (search/category/rarity/owned/favorite/tags/power/enchants).
- `builds/generator.js`: `generateBuilds({items, constraints, limit})` con poda, sin explosión combinatoria.
- `scoring/engine.js`: `scoreBuild(build, itemsById, enchantById, weights)` → `{ total, breakdown: {criterio:{value,max,reason} }, notes }`; dimensión sin datos → `{ value:null, reason:'Sin datos' }`.
- `tierlists/logic.js`: mover/reordenar entradas, validar rows.
- `catalog/validators.js`: `validateItem`, `validateInventoryEntry`, `validateBuild`, `validateEnchantment` → `{valid,errors,warnings}`.
- `enchantments/slots.js`: normalizar slots/selecciones, compatibilidad por tipo.

## 5. Frontend (`public/`)

- `index.html`: shell con `<header id="topbar">`, `<main id="screen-root">`, contenedores de toast/modal.
- `js/app.js`: router hash `#/inventario`, `#/catalogo`, `#/builds`, `#/combos`, `#/tiers`, `#/comparar`, `#/tablas`, `#/perfil`, `#/importar`, `#/ajustes`. Registro `SCREENS` nombre→`{title, mount(el, ctx)}`. `ctx = { api, bus, navigate, prefs }`.
- `js/api/client.js`: `api.get/post/patch/del/upload/download` sobre fetch con manejo de error JSON.
- `js/ui/`: widgets reutilizables — `itemCard.js`, `modal.js`, `toast.js`, `filters.js`, `enchantSlots.js`, `dataTable.js`, `emptyState.js`, `confirm.js`. Cada widget exporta factory pura; estilos por clases `components.css`.
- `js/screens/`: un archivo por pantalla, exporta `{ title, mount }`.
- `js/three/characterViewer.js`: `createCharacterViewer(container, {paused})` → `{ dispose, setPaused, resetView }`.

### Convenciones CSS

- Tokens SOLO en `tokens.css` (paleta de la captura: `--bg-world`, `--bg-panel`, `--accent-gold`, `--rarity-*`, etc.).
- Clases BEM ligero: `.mc-grid`, `.mc-card.rarity-unique`, `.mc-panel`, `.mc-btn`, `.mc-btn--primary`, `.mc-tag`, `.mc-empty`, `.mc-input`, `.mc-select`, `.mc-table`, `.mc-tierrow`, `.topbar`, `.zone-character`, `.zone-grid`, `.zone-detail`.
- Fuentes: `'Press Start 2P'` (títulos/etiquetas cortas/números) y sans del sistema (cuerpo). `@font-face` ya declarado en `tokens.css`.
- Rareza SIEMPRE con marco + etiqueta de texto (no solo color).
- Responsive: desktop = 3 zonas; tablet = detalle como drawer; móvil = tabs.

## 6. Imágenes

- Sirven desde `/images/<dir>/<file>` (`data/images/`, mapeado en server).
- Fallback visual: `img.onerror` → clase `mc-img-missing` con inicial del nombre.
- Subidas nuevas → `POST /api/assets` (multer a `data/images/uploads/`).

## 7. Propiedad de archivos (subagentes)

| Agente | Archivos |
|---|---|
| Dominio | `server/domain/**` (excepto `model.js`), `tests/domain/**` |
| Backend | `server/api/**`, `server/http/**`, `server/application/**`, `server/infrastructure/{db/repositories,exporters,importers,fs}/**`, `server/index.js`, `server/config.js` |
| Pantallas | `public/js/screens/**`, `public/js/ui/**` |
| 3D | `public/js/three/**` |
| Core | `model.js`, `schema.sql`, `db.js`, `ARCHITECTURE.md`, `public/index.html`, `js/app.js`, `js/api/client.js`, `css/*`, `screens/inventory.js` |

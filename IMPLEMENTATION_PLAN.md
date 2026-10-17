# IMPLEMENTATION_PLAN — MINDUN LABS BY MKZ COMPANY

> Gestor de inventario y laboratorio de builds para **Minecraft Dungeons I**.
> Stack confirmado por el usuario: **HTML + CSS + JS, backend Node.js, SQL local**.
> Referencia visual: `../DATA/UI-MINDUN_LABS.png` (pantalla de inventario del juego).

## 1. Arquitectura (DDD + SOLID)

```
MINDUN_LABS/
  package.json            # type:module · scripts: start/seed/test
  server/
    index.js              # entrada: HTTP estático + API
    config.js             # puerto, rutas, límites
    http/                 # router + middlewares + helpers de respuesta
    api/                  # controladores delgados por dominio
    application/          # casos de uso / servicios (orquestan dominio+repos)
    domain/               # ENTIDADES + REGLAS PURAS (sin Express/SQLite/DOM)
      items/ enchantments/ builds/ scoring/ tierlists/ catalog/
    infrastructure/
      db/                 # node:sqlite + migraciones + repositorios SQL
      exporters/          # PDF (jsPDF), XLSX (exceljs), TXT, JSON
      importers/          # JSON backup, CSV/XLSX, manifiesto de assets
      fs/                 # almacenamiento de imágenes en disco
  public/                 # FRONTEND vanilla (ES Modules, sin bundler)
    index.html
    css/                  # tokens.css · base.css · components.css · screens.css
    js/
      app.js              # shell + router hash + estado global
      api/ ui/ screens/   # componentes y pantallas
      three/              # personaje 3D voxel (Three.js vendored)
    vendor/               # three.module.js (local, sin CDN)
    assets/fonts/         # fuente pixel OFL + sans legible
  data/
    mindun.db             # SQLite (gitignored)
    images/<categoría>/   # webp servidos en /images/*
    seed/                 # catálogo JSON generado por el scraper
  scripts/
    extract-wiki.mjs      # parsea DATA/*.html → seed JSON + copia imágenes
    fetch-missing.mjs     # descarga iconos/armas-ranged de minecraft.wiki
  tests/                  # node:test — lógica de dominio y repos
```

- **Domain**: entidades (`ItemRecord`, `EnchantmentRecord`, `BuildRecord`,
  `TierListRecord`, `PlayerProfile`, `AssetRecord`), motor de puntuación y
  generador de combinaciones 100% puros y testables.
- **Repos**: interfaces en dominio; implementación SQLite en infrastructure.
  La capa de datos puede cambiar a otra DB sin tocar UI ni dominio.
- **API REST delgada**: `/api/items`, `/api/inventory`, `/api/enchantments`,
  `/api/builds`, `/api/tierlists`, `/api/profile`, `/api/assets`,
  `/api/export`, `/api/import`, `/api/stats`.
- **Frontend**: shell SPA con pantallas Inventario / Catálogo / Builds /
  Combinaciones / Tier Lists / Comparar / Tablas / Perfil / Importar-Exportar /
  Ajustes. CSS por tokens (paleta de la captura centralizada en `tokens.css`).

## 2. Datos — pipeline desde `../DATA/`

| Fuente | Contenido | Estado |
|---|---|---|
| `ARMADURAS.html` | ~80 filas: nombre, ID, unique, DLC, almas, props, encant. incorporado, ubicación, runas | Local |
| `ARMAS-MELEE.html` | ~180 filas (familias + únicas): + combo length | Local |
| `ARTEFACTOS.html` | ~56 filas: props, almas, ubicación, runas | Local |
| `ENCANTAMIENTOS.html` | ~142 filas: descripción, tiers, tipo, coste, built-into | Local |
| Armas a distancia | **NO entregadas** → descargar de minecraft.wiki | Web |
| Iconos faltantes | melee 30/~180 imgs, artefactos 18/~56 → descargar `data-src` de la wiki | Web |

- Scraper con `cheerio` (devDependency) → `data/seed/*.json` con
  `dataStatus: "imported"`, nombre EN + slug + imagen local.
- Imágenes `.webp` copiadas a `data/images/<cat>/`; faltantes descargadas.
- Nada de datos inventados: lo no presente queda `Sin verificar`/vacío.

## 3. Dependencias (npm, versiones fijadas)

- `express` + `multer`: API y subida de imágenes.
- `exceljs`, `jspdf` + `jspdf-autotable`: exportación real XLSX/PDF (servidor).
- `three`: personaje 3D (se copia `three.module.js` a `public/vendor/`).
- `cheerio` (dev): scraper wiki.
- **DB**: `node:sqlite` nativo de Node 26 — cero binarios externos.
- **Tests**: `node:test` + `node:assert` nativos.

## 4. Fases de ejecución

1. **Base**: package.json, tokens CSS, layout 3 zonas, router SPA, DB + migraciones, repositorios.
2. **Scraper + seed**: extraer wiki, copiar/descargar imágenes, cargar catálogo en SQLite.
3. **Pantalla inventario**: grid con rarezas, detalle derecho, personaje 3D voxel (Three.js), barra superior, filtros/búsqueda.
4. **CRUD + encantamientos**: copias, cantidades, favoritos, 3 slots con opciones/selección, ficha completa.
5. **Builds + combinaciones**: editor, motor de puntuación configurable, restricciones, poda, cancelable.
6. **Tier lists + comparador + tablas**: drag&drop + alternativas por botones, columnas configurables, vistas guardadas.
7. **Export/Import**: PDF, TXT, XLSX real, backup JSON con vista previa y conflictos.
8. **Perfil + estadísticas + pulido**: responsive, accesibilidad, estados vacíos, reduced-motion.
9. **Verificación**: tests de dominio, `node --check`, auditoría visual con chrome-devtools MCP.

## 5. Riesgos y mitigaciones

- **Iconos incompletos** → descarga desde `data-src` de las filas wiki; placeholder coherente si falla.
- **Datos ES/EN** → nombre inglés canónico de la wiki + `localizedName` editable.
- **Explosión combinatoria** → pre-filtros, poda por restricciones, límite de resultados, worker/cancelación.
- **Personaje 3D** → modelo voxel propio (BoxGeometry), sin assets de terceros; fallback estático si no hay WebGL.

## 6. Criterios de aceptación (resumen)

- UI claramente fiel a la composición de la captura (3 zonas, marcos por rareza).
- Catálogo ≠ inventario; copias múltiples del mismo ítem soportadas.
- Persistencia real en SQLite; sobrevive reinicios.
- Builds/combos con puntuación explicable y etiquetada como estimación.
- Exportaciones válidas (xlsx abre en Excel, pdf legible, txt UTF-8 con tildes).
- Tests de lógica crítica verdes; app usable en escritorio y móvil.
- Repo en GitHub con Conventional Commits en español (estilo frontera-mkz).

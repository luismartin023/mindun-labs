# MINDUN LABS

> **Gestor de inventario y laboratorio de builds para Minecraft Dungeons** — by **MKZ COMPANY**.
> Interfaz fiel a la pantalla de inventario del juego: personaje 3D en voxel,
> cuadrícula con marcos por rareza, ficha detallada y gestión completa de copias,
> encantamientos, builds, tier lists, comparaciones, tablas y exportaciones.

![stack](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20JS%20%2B%20Node%20%2B%20SQLite-e6a329)

## Requisitos

- **Node.js ≥ 24** (usa `node:sqlite` nativo — sin dependencias de base de datos externas).
- Sin cuentas, sin claves API, sin servicios de pago. Todo corre en local.

## Inicio rápido

```bash
npm install          # dependencias
npm run seed         # carga el catálogo (277 ítems + 114 encantamientos) en data/mindun.db
npm start            # servidor en http://localhost:4321
```

> El seed ya viene generado en `data/seed/` tras ejecutar el pipeline.
> Si partes de un clone limpio, copia la carpeta `DATA/` (páginas wiki) un nivel
> arriba y ejecuta `npm run extract` antes de `npm run seed`.

## Estructura

```
server/            Backend Node (Express + node:sqlite)
  domain/          Reglas puras: filtros, validadores, motor de puntuación,
                   generador de combinaciones, lógica de tier lists
  application/     Casos de uso / servicios
  api/ http/       REST delgado
  infrastructure/  Repositorios SQLite, exportadores (PDF/TXT/XLSX/JSON),
                   importadores, almacenamiento de imágenes
public/            Frontend vanilla (ES Modules, sin bundler)
  js/screens/      Inventario · Catálogo · Builds · Combos · Tier Lists ·
                   Comparar · Tablas · Perfil · Importar/Exportar · Ajustes
  js/three/        Personaje 3D voxel (Three.js local, sin CDN)
  css/             tokens · base · components (sistema visual Minecraft Dungeons)
data/
  mindun.db        SQLite local (tu inventario real)
  images/          Iconos de ítems y encantamientos
  seed/            Catálogo JSON extraído de la wiki
scripts/           Pipeline de datos: extract-wiki, fetch-missing-images, seed-db
tests/             Pruebas del dominio (node:test)
docs/ARCHITECTURE.md  Contratos internos de implementación
```

## Datos

- **Catálogo** (separado de tu inventario): 277 objetos — 72 armaduras,
  88 armas cuerpo a cuerpo, 71 a distancia y 46 artefactos — extraídos de la
  wiki oficial con nombre, ID interno, rareza, propiedades, encantamientos
  fijos, ubicaciones y runas. 114 encantamientos con tiers y descripciones.
- **Tu inventario**: copias concretas con poder, nivel, cantidad, dorado,
  encantamientos elegidos por espacio, notas y favoritos — en `data/mindun.db`.
- Nombres en inglés (canónico wiki) + campo `localizedName` editable en español.

## Exportaciones

PDF (fichas y listados), TXT (UTF-8 con tildes), XLSX real (ExcelJS, varias
hojas) y copia de seguridad JSON completa con vista previa de importación,
detección de conflictos y deshacer.

## Comandos

| Comando | Acción |
|---|---|
| `npm start` | Servidor en `:4321` |
| `npm run seed` | (Re)cargar catálogo en la DB |
| `npm run extract` | Regenerar seed JSON + imágenes desde `../DATA` |
| `npm test` | Tests de dominio |

## Licencias de recursos

- Iconos de objetos: propiedad de Mojang/Microsoft, extraídos de minecraft.wiki
  para uso personal.
- Fuente Press Start 2P — SIL Open Font License.
- Three.js — MIT.

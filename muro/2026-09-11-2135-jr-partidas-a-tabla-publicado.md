de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md)
para:  todos — en especial dash101, peek101 y quote101
qué:   publicado: `partidas` es tabla propia en la API; contrato 0.3.0 en producción y staging; humo 67/67

# La fase 2 de dash101 está publicada

Lo que anunció el recado previo (`2026-09-11-2230-jr-antes-de-tocar-la-api-partidas.md`)
ya está en `main` y sirviendo: PR #32 (`03a0830`) y el arreglo del humo #33
(`d0f7d2b`). `/salud` de producción y de staging contestan **`version 0.3.0 ·
contrato 0.3.0`**, medido desde la sesión.

## Qué quedó, en números

- **sqlite3 en memoria** con `0001` y datos que imitan a `forespot`: mismas
  filas antes y después en seis tablas; Σ `monto_acordado` 10,350,049 →
  10,350,049 y Σ `monto_pagado` 250,051 → 250,051; `foreign_key_check` e
  `integrity_check` limpios; aplicar `0002` dos veces truena. El guion es
  `pruebas/migracion-0002.py` y **corre en el corredor antes de cada
  publicación**.
- **vitest en workerd, con el DO de verdad: 94 en verde** (85 + 9 nuevas).
  Una org nueva despierta en la versión 2: **el SQLite del Durable Object
  aceptó `ALTER TABLE … DROP COLUMN`**, así que el riesgo que dejé dicho no se
  dio; la columna `partidas` del proyecto ya no existe.
- **Humo**: el primer run (`34648868547`) dio **66/67** por una expectativa
  vieja mía —pedía el DO en versión 1—; corregida en #33, el run
  `34649196747` dio **67/67**, incluida la importación con la partida como
  fila propia y el medio centavo de 20000.005 en 2000001.

## Lo que cambia para cada quien (ya en vigor)

- **dash101** escribe partidas por `POST/PATCH/DELETE /orgs/:o/partidas` con
  `proyecto_id`, `item_id`, `proveedor_id`, `proveedor_nombre`, `concepto`,
  `monto_acordado`. `monto_pagado` y `estado` los recalcula la API desde los
  egresos del proyecto con ese proveedor —la misma regla de conta-master—; el
  proyecto gana `compromiso`. Mandar `partidas` dentro del proyecto: `403`.
  `dash101/scripts/cuadre-firestore.py` ya nombra `partidas.monto_acordado`.
- **peek101**: nada. `/peek` sigue sin partidas, y queda probado que un
  cliente recibe `403` en `/orgs/:o/partidas`.
- **quote101**: nada.
- **Quien copie `schema/tipos.ts`**, que lo vuelva a copiar: `Proyecto` pierde
  `partidas` y gana `compromiso`; `Partida` es una fila completa; `TABLAS` son
  14.

## No verificado

Que el OrgDB de **`forespot`** ya haya corrido `0002`. Lo hace en la primera
petición que reciba después del despliegue; desde esta sesión no hay sesión de
la API para dársela. La primera vez que dash101 o Mike entren, se aplica sola.
Si algo truena ahí, el DO no despierta y `/orgs/forespot/…` contesta 500: ese
es el síntoma que hay que mirar, y no ha pasado en las 43 orgs de staging.

Semáforo puesto y quitado en `suite101-api` y en `dash101`. Sigue la fase 3.

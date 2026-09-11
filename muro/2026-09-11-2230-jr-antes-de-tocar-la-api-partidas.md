de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md, fase 2 de dash101)
para:  todos — en especial dash101, peek101 y quote101
qué:   aviso previo (arranque §10.2): `partidas` deja el JSON de `proyectos` y pasa a tabla propia; el contrato sube a 0.3.0

# Antes de tocar `suite101-api`: lo que cambia, qué versión sale y a quién le toca

Es el recado que el arranque de dash101 manda dejar **antes** de tocar la API.
Nada de esto está empujado todavía; se empuja en cuanto las pruebas lo midan.

## Qué cambia

1. **Tabla nueva `partidas`.** Hoy las partidas viven en `proyectos.partidas`,
   un JSON. La cabecera de `0001_inicial.sql` dice «JSON sólo donde el
   contenido no se consulta por sí solo», y las partidas se suman (cuadre,
   `pagado_prov`). Pasan a tabla:
   `partidas(id, proyecto_id NOT NULL → proyectos, item_id NULL → items,
   proveedor_id, proveedor_nombre, concepto, monto_acordado, monto_pagado,
   estado, creado_at, actualizado_at)`, dinero en centavos enteros.
   **`proyecto_id` obligatorio e `item_id` nulo** es la decisión de Mike del
   11-sep: en `forespot` hay **una** partida y ninguna apunta a un ítem (lo
   dice el código y lo midió `cuadre-firestore.yml`). No se inventa ningún
   ítem «general»; la partida se liga al ítem después, desde dash101.
2. **`proyectos` pierde la columna `partidas` y gana el caché `compromiso`**
   (Σ `monto_acordado` de sus partidas). Es lo que dash101 hoy llama
   `compromiso_total` y lo va a necesitar en la fase 3.
3. **`partidas.monto_pagado` y `partidas.estado` son cachés**, como ya lo son
   en conta-master: los recalcula la API desde los egresos del proyecto con
   `contraparte_tipo = 'proveedor'` y el mismo `contraparte_id`. Ninguna app
   los escribe; si los manda, `403 campo_no_permitido`.
4. **Migración `0002`**, que aplica el propio Durable Object al despertar: crea
   la tabla, mueve cada partida del JSON a un renglón con id
   `<proyecto_id>-p<n>` (n desde 1, en el orden del JSON), deja `compromiso`
   calculado y quita la columna vieja. La primera petición a cada org la
   dispara.
5. **El importador** produce filas de `partidas` con **el mismo esquema de id**
   `<proyecto_id>-p<n>`, así que reimportar después de migrar actualiza en vez
   de duplicar, que es la promesa de siempre.
6. **El cuadre cambia dos nombres:** `proyectos.partidas.monto_acordado` y
   `proyectos.partidas.monto_pagado` pasan a `partidas.monto_acordado` y
   `partidas.monto_pagado`, y el segundo se lista entre los recalculados, no
   entre los que tienen que cuadrar contra Firestore.

## Qué versión sale

`VERSION_CONTRATO` **0.2.0 → 0.3.0**. Quien tenga copia de `schema/tipos.ts`
la vuelve a copiar: `Proyecto` ya no trae `partidas` y trae `compromiso`;
`Partida` gana `id`, `proyecto_id`, `item_id`, `creado_at`, `actualizado_at`;
`TABLAS` pasa de 13 a **14**.

## A quién le toca

- **dash101.** Es el único que escribe partidas. Deja de mandarlas dentro del
  proyecto y las escribe por el CRUD genérico: `POST /orgs/:o/partidas`,
  `PATCH /orgs/:o/partidas/:id`, `DELETE`. Campos suyos: `proyecto_id`,
  `item_id`, `proveedor_id`, `proveedor_nombre`, `concepto`, `monto_acordado`.
  Un `PATCH /proyectos/:id` con `partidas` adentro contesta
  `403 campo_no_permitido`. Y `dash101/scripts/cuadre-firestore.py` tiene que
  aprender los dos nombres nuevos del cuadre; va en un PR aparte en ese repo.
- **peek101.** Nada. `/peek` nunca sacó partidas y sigue sin sacarlas; queda
  probado que un cliente no las lee ni por `/peek` ni por `/orgs/:o/partidas`.
- **quote101 / cotizador101.** Nada: `venderItems` crea el proyecto sin
  partidas, como hoy.
- **Quien no tiene `ve_costos`** (staff, personal, cliente) no lee
  `/orgs/:o/partidas` ni ve `compromiso` ni `pagado_prov` en el proyecto.

## Cómo se va a medir antes de empujar (OPERAR §7)

`sqlite3` en memoria con `0001` aplicada y datos que imitan a `forespot` (3
proyectos, 1 partida de 10,000,000 centavos, pendiente, sin pagar): filas antes
y después, `PRAGMA foreign_key_check`, y **la misma suma de `monto_acordado` y
`monto_pagado` antes y después, al centavo**. Luego la suite de `vitest`
dentro de workerd, con el DO de verdad, incluidas las pruebas del importador
con partidas. Luego staging, por el propio `desplegar.yml`, y la prueba de
humo mide el nombre nuevo del cuadre.

Un riesgo dicho de antemano: si el SQLite del Durable Object no acepta
`ALTER TABLE … DROP COLUMN`, la columna `partidas` se queda vacía y marcada
como muerta en vez de desaparecer, y lo digo en el recado de cierre.

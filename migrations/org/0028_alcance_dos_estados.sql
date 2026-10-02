-- OrgDB v28 — el alcance en DOS estados, y su bitácora.
--
-- POR QUÉ
--
-- Mike, 2-oct-2026: «Hay que eliminar el estado de los ítems de "cancelado" y
-- solo existirá "en alcance" o "fuera de alcance". Así hay una lista
-- unificada de las cosas que están requeridas pero aún no se confirman, o se
-- confirmaron y se cancelaron, pero no pasan a otra lista, regresan a fuera
-- de alcance; solo en la bitácora sí aparecerá como "se sacó del alcance" y
-- si se agrega de nuevo aparecerá después "se agregó al alcance" con su fecha
-- y quién la agregó.»
--
-- LO QUE CAMBIA EN LAS FILAS
--
--   · `items.estado` ya sólo toma dos valores que importen: 'vendido' (en
--     alcance) y 'cotizado' (fuera). 'cancelado' sigue en el CHECK de la
--     0001 —SQLite no cambia un CHECK sin rehacer la tabla, y de `items`
--     cuelgan cinco tablas— pero la API ya no lo escribe: un `cancelado`
--     que llegue por el CRUD se guarda como `cotizado`. Los que ya estaban
--     se pasan aquí, de una vez.
--   · `aprobado_at`, `cancelado_at` y `cancelado_motivo` se quedan: son
--     historia, y `cancelado_at` sigue diciendo que a ese ítem lo SACARON
--     (no es lo mismo que un requerimiento que nadie ha decidido: ése sigue
--     saliendo en el plano y en el borrador de quote101).
--
-- LA BITÁCORA
--
-- `alcance_movimientos` (se llamaba items_alcance; ese nombre ya era de un índice de la 0016): un renglón por entrada o salida, con quién, desde qué app,
-- el motivo y cuándo. Es append-only: nada la edita, y se borra sola con el
-- ítem (ON DELETE CASCADE), que es lo único que puede borrarla.
--
-- La semilla sale de lo que ya se sabía: `aprobado_at` es una entrada y
-- `cancelado_at` una salida. Sin quién —nunca se guardó— y la pantalla lo
-- dice así, no inventa un nombre.

CREATE TABLE IF NOT EXISTS alcance_movimientos (
  id          TEXT PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  proyecto_id TEXT,
  accion      TEXT NOT NULL CHECK (accion IN ('entra','sale')),
  quien       TEXT,            -- correo de quien lo movió; NULL = no se sabe (semilla)
  app         TEXT,            -- desde qué app
  motivo      TEXT,
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS alcance_movimientos_item ON alcance_movimientos(item_id, at);

INSERT INTO alcance_movimientos (id, item_id, proyecto_id, accion, quien, app, motivo, at)
  SELECT lower(hex(randomblob(13))), id, proyecto_id, 'entra', NULL, NULL, NULL, aprobado_at
    FROM items WHERE aprobado_at IS NOT NULL;
INSERT INTO alcance_movimientos (id, item_id, proyecto_id, accion, quien, app, motivo, at)
  SELECT lower(hex(randomblob(13))), id, proyecto_id, 'sale', NULL, NULL, cancelado_motivo, cancelado_at
    FROM items WHERE cancelado_at IS NOT NULL;

UPDATE items SET estado = 'cotizado' WHERE estado = 'cancelado';

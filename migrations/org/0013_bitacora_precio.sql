-- OrgDB v13 — el precio de un ítem deja huella en la bitácora de la obra.
--
-- POR QUÉ
--
-- Mike, 20-sep-2026, sobre los ítems de un proyecto: «de qué historial
-- hablamos, del registro de quién y cuándo canceló o agregó un ítem??».
--
-- El monto de venta de un proyecto es una proyección y se mueve: se cancelan
-- alcances, se agregan otros, se renegocia un precio. Eso está bien y no hay
-- que impedirlo. Lo que no puede pasar es que se mueva SIN DEJAR RASTRO,
-- porque el que está en obra se entera de que «ya no es lo acordado» cuando
-- ya lo fabricó.
--
-- La bitácora de la obra es donde eso se lee: es el único lugar donde la
-- gente de obra ya mira, renglón por renglón, qué ha pasado con esa pieza.
-- Un historial en una pantalla que nadie abre no es un historial.
--
-- QUÉ SE HACE
--
-- Se rehace `quell_log_entries` con dos cambios, y SQLite no deja hacer
-- ninguno de los dos con un ALTER:
--
--   · `kind` gana el valor 'precio'. Es una entrada distinta de 'trabajo',
--     'arreglo' y 'acuerdo': no la escribió una persona contando lo que hizo,
--     la escribió el sistema al ver que el dinero cambió. Meterla en
--     'acuerdo' la haría indistinguible de un acuerdo de verdad, y en la
--     bitácora esa diferencia importa.
--
--   · `user_id` pasa a admitir NULL, con un significado: «esto no lo escribió
--     una persona de la obra». Antes era NOT NULL y la única salida habría
--     sido inventar un usuario de sistema en la lista de gente de la obra, o
--     atribuirle el cambio a alguien que no lo hizo. Las dos son mentiras que
--     se leen como verdad tres meses después.
--
-- Nadie apunta a `quell_log_entries` con una llave foránea, así que rehacerla
-- es seguro. Las fotos cuelgan por (owner_type,owner_id) sin FK, y los ids se
-- conservan tal cual, así que las fotos de una entrada siguen siendo suyas.

CREATE TABLE quell_log_entries_nueva (
  id         TEXT PRIMARY KEY,
  element_id TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES quell_users(id),   -- NULL = lo escribió el sistema
  kind       TEXT NOT NULL DEFAULT 'trabajo' CHECK (kind IN ('trabajo','arreglo','acuerdo','precio')),
  text       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO quell_log_entries_nueva (id, element_id, user_id, kind, text, created_at)
  SELECT id, element_id, user_id, kind, text, created_at FROM quell_log_entries;

DROP TABLE quell_log_entries;
ALTER TABLE quell_log_entries_nueva RENAME TO quell_log_entries;

CREATE INDEX IF NOT EXISTS quell_log_element ON quell_log_entries(element_id, created_at);

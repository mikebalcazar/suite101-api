-- OrgDB v2 — `partidas` deja el JSON de `proyectos` y pasa a tabla propia.
-- Fase 2 de dash101, 11-sep-2026. Decisión de Mike: cuelgan del proyecto
-- (`proyecto_id` obligatorio) y el ítem es opcional (`item_id` nulo), porque
-- en `forespot` ninguna partida apunta a un ítem y no se inventa un ítem
-- «general» para colgarlas.
--
-- Por qué tabla y no JSON: la cabecera de 0001 dice «JSON sólo donde el
-- contenido no se consulta por sí solo», y las partidas se suman —el cuadre,
-- el compromiso del proyecto, lo pagado a cada proveedor—.
--
-- La aplica el Durable Object al despertar, como 0001. Nunca se edita después
-- de salir: las bases que ya la corrieron no la volverían a correr.
--
-- Dinero: INTEGER en centavos. Nunca REAL.

CREATE TABLE partidas (
  id              TEXT PRIMARY KEY,
  proyecto_id     TEXT NOT NULL REFERENCES proyectos(id),
  item_id         TEXT REFERENCES items(id),           -- NULL hasta que dash101 la ligue
  proveedor_id    TEXT,                                -- sin FK a propósito: el pool de
  proveedor_nombre TEXT,                               -- proveedores llegó de otra base
  concepto        TEXT,
  monto_acordado  INTEGER NOT NULL DEFAULT 0,
  -- cachés, los recalcula la API tras cada egreso del proyecto:
  monto_pagado    INTEGER NOT NULL DEFAULT 0,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','parcial','pagado')),
  creado_at       TEXT NOT NULL, actualizado_at TEXT
);
CREATE INDEX partidas_proyecto ON partidas(proyecto_id);
CREATE INDEX partidas_item     ON partidas(item_id);

-- Lo que había en el JSON pasa renglón por renglón. El id se arma del
-- proyecto y la posición (PRO1-p1, PRO1-p2…): es determinista, así que el
-- importador, que usa el mismo esquema, actualiza en vez de duplicar.
INSERT INTO partidas (id, proyecto_id, item_id, proveedor_id, proveedor_nombre, concepto,
                      monto_acordado, monto_pagado, estado, creado_at)
SELECT p.id || '-p' || (je.key + 1),
       p.id,
       NULL,
       json_extract(je.value, '$.proveedor_id'),
       json_extract(je.value, '$.proveedor_nombre'),
       json_extract(je.value, '$.concepto'),
       CAST(ROUND(COALESCE(json_extract(je.value, '$.monto_acordado'), 0)) AS INTEGER),
       CAST(ROUND(COALESCE(json_extract(je.value, '$.monto_pagado'), 0)) AS INTEGER),
       CASE WHEN json_extract(je.value, '$.estado') IN ('pendiente','parcial','pagado')
            THEN json_extract(je.value, '$.estado') ELSE 'pendiente' END,
       COALESCE(p.actualizado_at, p.creado_at)
FROM proyectos p, json_each(p.partidas) je
WHERE json_valid(p.partidas) AND json_type(p.partidas) = 'array';

-- El proyecto gana su compromiso (Σ monto_acordado), que es lo que dash101
-- llama compromiso_total. Es caché: lo recalcula la API.
ALTER TABLE proyectos ADD COLUMN compromiso INTEGER NOT NULL DEFAULT 0;
UPDATE proyectos
   SET compromiso = (SELECT COALESCE(SUM(monto_acordado), 0) FROM partidas WHERE proyecto_id = proyectos.id);

-- Y pierde el JSON. Después de esto ya no hay dos verdades.
ALTER TABLE proyectos DROP COLUMN partidas;

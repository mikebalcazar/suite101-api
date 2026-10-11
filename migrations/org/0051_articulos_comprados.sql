-- 0051: los artículos comprados, un cuarto tipo de precio base (11-oct-2026).
--
-- Mike: «aparte de materiales, mano de obra y herramienta/equipo, uno que sea
-- de artículos comprados, ejemplo, una base prefabricada, un cajón
-- prefabricado. Cosas que se compran ya hechas en el mercado, que tienen ya
-- marca y precio». `costos_base.tipo` acepta además 'comprado'.
--
-- SQLite no cambia un CHECK con ALTER: se rehace la tabla (nueva, copiar,
-- tirar la vieja, renombrar) con los mismos ids y los mismos índices.
-- `costos_base` no tiene llaves que apunten a ella: las recetas y las
-- cuadrillas la nombran por id dentro de su JSON.

CREATE TABLE costos_base_nueva (
  id             TEXT PRIMARY KEY,
  clave          TEXT NOT NULL DEFAULT '',
  nombre         TEXT NOT NULL,
  nombre_norm    TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL DEFAULT 'material' CHECK (tipo IN ('material', 'mo', 'equipo', 'comprado')),
  unidad         TEXT NOT NULL DEFAULT 'pza',
  precio         INTEGER NOT NULL DEFAULT 0,
  categoria      TEXT NOT NULL DEFAULT '',
  historial      TEXT NOT NULL DEFAULT '[]',
  creado_at      TEXT NOT NULL,
  creado_por     TEXT,
  actualizado_at TEXT
);
INSERT INTO costos_base_nueva (id, clave, nombre, nombre_norm, tipo, unidad, precio, categoria, historial, creado_at, creado_por, actualizado_at)
  SELECT id, clave, nombre, nombre_norm, tipo, unidad, precio, categoria, historial, creado_at, creado_por, actualizado_at FROM costos_base;
DROP TABLE costos_base;
ALTER TABLE costos_base_nueva RENAME TO costos_base;
CREATE INDEX IF NOT EXISTS costos_base_tipo ON costos_base(tipo, nombre_norm);
CREATE UNIQUE INDEX IF NOT EXISTS costos_base_clave ON costos_base(clave) WHERE clave <> '';

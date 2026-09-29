-- OrgDB v21 — equipos de trabajo en roster101.
--
-- POR QUÉ
--
-- Mike, 29-sep-2026: «Quiero poder agrupar por "equipo de trabajo" en roster.
-- Que la gente ponga en qué equipo de trabajo está, pero esos equipos los doy
-- de alta yo, y ellos sólo seleccionan cuál de los disponibles es el suyo, o
-- "no tengo equipo".»
--
-- Los equipos son un catálogo de la empresa: los da de alta el panel. El
-- trabajador sólo apunta a uno de los que están prendidos, o a ninguno. Un
-- equipo apagado deja de ofrecerse, pero quien ya estaba en él se queda: la
-- lista de una persona no cambia sola porque administración apagó algo.
-- Borrar un equipo suelta a su gente (equipo_id en NULL); eso lo hace el
-- motor con un UPDATE explícito, no la llave foránea, para poder decir a
-- cuántos soltó.
CREATE TABLE IF NOT EXISTS roster_equipos (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  activo         INTEGER NOT NULL DEFAULT 1,
  orden          INTEGER NOT NULL DEFAULT 0,
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);
ALTER TABLE roster_trabajadores ADD COLUMN equipo_id TEXT REFERENCES roster_equipos(id);
CREATE INDEX IF NOT EXISTS idx_roster_trab_equipo ON roster_trabajadores(equipo_id);

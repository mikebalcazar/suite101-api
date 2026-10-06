-- 0032: fases adicionales en el cronograma (6-oct-2026).
--
-- Mike: «quiero poder agregar otra fase a los procesos en caso de ser
-- necesario, y editar el nombre de la fase del proceso». Hasta hoy un
-- proceso tenía tres fases fijas (material, fabricación, instalación). Ahora
-- puede tener más (etapa 'otra', las que hagan falta), cada fase puede
-- llevar su nombre, y el orden dentro del proceso es `pos` y no la etapa.
--
-- SQLite no cambia un CHECK con ALTER: se rehace la tabla. Lo que había se
-- copia tal cual, con `pos` según su etapa para que el orden no cambie.
CREATE TABLE IF NOT EXISTS quell_tareas_nueva (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES quell_projects(id) ON DELETE CASCADE,
  element_id     TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  seccion        TEXT NOT NULL DEFAULT '',
  orden          INTEGER NOT NULL DEFAULT 0,
  etapa          TEXT NOT NULL CHECK (etapa IN ('material', 'fabricacion', 'instalacion', 'otra')),
  nombre         TEXT,
  pos            INTEGER NOT NULL DEFAULT 0,
  dias           INTEGER NOT NULL DEFAULT 1,
  proveedor_id   TEXT REFERENCES proveedores(id) ON DELETE SET NULL,
  depende_de     TEXT REFERENCES quell_tareas_nueva(id) ON DELETE SET NULL,
  inicio_fijo    TEXT,
  notas          TEXT,
  creado_at      TEXT NOT NULL,
  actualizado_at TEXT NOT NULL
);
INSERT INTO quell_tareas_nueva (id, project_id, element_id, seccion, orden, etapa, nombre, pos, dias, proveedor_id, depende_de, inicio_fijo, notas, creado_at, actualizado_at)
  SELECT id, project_id, element_id, seccion, orden, etapa, NULL,
         CASE etapa WHEN 'material' THEN 0 WHEN 'fabricacion' THEN 10 ELSE 20 END,
         dias, proveedor_id, depende_de, inicio_fijo, notas, creado_at, actualizado_at
    FROM quell_tareas;
DROP TABLE quell_tareas;
ALTER TABLE quell_tareas_nueva RENAME TO quell_tareas;
CREATE INDEX IF NOT EXISTS quell_tareas_project ON quell_tareas(project_id);
CREATE INDEX IF NOT EXISTS quell_tareas_element ON quell_tareas(element_id);

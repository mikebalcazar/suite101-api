-- OrgDB v31 — el cronograma de la obra, y el tipo del proveedor.
--
-- Mike, 5-oct-2026: «necesito en quell poder configurar un cronograma (…)
-- asignar tiempo de fabricación total, y dar la opción a definir tiempo de:
-- a) entrega de material b) fabricación c) instalación. Y a cada una de esas
-- etapas asignarle un proveedor o contratista (los contratistas debemos darlos
-- de alta como proveedores, pero en proveedores hay 2 tipos: 1. materiales
-- 2. servicios) (…) Poder encadenar tareas (…) sólo se encadenan las
-- instalaciones, las tareas anteriores se pueden avanzar».
--
-- EL PROVEEDOR TIENE TIPO. `materiales` (lo que se compra) o `servicios` (un
-- contratista: herrería, instalación…). Lo que ya existía queda como
-- materiales; se cambia desde dash101 o supply101. La API sólo acepta esos dos.
ALTER TABLE proveedores ADD COLUMN tipo TEXT NOT NULL DEFAULT 'materiales';

-- LA OBRA TIENE UN ARRANQUE Y UN OBJETIVO. `cronograma_inicio` es el día en
-- que se empieza a contar (AAAA-MM-DD); `cronograma_dias` es el tiempo de
-- fabricación total que se quiere cumplir, en días laborables, para comparar
-- contra lo que suman las tareas.
ALTER TABLE quell_projects ADD COLUMN cronograma_inicio TEXT;
ALTER TABLE quell_projects ADD COLUMN cronograma_dias INTEGER;

-- UNA TAREA ES UNA ETAPA DE UNA SECCIÓN DE UNA PIEZA. La pieza (quell_elements)
-- se parte en secciones con nombre («Herrería», «Gabinetes», «Cubiertas»; la
-- sección vacía '' es la pieza entera), y cada sección lleva hasta tres
-- etapas: material → fabricacion → instalacion, que dentro de la sección van
-- en ese orden. Lo que se encadena a mano es `depende_de`: la tarea arranca
-- cuando ésa termina. Los días son laborables de lunes a sábado (decisión de
-- Mike, 5-oct); las fechas no se guardan: se calculan cada vez (cronograma.js).
CREATE TABLE IF NOT EXISTS quell_tareas (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES quell_projects(id) ON DELETE CASCADE,
  element_id     TEXT NOT NULL REFERENCES quell_elements(id) ON DELETE CASCADE,
  seccion        TEXT NOT NULL DEFAULT '',
  orden          INTEGER NOT NULL DEFAULT 0,
  etapa          TEXT NOT NULL CHECK (etapa IN ('material', 'fabricacion', 'instalacion')),
  dias           INTEGER NOT NULL DEFAULT 1,
  proveedor_id   TEXT REFERENCES proveedores(id) ON DELETE SET NULL,
  depende_de     TEXT REFERENCES quell_tareas(id) ON DELETE SET NULL,
  inicio_fijo    TEXT,
  notas          TEXT,
  creado_at      TEXT NOT NULL,
  actualizado_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quell_tareas_project ON quell_tareas(project_id);
CREATE INDEX IF NOT EXISTS quell_tareas_element ON quell_tareas(element_id);

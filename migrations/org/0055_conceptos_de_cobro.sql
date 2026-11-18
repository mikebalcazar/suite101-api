-- OrgDB v55 — la contabilidad del proyecto, aparte de los ítems.
--
-- Mike, 18-nov-2026: «Vamos a separar la contabilidad. Ya no va a ir ligada
-- a los ítems. Los precios de los proyectos se harán por aparte. (…)
-- limpiar todos los precios de venta que estén ahorita en dash de los
-- proyectos para cargar ya los nuevos independientes.»
--
-- Con botones escogió:
--   1. «Conceptos de cobro con opción a importar de las cotizaciones del
--      proyecto de quote.»
--   2. «Un concepto por renglón. Si se importa una segunda cotización del
--      mismo proyecto, se debe ver que es una segunda cotización pero suma.»
--   3. «Todos a cero de una vez», con respaldo de lo que había, y mientras
--      un proyecto no tenga conceptos dash y peek dicen «Precio por cargar»
--      y no calculan saldo. Lo cobrado no se toca.
--
-- DESDE AQUÍ `proyectos.precio_venta` = Σ `conceptos.monto` del proyecto
-- (OrgDB.recalcularProyecto). Los ítems siguen siendo el alcance de la obra
-- —qué se fabrica, en qué etapa va— pero ya no le ponen precio a nada.
--
-- CORRE EN CÓDIGO (OrgDB.conceptosDeCobro), como la 0049: SQLite no tiene
-- `ADD COLUMN IF NOT EXISTS` y hay pruebas que regresan la versión. Lo
-- demás está escrito para que repetirlo no cambie nada: el respaldo y el
-- cero sólo tocan proyectos SIN conceptos.

CREATE TABLE IF NOT EXISTS conceptos (
  id               TEXT PRIMARY KEY,
  proyecto_id      TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL DEFAULT '',
  cantidad         REAL NOT NULL DEFAULT 1,
  precio_unitario  INTEGER NOT NULL DEFAULT 0,   -- centavos, como lee el proyecto su IVA
  monto            INTEGER NOT NULL DEFAULT 0,   -- centavos: cantidad × precio_unitario, lo pone la API
  orden            INTEGER NOT NULL DEFAULT 0,
  -- De qué cotización de quote101 vino, si vino de una. NULL: escrito a mano.
  -- El folio se copia para que el estado de cuenta lo diga aunque la
  -- cotización se borre después.
  cotizacion_id    TEXT,
  cotizacion_folio TEXT,
  cotizacion_nombre TEXT,
  linea            INTEGER,                       -- renglón de la cotización (1, 2, …)
  creado_en_app    TEXT,
  creado_at        TEXT NOT NULL,
  actualizado_at   TEXT
);
CREATE INDEX IF NOT EXISTS conceptos_proy ON conceptos(proyecto_id, orden);
CREATE INDEX IF NOT EXISTS conceptos_cot ON conceptos(cotizacion_id);

-- Cuántos conceptos tiene el proyecto: caché de recalcularProyecto. En cero
-- el precio está POR CARGAR, que no es lo mismo que valer $0.
ALTER TABLE proyectos ADD COLUMN n_conceptos INTEGER NOT NULL DEFAULT 0;

-- El respaldo: lo que decía cada proyecto antes de ponerse en cero. No lo
-- escribe nadie más; se lee para enseñar «Antes: $X» mientras se carga.
CREATE TABLE IF NOT EXISTS precios_anteriores (
  proyecto_id   TEXT PRIMARY KEY,
  precio_venta  INTEGER NOT NULL,
  tasa_iva      INTEGER,
  iva_incluido  INTEGER,
  guardado_at   TEXT NOT NULL
);
INSERT OR IGNORE INTO precios_anteriores (proyecto_id, precio_venta, tasa_iva, iva_incluido, guardado_at)
  SELECT id, precio_venta, tasa_iva, iva_incluido, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM proyectos
  WHERE COALESCE(precio_venta, 0) <> 0 AND id NOT IN (SELECT proyecto_id FROM conceptos);

-- El precio de venta, ya con la regla nueva: la suma de sus conceptos (0
-- mientras no tenga). Es la misma cuenta que hace recalcularProyecto.
UPDATE proyectos SET
  precio_venta = COALESCE((SELECT SUM(c.monto) FROM conceptos c WHERE c.proyecto_id = proyectos.id), 0),
  n_conceptos = (SELECT COUNT(*) FROM conceptos c WHERE c.proyecto_id = proyectos.id);

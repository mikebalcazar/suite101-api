-- 0048: bill101 — la factura nueva, segunda vuelta (9-oct-2026).
--
-- Mike, 9-oct: al facturar con un RFC nuevo, guardarlo como cliente; cada
-- concepto facturado queda en un catálogo para escogerlo después; uno o más
-- correos por cliente a donde se manda la factura timbrada; y el PDF lo
-- arma bill101 con el logo y los datos bancarios de la empresa.
--
-- ALTER va en UN renglón, con esta forma exacta: src/org-db.ts los lee de
-- aquí y los salta si la columna ya está (la migración corre en código).
--
-- En `clientes`: a qué correos se le manda la factura (lista JSON de textos).
-- Es aparte de `correo` (el del contacto) porque facturas suelen ir a
-- contabilidad, no a quien pidió el mueble.
ALTER TABLE clientes ADD COLUMN correos_factura TEXT;

-- `conceptos_fact` — el catálogo de facturación: cada concepto que se timbró
-- alguna vez, para teclearlo una sola vez. Se arma solo al timbrar (clave +
-- descripción es la llave) y guarda lo último con que se facturó.
CREATE TABLE IF NOT EXISTS conceptos_fact (
  id               TEXT PRIMARY KEY,
  clave_prod_serv  TEXT NOT NULL,
  clave_unidad     TEXT NOT NULL,
  unidad           TEXT,
  descripcion      TEXT NOT NULL,
  descripcion_norm TEXT NOT NULL,
  precio_unitario  INTEGER NOT NULL,
  iva              INTEGER,
  veces            INTEGER NOT NULL DEFAULT 1,
  usado_at         TEXT NOT NULL,
  creado_at        TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS conceptos_fact_llave ON conceptos_fact (clave_prod_serv, descripcion_norm);
CREATE INDEX IF NOT EXISTS conceptos_fact_uso ON conceptos_fact (usado_at);

-- `pdf_config` — un renglón: lo que el PDF de la factura lleva además de lo
-- fiscal. Datos bancarios para que el cliente pague, y una leyenda al pie.
CREATE TABLE IF NOT EXISTS pdf_config (
  id            TEXT PRIMARY KEY CHECK (id = 'pdf'),
  banco         TEXT,
  clabe         TEXT,
  cuenta        TEXT,
  beneficiario  TEXT,
  leyenda       TEXT,
  puesta_por    TEXT NOT NULL,
  puesta_at     TEXT NOT NULL
);

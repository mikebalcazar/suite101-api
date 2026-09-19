-- 0009_fiscal.sql · contabilidad fiscal (encargo de dash101, 19-sep-2026)
--
-- LA IDEA, y es lo que decide todo lo demás: **no hay dos contabilidades**.
-- Hay una sola lista de movimientos y cada uno dice si es fiscal. La real es
-- todo; la fiscal es la misma lista filtrada por `facturado`.
--
-- Por qué importa: la factura casi siempre llega DESPUÉS del pago. Con una
-- sola lista, al CFDI que llega tarde se le cuelga el movimiento que ya
-- existe y listo. Con dos contabilidades, ese pago acaba capturado dos veces
-- o perdido, y las dos listas se despalman sin que nadie se entere.
--
-- Dinero: INTEGER en centavos. `tasa_iva` en PUNTOS BASE (1600 = 16.00 %).
--
-- Lo viejo NO se inventa: `facturado` arranca en 0 para todo lo que ya
-- existe, y ninguna cifra de dinero se toca.

ALTER TABLE movimientos ADD COLUMN facturado   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE movimientos ADD COLUMN subtotal    INTEGER;
ALTER TABLE movimientos ADD COLUMN iva         INTEGER;
ALTER TABLE movimientos ADD COLUMN tasa_iva    INTEGER;
ALTER TABLE movimientos ADD COLUMN retenciones INTEGER;
ALTER TABLE movimientos ADD COLUMN uuid_cfdi   TEXT;
ALTER TABLE movimientos ADD COLUMN fecha_cfdi  TEXT;
ALTER TABLE movimientos ADD COLUMN forma_pago  TEXT;

-- El IVA del mes se calcula sobre los movimientos facturados de un rango de
-- fechas; sin este índice recorre toda la tabla cada vez que alguien abre la
-- pantalla fiscal.
CREATE INDEX IF NOT EXISTS mov_facturado ON movimientos(facturado, fecha);

-- Un renglón por factura, emitida o recibida.
CREATE TABLE IF NOT EXISTS cfdi (
  id           TEXT PRIMARY KEY,
  negocio_id   TEXT NOT NULL,
  uuid         TEXT NOT NULL,                  -- el folio fiscal del SAT
  rfc          TEXT,                           -- de la contraparte
  razon_social TEXT,
  tipo         TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  subtotal     INTEGER NOT NULL DEFAULT 0,
  iva          INTEGER NOT NULL DEFAULT 0,
  retenciones  INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL DEFAULT 0,
  fecha        TEXT NOT NULL,
  forma_pago   TEXT,
  -- Una factura cancelada no desaparece: sale del IVA del mes y se queda a la
  -- vista en su propia lista. Borrarla dejaría un hueco que nadie sabe
  -- explicar tres meses después.
  estado       TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','cancelada')),
  cancelada_at TEXT,
  creado_por   TEXT NOT NULL,
  creado_at    TEXT NOT NULL,
  actualizado_at TEXT
);
-- El UUID es único por empresa, y la base de una empresa es ésta: un UNIQUE
-- aquí ES «único por empresa». Capturar dos veces la misma factura es el
-- error más fácil de cometer y el que más ensucia el IVA del mes.
CREATE UNIQUE INDEX IF NOT EXISTS cfdi_uuid ON cfdi(uuid);
CREATE INDEX IF NOT EXISTS cfdi_fecha ON cfdi(fecha, tipo);

-- Un CFDI puede cubrir varios pagos y un pago puede cubrir varios CFDI, así
-- que la liga lleva el monto aplicado: sin él, una factura de $10,000 pagada
-- en tres partes no se puede cuadrar.
CREATE TABLE IF NOT EXISTS cfdi_movimientos (
  cfdi_id       TEXT NOT NULL REFERENCES cfdi(id) ON DELETE CASCADE,
  movimiento_id TEXT NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
  monto_aplicado INTEGER NOT NULL DEFAULT 0,
  creado_at     TEXT NOT NULL,
  PRIMARY KEY (cfdi_id, movimiento_id)
);
CREATE INDEX IF NOT EXISTS cfdi_mov_movimiento ON cfdi_movimientos(movimiento_id);

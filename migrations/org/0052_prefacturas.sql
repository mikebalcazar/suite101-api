-- 0052: prefacturas (15-oct-2026).
--
-- Mike, 15-oct: «necesito poder guardar una prefactura para enviar de muestra
-- y si me la aceptan regresar a la prefactura y ya timbrar y generar la
-- factura real». Con botones: se ve en la lista de facturas como estado
-- «prefactura»; sólo para bajar su PDF (sin correo); al timbrarla se vuelve
-- una factura real con la fecha de ese momento.
--
-- Una prefactura es un borrador guardado (el mismo JSON que se le manda a
-- /fiscal/emitir), sin folio apartado: el folio se aparta al timbrar, como
-- siempre. Cuando se timbra, aquí queda ligada a su emisión y su cfdi.
CREATE TABLE IF NOT EXISTS prefacturas (
  id            TEXT PRIMARY KEY,
  borrador      TEXT NOT NULL,          -- JSON del borrador revisado
  cliente_id    TEXT,
  proyecto_id   TEXT,
  total         INTEGER NOT NULL,       -- centavos, para la lista
  creada_por    TEXT NOT NULL,
  creada_at     TEXT NOT NULL,
  actualizada_at TEXT NOT NULL,
  emision_id    TEXT,                   -- cuando se timbró
  cfdi_id       TEXT,
  timbrada_at   TEXT
);
CREATE INDEX IF NOT EXISTS prefacturas_estado ON prefacturas (cfdi_id, actualizada_at);

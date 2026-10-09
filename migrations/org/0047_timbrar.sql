-- 0047: bill101 fase C — emitir y timbrar facturas con Facturama (9-oct-2026).
--
-- Mike, 8-oct-2026: «un módulo para generar y timbrar facturas». Con
-- botones: PAC Facturama por API; v1 emite Ingreso y Cancelación, todo PUE;
-- la factura nace de un proyecto de la suite o libre.
--
-- ALTER va en UN renglón, con esta forma exacta: src/org-db.ts los lee
-- de aquí y los salta si la columna ya está (la migración corre en código).
--
-- En `cfdi`: con qué id la conoce Facturama (para cancelarla y bajar su
-- PDF), el motivo de cancelación del SAT (01–04) y en qué va la cancelación
-- cuando el receptor tiene que aceptarla.
ALTER TABLE cfdi ADD COLUMN pac_id TEXT;
ALTER TABLE cfdi ADD COLUMN motivo_cancelacion TEXT;
ALTER TABLE cfdi ADD COLUMN cancelacion TEXT;
ALTER TABLE cfdi ADD COLUMN acuse_llave TEXT;

-- En `clientes`: lo que la factura 4.0 exige del receptor y que la suite no
-- guardaba. Se llenan al facturarle la primera vez y quedan para la siguiente.
ALTER TABLE clientes ADD COLUMN razon_social TEXT;
ALTER TABLE clientes ADD COLUMN regimen_fiscal TEXT;
ALTER TABLE clientes ADD COLUMN cp_fiscal TEXT;
ALTER TABLE clientes ADD COLUMN uso_cfdi TEXT;

-- `pac_config` — un renglón. La cuenta de Facturama de la empresa: el
-- usuario en claro, la contraseña CIFRADA (src/fiel.ts, misma llave que la
-- FIEL); si es la cuenta de pruebas (sandbox) o la de verdad; la serie y el
-- folio que sigue; y lo que Facturama dijo de su perfil fiscal la última vez
-- que se le preguntó (RFC, nombre, si tiene sello cargado).
CREATE TABLE IF NOT EXISTS pac_config (
  id              TEXT PRIMARY KEY CHECK (id = 'pac'),
  proveedor       TEXT NOT NULL DEFAULT 'facturama',
  org_id          TEXT NOT NULL,
  usuario         TEXT NOT NULL,
  clave_iv        TEXT NOT NULL,
  clave_dato      TEXT NOT NULL,
  sandbox         INTEGER NOT NULL DEFAULT 1,
  serie           TEXT NOT NULL DEFAULT 'A',
  folio_siguiente INTEGER NOT NULL DEFAULT 1,
  perfil_rfc      TEXT,
  perfil_nombre   TEXT,
  perfil_regimen  TEXT,
  perfil_cp       TEXT,
  perfil_csd      INTEGER,
  perfil_at       TEXT,
  perfil_error    TEXT,
  puesta_por      TEXT NOT NULL,
  puesta_at       TEXT NOT NULL
);

-- `emisiones` — cada intento de timbrar, con su folio apartado y lo que se
-- mandó. Si Facturama contesta mal, queda `fallida` con el motivo y ese
-- folio NO se vuelve a usar: un hueco en los folios se explica, un folio
-- repetido no. Si no contesta, se queda `timbrando` con lo que se sepa
-- (pac_id, uuid) hasta que alguien la resuelva. Si contesta bien, apunta a
-- la factura en `cfdi`.
CREATE TABLE IF NOT EXISTS emisiones (
  id           TEXT PRIMARY KEY,
  serie        TEXT NOT NULL,
  folio        INTEGER NOT NULL,
  estado       TEXT NOT NULL CHECK (estado IN ('timbrando','timbrada','fallida')),
  borrador     TEXT NOT NULL,
  proyecto_id  TEXT,
  cliente_id   TEXT,
  pac_id       TEXT,
  uuid         TEXT,
  cfdi_id      TEXT,
  error        TEXT,
  creada_por   TEXT NOT NULL,
  creada_at    TEXT NOT NULL,
  terminada_at TEXT
);
CREATE INDEX IF NOT EXISTS emisiones_estado ON emisiones (estado, creada_at);

-- 0005 · licencias por suscripción (contrato 0.13.0). Primero para draw101,
-- pero `programa` es un campo: nest101 o quote101 se venderían igual.
--
-- Decisiones de Mike (18-sep-2026, con botones): el pago se marca a mano en
-- master101 por ahora, preparado para que una pasarela lo marque después
-- (`origen`); hay licencias de cortesía sin fecha (`cortesia = 1`); no hay
-- periodo de prueba (una clave sin pago y sin cortesía no entra); un lugar
-- por suscripción, y Mike lo sube por cliente (`lugares`).

CREATE TABLE IF NOT EXISTS suscripciones (
  id             TEXT PRIMARY KEY,
  clave          TEXT NOT NULL UNIQUE,            -- T101-XXXX-XXXX-XXXX
  programa       TEXT NOT NULL,                   -- 'draw101'
  cliente        TEXT NOT NULL,                   -- a nombre de quién
  correo         TEXT,
  plan           TEXT NOT NULL DEFAULT 'mensual',
  lugares        INTEGER NOT NULL DEFAULT 1,      -- máquinas activas a la vez
  estado         TEXT NOT NULL DEFAULT 'activa',  -- 'activa' | 'suspendida'
  origen         TEXT NOT NULL DEFAULT 'manual',  -- quién marcó el último pago: 'manual' | 'stripe'
  cortesia       INTEGER NOT NULL DEFAULT 0,      -- 1 = regalo sin fecha de corte
  paga_hasta     TEXT,                            -- 'AAAA-MM-DD', último día pagado
  notas          TEXT,
  creado_at      TEXT NOT NULL,
  actualizado_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activaciones (
  id               TEXT PRIMARY KEY,
  suscripcion_id   TEXT NOT NULL REFERENCES suscripciones(id),
  huella           TEXT NOT NULL,                 -- sha256 de la máquina, la manda la app
  version          TEXT,                          -- de la app, la última vista
  alta_at          TEXT NOT NULL,
  ultimo_latido_at TEXT NOT NULL,
  activa           INTEGER NOT NULL DEFAULT 1,    -- 0 = lugar liberado
  UNIQUE (suscripcion_id, huella)
);
CREATE INDEX IF NOT EXISTS idx_activaciones_sus ON activaciones (suscripcion_id, activa);

CREATE TABLE IF NOT EXISTS bitacora_licencias (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cuando         TEXT NOT NULL,
  suscripcion_id TEXT,
  quien          TEXT NOT NULL,                   -- correo del superadmin | 'app' | 'stripe'
  accion         TEXT NOT NULL,                   -- crear | cambiar | pago | activar | latido_negado | desactivar | borrar
  detalle        TEXT
);
CREATE INDEX IF NOT EXISTS idx_bitacora_lic_sus ON bitacora_licencias (suscripcion_id, id);

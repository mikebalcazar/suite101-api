-- 0042 · investor101: rondas de inversión y préstamos a la empresa (8-oct-2026).
--
-- Mike, 8-oct: «taller tiene un periodo de falta de flujo (…) y esto sea una
-- herramienta para pedir prestado a uno o varios inversionistas y que les
-- genere un rendimiento durante ese periodo (…) Puede tener varios préstamos
-- y cada uno tiene sus propias temporalidades».
--
-- Dinero: INTEGER en centavos. Tasa: INTEGER en puntos base (250 = 2.50 %).
-- Fechas de calendario: TEXT AAAA-MM-DD. Marcas de tiempo: TEXT ISO 8601 UTC.
--
-- Ninguna de estas tablas sale por el CRUD genérico: van por
-- /orgs/:o/inversion/*, donde un inversionista ve sólo lo suyo.
--
-- Sólo CREATE … IF NOT EXISTS, a propósito: las pruebas vuelven a correr las
-- migraciones sobre una base que ya las trae, y un ALTER repetido truena.

-- El directorio: quien ya prestó y quien podría (prospecto). «Prospecto» no
-- es una columna: es no tener ningún préstamo. Una marca se desfasa; una
-- cuenta, no.
CREATE TABLE IF NOT EXISTS inversionistas (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  nombre_norm   TEXT NOT NULL,
  correo        TEXT,                          -- minúsculas; con él entra
  telefono      TEXT,                          -- para el aviso por WhatsApp
  -- A dónde se le paga de regreso. Lo ve quien paga, en dash101.
  banco         TEXT,
  clabe         TEXT,
  beneficiario  TEXT,
  notas         TEXT,                          -- internas: el inversionista no las ve
  recibe_avisos INTEGER NOT NULL DEFAULT 1,    -- si le llega el correo de una ronda nueva
  activo        INTEGER NOT NULL DEFAULT 1,
  usuario_id    TEXT,                          -- su cuenta en la suite (D1), cuando tiene correo
  creado_at     TEXT NOT NULL,
  actualizado_at TEXT
);
CREATE INDEX IF NOT EXISTS inversionistas_nombre ON inversionistas(nombre_norm);
-- Un correo, un inversionista: dos filas con el mismo correo serían dos
-- estados de cuenta para la misma persona.
CREATE UNIQUE INDEX IF NOT EXISTS inversionistas_correo ON inversionistas(correo) WHERE correo IS NOT NULL;

-- La ronda: «necesito juntar X para tal fecha, en estas condiciones».
CREATE TABLE IF NOT EXISTS rondas (
  id            TEXT PRIMARY KEY,
  folio         TEXT NOT NULL,                 -- RON-000001
  nombre        TEXT NOT NULL,
  descripcion   TEXT,                          -- para qué es; la lee el inversionista
  monto_meta    INTEGER NOT NULL,
  monto_minimo  INTEGER,                       -- lo menos con lo que se entra; NULL = sin mínimo
  -- Lo que se ofrece. Cada préstamo puede salirse de esto al aprobarse.
  tipo_tasa     TEXT NOT NULL CHECK (tipo_tasa IN ('mensual','anual','fija')),
  tasa_pb       INTEGER NOT NULL,
  esquema       TEXT NOT NULL CHECK (esquema IN ('unico','parcialidades')),
  frecuencia    TEXT CHECK (frecuencia IS NULL OR frecuencia IN ('semanal','quincenal','mensual')),
  num_pagos     INTEGER,
  fecha_inicio  TEXT NOT NULL,                 -- cuándo se espera el dinero
  fecha_primer_pago TEXT,
  fecha_vencimiento TEXT,
  fecha_limite  TEXT,                          -- hasta cuándo se puede entrar
  instrucciones TEXT,                          -- a dónde depositar; se enseña al aprobar la oferta
  estado        TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','abierta','cerrada','cancelada')),
  -- De dónde salió: el hueco del flujo de dash101 que se quiere cubrir.
  origen        TEXT,                          -- JSON {app, desde, hasta, deficit, nota}
  creado_por    TEXT NOT NULL,
  creado_at     TEXT NOT NULL,
  actualizado_at TEXT,
  abierta_at    TEXT,
  cerrada_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS rondas_folio ON rondas(folio);
CREATE INDEX IF NOT EXISTS rondas_estado ON rondas(estado, fecha_inicio);

-- «Le entro con tanto». Queda pendiente hasta que quien dirige la aprueba,
-- la ajusta o la rechaza (decisión de Mike con botones).
CREATE TABLE IF NOT EXISTS ronda_ofertas (
  id               TEXT PRIMARY KEY,
  ronda_id         TEXT NOT NULL REFERENCES rondas(id) ON DELETE CASCADE,
  inversionista_id TEXT NOT NULL REFERENCES inversionistas(id),
  monto            INTEGER NOT NULL,           -- lo que ofreció
  monto_aprobado   INTEGER,                    -- lo que se le aceptó
  nota             TEXT,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aprobada','rechazada','retirada')),
  motivo           TEXT,                       -- al rechazar
  prestamo_id      TEXT,
  creado_at        TEXT NOT NULL,
  resuelta_at      TEXT,
  resuelta_por     TEXT
);
CREATE INDEX IF NOT EXISTS ronda_ofertas_ronda ON ronda_ofertas(ronda_id, estado);
CREATE INDEX IF NOT EXISTS ronda_ofertas_inv ON ronda_ofertas(inversionista_id);

-- El préstamo. Nace `por_depositar` al aprobarse una oferta (o a mano, sin
-- ronda) y ARRANCA cuando quien dirige marca el dinero recibido.
CREATE TABLE IF NOT EXISTS prestamos (
  id               TEXT PRIMARY KEY,
  folio            TEXT NOT NULL,              -- PRE-000001
  inversionista_id TEXT NOT NULL REFERENCES inversionistas(id),
  ronda_id         TEXT REFERENCES rondas(id), -- NULL = préstamo directo
  oferta_id        TEXT,
  monto            INTEGER NOT NULL,
  tipo_tasa        TEXT NOT NULL CHECK (tipo_tasa IN ('mensual','anual','fija')),
  tasa_pb          INTEGER NOT NULL,
  esquema          TEXT NOT NULL CHECK (esquema IN ('unico','parcialidades')),
  frecuencia       TEXT CHECK (frecuencia IS NULL OR frecuencia IN ('semanal','quincenal','mensual')),
  num_pagos        INTEGER,
  fecha_inicio     TEXT NOT NULL,              -- estimada hasta que llega el dinero; después, la de verdad
  fecha_primer_pago TEXT,
  fecha_vencimiento TEXT,
  instrucciones    TEXT,
  estado           TEXT NOT NULL DEFAULT 'por_depositar'
    CHECK (estado IN ('por_depositar','activo','liquidado','cancelado')),
  -- El ingreso, cuando el dinero llegó.
  cuenta_id        TEXT,
  movimiento_id    TEXT,
  recibido_at      TEXT,
  recibido_por     TEXT,
  -- La tabla se editó a mano: ya no es la que da la cuenta.
  tabla_editada    INTEGER NOT NULL DEFAULT 0,
  notas            TEXT,
  creado_por       TEXT NOT NULL,
  creado_at        TEXT NOT NULL,
  actualizado_at   TEXT,
  liquidado_at     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS prestamos_folio ON prestamos(folio);
CREATE INDEX IF NOT EXISTS prestamos_inv ON prestamos(inversionista_id, estado);
CREATE INDEX IF NOT EXISTS prestamos_ronda ON prestamos(ronda_id);

-- La tabla de pagos: una fila por pago que se le debe al inversionista.
CREATE TABLE IF NOT EXISTS prestamo_pagos (
  id            TEXT PRIMARY KEY,
  prestamo_id   TEXT NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,
  fecha         TEXT NOT NULL,                 -- cuándo toca
  capital       INTEGER NOT NULL,
  interes       INTEGER NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado')),
  -- Cuando se pagó: de qué cuenta, qué día, y los egresos que dejó.
  pagado_fecha  TEXT,
  cuenta_id     TEXT,
  movimiento_capital_id TEXT,
  movimiento_interes_id TEXT,
  pagado_at     TEXT,
  pagado_por    TEXT,
  nota          TEXT,
  creado_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prestamo_pagos_prestamo ON prestamo_pagos(prestamo_id, numero);
-- El flujo de dash101 pregunta «qué está pendiente y cuándo» todo el tiempo.
CREATE INDEX IF NOT EXISTS prestamo_pagos_pendientes ON prestamo_pagos(estado, fecha);

-- Los papeles: el comprobante del depósito (lo sube quien presta), el
-- contrato firmado y el comprobante de cada pago (lo sube quien paga).
CREATE TABLE IF NOT EXISTS inversion_archivos (
  id          TEXT PRIMARY KEY,
  prestamo_id TEXT NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  pago_id     TEXT,
  clase       TEXT NOT NULL CHECK (clase IN ('comprobante_deposito','contrato_firmado','comprobante_pago','otro')),
  r2_key      TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  mime        TEXT,
  bytes       INTEGER,
  subido_por  TEXT NOT NULL,
  subido_por_nombre TEXT,
  creado_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inversion_archivos_prestamo ON inversion_archivos(prestamo_id, clase);

-- La bitácora. Sólo se agrega. Es lo que contesta «¿quién cambió esta tabla
-- y por qué?», que es lo primero que pregunta alguien que prestó dinero.
CREATE TABLE IF NOT EXISTS inversion_eventos (
  id               TEXT PRIMARY KEY,
  ronda_id         TEXT,
  prestamo_id      TEXT,
  inversionista_id TEXT,
  que              TEXT NOT NULL,
  quien_usuario_id TEXT NOT NULL,
  quien_nombre     TEXT,
  nota             TEXT,
  datos            TEXT,                       -- JSON: el antes y el después
  ts               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inversion_eventos_prestamo ON inversion_eventos(prestamo_id, ts);
CREATE INDEX IF NOT EXISTS inversion_eventos_ronda ON inversion_eventos(ronda_id, ts);

INSERT OR IGNORE INTO folios (serie, siguiente) VALUES ('RON', 1);
INSERT OR IGNORE INTO folios (serie, siguiente) VALUES ('PRE', 1);

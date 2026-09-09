-- OrgDB v1 — el SQLite de cada empresa. §3 del documento de arquitectura.
--
-- Este archivo NO lo aplica wrangler: lo aplica el propio Durable Object al
-- despertar, comparando su versión con la de migraciones/org. Por eso se
-- importa como texto (regla [[rules]] type = "Text" de wrangler.toml).
--
-- Dinero: INTEGER en centavos. Nunca REAL.
-- Fechas: TEXT ISO 8601 UTC.
-- JSON solo donde el contenido no se consulta por sí solo.

CREATE TABLE negocios (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, rfc TEXT,
  moneda TEXT NOT NULL DEFAULT 'MXN', creado_at TEXT NOT NULL
);

CREATE TABLE cuentas (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL REFERENCES negocios(id), nombre TEXT NOT NULL,
  tipo TEXT NOT NULL, banco TEXT, moneda TEXT NOT NULL DEFAULT 'MXN',
  saldo_inicial INTEGER NOT NULL DEFAULT 0, creado_at TEXT NOT NULL
);

-- pools compartidos: la identidad la crea cualquier app; el resto, la dueña
CREATE TABLE clientes (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, nombre TEXT NOT NULL, nombre_norm TEXT NOT NULL,
  correo TEXT, telefono TEXT, rfc TEXT, notas TEXT,
  usuario_id TEXT,                                     -- acceso peek101 (usuarios.id en D1)
  portal_activo INTEGER NOT NULL DEFAULT 0,
  creado_en_app TEXT NOT NULL, creado_at TEXT NOT NULL
);
CREATE INDEX clientes_norm ON clientes(nombre_norm);

CREATE TABLE proveedores (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, nombre_norm TEXT NOT NULL, rfc TEXT, categoria TEXT,
  correo TEXT, telefono TEXT, terminos_pago TEXT, notas TEXT,
  creado_en_app TEXT NOT NULL, creado_at TEXT NOT NULL
);

CREATE TABLE personal (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, nombre_norm TEXT NOT NULL, correo TEXT,
  puesto TEXT, activo INTEGER NOT NULL DEFAULT 1,      -- roster101
  expediente_ref TEXT,                                 -- roster101 (su D1/R2)
  etapas_permitidas TEXT NOT NULL DEFAULT '[]',        -- quell101, JSON [1..7]
  ve_dinero INTEGER NOT NULL DEFAULT 0, estacion_default TEXT,
  usuario_id TEXT,
  creado_en_app TEXT NOT NULL, creado_at TEXT NOT NULL
);

CREATE TABLE estaciones (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, etapa_default INTEGER);

CREATE TABLE cotizaciones (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, cliente_id TEXT REFERENCES clientes(id),
  folio TEXT, estado TEXT NOT NULL DEFAULT 'borrador',
  total INTEGER NOT NULL DEFAULT 0, moneda TEXT NOT NULL DEFAULT 'MXN', vigencia TEXT,
  datos TEXT NOT NULL DEFAULT '{}',
  creado_at TEXT NOT NULL, actualizado_at TEXT
);

CREATE TABLE proyectos (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, cliente_id TEXT NOT NULL REFERENCES clientes(id),
  nombre TEXT NOT NULL, descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'planeando'
    CHECK (estado IN ('planeando','activo','pausado','finiquito','cerrado')),
  fecha_inicio TEXT, fecha_fin_estimada TEXT, fecha_cierre TEXT,
  partidas TEXT NOT NULL DEFAULT '[]',                 -- el cliente NUNCA lo ve
  -- cachés, los recalcula la API tras cada mutación:
  precio_venta INTEGER NOT NULL DEFAULT 0, cobrado INTEGER NOT NULL DEFAULT 0,
  pagado_prov INTEGER NOT NULL DEFAULT 0, avance REAL NOT NULL DEFAULT 0,
  creado_at TEXT NOT NULL, actualizado_at TEXT
);

CREATE TABLE items (
  id            TEXT PRIMARY KEY,
  negocio_id    TEXT NOT NULL,
  proyecto_id   TEXT REFERENCES proyectos(id),         -- NULL mientras solo está cotizado
  cliente_id    TEXT NOT NULL REFERENCES clientes(id),
  clave         TEXT,                                  -- 'M07', nace en la etapa 4
  nombre        TEXT NOT NULL, descripcion TEXT,
  tipo          TEXT NOT NULL DEFAULT 'mueble',
  monto         INTEGER NOT NULL DEFAULT 0, moneda TEXT NOT NULL DEFAULT 'MXN',
  estado        TEXT NOT NULL DEFAULT 'cotizado' CHECK (estado IN ('cotizado','vendido','cancelado')),
  etapa         INTEGER NOT NULL DEFAULT 0 CHECK (etapa BETWEEN 0 AND 7),
  etapa_at      TEXT, etapa_por TEXT,
  fecha_entrega TEXT,
  asignados     TEXT NOT NULL DEFAULT '[]',
  origen        TEXT NOT NULL DEFAULT '{}',
  refs          TEXT NOT NULL DEFAULT '{}',
  creado_at     TEXT NOT NULL, creado_por TEXT NOT NULL, actualizado_at TEXT
);
CREATE INDEX items_proyecto ON items(proyecto_id, etapa);
CREATE INDEX items_cliente  ON items(cliente_id);
CREATE INDEX items_estado   ON items(estado, fecha_entrega);

CREATE TABLE avances (                                 -- append-only
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id),
  etapa INTEGER NOT NULL, persona_id TEXT, usuario_id TEXT NOT NULL,
  nota TEXT, foto TEXT, ts TEXT NOT NULL
);
CREATE INDEX avances_item ON avances(item_id, ts);

CREATE TABLE movimientos (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  monto INTEGER NOT NULL, fecha TEXT NOT NULL,
  cuenta_id TEXT NOT NULL REFERENCES cuentas(id),
  proyecto_id TEXT REFERENCES proyectos(id), item_id TEXT REFERENCES items(id),
  contraparte_tipo TEXT NOT NULL DEFAULT 'otro', contraparte_id TEXT, contraparte_nombre TEXT,
  transfer_id TEXT, descripcion TEXT, categoria TEXT,
  creado_por TEXT NOT NULL, creado_at TEXT NOT NULL
);
CREATE INDEX mov_proyecto ON movimientos(proyecto_id, fecha);
CREATE INDEX mov_item     ON movimientos(item_id);
CREATE INDEX mov_cuenta   ON movimientos(cuenta_id, fecha);

CREATE TABLE opex (
  id TEXT PRIMARY KEY, negocio_id TEXT NOT NULL, nombre TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'egreso',
  monto INTEGER NOT NULL, moneda TEXT NOT NULL DEFAULT 'MXN', frecuencia TEXT NOT NULL,
  dia_semana INTEGER, dia_del_mes INTEGER, fecha_inicio TEXT NOT NULL, fecha_fin TEXT,
  cuenta_id TEXT, categoria TEXT, activo INTEGER NOT NULL DEFAULT 1, creado_at TEXT NOT NULL
);

CREATE TABLE archivos (
  id TEXT PRIMARY KEY, r2_key TEXT NOT NULL, nombre TEXT NOT NULL, mime TEXT, bytes INTEGER,
  de_tabla TEXT NOT NULL, de_id TEXT NOT NULL, subido_por TEXT NOT NULL, creado_at TEXT NOT NULL
);
CREATE INDEX archivos_de ON archivos(de_tabla, de_id);

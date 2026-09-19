-- 0008_ordenes.sql · órdenes de compra (encargo de dash101, 19-sep-2026)
--
-- Cualquier miembro de la empresa pide una compra desde su teléfono; al
-- contador le caen todas en un buzón; al marcarlas pagadas se registra el
-- egreso, se guarda el comprobante y se le avisa por correo a quien la pidió.
--
-- Decisiones de Mike que esta migración sostiene:
--   · sin autorización previa: la orden nace en el buzón (estado `en_buzon`);
--   · el proyecto es OPCIONAL (hay gasto general), y con proyecto se liga a
--     una partida existente o a una nueva;
--   · «contador» es una etiqueta por persona, no un rol de la suite;
--   · el contador puede devolver para corregir, y la orden vuelve al buzón
--     con el MISMO folio y toda su historia.
--
-- Dinero: INTEGER en centavos. Nunca REAL.
--
-- La aplica el Durable Object al despertar. Nunca se edita después de salir.

CREATE TABLE IF NOT EXISTS ordenes (
  id            TEXT PRIMARY KEY,
  negocio_id    TEXT NOT NULL,
  folio         TEXT NOT NULL,                  -- OC-000001, serie 'OC' de `folios`

  -- Quién la pidió. `solicitante_id` es su fila de `personal` cuando la tiene;
  -- un socio o la oficina pueden no estar en `personal`, y aun así piden
  -- compras: por eso el que NO puede faltar es el usuario de la suite.
  solicitante_usuario_id TEXT NOT NULL,
  solicitante_id         TEXT REFERENCES personal(id),
  -- Copiado al crear, a propósito: si mañana esa persona cambia de correo, la
  -- orden conserva a dónde se avisó. Un correo de confirmación que apunta a
  -- otro lado no se puede auditar.
  solicitante_correo     TEXT,
  solicitante_nombre     TEXT,

  proveedor_id     TEXT,                        -- sin FK: el pool de proveedores
  proveedor_nombre TEXT,                        -- llegó de otra base (igual que partidas)

  proyecto_id   TEXT REFERENCES proyectos(id),  -- NULL = gasto general
  partida_id    TEXT REFERENCES partidas(id),

  concepto      TEXT NOT NULL,
  monto         INTEGER NOT NULL,               -- el total, que es lo que se captura
  moneda        TEXT NOT NULL DEFAULT 'MXN',

  -- Fiscal de la orden. `tasa_iva` va en PUNTOS BASE (1600 = 16.00 %): una
  -- tasa no es dinero, pero guardarla como REAL mete el mismo error de coma
  -- flotante que la regla de los centavos vino a quitar.
  con_factura   INTEGER NOT NULL DEFAULT 0,
  subtotal      INTEGER NOT NULL DEFAULT 0,
  iva           INTEGER NOT NULL DEFAULT 0,
  tasa_iva      INTEGER NOT NULL DEFAULT 1600,

  fecha_maxima_pago TEXT,
  urgente       INTEGER NOT NULL DEFAULT 0,

  estado        TEXT NOT NULL DEFAULT 'en_buzon'
    CHECK (estado IN ('en_buzon','devuelta','pagada','rechazada')),
  nota_contador TEXT,                           -- el motivo al devolver o rechazar

  movimiento_id TEXT REFERENCES movimientos(id),-- el egreso; vacío hasta que se paga

  creado_at     TEXT NOT NULL,
  actualizado_at TEXT,
  pagada_at     TEXT,
  pagada_por    TEXT
);
-- El buzón se lee por estado y por lo que vence primero: es LA consulta del
-- contador y se hace muchas veces al día.
CREATE INDEX IF NOT EXISTS ordenes_buzon       ON ordenes(estado, fecha_maxima_pago);
CREATE INDEX IF NOT EXISTS ordenes_solicitante ON ordenes(solicitante_usuario_id, creado_at);
CREATE INDEX IF NOT EXISTS ordenes_proyecto    ON ordenes(proyecto_id);
-- Dos órdenes con el mismo folio serían dos papeles distintos con el mismo
-- número. La cerradura va en la base, no en una revisión del servidor.
CREATE UNIQUE INDEX IF NOT EXISTS ordenes_folio ON ordenes(folio);

-- Sólo se agrega, nunca se edita, igual que `avances`. Es la única forma de
-- contestar «¿por qué esta orden lleva tres semanas?».
CREATE TABLE IF NOT EXISTS orden_eventos (
  id        TEXT PRIMARY KEY,
  -- NULL cuando el evento no es de una orden sino del permiso: marcar o
  -- desmarcar a alguien como contador. Va en esta misma bitácora porque es
  -- parte de la misma historia —quién podía pagar y desde cuándo— y separarla
  -- en otra tabla obligaría a leer dos para reconstruir un mes.
  orden_id  TEXT REFERENCES ordenes(id),
  que       TEXT NOT NULL
    CHECK (que IN ('creada','devuelta','corregida','pagada','rechazada','contador')),
  quien_usuario_id TEXT NOT NULL,
  quien_nombre     TEXT,
  sobre_personal_id TEXT,                       -- a quién se marcó, en `que = 'contador'`
  nota      TEXT,
  ts        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orden_eventos_orden ON orden_eventos(orden_id, ts);

-- «Contador» es una etiqueta que el dueño le pone a cualquier miembro. NO se
-- reusa `ve_dinero`: ésa dice quién VE cifras, y esto dice quién SACA dinero
-- del banco. Son dos permisos distintos y juntarlos daría de alta como
-- pagador a todo el que ya podía mirar.
ALTER TABLE personal ADD COLUMN es_contador INTEGER NOT NULL DEFAULT 0;

-- El consecutivo de las órdenes, con el mismo mecanismo del folio de la
-- cotización: un solo hilo por empresa, así que dos personas pidiendo a la vez
-- no se llevan el mismo número.
INSERT OR IGNORE INTO folios (serie, siguiente) VALUES ('OC', 1);

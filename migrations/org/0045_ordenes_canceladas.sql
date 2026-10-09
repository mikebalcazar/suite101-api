-- 0045: quien pidió una orden la puede cancelar (9-oct-2026).
--
-- Mike: «en supply, hay que poner un botón para cancelar una orden que ya no
-- se necesita». La orden se queda —con su folio y toda su historia— en
-- estado `cancelada`: ya no está en el buzón, no suma a lo que se debe y no
-- se paga. Se cancela sólo mientras está en el buzón o devuelta; una pagada
-- nunca (eso lo cuida el motor, `cancelarOrden`).
--
-- SQLite no cambia un CHECK con ALTER: se rehacen las dos tablas, `ordenes`
-- (estado) y `orden_eventos` (que), como en la 0014 y la 0032. Lo que había
-- se copia tal cual, con los mismos ids.
--
-- LAS LLAVES FORÁNEAS. `orden_eventos.orden_id` apunta a `ordenes(id)` y es
-- la ÚNICA llave que apunta a `ordenes`. En el SQLite del Durable Object las
-- llaves siempre están prendidas y tirar un padre con hijos colgados truena
-- (ver `quitarNegocios` en src/org-db.ts). Por eso el orden es éste, y en
-- ningún paso queda un hijo sin su padre:
--
--   1. los eventos se apartan a `orden_eventos_respaldo`, que NO tiene llave,
--      y se tira `orden_eventos`: `ordenes` se queda sin hijos;
--   2. `ordenes` se rehace (nueva, copiar, tirar la vieja, renombrar);
--   3. `orden_eventos` se rehace desde el respaldo, ya apuntando a la
--      `ordenes` nueva, que tiene todos los ids que los eventos esperan.
--
-- Las columnas de `ordenes` son las de hoy: las de la 0008 sin `negocio_id`
-- (se fue en la 0027) y con `tipo` (0020). Los índices se vuelven a crear
-- todos, con el mismo nombre: `ordenes_tipo` ya sin negocio (0027) y el
-- único `ordenes_folio`, que es el que impide dos papeles con el mismo número.
--
-- La prueba: pruebas/ordenes-canceladas.spec.ts arma una base en la 0044 con
-- órdenes y eventos de todos los estados, la migra dentro del Durable Object
-- y compara fila por fila, índices y `PRAGMA foreign_key_check`.

-- 1. Los eventos, a un lado.
CREATE TABLE orden_eventos_respaldo (
  id        TEXT PRIMARY KEY,
  orden_id  TEXT,
  que       TEXT NOT NULL,
  quien_usuario_id TEXT NOT NULL,
  quien_nombre     TEXT,
  sobre_personal_id TEXT,
  nota      TEXT,
  ts        TEXT NOT NULL
);
INSERT INTO orden_eventos_respaldo (id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts)
  SELECT id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts FROM orden_eventos;
DROP TABLE orden_eventos;

-- 2. Las órdenes, con `cancelada` en el CHECK.
CREATE TABLE ordenes_nueva (
  id            TEXT PRIMARY KEY,
  folio         TEXT NOT NULL,
  solicitante_usuario_id TEXT NOT NULL,
  solicitante_id         TEXT REFERENCES personal(id),
  solicitante_correo     TEXT,
  solicitante_nombre     TEXT,
  proveedor_id     TEXT,
  proveedor_nombre TEXT,
  proyecto_id   TEXT REFERENCES proyectos(id),
  partida_id    TEXT REFERENCES partidas(id),
  concepto      TEXT NOT NULL,
  monto         INTEGER NOT NULL,
  moneda        TEXT NOT NULL DEFAULT 'MXN',
  con_factura   INTEGER NOT NULL DEFAULT 0,
  subtotal      INTEGER NOT NULL DEFAULT 0,
  iva           INTEGER NOT NULL DEFAULT 0,
  tasa_iva      INTEGER NOT NULL DEFAULT 1600,
  fecha_maxima_pago TEXT,
  urgente       INTEGER NOT NULL DEFAULT 0,
  estado        TEXT NOT NULL DEFAULT 'en_buzon'
    CHECK (estado IN ('en_buzon','devuelta','pagada','rechazada','cancelada')),
  nota_contador TEXT,
  movimiento_id TEXT REFERENCES movimientos(id),
  creado_at     TEXT NOT NULL,
  actualizado_at TEXT,
  pagada_at     TEXT,
  pagada_por    TEXT,
  tipo          TEXT NOT NULL DEFAULT 'compra'
);
INSERT INTO ordenes_nueva (id, folio, solicitante_usuario_id, solicitante_id, solicitante_correo, solicitante_nombre,
    proveedor_id, proveedor_nombre, proyecto_id, partida_id, concepto, monto, moneda, con_factura, subtotal, iva,
    tasa_iva, fecha_maxima_pago, urgente, estado, nota_contador, movimiento_id, creado_at, actualizado_at,
    pagada_at, pagada_por, tipo)
  SELECT id, folio, solicitante_usuario_id, solicitante_id, solicitante_correo, solicitante_nombre,
    proveedor_id, proveedor_nombre, proyecto_id, partida_id, concepto, monto, moneda, con_factura, subtotal, iva,
    tasa_iva, fecha_maxima_pago, urgente, estado, nota_contador, movimiento_id, creado_at, actualizado_at,
    pagada_at, pagada_por, tipo
  FROM ordenes;
DROP TABLE ordenes;
ALTER TABLE ordenes_nueva RENAME TO ordenes;

CREATE INDEX IF NOT EXISTS ordenes_buzon       ON ordenes(estado, fecha_maxima_pago);
CREATE INDEX IF NOT EXISTS ordenes_solicitante ON ordenes(solicitante_usuario_id, creado_at);
CREATE INDEX IF NOT EXISTS ordenes_proyecto    ON ordenes(proyecto_id);
CREATE UNIQUE INDEX IF NOT EXISTS ordenes_folio ON ordenes(folio);
CREATE INDEX IF NOT EXISTS ordenes_tipo        ON ordenes(tipo, estado);

-- 3. Los eventos de vuelta, con `cancelada` en el CHECK y su llave a la
--    `ordenes` nueva.
CREATE TABLE orden_eventos_nueva (
  id        TEXT PRIMARY KEY,
  orden_id  TEXT REFERENCES ordenes(id),
  que       TEXT NOT NULL
    CHECK (que IN ('creada','devuelta','corregida','pagada','rechazada','contador','nominas','cancelada')),
  quien_usuario_id TEXT NOT NULL,
  quien_nombre     TEXT,
  sobre_personal_id TEXT,
  nota      TEXT,
  ts        TEXT NOT NULL
);
INSERT INTO orden_eventos_nueva (id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts)
  SELECT id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts FROM orden_eventos_respaldo;
DROP TABLE orden_eventos_respaldo;
ALTER TABLE orden_eventos_nueva RENAME TO orden_eventos;

CREATE INDEX IF NOT EXISTS orden_eventos_orden ON orden_eventos(orden_id, ts);

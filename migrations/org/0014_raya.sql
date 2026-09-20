-- OrgDB v14 — la raya: lo que se le paga a la gente, y su recibo.
--
-- POR QUÉ
--
-- Mike, 20-sep-2026: «pon en la fila un administrador de nóminas», y al
-- analizarlo escogió con todas sus letras el alcance: **pagos de raya y
-- recibos**, no nómina calculada. Nada de IMSS, nada de ISR, nada de CFDI de
-- nómina. Eso es una decisión, no una omisión: calcular retenciones mal es
-- peor que no calcularlas —el error se descubre en una auditoría, meses
-- después, y con multa—, y quien lleva eso hoy lo lleva con su contador.
--
-- Lo que sí hace falta, y hoy se hace en una libreta: apuntar qué se le pagó
-- a cada quien esta semana, que salga de una cuenta de verdad, y que quede un
-- recibo con su firma.
--
-- QUÉ SE HACE
--
-- Dos tablas, y la separación entre ellas es la que importa:
--
--   · `rayas` es el CORTE: un negocio, un periodo, una cuenta. Es lo que se
--     paga de una sentada.
--   · `raya_pagos` es el renglón de cada persona dentro de ese corte, y el
--     que se convierte en un movimiento cuando se paga.
--
-- UN MOVIMIENTO POR PERSONA, no uno solo por el total. Cuesta más filas y es
-- lo correcto: el estado de cuenta tiene que decir a quién se le pagó. Con un
-- egreso global, conciliar contra el banco se vuelve adivinar, y corregirle
-- el monto a una persona obliga a tocar el pago de todas.
--
-- EL NOMBRE SE CONGELA en el renglón (`nombre`). Un recibo dice a quién se le
-- pagó ESE DÍA; si el nombre saliera de `personal` por llave, corregir un
-- apellido mal escrito el año que entra cambiaría todos los recibos viejos.
--
-- `neto` y `total` los calcula el servidor y nunca la pantalla: es la misma
-- regla que `precio_venta` y por la misma razón. Dos personas capturando a la
-- vez tendrían dos totales y los dos se creerían.
--
-- EL PERMISO va en `personal.es_nominas`, igual que `es_contador` (0008), y
-- por el mismo motivo: lo que gana cada quien no lo ve cualquiera con dash101
-- abierto. Se prende SÓLO por su ruta, que exige ser dueño; por eso NO entra
-- en ESCRITORES.personal, o cualquiera se marcaría solo.

ALTER TABLE personal ADD COLUMN es_nominas INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rayas (
  id             TEXT PRIMARY KEY,
  negocio_id     TEXT NOT NULL REFERENCES negocios(id),
  periodo_inicio TEXT NOT NULL,                  -- AAAA-MM-DD
  periodo_fin    TEXT NOT NULL,
  cuenta_id      TEXT REFERENCES cuentas(id),    -- de dónde sale; se fija al pagar
  estado         TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','pagada','cancelada')),
  total          INTEGER NOT NULL DEFAULT 0,     -- CENTAVOS. Lo suma el servidor.
  nota           TEXT NOT NULL DEFAULT '',
  pagada_at      TEXT,
  pagada_por     TEXT,
  creado_por     TEXT,
  creado_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actualizado_at TEXT
);
CREATE INDEX IF NOT EXISTS rayas_por_negocio ON rayas(negocio_id, periodo_fin);

CREATE TABLE IF NOT EXISTS raya_pagos (
  id            TEXT PRIMARY KEY,
  raya_id       TEXT NOT NULL REFERENCES rayas(id) ON DELETE CASCADE,
  personal_id   TEXT NOT NULL REFERENCES personal(id),
  nombre        TEXT NOT NULL,                   -- congelado el día del pago
  concepto      TEXT NOT NULL DEFAULT 'Sueldo',
  sueldo        INTEGER NOT NULL DEFAULT 0,      -- CENTAVOS
  extras        INTEGER NOT NULL DEFAULT 0,      -- horas extra, bono, lo que se suma
  descuentos    INTEGER NOT NULL DEFAULT 0,      -- préstamo, faltas, lo que se resta
  neto          INTEGER NOT NULL DEFAULT 0,      -- sueldo + extras − descuentos, del servidor
  nota          TEXT NOT NULL DEFAULT '',
  movimiento_id TEXT REFERENCES movimientos(id), -- el egreso que lo pagó
  recibido_at   TEXT,                            -- cuándo firmó de recibido
  creado_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS raya_pagos_por_raya ON raya_pagos(raya_id);
CREATE INDEX IF NOT EXISTS raya_pagos_por_persona ON raya_pagos(personal_id, creado_at);

-- Una persona no puede venir dos veces en el mismo corte. Sin esto, capturar
-- dos renglones de la misma persona por distracción le paga dos veces y el
-- total cuadra igual, así que nadie lo nota hasta que falta dinero.
CREATE UNIQUE INDEX IF NOT EXISTS raya_pagos_una_vez ON raya_pagos(raya_id, personal_id);

-- Y la bitácora de permisos admite uno más.
--
-- `orden_eventos` es donde quedó apuntado quién pudo pagar y desde cuándo
-- (0008), y quién puede ver la raya es exactamente la misma clase de hecho:
-- se lee en el mismo renglón de historia y no tiene por qué vivir en otra
-- tabla que nadie va a cruzar. Pero su `CHECK` sólo conoce seis valores, y
-- SQLite no deja cambiar un CHECK con un ALTER: hay que rehacerla.
--
-- Nadie apunta a `orden_eventos` con llave foránea, así que rehacerla es
-- seguro. Los ids se conservan tal cual.

CREATE TABLE orden_eventos_nueva (
  id        TEXT PRIMARY KEY,
  orden_id  TEXT REFERENCES ordenes(id),
  que       TEXT NOT NULL
    CHECK (que IN ('creada','devuelta','corregida','pagada','rechazada','contador','nominas')),
  quien_usuario_id TEXT NOT NULL,
  quien_nombre     TEXT,
  sobre_personal_id TEXT,
  nota      TEXT,
  ts        TEXT NOT NULL
);

INSERT INTO orden_eventos_nueva (id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts)
  SELECT id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts FROM orden_eventos;

DROP TABLE orden_eventos;
ALTER TABLE orden_eventos_nueva RENAME TO orden_eventos;

CREATE INDEX IF NOT EXISTS orden_eventos_orden ON orden_eventos(orden_id, ts);

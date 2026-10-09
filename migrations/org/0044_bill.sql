-- 0044 · bill101: la factura completa, el complemento de pago y los impuestos
-- (9-oct-2026).
--
-- Mike, 8-oct: «Quiero hacer un módulo para generar y timbrar facturas y
-- también importar y actualizar las facturas recibidas (…) un estado de
-- cuenta de movimientos exclusivamente fiscales (…) Esta ventana debe
-- calcular los pagos de impuestos que deben hacerse mensuales y anuales».
--
-- LO QUE NO CAMBIA. La regla de la 0009 sigue entera: no hay dos
-- contabilidades. Hay una lista de movimientos y cada uno dice si es fiscal;
-- la tabla `cfdi` es un renglón por factura, emitida o recibida, y la liga
-- con el dinero es `cfdi_movimientos`. Esto sólo le da a la factura lo que le
-- faltaba para poder entrar SOLA —leída de su XML— en vez de tecleada.
--
-- LO QUE SE AGREGA A `cfdi`. Todo nullable y sin valor por omisión, a
-- propósito: lo que ya estaba capturado a mano no trae estos datos y decir
-- que los trae sería inventar. Lo viejo se lee así:
--   · `origen` nulo           = 'manual' (alguien la tecleó)
--   · `tipo_comprobante` nulo = 'I' (una factura normal)
--   · `trato` nulo            = 'normal'
--
-- CORRE EN CÓDIGO (`OrgDB.bill101`), como la 0041 y la 0043: SQLite no tiene
-- `ADD COLUMN IF NOT EXISTS` y hay pruebas que regresan la versión de la
-- base. Este archivo ES la migración —de aquí se leen las sentencias—; el
-- código sólo las corre de manera que repetirlas no truene. Por eso cada
-- ALTER va en UN renglón, con esta forma exacta.
--
-- Dinero: INTEGER en centavos, en pesos (una factura en dólares se guarda ya
-- convertida con su tipo de cambio; `moneda`, `tipo_cambio` y
-- `total_original` dicen cómo venía).

-- De dónde salió: manual | xml | sat | timbrado.
ALTER TABLE cfdi ADD COLUMN origen TEXT;
-- I factura · E nota de crédito · P complemento de pago · N nómina.
ALTER TABLE cfdi ADD COLUMN tipo_comprobante TEXT;
ALTER TABLE cfdi ADD COLUMN version TEXT;
ALTER TABLE cfdi ADD COLUMN serie TEXT;
ALTER TABLE cfdi ADD COLUMN folio TEXT;
-- PUE (de contado) o PPD (a crédito). Decide en qué mes cuenta el IVA.
ALTER TABLE cfdi ADD COLUMN metodo_pago TEXT;
ALTER TABLE cfdi ADD COLUMN uso TEXT;
ALTER TABLE cfdi ADD COLUMN moneda TEXT;
ALTER TABLE cfdi ADD COLUMN tipo_cambio TEXT;
ALTER TABLE cfdi ADD COLUMN total_original TEXT;
-- `retenciones` (0009) sigue siendo la suma. Éstas dicen de qué impuesto:
-- para el pago del mes, que te retengan IVA y que te retengan ISR son dos
-- cosas distintas.
ALTER TABLE cfdi ADD COLUMN iva_retenido INTEGER;
ALTER TABLE cfdi ADD COLUMN isr_retenido INTEGER;
ALTER TABLE cfdi ADD COLUMN ieps INTEGER;
-- `rfc` (0009) es el de la contraparte. Éstos son los dos, tal cual vienen:
-- los pide el SAT para decir si la factura sigue vigente.
ALTER TABLE cfdi ADD COLUMN rfc_emisor TEXT;
ALTER TABLE cfdi ADD COLUMN rfc_receptor TEXT;
ALTER TABLE cfdi ADD COLUMN sello8 TEXT;
ALTER TABLE cfdi ADD COLUMN fecha_timbrado TEXT;
-- Sólo importa en las recibidas: normal | inversion | no_deducible.
ALTER TABLE cfdi ADD COLUMN trato TEXT;
-- Lo que contestó el SAT la última vez que se le preguntó, y cuándo:
-- vigente | cancelado | no_encontrado. Nulo: no se le ha preguntado.
ALTER TABLE cfdi ADD COLUMN estado_sat TEXT;
ALTER TABLE cfdi ADD COLUMN sat_revisado_at TEXT;
ALTER TABLE cfdi ADD COLUMN proyecto_id TEXT;
-- Dónde quedó el archivo en R2.
ALTER TABLE cfdi ADD COLUMN xml_llave TEXT;
ALTER TABLE cfdi ADD COLUMN pdf_llave TEXT;

-- Los renglones de la factura. Sirven para leerla sin abrir el XML y, cuando
-- se timbre desde aquí, para armarla.
CREATE TABLE IF NOT EXISTS cfdi_conceptos (
  id              TEXT PRIMARY KEY,
  cfdi_id         TEXT NOT NULL REFERENCES cfdi(id) ON DELETE CASCADE,
  orden           INTEGER NOT NULL DEFAULT 0,
  clave_prod_serv TEXT,
  clave_unidad    TEXT,
  unidad          TEXT,
  cantidad        TEXT,
  descripcion     TEXT,
  valor_unitario  INTEGER NOT NULL DEFAULT 0,
  importe         INTEGER NOT NULL DEFAULT 0,
  descuento       INTEGER NOT NULL DEFAULT 0,
  iva             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cfdi_conceptos_cfdi ON cfdi_conceptos(cfdi_id, orden);

-- Lo que dice un complemento de pago: tal día se pagó tanto de tal factura.
-- `cfdi_id` es el complemento; `uuid_docto`, la factura que se pagó —que
-- puede no estar cargada todavía, y por eso es el UUID y no una llave—.
-- Con esto una factura a crédito (PPD) sabe en qué mes cuenta su IVA.
CREATE TABLE IF NOT EXISTS cfdi_pagos (
  id          TEXT PRIMARY KEY,
  cfdi_id     TEXT NOT NULL REFERENCES cfdi(id) ON DELETE CASCADE,
  uuid_docto  TEXT NOT NULL,
  fecha       TEXT NOT NULL,
  parcialidad INTEGER,
  pagado      INTEGER NOT NULL DEFAULT 0,
  iva         INTEGER,
  creado_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cfdi_pagos_docto ON cfdi_pagos(uuid_docto);
CREATE INDEX IF NOT EXISTS cfdi_pagos_cfdi ON cfdi_pagos(cfdi_id);

-- Con qué datos factura la empresa. Un renglón, id fijo. El RFC NO está
-- aquí: es el de `empresa`, que es uno.
CREATE TABLE IF NOT EXISTS fiscal_config (
  id              TEXT PRIMARY KEY CHECK (id = 'fiscal'),
  regimen         TEXT,
  razon_social    TEXT,
  cp              TEXT,
  actualizado_por TEXT,
  actualizado_at  TEXT
);

-- Lo que cambia de un año a otro y no sale de ninguna factura. Lo da el
-- contador. `coeficiente` va en diezmilésimas (523 = 0.0523) y `tasa_isr` en
-- puntos base (3000 = 30 %): ni uno ni otro son dinero, pero en REAL
-- arrastrarían el mismo error de coma flotante.
CREATE TABLE IF NOT EXISTS fiscal_ejercicios (
  anio                INTEGER PRIMARY KEY,
  coeficiente         INTEGER,
  tasa_isr            INTEGER NOT NULL DEFAULT 3000,
  perdidas            INTEGER NOT NULL DEFAULT 0,
  iva_a_favor_inicial INTEGER NOT NULL DEFAULT 0,
  ajuste_deducciones  INTEGER NOT NULL DEFAULT 0,
  ajuste_ingresos     INTEGER NOT NULL DEFAULT 0,
  nota                TEXT,
  actualizado_por     TEXT,
  actualizado_at      TEXT
);

-- Los impuestos que ya se pagaron. Sin esto el provisional de cada mes no
-- sabe qué restar. `periodo` es 'AAAA-MM' (o 'AAAA' para la anual).
CREATE TABLE IF NOT EXISTS fiscal_pagos (
  id            TEXT PRIMARY KEY,
  impuesto      TEXT NOT NULL CHECK (impuesto IN ('iva','isr_provisional','isr_anual')),
  periodo       TEXT NOT NULL,
  monto         INTEGER NOT NULL DEFAULT 0,
  fecha         TEXT NOT NULL,
  nota          TEXT,
  movimiento_id TEXT,
  creado_por    TEXT NOT NULL,
  creado_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fiscal_pagos_periodo ON fiscal_pagos(periodo, impuesto);

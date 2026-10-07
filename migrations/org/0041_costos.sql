-- OrgDB v41 — cost101: los costos base, las cuadrillas y el producto que se
-- arma con ellos (7-oct-2026).
--
-- POR QUÉ
--
-- Mike, 7-oct-2026: «Vamos a necesitar que haya una base de datos de los
-- costos base, la cual puedo editar (agregar, quitar, actualizar) sobre la
-- plataforma. Luego los generadores se alimentan de la base de datos de costos
-- base, y de ahí se generan los productos que son otra base de datos, los
-- cuales van a alimentar los precios de los productos para quote. Quote debe
-- poder leer los precios base y el catálogo de productos.»
--
-- cost101 nació como prototipo que guardaba todo en el navegador de cada
-- quien. Aquí pasa a la base de la empresa, que es de donde lo leen las demás.
--
-- TRES COSAS
--
--   · `costos_base`: lo que se compra o se paga por unidad —un material por
--     pieza o metro, un oficio o un equipo por hora—. `precio` va en centavos
--     y CON IVA incluido, que es como se captura en cost101 (el recibo del
--     proveedor). `historial` es la lista de cambios de precio; la lleva la
--     API, no la app.
--   · `cuadrillas`: un grupo de oficios con su jornada. No guarda costo: sale
--     de sus miembros cada vez.
--   · el PRODUCTO es el de siempre (`productos`, 0017), que es el catálogo
--     que quote101 ya lee. No nace una tabla aparte: un catálogo en dos
--     tablas son dos catálogos. Gana seis columnas para el que se arma por
--     análisis de precio unitario:
--       `apu`       la receta: componentes y porcentajes (herramienta menor,
--                   indirectos, utilidad). NULL = producto de siempre, con su
--                   precio escrito a mano; nada de lo de abajo le aplica.
--       `unidad`    m², pza, ml…
--       `categoria`
--       `estado`    'borrador' | 'aprobado'. NULL en los de siempre.
--       `desglose`  lo que dio la cuenta (caché: lo escribe la API).
--       `historial` cada vez que el precio unitario se movió y por qué
--                   (caché: lo escribe la API).
--
-- EL PRECIO DEL PRODUCTO
--
-- `productos.precio` es lo que quote101 pone en el renglón, y quote101 cobra
-- «más IVA». Mike lo decidió con botones el 7-oct: a quote101 llega el precio
-- de cost101 SIN IVA —con los indirectos y la utilidad de cost101 adentro—.
-- Así que para un producto con `apu`, `precio` = precio unitario / 1.16, y lo
-- calcula la API cada vez que cambia un costo base, una cuadrilla o la
-- receta. El precio unitario con IVA queda en `desglose.pu`.
CREATE TABLE IF NOT EXISTS costos_base (
  id             TEXT PRIMARY KEY,
  clave          TEXT NOT NULL DEFAULT '',
  nombre         TEXT NOT NULL,
  nombre_norm    TEXT NOT NULL DEFAULT '',
  tipo           TEXT NOT NULL DEFAULT 'material' CHECK (tipo IN ('material', 'mo', 'equipo')),
  unidad         TEXT NOT NULL DEFAULT 'pza',
  precio         INTEGER NOT NULL DEFAULT 0,
  categoria      TEXT NOT NULL DEFAULT '',
  historial      TEXT NOT NULL DEFAULT '[]',
  creado_at      TEXT NOT NULL,
  creado_por     TEXT,
  actualizado_at TEXT
);
CREATE INDEX IF NOT EXISTS costos_base_tipo ON costos_base(tipo, nombre_norm);
CREATE UNIQUE INDEX IF NOT EXISTS costos_base_clave ON costos_base(clave) WHERE clave <> '';

CREATE TABLE IF NOT EXISTS cuadrillas (
  id             TEXT PRIMARY KEY,
  clave          TEXT NOT NULL DEFAULT '',
  nombre         TEXT NOT NULL,
  categoria      TEXT NOT NULL DEFAULT '',
  horas          REAL NOT NULL DEFAULT 8,
  miembros       TEXT NOT NULL DEFAULT '[]',
  creado_at      TEXT NOT NULL,
  creado_por     TEXT,
  actualizado_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS cuadrillas_clave ON cuadrillas(clave) WHERE clave <> '';

ALTER TABLE productos ADD COLUMN unidad TEXT;
ALTER TABLE productos ADD COLUMN categoria TEXT;
ALTER TABLE productos ADD COLUMN estado TEXT;
ALTER TABLE productos ADD COLUMN apu TEXT;
ALTER TABLE productos ADD COLUMN desglose TEXT;
ALTER TABLE productos ADD COLUMN historial TEXT;

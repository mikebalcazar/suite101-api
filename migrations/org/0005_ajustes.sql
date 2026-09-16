-- OrgDB v5 — los ajustes de cada app.
--
-- POR QUÉ HACE FALTA
--
-- quote101 guarda hoy en Firebase tres cosas: sus clientes, su configuración
-- (datos de la empresa, logo, condiciones) y su lista de precios. Los clientes
-- y las cotizaciones ya tienen su tabla en la suite. La configuración y los
-- precios no tenían ninguna, y sin un lugar donde ponerlos Firebase no se
-- puede apagar: quedaría prendido para guardar dos documentos.
--
-- Esto no es un cajón de sastre. Es configuración DE UNA APP: lo que no
-- describe al negocio —eso es `negocios`— sino a cómo una app trabaja. El
-- valor va en JSON a propósito, porque nadie lo consulta por dentro: se lee
-- entero o no se lee.
--
-- EL CANDADO ESTÁ EN EL `id`
--
-- El `id` se calcula: `app:clave` («cotizador101:precios»). No lo manda la
-- app, lo arma la API con la cabecera `X-App`, igual que el folio. Eso hace
-- tres cosas de un golpe:
--
--   1. Una app no puede leer ni pisar los ajustes de otra: su id no empieza
--      con su nombre y la ruta lo rechaza. La lista de precios de quote101
--      —que son costos— no la abre dash101 por curiosidad.
--   2. No hay manera de tener dos ajustes con la misma clave: es la llave
--      primaria, no un índice aparte que se pueda olvidar.
--   3. Guardar es una sola llamada. El POST hace upsert por ese id, así que la
--      app no tiene que preguntar antes si ya existía.
--
-- Y por qué se guarda `app` además de llevarlo en el id: para poder filtrar la
-- lista por columna, sin parsear cadenas. El id es el candado; la columna es
-- para consultar.

CREATE TABLE IF NOT EXISTS ajustes (
  id             TEXT PRIMARY KEY,          -- `app:clave`, lo arma la API
  app            TEXT NOT NULL,
  clave          TEXT NOT NULL,
  valor          TEXT NOT NULL DEFAULT '{}',-- JSON; se lee entero
  creado_at      TEXT NOT NULL,
  actualizado_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ajustes_app ON ajustes(app);

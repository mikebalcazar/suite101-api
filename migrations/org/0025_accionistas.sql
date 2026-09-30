-- OrgDB v25 — los accionistas del negocio, para registrar los retiros de
-- utilidades.
--
-- Mike, 30-sep-2026: «El dash, necesito un módulo de accionistas donde se
-- registren pagos a los accionistas como retiro de utilidades».
--
-- El accionista es una fila aquí. El RETIRO NO TIENE TABLA: es un egreso en
-- `movimientos` con categoria = 'retiro_utilidades', contraparte_tipo =
-- 'accionista' y contraparte_id = el accionista. Así baja el saldo de la
-- cuenta de la que salió y aparece en Movimientos, en la conciliación y en el
-- flujo como cualquier otro dinero que se fue; y la categoría lo aparta de los
-- gastos, porque un retiro no es un gasto del negocio: es utilidad que se
-- reparte. Accionistas y retiros los ve quien ve dinero (dash101).
--
-- `porcentaje` es la participación (0 a 100) y es opcional: sirve para
-- enseñar cuánto le tocaría a cada quien, no para calcular nada solo.
CREATE TABLE IF NOT EXISTS accionistas (
  id           TEXT PRIMARY KEY,
  negocio_id   TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  nombre_norm  TEXT NOT NULL,
  rfc          TEXT,
  correo       TEXT,
  telefono     TEXT,
  porcentaje   REAL,
  notas        TEXT,
  activo       INTEGER NOT NULL DEFAULT 1,
  creado_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS accionistas_negocio ON accionistas(negocio_id);

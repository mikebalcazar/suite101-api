-- 0033: los dos candados del ítem en el cronograma (6-oct-2026).
--
-- Mike: «todos los ítems necesitan cumplir 2 parámetros para que se fije su
-- fecha de inicio (…) anticipo y definición de diseño. Mientras los
-- parámetros no se cumplan la fecha de inicio se sigue recorriendo al día
-- presente». El anticipo se reparte desde dash101 al registrar un pago; la
-- fecha de diseño se marca en la pieza, en quell101.

-- Un pago (ingreso) repartido entre ítems. `proyecto_id` va repetido a
-- propósito: es el del movimiento, lo valida la API, y permite listar los
-- anticipos de un proyecto sin un JOIN desde las apps.
CREATE TABLE IF NOT EXISTS movimiento_items (
  id             TEXT PRIMARY KEY,
  movimiento_id  TEXT NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  proyecto_id    TEXT REFERENCES proyectos(id) ON DELETE SET NULL,
  monto          INTEGER NOT NULL,                 -- centavos
  creado_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS movimiento_items_mov  ON movimiento_items(movimiento_id);
CREATE INDEX IF NOT EXISTS movimiento_items_item ON movimiento_items(item_id);
CREATE INDEX IF NOT EXISTS movimiento_items_proy ON movimiento_items(proyecto_id);

-- La fecha en que quedó definido el diseño de la pieza (AAAA-MM-DD); nula
-- mientras no se defina. Se edita en quell101 y mueve la pieza entera.
ALTER TABLE quell_elements ADD COLUMN diseno_definido TEXT;

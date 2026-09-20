-- 0012 · «se espera factura» vive en el movimiento, no en la orden de compra.
--
-- Encargo de Mike del 20-sep: «En los ingresos hay que registrar si fue
-- facturado, y si sí, agregar/adjuntar la factura, o marcar como pendiente de
-- facturar. Y tener una lista con ingresos pendientes de facturar.»
--
-- Casi todo lo que eso necesita ya existía desde 0009 y sirve para los dos
-- lados: `movimientos.facturado`, el desglose de IVA, la tabla `cfdi` con su
-- `tipo` ingreso|egreso, el IVA trasladado del mes y «lo facturado contra lo
-- real». Faltaba UNA cosa, y es la que hace la lista de pendientes:
--
--   la ESPERA de la factura. Hasta hoy salía de la orden de compra
--   (`ordenes.con_factura`), y un ingreso no tiene orden de compra. Por eso
--   ningún ingreso podía aparecer jamás en «pendientes de facturar»: la
--   consulta empezaba con un JOIN contra `ordenes`.
--
-- Se separan a propósito dos cosas que se confunden:
--   · `requiere_factura` — se espera una. Es una DECISIÓN de quien captura.
--   · `facturado`        — ya llegó. Es un HECHO.
-- Pendiente es la conjunción de las dos, y ninguna escribe a la otra: marcar
-- una factura no borra que se esperaba, y desmarcarla la devuelve a la lista
-- sola, sin reglas escondidas.
ALTER TABLE movimientos ADD COLUMN requiere_factura INTEGER NOT NULL DEFAULT 0;

-- Lo que hoy sale en «pendientes de facturar» tiene que seguir saliendo
-- mañana. Esos son los pagos de una orden de compra marcada «con factura» a
-- los que todavía no les llega: se les pone la espera de forma explícita, y
-- desde ahora la consulta ya no necesita la orden para saberlo.
UPDATE movimientos SET requiere_factura = 1
 WHERE facturado = 0
   AND id IN (SELECT movimiento_id FROM ordenes WHERE con_factura = 1 AND movimiento_id IS NOT NULL);

-- La lista de pendientes se abre seguido y crece con la empresa.
CREATE INDEX IF NOT EXISTS movimientos_por_facturar
  ON movimientos(requiere_factura, facturado, fecha);

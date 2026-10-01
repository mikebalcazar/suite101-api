-- OrgDB v26 — el egreso sabe de qué partida es.
--
-- Mike, 1-oct-2026, en HOLCIM: «me aparece que estos compromisos están
-- pendientes pero son órdenes de compra ya pagadas». Lo pagado de una partida
-- se calculaba buscando egresos del proyecto cuya contraparte fuera EL
-- PROVEEDOR de la partida (por id). Una orden pedida con el proveedor escrito
-- a mano —sin fila en `proveedores`— deja al pagarse una partida sin
-- proveedor_id y un egreso con contraparte «otro»: no cuadran por proveedor y
-- la partida se queda en «pendiente» con $0 aunque la orden ya se pagó.
--
-- La liga buena es la que ya existe: la orden sabe su partida y su
-- movimiento. Aquí el movimiento guarda su partida, y lo pagado de una
-- partida son sus egresos por partida, más —para lo capturado a mano desde
-- siempre— los egresos del proyecto a nombre de su proveedor que no sean de
-- otra partida.
ALTER TABLE movimientos ADD COLUMN partida_id TEXT REFERENCES partidas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS movimientos_partida ON movimientos(partida_id);

-- Lo ya pagado: cada orden pagada le dice a su egreso de qué partida es.
UPDATE movimientos SET partida_id = (
  SELECT o.partida_id FROM ordenes o WHERE o.movimiento_id = movimientos.id AND o.partida_id IS NOT NULL
) WHERE id IN (SELECT movimiento_id FROM ordenes WHERE movimiento_id IS NOT NULL AND partida_id IS NOT NULL);

-- Y las partidas se vuelven a sumar con la regla nueva, para que HOLCIM no
-- tenga que esperar a que alguien escriba en el proyecto.
UPDATE partidas SET monto_pagado = (
  SELECT COALESCE(SUM(m.monto), 0) FROM movimientos m
   WHERE m.tipo = 'egreso' AND m.proyecto_id = partidas.proyecto_id
     AND (m.partida_id = partidas.id
          OR (m.partida_id IS NULL AND partidas.proveedor_id IS NOT NULL
              AND m.contraparte_tipo = 'proveedor' AND m.contraparte_id = partidas.proveedor_id))
);
UPDATE partidas SET estado = CASE
  WHEN monto_acordado > 0 AND monto_pagado >= monto_acordado THEN 'pagado'
  WHEN monto_pagado > 0 THEN 'parcial'
  ELSE 'pendiente' END;

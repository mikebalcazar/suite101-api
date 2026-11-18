-- OrgDB v57 — el estado de cuenta del proyecto, sin IVA (0.107.0).
--
-- Mike, 18-nov-2026, revisando HOLCIM (recado de dash101 en el muro):
--   «En los estados de cuenta de los proyectos, siempre haz las cuentas sin
--   IVA y desglosa por aparte el IVA que se haya pagado o cobrado. O sea los
--   conceptos son antes de IVA y los cobros (facturas) se contabilizan en el
--   estado de cuenta sin IVA. El IVA es sólo para el estado de cuenta de la
--   empresa (Forespot) y los movimientos.»
--
-- `proyectos.cobrado` y `pagado_prov` siguen siendo lo que tocó el banco (con
-- IVA): los necesitan las cuentas y el flujo. Al lado quedan cuatro cachés
-- más, que escribe `recalcularProyecto` y ninguna app:
--   cobrado_sin_iva  Σ subtotal de los ingresos del proyecto
--   iva_cobrado      Σ IVA de esos ingresos
--   pagado_sin_iva   Σ subtotal de los egresos del proyecto
--   iva_pagado       Σ IVA de esos egresos
-- Un movimiento sin desglose (subtotal nulo) cuenta su monto menos el IVA que
-- traiga más lo retenido: sin factura, el subtotal ES el monto (la regla de
-- `desglosar` desde la 0009).
--
-- CORRE EN CÓDIGO (OrgDB.cobradoSinIva): las columnas se agregan sólo si
-- faltan; el llenado de abajo es repetible por sí solo.
ALTER TABLE proyectos ADD COLUMN cobrado_sin_iva INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proyectos ADD COLUMN iva_cobrado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proyectos ADD COLUMN pagado_sin_iva INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proyectos ADD COLUMN iva_pagado INTEGER NOT NULL DEFAULT 0;

UPDATE proyectos SET
  cobrado_sin_iva = (SELECT COALESCE(SUM(COALESCE(m.subtotal, m.monto - COALESCE(m.iva, 0) + COALESCE(m.retenciones, 0))), 0)
                       FROM movimientos m WHERE m.proyecto_id = proyectos.id AND m.tipo = 'ingreso'),
  iva_cobrado     = (SELECT COALESCE(SUM(COALESCE(m.iva, 0)), 0)
                       FROM movimientos m WHERE m.proyecto_id = proyectos.id AND m.tipo = 'ingreso'),
  pagado_sin_iva  = (SELECT COALESCE(SUM(COALESCE(m.subtotal, m.monto - COALESCE(m.iva, 0) + COALESCE(m.retenciones, 0))), 0)
                       FROM movimientos m WHERE m.proyecto_id = proyectos.id AND m.tipo = 'egreso'),
  iva_pagado      = (SELECT COALESCE(SUM(COALESCE(m.iva, 0)), 0)
                       FROM movimientos m WHERE m.proyecto_id = proyectos.id AND m.tipo = 'egreso');

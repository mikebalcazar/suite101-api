-- 0034: el plan de pagos de un proyecto (6-oct-2026).
--
-- Mike escogió con botones cómo fechar los cobros de un proyecto para el
-- flujo proyectado: «Plan de pagos por proyecto». En cada proyecto se
-- capturan parcialidades con fecha y monto (anticipo, avance, entrega). El
-- flujo las pone en su fecha; lo ya cobrado del proyecto se descuenta de las
-- parcialidades en orden de fecha, y sólo lo pendiente entra como cobro.
--
-- No mueve dinero ni toca `cobrado`: es lo que se ESPERA cobrar y cuándo.
CREATE TABLE IF NOT EXISTS plan_pagos (
  id             TEXT PRIMARY KEY,
  proyecto_id    TEXT NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  concepto       TEXT NOT NULL DEFAULT '',
  fecha          TEXT NOT NULL,                 -- AAAA-MM-DD: cuándo se espera el cobro
  monto          INTEGER NOT NULL,              -- centavos
  creado_at      TEXT NOT NULL,
  actualizado_at TEXT
);
CREATE INDEX IF NOT EXISTS plan_pagos_proy ON plan_pagos(proyecto_id, fecha);

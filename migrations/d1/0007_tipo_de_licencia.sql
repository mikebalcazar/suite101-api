-- 0007 · el tipo de licencia y lo perpetuo, que son dos cosas (contrato 0.19.0)
--
-- Decisión de Mike (19-sep-2026, con botones): el TIPO dice de dónde salió la
-- licencia —cortesía, incluida en suite101, Stripe, App Store— y aparte cada
-- licencia vence o no vence. Así una perpetua comprada en la App Store sigue
-- contando como de App Store cuando se filtra, que es justo lo que se perdía
-- si «perpetua» fuera un tipo más.
--
-- Por eso `cortesia` cambia de nombre a `perpetua`: siempre significó «sin
-- fecha de corte», no «regalada». Lo regalado ahora lo dice `tipo`.

ALTER TABLE suscripciones RENAME COLUMN cortesia TO perpetua;
ALTER TABLE suscripciones ADD COLUMN tipo TEXT NOT NULL DEFAULT 'cortesia';

-- Lo que ya existía: sin fecha de corte era una cortesía, y lo que cobraba
-- Stripe se queda como Stripe. Hoy la tabla está vacía en producción, pero la
-- migración tiene que ser correcta también donde no lo esté.
UPDATE suscripciones SET tipo = CASE
  WHEN perpetua = 1  THEN 'cortesia'
  WHEN origen = 'stripe' THEN 'stripe'
  ELSE 'cortesia'
END;

CREATE INDEX IF NOT EXISTS idx_suscripciones_tipo ON suscripciones (tipo, programa);
CREATE INDEX IF NOT EXISTS idx_suscripciones_correo ON suscripciones (correo);

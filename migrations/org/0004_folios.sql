-- 0004_folios.sql · el folio de la cotización lo asigna la suite
--
-- Hasta hoy el folio lo calculaba el navegador de quote101 a partir del monto
-- y la fecha. Eso tiene dos problemas medidos el 16-sep sobre producción:
--
--   · cambia si cambia el monto. Un peso de diferencia y el folio ya es otro,
--     así que el PDF que el cliente tiene en la mano deja de coincidir;
--   · dos cotizaciones del mismo día con el mismo total dan el MISMO folio.
--
-- Desde aquí el folio es un dato, no una fórmula: se asigna una vez, al
-- guardar, y no se vuelve a mover.
--
-- Por qué un contador explícito y no `MAX(folio) + 1`: los 39 folios que
-- traerá la mudanza son números derivados, de 008406 a 874280. Un MAX los
-- tomaría como punto de partida y la cuenta nueva arrancaría en 874281, que es
-- lo contrario de lo que se decidió (consecutivo corrido desde donde va).
CREATE TABLE IF NOT EXISTS folios (
  serie     TEXT PRIMARY KEY,
  siguiente INTEGER NOT NULL
);

-- Arranca en 1, que es lo correcto para una empresa nueva. Para Taller 101 lo
-- mueve la mudanza de la fase 4: trae las 39 con su folio congelado y deja el
-- contador en 40. Si alguien cotizara ANTES de esa mudanza, su folio saldría
-- COT-000001; queda dicho aquí porque es una dependencia de orden, no un
-- descuido.
INSERT OR IGNORE INTO folios (serie, siguiente) VALUES ('COT', 1);

-- La cerradura, igual que la del código de ítem en quell101: en la base, no en
-- una revisión del servidor. Parcial, porque una cotización sin folio todavía
-- no es una cotización repetida y `folio` guarda cadena vacía cuando no hay.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cotizaciones_folio
    ON cotizaciones(folio) WHERE folio IS NOT NULL AND folio <> '';

-- 0036: poblar los costos default de lo que ya estaba (6-oct-2026).
--
-- Mike: «necesito que pobles por mí todos los ítems que tenemos en alcance,
-- que no tengan precio, con los costos predeterminados».
--
-- Lo que hay que hacer necesita el motor de quell101 (las fechas del
-- cronograma, los compromisos que nacen de cada fase), que es asíncrono, y
-- las migraciones corren síncronas. Por eso esta migración sólo deja anotado
-- el PENDIENTE; `correrPendientes` (org-db.ts) lo corre al arrancar la
-- empresa, una sola vez, y anota cuándo y qué hizo.
CREATE TABLE IF NOT EXISTS pendientes_arranque (
  clave      TEXT PRIMARY KEY,
  creado_at  TEXT NOT NULL,
  hecho_at   TEXT,
  resultado  TEXT
);
INSERT OR IGNORE INTO pendientes_arranque (clave, creado_at) VALUES ('poblar_costos_default', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

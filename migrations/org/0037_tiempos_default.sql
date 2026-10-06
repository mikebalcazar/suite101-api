-- 0037: los tiempos default en lo que ya estaba (6-oct-2026).
--
-- Mike: «ponla también todos los ítems que hay ahorita en alcance con los
-- defaults de tiempos»; con botones escogió «sólo donde falten»: lo capturado
-- a mano se queda. Como la 0036, sólo deja el PENDIENTE; `correrPendientes`
-- (org-db.ts) corre `ponerTiemposDefault` (quell/motor.js) una vez al
-- arrancar y anota cuándo y qué hizo.
INSERT OR IGNORE INTO pendientes_arranque (clave, creado_at) VALUES ('tiempos_default', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

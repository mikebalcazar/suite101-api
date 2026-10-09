-- D1 maestro v26 — bill101 (9-oct-2026).
--
-- Mike, 8-oct: «Quiero hacer un módulo para generar y timbrar facturas y
-- también importar y actualizar las facturas recibidas».
--
-- bill101 es una app con licencia por empresa (llave `bill`): una empresa
-- nueva NO nace con ella. Aquí se prende SÓLO en `demo`, que es contra la
-- que se prueba y se toman capturas (decisión D6).
--
-- En `forespot` todavía NO, y es a propósito: a diferencia de cost101 y de
-- patron101, bill101 todavía no tiene pantalla (ésta es su fase A, la API).
-- Prenderla sería enseñarle a la gente de forespot una app que no abre. Se
-- prende cuando exista y Mike lo diga. Mientras tanto dash101 —que forespot
-- sí tiene— entra a las mismas rutas /fiscal.
--
-- A nivel persona no se toca nada, por lo mismo que en la 0024.
UPDATE orgs
   SET apps = json_set(apps, '$.bill', json('true'))
 WHERE id = 'demo';

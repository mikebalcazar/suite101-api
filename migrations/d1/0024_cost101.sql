-- D1 maestro v24 — cost101 se prende donde ya se usa (7-oct-2026).
--
-- cost101 es una app con licencia por empresa (llave `cost`): una empresa
-- nueva NO nace con ella; se prende en master101. Pero las dos que hoy
-- existen para trabajar la tienen que traer desde el primer día: `forespot`,
-- que es la de Mike —quien la pidió para costear sus obras—, y `demo`, que es
-- contra la que se prueba y se toman capturas (decisión D6). Las demás
-- (BASE arquitectura) quedan como están: es una licencia.
--
-- A NIVEL PERSONA no se toca nada. Una lista de apps vacía quiere decir
-- «todas las de la empresa», y ésos ya entran (el dueño de forespot la tiene
-- vacía). Quien tiene una lista escrita la tiene así porque alguien decidió a
-- qué entra —en forespot hay quien sólo abre dash, roster y supply—, y
-- agregarle `cost` desde aquí sería darle los costos de la empresa sin que
-- nadie lo decidiera. Se la da quien administra, en workshop101.
UPDATE orgs
   SET apps = json_set(apps, '$.cost', json('true'))
 WHERE id IN ('forespot', 'demo');

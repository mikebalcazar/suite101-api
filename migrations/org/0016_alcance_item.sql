-- OrgDB v16 — lo que está dentro del alcance, lo que todavía no y lo que ya no.
--
-- POR QUÉ
--
-- Mike, 20-sep-2026: «se debe poder cancelar algún ítem ya sea desde quell o
-- desde dash, y se refleja en los 2. En dash pasa a una partida de ítems
-- cancelados y en quell pasa a categoría para filtrar de ítems cancelados.
-- Hay ítems nuevos no aprobados e ítems cancelados. PARA QUE UN ÍTEM SE
-- CONSIDERE CANCELADO TIENE QUE HABER ESTADO APROBADO PRIMERO y luego
-- cancelado. (…) Los no aprobados serían lo que mencionamos antes como nuevo
-- requerimiento. Y a pesar de que tiene precio y toda la info, NO SUMA en
-- dash y NO APARECE en quell al menos que veas la vista de ítems fuera de
-- alcance.»
--
-- LO QUE NO SE HACE, Y POR QUÉ NO
--
-- Lo primero que uno piensa es agregar un estado nuevo, `requerimiento`, al
-- CHECK de `items.estado`. Dos razones para no hacerlo:
--
--   1. SQLite no cambia un CHECK con ALTER: hay que rehacer la tabla. Y de
--      `items` cuelgan cuatro tablas con llave foránea (`avances`,
--      `movimientos`, `partidas`, `quell_elements`). Rehacerla significa
--      borrarla con sus hijas apuntándole: `quell_elements.item_id` se
--      pondría en NULL —las piezas del plano perderían su ítem— y `avances`
--      ni siquiera lo permitiría. Es mucho riesgo para ganar una palabra.
--
--   2. No hace falta. «No aprobado» ya existe y se llama `cotizado`: tiene
--      precio y toda la información, y NO suma —`precio_venta` suma sólo los
--      vendidos, desde el primer día—. Un requerimiento de obra es un
--      cotizado que nació en el plano en vez de en una cotización, y eso ya
--      lo dice su columna `origen`.
--
-- LO QUE SÍ FALTABA: SABER SI ALGUNA VEZ ESTUVO APROBADO
--
-- Esa es la regla de Mike, y sin esta columna no se puede contestar. Con ella
-- los cuatro casos salen de dos datos que ya existen:
--
--   · dentro del alcance  → estado 'vendido'
--   · no aprobado         → estado 'cotizado'   (el requerimiento)
--   · CANCELADO           → estado 'cancelado' Y `aprobado_at` con fecha
--   · descartado          → estado 'cancelado' Y `aprobado_at` vacío
--
-- El descartado es el requerimiento al que le dijeron que no. No sale en
-- «cancelados» a propósito: nunca estuvo aprobado, y meterlo ahí sería decir
-- que se canceló trabajo que jamás se vendió.
--
-- EL RELLENO DE LO QUE YA EXISTE, dicho como lo que es: una conjetura
--
-- A los `vendido` se les pone `aprobado_at = creado_at`: están aprobados
-- ahora, así que lo estuvieron. A los `cancelado` también, y ahí va la
-- conjetura: no hay manera de saber por qué estado pasaron. Se elige así
-- porque casi todos vienen de quitar un renglón vendido de un proyecto —es
-- lo que hace la pantalla de dash101 al editar— y porque el error de este
-- lado es leve (un descartado viejo aparece como cancelado) mientras que el
-- del otro lado esconde ventas canceladas de verdad.

ALTER TABLE items ADD COLUMN aprobado_at TEXT;
ALTER TABLE items ADD COLUMN cancelado_at TEXT;
ALTER TABLE items ADD COLUMN cancelado_motivo TEXT;

UPDATE items SET aprobado_at = creado_at WHERE estado IN ('vendido', 'cancelado');
UPDATE items SET cancelado_at = COALESCE(actualizado_at, creado_at) WHERE estado = 'cancelado';

CREATE INDEX IF NOT EXISTS items_alcance ON items(proyecto_id, estado, aprobado_at);

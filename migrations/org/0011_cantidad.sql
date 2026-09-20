-- OrgDB v11 — la cantidad del ítem, y qué pieza del plano lo cumple.
--
-- POR QUÉ
--
-- Mike, 20-sep-2026: «falta en los ítems la cantidad. ejemplo, a veces son 20
-- puertas del mismo acabado y precio. El único lugar donde se distinguen una
-- de otra es en quell porque van definidas por ubicación y por código. Pero
-- en los ítems dentro de dash (así como en quote) deben de poder ponerse
-- cantidades. Y cuando se genera un nuevo proyecto con su cantidad de ítems,
-- en quell (si es que no se creó ahí antes) deben de aparecer en una lista de
-- "ítems sin ubicar". Para ir seleccionando y ubicando cada ítem en su lugar.»
--
-- DOS COLUMNAS, Y LO QUE **NO** CAMBIA
--
--   · `items.cantidad`: cuántas piezas iguales son. Por omisión 1, que es lo
--     que vale todo lo que ya existe: nada se mueve.
--
--     `monto` SIGUE SIENDO EL IMPORTE DE LA LÍNEA —lo que se cobra por las
--     20 puertas juntas—, no el precio de una. Se deja así a propósito:
--     `proyectos.precio_venta` es la suma de los `monto` de sus ítems, y
--     cambiarle el significado a esa columna movería el precio de venta de
--     todos los proyectos que ya existen. La pantalla captura cantidad y
--     precio por pieza y multiplica; el precio por pieza se saca dividiendo,
--     que es exacto porque la multiplicación se hizo en centavos enteros.
--
--   · `quell_elements.item_id`: qué ítem vendido cumple esa pieza del plano.
--     De ahí sale la lista de «sin ubicar»: de las 20 puertas del ítem, las
--     que todavía no tienen pieza en ningún plano. Es NULL para todo lo que
--     ya existe y para lo que se dibuje sin venir de una venta —una obra
--     puede tener piezas que nadie cotizó—.
--
--     `ON DELETE SET NULL`: si el ítem se cancela y se borra, la pieza del
--     plano NO se borra. Está dibujada en un plano que alguien usa en obra.

ALTER TABLE items ADD COLUMN cantidad INTEGER NOT NULL DEFAULT 1;

ALTER TABLE quell_elements ADD COLUMN item_id TEXT REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quell_elements_item ON quell_elements(item_id);

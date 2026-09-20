-- OrgDB v10 — la obra de quell101 y el proyecto de dash101 son lo mismo.
--
-- POR QUÉ
--
-- Mike, 20-sep-2026: «cuando creas un nuevo proyecto en quell, se debe
-- agregar a la base de datos general y cuando me meto a dash101, si le pongo
-- en crear un proyecto, deberían aparecer los proyectos creados en quell101
-- que aún no están activados dentro de dash101», y «si ya se crearon de los 2
-- lados, se deberían poder ligar para que el sistema los tome como el mismo
-- proyecto».
--
-- Hasta hoy no había ninguna liga: `quell_projects` (la obra: planos, ítems
-- ubicados, bitácora) y `proyectos` (el proyecto: precio, cobrado, partidas)
-- vivían en la misma base sin saber uno del otro, y la misma casa se
-- capturaba dos veces con dos nombres.
--
-- QUÉ SE HACE
--
-- Una sola columna, del lado de quell101, con dos reglas:
--
--   · `ON DELETE SET NULL`: si el proyecto se borra en dash101, la obra NO se
--     borra. Una obra tiene planos, fotos y bitácora de gente que estuvo ahí;
--     eso no se va por una decisión de contabilidad. Queda suelta, lista para
--     ligarse a otro.
--   · índice ÚNICO parcial: un proyecto no puede estar ligado a dos obras. Si
--     pudiera, «el avance del proyecto» tendría dos respuestas y las dos
--     ciertas, que es el defecto más caro de arreglar después.
--
-- La columna va en `quell_projects` y no en `proyectos` a propósito:
-- `proyectos` sale por el CRUD genérico, y una columna ahí sería una columna
-- que cualquier app con permiso de escribir proyectos podría mover. La liga
-- se pone y se quita por /orgs/:o/obras/*, donde el permiso se revisa.

ALTER TABLE quell_projects ADD COLUMN proyecto_id TEXT REFERENCES proyectos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quell_projects_proyecto ON quell_projects(proyecto_id) WHERE proyecto_id IS NOT NULL;

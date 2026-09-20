-- OrgDB v15 — la partida del ítem y el orden en que se enseña.
--
-- POR QUÉ
--
-- Mike, 20-sep-2026: «quiero también poder ordenar los ítems y agrupar por
-- partidas. Incluso podría ser por pestañas (como folders) para cambiar entre
-- partidas. Esto en dash».
--
-- UN AVISO SOBRE LA PALABRA «PARTIDA», PORQUE YA ESTABA USADA
--
-- En esta base `partidas` es OTRA cosa: lo que se le acordó a cada proveedor
-- de un proyecto (migración 0002), y la pantalla de dash101 lo llama
-- «Partidas de proveedores». Lo que Mike pide aquí es lo que su cotización
-- llama partida: el capítulo bajo el que va cada ítem —Cocina, Recámaras,
-- Baños—, para poder cambiar de uno a otro por pestañas.
--
-- Son dos cosas distintas y las dos se llaman igual en el oficio. Se resuelve
-- así, y queda escrito para que nadie lo vuelva a mezclar:
--
--   · la columna nueva se llama `items.partida`, porque es la palabra que
--     usa quien va a leer la pantalla y la que ya sale impresa en la
--     cotización del cliente;
--   · la tabla `partidas` NO se renombra: la usan el CRUD, los cachés del
--     proyecto y las órdenes de compra, y cambiarle el nombre sería mover
--     medio sistema para ganar claridad en un archivo;
--   · en dash101 el bloque de proveedores pasa a llamarse «Compromisos con
--     proveedores», para que en la pantalla la palabra partida signifique
--     UNA cosa. Ahí es donde la ambigüedad cuesta.
--
-- LAS DOS COLUMNAS
--
--   · `partida`: texto libre, vacío por omisión —todo lo que ya existe queda
--     «sin partida», que es la verdad, y se acomoda cuando alguien quiera—.
--     No es una tabla aparte a propósito: una partida no tiene más datos que
--     su nombre, y una tabla obligaría a darla de alta antes de poder
--     teclearla. Renombrarla es cambiar el nombre en sus ítems, de un golpe,
--     por la misma ruta que los acomoda.
--
--   · `orden`: en qué lugar va el ítem dentro de su partida. Entero, 0 por
--     omisión; con todos en cero manda `creado_at`, que es el orden de hoy.
--     Lo pone quien acomoda, no el sistema: ordenar por precio o por nombre
--     ya se puede en la pantalla, y lo que no se podía es dejarlos en el
--     orden que tiene sentido para el que los va a leer.

ALTER TABLE items ADD COLUMN partida TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN orden INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS items_partida ON items(proyecto_id, partida, orden);

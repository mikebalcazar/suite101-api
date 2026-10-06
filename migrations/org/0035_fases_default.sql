-- 0035: el cronograma que se llena solo, el responsable y el costo de cada
-- fase, y los compromisos que de ahí nacen (6-oct-2026).
--
-- Mike: «cada ítem tiene fecha de entrega default de 6 semanas en sitio y 2
-- semanas de instalación (…) compra de material 10 días, fabricación 4
-- semanas aprox, y de ahí las 2 semanas de instalación. El cronograma se debe
-- llenar en automático con esta info (…) poder agregar responsable (proveedor
-- o contratista) de cada fase. Y en las fases poder agregar el costo de cada
-- fase, así de ahí se pobla la lista de compromisos de gastos en el proyecto
-- para la proyección del flujo».

-- LA FASE TIENE RESPONSABLE Y COSTO. El responsable es un proveedor
-- (`proveedor_id`, ya existía) O un contratista de la obra (`contratista_id`,
-- un usuario de quell101 con rol 'con'). El costo va en centavos; nace de los
-- porcentajes por tipo de ítem y se corrige a mano.
ALTER TABLE quell_tareas ADD COLUMN contratista_id TEXT REFERENCES quell_users(id) ON DELETE SET NULL;
ALTER TABLE quell_tareas ADD COLUMN costo INTEGER NOT NULL DEFAULT 0;

-- UNA PIEZA RECIBE SUS FASES DEFAULT UNA SOLA VEZ: la primera vez que se abre
-- el cronograma sin que las tenga. Después, lo que el usuario quite se queda
-- quitado. Lo que ya tenía fases al llegar esta migración cuenta como dado.
ALTER TABLE quell_elements ADD COLUMN fases_dadas INTEGER NOT NULL DEFAULT 0;
UPDATE quell_elements SET fases_dadas = 1 WHERE id IN (SELECT DISTINCT element_id FROM quell_tareas);

-- EL COMPROMISO QUE NACE DE UNA FASE. Una partida de dash101 puede venir del
-- cronograma: `tarea_id` dice de qué fase, `obra_id` de qué obra (para poder
-- borrar las que ya no tienen fase sin tocar las capturadas a mano), y
-- `fecha_esperada` cuándo se espera pagarla (el material al arrancar la fase;
-- la mano de obra al terminarla), que es lo que el flujo proyectado usa.
ALTER TABLE partidas ADD COLUMN tarea_id TEXT;
ALTER TABLE partidas ADD COLUMN obra_id TEXT;
ALTER TABLE partidas ADD COLUMN fecha_esperada TEXT;
CREATE INDEX IF NOT EXISTS partidas_tarea ON partidas(tarea_id);
CREATE INDEX IF NOT EXISTS partidas_obra ON partidas(obra_id);

-- OrgDB v24 — un ítem puede tener subítems: trabajos o servicios
-- complementarios que se le hacen a un ítem.
--
-- Mike, 30-sep-2026: «Necesito que los ítems puedan tener subítems (siguen
-- siendo ítems adicionales para efectos de administración, pero son trabajos
-- o servicios que se le hacen complementarios a un ítem) y que en quell, a la
-- hora de seleccionar un ítem, ver de alguna forma los subítems creados en
-- ese ítem. Usualmente esto va a suceder en quell (…) deben de nacer como
-- requerimientos nuevos, pero ligados al ítem al que se le aplica».
--
-- Un subítem es un ítem con `padre_id`: para el dinero, la cotización y las
-- etapas es un ítem más; la liga es lo único que cambia. En quell la pieza
-- también lleva `padre_id` (a la pieza padre), para pintarlos juntos sin
-- pasar por `items` (una obra sin proyecto ligado no tiene ítems).
ALTER TABLE items ADD COLUMN padre_id TEXT REFERENCES items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS items_padre ON items(padre_id);
ALTER TABLE quell_elements ADD COLUMN padre_id TEXT REFERENCES quell_elements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS quell_elements_padre ON quell_elements(padre_id);

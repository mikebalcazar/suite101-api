-- 0049: el archivo del diseño definido de la pieza (9-oct-2026).
--
-- Mike: «desde quell quiero poder marcar que el diseño ya está definido y
-- poder adjuntar un plano (pdf) o imagen del diseño definido». Preguntado
-- con botones dónde queda ese archivo, escogió «aparte, sin tocar el
-- principal»: es un archivo de SOPORTE del ítem marcado como el del diseño.
--
-- Uno vivo por pieza: subir otro lo vuelve versión nueva de la misma familia
-- (el anterior se archiva y se consulta en versiones). La fecha sigue en
-- `quell_elements.diseno_definido` (0033), que es el candado del cronograma.
ALTER TABLE quell_element_docs ADD COLUMN diseno INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS quell_element_docs_diseno ON quell_element_docs(element_id) WHERE diseno = 1 AND archivado_at IS NULL;

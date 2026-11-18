-- 0058 · El concepto lleva su PRODUCTO aparte de la descripción (Mike,
-- 18-nov-2026: «Necesito que la lista de conceptos tengan las mismas columnas
-- que las del PDF. Separar el producto de la descripción»).
--
-- Corre en código (OrgDB.conceptoProducto): el ALTER sólo si falta la
-- columna, y luego la separación de lo que ya estaba escrito «producto —
-- descripción» en una sola celda. Lo importado de quote101 se separa allá
-- mismo, con el nombre y la descripción del renglón de la cotización.
ALTER TABLE conceptos ADD COLUMN nombre TEXT NOT NULL DEFAULT '';

UPDATE conceptos
   SET nombre = trim(substr(descripcion, 1, instr(descripcion, ' — ') - 1)),
       descripcion = trim(substr(descripcion, instr(descripcion, ' — ') + 3))
 WHERE nombre = '' AND instr(descripcion, ' — ') > 1;

-- 0059 · La SECCIÓN del concepto (Mike, 19-nov-2026: «agrupar (como colapsar
-- grupos) de renglones (…) en una sección de Cotización 1, y luego
-- subagruparlos por las divisiones que venían de nivel por nivel (N01, N02,
-- N03, etc.)»). Dentro de cada cotización, los conceptos se subagrupan por su
-- sección; '' es sin sección.
--
-- Corre en código (OrgDB.conceptoSeccion): el ALTER sólo si falta la columna.
-- Lo cargado desde la hoja de Mike (cotizacion_id 'carga:…') traía la sección
-- pegada a la descripción, «N01 · MURO BIENVENIDA»: se separa si lo de antes
-- del « · » es corto y va en mayúsculas (E3, MEZZANINE, N01, REPARACIONES).
-- Lo demás no se toca: «Estación de Impresión Mezzanine · sin cargo (…)» no
-- es una sección.
ALTER TABLE conceptos ADD COLUMN seccion TEXT NOT NULL DEFAULT '';

UPDATE conceptos
   SET seccion = substr(descripcion, 1, instr(descripcion, ' · ') - 1),
       descripcion = trim(substr(descripcion, instr(descripcion, ' · ') + 3))
 WHERE seccion = ''
   AND cotizacion_id LIKE 'carga:%'
   AND instr(descripcion, ' · ') BETWEEN 2 AND 16
   AND substr(descripcion, 1, instr(descripcion, ' · ') - 1) = UPPER(substr(descripcion, 1, instr(descripcion, ' · ') - 1))
   AND substr(descripcion, 1, instr(descripcion, ' · ') - 1) NOT LIKE '% %';

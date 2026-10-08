-- D1 maestro v25 — investor101 (8-oct-2026).
--
-- Mike, 8-oct: «una plataforma para inversionistas o personas que hacen
-- préstamos/créditos a taller101 (…) abrirles una cuenta de inversionista».
--
-- 1. LA LICENCIA. investor101 es una app con licencia por empresa (llave
--    `investor`): una empresa nueva NO nace con ella. Se prende en las dos
--    que hoy existen para trabajar: `forespot` —la de Mike, que la pidió— y
--    `demo`, contra la que se prueba (decisión D6). A nivel persona no se
--    toca nada, por lo mismo que en la 0024: una lista escrita es una
--    decisión de alguien.
UPDATE orgs
   SET apps = json_set(apps, '$.investor', json('true'))
 WHERE id IN ('forespot', 'demo');

-- 2. EL PERMISO DEL INVERSIONISTA. No va en `accesos`, y es a propósito:
--    · `accesos` tiene UNA fila por usuario (su llave es `usuario_id`): quien
--      ya es cliente de peek101 o personal de obra no podría, además,
--      prestarle a la empresa. Y un inversionista sí puede ser cliente.
--    · su `tipo` trae un CHECK ('cliente','personal'): agregarle un valor es
--      reconstruir la tabla entera.
--    · quien presta puede prestarle a más de una empresa de la suite.
--    Aquí la llave es la pareja persona-empresa. `ref_id` es su fila en
--    `inversionistas`, dentro del Durable Object de esa empresa.
CREATE TABLE IF NOT EXISTS accesos_inversion (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  org_id     TEXT NOT NULL REFERENCES orgs(id),
  ref_id     TEXT NOT NULL,
  activo     INTEGER NOT NULL DEFAULT 1,
  creado_at  TEXT NOT NULL,
  PRIMARY KEY (usuario_id, org_id)
);
CREATE INDEX IF NOT EXISTS accesos_inversion_org ON accesos_inversion(org_id, ref_id);

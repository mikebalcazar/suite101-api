/* LA EMPRESA ES UNA (0.61.0).
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios en dash. Sólo es una
 * empresa/negocio todo. Elimina todas las lógicas que involucran el concepto
 * de "negocio"». Hasta que la tabla `negocios` se vaya de la base (fase D),
 * todo sigue colgado de un `negocio_id`; lo que cambia desde aquí es que ya
 * NADIE lo manda: cualquier ruta que lo necesite lo resuelve con esto. Es el
 * primero por nombre —el mismo que devuelve `GET /negocios` y el mismo que
 * toma dash101— y si la empresa no tiene ninguno, se crea con su nombre. */
import type { ApiOrgDB } from './org-db';
import type { Ctx } from './http';
import { org } from './maestro';

export async function negocioDeLaEmpresa(c: Ctx): Promise<string> {
  const stub = c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
  const empresa = await org(c.env, c.get('org_id'));
  return String((await stub.negocioDeLaEmpresa(empresa?.nombre ?? c.get('org_id'))).id);
}

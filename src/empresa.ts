/* LA EMPRESA ES UNA (0.61.0; tabla `empresa` desde 0.63.0).
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios en dash. Sólo es una
 * empresa/negocio todo. Elimina todas las lógicas que involucran el concepto
 * de "negocio"». Desde la migración 0027 no hay tabla `negocios` ni columna
 * `negocio_id`: lo que describía al negocio —nombre, RFC, moneda, día de
 * conciliación— vive en `empresa`, un solo renglón con id 'empresa'. Esto es
 * la puerta para las rutas: el renglón, creado con el nombre de la org del D1
 * la primera vez que alguien lo pide. */
import type { ApiOrgDB } from './org-db';
import type { Ctx } from './http';
import { org } from './maestro';

export async function empresaDe(c: Ctx): Promise<Record<string, unknown>> {
  const stub = c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
  const enD1 = await org(c.env, c.get('org_id'));
  return stub.empresa(enD1?.nombre ?? c.get('org_id'));
}

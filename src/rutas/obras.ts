/* /orgs/:o/obras/* — la obra de quell101 y el proyecto de dash101, ligados.
 *
 * ENCARGO (Mike, 20-sep-2026)
 *
 *   «cuando creas un nuevo proyecto en quell, se debe agregar a la base de
 *   datos general y cuando me meto a dash101, si le pongo en crear un
 *   proyecto, deberían aparecer los proyectos creados en quell101 que aún no
 *   están activados dentro de dash101.»
 *
 *   «y si ya se crearon de los 2 lados, se deberían poder ligar para que el
 *   sistema los tome como el mismo proyecto.»
 *
 * QUÉ ES CADA COSA
 *
 * Una OBRA (quell101) es la casa: planos, ítems ubicados en el plano, fotos,
 * bitácora, quién anduvo ahí. Un PROYECTO (dash101) es el dinero de esa casa:
 * precio de venta, cobrado, partidas con proveedores. Desde el 19-sep los dos
 * viven en la misma base de la empresa; lo que faltaba era decir que son la
 * misma casa. Eso es `quell_projects.proyecto_id` (migración 0010) y estas
 * cuatro rutas.
 *
 * No se fusionan en una sola tabla, y es a propósito: una obra puede existir
 * sin que nadie le haya puesto precio todavía —se abre el plano el día que
 * llega el levantamiento—, y un proyecto puede existir sin obra —un mueble
 * suelto no lleva plano—. Lo que no puede pasar es que la misma casa esté dos
 * veces y cada app crea una verdad distinta.
 *
 * Se montan sobre el mismo enrutador de `/orgs`, después de sus puertas y
 * ANTES del CRUD genérico: si fueran después, `/:o/:tabla` se tragaría
 * `/:o/obras` como si `obras` fuera una tabla.
 */

import type { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;

export function montarObras(rutas: App): void {
  /** Las obras las ve quien es de la empresa. Un cliente del portal no: él ve
   *  su plano por la cara de cliente de quell101, que recorta lo que enseña
   *  renglón por renglón; esta lista no recorta nada. */
  const esDeLaCasa = (c: Ctx) => c.get('quien').clase === 'miembro';

  /** Ligar y desligar cambia de qué proyecto cuelga una obra entera. Lo hace
   *  quien manda en la empresa, no cualquiera con la app abierta. */
  const puedeLigar = (c: Ctx) => {
    const q = c.get('quien');
    return q.clase === 'miembro' && (q.rol === 'owner' || q.rol === 'admin' || q.rol === 'socio');
  };

  /** GET /orgs/:o/obras[?sueltas=1] — todas, o sólo las que no tienen
   *  proyecto. `sueltas=1` es lo que pide dash101 en «nuevo proyecto»: las
   *  obras que ya existen en quell101 y todavía no están activadas del lado
   *  del dinero. */
  rutas.get('/:o/obras', async (c) => {
    if (!esDeLaCasa(c)) return err(c, 'sin_permiso', 403, { motivo: 'las obras son de la empresa' });
    const sueltas = c.req.query('sueltas') === '1';
    return ok(c, { obras: await stub(c).obras({ sueltas }) });
  });

  /** GET /orgs/:o/obras/de-proyecto/:id — la obra de ese proyecto, o `null`.
   *  Va antes de `/:id` o «de-proyecto» se leería como el id de una obra. */
  rutas.get('/:o/obras/de-proyecto/:id', async (c) => {
    if (!esDeLaCasa(c)) return err(c, 'sin_permiso', 403, { motivo: 'las obras son de la empresa' });
    return ok(c, { obra: await stub(c).obraDeProyecto(c.req.param('id')) });
  });

  /** POST /orgs/:o/obras/:id/ligar {proyecto_id} — son la misma casa. */
  rutas.post('/:o/obras/:id/ligar', async (c) => {
    if (!puedeLigar(c)) return err(c, 'sin_permiso', 403, { motivo: 'ligar una obra con un proyecto lo hace quien dirige la empresa' });
    const b = await c.req.json<{ proyecto_id?: string }>().catch(() => ({}) as { proyecto_id?: string });
    if (!b.proyecto_id) return err(c, 'datos_invalidos', 400, { falta: 'proyecto_id' });
    const r = await stub(c).ligarObra(c.req.param('id'), b.proyecto_id);
    if ('error' in r) return err(c, r.error, r.error === 'no_encontrado' ? 404 : 409, r.detalle);
    return ok(c, { obra: r.obra });
  });

  /** DELETE /orgs/:o/obras/:id/ligar — se equivocaron de proyecto. No borra
   *  ni la obra ni el proyecto: los deja sueltos. */
  rutas.delete('/:o/obras/:id/ligar', async (c) => {
    if (!puedeLigar(c)) return err(c, 'sin_permiso', 403, { motivo: 'ligar una obra con un proyecto lo hace quien dirige la empresa' });
    const r = await stub(c).desligarObra(c.req.param('id'));
    if ('error' in r) return err(c, r.error, 404, r.detalle);
    return ok(c, { obra: r.obra });
  });
}

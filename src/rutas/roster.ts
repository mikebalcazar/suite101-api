/* /roster/:o/* — la puerta de roster101 (contrato 0.17.0).
 *
 * roster101 tiene dos puertas a propósito (Mike, 16-sep): el trabajador
 * entra con su correo y un código de seis dígitos, SIN cuenta en la suite; la
 * administración de la empresa entra con su cuenta de la suite. Por eso esto
 * no cuelga de /orgs/:o/*, que exige sesión para todo: aquí la sesión de la
 * suite es opcional. Lo que no es opcional es lo demás: X-App roster101, la
 * empresa activa y vigente, roster101 prendido para ella.
 *
 * Si viene sesión de la suite y la persona es miembro de ESTA empresa con
 * roster101 entre sus apps (lista vacía = todas), o es el dueño de la suite,
 * se le pasa al motor como `x-sesion`; el motor decide de qué nivel es en el
 * panel (src/roster/motor.js, `sesionAdminViva`). Si no le toca, al motor no
 * le llega sesión y el panel contesta 401, que es lo que contestaba el Worker
 * cuando /yo decía que no.
 *
 * Los datos de la empresa (nombre, razón social, domicilio, correos, versión
 * del aviso) los manda el Worker de la empresa en `X-Roster` (JSON): siguen
 * viviendo en su wrangler.toml. Un Worker por empresa, como hoy.
 *
 * Los archivos (documentos del expediente) los sirve el propio motor, dentro
 * del objeto, porque quién puede verlos lo dice la base (el dueño del
 * documento o el panel), no la dirección. */

import { Hono } from 'hono';
import { miembro, org, usuarioPorId } from '../maestro';
import { err, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

rutas.all('/:o/*', async (c: Ctx) => {
  const nombreApp = c.req.header('X-App');
  if (nombreApp !== 'roster101') return err(c, 'sin_app', 400, { manda: 'X-App: roster101' });

  const org_id = c.req.param('o')!;
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404, { org: org_id });
  if (!empresa.activa) return err(c, 'org_inactiva', 403);
  if (!empresa.vigente) {
    return err(c, 'org_sin_pago', 402, { paga_hasta: empresa.paga_hasta, mensaje: 'La suscripción de la empresa venció. Avísale a quien la administra.' });
  }
  if (empresa.apps.roster !== true) {
    return err(c, 'app_inactiva', 403, { app: 'roster101', activas: Object.entries(empresa.apps).filter(([, v]) => v).map(([k]) => k) });
  }

  // La sesión de la suite, si viene y le toca en esta empresa.
  let sesionRoster: { correo: string; nombre: string | null; superadmin: boolean; quien: { clase: 'miembro'; rol?: string; usuario_id: string } } | null = null;
  const s = c.get('sesion');
  if (s) {
    const m = await miembro(c.env, org_id, s.usuario_id);
    let quien: { clase: 'miembro'; rol?: string; usuario_id: string } | null = null;
    if (m) {
      if (m.apps.length === 0 || m.apps.includes('roster')) quien = { clase: 'miembro', rol: m.rol, usuario_id: s.usuario_id };
    } else if (s.superadmin) {
      quien = { clase: 'miembro', rol: 'owner', usuario_id: s.usuario_id };
    }
    if (quien) {
      const u = await usuarioPorId(c.env, s.usuario_id);
      sesionRoster = { correo: s.correo, nombre: u?.nombre ?? null, superadmin: s.superadmin, quien };
    }
  }

  const entrada = new URL(c.req.url);
  const resto = entrada.pathname.replace(/^\/roster\/[^/]+/, '') || '/';
  const interna = new URL(`https://roster.local/roster${resto}${entrada.search}`);

  const cabeceras = new Headers();
  for (const nombre of ['content-type', 'content-length', 'cookie']) {
    const v = c.req.header(nombre);
    if (v) cabeceras.set(nombre, v);
  }
  cabeceras.set('x-org', org_id);
  // Codificadas: una cabecera sólo lleva ASCII, y «Dueña» o «Razón Social»
  // la rompen en el navegador y sacan un aviso en workerd. El objeto decodifica.
  // `X-Roster` llega del Worker de la empresa ya codificada (encodeURIComponent
  // del JSON) y se pasa tal cual; si llegara sin codificar, el objeto la lee igual.
  cabeceras.set('x-empresa', encodeURIComponent(empresa.nombre));
  cabeceras.set('x-roster', c.req.header('X-Roster') || '{}');
  if (sesionRoster) cabeceras.set('x-sesion', encodeURIComponent(JSON.stringify(sesionRoster)));

  // El cuerpo se lee entero antes de pasarlo (ver la puerta de quell101).
  const cuerpo = c.req.method === 'GET' || c.req.method === 'HEAD' ? null : await c.req.raw.arrayBuffer();
  const peticion = new Request(interna.toString(), { method: c.req.method, headers: cabeceras, body: cuerpo });
  return c.env.ORG.get(c.env.ORG.idFromName(org_id)).fetch(peticion);
});

export default rutas;

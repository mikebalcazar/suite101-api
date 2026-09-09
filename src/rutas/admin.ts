/* /admin — master101 (alta de empresas, plan, apps) y, para los miembros, el
 * alta de gente en su propia empresa.
 *
 * El Durable Object de una empresa nace la primera vez que alguien le habla.
 * Aquí se le habla en cuanto se crea la org, para que quede creado y migrado
 * antes de que llegue la primera app: así el primer usuario no paga el arranque
 * en frío ni se encuentra con una base a medias.
 */

import { Hono } from 'hono';
import { crearOrg, crearUsuario, esSuperadmin, miembro, miembrosDe, org, orgs, ponerMiembro, quitarMiembro } from '../maestro';
import { normalizaCorreo } from '../lib';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { Rol } from '../../schema/tipos';
import type { ApiOrgDB } from '../org-db';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

const ROLES: Rol[] = ['owner', 'admin', 'socio', 'staff'];

rutas.use('/*', async (c, next) => {
  if (!c.get('sesion')) return err(c, 'sin_sesion', 401);
  await next();
});

async function soySuper(c: Ctx): Promise<boolean> {
  const s = c.get('sesion');
  return !!s && (s.superadmin || (await esSuperadmin(c.env, s.usuario_id)));
}

/* ─────────────── empresas ─────────────── */

rutas.get('/orgs', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  return ok(c, { total: (await orgs(c.env)).length, filas: await orgs(c.env) });
});

rutas.post('/orgs', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const cuerpo = await c.req.json<{ id?: string; nombre?: string; plan?: string; apps?: Record<string, boolean>; moneda?: string }>().catch(() => ({}) as never);
  const id = String(cuerpo.id || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return err(c, 'datos_invalidos', 400, { id: 'slug de a-z, 0-9 y guiones' });
  if (!cuerpo.nombre) return err(c, 'datos_invalidos', 400, { falta: 'nombre' });
  if (await org(c.env, id)) return err(c, 'datos_invalidos', 409, { id: 'ya existe' });

  const nueva = await crearOrg(c.env, { id, nombre: cuerpo.nombre, plan: cuerpo.plan, apps: cuerpo.apps, moneda: cuerpo.moneda });

  // Se le habla al DO para que nazca y se migre aquí y no en la primera visita.
  const version = await (c.env.ORG.get(c.env.ORG.idFromName(id)) as unknown as ApiOrgDB).version();

  return ok(c, { org: nueva, org_db_version: version }, 201);
});

rutas.patch('/orgs/:o', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const id = c.req.param('o')!;
  if (!(await org(c.env, id))) return err(c, 'org_desconocida', 404);
  const cuerpo = await c.req.json<{ plan?: string; apps?: Record<string, boolean>; nombre?: string; activa?: boolean }>().catch(() => ({}) as never);

  const sets: string[] = [];
  const args: unknown[] = [];
  if (cuerpo.nombre !== undefined) { sets.push('nombre = ?'); args.push(cuerpo.nombre); }
  if (cuerpo.plan !== undefined) { sets.push('plan = ?'); args.push(cuerpo.plan); }
  if (cuerpo.apps !== undefined) { sets.push('apps = ?'); args.push(JSON.stringify(cuerpo.apps)); }
  if (cuerpo.activa !== undefined) { sets.push('activa = ?'); args.push(cuerpo.activa ? 1 : 0); }
  if (!sets.length) return err(c, 'datos_invalidos', 400, { falta: 'algo que cambiar' });

  await c.env.MASTER.prepare(`UPDATE orgs SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  return ok(c, await org(c.env, id));
});

/* ─────────────── miembros ─────────────── */

async function mandaEnLaOrg(c: Ctx, org_id: string): Promise<boolean> {
  if (await soySuper(c)) return true;
  const m = await miembro(c.env, org_id, c.get('sesion').usuario_id);
  return !!m && (m.rol === 'owner' || m.rol === 'admin');
}

rutas.get('/orgs/:o/miembros', async (c) => {
  const org_id = c.req.param('o')!;
  if (!(await mandaEnLaOrg(c, org_id))) return err(c, 'sin_permiso', 403);
  const filas = await miembrosDe(c.env, org_id);
  return ok(c, { total: filas.length, filas });
});

rutas.post('/orgs/:o/miembros', async (c) => {
  const org_id = c.req.param('o')!;
  if (!(await mandaEnLaOrg(c, org_id))) return err(c, 'sin_permiso', 403);
  if (!(await org(c.env, org_id))) return err(c, 'org_desconocida', 404);

  const cuerpo = await c.req.json<{ correo?: string; rol?: Rol; apps?: string[]; negocios?: string[]; nombre?: string }>().catch(() => ({}) as never);
  const correo = normalizaCorreo(cuerpo.correo);
  if (!correo) return err(c, 'datos_invalidos', 400, { falta: 'correo' });
  if (!cuerpo.rol || !ROLES.includes(cuerpo.rol)) return err(c, 'datos_invalidos', 400, { rol: ROLES });

  const usuario = await crearUsuario(c.env, correo, cuerpo.nombre ?? null);
  await ponerMiembro(c.env, org_id, usuario.id, cuerpo.rol, cuerpo.apps ?? [], cuerpo.negocios ?? []);
  return ok(c, { usuario_id: usuario.id, correo, rol: cuerpo.rol }, 201);
});

rutas.delete('/orgs/:o/miembros/:uid', async (c) => {
  const org_id = c.req.param('o')!;
  if (!(await mandaEnLaOrg(c, org_id))) return err(c, 'sin_permiso', 403);
  await quitarMiembro(c.env, org_id, c.req.param('uid')!);
  return ok(c, { quitado: true });
});

export default rutas;

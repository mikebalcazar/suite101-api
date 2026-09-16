/* /admin — master101 (alta de empresas, plan, apps, superadmins) y, para los
 * miembros, el alta de gente en su propia empresa.
 *
 * El Durable Object de una empresa nace la primera vez que alguien le habla.
 * Aquí se le habla en cuanto se crea la org, para que quede creado y migrado
 * antes de que llegue la primera app: así el primer usuario no paga el arranque
 * en frío ni se encuentra con una base a medias.
 *
 * Desde el contrato 0.5.0 todo lo que cambia el directorio deja renglón en
 * `bitacora_admin` (quién, empresa, campo, antes, después): lo escribe esta
 * capa, sola, y nadie desde fuera.
 */

import { Hono } from 'hono';
import {
  apuntaAdmin, bitacoraAdmin, borrarOrg, conConteos, conteosDeOrgs, crearOrg, crearUsuario, cuentaOwners, esSuperadmin,
  miembro, miembrosDe, org, orgs, ponerMiembro, ponerSuperadmin, quitarMiembro, quitarSuperadmin,
  superadmins, ultimasEntradasDe, usuarioPorId,
} from '../maestro';
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

/** ¿Es superadmin quien pregunta? Lo usa /admin y también la puerta de
 *  servicio de la importación, que no puede tener su propia idea de esto. */
export async function soySuper(c: Ctx): Promise<boolean> {
  const s = c.get('sesion');
  return !!s && (s.superadmin || (await esSuperadmin(c.env, s.usuario_id)));
}

const quien = (c: Ctx) => c.get('sesion').correo;

/* ─────────────── empresas ─────────────── */

rutas.get('/orgs', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const [lista, conteos] = await Promise.all([orgs(c.env), conteosDeOrgs(c.env)]);
  return ok(c, { total: lista.length, filas: lista.map((o) => conConteos(o, conteos)) });
});

rutas.get('/orgs/:o', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const o = await org(c.env, c.req.param('o')!);
  if (!o) return err(c, 'org_desconocida', 404);
  return ok(c, conConteos(o, await conteosDeOrgs(c.env)));
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

  await apuntaAdmin(c.env, { quien: quien(c), org_id: id, campo: 'creada', despues: `${nueva.nombre} · ${Object.entries(nueva.apps).filter(([, v]) => v).map(([k]) => k).join(', ') || 'sin apps'}` });
  return ok(c, { org: nueva, org_db_version: version }, 201);
});

/* Reiniciar una empresa: vacía su Durable Object y quita sus filas del D1.
 * Existe para volver a sembrar la org `demo` de staging desde cero. En
 * producción no existe: contesta 403 antes de mirar nada, para que `forespot`
 * no se pueda tocar con esto ni por error. Los usuarios del D1 se quedan. */
rutas.delete('/orgs/:o', async (c) => {
  if (c.env.ENTORNO === 'produccion') return err(c, 'sin_permiso', 403, { motivo: 'en producción una empresa no se reinicia' });
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const id = c.req.param('o')!;
  if (!(await org(c.env, id))) return err(c, 'org_desconocida', 404);
  const version = await (c.env.ORG.get(c.env.ORG.idFromName(id)) as unknown as ApiOrgDB).vaciar();
  await borrarOrg(c.env, id);
  return ok(c, { reiniciada: id, org_db_version: version });
});

rutas.patch('/orgs/:o', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const id = c.req.param('o')!;
  const antes = await org(c.env, id);
  if (!antes) return err(c, 'org_desconocida', 404);
  const cuerpo = await c.req.json<{ plan?: string; apps?: Record<string, boolean>; nombre?: string; activa?: boolean }>().catch(() => ({}) as never);

  const sets: string[] = [];
  const args: unknown[] = [];
  if (cuerpo.nombre !== undefined) { sets.push('nombre = ?'); args.push(cuerpo.nombre); }
  if (cuerpo.plan !== undefined) { sets.push('plan = ?'); args.push(cuerpo.plan); }
  if (cuerpo.apps !== undefined) { sets.push('apps = ?'); args.push(JSON.stringify(cuerpo.apps)); }
  if (cuerpo.activa !== undefined) { sets.push('activa = ?'); args.push(cuerpo.activa ? 1 : 0); }
  if (!sets.length) return err(c, 'datos_invalidos', 400, { falta: 'algo que cambiar' });

  await c.env.MASTER.prepare(`UPDATE orgs SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  const despues = (await org(c.env, id))!;

  // Un renglón por campo que de verdad cambió; `apps` se desglosa por app.
  const yo = quien(c);
  if (antes.nombre !== despues.nombre) await apuntaAdmin(c.env, { quien: yo, org_id: id, campo: 'nombre', antes: antes.nombre, despues: despues.nombre });
  if (antes.plan !== despues.plan) await apuntaAdmin(c.env, { quien: yo, org_id: id, campo: 'plan', antes: antes.plan, despues: despues.plan });
  if (antes.activa !== despues.activa) await apuntaAdmin(c.env, { quien: yo, org_id: id, campo: 'activa', antes: String(antes.activa), despues: String(despues.activa) });
  for (const k of new Set([...Object.keys(antes.apps), ...Object.keys(despues.apps)])) {
    const a = antes.apps[k] === true, d = despues.apps[k] === true;
    if (a !== d) await apuntaAdmin(c.env, { quien: yo, org_id: id, campo: `apps.${k}`, antes: String(a), despues: String(d) });
  }

  return ok(c, conConteos(despues, await conteosDeOrgs(c.env)));
});

/* ─────────────── la bitácora del panel ─────────────── */

rutas.get('/bitacora', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const filas = await bitacoraAdmin(c.env, null);
  return ok(c, { total: filas.length, filas });
});

rutas.get('/orgs/:o/bitacora', async (c) => {
  const id = c.req.param('o')!;
  // Contrato 0.6.0: la bitácora de SU empresa también la lee quien la administra.
  if (!(await mandaEnLaOrg(c, id))) return err(c, 'sin_permiso', 403);
  if (!(await org(c.env, id))) return err(c, 'org_desconocida', 404);
  const filas = await bitacoraAdmin(c.env, id);
  return ok(c, { total: filas.length, filas });
});

/* ─────────────── miembros ───────────────
 * Quién puede tocar la gente de una empresa: el superadmin (master101) y, desde
 * el contrato 0.6.0 con candados, el dueño y la administración de esa empresa
 * (workshop101). Los candados, en una lista, porque son lo que hay que probar:
 *
 *   · nadie se toca a sí mismo (ni rol, ni apps, ni baja): `a_ti_mismo`;
 *   · sólo un dueño (o el superadmin) nombra, cambia o baja a un dueño;
 *   · el último dueño no se baja ni se degrada: `ultimo_owner`;
 *   · `apps` sólo trae llaves que la empresa tenga (dash, quell, peek…);
 *     la lista vacía sigue queriendo decir «todas las de la empresa».
 */

type Mando = 'super' | Rol | null;

async function mandoEnLaOrg(c: Ctx, org_id: string): Promise<Mando> {
  if (await soySuper(c)) return 'super';
  const m = await miembro(c.env, org_id, c.get('sesion').usuario_id);
  return m ? m.rol : null;
}

const administra = (m: Mando) => m === 'super' || m === 'owner' || m === 'admin';
const nombraDuenos = (m: Mando) => m === 'super' || m === 'owner';

async function mandaEnLaOrg(c: Ctx, org_id: string): Promise<boolean> {
  return administra(await mandoEnLaOrg(c, org_id));
}

/** `apps` de un miembro: llaves de `orgs.apps`, sin repetir. Devuelve la lista
 *  limpia o el detalle del error. */
function appsLimpias(apps: unknown, empresa: { apps: Record<string, boolean> }): { ok: true; apps: string[] } | { ok: false; detalle: Record<string, unknown> } {
  if (apps === undefined) return { ok: true, apps: [] };
  if (!Array.isArray(apps) || apps.some((a) => typeof a !== 'string')) return { ok: false, detalle: { apps: 'lista de llaves de app' } };
  const validas = Object.keys(empresa.apps);
  const raras = apps.filter((a) => !validas.includes(a));
  if (raras.length) return { ok: false, detalle: { apps_desconocidas: raras, validas } };
  return { ok: true, apps: [...new Set(apps as string[])] };
}

rutas.get('/orgs/:o/miembros', async (c) => {
  const org_id = c.req.param('o')!;
  if (!(await mandaEnLaOrg(c, org_id))) return err(c, 'sin_permiso', 403);
  const [filas, entradas] = await Promise.all([miembrosDe(c.env, org_id), ultimasEntradasDe(c.env, org_id)]);
  return ok(c, { total: filas.length, filas: filas.map((f) => ({ ...f, ultima_entrada: entradas.get(f.usuario_id) ?? null })) });
});

rutas.post('/orgs/:o/miembros', async (c) => {
  const org_id = c.req.param('o')!;
  const mando = await mandoEnLaOrg(c, org_id);
  if (!administra(mando)) return err(c, 'sin_permiso', 403);
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404);

  const cuerpo = await c.req.json<{ correo?: string; rol?: Rol; apps?: string[]; negocios?: string[]; nombre?: string }>().catch(() => ({}) as never);
  const correo = normalizaCorreo(cuerpo.correo);
  if (!correo) return err(c, 'datos_invalidos', 400, { falta: 'correo' });
  if (!cuerpo.rol || !ROLES.includes(cuerpo.rol)) return err(c, 'datos_invalidos', 400, { rol: ROLES });
  if (correo === normalizaCorreo(quien(c))) return err(c, 'sin_permiso', 403, { motivo: 'a_ti_mismo' });
  if (cuerpo.rol === 'owner' && !nombraDuenos(mando)) return err(c, 'sin_permiso', 403, { motivo: 'solo_un_dueno_nombra_duenos' });
  const apps = appsLimpias(cuerpo.apps, empresa);
  if (!apps.ok) return err(c, 'datos_invalidos', 400, apps.detalle);

  const usuario = await crearUsuario(c.env, correo, cuerpo.nombre ?? null);
  const previo = await miembro(c.env, org_id, usuario.id);
  if (previo?.rol === 'owner' && !nombraDuenos(mando)) return err(c, 'sin_permiso', 403, { motivo: 'solo_un_dueno_toca_duenos' });
  if (previo?.rol === 'owner' && cuerpo.rol !== 'owner' && (await cuentaOwners(c.env, org_id)) <= 1) return err(c, 'ultimo_owner', 409);

  await ponerMiembro(c.env, org_id, usuario.id, cuerpo.rol, apps.apps, cuerpo.negocios ?? previo?.negocios ?? []);
  await apuntaAdmin(c.env, { quien: quien(c), org_id, campo: 'miembro', antes: previo ? `${correo} (${previo.rol})` : null, despues: `${correo} (${cuerpo.rol})` });
  return ok(c, { usuario_id: usuario.id, correo, rol: cuerpo.rol, apps: apps.apps }, previo ? 200 : 201);
});

rutas.patch('/orgs/:o/miembros/:uid', async (c) => {
  const org_id = c.req.param('o')!;
  const uid = c.req.param('uid')!;
  const mando = await mandoEnLaOrg(c, org_id);
  if (!administra(mando)) return err(c, 'sin_permiso', 403);
  const empresa = await org(c.env, org_id);
  if (!empresa) return err(c, 'org_desconocida', 404);
  const previo = await miembro(c.env, org_id, uid);
  if (!previo) return err(c, 'no_encontrado', 404, { miembro: uid });
  if (uid === c.get('sesion').usuario_id) return err(c, 'sin_permiso', 403, { motivo: 'a_ti_mismo' });

  const cuerpo = await c.req.json<{ rol?: Rol; apps?: string[] }>().catch(() => ({}) as never);
  if (cuerpo.rol === undefined && cuerpo.apps === undefined) return err(c, 'datos_invalidos', 400, { falta: 'rol o apps' });
  if (cuerpo.rol !== undefined && !ROLES.includes(cuerpo.rol)) return err(c, 'datos_invalidos', 400, { rol: ROLES });
  const rol = cuerpo.rol ?? previo.rol;
  if ((previo.rol === 'owner' || rol === 'owner') && !nombraDuenos(mando)) return err(c, 'sin_permiso', 403, { motivo: 'solo_un_dueno_toca_duenos' });
  if (previo.rol === 'owner' && rol !== 'owner' && (await cuentaOwners(c.env, org_id)) <= 1) return err(c, 'ultimo_owner', 409);
  const apps = cuerpo.apps === undefined ? { ok: true as const, apps: previo.apps } : appsLimpias(cuerpo.apps, empresa);
  if (!apps.ok) return err(c, 'datos_invalidos', 400, apps.detalle);

  await ponerMiembro(c.env, org_id, uid, rol, apps.apps, previo.negocios);
  const u = await usuarioPorId(c.env, uid);
  const yo = quien(c);
  if (rol !== previo.rol) await apuntaAdmin(c.env, { quien: yo, org_id, campo: 'miembro.rol', antes: `${u?.correo ?? uid} (${previo.rol})`, despues: `${u?.correo ?? uid} (${rol})` });
  if (JSON.stringify(apps.apps) !== JSON.stringify(previo.apps)) {
    const dicho = (l: string[]) => (l.length ? l.join(', ') : 'todas');
    await apuntaAdmin(c.env, { quien: yo, org_id, campo: 'miembro.apps', antes: `${u?.correo ?? uid}: ${dicho(previo.apps)}`, despues: `${u?.correo ?? uid}: ${dicho(apps.apps)}` });
  }
  return ok(c, { usuario_id: uid, correo: u?.correo ?? null, rol, apps: apps.apps });
});

rutas.delete('/orgs/:o/miembros/:uid', async (c) => {
  const org_id = c.req.param('o')!;
  const uid = c.req.param('uid')!;
  const mando = await mandoEnLaOrg(c, org_id);
  if (!administra(mando)) return err(c, 'sin_permiso', 403);
  const previo = await miembro(c.env, org_id, uid);
  if (!previo) return err(c, 'no_encontrado', 404, { miembro: uid });
  if (uid === c.get('sesion').usuario_id) return err(c, 'sin_permiso', 403, { motivo: 'a_ti_mismo' });
  if (previo.rol === 'owner' && !nombraDuenos(mando)) return err(c, 'sin_permiso', 403, { motivo: 'solo_un_dueno_toca_duenos' });
  if (previo.rol === 'owner' && (await cuentaOwners(c.env, org_id)) <= 1) return err(c, 'ultimo_owner', 409);

  await quitarMiembro(c.env, org_id, uid);
  const u = await usuarioPorId(c.env, uid);
  await apuntaAdmin(c.env, { quien: quien(c), org_id, campo: 'miembro', antes: `${u?.correo ?? uid} (${previo.rol})`, despues: null });
  return ok(c, { quitado: true });
});

/* ─────────────── superadmins (contrato 0.5.0) ───────────────
 * Quién manda en master101. Antes se agregaban a mano en D1. El primero lo
 * sigue sembrando `CORREO_SUPERADMIN` al entrar; de ahí en adelante, por aquí.
 * Candados: el último no se quita, y nadie se quita a sí mismo. */

rutas.get('/superadmins', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const filas = await superadmins(c.env);
  return ok(c, { total: filas.length, filas });
});

rutas.post('/superadmins', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const cuerpo = await c.req.json<{ correo?: string; nombre?: string }>().catch(() => ({}) as never);
  const correo = normalizaCorreo(cuerpo.correo);
  if (!correo || !correo.includes('@')) return err(c, 'datos_invalidos', 400, { falta: 'correo' });
  const usuario = await crearUsuario(c.env, correo, cuerpo.nombre ?? null);
  const ya = await esSuperadmin(c.env, usuario.id);
  await ponerSuperadmin(c.env, usuario.id);
  if (!ya) await apuntaAdmin(c.env, { quien: quien(c), org_id: null, campo: 'superadmin', antes: null, despues: correo });
  return ok(c, { usuario_id: usuario.id, correo, nombre: usuario.nombre, ya_lo_era: ya }, ya ? 200 : 201);
});

rutas.delete('/superadmins/:uid', async (c) => {
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  const uid = c.req.param('uid')!;
  if (uid === c.get('sesion').usuario_id) return err(c, 'datos_invalidos', 409, { motivo: 'a_ti_mismo' });
  const lista = await superadmins(c.env);
  const objetivo = lista.find((s) => s.usuario_id === uid);
  if (!objetivo) return err(c, 'no_encontrado', 404);
  if (lista.length <= 1) return err(c, 'ultimo_superadmin', 409);
  await quitarSuperadmin(c.env, uid);
  await apuntaAdmin(c.env, { quien: quien(c), org_id: null, campo: 'superadmin', antes: objetivo.correo, despues: null });
  return ok(c, { quitado: true });
});

export default rutas;

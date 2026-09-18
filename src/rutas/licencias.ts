/* /licencias — las suscripciones de las apps que se venden (contrato 0.13.0).
 *
 * Dos clientes distintos hablan aquí:
 *
 *   · LA APP INSTALADA (draw101), sin sesión ni X-App: `activar` con su clave
 *     y su huella de máquina, `latido` a diario con el token que ya tiene, y
 *     `desactivar` para liberar el lugar. Sólo eso.
 *   · EL PANEL DE MIKE (master101), con sesión de superadmin: crear claves,
 *     marcar pagos, subir lugares, suspender, ver quién está activo. Cuando
 *     haya pasarela, `pago` lo llamará ella con `origen: 'stripe'`; hoy lo
 *     llama Mike a mano.
 *
 * Lo que Mike decidió el 18-sep-2026 (con botones): pago a mano por ahora y
 * preparado para Stripe; cortesías sin fecha; sin periodo de prueba; un lugar
 * por suscripción, ajustable por cliente.
 *
 * Todo lo que cambia una suscripción deja renglón en `bitacora_licencias`.
 */

import { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import { ahora, correoValido, normalizaCorreo } from '../lib';
import { soySuper } from './admin';
import {
  CLAVE_FORMA, DIA, abrirToken, cargaDe, claveNueva, firmarToken, hastaDe, idNuevo, llavePublica, normalizaClave, vigencia,
} from '../licencias';
import type { Activacion, EstadoSuscripcion, OrigenPago, RenglonBitacoraLicencia, Suscripcion } from '../../schema/tipos';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

/* ─────────────── acceso a la base ─────────────── */

const porId = (env: Env, id: string) =>
  env.MASTER.prepare(`SELECT * FROM suscripciones WHERE id = ?`).bind(id).first<Suscripcion>();
const porClave = (env: Env, clave: string) =>
  env.MASTER.prepare(`SELECT * FROM suscripciones WHERE clave = ?`).bind(clave).first<Suscripcion>();
const activacionDe = (env: Env, sid: string, huella: string) =>
  env.MASTER.prepare(`SELECT * FROM activaciones WHERE suscripcion_id = ? AND huella = ?`).bind(sid, huella).first<Activacion>();
async function ocupados(env: Env, sid: string, sinHuella = ''): Promise<number> {
  const r = await env.MASTER.prepare(`SELECT COUNT(*) AS n FROM activaciones WHERE suscripcion_id = ? AND activa = 1 AND huella <> ?`)
    .bind(sid, sinHuella).first<{ n: number }>();
  return r?.n ?? 0;
}
async function apunta(env: Env, r: { suscripcion_id: string | null; quien: string; accion: string; detalle?: unknown }) {
  const txt = r.detalle === undefined || r.detalle === null ? null : typeof r.detalle === 'string' ? r.detalle : JSON.stringify(r.detalle);
  await env.MASTER.prepare(`INSERT INTO bitacora_licencias (cuando, suscripcion_id, quien, accion, detalle) VALUES (?,?,?,?,?)`)
    .bind(ahora(), r.suscripcion_id, r.quien, r.accion, txt).run();
}
const huellaValida = (h: unknown): h is string => typeof h === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(h);
const versionDe = (v: unknown): string | null => (typeof v === 'string' && v.length <= 40 ? v : null);

/** Lo que se le cuenta a la app de su licencia: sin correo ni notas. */
const paraLaApp = (s: Suscripcion) => ({ id: s.id, programa: s.programa, cliente: s.cliente, plan: s.plan, lugares: s.lugares, cortesia: s.cortesia === 1, paga_hasta: s.paga_hasta });

/* ─────────────── lo que usa la app ─────────────── */

/** La llave pública, para que draw101 valide la firma sin llamar a nadie. */
rutas.get('/llave', async (c) => ok(c, await llavePublica(c.env)));

rutas.post('/activar', async (c) => {
  const b = await c.req.json<{ clave?: unknown; huella?: unknown; version?: unknown }>().catch(() => ({}) as never);
  const clave = normalizaClave(b.clave);
  if (!CLAVE_FORMA.test(clave) || !huellaValida(b.huella)) return err(c, 'datos_invalidos', 400, { falta: 'clave T101-XXXX-XXXX-XXXX y huella' });
  const huella = b.huella;

  const s = await porClave(c.env, clave);
  if (!s) return err(c, 'clave_inexistente', 404);
  const v = vigencia(s);
  if (!v.vigente) return err(c, v.motivo, v.motivo === 'sin_pago' ? 402 : 403, { paga_hasta: s.paga_hasta, licencia: paraLaApp(s) });

  const ya = await activacionDe(c.env, s.id, huella);
  const usados = await ocupados(c.env, s.id, huella);
  if (!(ya && ya.activa === 1) && usados >= s.lugares) {
    return err(c, 'sin_lugares', 409, { lugares: s.lugares, ocupados: usados, licencia: paraLaApp(s) });
  }
  const t = ahora();
  const version = versionDe(b.version);
  if (ya) {
    await c.env.MASTER.prepare(`UPDATE activaciones SET activa = 1, version = ?, ultimo_latido_at = ? WHERE id = ?`).bind(version, t, ya.id).run();
  } else {
    await c.env.MASTER.prepare(`INSERT INTO activaciones (id, suscripcion_id, huella, version, alta_at, ultimo_latido_at, activa) VALUES (?,?,?,?,?,?,1)`)
      .bind(idNuevo(), s.id, huella, version, t, t).run();
  }
  if (!ya || ya.activa === 0) await apunta(c.env, { suscripcion_id: s.id, quien: 'app', accion: 'activar', detalle: { huella, version } });

  const carga = cargaDe(s, huella);
  const token = await firmarToken(c.env, carga);
  return ok(c, { token, hasta: carga.hasta, licencia: paraLaApp(s), lugares: { usados: usados + 1, total: s.lugares } }, ya?.activa === 1 ? 200 : 201);
});

/** El latido diario: el token viejo y la misma huella → token nuevo con la
 *  fecha corrida. Si algo cambió del lado de Mike, aquí se entera la app. */
rutas.post('/latido', async (c) => {
  const b = await c.req.json<{ token?: unknown; huella?: unknown; version?: unknown }>().catch(() => ({}) as never);
  if (!huellaValida(b.huella)) return err(c, 'datos_invalidos', 400, { falta: 'huella' });
  const carga = await abrirToken(c.env, b.token);
  if (!carga) return err(c, 'token_invalido', 401);
  if (carga.maquina !== b.huella) return err(c, 'maquina_desconocida', 403, { motivo: 'el token es de otra máquina' });

  const s = await porId(c.env, carga.licencia);
  if (!s) return err(c, 'licencia_desconocida', 404);
  const act = await activacionDe(c.env, s.id, b.huella);
  if (!act || act.activa !== 1) return err(c, 'maquina_desconocida', 403, { motivo: 'esta máquina ya no tiene lugar; vuelve a activar' });
  const v = vigencia(s);
  if (!v.vigente) {
    await apunta(c.env, { suscripcion_id: s.id, quien: 'app', accion: 'latido_negado', detalle: { huella: b.huella, motivo: v.motivo } });
    return err(c, v.motivo, v.motivo === 'sin_pago' ? 402 : 403, { paga_hasta: s.paga_hasta, licencia: paraLaApp(s) });
  }
  await c.env.MASTER.prepare(`UPDATE activaciones SET ultimo_latido_at = ?, version = COALESCE(?, version) WHERE id = ?`)
    .bind(ahora(), versionDe(b.version), act.id).run();
  const nueva = cargaDe(s, b.huella);
  return ok(c, { token: await firmarToken(c.env, nueva), hasta: nueva.hasta, licencia: paraLaApp(s) });
});

/** Libera el lugar de esta máquina. Con el token, o con clave + huella (por si
 *  el token ya venció y la persona quiere pasar la licencia a otro equipo). */
rutas.post('/desactivar', async (c) => {
  const b = await c.req.json<{ token?: unknown; clave?: unknown; huella?: unknown }>().catch(() => ({}) as never);
  if (!huellaValida(b.huella)) return err(c, 'datos_invalidos', 400, { falta: 'huella' });
  let s: Suscripcion | null = null;
  if (b.token !== undefined) {
    const carga = await abrirToken(c.env, b.token);
    if (!carga) return err(c, 'token_invalido', 401);
    if (carga.maquina !== b.huella) return err(c, 'maquina_desconocida', 403);
    s = await porId(c.env, carga.licencia);
  } else {
    const clave = normalizaClave(b.clave);
    if (!CLAVE_FORMA.test(clave)) return err(c, 'datos_invalidos', 400, { falta: 'token o clave' });
    s = await porClave(c.env, clave);
  }
  if (!s) return err(c, 'licencia_desconocida', 404);
  const act = await activacionDe(c.env, s.id, b.huella);
  if (act && act.activa === 1) {
    await c.env.MASTER.prepare(`UPDATE activaciones SET activa = 0 WHERE id = ?`).bind(act.id).run();
    await apunta(c.env, { suscripcion_id: s.id, quien: 'app', accion: 'desactivar', detalle: { huella: b.huella } });
  }
  return ok(c, { liberada: true, lugares: { usados: await ocupados(c.env, s.id), total: s.lugares } });
});

/* ─────────────── lo que usa el panel (superadmin) ─────────────── */

rutas.use('/*', async (c, next) => {
  if (!c.get('sesion')) return err(c, 'sin_sesion', 401);
  if (!(await soySuper(c))) return err(c, 'sin_permiso', 403);
  await next();
});
const quien = (c: Ctx) => c.get('sesion').correo;

const conVigencia = (s: Suscripcion) => ({ ...s, cortesia: (s.cortesia ? 1 : 0) as 0 | 1, vigente: vigencia(s).vigente });

rutas.get('/', async (c) => {
  const filas = (await c.env.MASTER.prepare(`SELECT * FROM suscripciones ORDER BY creado_at DESC`).all<Suscripcion>()).results;
  const conteo = (await c.env.MASTER.prepare(`SELECT suscripcion_id AS sid, COUNT(*) AS n FROM activaciones WHERE activa = 1 GROUP BY suscripcion_id`).all<{ sid: string; n: number }>()).results;
  const activas = new Map(conteo.map((r) => [r.sid, r.n]));
  return ok(c, { total: filas.length, filas: filas.map((s) => ({ ...conVigencia(s), activaciones: activas.get(s.id) ?? 0 })) });
});

/** Lo que se puede escribir de una suscripción, validado campo por campo. */
function leerCampos(b: Record<string, unknown>, sobre: Partial<Suscripcion> = {}): { cambios: Partial<Suscripcion> } | { error: string; detalle: unknown } {
  const cambios: Partial<Suscripcion> = {};
  if (b.cliente !== undefined) {
    const v = String(b.cliente ?? '').trim();
    if (!v || v.length > 120) return { error: 'datos_invalidos', detalle: { campo: 'cliente' } };
    cambios.cliente = v;
  }
  if (b.correo !== undefined) {
    if (b.correo === null || b.correo === '') cambios.correo = null;
    else {
      const v = normalizaCorreo(b.correo);
      if (!correoValido(v)) return { error: 'datos_invalidos', detalle: { campo: 'correo' } };
      cambios.correo = v;
    }
  }
  if (b.programa !== undefined) {
    const v = String(b.programa ?? '').trim().toLowerCase();
    if (!/^[a-z0-9]{2,20}$/.test(v)) return { error: 'datos_invalidos', detalle: { campo: 'programa' } };
    cambios.programa = v;
  }
  if (b.plan !== undefined) {
    const v = String(b.plan ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,30}$/.test(v)) return { error: 'datos_invalidos', detalle: { campo: 'plan' } };
    cambios.plan = v;
  }
  if (b.lugares !== undefined) {
    const v = Number(b.lugares);
    if (!Number.isInteger(v) || v < 1 || v > 100) return { error: 'datos_invalidos', detalle: { campo: 'lugares', motivo: 'entero de 1 a 100' } };
    cambios.lugares = v;
  }
  if (b.estado !== undefined) {
    if (b.estado !== 'activa' && b.estado !== 'suspendida') return { error: 'datos_invalidos', detalle: { campo: 'estado' } };
    cambios.estado = b.estado as EstadoSuscripcion;
  }
  if (b.cortesia !== undefined) {
    if (typeof b.cortesia !== 'boolean' && b.cortesia !== 0 && b.cortesia !== 1) return { error: 'datos_invalidos', detalle: { campo: 'cortesia' } };
    cambios.cortesia = b.cortesia === true || b.cortesia === 1 ? 1 : 0;
  }
  if (b.paga_hasta !== undefined) {
    if (b.paga_hasta === null || b.paga_hasta === '') cambios.paga_hasta = null;
    else if (typeof b.paga_hasta !== 'string' || !DIA.test(b.paga_hasta) || Number.isNaN(Date.parse(`${b.paga_hasta}T00:00:00Z`))) {
      return { error: 'datos_invalidos', detalle: { campo: 'paga_hasta', motivo: 'AAAA-MM-DD' } };
    } else cambios.paga_hasta = b.paga_hasta;
  }
  if (b.notas !== undefined) cambios.notas = b.notas === null ? null : String(b.notas).slice(0, 2000);
  void sobre;
  return { cambios };
}

rutas.post('/', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const leido = leerCampos(b);
  if ('error' in leido) return err(c, leido.error, 400, leido.detalle);
  const ch = leido.cambios;
  if (!ch.cliente) return err(c, 'datos_invalidos', 400, { falta: 'cliente' });
  const t = ahora();
  const s: Suscripcion = {
    id: idNuevo(),
    clave: claveNueva(),
    programa: ch.programa ?? 'draw101',
    cliente: ch.cliente,
    correo: ch.correo ?? null,
    plan: ch.plan ?? 'mensual',
    lugares: ch.lugares ?? 1,
    estado: ch.estado ?? 'activa',
    origen: 'manual',
    cortesia: ch.cortesia ?? 0,
    paga_hasta: ch.paga_hasta ?? null,
    notas: ch.notas ?? null,
    creado_at: t,
    actualizado_at: t,
  };
  await c.env.MASTER.prepare(
    `INSERT INTO suscripciones (id, clave, programa, cliente, correo, plan, lugares, estado, origen, cortesia, paga_hasta, notas, creado_at, actualizado_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(s.id, s.clave, s.programa, s.cliente, s.correo, s.plan, s.lugares, s.estado, s.origen, s.cortesia, s.paga_hasta, s.notas, s.creado_at, s.actualizado_at).run();
  await apunta(c.env, { suscripcion_id: s.id, quien: quien(c), accion: 'crear', detalle: { cliente: s.cliente, programa: s.programa, lugares: s.lugares, cortesia: s.cortesia, paga_hasta: s.paga_hasta } });
  return ok(c, { ...conVigencia(s), activaciones: 0 }, 201);
});

rutas.get('/:id', async (c) => {
  const s = await porId(c.env, c.req.param('id')!);
  if (!s) return err(c, 'licencia_desconocida', 404);
  const activaciones = (await c.env.MASTER.prepare(`SELECT * FROM activaciones WHERE suscripcion_id = ? ORDER BY alta_at`).bind(s.id).all<Activacion>()).results;
  const bitacora = (await c.env.MASTER.prepare(`SELECT * FROM bitacora_licencias WHERE suscripcion_id = ? ORDER BY id DESC LIMIT 100`).bind(s.id).all<RenglonBitacoraLicencia>()).results;
  return ok(c, { ...conVigencia(s), activaciones, bitacora });
});

rutas.patch('/:id', async (c) => {
  const s = await porId(c.env, c.req.param('id')!);
  if (!s) return err(c, 'licencia_desconocida', 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const leido = leerCampos(b, s);
  if ('error' in leido) return err(c, leido.error, 400, leido.detalle);
  const ch = leido.cambios;
  const campos = Object.keys(ch) as Array<keyof Suscripcion>;
  if (!campos.length) return err(c, 'datos_invalidos', 400, { motivo: 'nada que cambiar' });
  const t = ahora();
  await c.env.MASTER.prepare(`UPDATE suscripciones SET ${campos.map((k) => `${k} = ?`).join(', ')}, actualizado_at = ? WHERE id = ?`)
    .bind(...campos.map((k) => ch[k] as never), t, s.id).run();
  for (const k of campos) {
    if (s[k] !== ch[k]) await apunta(c.env, { suscripcion_id: s.id, quien: quien(c), accion: 'cambiar', detalle: { campo: k, antes: s[k], despues: ch[k] } });
  }
  const nueva = (await porId(c.env, s.id))!;
  return ok(c, { ...conVigencia(nueva), activaciones: await ocupados(c.env, s.id) });
});

/** Marca hasta qué día está pagado. Hoy lo pica Mike; cuando haya pasarela,
 *  lo mandará ella con `origen: 'stripe'` y su referencia. */
rutas.post('/:id/pago', async (c) => {
  const s = await porId(c.env, c.req.param('id')!);
  if (!s) return err(c, 'licencia_desconocida', 404);
  const b = await c.req.json<{ hasta?: unknown; origen?: unknown; referencia?: unknown }>().catch(() => ({}) as never);
  if (typeof b.hasta !== 'string' || !DIA.test(b.hasta) || Number.isNaN(Date.parse(`${b.hasta}T00:00:00Z`))) {
    return err(c, 'datos_invalidos', 400, { campo: 'hasta', motivo: 'AAAA-MM-DD' });
  }
  const origen: OrigenPago = b.origen === 'stripe' ? 'stripe' : 'manual';
  const referencia = typeof b.referencia === 'string' ? b.referencia.slice(0, 120) : null;
  await c.env.MASTER.prepare(`UPDATE suscripciones SET paga_hasta = ?, origen = ?, actualizado_at = ? WHERE id = ?`).bind(b.hasta, origen, ahora(), s.id).run();
  await apunta(c.env, { suscripcion_id: s.id, quien: quien(c), accion: 'pago', detalle: { antes: s.paga_hasta, hasta: b.hasta, origen, referencia } });
  const nueva = (await porId(c.env, s.id))!;
  return ok(c, { ...conVigencia(nueva), activaciones: await ocupados(c.env, s.id) });
});

/** Mike libera el lugar de una máquina (el cliente cambió de computadora y
 *  la vieja ya no existe para desactivarse sola). */
rutas.post('/:id/desactivar', async (c) => {
  const s = await porId(c.env, c.req.param('id')!);
  if (!s) return err(c, 'licencia_desconocida', 404);
  const b = await c.req.json<{ huella?: unknown }>().catch(() => ({}) as never);
  if (!huellaValida(b.huella)) return err(c, 'datos_invalidos', 400, { falta: 'huella' });
  const act = await activacionDe(c.env, s.id, b.huella);
  if (!act) return err(c, 'no_encontrado', 404, { huella: b.huella });
  if (act.activa === 1) {
    await c.env.MASTER.prepare(`UPDATE activaciones SET activa = 0 WHERE id = ?`).bind(act.id).run();
    await apunta(c.env, { suscripcion_id: s.id, quien: quien(c), accion: 'desactivar', detalle: { huella: b.huella } });
  }
  return ok(c, { liberada: true, lugares: { usados: await ocupados(c.env, s.id), total: s.lugares } });
});

/** Borrar una suscripción. Se van sus activaciones; la bitácora se queda,
 *  que para eso es. */
rutas.delete('/:id', async (c) => {
  const s = await porId(c.env, c.req.param('id')!);
  if (!s) return err(c, 'licencia_desconocida', 404);
  await c.env.MASTER.batch([
    c.env.MASTER.prepare(`DELETE FROM activaciones WHERE suscripcion_id = ?`).bind(s.id),
    c.env.MASTER.prepare(`DELETE FROM suscripciones WHERE id = ?`).bind(s.id),
  ]);
  await apunta(c.env, { suscripcion_id: s.id, quien: quien(c), accion: 'borrar', detalle: { clave: s.clave, cliente: s.cliente } });
  return ok(c, { borrada: s.id });
});

export default rutas;

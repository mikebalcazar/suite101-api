/* auth101 — dentro de la API, como dice la decisión 11.
 *
 *   miembro (socio, oficina)  → Google, o código de 6 dígitos al correo
 *   cliente (peek101)         → correo + PIN de 6 dígitos
 *   personal (quell101)       → correo + PIN, o pantalla de estación
 *
 * La sesión es una cookie `s101` con `id.firmaHMAC`: el id no dice nada por sí
 * solo, la sesión de verdad vive en D1 y se puede matar de un DELETE.
 */

import { Hono } from 'hono';
import {
  ahora, cookie, correoValido, enSegundos, guardarPin, igualSeguro, normalizaCorreo,
  pinAceptable, pinCoincide, sha256, vencida,
} from '../lib';
import {
  VIDA_ACCESO, VIDA_MIEMBRO, abrirSesion, acceso, cerrarSesion, crearUsuario, esSuperadmin,
  miembro, org, orgs, secretoDe, sembrarSuperadmin, usuarioPorCorreo, usuarioPorId,
} from '../maestro';
import { correoCodigo, enviarCorreo } from '../auth/correo';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import { APPS, type App } from '../../schema/tipos';

export const COOKIE = 's101';
const VIDA_CODIGO = 600; // 10 minutos
const ESPERA_REENVIO = 45; // segundos
const MAX_INTENTOS = 5;

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

const appDe = (c: Ctx): App => {
  const a = c.req.header('X-App') || '';
  return (APPS as readonly string[]).includes(a) ? (a as App) : ('suite101' as App);
};

/** En producción el código NUNCA vuelve en la respuesta. Fuera de producción sí:
 *  es lo que permite que la prueba de humo entre sola, sin buzón de correo. */
const devuelveCodigo = (env: Env) => env.ENTORNO !== 'produccion';

/* ─────────────── código por correo ─────────────── */

rutas.post('/codigo', async (c) => {
  const { correo: crudo } = await c.req.json<{ correo?: string }>().catch(() => ({ correo: '' }));
  const correo = normalizaCorreo(crudo);
  if (!correoValido(correo)) return err(c, 'datos_invalidos', 400, { correo: 'no parece un correo' });

  const previo = await c.env.MASTER.prepare(`SELECT enviado_at FROM codigos WHERE correo = ?`)
    .bind(correo).first<{ enviado_at: string }>();
  if (previo && Date.now() - Date.parse(previo.enviado_at) < ESPERA_REENVIO * 1000) {
    return err(c, 'demasiados_intentos', 429, { espera_segundos: ESPERA_REENVIO });
  }

  // Quien no tiene nada en la suite no recibe código. La excepción es el
  // correo del superadmin la primera vez: sin ella no habría por dónde entrar
  // a crear la primera empresa.
  let usuario = await usuarioPorCorreo(c.env, correo);
  const esPrimero = !usuario && normalizaCorreo(c.env.CORREO_SUPERADMIN || '') === correo;
  if (esPrimero) usuario = { ...(await crearUsuario(c.env, correo)), pin_hash: null };
  if (!usuario) {
    // No se dice si existe o no: eso convertiría esta ruta en un directorio.
    return ok(c, { enviado: false, mensaje: 'Si ese correo tiene acceso, le llega un código.' });
  }

  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await sha256(`${codigo}|${correo}|${await secretoDe(c.env)}`);
  await c.env.MASTER.prepare(
    `INSERT INTO codigos (correo, hash, expira_at, intentos, enviado_at) VALUES (?,?,?,0,?)
     ON CONFLICT(correo) DO UPDATE SET hash = excluded.hash, expira_at = excluded.expira_at, intentos = 0, enviado_at = excluded.enviado_at`,
  ).bind(correo, hash, enSegundos(VIDA_CODIGO), ahora()).run();

  const msg = correoCodigo(codigo);
  const envio = await enviarCorreo(c.env, { para: correo, ...msg });
  if (!envio.enviado && c.env.ENTORNO === 'produccion') {
    return err(c, envio.motivo || 'correo_no_configurado', 503);
  }

  return ok(c, {
    enviado: envio.enviado,
    vence_en_segundos: VIDA_CODIGO,
    ...(devuelveCodigo(c.env) ? { codigo_prueba: codigo } : {}),
  });
});

/* ─────────────── entrar: código o PIN ─────────────── */

rutas.post('/entrar', async (c) => {
  const cuerpo = await c.req.json<{ correo?: string; codigo?: string; pin?: string }>().catch(() => ({}) as never);
  const correo = normalizaCorreo(cuerpo.correo);
  if (!correoValido(correo)) return err(c, 'datos_invalidos', 400, { correo: 'no parece un correo' });

  const usuario = await usuarioPorCorreo(c.env, correo);
  if (!usuario) return err(c, 'sin_permiso', 403);

  if (cuerpo.codigo) {
    const codigo = String(cuerpo.codigo).replace(/\D/g, '');
    const fila = await c.env.MASTER.prepare(`SELECT * FROM codigos WHERE correo = ?`)
      .bind(correo).first<{ hash: string; expira_at: string; intentos: number }>();
    if (!fila) return err(c, 'codigo_invalido', 401);
    if (vencida(fila.expira_at)) return err(c, 'codigo_invalido', 401, { motivo: 'vencido' });
    if (fila.intentos >= MAX_INTENTOS) return err(c, 'demasiados_intentos', 429);

    const hash = await sha256(`${codigo}|${correo}|${await secretoDe(c.env)}`);
    if (!igualSeguro(hash, fila.hash)) {
      await c.env.MASTER.prepare(`UPDATE codigos SET intentos = intentos + 1 WHERE correo = ?`).bind(correo).run();
      return err(c, 'codigo_invalido', 401, { intentos_restantes: MAX_INTENTOS - fila.intentos - 1 });
    }
    await c.env.MASTER.prepare(`DELETE FROM codigos WHERE correo = ?`).bind(correo).run();
    await sembrarSuperadmin(c.env, usuario.id, correo);
    return await entregarSesion(c, usuario.id, VIDA_MIEMBRO);
  }

  if (cuerpo.pin) {
    const pin = String(cuerpo.pin).replace(/\D/g, '');
    const gasto = await c.env.MASTER.prepare(`SELECT * FROM intentos_pin WHERE correo = ?`)
      .bind(correo).first<{ intentos: number; desde_at: string }>();
    const enLaHora = gasto && Date.now() - Date.parse(gasto.desde_at) < 3600_000;
    if (enLaHora && gasto!.intentos >= MAX_INTENTOS) return err(c, 'demasiados_intentos', 429, { ventana: '1 hora' });

    if (!(await pinCoincide(pin, usuario.pin_hash))) {
      await c.env.MASTER.prepare(
        `INSERT INTO intentos_pin (correo, intentos, desde_at) VALUES (?,1,?)
         ON CONFLICT(correo) DO UPDATE SET intentos = CASE WHEN ? THEN intentos_pin.intentos + 1 ELSE 1 END,
                                           desde_at = CASE WHEN ? THEN intentos_pin.desde_at ELSE ? END`,
      ).bind(correo, ahora(), enLaHora ? 1 : 0, enLaHora ? 1 : 0, ahora()).run();
      return err(c, 'pin_invalido', 401);
    }
    await c.env.MASTER.prepare(`DELETE FROM intentos_pin WHERE correo = ?`).bind(correo).run();
    return await entregarSesion(c, usuario.id, VIDA_ACCESO);
  }

  return err(c, 'datos_invalidos', 400, { falta: 'codigo o pin' });
});

async function entregarSesion(c: Ctx, usuario_id: string, vida: number) {
  const s = await abrirSesion(c.env, usuario_id, appDe(c), vida);
  const usuario = await usuarioPorId(c.env, usuario_id);
  // La cookie viaja en la respuesta que se arma aqui: `ok()` construye una
  // Response propia, asi que lo que se ponga con c.header() se perderia.
  return ok(c, { usuario, vive_segundos: vida }, 200, { 'Set-Cookie': cookie(COOKIE, s.cookie, vida) });
}

/* ─────────────── PIN: fijarlo ─────────────── */

rutas.post('/pin', async (c) => {
  const s = c.get('sesion');
  if (!s) return err(c, 'sin_sesion', 401);
  const { pin } = await c.req.json<{ pin?: string }>().catch(() => ({}) as never);
  const limpio = String(pin || '').replace(/\D/g, '');
  if (!pinAceptable(limpio)) {
    return err(c, 'datos_invalidos', 400, { pin: 'seis dígitos, y no una escalera ni seis iguales' });
  }
  await c.env.MASTER.prepare(`UPDATE usuarios SET pin_hash = ? WHERE id = ?`).bind(await guardarPin(limpio), s.usuario_id).run();
  return ok(c, { puesto: true });
});

/* ─────────────── Google ───────────────
 * Solo para miembros. Si no están las dos variables, la ruta lo dice en vez de
 * fingir: en la fase 1 no había credenciales de Google que poner. */

rutas.get('/google', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return err(c, 'google_no_configurado', 501);
  const destino = new URL(c.req.url);
  const redirect = `${destino.origin}/auth/google/callback`;
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', c.req.query('volver_a') || '/');
  return c.redirect(u.toString(), 302);
});

rutas.get('/google/callback', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return err(c, 'google_no_configurado', 501);
  const code = c.req.query('code');
  if (!code) return err(c, 'datos_invalidos', 400);
  const origin = new URL(c.req.url).origin;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${origin}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) return err(c, 'sin_permiso', 403, { google: r.status });
  const { id_token } = await r.json<{ id_token: string }>();
  const carga = JSON.parse(atob(id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email: string; sub: string; name?: string };
  const correo = normalizaCorreo(carga.email);

  let usuario = await usuarioPorCorreo(c.env, correo);
  if (!usuario && normalizaCorreo(c.env.CORREO_SUPERADMIN || '') === correo) {
    usuario = { ...(await crearUsuario(c.env, correo, carga.name)), pin_hash: null };
  }
  if (!usuario) return err(c, 'sin_permiso', 403);
  await c.env.MASTER.prepare(`UPDATE usuarios SET google_sub = ? WHERE id = ?`).bind(carga.sub, usuario.id).run();
  await sembrarSuperadmin(c.env, usuario.id, correo);

  const s = await abrirSesion(c.env, usuario.id, appDe(c), VIDA_MIEMBRO);
  c.header('Set-Cookie', cookie(COOKIE, s.cookie, VIDA_MIEMBRO));
  return c.redirect(c.req.query('state') || '/', 302);
});

/* ─────────────── salir ─────────────── */

rutas.post('/salir', async (c) => {
  const s = c.get('sesion');
  if (s) await cerrarSesion(c.env, s.id);
  return ok(c, { salio: true }, 200, { 'Set-Cookie': cookie(COOKIE, '', 0) });
});

export default rutas;

/* ─────────────── /yo ─────────────── */

export async function yo(c: Ctx) {
  const s = c.get('sesion');
  if (!s) return err(c, 'sin_sesion', 401);
  const usuario = await usuarioPorId(c.env, s.usuario_id);
  const acc = await acceso(c.env, s.usuario_id);
  const soySuper = await esSuperadmin(c.env, s.usuario_id);

  const lista = soySuper ? await orgs(c.env) : [];
  const mias: Array<{ id: string; nombre: string; rol: string; apps: string[]; negocios: string[] }> = [];
  if (soySuper) {
    for (const o of lista) mias.push({ id: o.id, nombre: o.nombre, rol: 'owner', apps: [], negocios: [] });
  } else {
    const r = await c.env.MASTER.prepare(
      `SELECT m.org_id, m.rol, m.apps, m.negocios, o.nombre FROM miembros m JOIN orgs o ON o.id = m.org_id WHERE m.usuario_id = ?`,
    ).bind(s.usuario_id).all<{ org_id: string; rol: string; apps: string; negocios: string; nombre: string }>();
    for (const f of r.results ?? []) {
      mias.push({ id: f.org_id, nombre: f.nombre, rol: f.rol, apps: JSON.parse(f.apps || '[]'), negocios: JSON.parse(f.negocios || '[]') });
    }
  }

  return ok(c, { usuario, superadmin: soySuper, orgs: mias, acceso: acc });
}

/** Middleware: lee la cookie y deja la sesión en el contexto. No exige nada:
 *  cada ruta decide si la necesita. */
export async function conSesion(c: Ctx, next: () => Promise<void>) {
  const crudo = leerCookieDe(c.req.raw.headers.get('Cookie'), COOKIE);
  if (crudo) {
    const { abrirCookie } = await import('../lib');
    const id = await abrirCookie(crudo, await secretoDe(c.env));
    if (id) {
      const { leerSesion } = await import('../maestro');
      const s = await leerSesion(c.env, id);
      if (s) {
        const u = await usuarioPorId(c.env, s.usuario_id);
        if (u) {
          c.set('sesion', {
            id,
            usuario_id: s.usuario_id,
            correo: u.correo,
            superadmin: await esSuperadmin(c.env, s.usuario_id),
          });
        }
      }
    }
  }
  await next();
}

function leerCookieDe(cabecera: string | null, nombre: string): string | null {
  for (const parte of String(cabecera || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

export { miembro, org };

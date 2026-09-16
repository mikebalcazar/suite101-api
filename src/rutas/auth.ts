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
  ahora, claveCoincide, cookie, correoValido, enSegundos, guardarClave, guardarPin, igualSeguro,
  normalizaCorreo, pinAceptable, pinCoincide, revisaClave, sha256, ulid, vencida,
} from '../lib';
import {
  VIDA_ACCESO, VIDA_MIEMBRO, abrirSesion, acceso, cerrarSesion, crearUsuario, esSuperadmin,
  miembro, org, orgs, secretoDe, sembrarSuperadmin, usuarioPorCorreo, usuarioPorId,
  secretosDe, type Como,
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
  if (esPrimero) usuario = { ...(await crearUsuario(c.env, correo)), pin_hash: null, clave_hash: null };
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
  const cuerpo = await c.req.json<{ correo?: string; codigo?: string; pin?: string; clave?: string }>().catch(() => ({}) as never);
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
    return await entregarSesion(c, usuario.id, VIDA_MIEMBRO, 'codigo');
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
    return await entregarSesion(c, usuario.id, VIDA_ACCESO, 'pin');
  }

  // Contraseña (contrato 0.7.0). El mismo freno que el PIN, en su propia
  // cuenta: gastar los cinco intentos de la contraseña no debe cerrarle a
  // nadie la puerta del PIN, ni al revés.
  if (cuerpo.clave) {
    const clave = String(cuerpo.clave);
    const gasto = await c.env.MASTER.prepare(`SELECT * FROM intentos_clave WHERE correo = ?`)
      .bind(correo).first<{ intentos: number; desde_at: string }>();
    const enLaHora = gasto && Date.now() - Date.parse(gasto.desde_at) < 3600_000;
    if (enLaHora && gasto!.intentos >= MAX_INTENTOS) return err(c, 'demasiados_intentos', 429, { ventana: '1 hora' });

    if (!(await claveCoincide(clave, usuario.clave_hash))) {
      await c.env.MASTER.prepare(
        `INSERT INTO intentos_clave (correo, intentos, desde_at) VALUES (?,1,?)
         ON CONFLICT(correo) DO UPDATE SET intentos = CASE WHEN ? THEN intentos_clave.intentos + 1 ELSE 1 END,
                                           desde_at = CASE WHEN ? THEN intentos_clave.desde_at ELSE ? END`,
      ).bind(correo, ahora(), enLaHora ? 1 : 0, enLaHora ? 1 : 0, ahora()).run();
      return err(c, 'clave_invalida', 401);
    }
    await c.env.MASTER.prepare(`DELETE FROM intentos_clave WHERE correo = ?`).bind(correo).run();
    return await entregarSesion(c, usuario.id, VIDA_MIEMBRO, 'clave');
  }

  return err(c, 'datos_invalidos', 400, { falta: 'codigo, pin o clave' });
});

async function entregarSesion(c: Ctx, usuario_id: string, vida: number, como: Como = 'codigo') {
  const s = await abrirSesion(c.env, usuario_id, appDe(c), vida, como);
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

/* ─────────────── la contraseña: fijarla y cambiarla (contrato 0.7.0) ───────────────
 * Una sola ruta para las dos cosas, y una regla que las separa: si ya hay una
 * contraseña puesta, hay que mandar la actual… salvo que la sesión se haya
 * abierto con código al correo o con Google. Eso es lo que hace que «olvidé mi
 * contraseña» no necesite ruta aparte: se entra con un código y se pone otra.
 *
 * Con una sesión abierta con PIN o con la propia contraseña NO alcanza: quien
 * se robara un PIN de seis dígitos podría cambiar la contraseña de diez y
 * quedarse con la cuenta. */

rutas.post('/clave', async (c) => {
  const s = c.get('sesion');
  if (!s) return err(c, 'sin_sesion', 401);
  const cuerpo = await c.req.json<{ clave?: string; actual?: string }>().catch(() => ({}) as never);
  const clave = String(cuerpo.clave || '');

  const usuario = await usuarioPorCorreo(c.env, s.correo);
  if (!usuario) return err(c, 'sin_permiso', 403);

  const yaTenia = !!usuario.clave_hash;
  const buzonProbado = s.como === 'codigo' || s.como === 'google';
  if (yaTenia && !buzonProbado) {
    if (!cuerpo.actual) return err(c, 'datos_invalidos', 400, { falta: 'actual', motivo: 'ya_tienes_clave' });
    if (!(await claveCoincide(String(cuerpo.actual), usuario.clave_hash))) return err(c, 'clave_invalida', 401, { cual: 'actual' });
  }

  const queja = revisaClave(clave, s.correo);
  if (queja) return err(c, 'clave_debil', 400, { porque: queja });

  await c.env.MASTER.prepare(`UPDATE usuarios SET clave_hash = ? WHERE id = ?`).bind(await guardarClave(clave), s.usuario_id).run();
  // Una contraseña nueva limpia el freno: quien acaba de probar quién es no
  // tiene por qué cargar con los intentos fallidos de antes.
  await c.env.MASTER.prepare(`DELETE FROM intentos_clave WHERE correo = ?`).bind(s.correo).run();
  return ok(c, { puesta: true, cambiada: yaTenia });
});

/* ─────────────── Google ───────────────
 * Solo para miembros. Si no están las dos variables, la ruta lo dice en vez de
 * fingir: en la fase 1 no había credenciales de Google que poner. */

/* `volver_a` puede ser una ruta de aquí mismo ('/') o la URL absoluta de una
 * app (https://conta-master.netlify.app/login). Si es absoluta, su origen
 * tiene que estar en ORIGENES: es a donde se manda el boleto de entrada, y
 * mandarlo a cualquier sitio sería regalar sesiones. */
function volverAPermitido(c: Ctx, volver_a: string): boolean {
  if (!volver_a.startsWith('http')) return true;
  let origen: string;
  try {
    origen = new URL(volver_a).origin;
  } catch {
    return false;
  }
  const permitidos = String(c.env.ORIGENES || '').split(',').map((s) => s.trim()).filter(Boolean);
  return permitidos.includes('*') || permitidos.includes(origen);
}

const VIDA_TICKET = 60; // segundos: lo que tarda un navegador en volver a la app

/** A dónde tiene que devolver Google: SIEMPRE a esta API, por su origen
 *  público. Las apps llegan aquí por su proxy `/s101/*` con un *service
 *  binding*, y la petición conserva el dominio de la app; armar la dirección
 *  de regreso con `c.req.url` mandaba a Google a
 *  `https://dash101…/auth/google/callback`, una puerta que la app no sirve
 *  (encontrado el 16-sep-2026 al prender Google en todas las apps). Con
 *  `URL_PUBLICA` en wrangler.toml se arma siempre igual, venga de donde venga
 *  la petición; sin ella queda el origen de la petición, que sólo es correcto
 *  cuando el navegador le habla a la API directo. */
export function redirectUriGoogle(env: Pick<Env, 'URL_PUBLICA'>, urlPeticion: string): string {
  const origen = (env.URL_PUBLICA || new URL(urlPeticion).origin).replace(/\/+$/, '');
  return `${origen}/auth/google/callback`;
}

/** La dirección de Google a la que se manda al navegador. */
export function urlAutorizacionGoogle(env: Pick<Env, 'URL_PUBLICA' | 'GOOGLE_CLIENT_ID'>, urlPeticion: string, volver_a: string): URL {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', redirectUriGoogle(env, urlPeticion));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', volver_a);
  return u;
}

rutas.get('/google', async (c) => {
  const volver_a = c.req.query('volver_a') || '/';
  if (!volverAPermitido(c, volver_a)) return err(c, 'origen_no_permitido', 403, { volver_a });
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return err(c, 'google_no_configurado', 501);
  return c.redirect(urlAutorizacionGoogle(c.env, c.req.url, volver_a).toString(), 302);
});

rutas.get('/google/callback', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return err(c, 'google_no_configurado', 501);
  const code = c.req.query('code');
  if (!code) return err(c, 'datos_invalidos', 400);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUriGoogle(c.env, c.req.url),
      grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) return err(c, 'sin_permiso', 403, { google: r.status });
  const { id_token } = await r.json<{ id_token: string }>();
  const carga = JSON.parse(atob(id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email: string; sub: string; name?: string };
  const correo = normalizaCorreo(carga.email);

  let usuario = await usuarioPorCorreo(c.env, correo);
  if (!usuario && normalizaCorreo(c.env.CORREO_SUPERADMIN || '') === correo) {
    usuario = { ...(await crearUsuario(c.env, correo, carga.name)), pin_hash: null, clave_hash: null };
  }
  if (!usuario) return err(c, 'sin_permiso', 403);
  await c.env.MASTER.prepare(`UPDATE usuarios SET google_sub = ? WHERE id = ?`).bind(carga.sub, usuario.id).run();
  await sembrarSuperadmin(c.env, usuario.id, correo);

  const s = await abrirSesion(c.env, usuario.id, appDe(c), VIDA_MIEMBRO, 'google');
  const volver_a = c.req.query('state') || '/';

  // A una app detrás de su proxy no le sirve la cookie puesta aquí: es de
  // otro origen. Se le manda un boleto de un solo uso y ella lo canjea por
  // /s101/auth/canje, con lo que la cookie queda en su propio origen.
  if (volver_a.startsWith('http')) {
    if (!volverAPermitido(c, volver_a)) return err(c, 'origen_no_permitido', 403, { volver_a });
    const ticket = await emitirTicket(c.env, s.cookie);
    const u = new URL(volver_a);
    u.searchParams.set('entrada', ticket);
    return c.redirect(u.toString(), 302);
  }

  c.header('Set-Cookie', cookie(COOKIE, s.cookie, VIDA_MIEMBRO));
  return c.redirect(volver_a, 302);
});

async function emitirTicket(env: Env, galleta: string): Promise<string> {
  const id = ulid() + '-' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.MASTER.prepare(`INSERT INTO tickets (id, galleta, expira_at) VALUES (?,?,?)`).bind(id, galleta, enSegundos(VIDA_TICKET)).run();
  return id;
}

/* ─────────────── canjear el boleto por la cookie ───────────────
 * Un solo uso: se borra al leerlo, valga o no. */

rutas.post('/canje', async (c) => {
  const { entrada } = await c.req.json<{ entrada?: string }>().catch(() => ({ entrada: '' }));
  const id = String(entrada || '');
  if (!id) return err(c, 'datos_invalidos', 400, { falta: 'entrada' });
  const t = await c.env.MASTER.prepare(`SELECT galleta, expira_at FROM tickets WHERE id = ?`).bind(id).first<{ galleta: string; expira_at: string }>();
  if (t) await c.env.MASTER.prepare(`DELETE FROM tickets WHERE id = ?`).bind(id).run();
  if (!t || vencida(t.expira_at)) return err(c, 'entrada_invalida', 401);
  return ok(c, { entro: true }, 200, { 'Set-Cookie': cookie(COOKIE, t.galleta, VIDA_MIEMBRO) });
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

  // Qué puede ofrecer la pantalla la próxima vez (contrato 0.7.0). Nunca los
  // hashes: sólo si existen.
  const secretos = await secretosDe(c.env, s.usuario_id);
  return ok(c, { usuario, superadmin: soySuper, orgs: mias, acceso: acc, entro_con: s.como, ...secretos });
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
            como: s.como,
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

/* Todo lo que toca el D1 «master». Ninguna otra parte del Worker escribe SQL
 * contra el directorio: si algo falta, se agrega aquí. */

import { ahora, enSegundos, firmarId, normalizaCorreo, ulid } from './lib';
import type { App, Org, Rol, TipoAcceso, Usuario, OrgConConteos, Superadmin, RenglonBitacoraAdmin, EstadoEmpresa } from '../schema/tipos';
import type { Env } from './entorno';

export const VIDA_MIEMBRO = 30 * 24 * 3600; // 30 días
export const VIDA_ACCESO = 12 * 3600; //  12 h para clientes y personal

/* ─────────────── la llave con la que se firman las cookies ───────────────
 * Si hay secreto en el entorno, manda ese. Si no, la API se genera una la
 * primera vez y la guarda en `config`. Es lo que permite que este Worker
 * funcione desde el primer despliegue sin pedirle nada a nadie: el secreto de
 * Cloudflare se puede poner después y toma el mando en cuanto exista. */
let cacheSecreto: string | null = null;

export async function secretoDe(env: Env): Promise<string> {
  if (env.SECRETO) return env.SECRETO;
  if (cacheSecreto) return cacheSecreto;
  const fila = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = 'secreto_sesion'`).first<{ valor: string }>();
  if (fila?.valor) {
    cacheSecreto = fila.valor;
    return cacheSecreto;
  }
  const nuevo = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.MASTER.prepare(`INSERT OR IGNORE INTO config (llave, valor) VALUES ('secreto_sesion', ?)`).bind(nuevo).run();
  const puesto = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = 'secreto_sesion'`).first<{ valor: string }>();
  cacheSecreto = puesto?.valor ?? nuevo;
  return cacheSecreto;
}

/* ─────────────── usuarios ─────────────── */

export type UsuarioConSecretos = Usuario & { pin_hash: string | null; clave_hash: string | null };

export async function usuarioPorCorreo(env: Env, correo: string): Promise<UsuarioConSecretos | null> {
  return env.MASTER.prepare(`SELECT * FROM usuarios WHERE correo = ?`)
    .bind(normalizaCorreo(correo))
    .first<UsuarioConSecretos>();
}

export async function usuarioPorId(env: Env, id: string): Promise<Usuario | null> {
  return env.MASTER.prepare(`SELECT id, correo, nombre, creado_at FROM usuarios WHERE id = ?`).bind(id).first<Usuario>();
}

export async function crearUsuario(env: Env, correo: string, nombre?: string | null): Promise<Usuario> {
  const existente = await usuarioPorCorreo(env, correo);
  if (existente) return existente;
  const u = { id: ulid(), correo: normalizaCorreo(correo), nombre: nombre ?? null, creado_at: ahora() };
  await env.MASTER.prepare(`INSERT INTO usuarios (id, correo, nombre, creado_at) VALUES (?,?,?,?)`)
    .bind(u.id, u.correo, u.nombre, u.creado_at)
    .run();
  return u as Usuario;
}

/* ─────────────── sesiones ─────────────── */

/** Con qué se abrió una sesión. `codigo` y `google` prueban que la persona
 *  controla ese buzón; `pin` y `clave` sólo prueban que sabe un secreto. La
 *  diferencia decide si cambiar la contraseña pide la actual (contrato 0.7.0). */
export type Como = 'codigo' | 'pin' | 'clave' | 'google';

export async function abrirSesion(env: Env, usuario_id: string, app: App, vida: number, como: Como = 'codigo'): Promise<{ cookie: string; id: string }> {
  const id = ulid() + '-' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.MASTER.prepare(`INSERT INTO sesiones (id, usuario_id, app, expira_at, creado_at, como) VALUES (?,?,?,?,?,?)`)
    .bind(id, usuario_id, app, enSegundos(vida), ahora(), como)
    .run();
  return { cookie: await firmarId(id, await secretoDe(env)), id };
}

export async function leerSesion(env: Env, id: string): Promise<{ usuario_id: string; app: string; como: Como } | null> {
  const s = await env.MASTER.prepare(`SELECT usuario_id, app, expira_at, como FROM sesiones WHERE id = ?`)
    .bind(id)
    .first<{ usuario_id: string; app: string; expira_at: string; como: string | null }>();
  if (!s || s.expira_at < ahora()) return null;
  return { usuario_id: s.usuario_id, app: s.app, como: (s.como as Como) || 'codigo' };
}

/** Qué secretos tiene puestos un usuario. La API NUNCA devuelve los hashes:
 *  sólo si existen, para que la pantalla sepa qué ofrecer. */
/* Qué tiene esta persona para volver a entrar mañana. Nunca el hash ni el
 * identificador de Google: sólo si existen. `tiene_google` hace falta para no
 * exigirle una contraseña a quien ya tiene por dónde volver —entrar con
 * Google es una forma de entrar, no un atajo—; sin él, quien entraba con un
 * código se topaba con «ponle una contraseña» aunque tuviera Google ligado
 * desde hace semanas. */
export async function secretosDe(env: Env, usuario_id: string): Promise<{ tiene_pin: boolean; tiene_clave: boolean; tiene_google: boolean }> {
  const f = await env.MASTER.prepare(`SELECT pin_hash, clave_hash, google_sub FROM usuarios WHERE id = ?`)
    .bind(usuario_id)
    .first<{ pin_hash: string | null; clave_hash: string | null; google_sub: string | null }>();
  return { tiene_pin: !!f?.pin_hash, tiene_clave: !!f?.clave_hash, tiene_google: !!f?.google_sub };
}

/** Cuántos segundos le quedan a una sesión.
 *
 *  Existe para que la galleta caduque cuando caduca la sesión, y no un mes
 *  después. `/auth/canje` sólo tiene la galleta firmada del boleto, no sabe de
 *  quién es ni cuánto le tocó: si le pusiera 30 días fijos, a una clienta le
 *  quedaría un mes de galleta sobre una sesión de 12 horas. El navegador la
 *  seguiría mandando, la API contestaría 401 y la pantalla se vería «dentro»
 *  hasta que algo fallara. La sesión en D1 es la única verdad; esto la lee. */
export async function vidaQueQueda(env: Env, id: string): Promise<number> {
  const s = await env.MASTER.prepare(`SELECT expira_at FROM sesiones WHERE id = ?`)
    .bind(id).first<{ expira_at: string }>();
  if (!s) return 0;
  return Math.max(0, Math.floor((Date.parse(s.expira_at) - Date.now()) / 1000));
}

export async function cerrarSesion(env: Env, id: string): Promise<void> {
  await env.MASTER.prepare(`DELETE FROM sesiones WHERE id = ?`).bind(id).run();
}

/* ─────────────── orgs, miembros, accesos ─────────────── */

interface FilaOrg {
  id: string; nombre: string; plan: string; apps: string; moneda: string; activa: number; creado_at: string;
  razon_social: string | null; rfc: string | null; telefono: string | null;
  director_correo: string | null; director_nombre: string | null; director_telefono: string | null;
  cortesia: number; paga_hasta: string | null; origen_pago: string; bienvenida_at: string | null;
}

const hoy = (): string => ahora().slice(0, 10);

/** Vigente = activa y (cortesía o pagada al día). Una empresa vence al
 *  terminar el día de `paga_hasta` (contrato 0.14.0). */
export const estadoEmpresa = (f: { activa: number | boolean; cortesia: number | boolean; paga_hasta: string | null }): { vigente: boolean; estado: EstadoEmpresa } => {
  if (!f.activa) return { vigente: false, estado: 'suspendida' };
  if (f.cortesia || (f.paga_hasta && f.paga_hasta >= hoy())) return { vigente: true, estado: 'activa' };
  return { vigente: false, estado: 'sin_pago' };
};

const armaOrg = (f: FilaOrg): Org => ({
  ...f,
  activa: !!f.activa,
  apps: JSON.parse(f.apps || '{}'),
  razon_social: f.razon_social ?? null,
  rfc: f.rfc ?? null,
  telefono: f.telefono ?? null,
  director_correo: f.director_correo ?? null,
  director_nombre: f.director_nombre ?? null,
  director_telefono: f.director_telefono ?? null,
  cortesia: !!f.cortesia,
  paga_hasta: f.paga_hasta ?? null,
  origen_pago: (f.origen_pago === 'stripe' ? 'stripe' : 'manual'),
  bienvenida_at: f.bienvenida_at ?? null,
  ...estadoEmpresa(f),
});

export async function org(env: Env, id: string): Promise<Org | null> {
  const f = await env.MASTER.prepare(`SELECT * FROM orgs WHERE id = ?`).bind(id).first<FilaOrg>();
  return f ? armaOrg(f) : null;
}

export async function orgs(env: Env): Promise<Org[]> {
  const r = await env.MASTER.prepare(`SELECT * FROM orgs ORDER BY nombre`).all<FilaOrg>();
  return (r.results ?? []).map(armaOrg);
}

export interface DatosEmpresa {
  id: string; nombre: string; plan?: string; apps?: Record<string, boolean>; moneda?: string;
  razon_social?: string | null; rfc?: string | null; telefono?: string | null;
  director_correo?: string | null; director_nombre?: string | null; director_telefono?: string | null;
  /** Sin `paga_hasta` es cortesía, salvo que se diga `cortesia: false` a propósito. */
  cortesia?: boolean; paga_hasta?: string | null;
}

export async function crearOrg(env: Env, datos: DatosEmpresa): Promise<Org> {
  const cortesia = datos.cortesia ?? !datos.paga_hasta;
  const fila: FilaOrg = {
    id: datos.id,
    nombre: datos.nombre,
    plan: datos.plan ?? 'base',
    /* `supply` va junto a `dash` en una empresa nueva: supply101 es la cara
     * de empleado del mismo módulo de órdenes, no se cobra aparte, y quien
     * contrata dash101 contrata las dos. Lo que SÍ se reparte persona por
     * persona son los permisos, y ahí van separados (21-sep-2026). */
    apps: JSON.stringify(datos.apps ?? { dash: true, supply: true, quell: true, peek: true, cotizador: true, roster: true, nest: true }),
    moneda: datos.moneda ?? 'MXN',
    activa: 1,
    creado_at: ahora(),
    razon_social: datos.razon_social ?? null,
    rfc: datos.rfc ?? null,
    telefono: datos.telefono ?? null,
    director_correo: datos.director_correo ?? null,
    director_nombre: datos.director_nombre ?? null,
    director_telefono: datos.director_telefono ?? null,
    cortesia: cortesia ? 1 : 0,
    paga_hasta: datos.paga_hasta ?? null,
    origen_pago: 'manual',
    bienvenida_at: null,
  };
  await env.MASTER.prepare(
    `INSERT INTO orgs (id, nombre, plan, apps, moneda, activa, creado_at, razon_social, rfc, telefono, director_correo, director_nombre, director_telefono, cortesia, paga_hasta, origen_pago)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(fila.id, fila.nombre, fila.plan, fila.apps, fila.moneda, fila.activa, fila.creado_at, fila.razon_social, fila.rfc, fila.telefono,
    fila.director_correo, fila.director_nombre, fila.director_telefono, fila.cortesia, fila.paga_hasta, fila.origen_pago).run();
  return armaOrg(fila);
}

/** Marca hasta qué día está pagada la empresa. Deja de ser cortesía. */
export async function pagarOrg(env: Env, id: string, hasta: string, origen: 'manual' | 'stripe'): Promise<void> {
  await env.MASTER.prepare(`UPDATE orgs SET paga_hasta = ?, cortesia = 0, origen_pago = ? WHERE id = ?`).bind(hasta, origen, id).run();
}

export async function marcarBienvenida(env: Env, id: string): Promise<void> {
  await env.MASTER.prepare(`UPDATE orgs SET bienvenida_at = ? WHERE id = ?`).bind(ahora(), id).run();
}

export interface Miembro { org_id: string; usuario_id: string; rol: Rol; apps: string[]; negocios: string[] }

export async function miembro(env: Env, org_id: string, usuario_id: string): Promise<Miembro | null> {
  const f = await env.MASTER.prepare(`SELECT * FROM miembros WHERE org_id = ? AND usuario_id = ?`)
    .bind(org_id, usuario_id)
    .first<{ org_id: string; usuario_id: string; rol: Rol; apps: string; negocios: string }>();
  return f ? { ...f, apps: JSON.parse(f.apps || '[]'), negocios: JSON.parse(f.negocios || '[]') } : null;
}

export async function miembrosDe(env: Env, org_id: string): Promise<Array<Miembro & { correo: string; nombre: string | null }>> {
  const r = await env.MASTER.prepare(
    `SELECT m.*, u.correo, u.nombre FROM miembros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.org_id = ?`,
  ).bind(org_id).all<{ org_id: string; usuario_id: string; rol: Rol; apps: string; negocios: string; correo: string; nombre: string | null }>();
  return (r.results ?? []).map((f) => ({ ...f, apps: JSON.parse(f.apps || '[]'), negocios: JSON.parse(f.negocios || '[]') }));
}

export async function ponerMiembro(env: Env, org_id: string, usuario_id: string, rol: Rol, apps: string[] = [], negocios: string[] = []): Promise<void> {
  await env.MASTER.prepare(
    `INSERT INTO miembros (org_id, usuario_id, rol, apps, negocios) VALUES (?,?,?,?,?)
     ON CONFLICT(org_id, usuario_id) DO UPDATE SET rol = excluded.rol, apps = excluded.apps, negocios = excluded.negocios`,
  ).bind(org_id, usuario_id, rol, JSON.stringify(apps), JSON.stringify(negocios)).run();
}

export async function quitarMiembro(env: Env, org_id: string, usuario_id: string): Promise<void> {
  await env.MASTER.prepare(`DELETE FROM miembros WHERE org_id = ? AND usuario_id = ?`).bind(org_id, usuario_id).run();
}

/** Cuántos dueños tiene la empresa. El último no se baja ni se degrada. */
export async function cuentaOwners(env: Env, org_id: string): Promise<number> {
  const f = await env.MASTER.prepare(`SELECT COUNT(*) AS n FROM miembros WHERE org_id = ? AND rol = 'owner'`).bind(org_id).first<{ n: number }>();
  return f?.n ?? 0;
}

/** Última sesión abierta por cada miembro de la empresa (contrato 0.6.0):
 *  una consulta agrupada, no una por persona. */
export async function ultimasEntradasDe(env: Env, org_id: string): Promise<Map<string, string>> {
  const r = await env.MASTER.prepare(
    `SELECT s.usuario_id, MAX(s.creado_at) AS ultima FROM sesiones s JOIN miembros m ON m.usuario_id = s.usuario_id AND m.org_id = ? GROUP BY s.usuario_id`,
  ).bind(org_id).all<{ usuario_id: string; ultima: string }>();
  return new Map((r.results ?? []).map((f) => [f.usuario_id, f.ultima]));
}

export interface Acceso { usuario_id: string; org_id: string; tipo: TipoAcceso; ref_id: string; activo: boolean }

/** Cuánto dura la sesión de este usuario, decidido por QUIÉN es y no por con
 *  qué entró (contrato 0.12.0).
 *
 *  Antes lo decidía el camino: el PIN daba 12 horas y el código, la contraseña
 *  y Google daban 30 días. Eso dejaba un hueco abierto, y no teórico: el camino
 *  que de verdad usan los clientes de peek101 es «código al correo», así que un
 *  cliente ya se estaba llevando 30 días. Las 12 horas sólo se cumplían por el
 *  camino secundario.
 *
 *  Y al homologar la entrada a Google o contraseña (16-sep-2026), amarrar la
 *  duración al camino habría vuelto el hueco la regla: nadie entraría ya por el
 *  único camino corto.
 *
 *  Quien tiene un `acceso` activo —un cliente de peek101, alguien de obra en
 *  quell101— trae 12 horas. Un socio o la oficina, 30 días. Un celular de obra
 *  perdido da medio día de acceso, no un mes, y eso ya no depende de por dónde
 *  entró su dueño.
 *
 *  Si alguien fuera las dos cosas a la vez —tiene membresía Y acceso— gana la
 *  corta. Un `acceso` tiene una sola fila por usuario y se le pone a clientes y
 *  a personal, así que no debería pasar; y si pasa, equivocarse del lado de la
 *  sesión corta cuesta un login y no una cuenta. */
export async function vidaDe(env: Env, usuario_id: string): Promise<number> {
  return (await acceso(env, usuario_id)) ? VIDA_ACCESO : VIDA_MIEMBRO;
}

export async function acceso(env: Env, usuario_id: string): Promise<Acceso | null> {
  const f = await env.MASTER.prepare(`SELECT * FROM accesos WHERE usuario_id = ? AND activo = 1`)
    .bind(usuario_id)
    .first<{ usuario_id: string; org_id: string; tipo: TipoAcceso; ref_id: string; activo: number }>();
  return f ? { ...f, activo: !!f.activo } : null;
}

export async function ponerAcceso(env: Env, a: { usuario_id: string; org_id: string; tipo: TipoAcceso; ref_id: string }): Promise<void> {
  await env.MASTER.prepare(
    `INSERT INTO accesos (usuario_id, org_id, tipo, ref_id, activo) VALUES (?,?,?,?,1)
     ON CONFLICT(usuario_id) DO UPDATE SET org_id = excluded.org_id, tipo = excluded.tipo, ref_id = excluded.ref_id, activo = 1`,
  ).bind(a.usuario_id, a.org_id, a.tipo, a.ref_id).run();
}

/** Apaga el acceso sin borrarlo: el usuario y su PIN se quedan, y volver a
 *  `ponerAcceso` lo prende otra vez. La puerta de /orgs/:o/* filtra activo = 1. */
export async function quitarAcceso(env: Env, usuario_id: string): Promise<void> {
  await env.MASTER.prepare(`UPDATE accesos SET activo = 0 WHERE usuario_id = ?`).bind(usuario_id).run();
}

/** El usuario ligado a un cliente o persona de una org, si lo hay. */
export async function accesoDe(env: Env, org_id: string, tipo: TipoAcceso, ref_id: string): Promise<Acceso | null> {
  const f = await env.MASTER.prepare(`SELECT * FROM accesos WHERE org_id = ? AND tipo = ? AND ref_id = ?`)
    .bind(org_id, tipo, ref_id)
    .first<{ usuario_id: string; org_id: string; tipo: TipoAcceso; ref_id: string; activo: number }>();
  return f ? { ...f, activo: !!f.activo } : null;
}

/** Quita del D1 todo lo de una org. Solo lo llama DELETE /admin/orgs/:o, que
 *  fuera de producción existe y en producción contesta 403. Los usuarios se
 *  quedan: pueden ser miembros de otra empresa. */
export async function borrarOrg(env: Env, org_id: string): Promise<void> {
  await env.MASTER.batch([
    env.MASTER.prepare(`DELETE FROM accesos WHERE org_id = ?`).bind(org_id),
    env.MASTER.prepare(`DELETE FROM miembros WHERE org_id = ?`).bind(org_id),
    env.MASTER.prepare(`DELETE FROM invitaciones WHERE org_id = ?`).bind(org_id),
    env.MASTER.prepare(`DELETE FROM orgs WHERE id = ?`).bind(org_id),
  ]);
}

/* ─────────────── importación (fase 2) ───────────────
 * Un usuario que viene de Firebase Auth conserva su uid como `id`: es lo que
 * `clientes.usuario_id` ya apunta del otro lado, y cambiarlo rompería el
 * enlace del portal. El PIN no viaja: está hasheado con otro esquema y no se
 * puede traducir. Se vuelve a fijar por «olvidé mi PIN». */

export type SuerteUsuario = 'creado' | 'ya_estaba' | 'correo_de_otro';

export async function importarUsuario(
  env: Env,
  u: { id: string; correo: string; nombre: string | null },
): Promise<{ usuario_id: string; suerte: SuerteUsuario }> {
  const correo = normalizaCorreo(u.correo);

  // `usuarios.correo` es UNIQUE. Si ese correo ya es de otro id, manda el que
  // ya existe: duplicar a la persona sería peor que perder su uid viejo, y se
  // dice cuál pasó para que quede en el reporte.
  const porCorreo = await env.MASTER.prepare(`SELECT id FROM usuarios WHERE correo = ?`).bind(correo).first<{ id: string }>();
  if (porCorreo && porCorreo.id !== u.id) {
    return { usuario_id: porCorreo.id, suerte: 'correo_de_otro' };
  }

  const porId = await env.MASTER.prepare(`SELECT id FROM usuarios WHERE id = ?`).bind(u.id).first<{ id: string }>();
  if (porId) {
    await env.MASTER.prepare(`UPDATE usuarios SET correo = ?, nombre = COALESCE(?, nombre) WHERE id = ?`)
      .bind(correo, u.nombre, u.id).run();
    return { usuario_id: u.id, suerte: 'ya_estaba' };
  }

  await env.MASTER.prepare(`INSERT INTO usuarios (id, correo, nombre, creado_at) VALUES (?,?,?,?)`)
    .bind(u.id, correo, u.nombre, ahora()).run();
  return { usuario_id: u.id, suerte: 'creado' };
}

export async function esSuperadmin(env: Env, usuario_id: string): Promise<boolean> {
  const f = await env.MASTER.prepare(`SELECT 1 AS x FROM superadmins WHERE usuario_id = ?`).bind(usuario_id).first();
  return !!f;
}

/* ─────────────── superadmins por ruta (contrato 0.5.0) ─────────────── */

export async function superadmins(env: Env): Promise<Superadmin[]> {
  const r = await env.MASTER.prepare(
    `SELECT s.usuario_id, u.correo, u.nombre FROM superadmins s JOIN usuarios u ON u.id = s.usuario_id ORDER BY u.correo`,
  ).all<Superadmin>();
  return r.results ?? [];
}

export async function ponerSuperadmin(env: Env, usuario_id: string): Promise<void> {
  await env.MASTER.prepare(`INSERT OR IGNORE INTO superadmins (usuario_id) VALUES (?)`).bind(usuario_id).run();
}

export async function quitarSuperadmin(env: Env, usuario_id: string): Promise<void> {
  await env.MASTER.prepare(`DELETE FROM superadmins WHERE usuario_id = ?`).bind(usuario_id).run();
}

/* ─────────────── la bitácora del panel (contrato 0.5.0) ───────────────
 * Quién cambió qué en el directorio. La escribe la API sola; nadie desde
 * fuera. Un renglón por campo que de verdad cambió. */

export async function apuntaAdmin(
  env: Env,
  r: { quien: string; org_id: string | null; campo: string; antes?: unknown; despues?: unknown },
): Promise<void> {
  const txt = (v: unknown) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));
  await env.MASTER.prepare(`INSERT INTO bitacora_admin (cuando, quien, org_id, campo, antes, despues) VALUES (?,?,?,?,?,?)`)
    .bind(ahora(), r.quien, r.org_id, r.campo, txt(r.antes), txt(r.despues))
    .run();
}

export async function bitacoraAdmin(env: Env, org_id: string | null, limite = 200): Promise<RenglonBitacoraAdmin[]> {
  const r = org_id === null
    ? await env.MASTER.prepare(`SELECT * FROM bitacora_admin ORDER BY id DESC LIMIT ?`).bind(limite).all<RenglonBitacoraAdmin>()
    : await env.MASTER.prepare(`SELECT * FROM bitacora_admin WHERE org_id = ? ORDER BY id DESC LIMIT ?`).bind(org_id, limite).all<RenglonBitacoraAdmin>();
  return r.results ?? [];
}

/* ─────────────── conteos por empresa (contrato 0.5.0) ───────────────
 * Dos consultas agrupadas, no una por empresa: con cien empresas en staging
 * eso serían doscientas idas al D1 por cada vez que se abre master101. */

export async function conteosDeOrgs(env: Env): Promise<Map<string, { personas: number; ultima_entrada: string | null }>> {
  const conteos = new Map<string, { personas: number; ultima_entrada: string | null }>();
  const personas = await env.MASTER.prepare(`SELECT org_id, COUNT(*) AS n FROM miembros GROUP BY org_id`).all<{ org_id: string; n: number }>();
  for (const f of personas.results ?? []) conteos.set(f.org_id, { personas: f.n, ultima_entrada: null });
  const entradas = await env.MASTER.prepare(
    `SELECT m.org_id, MAX(s.creado_at) AS ultima FROM sesiones s JOIN miembros m ON m.usuario_id = s.usuario_id GROUP BY m.org_id`,
  ).all<{ org_id: string; ultima: string | null }>();
  for (const f of entradas.results ?? []) {
    const c = conteos.get(f.org_id) ?? { personas: 0, ultima_entrada: null };
    c.ultima_entrada = f.ultima;
    conteos.set(f.org_id, c);
  }
  return conteos;
}

export function conConteos(o: Org, conteos: Map<string, { personas: number; ultima_entrada: string | null }>): OrgConConteos {
  const c = conteos.get(o.id);
  return { ...o, personas: c?.personas ?? 0, ultima_entrada: c?.ultima_entrada ?? null };
}

/** Mike entra la primera vez sin que nadie lo dé de alta: si no hay ningún
 *  superadmin todavía, el correo configurado se vuelve el primero. Después de
 *  eso esta puerta se cierra sola, porque ya hay uno. */
export async function sembrarSuperadmin(env: Env, usuario_id: string, correo: string): Promise<boolean> {
  if (!env.CORREO_SUPERADMIN || normalizaCorreo(correo) !== normalizaCorreo(env.CORREO_SUPERADMIN)) return false;
  const hay = await env.MASTER.prepare(`SELECT COUNT(*) AS n FROM superadmins`).first<{ n: number }>();
  if ((hay?.n ?? 0) > 0) return false;
  await env.MASTER.prepare(`INSERT OR IGNORE INTO superadmins (usuario_id) VALUES (?)`).bind(usuario_id).run();
  return true;
}

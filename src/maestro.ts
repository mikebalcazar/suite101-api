/* Todo lo que toca el D1 «master». Ninguna otra parte del Worker escribe SQL
 * contra el directorio: si algo falta, se agrega aquí. */

import { ahora, enSegundos, firmarId, normalizaCorreo, ulid } from './lib';
import type { App, Org, Rol, TipoAcceso, Usuario } from '../schema/tipos';
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

export async function usuarioPorCorreo(env: Env, correo: string): Promise<Usuario & { pin_hash: string | null } | null> {
  return env.MASTER.prepare(`SELECT * FROM usuarios WHERE correo = ?`)
    .bind(normalizaCorreo(correo))
    .first<Usuario & { pin_hash: string | null }>();
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

export async function abrirSesion(env: Env, usuario_id: string, app: App, vida: number): Promise<{ cookie: string; id: string }> {
  const id = ulid() + '-' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await env.MASTER.prepare(`INSERT INTO sesiones (id, usuario_id, app, expira_at, creado_at) VALUES (?,?,?,?,?)`)
    .bind(id, usuario_id, app, enSegundos(vida), ahora())
    .run();
  return { cookie: await firmarId(id, await secretoDe(env)), id };
}

export async function leerSesion(env: Env, id: string): Promise<{ usuario_id: string; app: string } | null> {
  const s = await env.MASTER.prepare(`SELECT usuario_id, app, expira_at FROM sesiones WHERE id = ?`)
    .bind(id)
    .first<{ usuario_id: string; app: string; expira_at: string }>();
  if (!s || s.expira_at < ahora()) return null;
  return { usuario_id: s.usuario_id, app: s.app };
}

export async function cerrarSesion(env: Env, id: string): Promise<void> {
  await env.MASTER.prepare(`DELETE FROM sesiones WHERE id = ?`).bind(id).run();
}

/* ─────────────── orgs, miembros, accesos ─────────────── */

interface FilaOrg { id: string; nombre: string; plan: string; apps: string; moneda: string; activa: number; creado_at: string }

const armaOrg = (f: FilaOrg): Org => ({
  ...f,
  activa: !!f.activa,
  apps: JSON.parse(f.apps || '{}'),
});

export async function org(env: Env, id: string): Promise<Org | null> {
  const f = await env.MASTER.prepare(`SELECT * FROM orgs WHERE id = ?`).bind(id).first<FilaOrg>();
  return f ? armaOrg(f) : null;
}

export async function orgs(env: Env): Promise<Org[]> {
  const r = await env.MASTER.prepare(`SELECT * FROM orgs ORDER BY nombre`).all<FilaOrg>();
  return (r.results ?? []).map(armaOrg);
}

export async function crearOrg(
  env: Env,
  datos: { id: string; nombre: string; plan?: string; apps?: Record<string, boolean>; moneda?: string },
): Promise<Org> {
  const fila = {
    id: datos.id,
    nombre: datos.nombre,
    plan: datos.plan ?? 'base',
    apps: JSON.stringify(datos.apps ?? { dash: true, quell: true, peek: true, cotizador: true, roster: true, nest: true }),
    moneda: datos.moneda ?? 'MXN',
    activa: 1,
    creado_at: ahora(),
  };
  await env.MASTER.prepare(`INSERT INTO orgs (id, nombre, plan, apps, moneda, activa, creado_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(fila.id, fila.nombre, fila.plan, fila.apps, fila.moneda, fila.activa, fila.creado_at)
    .run();
  return armaOrg(fila as FilaOrg);
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

export interface Acceso { usuario_id: string; org_id: string; tipo: TipoAcceso; ref_id: string; activo: boolean }

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

export async function esSuperadmin(env: Env, usuario_id: string): Promise<boolean> {  const f = await env.MASTER.prepare(`SELECT 1 AS x FROM superadmins WHERE usuario_id = ?`).bind(usuario_id).first();
  return !!f;
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

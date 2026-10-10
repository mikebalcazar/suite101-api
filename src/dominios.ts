/* El dominio propio de cada empresa (2-oct-2026).
 *
 * Mike: «cuando abra una nueva empresa, quiero poder poner su dominio en la
 * plataforma (desde master101) y que al abrirla les abra sus portales
 * personalizados (ej. roster101.dominioempresa.com, quote101.dominioempresa.com,
 * suite101.dominioempresa.com, etc)». Decidió: dominio propio con alta
 * automática en Cloudflare (Cloudflare for SaaS). El cómo completo está en
 * DOMINIOS.md.
 *
 * Lo que vive aquí:
 *   · la forma de un dominio y los nombres que salen de él (uno por app, sin
 *     el «101» salvo suite101; master101 no: ése es sólo de Mike);
 *   · hablar con Cloudflare para dar de alta, leer y borrar cada nombre como
 *     custom hostname de la zona (token `CLOUDFLARE_SAAS_TOKEN`, de Mike);
 *   · un DOBLE de Cloudflare para las pruebas (ENTORNO 'prueba'), que se
 *     comporta como el de verdad: nace pendiente y se activa al releerlo;
 *   · resolver un host (roster.acme.com) a su empresa y su app, que es lo
 *     que la puerta de las empresas (puerta/) le pregunta a la API.
 */

import type { Env } from './entorno';
import { ahora } from './lib';

/** Las apps que tienen puerta propia en el dominio de la empresa. master101
 *  no está a propósito: «ese solo lo tengo yo» (Mike, 2-oct). Desde el
 *  10-oct-2026 son TODAS (Mike: «ya necesito que todas las apps funcionen
 *  con el dominio de la empresa»): se suman cost101, patron101 y bill101. */
export const APPS_DOMINIO = ['dash101', 'quell101', 'quote101', 'cost101', 'patron101', 'bill101', 'supply101', 'roster101', 'peek101', 'workshop101', 'suite101'] as const;
export type AppDominio = (typeof APPS_DOMINIO)[number];

/** La primera palabra del nombre en el dominio de la empresa. Mike, 9-oct:
 *  «son sin el "101" para los dominios. Para los logos y nombres sí van con
 *  "101"»: quell.acme.com, quote.acme.com. La plataforma lo conserva
 *  (contestado con botones el mismo día): suite101.acme.com. */
export const PREFIJO: Record<AppDominio, string> = {
  dash101: 'dash', quell101: 'quell', quote101: 'quote', cost101: 'cost', patron101: 'patron', bill101: 'bill',
  supply101: 'supply', roster101: 'roster', peek101: 'peek', workshop101: 'workshop', suite101: 'suite101',
};
const APP_DE_PREFIJO: Record<string, AppDominio> = Object.fromEntries(APPS_DOMINIO.map((a) => [PREFIJO[a], a]));

/** Dominios que son nuestros y no de una empresa: nunca se dan de alta.
 *  taller101.mx NO está: Mike lo escogió como el dominio de prueba de la
 *  puerta (9-oct), y se da de alta como el de una empresa más. */
const NUESTROS = ['taller101.com', 'workers.dev', 'suite101.mx', 'suite101.app'];

/** Deja el dominio limpio (minúsculas, sin protocolo, sin ruta, sin «www.»)
 *  o devuelve null si no tiene forma de dominio. */
export function dominioLimpio(entrada: unknown): string | null {
  let d = String(entrada ?? '').trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').split('/')[0].split('?')[0].replace(/\.$/, '');
  if (d.startsWith('www.')) d = d.slice(4);
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d)) return null;
  if (NUESTROS.some((n) => d === n || d.endsWith('.' + n))) return null;
  return d;
}

/** Los nombres de una empresa, uno por app: quell.acme.com, …, suite101.acme.com. */
export const nombresDe = (dominio: string): Array<{ app: AppDominio; hostname: string }> =>
  APPS_DOMINIO.map((app) => ({ app, hostname: `${PREFIJO[app]}.${dominio}` }));

/** Parte un host en su app y su dominio: roster.acme.com → roster101 +
 *  acme.com. Null si la primera palabra no es una app con puerta. */
export function partirHost(host: string): { app: AppDominio; dominio: string } | null {
  const h = String(host ?? '').trim().toLowerCase().split(':')[0];
  const i = h.indexOf('.');
  if (i <= 0) return null;
  const app = APP_DE_PREFIJO[h.slice(0, i)];
  const dominio = h.slice(i + 1);
  if (!app || !dominio) return null;
  return { app, dominio };
}

/* ─────────────── Cloudflare ─────────────── */

export interface NombreCloudflare {
  id: string;
  hostname: string;
  /** 'pending' | 'active' | 'moved' | 'deleted' | 'blocked' … tal como lo dice Cloudflare. */
  status: string;
  ssl?: { status?: string; validation_errors?: Array<{ message?: string }> };
}

export interface ClienteCloudflare {
  crear(hostname: string): Promise<NombreCloudflare>;
  leer(id: string): Promise<NombreCloudflare | null>;
  borrar(id: string): Promise<void>;
}

const API_CF = 'https://api.cloudflare.com/client/v4';

/** El de verdad. Pide el id de la zona por su nombre una vez por isolate. */
class CloudflareReal implements ClienteCloudflare {
  private zona: Promise<string> | null = null;
  constructor(private token: string, private nombreZona: string) {}

  private async pedir<T>(ruta: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; result: T; errors: Array<{ message: string }> }> {
    const r = await fetch(`${API_CF}${ruta}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
    });
    const cuerpo = (await r.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: Array<{ message: string }> };
    return { ok: !!cuerpo.success, status: r.status, result: cuerpo.result as T, errors: cuerpo.errors ?? [] };
  }

  private zoneId(): Promise<string> {
    if (!this.zona) {
      this.zona = this.pedir<Array<{ id: string }>>(`/zones?name=${encodeURIComponent(this.nombreZona)}`).then((r) => {
        const id = r.ok && r.result?.[0]?.id;
        if (!id) { this.zona = null; throw new Error(`cloudflare: no se encontró la zona ${this.nombreZona}: ${r.errors.map((e) => e.message).join('; ') || r.status}`); }
        return id;
      });
    }
    return this.zona;
  }

  async crear(hostname: string): Promise<NombreCloudflare> {
    const z = await this.zoneId();
    const r = await this.pedir<NombreCloudflare>(`/zones/${z}/custom_hostnames`, {
      method: 'POST',
      body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } }),
    });
    if (!r.ok) {
      /* Si ya existía (otro intento, otra empresa que lo soltó), se busca y se
       * adopta: dar de alta dos veces no es un error, es la misma intención. */
      const ya = await this.pedir<NombreCloudflare[]>(`/zones/${z}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
      if (ya.ok && ya.result?.[0]) return ya.result[0];
      throw new Error(`cloudflare: no se pudo dar de alta ${hostname}: ${r.errors.map((e) => e.message).join('; ') || r.status}`);
    }
    return r.result;
  }

  async leer(id: string): Promise<NombreCloudflare | null> {
    const z = await this.zoneId();
    const r = await this.pedir<NombreCloudflare>(`/zones/${z}/custom_hostnames/${id}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`cloudflare: no se pudo leer ${id}: ${r.errors.map((e) => e.message).join('; ') || r.status}`);
    return r.result;
  }

  async borrar(id: string): Promise<void> {
    const z = await this.zoneId();
    const r = await this.pedir(`/zones/${z}/custom_hostnames/${id}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new Error(`cloudflare: no se pudo borrar ${id}: ${r.errors.map((e) => e.message).join('; ') || r.status}`);
  }
}

/** El doble para pruebas: en memoria del isolate. Nace pendiente y se activa
 *  la segunda vez que se lee, que es lo que pasa en la vida real cuando la
 *  empresa pone su CNAME. */
const DOBLE = new Map<string, NombreCloudflare>();
class CloudflareDoble implements ClienteCloudflare {
  async crear(hostname: string): Promise<NombreCloudflare> {
    const ya = [...DOBLE.values()].find((n) => n.hostname === hostname);
    if (ya) return ya;
    const n: NombreCloudflare = { id: `cf-${crypto.randomUUID().slice(0, 8)}`, hostname, status: 'pending', ssl: { status: 'pending_validation' } };
    DOBLE.set(n.id, n);
    return n;
  }
  async leer(id: string): Promise<NombreCloudflare | null> {
    const n = DOBLE.get(id);
    if (!n) return null;
    if (n.status === 'pending') { n.status = 'active'; n.ssl = { status: 'active' }; }
    return n;
  }
  async borrar(id: string): Promise<void> { DOBLE.delete(id); }
}

/** Con qué Cloudflare se habla. Sin token: null, y las rutas contestan 503
 *  `dominio_no_configurado` (DOMINIOS.md). En pruebas, el doble. */
export function cloudflareDe(env: Env): ClienteCloudflare | null {
  if (env.ENTORNO === 'prueba') return new CloudflareDoble();
  if (!env.CLOUDFLARE_SAAS_TOKEN) return null;
  return new CloudflareReal(env.CLOUDFLARE_SAAS_TOKEN, env.ZONA_SAAS || 'taller101.com');
}

/* ─────────────── el directorio ─────────────── */

export interface NombreDeDominio {
  hostname: string; app: AppDominio; cf_id: string | null;
  estado: 'pendiente' | 'activo' | 'error'; ssl: string | null; detalle: string | null; actualizado_at: string;
}

const estadoDe = (n: NombreCloudflare): { estado: NombreDeDominio['estado']; ssl: string | null; detalle: string | null } => {
  const errores = (n.ssl?.validation_errors ?? []).map((e) => e.message).filter(Boolean).join(' · ') || null;
  if (n.status === 'active' && (n.ssl?.status ?? 'active') === 'active') return { estado: 'activo', ssl: n.ssl?.status ?? 'active', detalle: null };
  if (['moved', 'deleted', 'blocked'].includes(n.status)) return { estado: 'error', ssl: n.ssl?.status ?? null, detalle: errores ?? `cloudflare dice ${n.status}` };
  return { estado: 'pendiente', ssl: n.ssl?.status ?? null, detalle: errores };
};

export async function nombresDeLaOrg(env: Env, org_id: string): Promise<NombreDeDominio[]> {
  const r = await env.MASTER.prepare(`SELECT hostname, app, cf_id, estado, ssl, detalle, actualizado_at FROM dominios_nombres WHERE org_id = ? ORDER BY app`).bind(org_id).all<NombreDeDominio>();
  // En el orden de APPS_DOMINIO, que es el de la puerta de la suite.
  return (r.results ?? []).sort((a, b) => APPS_DOMINIO.indexOf(a.app) - APPS_DOMINIO.indexOf(b.app));
}

/** Da de alta en Cloudflare los nombres que falten de la empresa y los
 *  apunta en el directorio. Vuelve a correrse sin miedo: lo que ya estaba se
 *  queda. */
export async function darDeAltaNombres(env: Env, cf: ClienteCloudflare, org_id: string, dominio: string): Promise<NombreDeDominio[]> {
  const ya = new Set((await nombresDeLaOrg(env, org_id)).map((n) => n.hostname));
  for (const { app, hostname } of nombresDe(dominio)) {
    if (ya.has(hostname)) continue;
    let fila: Omit<NombreDeDominio, 'hostname' | 'app' | 'actualizado_at'>;
    try {
      const n = await cf.crear(hostname);
      fila = { cf_id: n.id, ...estadoDe(n) };
    } catch (e) {
      fila = { cf_id: null, estado: 'error', ssl: null, detalle: e instanceof Error ? e.message : String(e) };
    }
    await env.MASTER.prepare(
      `INSERT INTO dominios_nombres (hostname, org_id, app, cf_id, estado, ssl, detalle, actualizado_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hostname) DO UPDATE SET org_id = excluded.org_id, app = excluded.app, cf_id = excluded.cf_id, estado = excluded.estado, ssl = excluded.ssl, detalle = excluded.detalle, actualizado_at = excluded.actualizado_at`,
    ).bind(hostname, org_id, app, fila.cf_id, fila.estado, fila.ssl, fila.detalle, ahora()).run();
  }
  return nombresDeLaOrg(env, org_id);
}

/** Vuelve a preguntarle a Cloudflare por los que no están activos. */
export async function refrescarNombres(env: Env, cf: ClienteCloudflare, org_id: string): Promise<NombreDeDominio[]> {
  for (const n of await nombresDeLaOrg(env, org_id)) {
    if (n.estado === 'activo') continue;
    if (!n.cf_id) continue;
    try {
      const vivo = await cf.leer(n.cf_id);
      const e = vivo ? estadoDe(vivo) : { estado: 'error' as const, ssl: null, detalle: 'Cloudflare ya no tiene este nombre' };
      await env.MASTER.prepare(`UPDATE dominios_nombres SET estado = ?, ssl = ?, detalle = ?, actualizado_at = ? WHERE hostname = ?`)
        .bind(e.estado, e.ssl, e.detalle, ahora(), n.hostname).run();
    } catch (e) {
      await env.MASTER.prepare(`UPDATE dominios_nombres SET detalle = ?, actualizado_at = ? WHERE hostname = ?`)
        .bind(e instanceof Error ? e.message : String(e), ahora(), n.hostname).run();
    }
  }
  return nombresDeLaOrg(env, org_id);
}

/** Quita los nombres de la empresa: en Cloudflare y en el directorio. */
export async function quitarNombres(env: Env, cf: ClienteCloudflare | null, org_id: string): Promise<void> {
  for (const n of await nombresDeLaOrg(env, org_id)) {
    if (cf && n.cf_id) { try { await cf.borrar(n.cf_id); } catch { /* si Cloudflare no lo tiene, da igual */ } }
  }
  await env.MASTER.prepare(`DELETE FROM dominios_nombres WHERE org_id = ?`).bind(org_id).run();
}

/* ─────────────── resolver un host ─────────────── */

export interface DominioResuelto { org_id: string; nombre: string; dominio: string; app: AppDominio; activa: boolean }

const CACHE = new Map<string, { hasta: number; valor: DominioResuelto | null }>();
const VIDA_CACHE_MS = 60_000;

/** roster.acme.com → la empresa dueña de acme.com y la app. Null si no
 *  hay. Se guarda un minuto por isolate: la puerta pregunta en cada
 *  petición. */
export async function resolverHost(env: Env, host: string): Promise<DominioResuelto | null> {
  const parte = partirHost(host);
  if (!parte) return null;
  const llave = parte.dominio;
  const c = CACHE.get(llave);
  let org: { id: string; nombre: string; activa: number } | null;
  if (c && c.hasta > Date.now()) {
    org = c.valor ? { id: c.valor.org_id, nombre: c.valor.nombre, activa: c.valor.activa ? 1 : 0 } : null;
  } else {
    org = await env.MASTER.prepare(`SELECT id, nombre, activa FROM orgs WHERE dominio = ?`).bind(parte.dominio).first<{ id: string; nombre: string; activa: number }>();
    CACHE.set(llave, { hasta: Date.now() + VIDA_CACHE_MS, valor: org ? { org_id: org.id, nombre: org.nombre, dominio: parte.dominio, app: parte.app, activa: !!org.activa } : null });
  }
  if (!org) return null;
  return { org_id: org.id, nombre: org.nombre, dominio: parte.dominio, app: parte.app, activa: !!org.activa };
}

/** Para cuando el directorio cambia (PATCH dominio): que no se sirva un
 *  minuto de verdad vieja. */
export const olvidarDominio = (dominio: string | null | undefined): void => { if (dominio) CACHE.delete(dominio); };

/** ¿Este origen (https://dash.acme.com) es la puerta de una empresa con
 *  dominio? Lo pregunta el regreso de Google. */
export async function origenDeEmpresa(env: Env, origen: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(origen); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const r = await resolverHost(env, u.hostname);
  return !!r && r.activa;
}

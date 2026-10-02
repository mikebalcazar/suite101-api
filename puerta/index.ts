/* La puerta de las empresas (2-oct-2026). Ver puerta/destino.ts y DOMINIOS.md.
 *
 * Corre en la ruta comodín de la zona taller101.com. Lo nuestro pasa tal cual;
 * un dominio de empresa se resuelve en la API (service binding, con caché de
 * un minuto en el isolate) y se reenvía al Worker de la app que dice la
 * primera palabra del host. No toca sesiones ni cuerpos: es un cartero.
 */
import { BINDINGS, cabecerasDeEmpresa, destinoDe, paginaDeNadie } from './destino';

interface Servicio { fetch(req: Request): Promise<Response> }
type Env = { API: Servicio } & Partial<Record<string, Servicio>>;

type Resuelto = { org_id: string; nombre: string; dominio: string; app: string };
const CACHE = new Map<string, { hasta: number; valor: Resuelto | null; estado: number }>();
const VIDA_MS = 60_000;

async function resolver(env: Env, host: string): Promise<{ valor: Resuelto | null; estado: number }> {
  const c = CACHE.get(host);
  if (c && c.hasta > Date.now()) return c;
  let valor: Resuelto | null = null;
  let estado = 404;
  try {
    const r = await env.API.fetch(new Request(`https://suite101-api/dominios/resolver?host=${encodeURIComponent(host)}`));
    estado = r.status;
    if (r.ok) valor = ((await r.json()) as { data: Resuelto }).data;
  } catch {
    estado = 503;
  }
  // Un 5xx no se guarda: a la siguiente se vuelve a preguntar.
  if (estado < 500) CACHE.set(host, { hasta: Date.now() + VIDA_MS, valor, estado });
  return { valor, estado };
}

const html = (cuerpo: string, status: number) =>
  new Response(cuerpo, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    const d = destinoDe(u.hostname);
    if (d.tipo === 'propio') return fetch(req);
    if (d.tipo === 'nadie') return html(paginaDeNadie(d.host, d.motivo), 404);

    const { valor, estado } = await resolver(env, d.host);
    if (!valor) return html(paginaDeNadie(d.host, estado === 403 ? 'org_inactiva' : 'sin_dominio'), estado === 403 ? 403 : 404);

    const servicio = env[d.binding];
    if (!servicio) return html(paginaDeNadie(d.host, 'sin_app'), 503);
    const h = cabecerasDeEmpresa(req.headers, { dominio: d.dominio, host: d.host, org_id: valor.org_id });
    h.set('X-Empresa-Nombre', encodeURIComponent(valor.nombre));
    return servicio.fetch(new Request(req, { headers: h }));
  },
};

export { BINDINGS };

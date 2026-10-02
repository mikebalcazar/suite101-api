/* La puerta de las empresas: a dónde va cada petición (2-oct-2026).
 *
 * Mike: «que al abrirla les abra sus portales personalizados (ej.
 * roster101.dominioempresa.com, quote101.dominioempresa.com,
 * suite101.dominioempresa.com)».
 *
 * Este Worker recibe TODO lo que entra a la zona taller101.com (la ruta comodín de la zona,
 * que es como Cloudflare for SaaS manda el tráfico de los dominios de las
 * empresas: DOMINIOS.md). La regla es una sola y vive aquí, sin bindings,
 * para poder medirla sin red:
 *
 *   · lo nuestro (taller101.com y sus subdominios) pasa tal cual: `fetch(req)`
 *     va al origen de siempre —el Worker con dominio propio de cada app—;
 *   · roster101.acme.com va al Worker de roster101 (t101-portal) por su enlace
 *     de servicio, con `X-Dominio-Empresa: acme.com` y `X-Host-Original`;
 *     la API vuelve a resolver el dominio y acota la sesión a esa empresa;
 *   · una primera palabra que no es una app con puerta (master101, www,
 *     nada) es una página que dice que esa dirección no es de la suite.
 */

/** La primera palabra del host → el binding del Worker de esa app. */
export const BINDINGS: Record<string, string> = {
  dash101: 'DASH',
  quell101: 'QUELL',
  quote101: 'QUOTE',
  supply101: 'SUPPLY',
  roster101: 'ROSTER',
  peek101: 'PEEK',
  workshop101: 'WORKSHOP',
  suite101: 'API',
};

export const ZONAS_PROPIAS = ['taller101.com'];

export type Destino =
  | { tipo: 'propio' }
  | { tipo: 'empresa'; app: string; binding: string; dominio: string; host: string }
  | { tipo: 'nadie'; host: string; motivo: 'sin_app' | 'sin_dominio' };

export function destinoDe(hostCrudo: string, zonas: string[] = ZONAS_PROPIAS): Destino {
  const host = String(hostCrudo ?? '').trim().toLowerCase().split(':')[0];
  if (zonas.some((z) => host === z || host.endsWith('.' + z))) return { tipo: 'propio' };
  const i = host.indexOf('.');
  if (i <= 0 || i === host.length - 1) return { tipo: 'nadie', host, motivo: 'sin_dominio' };
  const app = host.slice(0, i);
  const dominio = host.slice(i + 1);
  const binding = BINDINGS[app];
  if (!binding) return { tipo: 'nadie', host, motivo: 'sin_app' };
  return { tipo: 'empresa', app, binding, dominio, host };
}

/** Lo que se le agrega a la petición antes de pasarla a la app. */
export function cabecerasDeEmpresa(entrantes: Headers, d: { dominio: string; host: string; org_id: string }): Headers {
  const h = new Headers(entrantes);
  h.set('X-Dominio-Empresa', d.dominio);
  h.set('X-Host-Original', d.host);
  h.set('X-Org-Empresa', d.org_id);
  return h;
}

/** La página para una dirección que no es de nadie. Sin marcas de la
 *  empresa: no sabemos de quién es. */
export function paginaDeNadie(host: string, motivo: Destino extends { motivo: infer M } ? M : string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const dice = motivo === 'sin_app'
    ? 'Esta dirección no corresponde a ningún programa de la suite.'
    : motivo === 'org_inactiva'
      ? 'La empresa de esta dirección está suspendida.'
      : 'Esta dirección no está dada de alta en la suite.';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Suite 101</title>
<style>body{font-family:Raleway,system-ui,sans-serif;background:#f6f7f9;color:#1b2430;margin:0;display:grid;min-height:100vh;place-items:center;padding:24px}main{max-width:460px;text-align:center}h1{color:#0080C1;font-size:1.4rem;margin:0 0 8px}p{margin:6px 0;color:#4a5568}code{background:#e9eef3;padding:2px 6px;border-radius:6px}</style></head>
<body><main><h1>Suite 101</h1><p>${dice}</p><p><code>${esc(host)}</code></p><p>Si eres de la empresa, pregúntale a quien la administra; si administras la suite, el dominio se pone en master101.</p></main></body></html>`;
}

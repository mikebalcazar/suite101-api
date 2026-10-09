/* suite101.taller101.com — la puerta de la suite (Mike, 2-oct-2026: «un
 * website base donde pueda dar click en cada aplicación para ir al portal de
 * cada aplicación»).
 *
 * Es una sola hoja con una liga por programa (cost101 entró el 7-oct-2026),
 * y la sirve ESTE Worker en un segundo
 * dominio propio en vez de un Worker aparte: un repositorio nuevo necesitaría
 * sus propios secretos de Cloudflare en GitHub, que sólo Mike puede poner, y
 * la API ya tiene el dominio, el certificado y el flujo de publicación. Lo que
 * cambia por dominio es sólo esto: en la puerta de la suite la raíz es la
 * página y lo demás no existe; en api.taller101.com la API sigue igual.
 * `/salud` contesta en los dos, para que un verificador pueda medir cualquiera. */
import type { Next } from 'hono';
import type { Ctx } from './http';
import pagina from './paginas/suite.html';
import cifras400 from './paginas/fuentes/fira-cifras-400.woff2';
import cifras600 from './paginas/fuentes/fira-cifras-600.woff2';
import raleway400 from './paginas/fuentes/raleway-400.woff2';
import raleway600 from './paginas/fuentes/raleway-600.woff2';
import raleway700 from './paginas/fuentes/raleway-700.woff2';
import raleway800 from './paginas/fuentes/raleway-800.woff2';
import iconoSvg from './paginas/icono/icono.svg';
import iconoIco from './paginas/icono/favicon.ico';
import iconoCelular from './paginas/icono/apple-touch-icon.png';

export const DOMINIO_SUITE = 'suite101.taller101.com';

/* 8-oct-2026 · las letras de la puerta viajan con ella: nada se le pide a
 * Google. Sólo estas seis, por nombre exacto. */
const FUENTES: Record<string, ArrayBuffer> = {
  '/fuentes/fira-cifras-400.woff2': cifras400,
  '/fuentes/fira-cifras-600.woff2': cifras600,
  '/fuentes/raleway-400.woff2': raleway400,
  '/fuentes/raleway-600.woff2': raleway600,
  '/fuentes/raleway-700.woff2': raleway700,
  '/fuentes/raleway-800.woff2': raleway800,
};
const fuente = (ruta: string) => FUENTES[ruta]
  ? new Response(FUENTES[ruta], { headers: { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable' } })
  : null;

/* 9-oct-2026 · el ícono que eligió Mike en sondeo.taller101.com («En
 * órbita»): el de la pestaña, el del celular y el /favicon.ico. /favicon.svg
 * sigue contestando —con el nuevo— para las páginas que ya lo tenían guardado. */
const ICONOS: Record<string, [string | ArrayBuffer, string]> = {
  '/icono.svg': [iconoSvg, 'image/svg+xml'],
  '/favicon.svg': [iconoSvg, 'image/svg+xml'],
  '/favicon.ico': [iconoIco, 'image/x-icon'],
  '/apple-touch-icon.png': [iconoCelular, 'image/png'],
};
const icono = (ruta: string) => ICONOS[ruta]
  ? new Response(ICONOS[ruta][0], { headers: { 'Content-Type': ICONOS[ruta][1], 'Cache-Control': 'public, max-age=86400' } })
  : null;

/** La misma puerta, para una empresa con dominio propio (2-oct): el nombre
 *  de la empresa arriba y cada liga a su app en SU dominio
 *  (dash101.acme.com…). Es la misma hoja con las ligas cambiadas: una sola
 *  página que mantener. */
export function paginaDeEmpresa(nombre: string, dominio: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  return pagina
    .replace(/https:\/\/(dash101|quell101|quote101|supply101|roster101|peek101|workshop101)\.taller101\.com/g, `https://$1.${dominio}`)
    .replace('</style>', '.empresa{margin:4px 0 0;font-size:1.05rem;font-weight:700;color:#86c9ec;letter-spacing:.01em}\n</style>')
    .replace('</header>', `  <p class="empresa">${esc(nombre)}</p>\n  </header>`);
}

export async function puertaDeLaSuite(c: Ctx, next: Next): Promise<Response | void> {
  const u = new URL(c.req.url);
  const dom = c.get('dominio');
  if (dom && dom.app === 'suite101') {
    if (u.pathname === '/salud') return next();
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.json({ ok: false, error: 'no_encontrado' }, 404);
    if (u.pathname === '/' || u.pathname === '/index.html') {
      return new Response(paginaDeEmpresa(dom.nombre, dom.dominio), {
        headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'private, max-age=60' },
      });
    }
    const ico = icono(u.pathname);
    if (ico) return ico;
    const letra = fuente(u.pathname);
    if (letra) return letra;
    return c.json({ ok: false, error: 'no_encontrado', detalle: { aqui_solo: ['/'] } }, 404);
  }
  if (u.hostname !== DOMINIO_SUITE) return next();
  if (u.pathname === '/salud') return next();
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return c.json({ ok: false, error: 'no_encontrado' }, 404);
  }
  if (u.pathname === '/' || u.pathname === '/index.html') {
    return new Response(pagina, {
      headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'public, max-age=300' },
    });
  }
  const ico = icono(u.pathname);
  if (ico) return ico;
  const letra = fuente(u.pathname);
  if (letra) return letra;
  return c.json({ ok: false, error: 'no_encontrado', detalle: { aqui_solo: ['/'] } }, 404);
}

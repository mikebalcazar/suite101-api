/* suite101.taller101.com — la puerta de la suite (Mike, 2-oct-2026: «un
 * website base donde pueda dar click en cada aplicación para ir al portal de
 * cada aplicación»).
 *
 * Es una sola hoja con ocho ligas, y la sirve ESTE Worker en un segundo
 * dominio propio en vez de un Worker aparte: un repositorio nuevo necesitaría
 * sus propios secretos de Cloudflare en GitHub, que sólo Mike puede poner, y
 * la API ya tiene el dominio, el certificado y el flujo de publicación. Lo que
 * cambia por dominio es sólo esto: en la puerta de la suite la raíz es la
 * página y lo demás no existe; en api.taller101.com la API sigue igual.
 * `/salud` contesta en los dos, para que un verificador pueda medir cualquiera. */
import type { Context, Next } from 'hono';
import pagina from './paginas/suite.html';

export const DOMINIO_SUITE = 'suite101.taller101.com';

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0080C1"/><text x="32" y="41" text-anchor="middle" font-family="Raleway,system-ui,sans-serif" font-weight="800" font-size="26" fill="#fff">101</text></svg>`;

export async function puertaDeLaSuite(c: Context, next: Next): Promise<Response | void> {
  const u = new URL(c.req.url);
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
  if (u.pathname === '/favicon.svg') {
    return new Response(FAVICON, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
  }
  return c.json({ ok: false, error: 'no_encontrado', detalle: { aqui_solo: ['/'] } }, 404);
}

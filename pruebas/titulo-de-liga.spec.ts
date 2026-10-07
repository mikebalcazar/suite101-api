/* El título de la página de una liga · 0.79.0
 *
 * Mike, 7-oct: «las ligas que se agreguen y que se identifican, en donde
 * aparece el link arriba, sólo pon el título de la página a la que liga, no
 * todo el link».
 *
 * Lo que aportan: que el título salga bien escrito (entidades, espacios,
 * og:title de respaldo), que la ruta NO vaya a hosts internos ni a nada que
 * no sea http(s), y que sólo la use quien es de la empresa. */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { tituloDeHtml, tituloDeLiga, urlPermitida } from '../src/titulo';

describe('el título de un HTML', () => {
  it('<title> con entidades y espacios de más', () => {
    expect(tituloDeHtml('<html><head><title>\n  Herrajes &amp; Correderas &#8211; Blum   M&eacute;xico </title>')).toBe('Herrajes & Correderas – Blum México');
  });
  it('si no hay <title>, el og:title', () => {
    expect(tituloDeHtml('<meta property="og:title" content="Catálogo 2026 · Hettich">')).toBe('Catálogo 2026 · Hettich');
    expect(tituloDeHtml('<title> </title><meta content="Respaldo" property="og:title">')).toBe('Respaldo');
  });
  it('sin título: null', () => {
    expect(tituloDeHtml('<html><body>hola</body></html>')).toBeNull();
  });
});

describe('a dónde sí se va a buscar', () => {
  it('http(s) a sitios públicos, con o sin protocolo', () => {
    expect(urlPermitida('https://www.blum.com/mx/es/')?.hostname).toBe('www.blum.com');
    expect(urlPermitida('www.taller101.com')?.toString()).toBe('https://www.taller101.com/');
  });
  it('nunca a la red de adentro ni a otro protocolo', () => {
    for (const u of ['http://localhost:8787/x', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://[::1]/', 'http://intranet/', 'http://algo.local/', 'ftp://ejemplo.mx/', 'javascript:alert(1)', 'https://usuario:clave@ejemplo.mx/', 'no es liga']) {
      expect(urlPermitida(u), u).toBeNull();
    }
  });
});

describe('leer la página', () => {
  const respuesta = (cuerpo: string, tipo = 'text/html; charset=utf-8', status = 200) =>
    (async () => new Response(cuerpo, { status, headers: { 'content-type': tipo } })) as unknown as typeof fetch;
  it('trae el título de la página', async () => {
    expect(await tituloDeLiga(new URL('https://ejemplo.mx/'), respuesta('<title>Plano de cocina</title><body>…</body>'))).toBe('Plano de cocina');
  });
  it('lo que no es HTML, o no contesta bien, da null', async () => {
    expect(await tituloDeLiga(new URL('https://ejemplo.mx/a.pdf'), respuesta('%PDF-1.7', 'application/pdf'))).toBeNull();
    expect(await tituloDeLiga(new URL('https://ejemplo.mx/'), respuesta('<title>Error</title>', 'text/html', 404))).toBeNull();
    expect(await tituloDeLiga(new URL('https://ejemplo.mx/'), (async () => { throw new Error('sin red'); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe('la ruta', () => {
  const ORG = 'titulos';
  const galletas: Record<string, string> = {};
  async function pedir(ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
    const cab: Record<string, string> = {};
    if (o.app !== '') cab['X-App'] = o.app ?? 'cotizador101';
    if (galletas.mike) cab.Cookie = galletas.mike;
    let body = o.body;
    if (o.json !== undefined) { body = JSON.stringify(o.json); cab['Content-Type'] = 'application/json'; }
    const r = await SELF.fetch(`https://api.local${ruta}`, { ...o, body, headers: cab });
    const puesta = r.headers.get('Set-Cookie');
    if (puesta) galletas.mike = puesta.split(';')[0];
    return { estado: r.status, ...((await r.json().catch(() => ({}))) as Record<string, unknown>) } as { estado: number; [k: string]: any };
  }
  beforeAll(async () => {
    const c = await pedir('/auth/codigo', { method: 'POST', json: { correo: 'mike@forespot.com' }, app: '' });
    await pedir('/auth/entrar', { method: 'POST', json: { correo: 'mike@forespot.com', codigo: c.data.codigo_prueba }, app: '' });
    await pedir('/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Títulos', apps: { dash: true, cotizador: true } }, app: '' });
  }, 60000);

  it('una liga a la red de adentro: 400, y no se va a buscar', async () => {
    const r = await pedir(`/orgs/${ORG}/titulo-de-liga?url=${encodeURIComponent('http://127.0.0.1:8787/admin')}`);
    expect(r.estado).toBe(400);
    expect(r.error).toBe('datos_invalidos');
  });

  it('sin sesión no se pasa', async () => {
    const r = await SELF.fetch(`https://api.local/orgs/${ORG}/titulo-de-liga?url=https://ejemplo.mx`, { headers: { 'X-App': 'cotizador101' } });
    expect(r.status).toBe(401);
  });
});

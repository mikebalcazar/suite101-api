/* La puerta de la suite: suite101.taller101.com.
 *
 * Mike, 2-oct-2026: «necesito un website base donde pueda dar click en cada
 * aplicación para ir al portal de cada aplicación». Lo sirve la propia API
 * en un segundo dominio. Aquí se mide que en ese dominio la raíz sea la
 * página con las ocho ligas, que lo demás no exista, y que en el dominio de
 * la API nada cambie.
 */
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { DOMINIO_SUITE } from '../src/portal';

const SUITE = `https://${DOMINIO_SUITE}`;
/* Siete programas de la empresa. master101 NO va: es el panel del dueño de la
 * suite y lo tiene sólo Mike (2-oct-2026). */
const APPS = ['dash101', 'quell101', 'quote101', 'cost101', 'patron101', 'bill101', 'supply101', 'roster101', 'peek101', 'workshop101'];

describe('la puerta de la suite', () => {
  it('la raíz es una página con una liga a cada uno de los programas', async () => {
    const r = await SELF.fetch(`${SUITE}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toMatch(/text\/html/);
    const html = await r.text();
    for (const app of APPS) {
      // roster101 manda al panel de la empresa, no al portal del trabajador.
      const liga = app === 'roster101' ? 'https://roster101.taller101.com/admin' : `https://${app}.taller101.com`;
      expect(html, app).toContain(`href="${liga}"`);
      expect(html, app).toContain(`data-app="${app}"`);
    }
    expect(html).toContain('Suite 101');
    expect(html).not.toMatch(/negocio/i);
    expect(html, 'master101 es sólo de Mike').not.toContain('master101');
  });

  it('el portal de trabajadores va aparte, con su liga y el botón de compartirla', async () => {
    const html = await (await SELF.fetch(`${SUITE}/`)).text();
    expect(html).toContain('data-app="portal-trabajadores"');
    expect(html).toContain('Portal de trabajadores');
    expect(html).toContain('href="https://roster101.taller101.com"');
    expect(html).toContain('data-compartir="https://roster101.taller101.com"');
    expect(html).toContain('Compartir portal');
    // En el celular, la hoja de compartir del sistema; si no, al portapapeles.
    expect(html).toContain('navigator.share(');
    expect(html).toContain('navigator.clipboard.writeText(');
  });

  it('cada liga lleva una línea que dice para qué sirve el programa', async () => {
    const html = await (await SELF.fetch(`${SUITE}/`)).text();
    expect((html.match(/class="lema"/g) ?? []).length).toBe(APPS.length + 1);
  });

  it('trae su favicon y nada más: cualquier otra ruta es 404', async () => {
    expect((await SELF.fetch(`${SUITE}/favicon.svg`)).headers.get('Content-Type')).toMatch(/svg/);
    const r = await SELF.fetch(`${SUITE}/orgs/demo/cuentas`);
    expect(r.status).toBe(404);
    expect((await r.json() as { error: string }).error).toBe('no_encontrado');
    const p = await SELF.fetch(`${SUITE}/auth/codigo`, { method: 'POST', body: '{}' });
    expect(p.status).toBe(404);
  });

  /* 8-oct-2026 · el look de cost101 con la tipografía y los logotipos de la
   * suite: las letras viajan con la página, nada se le pide a Google, y cada
   * programa trae su logotipo oficial en trazos (no su nombre en texto). */
  it('las letras se sirven aquí mismo y la página no le pide nada a Google', async () => {
    const html = await (await SELF.fetch(`${SUITE}/`)).text();
    expect(html).not.toContain('googleapis');
    expect(html).not.toContain('gstatic');
    for (const f of ['fira-cifras-400', 'fira-cifras-600', 'raleway-400', 'raleway-600', 'raleway-700', 'raleway-800']) {
      expect(html, f).toContain(`/fuentes/${f}.woff2`);
      const r = await SELF.fetch(`${SUITE}/fuentes/${f}.woff2`);
      expect(r.status, f).toBe(200);
      expect(r.headers.get('Content-Type')).toBe('font/woff2');
      expect((await r.arrayBuffer()).byteLength, f).toBeGreaterThan(5000);
    }
    expect((await SELF.fetch(`${SUITE}/fuentes/otra.woff2`)).status).toBe(404);
  });

  it('cada programa trae su logotipo oficial, y la suite el suyo', async () => {
    const html = await (await SELF.fetch(`${SUITE}/`)).text();
    for (const app of [...APPS, 'suite101']) {
      expect(html, app).toContain(`<symbol id="logo-${app}"`);
      expect(html, app).toContain(`href="#logo-${app}"`);
    }
    expect(html, 'el logotipo va en trazos, no en letras').not.toMatch(/<symbol[^>]*>[^]*?<text/);
  });

  /* 9-oct-2026 · bill101 lee facturas y estima impuestos; todavía no las
   * emite, no las timbra ni las baja del SAT. La tarjeta no lo promete. */
  it('la tarjeta de bill101 sólo dice lo que hace hoy', async () => {
    const html = await (await SELF.fetch(`${SUITE}/`)).text();
    const tarjeta = html.match(/<a class="app vidrio" href="https:\/\/bill101\.taller101\.com"[^]*?<\/a>/)?.[0] ?? '';
    expect(tarjeta).toContain('estimados');
    expect(tarjeta).not.toMatch(/timbr|descarga|declaraci/i);
  });

  it('/salud contesta también en la puerta, para medirla', async () => {
    const r = await SELF.fetch(`${SUITE}/salud`);
    expect(r.status).toBe(200);
    expect((await r.json() as { data: { servicio: string } }).data.servicio).toBe('suite101-api');
  });

  it('en el dominio de la API la raíz sigue siendo la portada en JSON', async () => {
    const r = await SELF.fetch('https://api.local/');
    expect(r.headers.get('Content-Type')).toMatch(/json/);
    expect((await r.json() as { data: { servicio: string } }).data.servicio).toBe('suite101-api');
  });
});

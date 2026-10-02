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
const APPS = ['dash101', 'quell101', 'quote101', 'supply101', 'roster101', 'peek101', 'workshop101', 'master101'];

describe('la puerta de la suite', () => {
  it('la raíz es una página con una liga a cada uno de los ocho programas', async () => {
    const r = await SELF.fetch(`${SUITE}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toMatch(/text\/html/);
    const html = await r.text();
    for (const app of APPS) {
      expect(html, app).toContain(`href="https://${app}.taller101.com"`);
      expect(html, app).toContain(`data-app="${app}"`);
    }
    expect(html).toContain('Suite 101');
    expect(html).not.toMatch(/negocio/i);
  });

  it('cada liga lleva una línea que dice para qué sirve el programa', async () => {
    const html = await (await SELF.fetch(`${SUITE}/`)).text();
    expect((html.match(/class="lema"/g) ?? []).length).toBe(APPS.length);
  });

  it('trae su favicon y nada más: cualquier otra ruta es 404', async () => {
    expect((await SELF.fetch(`${SUITE}/favicon.svg`)).headers.get('Content-Type')).toMatch(/svg/);
    const r = await SELF.fetch(`${SUITE}/orgs/demo/cuentas`);
    expect(r.status).toBe(404);
    expect((await r.json() as { error: string }).error).toBe('no_encontrado');
    const p = await SELF.fetch(`${SUITE}/auth/codigo`, { method: 'POST', body: '{}' });
    expect(p.status).toBe(404);
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

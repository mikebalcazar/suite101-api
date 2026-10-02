/* El dominio propio de cada empresa · 2-oct-2026
 *
 * Mike: «cuando abra una nueva empresa, quiero poder poner su dominio en la
 * plataforma (desde master101) y que al abrirla les abra sus portales
 * personalizados (ej. roster101.dominioempresa.com, quote101.dominioempresa.com,
 * suite101.dominioempresa.com, etc)».
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que de un dominio salgan OCHO nombres, uno por app, y master101 no:
 *     «ese solo lo tengo yo»;
 *   · que el dominio se limpie y se rechace lo que no es un dominio o es
 *     nuestro: una empresa no puede «apropiarse» taller101.com;
 *   · que un dominio sea de UNA empresa: dos con el mismo es 409;
 *   · que la puerta por dominio ACOTE: por dash101.acme.com, /yo sólo
 *     enseña acme y /orgs/otra contesta 403 aunque la cuenta sea de las dos.
 *     Es la propiedad de seguridad de todo esto;
 *   · que el resolvedor diga de quién es un host, y que la portada de
 *     suite101.acme.com lleve el nombre de la empresa y sus ligas en SU
 *     dominio;
 *   · que quitar el dominio deje todo limpio.
 *
 * Cloudflare es un doble en pruebas (ENTORNO 'prueba'): nace pendiente y se
 * activa al releer, como pasa cuando la empresa pone su CNAME.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { APPS_DOMINIO, dominioLimpio, nombresDe, partirHost } from '../src/dominios';

const CORREO = 'mike@forespot.com';
const ACME = 'dom-acme';
const OTRA = 'dom-otra';
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown; host?: string } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'dash101';
  if (galletas[quien]) cabeceras.Cookie = galletas[quien];
  if (o.host) { cabeceras['X-Host-Original'] = o.host; cabeceras['X-Dominio-Empresa'] = o.host.split('.').slice(1).join('.'); }
  let body = o.body;
  if (o.json !== undefined) { body = JSON.stringify(o.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...o, body, headers: { ...cabeceras, ...(o.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas[quien] = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ...cuerpo } as { estado: number; [k: string]: any };
}

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ACME, nombre: 'Acme Muebles', apps: { dash: true, quell: true } }, app: '' });
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: OTRA, nombre: 'La otra', apps: { dash: true } }, app: '' });
  // Mike es miembro de las dos: así se mide que el dominio acota.
  await pedir('mike', `/admin/orgs/${ACME}/miembros`, { method: 'POST', json: { correo: CORREO, rol: 'owner' }, app: '' });
  await pedir('mike', `/admin/orgs/${OTRA}/miembros`, { method: 'POST', json: { correo: CORREO, rol: 'owner' }, app: '' });
}, 60000);

describe('la forma del dominio, sin servidor', () => {
  it('se limpia: protocolo, www, ruta y mayúsculas sobran', () => {
    expect(dominioLimpio(' https://www.Acme.com/portal?x=1 ')).toBe('acme.com');
    expect(dominioLimpio('muebles-ramirez.com.mx')).toBe('muebles-ramirez.com.mx');
  });
  it('lo que no es dominio, o es nuestro, se rechaza', () => {
    expect(dominioLimpio('acme')).toBeNull();
    expect(dominioLimpio('')).toBeNull();
    expect(dominioLimpio('taller101.com')).toBeNull();
    expect(dominioLimpio('algo.taller101.com')).toBeNull();
    expect(dominioLimpio('x.workers.dev')).toBeNull();
    expect(dominioLimpio('con espacio.com')).toBeNull();
  });
  it('ocho nombres, uno por app, y master101 no', () => {
    const n = nombresDe('acme.com');
    expect(n.length).toBe(8);
    expect(n.map((x) => x.hostname)).toEqual(APPS_DOMINIO.map((a) => `${a}.acme.com`));
    expect(n.some((x) => x.hostname.startsWith('master101.'))).toBe(false);
  });
  it('un host se parte en app y dominio, y una app que no existe no es nada', () => {
    expect(partirHost('roster101.acme.com')).toEqual({ app: 'roster101', dominio: 'acme.com' });
    expect(partirHost('Suite101.Acme.COM:443')).toEqual({ app: 'suite101', dominio: 'acme.com' });
    expect(partirHost('master101.acme.com')).toBeNull();
    expect(partirHost('acme.com')).toBeNull();
  });
});

describe('ponerle el dominio a la empresa (master101)', () => {
  it('se guarda limpio y nacen sus ocho nombres, pendientes del CNAME de la empresa', async () => {
    const r = await pedir('mike', `/admin/orgs/${ACME}`, { method: 'PATCH', json: { dominio: 'https://www.Acme.com/' }, app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.dominio).toBe('acme.com');
    const d = await pedir('mike', `/admin/orgs/${ACME}/dominio`, { app: '' });
    expect(d.estado).toBe(200);
    expect(d.data.dominio).toBe('acme.com');
    expect(d.data.configurado).toBe(true);
    expect(d.data.nombres.length).toBe(8);
    expect(d.data.nombres.map((n: any) => n.hostname)).toEqual(APPS_DOMINIO.map((a) => `${a}.acme.com`));
    expect(d.data.instrucciones[0]).toBe(`dash101.acme.com  CNAME  ${d.data.respaldo}`);
    expect(d.data.respaldo).toMatch(/^empresas\./);
  });

  it('al releer, Cloudflare ya los ve activos y la pantalla lo puede decir', async () => {
    const d = await pedir('mike', `/admin/orgs/${ACME}/dominio`, { app: '' });
    expect(d.data.activos, JSON.stringify(d.data.nombres)).toBe(8);
    expect(d.data.nombres.every((n: any) => n.estado === 'activo' && n.cf_id)).toBe(true);
  });

  it('un dominio sin forma, o nuestro, es 400 y no cambia nada', async () => {
    for (const malo of ['acme', 'taller101.com', 'quell101.taller101.com']) {
      const r = await pedir('mike', `/admin/orgs/${ACME}`, { method: 'PATCH', json: { dominio: malo }, app: '' });
      expect(r.estado, malo).toBe(400);
      expect(r.error).toBe('datos_invalidos');
    }
    expect((await pedir('mike', `/admin/orgs/${ACME}`, { app: '' })).data.dominio).toBe('acme.com');
  });

  it('el mismo dominio en otra empresa es 409: un dominio es de una sola', async () => {
    const r = await pedir('mike', `/admin/orgs/${OTRA}`, { method: 'PATCH', json: { dominio: 'acme.com' }, app: '' });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('dominio_en_uso');
    expect(r.detalle.empresa).toBe(ACME);
  });

  it('volver a mandar el mismo dominio no duplica nombres', async () => {
    await pedir('mike', `/admin/orgs/${ACME}`, { method: 'PATCH', json: { dominio: 'acme.com' }, app: '' });
    expect((await pedir('mike', `/admin/orgs/${ACME}/dominio`, { app: '' })).data.nombres.length).toBe(8);
  });

  it('queda en la bitácora de la administración', async () => {
    const b = await pedir('mike', `/admin/orgs/${ACME}/bitacora`, { app: '' });
    const renglon = (b.data.filas ?? b.data ?? []).find((f: any) => f.campo === 'dominio');
    expect(renglon, JSON.stringify(b.data).slice(0, 300)).toBeTruthy();
    expect(renglon.despues).toBe('acme.com');
  });
});

describe('la puerta por dominio', () => {
  it('el resolvedor dice de quién es un host y a qué app va', async () => {
    const r = await pedir('nadie', '/dominios/resolver?host=roster101.acme.com', { app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toEqual({ org_id: ACME, nombre: 'Acme Muebles', dominio: 'acme.com', app: 'roster101' });
  });
  it('un host de nadie, o una app sin puerta, es 404', async () => {
    expect((await pedir('nadie', '/dominios/resolver?host=roster101.nadie.com', { app: '' })).estado).toBe(404);
    expect((await pedir('nadie', '/dominios/resolver?host=master101.acme.com', { app: '' })).estado).toBe(404);
    expect((await pedir('nadie', '/dominios/resolver', { app: '' })).estado).toBe(404);
  });

  it('/yo por api.taller101.com enseña las dos empresas de Mike', async () => {
    const yo = await pedir('mike', '/yo', { app: '' });
    const ids = yo.data.orgs.map((o: any) => o.id);
    expect(ids).toContain(ACME);
    expect(ids).toContain(OTRA);
    expect(yo.data.empresa).toBeNull();
  });

  it('/yo por dash101.acme.com enseña SÓLO acme, y dice la empresa', async () => {
    const yo = await pedir('mike', '/yo', { app: '', host: 'dash101.acme.com' });
    expect(yo.estado).toBe(200);
    expect(yo.data.orgs.map((o: any) => o.id)).toEqual([ACME]);
    expect(yo.data.empresa).toEqual({ id: ACME, nombre: 'Acme Muebles', dominio: 'acme.com', app: 'dash101' });
  });

  it('por el dominio de acme no se alcanza la otra empresa: 403 otra_empresa', async () => {
    const mal = await pedir('mike', `/orgs/${OTRA}/items`, { host: 'dash101.acme.com' });
    expect(mal.estado).toBe(403);
    expect(mal.error).toBe('otra_empresa');
    const bien = await pedir('mike', `/orgs/${ACME}/items`, { host: 'dash101.acme.com' });
    expect(bien.estado).toBe(200);
  });

  it('la cabecera a mano, con un dominio que no es de nadie, no hace nada', async () => {
    const yo = await pedir('mike', '/yo', { app: '', host: 'dash101.inventado.com' });
    expect(yo.data.orgs.length).toBeGreaterThan(1);
    expect(yo.data.empresa).toBeNull();
  });

  it('suite101.acme.com es la puerta de la suite con el nombre de la empresa y sus ligas en su dominio', async () => {
    const r = await SELF.fetch('https://suite101.acme.com/', { headers: { 'X-Host-Original': 'suite101.acme.com', 'X-Dominio-Empresa': 'acme.com' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('<p class="empresa">Acme Muebles</p>');
    expect(html).toContain('https://dash101.acme.com');
    expect(html).toContain('https://roster101.acme.com/admin');
    expect(html).toContain('data-compartir="https://roster101.acme.com"');
    expect(html).not.toMatch(/https:\/\/(dash101|quell101|quote101|supply101|roster101|peek101|workshop101)\.taller101\.com/);
    expect(html).not.toContain('master101');
  });

  it('y por ahí /salud sigue contestando; lo demás es 404', async () => {
    const cab = { 'X-Host-Original': 'suite101.acme.com', 'X-Dominio-Empresa': 'acme.com' };
    expect((await SELF.fetch('https://suite101.acme.com/salud', { headers: cab })).status).toBe(200);
    expect((await SELF.fetch('https://suite101.acme.com/orgs', { headers: cab })).status).toBe(404);
  });
});

describe('quitar el dominio', () => {
  it('se van los nombres y el resolvedor ya no lo conoce', async () => {
    const r = await pedir('mike', `/admin/orgs/${ACME}/dominio`, { method: 'DELETE', app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.org.dominio).toBeNull();
    const d = await pedir('mike', `/admin/orgs/${ACME}/dominio`, { app: '' });
    expect(d.data.nombres).toEqual([]);
    expect((await pedir('nadie', '/dominios/resolver?host=roster101.acme.com', { app: '' })).estado).toBe(404);
  });

  it('y la otra empresa ya puede usarlo', async () => {
    const r = await pedir('mike', `/admin/orgs/${OTRA}`, { method: 'PATCH', json: { dominio: 'acme.com' }, app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect((await pedir('nadie', '/dominios/resolver?host=quote101.acme.com', { app: '' })).data.org_id).toBe(OTRA);
  });

  it('el alta de una empresa acepta el dominio de una vez', async () => {
    const r = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: 'dom-nueva', nombre: 'Nueva SA', apps: { dash: true }, dominio: 'nueva-sa.mx' }, app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.org.dominio).toBe('nueva-sa.mx');
    expect(r.data.dominio_aviso).toBeNull();
    expect((await pedir('mike', '/admin/orgs/dom-nueva/dominio', { app: '' })).data.nombres.length).toBe(8);
  });
});

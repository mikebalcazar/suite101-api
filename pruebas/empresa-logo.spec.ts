/* El logotipo y los datos de la empresa · 0.80.0
 *
 * Mike, 7-oct-2026, con la hoja de quote101 enfrente: «El verde debería ser
 * el logotipo del negocio que cotiza (…) yo debo subir en la configuración
 * de la empresa (en director) el logotipo en PNG (…) y que ese sea el que se
 * ocupe para todos los documentos que se generan en suite101. Lo rojo debería
 * ser también info que se configura desde director101, no debería poder
 * editarse aquí.» Y: «el nombre de ese usuario debe estar registrado como
 * Mike Balcázar».
 *
 * Lo que aportan: que sólo quien dirige cambie los datos y el logotipo; que
 * el logotipo sea una imagen de verdad (la firma, no el encabezado); que se
 * sirva a quien tenga sesión, con una dirección que cambia con cada logotipo;
 * y que el viejo se borre de R2. */

import { SELF, env } from 'cloudflare:test';
import type { Env } from '../src/entorno';
import { beforeAll, describe, expect, it } from 'vitest';
import nombreDeMike from '../migrations/d1/0023_nombre_de_mike.sql';

const entorno = env as unknown as Env;
const ORG = 'logo';
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cab: Record<string, string> = {};
  if (o.app !== '') cab['X-App'] = o.app ?? 'workshop101';
  if (galletas[quien]) cab.Cookie = galletas[quien];
  let body = o.body;
  if (o.json !== undefined) { body = JSON.stringify(o.json); cab['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...o, body, headers: { ...cab, ...(o.headers as Record<string, string> | undefined) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas[quien] = puesta.split(';')[0];
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.includes('json')) return { estado: r.status, tipo, bytes: new Uint8Array(await r.arrayBuffer()) } as { estado: number; [k: string]: any };
  return { estado: r.status, ...((await r.json()) as Record<string, unknown>) } as { estado: number; [k: string]: any };
}
async function entrar(quien: string, correo: string) {
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
}

beforeAll(async () => {
  await entrar('mike', 'mike@forespot.com');
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Logotipos', apps: { dash: true, cotizador: true, workshop: true } }, app: '' });
  await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: 'oficina@logo.mx', rol: 'staff', nombre: 'Oficina' }, app: '' });
  await entrar('oficina', 'oficina@logo.mx');
}, 60000);

describe('los datos de la empresa para los documentos', () => {
  it('quien dirige pone correo, teléfono, sitio y dirección; vacío es null', async () => {
    const r = await pedir('mike', `/orgs/${ORG}/empresa`, { method: 'PATCH', json: { correo: ' info@taller101.com ', telefono: '+52 55-2951-7900', sitio_web: 'www.taller101.com', direccion: 'CDMX' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ correo: 'info@taller101.com', telefono: '+52 55-2951-7900', sitio_web: 'www.taller101.com', direccion: 'CDMX', logo_ruta: null });
    const otra = await pedir('mike', `/orgs/${ORG}/empresa`, { method: 'PATCH', json: { direccion: '' } });
    expect(otra.data.direccion).toBeNull();
    expect(otra.data.correo, 'lo que no venía se queda').toBe('info@taller101.com');
  });

  it('quien no dirige los lee pero no los cambia', async () => {
    expect((await pedir('oficina', `/orgs/${ORG}/empresa`, { app: 'cotizador101' })).data.correo).toBe('info@taller101.com');
    expect((await pedir('oficina', `/orgs/${ORG}/empresa`, { method: 'PATCH', json: { correo: 'otro@x.mx' }, app: 'cotizador101' })).estado).toBe(403);
  });
});

describe('el logotipo', () => {
  let rutaPrimera = '';

  it('sólo PNG o JPG de verdad, y sólo quien dirige', async () => {
    expect((await pedir('oficina', `/orgs/${ORG}/empresa/logo`, { method: 'PUT', body: PNG, app: 'cotizador101' })).estado).toBe(403);
    const falso = await pedir('mike', `/orgs/${ORG}/empresa/logo`, { method: 'PUT', body: new TextEncoder().encode('<svg onload="x()">'), headers: { 'Content-Type': 'image/png' } });
    expect(falso.estado, 'el encabezado dice PNG pero el archivo no lo es').toBe(400);
  });

  it('se sube, cualquiera con sesión lo ve, y la dirección cambia con cada logotipo', async () => {
    const r = await pedir('mike', `/orgs/${ORG}/empresa/logo`, { method: 'PUT', body: PNG });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    rutaPrimera = r.data.logo_ruta;
    expect(rutaPrimera).toMatch(new RegExp(`^/orgs/${ORG}/empresa/logo\\?v=`));
    const img = await pedir('oficina', rutaPrimera, { app: 'cotizador101' });
    expect(img.estado).toBe(200);
    expect(img.tipo).toBe('image/png');
    expect(Array.from(img.bytes)).toEqual(Array.from(PNG));
    expect((await pedir('oficina', `/orgs/${ORG}/empresa`, { app: 'cotizador101' })).data.logo_ruta, 'y lo dice la empresa').toBe(rutaPrimera);
  });

  it('uno nuevo reemplaza al anterior, que se borra de R2', async () => {
    const antes = (await entorno.ARCHIVOS.list({ prefix: `orgs/${ORG}/empresa/` })).objects.map((o: R2Object) => o.key);
    expect(antes.length).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    const r = await pedir('mike', `/orgs/${ORG}/empresa/logo`, { method: 'PUT', body: JPG });
    expect(r.data.logo_ruta).not.toBe(rutaPrimera);
    const despues = (await entorno.ARCHIVOS.list({ prefix: `orgs/${ORG}/empresa/` })).objects.map((o: R2Object) => o.key);
    expect(despues.length, JSON.stringify(despues)).toBe(1);
    expect(despues[0]).toMatch(/\.jpg$/);
    expect((await pedir('mike', r.data.logo_ruta)).tipo).toBe('image/jpeg');
  });

  it('se quita, y entonces no hay logotipo', async () => {
    const r = await pedir('mike', `/orgs/${ORG}/empresa/logo`, { method: 'DELETE' });
    expect(r.data.logo_ruta).toBeNull();
    expect((await pedir('mike', `/orgs/${ORG}/empresa/logo`)).estado).toBe(404);
    expect((await entorno.ARCHIVOS.list({ prefix: `orgs/${ORG}/empresa/` })).objects.length).toBe(0);
  });
});

describe('el nombre de Mike', () => {
  /* La migración de D1 corre al arrancar las pruebas, cuando todavía no hay
   * usuarios; aquí se vuelve a correr ya con la cuenta creada, que es como
   * llega a producción. */
  it('la cuenta mike@forespot.com se llama Mike Balcázar (D1 0023)', async () => {
    await entorno.MASTER.prepare(nombreDeMike.replace(/--[^\n]*/g, '').trim()).run();
    const yo = await pedir('mike', '/yo', { app: '' });
    expect(yo.data.usuario.nombre).toBe('Mike Balcázar');
  });
});

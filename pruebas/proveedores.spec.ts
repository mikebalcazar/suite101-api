/* Proveedor con datos para pagarle (0.54.0).
 *
 * Mike, 29-sep-2026, para supply101: «poner la opción de dar de alta a un
 * nuevo proveedor, y dentro de los datos deben poder agregar: nombre, RFC,
 * número de cuenta (CLABE y banco y beneficiario), email de contacto,
 * teléfono de contacto, ubicación (…) de Google Maps».
 *
 * Lo que se mide: supply101 crea un proveedor con todo eso por el CRUD
 * genérico; la API rechaza una CLABE que no cuadra, un RFC chueco y un correo
 * sin arroba, y normaliza (RFC en mayúsculas, CLABE sin espacios); quote101
 * sigue sin poder escribir la cuenta; y lo guardado se lee de vuelta.
 */
import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { clabeValida } from '../src/rutas/orgs';

const CORREO = 'mike@forespot.com';
const ORG = 'proveedores';
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'supply101';
  if (galletas[quien]) cabeceras.Cookie = galletas[quien];
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
const o = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}${ruta}`, op);

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, JSON.stringify(c)).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

// Una CLABE que cuadra: 17 dígitos y su verificador calculado.
function clabeDe(base17: string): string {
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(base17[i]) * pesos[i % 3]) % 10;
  return base17 + String((10 - (suma % 10)) % 10);
}
const CLABE = clabeDe('01218000123456789');

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Proveedores de prueba', apps: { dash: true, supply: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: 'ana-prov@ejemplo.mx', rol: 'staff', nombre: 'Ana Compra', apps: ['dash', 'supply'] }, app: '' });
  expect(m.estado, JSON.stringify(m)).toBe(201);
  await entrar('ana', 'ana-prov@ejemplo.mx');
});

describe('la CLABE', () => {
  it('cuadra con su dígito verificador, y no con otro', () => {
    expect(clabeValida(CLABE)).toBe(true);
    expect(clabeValida(CLABE.slice(0, 17) + String((Number(CLABE[17]) + 1) % 10))).toBe(false);
    expect(clabeValida('1234')).toBe(false);
    expect(clabeValida('')).toBe(false);
  });
});

describe('supply101 da de alta un proveedor con todo', () => {
  let id = '';
  it('con nombre, RFC, cuenta, contacto y ubicación; la API normaliza', async () => {
    const r = await o('ana', '/proveedores', { method: 'POST', json: {
      nombre: '  Maderas del Sur  ', rfc: ' mds 010101 ab1 ', correo: 'Ventas@Maderas.MX', telefono: '55 1234 5678',
      clabe: CLABE.slice(0, 4) + ' ' + CLABE.slice(4), banco: 'BBVA', beneficiario: 'Maderas del Sur SA de CV',
      direccion: 'Av. Insurgentes Sur 100, CDMX', maps_url: 'https://maps.app.goo.gl/abc123',
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    id = r.data.id;
    expect(r.data.nombre).toBe('Maderas del Sur');
    expect(r.data.rfc).toBe('MDS010101AB1');
    expect(r.data.correo).toBe('ventas@maderas.mx');
    expect(r.data.clabe).toBe(CLABE);
    expect(r.data.banco).toBe('BBVA');
    expect(r.data.beneficiario).toBe('Maderas del Sur SA de CV');
    expect(r.data.maps_url).toBe('https://maps.app.goo.gl/abc123');
    expect(r.data.creado_en_app).toBe('supply101');
  });
  it('y se lee de vuelta con todo, desde supply101 y desde dash101', async () => {
    const lista = await o('ana', '/proveedores');
    expect(lista.estado).toBe(200);
    const p = lista.data.filas.find((x: any) => x.id === id);
    expect(p.clabe).toBe(CLABE);
    expect(p.direccion).toBe('Av. Insurgentes Sur 100, CDMX');
    const uno = await o('mike', `/proveedores/${id}`, { app: 'dash101' });
    expect(uno.data.beneficiario).toBe('Maderas del Sur SA de CV');
  });
  it('sólo el nombre también vale: lo demás es opcional', async () => {
    const r = await o('ana', '/proveedores', { method: 'POST', json: { nombre: 'Ferretería La Esquina', clabe: '', rfc: '', correo: '' } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.clabe).toBeNull();
    expect(r.data.rfc).toBeNull();
  });
  it('una CLABE que no cuadra, un RFC chueco o un correo sin arroba se rechazan con el campo señalado', async () => {
    const mal = await o('ana', '/proveedores', { method: 'POST', json: { nombre: 'X', clabe: CLABE.slice(0, 17) + String((Number(CLABE[17]) + 1) % 10), rfc: 'NOESRFC', correo: 'sin-arroba' } });
    expect(mal.estado).toBe(400);
    expect(mal.error).toBe('datos_invalidos');
    expect(Object.keys(mal.detalle.errores).sort()).toEqual(['clabe', 'correo', 'rfc']);
    expect(mal.detalle.errores.clabe).toMatch(/18 dígitos/);
    const liga = await o('ana', '/proveedores', { method: 'POST', json: { nombre: 'X', maps_url: 'https://ejemplo.com/no-es-maps' } });
    expect(liga.estado).toBe(400);
    expect(liga.detalle.errores.maps_url).toMatch(/Google Maps/);
    expect((await o('ana', '/proveedores', { method: 'POST', json: { nombre: 'Y', maps_url: 'https://www.google.com/maps/place/Taller/@19.4,-99.1,17z' } })).estado).toBe(201);
  });
  it('corregir la cuenta pasa por la misma revisión', async () => {
    expect((await o('ana', `/proveedores/${id}`, { method: 'PATCH', json: { clabe: '000' } })).estado).toBe(400);
    const bien = await o('ana', `/proveedores/${id}`, { method: 'PATCH', json: { banco: 'Banorte', clabe: clabeDe('07218000123456789') } });
    expect(bien.estado, JSON.stringify(bien)).toBe(200);
    expect(bien.data.banco).toBe('Banorte');
    expect(bien.data.clabe).toBe(clabeDe('07218000123456789'));
  });
  it('quote101 sigue sin poder escribir la cuenta; supply101 no toca la categoría', async () => {
    const q = await o('mike', '/proveedores', { method: 'POST', json: { nombre: 'Z', clabe: CLABE }, app: 'cotizador101' });
    expect(q.estado).toBe(403);
    const s = await o('ana', '/proveedores', { method: 'POST', json: { nombre: 'Z', categoria: 'insumos' } });
    expect(s.estado).toBe(403);
  });
});

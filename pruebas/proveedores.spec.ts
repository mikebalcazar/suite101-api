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

/* 0.55.0 · Varias cuentas por proveedor, con alias, y sus documentos de
 * respaldo (Mike, 30-sep-2026). */
describe('las cuentas del proveedor (0023) y sus documentos', () => {
  const CLABE2 = clabeDe('00218000998877665');
  const CLABE3 = clabeDe('01418000112233445');
  let pv = '';
  let cuenta = '';
  let archivo = '';
  it('supply101 da de alta un proveedor y le cuelga dos cuentas con alias; la CLABE se normaliza y se revisa', async () => {
    const r = await o('ana', '/proveedores', { method: 'POST', json: { nombre: 'Herrajes del Norte' } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    pv = r.data.id;
    const una = await o('ana', '/proveedor_cuentas', { method: 'POST', json: { proveedor_id: pv, alias: '  Principal ', clabe: CLABE2.slice(0, 3) + ' ' + CLABE2.slice(3), banco: 'Banorte', beneficiario: 'Herrajes del Norte SA' } });
    expect(una.estado, JSON.stringify(una)).toBe(201);
    expect(una.data.alias).toBe('Principal');
    expect(una.data.clabe).toBe(CLABE2);
    cuenta = una.data.id;
    const dos = await o('ana', '/proveedor_cuentas', { method: 'POST', json: { proveedor_id: pv, alias: 'Dólares', clabe: CLABE3, banco: 'BBVA', beneficiario: 'Herrajes del Norte SA' } });
    expect(dos.estado).toBe(201);
    const mala = await o('ana', '/proveedor_cuentas', { method: 'POST', json: { proveedor_id: pv, alias: 'Chueca', clabe: CLABE2.slice(0, 17) + String((Number(CLABE2[17]) + 1) % 10) } });
    expect(mala.estado).toBe(400);
    expect(mala.detalle.errores.clabe).toMatch(/no cuadra/);
    const sinAlias = await o('ana', '/proveedor_cuentas', { method: 'POST', json: { proveedor_id: pv, alias: '   ', clabe: CLABE2 } });
    expect(sinAlias.estado).toBe(400);
    expect(sinAlias.detalle.errores.alias).toMatch(/alias/);
    const sinProveedor = await o('ana', '/proveedor_cuentas', { method: 'POST', json: { alias: 'Suelta', clabe: CLABE2 } });
    expect(sinProveedor.estado).toBe(400);
  });
  it('se listan por proveedor, las lee dash101, quote101 no las escribe, y una se quita', async () => {
    const lista = await o('ana', `/proveedor_cuentas?proveedor_id=${pv}`);
    expect(lista.estado).toBe(200);
    expect(lista.data.filas.map((c: any) => c.alias).sort()).toEqual(['Dólares', 'Principal']);
    const desdeDash = await o('mike', `/proveedor_cuentas?proveedor_id=${pv}`, { app: 'dash101' });
    expect(desdeDash.data.filas.length).toBe(2);
    const quote = await o('mike', '/proveedor_cuentas', { method: 'POST', app: 'cotizador101', json: { proveedor_id: pv, alias: 'Otra', clabe: CLABE2 } });
    expect(quote.estado).toBe(403);
    const fuera = await o('ana', `/proveedor_cuentas/${cuenta}`, { method: 'DELETE' });
    expect(fuera.estado, JSON.stringify(fuera)).toBe(200);
    expect((await o('ana', `/proveedor_cuentas?proveedor_id=${pv}`)).data.filas.map((c: any) => c.alias)).toEqual(['Dólares']);
  });
  it('los documentos de respaldo van en archivos, colgados del proveedor, y se pueden quitar', async () => {
    const forma = new FormData();
    forma.set('archivo', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], 'caratula.pdf', { type: 'application/pdf' }));
    forma.set('de_tabla', 'proveedores');
    forma.set('de_id', pv);
    const subido = await o('ana', '/archivos', { method: 'POST', body: forma });
    expect(subido.estado, JSON.stringify(subido)).toBe(201);
    archivo = subido.data.id;
    expect(subido.data.de_tabla).toBe('proveedores');
    const lista = await o('ana', `/archivos?de_tabla=proveedores&de_id=${pv}`);
    expect(lista.estado).toBe(200);
    expect(lista.data.filas.map((a: any) => a.nombre)).toEqual(['caratula.pdf']);
    const bajado = await SELF.fetch(`https://api.local/orgs/${ORG}/archivos/${archivo}`, { headers: { 'X-App': 'supply101', Cookie: galletas.ana } });
    expect(bajado.status).toBe(200);
    expect(bajado.headers.get('Content-Type')).toBe('application/pdf');
    const quitado = await o('ana', `/archivos/${archivo}`, { method: 'DELETE' });
    expect(quitado.estado, JSON.stringify(quitado)).toBe(200);
    expect((await o('ana', `/archivos?de_tabla=proveedores&de_id=${pv}`)).data.filas.length).toBe(0);
    expect((await SELF.fetch(`https://api.local/orgs/${ORG}/archivos/${archivo}`, { headers: { 'X-App': 'supply101', Cookie: galletas.ana } })).status).toBe(404);
  });
  it('borrar el proveedor se lleva sus cuentas', async () => {
    const fuera = await o('mike', `/proveedores/${pv}`, { method: 'DELETE', app: 'dash101' });
    expect(fuera.estado, JSON.stringify(fuera)).toBe(200);
    expect((await o('ana', `/proveedor_cuentas?proveedor_id=${pv}`)).data.filas.length).toBe(0);
  });
});


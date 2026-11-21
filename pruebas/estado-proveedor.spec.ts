/* Cargar los conceptos y los ingresos de un proyecto desde la hoja · 0.108.1
 *
 * Mike, 19-nov-2026: «Necesito que me ayudes a cargar los ingresos y los
 * conceptos del proyecto de qualitas». Con botones: «Nada trae IVA».
 *
 * LO QUE DE VERDAD MIDEN:
 *
 *   · que sin la llave de un solo uso la ruta no existe;
 *   · que sin `modo=cargar` sólo busca y mide: el proyecto, las cuentas, lo
 *     que ya tiene, y cuánto quedaría, sin escribir nada;
 *   · que cargar crea los conceptos agrupados y los ingresos sin IVA, y el
 *     proyecto queda con su precio, lo cobrado y el saldo;
 *   · que no carga encima: sin cuenta, con repetidos o con conceptos ya
 *     puestos, dice por qué y no escribe nada.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'estado-proveedor';
const LLAVE = 'k'.repeat(48);
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'dash101';
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
const o = (ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir('mike', `/orgs/${ORG}${ruta}`, op);
async function crea(ruta: string, json: Record<string, unknown>): Promise<string> {
  const r = await o(ruta, { method: 'POST', json });
  expect(r.estado, `${ruta}: ${JSON.stringify(r)}`).toBe(201);
  return String(r.data.id);
}

/* 0.116.0 · Mike, 21-nov-2026: «en la sección de proveedores, necesito que sea
 * similar a la de proyectos, donde cada proveedor tiene un proyecto y
 * conceptos que se le van a pagar y los pagos que se le van haciendo». */
let cliente = '', cuenta = '', obraA = '', obraB = '', prov = '', otro = '';
beforeAll(async () => {
  galletas.mike = '';
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Estado del proveedor', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  cliente = await crea('/clientes', { nombre: 'Francisco Vidal' });
  cuenta = await crea('/cuentas', { nombre: 'Efectivo', tipo: 'caja' });
  obraA = await crea('/proyectos', { cliente_id: cliente, nombre: 'Sanje CC37', estado: 'activo' });
  obraB = await crea('/proyectos', { cliente_id: cliente, nombre: 'Aniceto Ortega', estado: 'activo' });
  prov = await crea('/proveedores', { nombre: 'Verolegno', tipo: 'materiales' });
  otro = await crea('/proveedores', { nombre: 'Herrería Ruiz', tipo: 'servicios' });
  // Sanje: dos cuentas por pagar a Verolegno; un pago de una partida y otro a su nombre sin partida.
  const p1 = await crea('/partidas', { proyecto_id: obraA, proveedor_id: prov, concepto: 'Tableros roble', monto_acordado: 100_000_00 });
  await crea('/partidas', { proyecto_id: obraA, proveedor_id: prov, concepto: 'Cantos', monto_acordado: 20_000_00 });
  await crea('/movimientos', { tipo: 'egreso', monto: 60_000_00, fecha: '2026-10-01', cuenta_id: cuenta, proyecto_id: obraA, partida_id: p1, contraparte_tipo: 'proveedor', contraparte_id: prov, descripcion: 'Anticipo tableros' });
  await crea('/movimientos', { tipo: 'egreso', monto: 10_000_00, fecha: '2026-10-15', cuenta_id: cuenta, proyecto_id: obraA, contraparte_tipo: 'proveedor', contraparte_id: prov, descripcion: 'Pago cantos' });
  // Aniceto: una cuenta por pagar sin pagos. Y un pago suelto, sin proyecto.
  await crea('/partidas', { proyecto_id: obraB, proveedor_id: prov, concepto: 'Chapa', monto_acordado: 30_000_00 });
  await crea('/movimientos', { tipo: 'egreso', monto: 5_000_00, fecha: '2026-11-01', cuenta_id: cuenta, contraparte_tipo: 'proveedor', contraparte_id: prov, descripcion: 'Muestras', categoria: 'gasto_general' });
  // De otro proveedor en Sanje: no entra en el de Verolegno.
  await crea('/partidas', { proyecto_id: obraA, proveedor_id: otro, concepto: 'Barandal', monto_acordado: 8_000_00 });
});

describe('el estado de cuenta del proveedor', () => {
  it('por proyecto: sus cuentas por pagar, lo que se le pagó y el saldo; lo suelto aparte', async () => {
    const r = await o(`/proveedores/${prov}/estado-de-cuenta`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const d = r.data;
    expect(d.proveedor.nombre).toBe('Verolegno');
    expect(d.proyectos.map((p: any) => [p.nombre, p.acordado, p.pagado, p.saldo])).toEqual([
      ['Sanje CC37', 120_000_00, 70_000_00, 50_000_00],
      ['Aniceto Ortega', 30_000_00, 0, 30_000_00],
    ]);
    const sanje = d.proyectos[0];
    expect(sanje.partidas.map((x: any) => x.concepto)).toEqual(['Tableros roble', 'Cantos']);
    expect(sanje.partidas.some((x: any) => x.concepto === 'Barandal'), 'lo de otro proveedor no entra').toBe(false);
    expect(sanje.pagos.map((x: any) => [x.descripcion, x.monto, x.cuenta])).toEqual([['Anticipo tableros', 60_000_00, 'Efectivo'], ['Pago cantos', 10_000_00, 'Efectivo']]);
    expect(d.sin_proyecto).toMatchObject({ total: 5_000_00, pagos: [expect.objectContaining({ descripcion: 'Muestras' })] });
    expect(d.totales).toEqual({ acordado: 150_000_00, pagado: 70_000_00, saldo: 80_000_00, sin_proyecto: 5_000_00, proyectos: 2 });
  });
  it('los saldos de todos, con la misma cuenta', async () => {
    const r = await o('/proveedores/saldos');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const por = new Map(r.data.saldos.map((s: any) => [s.proveedor_id, s]));
    expect(por.get(prov)).toEqual({ proveedor_id: prov, acordado: 150_000_00, pagado: 70_000_00, saldo: 80_000_00, proyectos: 2 });
    expect(por.get(otro)).toEqual({ proveedor_id: otro, acordado: 8_000_00, pagado: 0, saldo: 8_000_00, proyectos: 1 });
  });
  it('un proveedor que no existe contesta 404', async () => {
    expect((await o('/proveedores/no-existe/estado-de-cuenta')).estado).toBe(404);
  });
});

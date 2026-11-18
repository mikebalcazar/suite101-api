/* Volver a repartir el IVA de los pagos que se ligaron antes de 0.107.0 · 0.107.1
 *
 * Mike, 18-nov-2026, con botones: «Corregirlas todas». Antes de 0.107.0,
 * ligar un pago a su factura le copiaba el desglose de la factura ENTERA: dos
 * parcialidades de una misma factura cargaban cada una todo su IVA.
 *
 * LO QUE DE VERDAD MIDEN:
 *
 *   · que sin la llave de un solo uso la ruta no existe (404), ni con una
 *     llave equivocada;
 *   · que el ensayo dice qué pagos cambian y en cuánto, y NO escribe;
 *   · que corregir deja cada parcialidad con su parte, el proyecto
 *     recalculado y el antes guardado en `reparto_corregido`;
 *   · que un pago marcado facturado a mano, sin CFDI, no se toca;
 *   · que correrlo otra vez ya no cambia nada.
 */

import { SELF, env, createExecutionContext, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/entorno';

const CORREO = 'mike@forespot.com';
const ORG = 'corregir-reparto';
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
const mov = async (id: string) => (await o(`/movimientos/${id}`)).data;
const proyecto = async (id: string) => (await o(`/proyectos/${id}`)).data;

/** La ruta interna, con el Worker y una llave puesta (o no) a mano: así se
 *  prueba también que sin llave no existe. */
async function interno(org: string, { llave, dada, modo }: { llave?: string; dada?: string; modo?: string }) {
  const e = { ...(env as unknown as Env), LLAVE_CORRECCION: llave };
  const r = await app.fetch(new Request(`https://api.local/interno/${org}/reparto-iva${modo ? `?modo=${modo}` : ''}`, {
    method: 'POST', headers: dada ? { 'X-Llave-Correccion': dada } : {},
  }), e, createExecutionContext());
  return { estado: r.status, ...(await r.json() as any) };
}

/** Lo que dejaba la versión de antes: el desglose de la factura entera. */
async function comoAntes(id: string, subtotal: number, iva: number) {
  const stub = (env as unknown as Env).ORG.get((env as unknown as Env).ORG.idFromName(ORG)) as unknown as DurableObjectStub;
  const dentro = runInDurableObject as unknown as (s: unknown, f: (x: any) => void) => Promise<void>;
  await dentro(stub, (x: any) => { x.sql.exec(`UPDATE movimientos SET subtotal = ?, iva = ?, tasa_iva = 1600 WHERE id = ?`, subtotal, iva, id); x.recalcularProyecto(x.sql.exec(`SELECT proyecto_id FROM movimientos WHERE id = ?`, id).one().proyecto_id); });
}
async function auditoria(): Promise<any[]> {
  const stub = (env as unknown as Env).ORG.get((env as unknown as Env).ORG.idFromName(ORG)) as unknown as DurableObjectStub;
  const dentro = runInDurableObject as unknown as (s: unknown, f: (x: any) => any[]) => Promise<any[]>;
  return dentro(stub, (x: any) => x.sql.exec(`SELECT * FROM reparto_corregido ORDER BY movimiento_id`).toArray());
}

let obra = '', primera = '', segunda = '', aMano = '';

beforeAll(async () => {
  galletas.mike = '';
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Corregir reparto', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  const cliente = await crea('/clientes', { nombre: 'HOLCIM', rfc: 'HOL010101AAA' });
  const cuenta = await crea('/cuentas', { nombre: 'Banco', tipo: 'banco' });
  obra = await crea('/proyectos', { cliente_id: cliente, nombre: 'Oficinas Santa Fe' });
  const cobro = (monto: number, fecha: string, extra: Record<string, unknown> = {}) => crea('/movimientos', {
    tipo: 'ingreso', monto, fecha, cuenta_id: cuenta, proyecto_id: obra, contraparte_tipo: 'cliente', contraparte_id: cliente, descripcion: 'Pago', ...extra,
  });
  // HOLCIM, 8 y 13 de agosto: 61,980 + 9,916.80 = 71,896.80 en dos pagos.
  const cfdi = await crea('/fiscal/cfdi', { tipo: 'ingreso', rfc: 'HOL010101AAA', razon_social: 'HOLCIM', uuid: 'BBBBBBBB-0000-4000-8000-000000000001', subtotal: 61_980_00, iva: 9_916_80, total: 71_896_80, fecha: '2026-08-07' });
  primera = await cobro(59_914_00, '2026-08-08');
  segunda = await cobro(11_982_80, '2026-08-13');
  for (const m of [primera, segunda]) {
    const r = await o(`/fiscal/cfdi/${cfdi}/ligar`, { method: 'POST', json: { movimiento_id: m } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
  }
  // Como quedaron antes de 0.107.0: cada una con el IVA entero de la factura.
  await comoAntes(primera, 59_914_00 - 9_916_80, 9_916_80);
  await comoAntes(segunda, 11_982_80 - 9_916_80, 9_916_80);
  // Facturado a mano, sin CFDI: su desglose es el que le escribieron.
  aMano = await cobro(11_600_00, '2026-08-20', { facturado: true, subtotal: 10_000_00, iva: 1_600_00 });
});

describe('la llave de un solo uso', () => {
  it('sin llave puesta en el Worker la ruta no existe', async () => {
    expect((await interno(ORG, { dada: LLAVE })).estado).toBe(404);
  });
  it('con una llave equivocada tampoco, y una llave corta no vale aunque coincida', async () => {
    expect((await interno(ORG, { llave: LLAVE, dada: 'x'.repeat(48) })).estado).toBe(404);
    expect((await interno(ORG, { llave: 'corta', dada: 'corta' })).estado).toBe(404);
  });
  it('una empresa que no existe no se inventa', async () => {
    const r = await interno('no-existe-esta', { llave: LLAVE, dada: LLAVE });
    expect(r).toMatchObject({ estado: 404, error: 'org_desconocida' });
  });
});

describe('el ensayo', () => {
  it('dice qué pagos cambian y en cuánto, y el proyecto antes y después', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ org: ORG, ensayo: true, revisados: 2, cambian: 2 });
    const a = r.data.movimientos.find((m: any) => m.id === primera);
    expect(a).toMatchObject({ antes: { iva: 9_916_80, subtotal: 49_997_20 }, despues: { iva: 8_264_00, subtotal: 51_650_00 } });
    const p = r.data.proyectos[0];
    expect(p).toMatchObject({ id: obra, nombre: 'Oficinas Santa Fe', pagos: 2 });
    expect(p.antes.iva_cobrado, 'el IVA cargado dos veces, más el del pago a mano').toBe(9_916_80 * 2 + 1_600_00);
    expect(p.despues).toMatchObject({ cobrado_sin_iva: 61_980_00 + 10_000_00, iva_cobrado: 9_916_80 + 1_600_00 });
  });
  it('y no escribió nada', async () => {
    expect(await mov(primera)).toMatchObject({ iva: 9_916_80 });
    expect((await proyecto(obra)).iva_cobrado).toBe(9_916_80 * 2 + 1_600_00);
  });
});

describe('corregir', () => {
  it('cada parcialidad queda con su parte y el proyecto se recalcula', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'corregir' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ ensayo: false, cambian: 2 });
    expect(await mov(primera)).toMatchObject({ subtotal: 51_650_00, iva: 8_264_00 });
    expect(await mov(segunda)).toMatchObject({ subtotal: 10_330_00, iva: 1_652_80 });
    const p = await proyecto(obra);
    expect(p).toMatchObject({ cobrado: 71_896_80 + 11_600_00, cobrado_sin_iva: 71_980_00, iva_cobrado: 11_516_80 });
    expect(r.data.proyectos[0].despues).toMatchObject({ cobrado_sin_iva: 71_980_00, iva_cobrado: 11_516_80 });
  });
  it('el pago facturado a mano, sin CFDI, no se tocó', async () => {
    expect(await mov(aMano)).toMatchObject({ subtotal: 10_000_00, iva: 1_600_00 });
  });
  it('el antes de cada pago queda guardado', async () => {
    const filas = await auditoria();
    expect(filas).toHaveLength(2);
    const a = filas.find((f) => f.movimiento_id === primera);
    expect(a).toMatchObject({ iva_antes: 9_916_80, subtotal_antes: 49_997_20, iva_despues: 8_264_00, subtotal_despues: 51_650_00 });
  });
  it('correrlo otra vez ya no cambia nada', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'corregir' });
    expect(r.data).toMatchObject({ revisados: 2, cambian: 0 });
    expect(await auditoria()).toHaveLength(2);
  });
});

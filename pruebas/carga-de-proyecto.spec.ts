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

import { SELF, env, createExecutionContext, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/entorno';

const CORREO = 'mike@forespot.com';
const ORG = 'carga-de-proyecto';
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
async function interno(org: string, { llave, dada, modo, carga }: { llave?: string; dada?: string; modo?: string; carga?: unknown }) {
  const e = { ...(env as unknown as Env), LLAVE_CORRECCION: llave };
  const r = await app.fetch(new Request(`https://api.local/interno/${org}/carga-proyecto${modo ? `?modo=${modo}` : ''}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(dada ? { 'X-Llave-Correccion': dada } : {}) }, body: JSON.stringify(carga ?? {}),
  }), e, createExecutionContext());
  return { estado: r.status, ...(await r.json() as any) };
}

let obra = '', cuenta = '', otraObra = '', cliente = '';
/** La captura a mano no escribe serie y folio (los trae el XML): se ponen
 *  directo, como quedan al subir el XML de una factura expedida. */
async function conFolio(id: string, serie: string | null, folio: string) {
  const stub = (env as unknown as Env).ORG.get((env as unknown as Env).ORG.idFromName(ORG)) as unknown as DurableObjectStub;
  const dentro = runInDurableObject as unknown as (s: unknown, f: (x: any) => void) => Promise<void>;
  await dentro(stub, (x: any) => { x.sql.exec(`UPDATE cfdi SET serie = ?, folio = ? WHERE id = ?`, serie, folio, id); });
}
const carga = (extra: Record<string, unknown> = {}) => ({
  buscar: 'qualitas',
  conceptos: [
    { grupo: 'Presupuesto general', nombre: 'I5.100-01', descripcion: 'E3 · MURO BIENVENIDA E3', cantidad: 1, precio_unitario: 209_000_00 },
    { grupo: 'Presupuesto general', nombre: 'G6.000-A1', descripcion: 'E3 · PUERTA MADERA CON LAMINADO A1', cantidad: 5, precio_unitario: 13_500_00 },
    { grupo: 'Adicionales', nombre: 'BO.08', descripcion: 'Estación de servicio pasillo E3', cantidad: 1, precio_unitario: 16_000_00 },
    { grupo: 'Adicionales', nombre: 'I5.002-06', descripcion: 'Estación de Impresión Mezzanine · sin cargo (lista $57,350 c/u)', cantidad: 1, precio_unitario: 0 },
  ],
  ingresos: [
    { fecha: '2025-08-22', monto: 200_000_00, descripcion: 'ANTICIPO 1 · factura 733', folio: '733' },
    { fecha: '2026-03-14', monto: 50_000_00, descripcion: 'Pago 17 · por facturar', requiere_factura: true },
  ],
  ...extra,
});

beforeAll(async () => {
  galletas.mike = '';
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Carga de proyecto', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  cliente = await crea('/clientes', { nombre: 'Quálitas Compañía de Seguros' });
  cuenta = await crea('/cuentas', { nombre: 'BBVA Forespot', tipo: 'banco' });
  obra = await crea('/proyectos', { cliente_id: cliente, nombre: 'QUALITAS oficinas' });
  otraObra = await crea('/proyectos', { cliente_id: cliente, nombre: 'Casa Soto' });
});

describe('la llave', () => {
  it('sin llave puesta la ruta no existe', async () => {
    expect((await interno(ORG, { dada: LLAVE, carga: carga() })).estado).toBe(404);
  });
});

describe('buscar y medir', () => {
  it('encuentra el proyecto por su nombre, enseña las cuentas y cuánto quedaría, sin escribir', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, carga: carga() });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.escrito).toBe(false);
    expect(r.data.proyectos.map((p: any) => p.id)).toEqual([obra]);
    expect(r.data.cuentas.map((c: any) => c.id)).toContain(cuenta);
    expect(r.data.a_crear).toMatchObject({ conceptos: 4, precio: 209_000_00 + 67_500_00 + 16_000_00, ingresos: 2, cobrado: 250_000_00 });
    expect(r.data.despues).toMatchObject({ precio_venta: 292_500_00, cobrado_sin_iva: 250_000_00, saldo: 42_500_00 });
    expect((await o(`/proyectos/${obra}`)).data.n_conceptos).toBe(0);
  });
});

describe('las facturas de cada pago', () => {
  let cfdi = '';
  it('encuentra la factura expedida por su folio y dice cuánto quedaría sin IVA si se liga', async () => {
    const f = await o('/fiscal/cfdi', { method: 'POST', json: { tipo: 'ingreso', rfc: 'QCS931209G49', razon_social: 'Quálitas', uuid: 'CCCCCCCC-0000-4000-8000-000000000733', serie: 'A', folio: '733', subtotal: 172_413_79, iva: 27_586_21, total: 200_000_00, fecha: '2025-08-22' } });
    expect(f.estado, JSON.stringify(f)).toBe(201);
    cfdi = f.data.id;
    await conFolio(cfdi, 'A', '733');
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, carga: carga() });
    expect(r.data.facturas.filter((f: any) => f.folio)).toEqual([expect.objectContaining({ folio: '733', encontradas: [expect.objectContaining({ id: cfdi, total: 200_000_00, iva: 27_586_21, ya_ligado: 0 })] })]);
    expect(r.data.si_se_ligan).toEqual({ cobrado_sin_iva: 172_413_79 + 50_000_00, iva: 27_586_21 });
  });
});

describe('cargar', () => {
  it('sin cuenta no escribe y dice por qué', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: carga({ proyecto_id: obra }) });
    expect(r.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('cuenta') });
  });
  it('con proyecto y cuenta: conceptos agrupados, ingresos sin IVA, y el saldo', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: carga({ proyecto_id: obra, cuenta_id: cuenta }) });
    expect(r.data, JSON.stringify(r.data)).toMatchObject({ escrito: true, ligados: 0, despues: { precio_venta: 292_500_00, cobrado_sin_iva: 250_000_00, saldo: 42_500_00 } });
    const e = (await o(`/proyectos/${obra}/estado`)).data;
    expect(e.grupos.map((g: any) => [g.nombre, g.importe, g.conceptos.length])).toEqual([['Presupuesto general', 276_500_00, 2], ['Adicionales', 16_000_00, 2]]);
    expect(e.grupos[0].conceptos[1]).toMatchObject({ nombre: 'G6.000-A1', cantidad: 5, precio_unitario: 13_500_00 });
    const pagos = e.movimientos.map((m: any) => [m.fecha.slice(0, 10), m.monto, m.sin_iva, m.iva]);
    expect(pagos).toEqual(expect.arrayContaining([['2025-08-22', 200_000_00, 200_000_00, 0], ['2026-03-14', 50_000_00, 50_000_00, 0]]));
    expect(e.totales).toMatchObject({ total: 292_500_00, cobrado: 250_000_00, saldo: 42_500_00, iva: 0 });
    const lista = (await o(`/movimientos?proyecto_id=${obra}`)).data;
    const filas = (lista.filas ?? lista) as any[];
    expect(filas.find((m) => m.monto === 50_000_00)).toMatchObject({ requiere_factura: true, facturado: false, cuenta_id: cuenta });
  });
  it('otra vez: los ingresos ya están y los conceptos también, y no carga nada encima', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: carga({ proyecto_id: obra, cuenta_id: cuenta }) });
    expect(r.data).toMatchObject({ escrito: false });
    expect(r.data.repetidos).toHaveLength(2);
    expect((await o(`/proyectos/${obra}`)).data.n_conceptos).toBe(4);
  });
  it('con ligar, cada pago queda con su factura y su parte del IVA', async () => {
    const p = await crea('/proyectos', { cliente_id: cliente, nombre: 'Otra obra ligada' });
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: { ...carga({ proyecto_id: p, cuenta_id: cuenta, ligar: true }), conceptos: [],
      ingresos: [{ fecha: '2025-09-01', monto: 100_000_00, descripcion: 'otra parcialidad · factura 900', folio: '900' }] } });
    expect(r.data.escrito, JSON.stringify(r.data)).toBe(true);
    expect(r.data.ligados).toBe(0);
    const f = await o('/fiscal/cfdi', { method: 'POST', json: { tipo: 'ingreso', uuid: 'CCCCCCCC-0000-4000-8000-000000000901', folio: '901', subtotal: 100_000_00, iva: 16_000_00, total: 116_000_00, fecha: '2025-09-02' } });
    expect(f.estado).toBe(201);
    await conFolio(f.data.id, null, '901');
    const r2 = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: { ...carga({ proyecto_id: p, cuenta_id: cuenta, ligar: true }), conceptos: [],
      ingresos: [{ fecha: '2025-09-05', monto: 116_000_00, descripcion: 'pago · factura 901', folio: '901' }] } });
    expect(r2.data).toMatchObject({ escrito: true, ligados: 1, despues: { cobrado_sin_iva: 100_000_00 + 100_000_00 } });
  });
  it('el otro proyecto no se tocó', async () => {
    expect((await o(`/proyectos/${otraObra}`)).data).toMatchObject({ n_conceptos: 0, cobrado: 0 });
  });
});

/* 0.110.1 · Mike, 19-nov-2026: «Necesito cargar estos ingresos y precios en un
 * proyecto nuevo de IMA que se llama TATA E2 (…) Hay que revisar si hay
 * facturas que coincidan con los ingresos.» */
describe('un proyecto nuevo y las facturas por monto', () => {
  let cfdi = '';
  beforeAll(async () => {
    const f = await o('/fiscal/cfdi', { method: 'POST', json: { tipo: 'ingreso', rfc: 'IPA150629LBA', razon_social: 'IMA', uuid: 'DDDDDDDD-0000-4000-8000-000000000769', subtotal: 11_705_17, iva: 1_872_83, total: 13_578_00, fecha: '2026-04-11' } });
    expect(f.estado, JSON.stringify(f)).toBe(201);
    cfdi = f.data.id;
    await conFolio(cfdi, 'A', '769');
  });
  const tata = (extra: Record<string, unknown> = {}) => ({
    buscar: 'TATA E2', buscar_cliente: 'qualitas',
    conceptos: [{ nombre: 'Puertas', cantidad: 3, precio_unitario: 16_000_00 }, { nombre: 'Recepción', cantidad: 1, precio_unitario: 97_000_00 }],
    ingresos: [
      { fecha: '2026-04-03', monto: 104_400_00, descripcion: 'Anticipo' },
      { fecha: '2026-04-10', monto: 11_705_17, descripcion: 'Anticipo 2 · factura A-769', folio: 'A-769' },
    ],
    ...extra,
  });
  it('el ensayo enseña los clientes, y la factura por su folio «A-769» y por su monto', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, carga: tata() });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.proyectos).toEqual([]);
    expect(r.data.clientes.map((c: any) => c.id)).toContain(cliente);
    const [a, b] = r.data.facturas;
    expect(a).toMatchObject({ folio: '', encontradas: [], por_monto: [] });
    expect(b.encontradas.map((f: any) => f.id)).toEqual([cfdi]);
    expect(b.por_monto.map((f: any) => f.id)).toEqual([cfdi]);
  });
  it('sin cliente que exista no crea nada', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: tata({ cuenta_id: cuenta, crear_proyecto: { nombre: 'TATA E2', cliente_id: 'no-existe' } }) });
    expect(r.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('cliente') });
  });
  it('crea el proyecto, carga, y liga la factura escogida', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: tata({ cuenta_id: cuenta, ligar: true, crear_proyecto: { nombre: 'TATA E2', cliente_id: cliente },
      ingresos: [
        { fecha: '2026-04-03', monto: 104_400_00, descripcion: 'Anticipo' },
        { fecha: '2026-04-10', monto: 13_578_00, descripcion: 'Anticipo 2 · factura A-769', cfdi_id: cfdi },
      ] }) });
    expect(r.data, JSON.stringify(r.data)).toMatchObject({ escrito: true, ligados: 1, proyecto: { nombre: 'TATA E2', cliente_id: cliente } });
    expect(r.data.despues).toMatchObject({ precio_venta: 145_000_00, cobrado_sin_iva: 104_400_00 + 11_705_17 });
    const otra = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: tata({ cuenta_id: cuenta, crear_proyecto: { nombre: 'TATA E2', cliente_id: cliente } }) });
    expect(otra.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('ya hay un proyecto') });
  });
});

/* 0.110.1 · Mike, 19-nov-2026: «la factura A762 es de APEX, no de Quálitas.
 * Hay que corregir ese pago», con botones: «Moverlo a APEX». */
describe('traer un pago que quedó en otro proyecto', () => {
  let pago = '', cfdi = '';
  beforeAll(async () => {
    const f = await o('/fiscal/cfdi', { method: 'POST', json: { tipo: 'ingreso', rfc: 'IPA150629LBA', razon_social: 'IMA', uuid: 'DDDDDDDD-0000-4000-8000-000000000762', subtotal: 100_000_00, iva: 16_000_00, total: 116_000_00, fecha: '2026-02-28' } });
    expect(f.estado, JSON.stringify(f)).toBe(201);
    cfdi = f.data.id;
    await conFolio(cfdi, 'A', '762');
    pago = await crea('/movimientos', { tipo: 'ingreso', monto: 116_000_00, fecha: '2026-03-03', cuenta_id: cuenta, proyecto_id: otraObra, contraparte_tipo: 'cliente', contraparte_id: cliente, descripcion: 'Pago 16 · factura 762' });
    const l = await o(`/fiscal/cfdi/${cfdi}/ligar`, { method: 'POST', json: { movimiento_id: pago } });
    expect(l.estado, JSON.stringify(l)).toBe(200);
  });
  const apex = (extra: Record<string, unknown> = {}) => ({
    buscar: 'APEX GDL-MTY', conceptos: [{ nombre: 'Celosía acústica GDL', precio_unitario: 90_720_00 }], ingresos: [],
    traer: [{ movimiento_id: pago, descripcion: 'Pago 1 GDL · factura A-762' }], ...extra,
  });
  it('el ensayo dice de dónde viene, con su factura, y no mueve nada', async () => {
    const antes = (await proyecto(otraObra)).cobrado_sin_iva;
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, carga: apex() });
    expect(r.data.traidos).toEqual([expect.objectContaining({ id: pago, proyecto_id: otraObra, monto: 116_000_00, facturas: ['A762'], problema: null })]);
    expect((await mov(pago)).proyecto_id).toBe(otraObra);
    expect((await proyecto(otraObra)).cobrado_sin_iva).toBe(antes);
  });
  it('un gasto o un id que no existe no se trae', async () => {
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: apex({ cuenta_id: cuenta, crear_proyecto: { nombre: 'APEX GDL-MTY', cliente_id: cliente }, traer: [{ movimiento_id: 'no-existe' }] }) });
    expect(r.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('no existe') });
  });
  it('se muda con su factura y los dos proyectos se recalculan', async () => {
    const antes = (await proyecto(otraObra)).cobrado_sin_iva;
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: apex({ cuenta_id: cuenta, crear_proyecto: { nombre: 'APEX GDL-MTY', cliente_id: cliente } }) });
    expect(r.data, JSON.stringify(r.data)).toMatchObject({ escrito: true });
    const nuevo = r.data.proyecto.id;
    expect(await mov(pago)).toMatchObject({ proyecto_id: nuevo, descripcion: 'Pago 1 GDL · factura A-762', subtotal: 100_000_00, iva: 16_000_00 });
    expect((await proyecto(otraObra)).cobrado_sin_iva).toBe(antes - 100_000_00);
    expect(await proyecto(nuevo)).toMatchObject({ precio_venta: 90_720_00, cobrado_sin_iva: 100_000_00, iva_cobrado: 16_000_00 });
    const otra = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: apex({ proyecto_id: nuevo, cuenta_id: cuenta, conceptos: [] }) });
    expect(otra.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('ya es de este proyecto') });
  });
});

/* 0.110.2 · Mike, 19-nov-2026: «HOLCIM, hoy pagaron 20,000 + IVA». Sin
 * factura todavía: entra el total al banco y el IVA va aparte. */
describe('un pago con IVA que todavía no tiene factura', () => {
  it('entra el total, el subtotal sin IVA y el IVA aparte', async () => {
    const antes = await proyecto(otraObra);
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: {
      buscar: '', proyecto_id: otraObra, cuenta_id: cuenta, conceptos: [],
      ingresos: [{ fecha: '2026-11-19', monto: 23_200_00, iva: 3_200_00, descripcion: 'Pago · por facturar', requiere_factura: true }],
    } });
    expect(r.data, JSON.stringify(r.data)).toMatchObject({ escrito: true });
    const p = await proyecto(otraObra);
    expect(p.cobrado_sin_iva - antes.cobrado_sin_iva).toBe(20_000_00);
    expect(p.iva_cobrado - antes.iva_cobrado).toBe(3_200_00);
  });
  it('un IVA mayor que el pago, o con factura, no entra', async () => {
    for (const i of [{ monto: 1_000_00, iva: 1_000_00 }, { monto: 1_160_00, iva: 160_00, folio: '733' }]) {
      const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: {
        buscar: '', proyecto_id: otraObra, cuenta_id: cuenta, conceptos: [], ingresos: [{ fecha: '2026-11-20', descripcion: 'x', ...i }],
      } });
      expect(r.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('no cuadra') });
    }
  });
});

/* 0.110.3 · Mike, 19-nov-2026: «buscar las facturas que aún no están
 * ligadas que correspondan con los montos». Sólo lee. */
describe('lo que falta ligar de un RFC', () => {
  it('trae las facturas con algo sin ligar y los ingresos sin factura, y no escribe', async () => {
    const f = await o('/fiscal/cfdi', { method: 'POST', json: { tipo: 'ingreso', rfc: 'IPA150629LBA', razon_social: 'IMA', uuid: 'DDDDDDDD-0000-4000-8000-000000000767', subtotal: 450_000_00, iva: 72_000_00, total: 522_000_00, fecha: '2026-04-29' } });
    expect(f.estado, JSON.stringify(f)).toBe(201);
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, carga: { buscar: '', conceptos: [], ingresos: [], sin_ligar: { rfc: 'ipa150629lba' } } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const ids = r.data.sin_ligar.facturas.map((x: any) => x.id);
    expect(ids).toContain(f.data.id);
    for (const x of r.data.sin_ligar.facturas) expect(x.ya_ligado).toBeLessThan(x.total);
    expect(r.data.escrito).toBe(false);
    expect(Array.isArray(r.data.sin_ligar.ingresos)).toBe(true);
  });
});

/* 0.111.0 · Mike, 19-nov-2026: «A-768 OK ligada completa. A-767 OK,
 * necesito una nota grande que faltan 100k de pago para acompletar factura.
 * Siempre el formato en la contabilidad de proyectos va sin IVA». */
describe('ligar pagos que ya están, sin moverles el sin IVA', () => {
  let a767 = '', a768 = '', p17 = '', p18 = '', p10 = '', dct = '', obraQ = '';
  beforeAll(async () => {
    const fac = async (uuid: string, sub: number, folio: string) => {
      const f = await o('/fiscal/cfdi', { method: 'POST', json: { tipo: 'ingreso', rfc: 'IPA150629LBA', razon_social: 'IMA', uuid, subtotal: sub, iva: sub * 16 / 100, total: sub * 116 / 100, fecha: '2026-04-29' } });
      expect(f.estado, JSON.stringify(f)).toBe(201);
      await conFolio(f.data.id, 'A', folio);
      return String(f.data.id);
    };
    a767 = await fac('EEEEEEEE-0000-4000-8000-000000000767', 450_000_00, '767');
    a768 = await fac('EEEEEEEE-0000-4000-8000-000000000768', 75_000_00, '768');
    obraQ = await crea('/proyectos', { cliente_id: cliente, nombre: 'QUALITAS por facturar' });
    const pago = (monto: number, fecha: string, descripcion: string) => crea('/movimientos', {
      tipo: 'ingreso', monto, fecha, cuenta_id: cuenta, proyecto_id: obraQ, contraparte_tipo: 'cliente', contraparte_id: cliente, descripcion, subtotal: monto, iva: 0,
    });
    p17 = await pago(250_000_00, '2026-03-14', 'Pago 17 · por facturar');
    p18 = await pago(50_000_00, '2026-03-21', 'Pago 18 · por facturar');
    p10 = await pago(50_000_00, '2026-04-10', 'Pago · por facturar');
    dct = await pago(25_000_00, '2026-04-25', 'Anticipo DCT · por facturar');
  });
  const ligar = (modo?: string, lista?: Array<{ movimiento_id: string; cfdi_id: string }>) => interno(ORG, { llave: LLAVE, dada: LLAVE, modo, carga: {
    buscar: '', proyecto_id: obraQ, conceptos: [], ingresos: [],
    ligar_existentes: lista ?? [{ movimiento_id: p17, cfdi_id: a767 }, { movimiento_id: p18, cfdi_id: a767 }, { movimiento_id: p10, cfdi_id: a768 }, { movimiento_id: dct, cfdi_id: a768 }],
  } });
  it('el ensayo dice cuánto entra al banco con su IVA, y no escribe', async () => {
    const antes = await proyecto(obraQ);
    const r = await ligar();
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.por_ligar.find((x: any) => x.movimiento_id === p17)).toMatchObject({ factura: 'A767', sin_iva: 250_000_00, monto_antes: 250_000_00, monto_despues: 290_000_00, iva: 40_000_00, problema: null });
    expect((await proyecto(obraQ)).cobrado_sin_iva).toBe(antes.cobrado_sin_iva);
    expect((await mov(p17)).monto).toBe(250_000_00);
  });
  it('pasar del subtotal de la factura no se puede', async () => {
    const r = await ligar('cargar', [{ movimiento_id: p17, cfdi_id: a768 }]);
    expect(r.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('pasan del subtotal') });
  });
  it('liga, el sin IVA no se mueve, y el estado de cuenta avisa lo que falta de A-767', async () => {
    const antes = await proyecto(obraQ);
    const r = await ligar('cargar');
    expect(r.data, JSON.stringify(r.data)).toMatchObject({ escrito: true, ligados: 4 });
    expect(await mov(p17)).toMatchObject({ monto: 290_000_00, subtotal: 250_000_00, iva: 40_000_00 });
    expect(await mov(dct)).toMatchObject({ monto: 29_000_00, subtotal: 25_000_00, iva: 4_000_00 });
    const p = await proyecto(obraQ);
    expect(p.cobrado_sin_iva).toBe(antes.cobrado_sin_iva);
    expect(p.iva_cobrado - antes.iva_cobrado).toBe(60_000_00);
    const e = await o(`/proyectos/${obraQ}/estado`);
    expect(e.estado, JSON.stringify(e)).toBe(200);
    expect(e.data.facturas_por_completar).toEqual([expect.objectContaining({ id: a767, folio: '767', ligado: 348_000_00, falta: 174_000_00, falta_sin_iva: 150_000_00 })]);
  });
  it('otra vez: ya tienen factura', async () => {
    const r = await ligar('cargar');
    expect(r.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('ya tiene factura') });
  });
});

/* 0.111.1 · Para conciliar contra el banco: todas las facturas del RFC con
 * sus ligas, y los ingresos de sus clientes con sus facturas. Sólo lee. */
describe('conciliar', () => {
  it('trae las facturas ligadas y sueltas, y los ingresos con sus folios', async () => {
    await o(`/clientes/${cliente}`, { method: 'PATCH', json: { rfc: 'IPA150629LBA' } });
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, carga: { buscar: '', conceptos: [], ingresos: [], conciliar: { rfc: 'IPA150629LBA' } } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const c = r.data.conciliacion;
    const a767 = c.facturas.find((f: any) => f.folio === '767');
    expect(a767.ligas.length).toBeGreaterThan(0);
    expect(a767.ligas[0]).toMatchObject({ proyecto: 'QUALITAS por facturar' });
    const pago = c.ingresos.find((m: any) => m.facturas.includes('A767') && m.monto === 290_000_00);
    expect(pago).toMatchObject({ monto: 290_000_00, sin_iva: 250_000_00, facturas: ['A767'] });
    expect(r.data.escrito).toBe(false);
  });
});

/* 0.111.2 · Mike, 19-nov-2026: «La cuenta a la que entraron los $23,200 de
 * HOLCIM: entró a efectivo». Corregir la cuenta, la fecha o la descripción
 * de un pago que ya está, sin tocar su dinero. */
describe('corregir un pago que ya está', () => {
  it('cambia la cuenta y la fecha, el ensayo no escribe, y una cuenta que no existe no pasa', async () => {
    const caja = await crea('/cuentas', { nombre: 'EFECTIVO', tipo: 'caja' });
    const pago = await crea('/movimientos', { tipo: 'ingreso', monto: 23_200_00, fecha: '2026-11-19', cuenta_id: cuenta, proyecto_id: obra, descripcion: 'Pago · por facturar', subtotal: 20_000_00, iva: 3_200_00 });
    const carga = (modo?: string, c: Record<string, unknown> = {}) => interno(ORG, { llave: LLAVE, dada: LLAVE, modo, carga: {
      buscar: '', proyecto_id: obra, conceptos: [], ingresos: [], corregir: [{ movimiento_id: pago, cuenta_id: caja, fecha: '2026-11-18', ...c }],
    } });
    const antes = await mov(pago);
    const e = await carga();
    expect(e.data.corregidos[0]).toMatchObject({ antes: { fecha: '2026-11-19' }, despues: { cuenta: 'EFECTIVO', fecha: '2026-11-18' }, problema: null });
    expect((await mov(pago)).cuenta_id).toBe(cuenta);
    const mal = await carga('cargar', { cuenta_id: 'no-existe' });
    expect(mal.data).toMatchObject({ escrito: false, motivo: expect.stringContaining('la cuenta no existe') });
    const r = await carga('cargar');
    expect(r.data, JSON.stringify(r.data)).toMatchObject({ escrito: true });
    expect(await mov(pago), 'el dinero no se toca').toMatchObject({ cuenta_id: caja, fecha: expect.stringMatching(/^2026-11-18/), monto: antes.monto, subtotal: antes.subtotal, iva: antes.iva });
  });
});

/* 0.111.3 · El histórico de IMA dice $232,000 donde la factura A-760 es de
 * $232,348: el monto del pago se corrige, la liga se mueve con él, el IVA se
 * reparte otra vez y la factura queda por completar en $348. */
describe('corregir el monto de un pago con su factura', () => {
  it('ajusta monto, sin IVA e IVA, y la factura dice cuánto le falta', async () => {
    const f = await o('/fiscal/cfdi', { method: 'POST', json: { tipo: 'ingreso', rfc: 'IPA150629LBA', razon_social: 'IMA', uuid: 'FFFFFFFF-0000-4000-8000-000000000760', subtotal: 200_300_00, iva: 32_048_00, total: 232_348_00, fecha: '2026-02-27' } });
    expect(f.estado, JSON.stringify(f)).toBe(201);
    const obraM = await crea('/proyectos', { cliente_id: cliente, nombre: 'Monto A-760' });
    const r1 = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: { buscar: '', proyecto_id: obraM, cuenta_id: cuenta, ligar: true, conceptos: [],
      ingresos: [{ fecha: '2026-02-07', monto: 232_348_00, descripcion: 'Pago 12', cfdi_id: f.data.id }] } });
    expect(r1.data, JSON.stringify(r1.data)).toMatchObject({ escrito: true, ligados: 1 });
    const pago = (await o(`/proyectos/${obraM}/estado`)).data.movimientos[0].id;
    const pide = (modo?: string, monto = 232_000_00) => interno(ORG, { llave: LLAVE, dada: LLAVE, modo, carga: { buscar: '', proyecto_id: obraM, conceptos: [], ingresos: [], corregir: [{ movimiento_id: pago, monto }] } });
    expect((await pide()).data.corregidos[0]).toMatchObject({ antes: { monto: 232_348_00 }, despues: { monto: 232_000_00 }, problema: null });
    expect((await pide('cargar', 240_000_00)).data).toMatchObject({ escrito: false, motivo: expect.stringContaining('pasa del total') });
    expect((await pide('cargar')).data).toMatchObject({ escrito: true });
    expect(await mov(pago)).toMatchObject({ monto: 232_000_00, subtotal: 200_000_00, iva: 32_000_00 });
    const e = (await o(`/proyectos/${obraM}/estado`)).data;
    expect(e.facturas_por_completar).toEqual([expect.objectContaining({ id: f.data.id, falta: 348_00, falta_sin_iva: 300_00 })]);
  });
});

/* 0.111.4 · Mike, 19-nov-2026: en QUALITAS sólo los pagos de su hoja y los
 * posteriores; «Los demás habrá que ubicarlos en otros proyectos». */
describe('sacar un pago del proyecto', () => {
  it('queda sin proyecto, con su dinero, y el proyecto se recalcula', async () => {
    const obraS = await crea('/proyectos', { cliente_id: cliente, nombre: 'Sacar pago' });
    const r1 = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: { buscar: '', proyecto_id: obraS, cuenta_id: cuenta, conceptos: [],
      ingresos: [{ fecha: '2026-01-30', monto: 348_000_00, iva: 48_000_00, descripcion: 'Pago 18 · SIN FACTURA' }] } });
    expect(r1.data, JSON.stringify(r1.data)).toMatchObject({ escrito: true });
    const pago = (await o(`/proyectos/${obraS}/estado`)).data.movimientos[0].id;
    expect((await proyecto(obraS)).cobrado_sin_iva).toBe(300_000_00);
    const r = await interno(ORG, { llave: LLAVE, dada: LLAVE, modo: 'cargar', carga: { buscar: '', proyecto_id: obraS, conceptos: [], ingresos: [], corregir: [{ movimiento_id: pago, sin_proyecto: true }] } });
    expect(r.data, JSON.stringify(r.data)).toMatchObject({ escrito: true, corregidos: [expect.objectContaining({ antes: expect.objectContaining({ proyecto_id: obraS }), despues: expect.objectContaining({ proyecto_id: null }) })] });
    expect(await mov(pago)).toMatchObject({ proyecto_id: null, monto: 348_000_00, subtotal: 300_000_00, iva: 48_000_00 });
    expect((await proyecto(obraS)).cobrado_sin_iva).toBe(0);
  });
});

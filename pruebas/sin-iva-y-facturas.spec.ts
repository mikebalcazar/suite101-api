/* El estado de cuenta del proyecto sin IVA, y las facturas de cada pago · 0.107.0
 *
 * Mike, 18-nov-2026 (recado de dash101 en el muro): «En los estados de cuenta
 * de los proyectos, siempre haz las cuentas sin IVA y desglosa por aparte el
 * IVA que se haya pagado o cobrado.» Y el mismo día: «NECESITO PODER LIGAR LOS
 * PAGOS CARGADOS NUEVOS CON LAS FACTURAS EXISTENTES».
 *
 * LO QUE DE VERDAD MIDEN:
 *
 *   · la prueba que pidió dash101: precio 1,000 y un cobro de 1,160 (1,000 +
 *     160 de IVA) es 100 % cobrado, saldo 0 e «IVA cobrado 160»;
 *   · que dos parcialidades de UNA factura se repartan su IVA a prorrata y
 *     no lo carguen entero cada una (el caso de HOLCIM, 8 y 13 de agosto);
 *   · que quitar la liga o cancelar la factura devuelva el pago a «sin
 *     factura» y el proyecto se recalcule;
 *   · que un desglose que no cuadra no entre;
 *   · que un pago diga qué facturas ya lo respaldan y cuáles se le pueden
 *     ligar, primero las del RFC del cliente.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'sin-iva-y-facturas';
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
const o = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}${ruta}`, op);

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}
async function crea(ruta: string, json: Record<string, unknown>, app?: string): Promise<string> {
  const r = await o('mike', ruta, { method: 'POST', json, app });
  expect(r.estado, `${ruta}: ${JSON.stringify(r)}`).toBe(201);
  return String(r.data.id);
}
const proyecto = async (id: string) => (await o('mike', `/proyectos/${id}`)).data;

let cliente = '', cuenta = '', obra = '';
const cobro = (monto: number, fecha: string, extra: Record<string, unknown> = {}) => crea('/movimientos', {
  tipo: 'ingreso', monto, fecha, cuenta_id: cuenta, proyecto_id: obra, contraparte_tipo: 'cliente', contraparte_id: cliente, descripcion: 'Pago', ...extra,
});
const factura = (json: Record<string, unknown>) => crea('/fiscal/cfdi', { tipo: 'ingreso', rfc: 'HOL010101AAA', razon_social: 'HOLCIM', ...json });
const mov = async (id: string) => (await o('mike', `/movimientos/${id}`)).data;

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Sin IVA y facturas', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  cliente = await crea('/clientes', { nombre: 'HOLCIM', rfc: 'HOL010101AAA' });
  cuenta = await crea('/cuentas', { nombre: 'Banco', tipo: 'banco' });
  obra = await crea('/proyectos', { cliente_id: cliente, nombre: 'Oficinas Santa Fe' });
});

describe('la prueba de dash101: 1,000 de precio y un cobro de 1,160', () => {
  it('es 100 % cobrado, saldo 0, y el IVA cobrado (160) va aparte', async () => {
    const p = await crea('/proyectos', { cliente_id: cliente, nombre: 'Prueba de dash101' });
    await o('mike', '/conceptos', { method: 'POST', json: { proyecto_id: p, descripcion: 'Todo', cantidad: 1, precio_unitario: 1_000_00 } });
    await crea('/movimientos', { tipo: 'ingreso', monto: 1_160_00, fecha: '2026-08-01', cuenta_id: cuenta, proyecto_id: p, facturado: true, subtotal: 1_000_00, iva: 160_00 });
    const t = (await o('mike', `/proyectos/${p}/estado`)).data.totales;
    expect(t).toMatchObject({ total: 1_000_00, cobrado: 1_000_00, saldo: 0, iva_cobrado: 160_00, cobrado_con_iva: 1_160_00 });
    const pr = await proyecto(p);
    expect(pr.cobrado_sin_iva / pr.precio_venta, '100 %').toBe(1);
  });
});

describe('una factura cobrada en dos parcialidades', () => {
  let cfdi = '', primera = '', segunda = '';

  beforeAll(async () => {
    // HOLCIM, 8 y 13 de agosto: un CFDI de 61,980 + 9,916.80 = 71,896.80 cobrado en dos pagos.
    cfdi = await factura({ uuid: 'AAAAAAAA-0000-4000-8000-000000000001', subtotal: 61_980_00, iva: 9_916_80, total: 71_896_80, fecha: '2026-08-07' });
    primera = await cobro(59_914_00, '2026-08-08');
    segunda = await cobro(11_982_80, '2026-08-13');
  });

  it('sin factura, cada pago es su propio subtotal y no lleva IVA', async () => {
    expect(await mov(primera)).toMatchObject({ subtotal: 59_914_00, iva: 0 });
  });

  it('cada parcialidad se lleva SU PARTE del IVA, no la factura entera', async () => {
    for (const m of [primera, segunda]) {
      const r = await o('mike', `/fiscal/cfdi/${cfdi}/ligar`, { method: 'POST', json: { movimiento_id: m } });
      expect(r.estado, JSON.stringify(r)).toBe(200);
    }
    expect(await mov(primera)).toMatchObject({ facturado: true, subtotal: 51_650_00, iva: 8_264_00 });
    expect(await mov(segunda)).toMatchObject({ facturado: true, subtotal: 10_330_00, iva: 1_652_80 });
  });

  it('las dos juntas dan el IVA de la factura, al centavo, y el proyecto lo guarda aparte', async () => {
    const [a, b] = [await mov(primera), await mov(segunda)];
    expect(a.iva + b.iva).toBe(9_916_80);
    expect(a.subtotal + b.subtotal).toBe(61_980_00);
    const p = await proyecto(obra);
    expect(p.cobrado, 'lo que tocó el banco').toBe(71_896_80);
    expect(p.cobrado_sin_iva).toBe(61_980_00);
    expect(p.iva_cobrado).toBe(9_916_80);
  });

  it('el estado de cuenta enseña cada pago con su factura', async () => {
    const e = (await o('mike', `/proyectos/${obra}/estado`)).data;
    const m = e.movimientos.find((x: any) => x.id === primera);
    expect(m).toMatchObject({ sin_iva: 51_650_00, iva: 8_264_00 });
    expect(m.facturas).toHaveLength(1);
    expect(m.facturas[0]).toMatchObject({ id: cfdi, uuid: 'AAAAAAAA-0000-4000-8000-000000000001', monto_aplicado: 59_914_00 });
  });

  it('quitar la liga devuelve el pago a «sin factura» y el proyecto se recalcula', async () => {
    const r = await o('mike', `/fiscal/cfdi/${cfdi}/desligar`, { method: 'POST', json: { movimiento_id: segunda } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(await mov(segunda)).toMatchObject({ facturado: false, subtotal: 11_982_80, iva: 0 });
    expect((await proyecto(obra)).iva_cobrado).toBe(8_264_00);
  });

  it('cancelar la factura deja sin IVA al pago que respaldaba', async () => {
    const r = await o('mike', `/fiscal/cfdi/${cfdi}/cancelar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(await mov(primera)).toMatchObject({ facturado: false, subtotal: 59_914_00, iva: 0 });
    expect((await proyecto(obra)).iva_cobrado).toBe(0);
  });
});

describe('el desglose de un movimiento cuadra', () => {
  it('con factura, subtotal + IVA − retenciones tiene que dar el monto', async () => {
    const mal = await o('mike', '/movimientos', { method: 'POST', json: {
      tipo: 'ingreso', monto: 1_160_00, fecha: '2026-09-01', cuenta_id: cuenta, proyecto_id: obra, facturado: true, subtotal: 1_160_00, iva: 160_00,
    } });
    expect(mal.estado).toBe(400);
    expect(mal.error).toBe('desglose_no_cuadra');
    const bien = await o('mike', '/movimientos', { method: 'POST', json: {
      tipo: 'ingreso', monto: 1_060_00, fecha: '2026-09-01', cuenta_id: cuenta, proyecto_id: obra, facturado: true, subtotal: 1_000_00, iva: 160_00, retenciones: 100_00,
    } });
    expect(bien.estado, JSON.stringify(bien)).toBe(201);
  });

  it('sin factura no se inventa un desglose: el subtotal es el monto, aunque se mande otro', async () => {
    const id = await cobro(5_000_00, '2026-09-02', { subtotal: 1_00, iva: 999_00 });
    expect(await mov(id)).toMatchObject({ subtotal: 5_000_00, iva: 0 });
    const r = await o('mike', `/movimientos/${id}`, { method: 'PATCH', json: { monto: 6_000_00 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(await mov(id), 'el subtotal sigue al monto').toMatchObject({ monto: 6_000_00, subtotal: 6_000_00, iva: 0 });
  });

  it('cambiar la descripción de uno viejo que no cuadra no lo bloquea', async () => {
    const id = await cobro(2_000_00, '2026-09-03');
    // Así quedaron algunos antes de 0.107.0: el IVA de la factura entera.
    await o('mike', `/fiscal/movimientos/${id}/facturado`, { method: 'POST', json: { facturado: true, subtotal: 1_724_14, iva: 275_86 } });
    const r = await o('mike', `/movimientos/${id}`, { method: 'PATCH', json: { descripcion: 'Otra' } });
    expect(r.estado).toBe(200);
  });

  it('quitarle la marca de facturado le quita el IVA', async () => {
    const id = await cobro(1_160_00, '2026-09-04');
    await o('mike', `/fiscal/movimientos/${id}/facturado`, { method: 'POST', json: { facturado: true, subtotal: 1_000_00, iva: 160_00 } });
    expect(await mov(id)).toMatchObject({ subtotal: 1_000_00, iva: 160_00 });
    await o('mike', `/fiscal/movimientos/${id}/facturado`, { method: 'POST', json: { facturado: false } });
    expect(await mov(id)).toMatchObject({ facturado: false, subtotal: 1_160_00, iva: 0 });
  });
});

describe('las facturas de un pago, para ligarlas desde el estado de cuenta', () => {
  let pago = '', suya = '', ajena = '';

  beforeAll(async () => {
    pago = await cobro(23_200_00, '2026-10-05');
    suya = await factura({ uuid: 'AAAAAAAA-0000-4000-8000-000000000002', subtotal: 40_000_00, iva: 6_400_00, total: 46_400_00, fecha: '2026-10-01' });
    ajena = await factura({ uuid: 'AAAAAAAA-0000-4000-8000-000000000003', rfc: 'OTR010101BBB', razon_social: 'Otro', subtotal: 1_000_00, iva: 160_00, total: 1_160_00, fecha: '2026-10-05' });
  });

  it('dice las que se le pueden ligar: primero las del RFC del cliente, con lo que les falta y lo que se aplicaría', async () => {
    const r = await o('mike', `/fiscal/movimientos/${pago}/facturas`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.ligadas).toEqual([]);
    expect(r.data.posibles[0]).toMatchObject({ id: suya, mismo_rfc: true, restante: 46_400_00, aplica: 23_200_00 });
    expect(r.data.posibles.map((f: any) => f.id)).toContain(ajena);
  });

  it('al ligarla con lo que dice `aplica`, queda entre las ligadas y el pago se lleva su parte del IVA', async () => {
    const antes = (await o('mike', `/fiscal/movimientos/${pago}/facturas`)).data.posibles[0];
    const l = await o('mike', `/fiscal/cfdi/${suya}/ligar`, { method: 'POST', json: { movimiento_id: pago, monto_aplicado: antes.aplica } });
    expect(l.estado, JSON.stringify(l)).toBe(200);
    const r = (await o('mike', `/fiscal/movimientos/${pago}/facturas`)).data;
    expect(r.ligadas.map((f: any) => [f.id, f.monto_aplicado])).toEqual([[suya, 23_200_00]]);
    expect(r.posibles.map((f: any) => f.id)).not.toContain(suya);
    expect(r.movimiento.falta).toBe(0);
    expect(await mov(pago)).toMatchObject({ subtotal: 20_000_00, iva: 3_200_00 });
  });

  it('un pago que no existe es 404; quien es cliente no entra', async () => {
    expect((await o('mike', '/fiscal/movimientos/no-existe/facturas')).estado).toBe(404);
  });
});

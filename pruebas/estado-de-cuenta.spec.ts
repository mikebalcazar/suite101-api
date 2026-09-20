/* El estado de cuenta de un cliente · contrato 0.29.0
 *
 * Mike, 20-sep: «necesito poder ver por cliente su estado de cuenta general.
 * Saldo global, y por proyecto, y poder exportarlo en un PDF para enviar
 * reportes».
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que el saldo global SEA la suma de los renglones que se enseñan. Es un
 *     documento que se manda a un cliente: si el total y la tabla salieran
 *     de dos consultas, un día se contradicen y las dos se ven ciertas —le
 *     pasó a /peek el 7-sep—;
 *   · que un cobro SIN PROYECTO aparezca. Es justo el hueco de /peek, cuyos
 *     pagos salen de un JOIN contra proyectos: un anticipo dado antes de
 *     abrir el proyecto ahí no sale, y en un estado de cuenta esa omisión es
 *     la diferencia entre cuadrar y que el cliente reclame;
 *   · que NO se cuelen los cobros de otro cliente. En una cuenta que se
 *     manda por correo, un renglón ajeno no es un detalle;
 *   · que un cliente no abra el estado de cuenta de nadie: él ve lo suyo por
 *     peek101, recortado.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'estado-de-cuenta';

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

let negocio = '', cuenta = '', holcim = '', otro = '', casaUno = '', casaDos = '';

const cobrar = async (monto: number, args: { proyecto_id?: string | null; cliente_id: string; nombre: string; fecha: string }) =>
  (await o('mike', '/movimientos', { method: 'POST', json: {
    negocio_id: negocio, tipo: 'ingreso', monto, fecha: args.fecha, cuenta_id: cuenta,
    proyecto_id: args.proyecto_id ?? null,
    contraparte_tipo: 'cliente', contraparte_id: args.cliente_id, contraparte_nombre: args.nombre,
  } })).data.id;

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Estado de cuenta' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cuenta = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco', saldo_inicial: 0 } })).data.id;
  holcim = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'HOLCIM', rfc: 'HOL010101AAA', correo: 'pagos@holcim.mx' } })).data.id;
  otro = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Otro Cliente' } })).data.id;

  casaUno = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: holcim, nombre: 'Planta Norte', fecha_inicio: '2026-01-15' } })).data.id;
  casaDos = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: holcim, nombre: 'Oficinas', fecha_inicio: '2026-03-01' } })).data.id;

  // Lo vendido: ítems de cada proyecto. El precio lo suma la API.
  for (const [proy, monto] of [[casaUno, 500_000_00], [casaDos, 300_000_00]] as const) {
    await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: holcim, proyecto_id: proy, nombre: 'Alcance', monto, estado: 'vendido',
    } });
  }
}, 60000);

describe('el estado de cuenta', () => {
  it('sin un peso cobrado, debe todo lo que se le vendió', async () => {
    const r = await o('mike', `/clientes/${holcim}/estado-de-cuenta`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.cliente.nombre).toBe('HOLCIM');
    expect(r.data.cliente.rfc, 'con lo que hace falta para un reporte').toBe('HOL010101AAA');
    expect(r.data.totales.vendido).toBe(800_000_00);
    expect(r.data.totales.cobrado).toBe(0);
    expect(r.data.totales.saldo).toBe(800_000_00);
  });

  it('por proyecto: cada uno con su precio, lo cobrado y lo que falta', async () => {
    await cobrar(200_000_00, { proyecto_id: casaUno, cliente_id: holcim, nombre: 'HOLCIM', fecha: '2026-02-01' });
    await cobrar(50_000_00, { proyecto_id: casaDos, cliente_id: holcim, nombre: 'HOLCIM', fecha: '2026-03-10' });

    const r = await o('mike', `/clientes/${holcim}/estado-de-cuenta`);
    const norte = r.data.proyectos.find((p: any) => p.nombre === 'Planta Norte');
    expect(norte.precio_venta).toBe(500_000_00);
    expect(norte.cobrado).toBe(200_000_00);
    expect(norte.saldo).toBe(300_000_00);
    // Y cada proyecto trae SUS pagos, para que el reporte los pueda desglosar.
    expect(norte.pagos).toHaveLength(1);
    expect(norte.pagos[0].fecha).toBe('2026-02-01');
  });

  it('un anticipo SIN proyecto también cuenta: es el hueco de /peek', async () => {
    /* /peek saca los pagos de un JOIN contra proyectos. Un anticipo dado
     * antes de abrir el proyecto ahí no aparece, y en un estado de cuenta
     * esa omisión es la diferencia entre cuadrar y que el cliente reclame. */
    await cobrar(80_000_00, { proyecto_id: null, cliente_id: holcim, nombre: 'HOLCIM', fecha: '2026-01-05' });

    const r = await o('mike', `/clientes/${holcim}/estado-de-cuenta`);
    expect(r.data.otros_pagos, 'sale aparte, con su renglón').toHaveLength(1);
    expect(r.data.totales.sin_proyecto).toBe(80_000_00);
    expect(r.data.totales.cobrado, '200,000 + 50,000 + 80,000').toBe(330_000_00);
    expect(r.data.totales.saldo).toBe(470_000_00);
  });

  it('el saldo global ES la suma de los renglones que se enseñan', async () => {
    /* Si el total y la tabla salieran de dos consultas, un día se
     * contradicen y las dos se ven ciertas. Le pasó a /peek el 7-sep. */
    const r = await o('mike', `/clientes/${holcim}/estado-de-cuenta`);
    const d = r.data;
    const sumaProyectos = d.proyectos.reduce((t: number, p: any) => t + p.cobrado, 0);
    const sumaOtros = d.otros_pagos.reduce((t: number, g: any) => t + g.monto, 0);
    expect(sumaProyectos + sumaOtros).toBe(d.totales.cobrado);
    expect(d.proyectos.reduce((t: number, p: any) => t + p.precio_venta, 0)).toBe(d.totales.vendido);
    expect(d.totales.vendido - d.totales.cobrado).toBe(d.totales.saldo);
    // Y renglón por renglón: el cobrado de un proyecto es la suma de SUS pagos.
    for (const p of d.proyectos) {
      expect(p.pagos.reduce((t: number, g: any) => t + g.monto, 0), `los pagos de ${p.nombre}`).toBe(p.cobrado);
      expect(p.precio_venta - p.cobrado).toBe(p.saldo);
    }
  });

  it('los cobros de OTRO cliente no se cuelan', async () => {
    /* En una cuenta que se manda por correo, un renglón ajeno no es un
     * detalle: es una fuga de lo que otro cliente pagó. */
    const suyo = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: otro, nombre: 'Bodega' } })).data.id;
    await cobrar(99_000_00, { proyecto_id: suyo, cliente_id: otro, nombre: 'Otro Cliente', fecha: '2026-03-15' });

    const r = await o('mike', `/clientes/${holcim}/estado-de-cuenta`);
    expect(r.data.proyectos.map((p: any) => p.nombre)).not.toContain('Bodega');
    expect(r.data.totales.cobrado, 'no se movió').toBe(330_000_00);
    const todos = [...r.data.otros_pagos, ...r.data.proyectos.flatMap((p: any) => p.pagos)];
    expect(todos.some((g: any) => g.monto === 99_000_00)).toBe(false);
  });

  it('los pagos traen si están facturados, para poder mandarlo con su folio', async () => {
    const r = await o('mike', `/clientes/${holcim}/estado-de-cuenta`);
    const uno = r.data.proyectos.flatMap((p: any) => p.pagos)[0];
    expect(Object.keys(uno)).toContain('facturado');
    expect(Object.keys(uno)).toContain('uuid_cfdi');
    expect(Object.keys(uno), 'y de qué cuenta entró').toContain('cuenta_nombre');
  });

  it('un cliente que no existe da 404, no una cuenta vacía', async () => {
    /* Una cuenta en ceros se lee como «no debe nada», que es lo contrario de
     * «ese cliente no existe». */
    const r = await o('mike', '/clientes/no-existe/estado-de-cuenta');
    expect(r.estado).toBe(404);
  });
});

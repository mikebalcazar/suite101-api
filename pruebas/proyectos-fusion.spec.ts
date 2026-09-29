/* Fusionar dos proyectos que son el mismo · contrato 0.52.0
 *
 * Mike, 29-sep-2026: «No puedo fusionar el proyecto, solo el cliente. Y
 * quiero fusionar proyectos.» Le pasó con «Sanje CC37»: capturado dos veces,
 * con 11 movimientos en uno, y con dinero no se borra (0.51.0).
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que fusionar NO pierda nada: ítems con su partida, partidas con
 *     proveedor, movimientos, órdenes, la cotización de quote101 (que apunta
 *     al proyecto dentro de `datos`), los archivos del proyecto y la obra de
 *     quell. Un pago que se quede apuntando a un proyecto borrado es dinero
 *     sin dueño en el estado de cuenta;
 *   · que los cachés del que se queda (precio_venta, cobrado, compromiso) se
 *     recalculen: si no, el proyecto fusionado enseña las cifras de antes;
 *   · que la obra sea una por proyecto: si el que se queda ya tiene la suya,
 *     la otra queda suelta y se dice, en vez de tronar por el índice único;
 *   · que `seco` cuente lo mismo sin mover nada, y que sólo dueño y
 *     administración puedan.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'fusionar-proyectos';
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const GENTE = { tin: { correo: 'tin-fus@ejemplo.mx', nombre: 'Tin Taller', rol: 'staff' } };
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
const q = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}/quell${ruta}`, { app: 'quell101', ...op });

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, `código para ${correo}: ${JSON.stringify(c)}`).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}
async function crea(ruta: string, json: Record<string, unknown>, app?: string): Promise<string> {
  const r = await o('mike', ruta, { method: 'POST', json, app });
  expect(r.estado, `${ruta}: ${JSON.stringify(r)}`).toBe(201);
  return String(r.data.id);
}

let negocio = '', cuenta = '', proveedor = '', cliente = '', otroCliente = '';
const A = { proyecto: '', items: [] as string[] };
const B = { proyecto: '', items: [] as string[], partida: '', movimiento: '', orden: '', cotizacion: '', archivo: '', obra: '' };

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Fusionar proyectos', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: GENTE.tin, app: 'master101' });
  expect([201, 409]).toContain(m.estado);

  negocio = await crea('/negocios', { nombre: 'Taller' });
  cuenta = await crea('/cuentas', { negocio_id: negocio, nombre: 'Banco', tipo: 'banco' });
  proveedor = await crea('/proveedores', { negocio_id: negocio, nombre: 'Maderas' });
  cliente = await crea('/clientes', { negocio_id: negocio, nombre: 'Sanje' });
  otroCliente = await crea('/clientes', { negocio_id: negocio, nombre: 'Sanje (repetido)' });

  // A: el que se queda. Un ítem vendido, sin más.
  A.proyecto = await crea('/proyectos', { negocio_id: negocio, cliente_id: cliente, nombre: 'Sanje CC37' });
  A.items.push(await crea('/items', { negocio_id: negocio, cliente_id: cliente, proyecto_id: A.proyecto, nombre: 'Barra', monto: 20_000_00, estado: 'vendido' }));

  // B: el que se va, con de todo colgando, y de OTRO cliente (el repetido).
  B.proyecto = await crea('/proyectos', { negocio_id: negocio, cliente_id: otroCliente, nombre: 'Sanje CC37 NEW' });
  for (const nombre of ['Cocina', 'Clóset']) {
    B.items.push(await crea('/items', { negocio_id: negocio, cliente_id: otroCliente, proyecto_id: B.proyecto, nombre, monto: 10_000_00, estado: 'vendido', partida: 'Planta baja' }));
  }
  B.partida = await crea('/partidas', { proyecto_id: B.proyecto, proveedor_id: proveedor, proveedor_nombre: 'Maderas', concepto: 'Tablero', monto_acordado: 5_000_00 });
  B.movimiento = await crea('/movimientos', { negocio_id: negocio, tipo: 'ingreso', monto: 15_000_00, fecha: '2026-09-01', cuenta_id: cuenta, proyecto_id: B.proyecto, contraparte_tipo: 'cliente', contraparte_id: otroCliente, contraparte_nombre: 'Sanje (repetido)', concepto: 'Anticipo' });
  B.orden = await crea('/ordenes', { negocio_id: negocio, proyecto_id: B.proyecto, proveedor_id: proveedor, proveedor_nombre: 'Maderas', concepto: 'Bisagras', monto: 800_00, con_factura: false, fecha_maxima_pago: '2026-10-15' });
  B.cotizacion = await crea('/cotizaciones', { negocio_id: negocio, cliente_id: otroCliente, total: 0, datos: { nombre: 'Corrida 2', proyecto_id: B.proyecto, versiones: [] } }, 'cotizador101');
  const fd = new FormData();
  fd.set('archivo', new File([PNG], 'plano.png', { type: 'image/png' }));
  fd.set('de_tabla', 'proyectos'); fd.set('de_id', B.proyecto);
  const ar = await o('mike', '/archivos', { method: 'POST', body: fd });
  expect(ar.estado, JSON.stringify(ar)).toBe(201);
  B.archivo = String(ar.data.id);
  const ob = await q('mike', '/projects', { method: 'POST', json: { name: 'Obra Sanje', client: 'Sanje' } });
  expect([200, 201]).toContain(ob.estado);
  B.obra = String((ob.project ?? ob.data ?? ob).id);
  const liga = await o('mike', `/obras/${B.obra}/ligar`, { method: 'POST', json: { proyecto_id: B.proyecto } });
  expect(liga.estado, JSON.stringify(liga)).toBe(200);
});

describe('fusionar dos proyectos', () => {
  it('sólo el dueño y la administración: alguien de taller no fusiona', async () => {
    await entrar('tin', GENTE.tin.correo);
    const r = await o('tin', `/proyectos/${A.proyecto}/fusionar`, { method: 'POST', json: { se_va_id: B.proyecto } });
    expect(r.estado).toBe(403);
  });
  it('lo que no existe, fusionarse con uno mismo, y sin se_va_id', async () => {
    expect((await o('mike', `/proyectos/${A.proyecto}/fusionar`, { method: 'POST', json: { se_va_id: A.proyecto } })).estado).toBe(400);
    expect((await o('mike', `/proyectos/${A.proyecto}/fusionar`, { method: 'POST', json: { se_va_id: 'no-existe' } })).estado).toBe(404);
    expect((await o('mike', `/proyectos/no-existe/fusionar`, { method: 'POST', json: { se_va_id: B.proyecto } })).estado).toBe(404);
    expect((await o('mike', `/proyectos/${A.proyecto}/fusionar`, { method: 'POST', json: {} })).estado).toBe(400);
  });
  it('en seco cuenta todo lo que se movería, y no mueve nada', async () => {
    const r = await o('mike', `/proyectos/${A.proyecto}/fusionar`, { method: 'POST', json: { se_va_id: B.proyecto, seco: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.seco).toBe(true);
    expect(r.data.se_va.nombre).toBe('Sanje CC37 NEW');
    expect(r.data.movidos).toMatchObject({ items: 2, partidas: 1, movimientos: 1, ordenes: 1, cotizaciones: 1, archivos: 1, obras: 1 });
    expect(r.data.obra_suelta).toBe(false);
    expect((await o('mike', `/proyectos/${B.proyecto}`)).estado).toBe(200);
    expect((await o('mike', `/items/${B.items[0]}`)).data.proyecto_id).toBe(B.proyecto);
  });
  it('el que se va le deja TODO al que se queda, y desaparece', async () => {
    const r = await o('mike', `/proyectos/${A.proyecto}/fusionar`, { method: 'POST', json: { se_va_id: B.proyecto } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.seco).toBe(false);
    expect(r.data.movidos).toMatchObject({ items: 2, partidas: 1, movimientos: 1, ordenes: 1, cotizaciones: 1, archivos: 1, obras: 1 });
    expect((await o('mike', `/proyectos/${B.proyecto}`)).estado).toBe(404);

    for (const id of B.items) {
      const it = (await o('mike', `/items/${id}`)).data;
      expect(it.proyecto_id).toBe(A.proyecto);
      expect(it.cliente_id, 'el ítem toma el cliente del proyecto que se queda').toBe(cliente);
      expect(it.partida, 'y conserva su partida').toBe('Planta baja');
    }
    expect((await o('mike', `/partidas/${B.partida}`)).data.proyecto_id).toBe(A.proyecto);
    expect((await o('mike', `/movimientos/${B.movimiento}`)).data.proyecto_id).toBe(A.proyecto);
    const ord = (await o('mike', `/ordenes/${B.orden}`)).data;
    expect((ord.orden ?? ord).proyecto_id, 'la orden de compra sigue al proyecto').toBe(A.proyecto);
    const cot = (await o('mike', `/cotizaciones/${B.cotizacion}`, { app: 'cotizador101' })).data;
    expect(cot.datos.proyecto_id, 'la cotización de quote101 apunta al que se queda').toBe(A.proyecto);
    const archivos = (await o('mike', `/archivos?de_tabla=proyectos&de_id=${A.proyecto}`)).data;
    const lista = Array.isArray(archivos) ? archivos : archivos?.filas ?? [];
    expect(lista.map((a: any) => a.id)).toContain(B.archivo);
    const obra = (await o('mike', `/obras`)).data;
    const obras = Array.isArray(obra) ? obra : obra?.obras ?? obra?.filas ?? [];
    expect(obras.find((x: any) => x.id === B.obra)?.proyecto_id, 'la obra de quell sigue al proyecto').toBe(A.proyecto);
  });
  it('los cachés del que se queda se recalculan: 3 ítems vendidos, un anticipo, un compromiso', async () => {
    const p = (await o('mike', `/proyectos/${A.proyecto}`)).data;
    expect(Number(p.precio_venta)).toBe(40_000_00);
    expect(Number(p.cobrado)).toBe(15_000_00);
    expect(Number(p.compromiso)).toBe(5_000_00);
  });
  it('si el que se queda ya tiene obra, la del que se va queda suelta y se dice', async () => {
    const C = await crea('/proyectos', { negocio_id: negocio, cliente_id: cliente, nombre: 'Con obra propia' });
    const ob = await q('mike', '/projects', { method: 'POST', json: { name: 'Obra C', client: 'Sanje' } });
    const obraC = String((ob.project ?? ob.data ?? ob).id);
    expect((await o('mike', `/obras/${obraC}/ligar`, { method: 'POST', json: { proyecto_id: C } })).estado).toBe(200);
    const r = await o('mike', `/proyectos/${A.proyecto}/fusionar`, { method: 'POST', json: { se_va_id: C } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.obra_suelta).toBe(true);
    expect(r.data.movidos.obras).toBeUndefined();
    const obra = (await o('mike', `/obras`)).data;
    const obras = Array.isArray(obra) ? obra : obra?.obras ?? obra?.filas ?? [];
    expect(obras.find((x: any) => x.id === obraC)?.proyecto_id ?? null).toBeNull();
    expect(obras.find((x: any) => x.id === B.obra)?.proyecto_id).toBe(A.proyecto);
  });
});

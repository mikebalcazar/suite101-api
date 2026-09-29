/* Un solo negocio por empresa · contrato 0.50.0
 *
 * Mike, 29-sep-2026: «borres de dash (y de todas las plataformas) la opción
 * de agregar diferentes negocios. Ya no vamos a tener esa funcionalidad (los
 * otros negocios son como TUYS y vibehome). Todo es para un negocio nada
 * más.» Y escogió, con botones, fusionar lo que ya existe en uno.
 *
 * Lo que se cuida: que TODO lo del negocio que se va llegue al que se queda
 * —no una lista de tablas escrita a mano, sino cada tabla con `negocio_id`—,
 * que el ensayo en seco no escriba, que un catálogo con el mismo código en
 * los dos negocios quede en uno solo con sus piezas apuntándole, y que la
 * gente acotada a un negocio quede viendo el único que hay.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const SOCIA = { correo: 'sol-un-negocio@ejemplo.mx', nombre: 'Sol Socia', rol: 'socio' };
const ORG = 'un-solo-negocio';
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, op: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (op.app !== '') cabeceras['X-App'] = op.app ?? 'dash101';
  if (galletas[quien]) cabeceras.Cookie = galletas[quien];
  let body = op.body;
  if (op.json !== undefined) { body = JSON.stringify(op.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...op, body, headers: { ...cabeceras, ...(op.headers as object) } });
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
  expect(c.estado).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado).toBe(200);
}

let queda = '', seVa = '', clienteB = '', proyectoB = '', productoA = '', productoB = '', itemB = '', cuentaB = '';
/** Da de alta y exige el 201: un alta que falla en silencio deja la prueba
 *  midiendo otra cosa. */
async function crea(ruta: string, json: Record<string, unknown>, app?: string): Promise<string> {
  const r = await o('mike', ruta, { method: 'POST', json, ...(app ? { app } : {}) });
  expect(r.estado, `${ruta}: ${JSON.stringify(r)}`).toBe(201);
  return r.data.id as string;
}

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Un solo negocio' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  queda = await crea('/negocios', { nombre: 'Forespot' });
  seVa = await crea('/negocios', { nombre: 'TUYS' });

  const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, {
    method: 'POST', app: '',
    json: { correo: SOCIA.correo, rol: SOCIA.rol, nombre: SOCIA.nombre, apps: ['dash'], negocios: [seVa] },
  });
  expect(m.estado, JSON.stringify(m)).toBe(201);
  await entrar('sol', SOCIA.correo);

  // Lo que vive en el negocio que se queda: un cliente y un producto PT-STD.
  const clienteA = await crea('/clientes', { negocio_id: queda, nombre: 'Casa Lomas' });
  await crea('/proyectos', { negocio_id: queda, cliente_id: clienteA, nombre: 'Departamento' });
  productoA = await crea('/productos', { negocio_id: queda, codigo: 'PT-STD', nombre: 'Puerta estándar', precio: 250000 });

  // Y lo del que se va: cliente, proyecto con ítems, cuenta con movimiento,
  // cotización, producto con EL MISMO código y otro con código propio.
  clienteB = await crea('/clientes', { negocio_id: seVa, nombre: 'HOLCIM' });
  proyectoB = await crea('/proyectos', { negocio_id: seVa, cliente_id: clienteB, nombre: 'Oficinas' });
  productoB = await crea('/productos', { negocio_id: seVa, codigo: 'PT-STD', nombre: 'Puerta estándar (TUYS)', precio: 260000 });
  await crea('/productos', { negocio_id: seVa, codigo: 'MW-01', nombre: 'Cocina TUYS', precio: 900000 });
  itemB = await crea('/items', { negocio_id: seVa, cliente_id: clienteB, proyecto_id: proyectoB, nombre: 'Puerta estándar', monto: 260000, estado: 'vendido' });
  // El producto se asigna por su ruta, no en el alta (regla del 20-sep).
  const asig = await o('mike', `/items/${itemB}/producto`, { method: 'POST', json: { producto_id: productoB } });
  expect(asig.estado, JSON.stringify(asig)).toBe(200);
  await crea('/items', { negocio_id: seVa, cliente_id: clienteB, proyecto_id: proyectoB, nombre: 'Recepción', monto: 300_000_00, estado: 'vendido' });
  cuentaB = await crea('/cuentas', { negocio_id: seVa, nombre: 'Caja TUYS', tipo: 'caja', saldo_inicial: 100000 });
  await crea('/movimientos', { negocio_id: seVa, tipo: 'ingreso', monto: 50000, fecha: '2026-09-29', cuenta_id: cuentaB, proyecto_id: proyectoB, concepto: 'Anticipo' });
  await crea('/cotizaciones', { negocio_id: seVa, cliente_id: clienteB, total: 0, datos: { nombre: 'Corrida TUYS', proyecto_id: proyectoB, versiones: [] } }, 'cotizador101');
}, 60_000);

describe('0.50.0 · fusionar los negocios en uno', () => {
  it('en seco dice qué se movería y no escribe nada', async () => {
    const r = await o('mike', '/negocios/fusionar', { method: 'POST', json: { queda_id: queda, seco: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.seco).toBe(true);
    expect(r.data.queda.id).toBe(queda);
    expect(r.data.se_fueron.map((n: any) => n.nombre)).toEqual(['TUYS']);
    expect(r.data.movidos).toMatchObject({ clientes: 1, proyectos: 1, items: 2, cuentas: 1, movimientos: 1, cotizaciones: 1, productos: 2 });
    expect(r.data.productos_fusionados, 'PT-STD está en los dos').toBe(1);
    expect((await o('mike', '/negocios')).data.filas.length, 'siguen siendo dos').toBe(2);
    expect((await o('mike', `/clientes?negocio_id=${seVa}`)).data.filas.length, 'y HOLCIM sigue en TUYS').toBe(1);
  });

  it('un negocio que no existe: 404; sin queda_id: 400', async () => {
    expect((await o('mike', '/negocios/fusionar', { method: 'POST', json: { queda_id: 'no-existe' } })).estado).toBe(404);
    expect((await o('mike', '/negocios/fusionar', { method: 'POST', json: {} })).estado).toBe(400);
  });

  it('la socia no puede: lo hace quien dirige la empresa', async () => {
    const r = await o('sol', '/negocios/fusionar', { method: 'POST', json: { queda_id: queda } });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('sin_permiso');
  });

  it('de verdad: todo pasa al que se queda, TUYS se borra, y el catálogo repetido queda en uno', async () => {
    const r = await o('mike', '/negocios/fusionar', { method: 'POST', json: { queda_id: queda } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.seco).toBe(false);
    expect(r.data.se_fueron.length).toBe(1);

    const negocios = (await o('mike', '/negocios')).data.filas;
    expect(negocios.map((n: any) => n.nombre)).toEqual(['Forespot']);

    expect((await o('mike', `/clientes?negocio_id=${queda}`)).data.filas.map((c: any) => c.nombre).sort()).toEqual(['Casa Lomas', 'HOLCIM']);
    expect((await o('mike', `/proyectos?negocio_id=${queda}`)).data.filas.length).toBe(2);
    expect((await o('mike', `/proyectos/${proyectoB}`)).data.negocio_id).toBe(queda);
    expect((await o('mike', `/items?negocio_id=${queda}`)).data.total).toBe(2);
    expect((await o('mike', `/cuentas?negocio_id=${queda}`)).data.filas.map((c: any) => c.nombre)).toEqual(['Caja TUYS']);
    expect((await o('mike', `/movimientos?negocio_id=${queda}`)).data.filas.length).toBe(1);
    expect((await o('mike', `/cotizaciones?negocio_id=${queda}`, { app: 'cotizador101' })).data.filas.length).toBe(1);

    const productos = (await o('mike', `/productos?negocio_id=${queda}`)).data.filas;
    expect(productos.map((p: any) => p.codigo).sort(), 'un solo PT-STD, y el MW-01 llegó').toEqual(['MW-01', 'PT-STD']);
    expect(productos.find((p: any) => p.codigo === 'PT-STD').id, 'ganó el del negocio que se queda').toBe(productoA);
    expect((await o('mike', `/items/${itemB}`)).data.producto_id, 'y la puerta de TUYS ahora apunta a ése').toBe(productoA);
    expect((await o('mike', `/productos/${productoB}`)).estado, 'el repetido se borró').toBe(404);
  });

  it('la socia acotada a TUYS ahora ve el único negocio que hay', async () => {
    const yo = await pedir('sol', '/yo', { app: '' });
    const suya = (yo.data.orgs as any[]).find((x) => x.id === ORG);
    expect(suya.negocios, 'vacío es «todos»').toEqual([]);
    const r = await o('sol', `/proyectos/${proyectoB}`);
    expect(r.estado).toBe(200);
    expect((await o('sol', '/clientes')).data.filas.length, 'sin filtro le llegan los de la empresa').toBe(2);
  });

  it('fusionar cuando ya hay uno solo no hace nada y lo dice', async () => {
    const r = await o('mike', '/negocios/fusionar', { method: 'POST', json: { queda_id: queda } });
    expect(r.estado).toBe(200);
    expect(r.data.se_fueron).toEqual([]);
    expect(r.data.movidos).toEqual({});
  });
});

/* Borrar un cliente o un proyecto con todo lo suyo · contrato 0.51.0
 *
 * Mike, 29-sep-2026: «no puedo borrar clientes de quote101, me aparece este
 * error [Error al guardar. Verifica tu conexión]». quote101 borraba de
 * abajo hacia arriba y el proyecto no se iba porque sus ítems le cuelgan
 * (llave foránea); un cliente con proyecto no se podía borrar desde ninguna
 * app, y la pantalla lo tapaba con un aviso de conexión.
 *
 * Lo que se cuida: que sin dinero ni historia se vaya TODO (y las piezas y
 * obras de quell se queden, sueltas, contadas); que con dinero no se borre
 * nada y se diga; que con historia (un avance de obra) tampoco, y se diga
 * cuál; que el ensayo en seco no escriba.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'borrar-con-todo';
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
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

async function crea(ruta: string, json: Record<string, unknown>, app?: string): Promise<string> {
  const r = await o('mike', ruta, { method: 'POST', json, ...(app ? { app } : {}) });
  expect(r.estado, `${ruta}: ${JSON.stringify(r)}`).toBe(201);
  return r.data.id as string;
}

let negocio = '', cuenta = '';
const A = { cliente: '', proyecto: '', items: [] as string[], cotizacion: '', obra: '', pieza: '' };
const B = { cliente: '', proyecto: '' };
const C = { cliente: '', proyecto: '', item: '' };

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Borrar con todo', apps: { dash: true, quell: true, cotizador: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = await crea('/negocios', { nombre: 'Taller' });
  cuenta = await crea('/cuentas', { negocio_id: negocio, nombre: 'Banco', tipo: 'banco' });

  // A · TIEZTCH: proyecto con dos ítems, una cotización, una partida, y una
  // obra de quell ligada con una pieza colgada de un ítem. Sin dinero.
  A.cliente = await crea('/clientes', { negocio_id: negocio, nombre: 'TIEZTCH' });
  A.proyecto = await crea('/proyectos', { negocio_id: negocio, cliente_id: A.cliente, nombre: 'Oficinas TIEZTCH' });
  for (const nombre of ['Recepción', 'Barra']) {
    A.items.push(await crea('/items', { negocio_id: negocio, cliente_id: A.cliente, proyecto_id: A.proyecto, nombre, monto: 10_000_00, estado: 'vendido' }));
  }
  A.cotizacion = await crea('/cotizaciones', { negocio_id: negocio, cliente_id: A.cliente, total: 0, datos: { nombre: 'Corrida 1', proyecto_id: A.proyecto, versiones: [] } }, 'cotizador101');
  await crea('/partidas', { proyecto_id: A.proyecto, proveedor_nombre: 'Maderas del Norte', concepto: 'Madera', monto_acordado: 5_000_00 });
  await q('mike', '/me');
  A.obra = (await q('mike', '/projects', { method: 'POST', json: { name: 'TIEZTCH (obra)', client: 'TIEZTCH' } })).id;
  const liga = await o('mike', `/obras/${A.obra}/ligar`, { method: 'POST', json: { proyecto_id: A.proyecto } });
  expect(liga.estado, JSON.stringify(liga)).toBe(200);
  const fd = new FormData();
  fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
  fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
  const plano = (await q('mike', `/projects/${A.obra}/plans`, { method: 'POST', body: fd })).id;
  A.pieza = (await q('mike', `/plans/${plano}/elements`, { method: 'POST', json: { op_id: crypto.randomUUID(), name: 'Recepción', type: 'Mueble', x: 0.3, y: 0.3 } })).id;
  const l = await o('mike', `/obras/${A.obra}/items`, { method: 'POST', json: { ligar: [{ element_id: A.pieza, item_id: A.items[0] }] } });
  expect(l.estado, JSON.stringify(l)).toBe(200);

  // B · con dinero: un anticipo cobrado.
  B.cliente = await crea('/clientes', { negocio_id: negocio, nombre: 'Con dinero' });
  B.proyecto = await crea('/proyectos', { negocio_id: negocio, cliente_id: B.cliente, nombre: 'Casa con anticipo' });
  await crea('/movimientos', { negocio_id: negocio, tipo: 'ingreso', monto: 50_00, fecha: '2026-09-01', cuenta_id: cuenta, proyecto_id: B.proyecto, contraparte_tipo: 'cliente', contraparte_id: B.cliente, contraparte_nombre: 'Con dinero', concepto: 'Anticipo' });

  // C · con historia: un ítem con un avance de obra.
  C.cliente = await crea('/clientes', { negocio_id: negocio, nombre: 'Con historia' });
  C.proyecto = await crea('/proyectos', { negocio_id: negocio, cliente_id: C.cliente, nombre: 'Casa avanzada' });
  C.item = await crea('/items', { negocio_id: negocio, cliente_id: C.cliente, proyecto_id: C.proyecto, nombre: 'Clóset', monto: 1_000_00, estado: 'vendido' });
  const av = await o('mike', `/items/${C.item}/etapa`, { method: 'POST', json: { etapa: 1, nota: 'anticipo pagado' } });
  expect(av.estado, JSON.stringify(av)).toBe(200);
}, 90_000);

describe('0.51.0 · borrar un cliente con todo lo suyo', () => {
  it('en seco cuenta lo que se iría y no escribe', async () => {
    const r = await o('mike', `/clientes/${A.cliente}/borrar`, { method: 'POST', json: { modo: 'seco' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ modo: 'seco', proyectos: 1, items: 2, cotizaciones: 1, partidas: 1, piezas_sin_item: 1, obras_sueltas: 1 });
    expect((await o('mike', `/clientes/${A.cliente}`)).estado, 'sigue ahí').toBe(200);
    expect((await o('mike', `/proyectos/${A.proyecto}`)).estado).toBe(200);
  });

  it('el DELETE de siempre sigue diciendo que no: el proyecto tiene ítems colgando', async () => {
    const r = await o('mike', `/proyectos/${A.proyecto}`, { method: 'DELETE' });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('en_uso');
  });

  it('de verdad: se van cliente, proyecto, ítems, cotización y partida; la pieza y la obra de quell se quedan sueltas', async () => {
    const r = await o('mike', `/clientes/${A.cliente}/borrar`, { method: 'POST', json: {} });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ modo: 'borrar', proyectos: 1, items: 2, cotizaciones: 1, partidas: 1, piezas_sin_item: 1, obras_sueltas: 1 });
    expect((await o('mike', `/clientes/${A.cliente}`)).estado).toBe(404);
    expect((await o('mike', `/proyectos/${A.proyecto}`)).estado).toBe(404);
    for (const id of A.items) expect((await o('mike', `/items/${id}`)).estado).toBe(404);
    expect((await o('mike', `/cotizaciones/${A.cotizacion}`, { app: 'cotizador101' })).estado).toBe(404);
    expect((await o('mike', `/partidas?proyecto_id=${A.proyecto}`)).data.filas.length).toBe(0);

    const pieza = await q('mike', `/elements/${A.pieza}`);
    expect(pieza.estado, JSON.stringify(pieza)).toBe(200);
    expect(pieza.element.item_id, 'la pieza sobrevive, sin ítem').toBeNull();
    const obra = ((await o('mike', '/obras')).data.obras as any[]).find((x) => x.id === A.obra);
    expect(obra, 'la obra sobrevive').toBeTruthy();
    expect(obra.proyecto_id, 'sin proyecto').toBeNull();
  });

  it('con dinero no se borra nada, y se dice cuánto', async () => {
    const r = await o('mike', `/clientes/${B.cliente}/borrar`, { method: 'POST', json: {} });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('tiene_dinero');
    expect(r.detalle.movimientos).toBe(1);
    expect((await o('mike', `/clientes/${B.cliente}`)).estado).toBe(200);
    expect((await o('mike', `/proyectos/${B.proyecto}`)).estado).toBe(200);
  });

  it('con historia (un avance de obra) tampoco, y dice qué ítem la trae', async () => {
    const r = await o('mike', `/clientes/${C.cliente}/borrar`, { method: 'POST', json: {} });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('tiene_historia');
    expect(r.detalle.items[0].nombre).toBe('Clóset');
    expect(r.detalle.items[0].porque.join(' ')).toMatch(/avance/);
    expect((await o('mike', `/items/${C.item}`)).estado).toBe(200);
  });

  it('un cliente que no existe: 404', async () => {
    expect((await o('mike', '/clientes/no-existe/borrar', { method: 'POST', json: {} })).estado).toBe(404);
  });
});

describe('0.51.0 · borrar un proyecto con todo lo suyo', () => {
  it('se va con sus ítems; el cliente se queda', async () => {
    const cliente = await crea('/clientes', { negocio_id: negocio, nombre: 'Se queda' });
    const proyecto = await crea('/proyectos', { negocio_id: negocio, cliente_id: cliente, nombre: 'Se va' });
    const item = await crea('/items', { negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto, nombre: 'Mesa', monto: 100, estado: 'vendido' });
    const r = await o('mike', `/proyectos/${proyecto}/borrar`, { method: 'POST', json: {} });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ proyectos: 1, items: 1, cotizaciones: 0 });
    expect((await o('mike', `/proyectos/${proyecto}`)).estado).toBe(404);
    expect((await o('mike', `/items/${item}`)).estado).toBe(404);
    expect((await o('mike', `/clientes/${cliente}`)).estado, 'el cliente no se toca').toBe(200);
  });
});

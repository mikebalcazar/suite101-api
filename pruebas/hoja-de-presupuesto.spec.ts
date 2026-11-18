/* La hoja del presupuesto · contrato 0.106.0
 *
 * Mike, 18-nov-2026, con botones: «Hoja dentro de dash»: el presupuesto del
 * proyecto se edita en una cuadrícula como Sheets y el total es el precio del
 * proyecto; las plantillas viven en dash. Y el mismo día: «Sólo existirán los
 * conceptos que se importen desde quote (…) y los que se agreguen
 * manualmente en la tabla de dash».
 *
 * LO QUE DE VERDAD MIDEN:
 *
 *   · que guardar la hoja deje EXACTAMENTE lo que trae, en su orden: los que
 *     vienen con id se quedan (los importados con su folio), los nuevos
 *     nacen, y los que no vienen se quitan;
 *   · que sea TODO O NADA: un renglón malo regresa su número y la hoja no se
 *     guarda a medias;
 *   · que el precio del proyecto sea la suma de lo que quedó;
 *   · que una plantilla guarde sus renglones en centavos y no acepte lo que
 *     no cuadra.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'hoja-de-presupuesto';
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

const hoja = (proyecto_id: string, renglones: unknown, app?: string) =>
  o('mike', `/proyectos/${proyecto_id}/conceptos`, { method: 'PUT', json: { renglones }, app });

let cliente = '', casa = '', oficina = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Hoja de presupuesto', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  cliente = await crea('/clientes', { nombre: 'Familia Soto' });
  casa = await crea('/proyectos', { cliente_id: cliente, nombre: 'Casa Soto' });
  oficina = await crea('/proyectos', { cliente_id: cliente, nombre: 'Oficina Soto' });
});

describe('la hoja del presupuesto', () => {
  let ids: string[] = [];

  it('una hoja nueva: nacen sus renglones, en su orden, y el precio es la suma', async () => {
    const r = await hoja(casa, [
      { descripcion: '  Cocina integral ', cantidad: 1, precio_unitario: 180_000_00 },
      { descripcion: 'Puertas', cantidad: 6, precio_unitario: 7_500_00 },
      { descripcion: 'Cubierta (m²)', cantidad: 3.5, precio_unitario: 9_000_00 },
    ]);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ creados: 3, cambiados: 0, quitados: 0 });
    expect(r.data.conceptos.map((c: any) => [c.descripcion, c.cantidad, c.monto, c.orden])).toEqual([
      ['Cocina integral', 1, 180_000_00, 1], ['Puertas', 6, 45_000_00, 2], ['Cubierta (m²)', 3.5, 31_500_00, 3],
    ]);
    expect(r.data.proyecto.precio_venta).toBe(256_500_00);
    expect(r.data.proyecto.n_conceptos).toBe(3);
    ids = r.data.conceptos.map((c: any) => c.id);
  });

  it('se cambia uno, se quita otro, se agrega uno y se reordena: queda lo que trae', async () => {
    const r = await hoja(casa, [
      { id: ids[2], descripcion: 'Cubierta de cuarzo (m²)', cantidad: 4, precio_unitario: 9_000_00 },
      { descripcion: 'Instalación', cantidad: 1, precio_unitario: 12_000_00 },
      { id: ids[0], descripcion: 'Cocina integral', cantidad: 1, precio_unitario: 180_000_00 },
    ]);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ creados: 1, cambiados: 2, quitados: 1 });
    expect(r.data.conceptos.map((c: any) => [c.descripcion, c.orden])).toEqual([
      ['Cubierta de cuarzo (m²)', 1], ['Instalación', 2], ['Cocina integral', 3],
    ]);
    expect(r.data.conceptos[0].id, 'el que se queda conserva su id').toBe(ids[2]);
    expect((await o('mike', `/conceptos/${ids[1]}`)).estado, 'las puertas se quitaron').toBe(404);
    expect((await proyecto(casa)).precio_venta).toBe(36_000_00 + 12_000_00 + 180_000_00);
  });

  it('un importado de quote101 que se queda conserva su folio y su grupo; si no viene, se quita', async () => {
    const cot = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: { nombre: 'Planta baja', proyecto_id: oficina, versiones: [],
      renglones: [{ linea: 1, nombre: 'Escritorios', cantidad: 4, precio_unitario: 15_000_00 }, { linea: 2, nombre: 'Archiveros', cantidad: 2, precio_unitario: 6_000_00 }] } }, 'cotizador101');
    const imp = await o('mike', `/proyectos/${oficina}/conceptos/importar`, { method: 'POST', json: { cotizacion_id: cot } });
    expect(imp.estado, JSON.stringify(imp)).toBe(201);
    const [esc, arch] = imp.data.conceptos;
    const r = await hoja(oficina, [
      { id: esc.id, descripcion: 'Escritorios de nogal', cantidad: 5, precio_unitario: 15_000_00 },
      { descripcion: 'Flete', cantidad: 1, precio_unitario: 3_000_00 },
    ]);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.conceptos[0]).toMatchObject({ id: esc.id, descripcion: 'Escritorios de nogal', monto: 75_000_00, cotizacion_id: cot, cotizacion_folio: esc.cotizacion_folio, linea: 1 });
    expect(r.data.conceptos[1]).toMatchObject({ descripcion: 'Flete', cotizacion_id: null, creado_en_app: 'dash101' });
    expect((await o('mike', `/conceptos/${arch.id}`)).estado, 'los archiveros no venían: se quitaron').toBe(404);
    const e = (await o('mike', `/proyectos/${oficina}/estado`)).data;
    expect(e.grupos.map((g: any) => [g.nombre, g.importe])).toEqual([['Planta baja', 75_000_00], ['Otros conceptos', 3_000_00]]);
  });

  it('todo o nada: un renglón malo dice cuál es y la hoja no se toca', async () => {
    const antes = (await proyecto(casa)).precio_venta;
    const conMalo = (malo: Record<string, unknown>) => hoja(casa, [{ descripcion: 'Bueno', cantidad: 1, precio_unitario: 100 }, malo]);
    for (const [malo, campo] of [
      [{ descripcion: '', cantidad: 1, precio_unitario: 100 }, 'descripcion'],
      [{ descripcion: 'Cero', cantidad: 0, precio_unitario: 100 }, 'cantidad'],
      [{ descripcion: 'Texto', cantidad: '2', precio_unitario: 100 }, 'cantidad'],
      [{ descripcion: 'Centavos rotos', cantidad: 1, precio_unitario: 10.5 }, 'precio_unitario'],
      [{ descripcion: 'Sin precio', cantidad: 1 }, 'precio_unitario'],
    ] as Array<[Record<string, unknown>, string]>) {
      const r = await conMalo(malo);
      expect(r.estado, JSON.stringify(malo)).toBe(400);
      expect(r.detalle).toMatchObject({ renglon: 2, campo });
    }
    expect((await hoja(casa, 'no es lista')).estado).toBe(400);
    expect((await hoja(casa, Array.from({ length: 501 }, () => ({ descripcion: 'x', cantidad: 1, precio_unitario: 1 })))).estado, 'a lo más 500').toBe(400);
    expect((await proyecto(casa)).precio_venta, 'nada se guardó').toBe(antes);
  });

  it('un id de otro proyecto, o repetido: no', async () => {
    const deLaCasa = (await o('mike', `/conceptos?proyecto_id=${casa}`)).data;
    const uno = (Array.isArray(deLaCasa) ? deLaCasa : deLaCasa.filas)[0];
    const ajeno = await hoja(oficina, [{ id: uno.id, descripcion: 'Robado', cantidad: 1, precio_unitario: 100 }]);
    expect(ajeno.estado).toBe(409);
    expect(ajeno.error).toBe('otro_proyecto');
    const doble = await hoja(casa, [
      { id: uno.id, descripcion: 'Uno', cantidad: 1, precio_unitario: 100 },
      { id: uno.id, descripcion: 'Otra vez', cantidad: 1, precio_unitario: 100 },
    ]);
    expect(doble.estado).toBe(400);
    expect((await o('mike', `/conceptos/${uno.id}`)).data.proyecto_id, 'sigue en su casa').toBe(casa);
  });

  it('desde otra app, o de un proyecto que no existe: no', async () => {
    expect((await hoja(casa, [], 'cotizador101')).estado).toBe(403);
    expect((await hoja('no-existe', [])).estado).toBe(404);
  });

  it('una hoja vacía quita todo y el precio vuelve a estar por cargar', async () => {
    const r = await hoja(casa, []);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.quitados).toBe(3);
    expect(r.data.proyecto).toMatchObject({ precio_venta: 0, n_conceptos: 0 });
  });
});

describe('las plantillas de presupuesto', () => {
  let id = '';
  const renglones = [
    { descripcion: 'Cocina integral', cantidad: 1, precio_unitario: 180_000_00 },
    { descripcion: 'Cubierta (m²)', cantidad: 3.5, precio_unitario: 9_000_00 },
  ];

  it('se guarda una con sus renglones en centavos, y se lee igual', async () => {
    const r = await o('mike', '/plantillas_presupuesto', { method: 'POST', json: { nombre: 'Cocina estándar', renglones } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    id = r.data.id;
    expect(r.data).toMatchObject({ nombre: 'Cocina estándar', renglones, creado_en_app: 'dash101' });
    const lista = (await o('mike', '/plantillas_presupuesto')).data;
    const filas = Array.isArray(lista) ? lista : lista.filas;
    expect(filas.map((p: any) => p.nombre)).toContain('Cocina estándar');
  });

  it('se renombra y se le cambian los renglones', async () => {
    const r = await o('mike', `/plantillas_presupuesto/${id}`, { method: 'PATCH', json: { nombre: 'Cocina básica', renglones: renglones.slice(0, 1) } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ nombre: 'Cocina básica', renglones: renglones.slice(0, 1) });
  });

  it('lo que no cuadra no entra', async () => {
    const mal = async (json: Record<string, unknown>) => (await o('mike', '/plantillas_presupuesto', { method: 'POST', json })).estado;
    expect(await mal({ nombre: '', renglones }), 'sin nombre').toBe(400);
    expect(await mal({ nombre: 'Rota', renglones: [{ descripcion: 'x', cantidad: 1, precio_unitario: 1.5 }] }), 'centavos con decimales').toBe(400);
    expect(await mal({ nombre: 'Con id', renglones: [{ id: 'x', descripcion: 'x', cantidad: 1, precio_unitario: 1 }] }), 'una plantilla no lleva ids').toBe(400);
    expect(await mal({ nombre: 'No lista', renglones: 'cocina' })).toBe(400);
    expect((await o('mike', `/plantillas_presupuesto/${id}`, { method: 'PATCH', json: { renglones: [{ descripcion: '', cantidad: 1, precio_unitario: 1 }] } })).estado).toBe(400);
    expect((await o('mike', '/plantillas_presupuesto', { method: 'POST', app: 'cotizador101', json: { nombre: 'Desde quote', renglones } })).estado, 'son de dash101').toBe(403);
  });

  it('se borra', async () => {
    expect((await o('mike', `/plantillas_presupuesto/${id}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await o('mike', `/plantillas_presupuesto/${id}`)).estado).toBe(404);
  });
});

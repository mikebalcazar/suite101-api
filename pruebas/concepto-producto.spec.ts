/* El concepto lleva su producto aparte de la descripción · 0.108.0
 *
 * Mike, 18-nov-2026: «Necesito que la lista de conceptos tengan las mismas
 * columnas que las del PDF. Separar el producto de la descripción.»
 *
 * LO QUE DE VERDAD MIDEN:
 *
 *   · que la hoja guarde producto y descripción, y que con uno de los dos
 *     baste pero no con ninguno;
 *   · que importar de quote101 ponga el nombre del renglón en `producto` y
 *     la descripción del mueble en `descripcion`;
 *   · que lo que ya estaba escrito «producto — descripción» en una celda se
 *     parta en el primer « — », y lo importado tome la descripción de su
 *     cotización (la migración 0058);
 *   · que el CRUD y el estado de cuenta lo lleven.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/entorno';

const CORREO = 'mike@forespot.com';
const ORG = 'concepto-producto';
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

let cliente = '', casa = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Concepto y producto', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  cliente = await crea('/clientes', { nombre: 'HOLCIM' });
  casa = await crea('/proyectos', { cliente_id: cliente, nombre: 'Oficinas Santa Fe' });
});

const dentro = runInDurableObject as unknown as (s: unknown, f: (x: any) => any) => Promise<any>;
const objeto = () => (env as unknown as Env).ORG.get((env as unknown as Env).ORG.idFromName(ORG)) as unknown as DurableObjectStub;

describe('la hoja', () => {
  it('guarda producto y descripción, cada uno en su columna', async () => {
    const r = await hoja(casa, [
      { nombre: ' CAR-02 ', descripcion: 'Gradas con estructura PTR cal 14 y MDF 18 mm', cantidad: 1, precio_unitario: 161_250_00 },
      { nombre: 'Auditorio', descripcion: '', cantidad: 1, precio_unitario: 52_200_00 },
      { descripcion: 'Flete', cantidad: 1, precio_unitario: 5_000_00 },
    ]);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.conceptos.map((c: any) => [c.nombre, c.descripcion])).toEqual([
      ['CAR-02', 'Gradas con estructura PTR cal 14 y MDF 18 mm'], ['Auditorio', ''], ['', 'Flete'],
    ]);
    expect(r.data.proyecto.precio_venta).toBe(218_450_00);
  });
  it('un renglón que no manda nombre (un dash de antes) no lo borra', async () => {
    const antes = (await o('mike', `/conceptos?proyecto_id=${casa}`)).data;
    const filas = (antes.filas ?? antes) as any[];
    const r = await hoja(casa, filas.map((c: any) => ({ id: c.id, descripcion: c.descripcion || 'x', cantidad: c.cantidad, precio_unitario: c.precio_unitario })));
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.conceptos.map((c: any) => c.nombre)).toEqual(['CAR-02', 'Auditorio', '']);
  });
  it('sin producto ni descripción no dice qué se cobra', async () => {
    const r = await hoja(casa, [{ nombre: ' ', descripcion: '', cantidad: 1, precio_unitario: 100 }]);
    expect(r).toMatchObject({ estado: 400, error: 'datos_invalidos', detalle: { renglon: 1, campo: 'descripcion' } });
  });
  it('una plantilla también lleva el producto', async () => {
    const r = await o('mike', '/plantillas_presupuesto', { method: 'POST', json: { nombre: 'Gradas', renglones: [{ nombre: 'CAR-02', descripcion: 'Gradas', cantidad: 1, precio_unitario: 100 }] } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.renglones[0]).toMatchObject({ nombre: 'CAR-02', descripcion: 'Gradas' });
  });
});

describe('el CRUD', () => {
  it('con sólo el producto basta; sin los dos, no', async () => {
    const r = await o('mike', '/conceptos', { method: 'POST', json: { proyecto_id: casa, nombre: 'Lactancia', cantidad: 1, precio_unitario: 51_400_00 } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data).toMatchObject({ nombre: 'Lactancia', descripcion: '' });
    const mal = await o('mike', '/conceptos', { method: 'POST', json: { proyecto_id: casa, cantidad: 1, precio_unitario: 1 } });
    expect(mal).toMatchObject({ estado: 400, error: 'datos_invalidos' });
  });
  it('borrar la descripción de uno que tiene producto se vale; del que no tiene, no', async () => {
    const con = await crea('/conceptos', { proyecto_id: casa, nombre: 'Recepción', descripcion: 'No incluye LED', cantidad: 1, precio_unitario: 1 });
    expect((await o('mike', `/conceptos/${con}`, { method: 'PATCH', json: { descripcion: '' } })).estado).toBe(200);
    const sin = await crea('/conceptos', { proyecto_id: casa, descripcion: 'Flete', cantidad: 1, precio_unitario: 1 });
    expect((await o('mike', `/conceptos/${sin}`, { method: 'PATCH', json: { descripcion: '' } })).estado).toBe(400);
  });
});

describe('importar de quote101', () => {
  it('el nombre del renglón es el producto y la descripción del mueble su descripción', async () => {
    const p = await crea('/proyectos', { cliente_id: cliente, nombre: 'Importar con descripción' });
    const c = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: {
      nombre: 'Planta baja', proyecto_id: p,
      versiones: [{ muebles: [
        { nombre: 'Coffee Gradas', descripcion: 'Barra casual en melamina roble mérida', qty: 1 },
        { nombre: '', descripcion: 'Colocación de puerta individual', qty: 31 },
      ] }],
      renglones: [
        { linea: 1, nombre: 'Coffee Gradas', cantidad: 1, precio_unitario: 110_580_00 },
        { linea: 2, nombre: 'Colocación de puerta individual', cantidad: 31, precio_unitario: 2_850_00 },
      ],
    } }, 'cotizador101');
    const r = await o('mike', `/proyectos/${p}/conceptos/importar`, { method: 'POST', json: { cotizacion_id: c } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.conceptos.map((x: any) => [x.nombre, x.descripcion, x.cantidad])).toEqual([
      ['Coffee Gradas', 'Barra casual en melamina roble mérida', 1],
      ['', 'Colocación de puerta individual', 31],
    ]);
  });
});

describe('lo que ya estaba escrito (0058)', () => {
  let escrito = '', importado = '', sinGuion = '';

  beforeAll(async () => {
    const p = await crea('/proyectos', { cliente_id: cliente, nombre: 'Datos de antes' });
    const c = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: {
      nombre: 'Corrida', proyecto_id: p,
      versiones: [{ muebles: [{ nombre: 'Forro de puerta', descripcion: 'Reforzado de tambor con laminado blanco frosty', qty: 2.5 }] }],
      renglones: [{ linea: 1, nombre: 'Forro de puerta', cantidad: 2.5, precio_unitario: 4_500_00 }],
    } }, 'cotizador101');
    const imp = await o('mike', `/proyectos/${p}/conceptos/importar`, { method: 'POST', json: { cotizacion_id: c } });
    importado = imp.data.conceptos[0].id;
    escrito = await crea('/conceptos', { proyecto_id: p, descripcion: 'x', cantidad: 1, precio_unitario: 1 });
    sinGuion = await crea('/conceptos', { proyecto_id: p, descripcion: 'Flete a Santa Fe', cantidad: 1, precio_unitario: 1 });
    // Como estaban antes de 0.108.0: todo en `descripcion`, sin producto.
    await dentro(objeto(), (x: any) => {
      x.sql.exec(`UPDATE conceptos SET nombre = '', descripcion = 'CAR-02 — Gradas con estructura PTR — y MDF' WHERE id = ?`, escrito);
      x.sql.exec(`UPDATE conceptos SET nombre = '', descripcion = 'Forro de puerta' WHERE id = ?`, importado);
      x.conceptoProducto();
    });
  });

  it('«producto — descripción» se parte en el primer guion largo', async () => {
    expect((await o('mike', `/conceptos/${escrito}`)).data).toMatchObject({ nombre: 'CAR-02', descripcion: 'Gradas con estructura PTR — y MDF' });
  });
  it('lo importado toma la descripción de su renglón en la cotización', async () => {
    expect((await o('mike', `/conceptos/${importado}`)).data).toMatchObject({ nombre: 'Forro de puerta', descripcion: 'Reforzado de tambor con laminado blanco frosty' });
  });
  it('lo que no trae guion se queda como estaba', async () => {
    expect((await o('mike', `/conceptos/${sinGuion}`)).data).toMatchObject({ nombre: '', descripcion: 'Flete a Santa Fe' });
  });
  it('correrla otra vez no cambia nada', async () => {
    await dentro(objeto(), (x: any) => { x.conceptoProducto(); });
    expect((await o('mike', `/conceptos/${escrito}`)).data).toMatchObject({ nombre: 'CAR-02', descripcion: 'Gradas con estructura PTR — y MDF' });
  });
});

describe('el estado de cuenta', () => {
  it('cada concepto trae su producto y su descripción', async () => {
    const e = (await o('mike', `/proyectos/${casa}/estado`)).data;
    const co = e.grupos.flatMap((g: any) => g.conceptos).find((x: any) => x.nombre === 'CAR-02');
    expect(co).toMatchObject({ nombre: 'CAR-02', descripcion: 'Gradas con estructura PTR cal 14 y MDF 18 mm' });
    const it = e.items.find((x: any) => x.nombre === 'CAR-02');
    expect(it).toMatchObject({ nombre: 'CAR-02', descripcion: 'Gradas con estructura PTR cal 14 y MDF 18 mm' });
  });
});

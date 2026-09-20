/* El tope de las listas · contrato 0.24.2
 *
 * Mike, 20-sep, con la pantalla de HOLCIM enfrente: «ya no aparecen los ítems
 * pero el total de venta del proyecto se quedó con todos los ítems sumando».
 *
 * No se había perdido nada. El precio de venta lo suma la API en la base
 * —`SELECT SUM(monto) … WHERE estado = 'vendido'`—, así que esa cifra estaba
 * bien. La que mentía era la LISTA: toda lista viene topada en 500 filas
 * ordenadas de la más vieja a la más nueva, y en un proyecto al que se le
 * editaron los ítems muchas veces, los cancelados son justo los más viejos:
 * llenan las 500 y empujan a los vivos fuera de la respuesta. La pantalla
 * pedía los ítems del proyecto SIN filtrar el estado, y veía cero.
 *
 * Lo que de verdad aportan estas pruebas:
 *
 *   · que `total` diga la verdad aunque las filas vengan cortadas. Es la
 *     única seña de que faltan, y sin ella un 200 con menos renglones se ve
 *     idéntico a un 200 completo;
 *   · que el precio de venta NO dependa del tope, porque se suma en la base;
 *   · que filtrando por estado los cancelados dejen de ocupar lugar;
 *   · que `?limite=` deje pedir el resto, y que no se pueda usar para pedir
 *     un millón de filas y tumbar el Durable Object.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/entorno';

const entorno = env as unknown as Env;

const CORREO = 'mike@forespot.com';
const ORG = 'tope-listas';
const galletas: Record<string, string> = {};

async function pedir(ruta: string, op: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (op.app !== '') cabeceras['X-App'] = op.app ?? 'dash101';
  if (galletas.mike) cabeceras.Cookie = galletas.mike;
  let body = op.body;
  if (op.json !== undefined) { body = JSON.stringify(op.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...op, body, headers: { ...cabeceras, ...(op.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas.mike = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ...cuerpo } as { estado: number; [k: string]: any };
}
const o = (ruta: string, op: Parameters<typeof pedir>[1] = {}) => pedir(`/orgs/${ORG}${ruta}`, op);

/** 505 cancelados y 3 vivos: la forma exacta del proyecto de Mike. */
const CANCELADOS = 505;
const VIVOS = [{ nombre: 'Cocina', monto: 250_000_00 }, { nombre: 'Clóset', monto: 120_000_00 }, { nombre: 'Barra', monto: 30_000_00 }];
const SUMA_VIVOS = VIVOS.reduce((s, v) => s + v.monto, 0);

let negocio = '', cliente = '', proyecto = '';

beforeAll(async () => {
  const c = await pedir('/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  expect(c.estado).toBe(200);
  const e = await pedir('/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado).toBe(200);

  const alta = await pedir('/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Tope de listas' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = (await o('/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cliente = (await o('/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'HOLCIM' } })).data.id;
  proyecto = (await o('/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Oficinas' } })).data.id;

  /* Los 505 cancelados se siembran DENTRO del Durable Object, no por HTTP:
   * 505 altas más 505 cancelaciones por la ruta son mil viajes y la prueba
   * se pasa del reloj sin medir nada distinto. Se usan los mismos métodos
   * `crear` y `actualizar` que usa la ruta, así que el caché del proyecto se
   * recalcula igual. Los vivos sí van por HTTP, que es el camino de verdad.
   *
   * `runInDurableObject` arrastra los genéricos de toda la clase y TypeScript
   * se rinde con TS2589; se llama por un alias plano, como en api.spec.ts. */
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName(ORG)) as unknown as DurableObjectStub;

  // Primero los cancelados —son los más viejos, como en la vida real—, y
  // hasta el final los que siguen vivos.
  await dentro(elDO(), (db: any) => {
    for (let i = 0; i < CANCELADOS; i++) {
      const it = db.crear('items', { negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto, nombre: `Intento ${i}`, monto: 1_000_00, estado: 'vendido' }, { app: 'dash101', usuario_id: 'siembra' });
      db.actualizar('items', it.id, { estado: 'cancelado' });
    }
    return true;
  });
  for (const v of VIVOS) {
    const it = await o('/items', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto, nombre: v.nombre, monto: v.monto, estado: 'vendido' } });
    expect(it.estado, JSON.stringify(it)).toBe(201);
  }
}, 120_000);

describe('el tope de 500 no puede esconder lo que existe', () => {
  it('lo que reportó Mike: sin filtrar, los vivos no salen —pero `total` sí los cuenta', async () => {
    const r = await o(`/items?proyecto_id=${proyecto}`);
    expect(r.estado).toBe(200);
    expect(r.data.filas.length, 'la respuesta viene topada').toBe(500);
    expect(r.data.total, '«total» dice cuántos hay de verdad: es la única seña').toBe(CANCELADOS + VIVOS.length);
    expect(
      r.data.filas.filter((f: any) => f.estado === 'vendido').length,
      'y en esas 500 primeras no hay un solo vivo: eso es lo que veía la pantalla',
    ).toBe(0);
  });

  it('el precio de venta del proyecto NO depende del tope: se suma en la base', async () => {
    const p = await o(`/proyectos/${proyecto}`);
    expect(p.estado).toBe(200);
    expect(p.data.precio_venta, 'la cifra que Mike vio era la correcta').toBe(SUMA_VIVOS);
  });

  it('filtrando por estado, los cancelados dejan de ocupar lugar', async () => {
    const r = await o(`/items?proyecto_id=${proyecto}&estado=vendido`);
    expect(r.estado).toBe(200);
    expect(r.data.total).toBe(VIVOS.length);
    expect(r.data.filas.map((f: any) => f.nombre).sort()).toEqual(VIVOS.map((v) => v.nombre).sort());
    expect(r.data.filas.reduce((s: number, f: any) => s + f.monto, 0)).toBe(SUMA_VIVOS);
  });

  it('con ?limite= se puede pedir el resto, y entonces sí vienen todos', async () => {
    const r = await o(`/items?proyecto_id=${proyecto}&limite=1000`);
    expect(r.estado).toBe(200);
    expect(r.data.filas.length).toBe(CANCELADOS + VIVOS.length);
    expect(r.data.filas.filter((f: any) => f.estado === 'vendido').length).toBe(VIVOS.length);
  });

  it('el límite tiene techo: no se puede pedir un millón de filas', async () => {
    const r = await o(`/items?proyecto_id=${proyecto}&limite=1000000`);
    expect(r.estado, 'no es un error: se recorta en TOPE_MAXIMO').toBe(200);
    expect(r.data.filas.length).toBe(CANCELADOS + VIVOS.length);
    expect(r.data.total).toBe(CANCELADOS + VIVOS.length);
  });

  it('un límite absurdo se ignora y se queda el de siempre', async () => {
    for (const malo of ['0', '-5', 'muchas', '2.5']) {
      const r = await o(`/items?proyecto_id=${proyecto}&limite=${malo}`);
      expect(r.estado, `limite=${malo}`).toBe(200);
      expect(r.data.filas.length, `limite=${malo} se queda en las 500 de siempre`).toBe(500);
    }
  });

  it('«limite» no se cuela como filtro de columna', async () => {
    /* `filtros` se arma con TODO lo que venga en la URL. Si `limite` llegara
     * a la base como un filtro más, una tabla que algún día tenga una columna
     * con ese nombre devolvería cosas distintas según el tope pedido. */
    const con = await o(`/items?proyecto_id=${proyecto}&estado=vendido&limite=10`);
    const sin = await o(`/items?proyecto_id=${proyecto}&estado=vendido`);
    expect(con.data.total).toBe(sin.data.total);
  });
});

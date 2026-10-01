/* El saldo de cada cuenta lo suma la base (0.60.0).
 *
 * Mike, 1-oct-2026: «No se ha actualizado el capital líquido (ni los otros
 * creo) ya hay movimientos por más de 70,000 de egresos y el total sigue sin
 * contarlos». dash101 sumaba el saldo de la lista de movimientos, que tiene
 * tope de 500 y salía de la más vieja a la más nueva: pasando de 500, los
 * últimos egresos no entraban a la suma y el capital se quedaba quieto.
 *
 * Lo que se mide: cada fila de `cuentas` trae `saldo` (inicial + ingresos −
 * egresos, de TODOS sus movimientos, sumado en SQL), tanto en la lista como
 * en el detalle; la suma no depende de cuántos movimientos se enseñen; la
 * lista de movimientos sale de la más reciente a la más vieja (por día y,
 * dentro del día, por captura); y un gasto general es un egreso sin proyecto
 * con su categoría, que baja el saldo igual que cualquier egreso.
 */
import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIA_GASTO_GENERAL } from '../schema/tipos';

const CORREO = 'mike@forespot.com';
const ORG = 'saldo-de-cuenta';
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
  expect(c.estado, JSON.stringify(c)).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

let negocio = '';
let cuenta = '';
let otraCuenta = '';
const ids: string[] = [];

const mover = async (json: Record<string, unknown>) => {
  const r = await o('mike', '/movimientos', { method: 'POST', json: { negocio_id: negocio, cuenta_id: cuenta, contraparte_tipo: 'otro', ...json } });
  expect(r.estado, JSON.stringify(r)).toBe(201);
  ids.push(r.data.id);
  return r.data;
};

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Saldo de prueba', apps: { dash: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  const n = await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller', moneda: 'MXN' } });
  expect(n.estado, JSON.stringify(n)).toBe(201);
  negocio = n.data.id;
  const cta = await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldo_inicial: 1_000_000_00 } });
  expect(cta.estado, JSON.stringify(cta)).toBe(201);
  cuenta = cta.data.id;
  const otra = await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Caja', tipo: 'caja', moneda: 'MXN', saldo_inicial: 5_000_00 } });
  otraCuenta = otra.data.id;

  /* Tres en orden de captura: uno de septiembre, y dos de hoy. */
  await mover({ tipo: 'ingreso', monto: 250_000_00, fecha: '2026-09-01', descripcion: 'Anticipo' });
  await mover({ tipo: 'egreso', monto: 400_000_00, fecha: '2026-10-01', descripcion: 'Madera' });
  await mover({ tipo: 'egreso', monto: 100_000_00, fecha: '2026-10-01', descripcion: 'Herrajes' });
});

describe('el saldo de la cuenta viene sumado de la base', () => {
  it('en la lista: inicial + ingresos − egresos, en centavos', async () => {
    const r = await o('mike', `/cuentas?negocio_id=${negocio}`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const banco = r.data.filas.find((c: any) => c.id === cuenta);
    expect(banco.saldo_inicial).toBe(1_000_000_00);
    expect(banco.saldo, 'sin saldo la pantalla lo suma de una lista con tope').toBe(1_000_000_00 + 250_000_00 - 400_000_00 - 100_000_00);
    /* La otra cuenta no tiene movimientos: su saldo es el inicial. */
    const caja = r.data.filas.find((c: any) => c.id === otraCuenta);
    expect(caja.saldo).toBe(5_000_00);
  });

  it('y en el detalle, el mismo número', async () => {
    const r = await o('mike', `/cuentas/${cuenta}`);
    expect(r.estado).toBe(200);
    expect(r.data.saldo).toBe(750_000_00);
  });

  it('no depende de cuántos movimientos se enseñen', async () => {
    /* Con tope de uno, la lista trae un movimiento y dice que hay tres; el
     * saldo de la cuenta sigue siendo el de los tres. Es exactamente lo que
     * pasaba en producción con 500. */
    const lista = await o('mike', `/movimientos?negocio_id=${negocio}&limite=1`);
    expect(lista.data.filas.length).toBe(1);
    expect(lista.data.total).toBe(3);
    expect((await o('mike', `/cuentas/${cuenta}`)).data.saldo).toBe(750_000_00);
  });

  it('el saldo no se escribe desde fuera: es calculado', async () => {
    const r = await o('mike', `/cuentas/${cuenta}`, { method: 'PATCH', json: { saldo: 1 } });
    /* Que conteste lo que conteste, el saldo sigue siendo la suma. */
    expect([200, 400]).toContain(r.estado);
    expect((await o('mike', `/cuentas/${cuenta}`)).data.saldo).toBe(750_000_00);
  });
});

describe('la lista de movimientos sale de la más reciente a la más vieja', () => {
  it('por día, y dentro del día por el momento de captura', async () => {
    const r = await o('mike', `/movimientos?negocio_id=${negocio}`);
    expect(r.estado).toBe(200);
    const orden = r.data.filas.map((m: any) => m.id);
    /* ids[2] (Herrajes) se capturó al último, el mismo día que ids[1]. */
    expect(orden, 'hasta arriba el último capturado').toEqual([ids[2], ids[1], ids[0]]);
  });

  it('por eso, con tope, lo que se queda es lo más viejo, no lo de hoy', async () => {
    const r = await o('mike', `/movimientos?negocio_id=${negocio}&limite=2`);
    expect(r.data.filas.map((m: any) => m.descripcion)).toEqual(['Herrajes', 'Madera']);
  });
});

describe('gastos generales: un egreso que no es de ningún proyecto', () => {
  it('se guarda sin proyecto con su categoría, y baja el saldo', async () => {
    const r = await mover({ tipo: 'egreso', monto: 12_000_00, fecha: '2026-10-01', categoria: CATEGORIA_GASTO_GENERAL, descripcion: 'Renta de octubre' });
    expect(r.proyecto_id).toBeNull();
    expect(r.categoria).toBe('gasto_general');
    expect((await o('mike', `/cuentas/${cuenta}`)).data.saldo).toBe(750_000_00 - 12_000_00);
    /* Y sale hasta arriba: es el último de hoy. */
    const lista = await o('mike', `/movimientos?negocio_id=${negocio}`);
    expect(lista.data.filas[0].descripcion).toBe('Renta de octubre');
  });
});

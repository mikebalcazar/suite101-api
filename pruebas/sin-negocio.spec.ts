/* La empresa es una: `negocio_id` ya no se pide (0.61.0).
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios en dash. Sólo es una
 * empresa/negocio todo. Elimina todas las lógicas que involucran el concepto
 * de "negocio"».
 *
 * Lo que se mide: una empresa recién nacida, sin negocio, da de alta cuentas,
 * clientes, proyectos, movimientos, opex y accionistas SIN mandar negocio_id,
 * y todo queda colgado del mismo registro, que la API crea con el nombre de
 * la empresa; la conciliación, su estadística y la nómina tampoco lo piden.
 * Sobre el código viejo, cada alta contesta 400 datos_invalidos.
 */
import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'sin-negocio';
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

let cuenta = '';
let cliente = '';
let negocio = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Carpintería Sin Negocio', apps: { dash: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
});

describe('una empresa nueva captura sin decir negocio', () => {
  it('la cuenta nace sin negocio_id, y la API le pone el de la empresa, bautizado con su nombre', async () => {
    expect((await o('mike', '/negocios')).data.filas.length, 'la empresa nace sin ninguno').toBe(0);
    const r = await o('mike', '/cuentas', { method: 'POST', json: { nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldo_inicial: 100_000_00 } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.negocio_id, 'colgada de un negocio que la API resolvió').toBeTruthy();
    cuenta = r.data.id; negocio = r.data.negocio_id;
    const negocios = (await o('mike', '/negocios')).data.filas;
    expect(negocios.length).toBe(1);
    expect(negocios[0].id).toBe(negocio);
    expect(negocios[0].nombre).toBe('Carpintería Sin Negocio');
  });

  it('cliente, proyecto, movimiento, opex y accionista: todos del mismo, sin mandarlo', async () => {
    const c = await o('mike', '/clientes', { method: 'POST', json: { nombre: 'HOLCIM' } });
    expect(c.estado, JSON.stringify(c)).toBe(201); expect(c.data.negocio_id).toBe(negocio);
    cliente = c.data.id;
    const p = await o('mike', '/proyectos', { method: 'POST', json: { cliente_id: cliente, nombre: 'Planta' } });
    expect(p.estado, JSON.stringify(p)).toBe(201); expect(p.data.negocio_id).toBe(negocio);
    const m = await o('mike', '/movimientos', { method: 'POST', json: { tipo: 'egreso', monto: 7_000_00, fecha: '2026-10-01', cuenta_id: cuenta, contraparte_tipo: 'otro', categoria: 'gasto_general', descripcion: 'Renta' } });
    expect(m.estado, JSON.stringify(m)).toBe(201); expect(m.data.negocio_id).toBe(negocio);
    const x = await o('mike', '/opex', { method: 'POST', json: { nombre: 'Luz', monto: 1_500_00, frecuencia: 'mensual', fecha_inicio: '2026-10-01' } });
    expect(x.estado, JSON.stringify(x)).toBe(201); expect(x.data.negocio_id).toBe(negocio);
    const a = await o('mike', '/accionistas', { method: 'POST', json: { nombre: 'Mike Balcázar', porcentaje: 100 } });
    expect(a.estado, JSON.stringify(a)).toBe(201); expect(a.data.negocio_id).toBe(negocio);
    /* Y el saldo de la cuenta lo sumó igual: el egreso quedó colgado de ella. */
    expect((await o('mike', `/cuentas/${cuenta}`)).data.saldo).toBe(100_000_00 - 7_000_00);
  });

  it('si una app lo manda, se respeta (hasta que se vaya)', async () => {
    const r = await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Caja', tipo: 'caja', moneda: 'MXN', saldo_inicial: 0 } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.negocio_id).toBe(negocio);
  });
});

describe('las rutas que lo exigían ya no lo exigen', () => {
  it('la conciliación se hace sin negocio_id', async () => {
    const r = await o('mike', '/conciliaciones', { method: 'POST', json: { saldos: (await o('mike', '/cuentas')).data.filas.map((c: any) => ({ cuenta_id: c.id, saldo_real: c.saldo })) } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.conciliacion.negocio_id).toBe(negocio);
    expect(r.data.diferencia_total).toBe(0);
  });

  it('y su estadística', async () => {
    const r = await o('mike', '/conciliaciones/estadistica');
    expect(r.estado, JSON.stringify(r)).toBe(200);
  });

  it('la nómina: los cortes se leen y se abren sin negocio_id', async () => {
    const lista = await o('mike', '/nomina/rayas');
    expect(lista.estado, JSON.stringify(lista)).toBe(200);
    expect(lista.data.rayas).toEqual([]);
    const corte = await o('mike', '/nomina/rayas', { method: 'POST', json: { periodo_inicio: '2026-09-28', periodo_fin: '2026-10-04', pagos: [] } });
    expect(corte.estado, JSON.stringify(corte)).toBe(201);
    expect(corte.data.raya.negocio_id).toBe(negocio);
  });
});

describe('la empresa tiene su ruta (0.62.0)', () => {
  it('GET /empresa trae nombre, rfc, moneda y día; es el mismo registro', async () => {
    const r = await o('mike', '/empresa');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.id).toBe(negocio);
    expect(r.data.nombre).toBe('Carpintería Sin Negocio');
    expect(Object.keys(r.data).sort()).toEqual(['dia_conciliacion', 'id', 'moneda', 'nombre', 'rfc']);
  });

  it('PATCH /empresa cambia rfc, moneda y día, y lo que no se manda se queda', async () => {
    const r = await o('mike', '/empresa', { method: 'PATCH', json: { rfc: 'csn010101aaa', dia_conciliacion: 5 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.rfc).toBe('CSN010101AAA');
    expect(r.data.dia_conciliacion).toBe(5);
    expect(r.data.nombre).toBe('Carpintería Sin Negocio');
    /* Y es el mismo registro que ven las lecturas por dentro. */
    expect((await o('mike', '/negocios')).data.filas[0].rfc).toBe('CSN010101AAA');
  });

  it('una moneda inventada o un día fuera de 0-6 se rechazan', async () => {
    expect((await o('mike', '/empresa', { method: 'PATCH', json: { moneda: 'EUR' } })).estado).toBe(400);
    expect((await o('mike', '/empresa', { method: 'PATCH', json: { dia_conciliacion: 9 } })).estado).toBe(400);
    expect((await o('mike', '/empresa', { method: 'PATCH', json: { nombre: '  ' } })).estado).toBe(400);
  });
});

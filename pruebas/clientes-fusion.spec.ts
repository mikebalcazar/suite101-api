/* El cliente es uno solo en las tres apps · contrato 0.23.0
 *
 * Mike, 20-sep: «cuando creas un nuevo cliente en quote101, es lo mismo que
 * cuando haces uno en quell101 o en dash. El cliente es el mismo en los 3 […]
 * Si por cualquier cosa se crean en 2 apps diferentes con un nombre
 * diferente, debería haber manera de ligarlo y fusionar los 2 clientes en uno
 * mismo para mejor control. Y si se quiere crear un cliente con el nombre ya
 * existente, preguntar si no te estás refiriendo a X cliente.»
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que fusionar NO pierda nada. El cliente que se va casi siempre es el
 *     que se capturó en la otra app, y a veces es el único que trae el correo
 *     o el acceso al portal. Perderlo se descubre el día que el cliente no
 *     puede entrar a ver su estado de cuenta;
 *   · que se lleve TODA su historia: proyectos, ítems, cotizaciones y los
 *     movimientos donde era la contraparte. Un pago que se quede apuntando a
 *     un renglón borrado es dinero sin dueño en el estado de cuenta;
 *   · que la regla del parecido sea una sola y viva aquí. Tres apps con tres
 *     ideas de qué se parece a qué son tres reglas, y falla la que nadie
 *     probó.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'un-solo-cliente';
const GENTE = { tin: { correo: 'tin-cli@ejemplo.mx', nombre: 'Tin Taller', rol: 'staff' } };

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
  expect(c.estado, `código para ${correo}: ${JSON.stringify(c)}`).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}

let negocio = '', cuenta = '', enDash = '', enQuote = '', proyecto = '', item = '', cotizacion = '', movimiento = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Un solo cliente', apps: { dash: true, cotizador: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: GENTE.tin.correo, rol: GENTE.tin.rol, nombre: GENTE.tin.nombre, apps: ['dash'] }, app: '' });
  expect(m.estado, JSON.stringify(m)).toBe(201);
  await entrar('tin', GENTE.tin.correo);

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cuenta = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco' } })).data.id;

  /* El mismo cliente, capturado dos veces: una en dash101 con el nombre
   * completo y otra en quote101 con el nombre corto. Es justo lo que Mike
   * describió. */
  enDash = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Muebles Luna SA de CV', telefono: '5555555555' } })).data.id;
  enQuote = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Muebles Luna', correo: 'compras@luna.mx' }, app: 'cotizador101' })).data.id;

  // Y su historia, colgada del que se capturó en el cotizador.
  proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: enQuote, nombre: 'Cocina Luna' } })).data.id;
  item = (await o('mike', '/items', { method: 'POST', json: { negocio_id: negocio, cliente_id: enQuote, proyecto_id: proyecto, nombre: 'Cocina', monto: 100_00, estado: 'vendido' } })).data.id;
  cotizacion = (await o('mike', '/cotizaciones', { method: 'POST', json: { negocio_id: negocio, cliente_id: enQuote, titulo: 'Cotización Luna' }, app: 'cotizador101' })).data.id;
  movimiento = (await o('mike', '/movimientos', { method: 'POST', json: {
    negocio_id: negocio, tipo: 'ingreso', monto: 50_00, fecha: '2026-09-01', cuenta_id: cuenta,
    proyecto_id: proyecto, contraparte_tipo: 'cliente', contraparte_id: enQuote, contraparte_nombre: 'Muebles Luna',
  } })).data.id;
}, 60000);

describe('¿no te refieres a X?', () => {
  it('el nombre corto encuentra al largo, y al revés', async () => {
    const r = await o('mike', `/clientes/parecidos?nombre=${encodeURIComponent('Muebles Luna')}`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.parecidos.map((c: any) => c.id).sort()).toEqual([enDash, enQuote].sort());

    const largo = await o('mike', `/clientes/parecidos?nombre=${encodeURIComponent('MUEBLES LUNA SA DE CV')}`);
    expect(largo.data.parecidos.map((c: any) => c.id).sort()).toEqual([enDash, enQuote].sort());
  });

  it('los acentos, las mayúsculas y los espacios de más no estorban', async () => {
    /* Quien captura al mismo cliente dos veces casi nunca lo escribe igual:
     * le pone un acento de más, lo teclea en mayúsculas o le mete dos
     * espacios. Si el aviso no aguantara eso, no serviría para nada, que es
     * justo el caso que Mike quiere evitar. */
    const r = await o('mike', `/clientes/parecidos?nombre=${encodeURIComponent('  MÚEBLES   Luna ')}`);
    expect(r.data.parecidos.map((c: any) => c.id).sort()).toEqual([enDash, enQuote].sort());
  });

  it('otro nombre no se parece, y menos de tres letras no compara', async () => {
    expect((await o('mike', '/clientes/parecidos?nombre=Herreria%20Sol')).data.parecidos).toHaveLength(0);
    expect((await o('mike', '/clientes/parecidos?nombre=Lu')).data.parecidos).toHaveLength(0);
    expect((await o('mike', '/clientes/parecidos?nombre=')).data.parecidos).toHaveLength(0);
  });
});

describe('fusionar', () => {
  it('sólo el dueño y la administración: alguien de taller no fusiona', async () => {
    const r = await o('tin', `/clientes/${enDash}/fusionar`, { method: 'POST', json: { se_va_id: enQuote } });
    expect(r.estado).toBe(403);
    expect(r.error).toBe('sin_permiso');
  });

  it('lo que no existe, y fusionarse con uno mismo', async () => {
    expect((await o('mike', `/clientes/${enDash}/fusionar`, { method: 'POST', json: { se_va_id: enDash } })).estado).toBe(400);
    expect((await o('mike', `/clientes/${enDash}/fusionar`, { method: 'POST', json: {} })).detalle.falta).toBe('se_va_id');
    const noHay = await o('mike', `/clientes/${enDash}/fusionar`, { method: 'POST', json: { se_va_id: 'no-existe' } });
    expect(noHay.estado).toBe(404);
  });

  it('el que se va le deja TODA su historia al que se queda', async () => {
    const r = await o('mike', `/clientes/${enDash}/fusionar`, { method: 'POST', json: { se_va_id: enQuote } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.movidos).toEqual({ proyectos: 1, items: 1, cotizaciones: 1, movimientos: 1 });

    expect((await o('mike', `/proyectos/${proyecto}`)).data.cliente_id).toBe(enDash);
    expect((await o('mike', `/items/${item}`)).data.cliente_id).toBe(enDash);
    expect((await o('mike', `/cotizaciones/${cotizacion}`)).data.cliente_id).toBe(enDash);
    const mov = (await o('mike', `/movimientos/${movimiento}`)).data;
    expect(mov.contraparte_id).toBe(enDash);
    expect(mov.contraparte_nombre, 'y el nombre del movimiento se corrige').toBe('Muebles Luna SA de CV');
  });

  it('y le deja los datos que le faltaban, sin pisar los que ya tenía', async () => {
    const c = (await o('mike', `/clientes/${enDash}`)).data;
    expect(c.correo, 'el correo sólo estaba del otro lado').toBe('compras@luna.mx');
    expect(c.telefono, 'el teléfono ya lo tenía y no se pisa').toBe('5555555555');
    expect(c.nombre).toBe('Muebles Luna SA de CV');
  });

  it('el que se fue ya no está, y queda uno solo', async () => {
    expect((await o('mike', `/clientes/${enQuote}`)).estado).toBe(404);
    expect((await o('mike', '/clientes')).data.filas).toHaveLength(1);
  });
});

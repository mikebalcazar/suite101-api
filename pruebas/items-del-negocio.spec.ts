/* Los ítems de un proyecto de OTRO negocio · el defecto de HOLCIM
 *
 * Mike, 20-sep, tercera vuelta y con el arreglo del tope ya publicado: «los
 * volví a hacer a mano y ahora se suman a la proyección del margen, pero
 * tampoco aparecen en la lista de ítems del proyecto».
 *
 * Eso descarta el tope de 500 —los ítems eran tres, recién creados— y
 * señala otra cosa: la ruta de listas RELLENA sola el filtro de negocio
 * cuando quien pregunta es miembro con negocios asignados y no lo mandó:
 *
 *     if (quien.negocios.length && !filtros.negocio_id && …)
 *       filtros.negocio_id = quien.negocios[0];
 *
 * Es «un negocio a la vez» aplicado por omisión. Pero el detalle de un
 * proyecto se abre por id —`GET /proyectos/:id`, que no filtra por negocio—,
 * así que se puede estar viendo un proyecto del negocio B mientras la lista
 * de sus ítems se pide, sin decirlo, del negocio A. La respuesta es 200 con
 * cero filas: ni un error, ni una seña.
 *
 * Y explica el defecto entero, incluido el del principio: si al guardar la
 * lista de vivos vuelve vacía, TODOS los renglones de la pantalla parecen
 * nuevos y se crean otra vez. «Los duplica» y «no hay manera de borrar».
 *
 * El precio de venta nunca se equivocó porque lo suma el servidor con un
 * SUM sobre la tabla, sin pasar por este filtro.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const SOCIA = { correo: 'sol-negocios@ejemplo.mx', nombre: 'Sol Socia', rol: 'socio' };
const ORG = 'items-negocio';
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

let negA = '', negB = '', cliente = '', proyectoB = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Dos negocios' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negA = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  negB = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'IMA Patrimonial' } })).data.id;

  // La socia trabaja en los dos negocios, con Taller primero: es el caso de
  // Mike, que tiene más de un negocio en su empresa.
  const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, {
    method: 'POST', app: '',
    json: { correo: SOCIA.correo, rol: SOCIA.rol, nombre: SOCIA.nombre, apps: ['dash'], negocios: [negA, negB] },
  });
  expect(m.estado, JSON.stringify(m)).toBe(201);
  await entrar('sol', SOCIA.correo);

  // El proyecto y sus ítems viven en el SEGUNDO negocio.
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negB, nombre: 'HOLCIM' } })).data.id;
  proyectoB = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negB, cliente_id: cliente, nombre: 'Oficinas' } })).data.id;
  for (const [nombre, monto] of [['Recepción', 300_000_00], ['Salas', 250_000_00], ['Cocina', 173_605_00]] as const) {
    const it = await o('mike', '/items', { method: 'POST', json: { negocio_id: negB, cliente_id: cliente, proyecto_id: proyectoB, nombre, monto, estado: 'vendido' } });
    expect(it.estado, JSON.stringify(it)).toBe(201);
  }
}, 60_000);

describe('la lista de ítems de un proyecto de otro negocio', () => {
  it('el proyecto sí se abre: `GET /proyectos/:id` no filtra por negocio', async () => {
    const p = await o('sol', `/proyectos/${proyectoB}`);
    expect(p.estado).toBe(200);
    expect(p.data.nombre).toBe('Oficinas');
    expect(p.data.precio_venta, 'y el precio de venta es el correcto: lo suma el servidor').toBe(723_605_00);
  });

  it('pidiendo los ítems con `proyecto_id` y SIN negocio, vienen todos', async () => {
    /* Esto es lo que se arregla: antes la ruta rellenaba `negocio_id` con el
     * primer negocio de quien pregunta, y este proyecto es del segundo. La
     * respuesta era 200 con cero filas: la pantalla decía «Sin ítems» y el
     * precio de venta seguía en su cifra. */
    const r = await o('sol', `/items?proyecto_id=${proyectoB}&estado=vendido`);
    expect(r.estado).toBe(200);
    expect(r.data.total, 'son tres, no cero').toBe(3);
    expect(r.data.filas.map((f: any) => f.nombre).sort()).toEqual(['Cocina', 'Recepción', 'Salas']);
  });

  it('el proyecto manda sobre el negocio: pedirlo con el negocio equivocado no inventa filas', async () => {
    /* El relleno se quita, pero el filtro explícito se respeta: quien pide
     * los ítems del proyecto B diciendo «del negocio A» sigue sin ver nada,
     * porque eso es lo que pidió. */
    const r = await o('sol', `/items?proyecto_id=${proyectoB}&negocio_id=${negA}`);
    expect(r.estado).toBe(200);
    expect(r.data.total).toBe(0);
  });

  it('sin `proyecto_id`, el relleno por negocio sigue en pie', async () => {
    /* «Un negocio a la vez» no se toca donde sirve: una lista de ítems de
     * toda la empresa se sigue acotando al negocio de quien pregunta. Lo que
     * se quitó es que se acotara cuando ya se preguntó por un proyecto, que
     * de por sí es de un solo negocio. */
    const r = await o('sol', '/items');
    expect(r.estado).toBe(200);
    expect(r.data.total, 'los tres son del negocio B; el relleno pone el A').toBe(0);
  });
});

/* El nombre del proyecto es uno solo en toda la suite · 0.104.0
 *
 * Mike, 19-oct-2026: «necesito que se cambie el nombre en toda la suite.»
 *
 * La obra de quell101 y el proyecto de la suite son la misma casa contada de
 * dos lados (migración 0010), y cada lado guarda su nombre: `quell_projects
 * .name` y `proyectos.nombre`. Hasta hoy corregir uno dejaba el otro viejo: la
 * misma obra se llamaba distinto en la bitácora de obra que en dash101,
 * quote101 y peek101.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que corregir el nombre en quell101 lo corrija donde lo leen las demás
 *     —`/proyectos`— y no sólo en la obra;
 *   · que corregir el nombre del proyecto en la suite baje a la obra, venga de
 *     dash101 o de quote101: es por donde pasa todo cambio de la tabla;
 *   · que una obra suelta —sin proyecto— se pueda renombrar igual, sin
 *     tronar: la mitad de las obras viejas están así;
 *   · que renombrar no se lleve de paso el cliente, el estado ni el archivo
 *     (lo que el PATCH ya hacía con COALESCE);
 *   · y que nada de esto le abra a quell101 la puerta de escribir en
 *     `proyectos` por el cable: `ESCRITORES` sigue como estaba.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { ESCRITORES } from '../src/permisos';

const CORREO = 'mike@forespot.com';
const ORG = 'nombre-proyecto';
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
const q = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) =>
  pedir(quien, `/orgs/${ORG}/quell${ruta}`, { app: 'quell101', ...op });

const proyecto = async (id: string) => (await o('mike', `/proyectos/${id}`)).data as any;
const obra = async (id: string) => (await q('mike', `/projects/${id}`)).project as any;

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'El nombre del proyecto', apps: { dash: true, quell: true, cotizador: true } }, app: '' });
  await q('mike', '/me');
}, 60000);

describe('el nombre se corrige en los dos lados (0.104.0)', () => {
  it('de quell101 a la suite: la obra renombrada renombra su proyecto', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Lomas 214', client: 'Fam. Ortega', suite: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const pid = r.proyecto_id as string;
    expect(pid, 'la obra nació con su proyecto').toBeTruthy();
    expect((await proyecto(pid)).nombre).toBe('Casa Lomas 214');

    const p = await q('mike', `/projects/${r.id}`, { method: 'PATCH', json: { name: 'Casa Lomas 216' } });
    expect(p.estado, JSON.stringify(p)).toBe(200);
    expect((await obra(r.id)).name, 'el nombre de la obra').toBe('Casa Lomas 216');
    expect((await proyecto(pid)).nombre, 'y el del proyecto, que es lo que leen dash101 y quote101').toBe('Casa Lomas 216');
  });

  it('de la suite a quell101: el proyecto renombrado renombra su obra', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Depto Reforma 9', client: 'Fam. Lara', suite: true } });
    const pid = r.proyecto_id as string;

    const p = await o('mike', `/proyectos/${pid}`, { method: 'PATCH', json: { nombre: 'Depto Reforma 90' } });
    expect(p.estado, JSON.stringify(p)).toBe(200);
    expect((await proyecto(pid)).nombre).toBe('Depto Reforma 90');
    expect((await obra(r.id)).name, 'la obra de quell siguió al proyecto').toBe('Depto Reforma 90');
  });

  it('y también cuando el que renombra es quote101, no dash101', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Oficina Polanco', client: 'Fam. Sosa', suite: true } });
    const pid = r.proyecto_id as string;
    const p = await o('mike', `/proyectos/${pid}`, { method: 'PATCH', json: { nombre: 'Oficina Polanco 2' }, app: 'cotizador101' });
    expect(p.estado, JSON.stringify(p)).toBe(200);
    expect((await obra(r.id)).name).toBe('Oficina Polanco 2');
  });

  it('una obra suelta, sin proyecto, se renombra igual y no truena', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Bodega', client: 'Taller' } });   // sin suite: true
    expect(r.proyecto_id, 'nació suelta').toBeFalsy();
    const p = await q('mike', `/projects/${r.id}`, { method: 'PATCH', json: { name: 'Bodega chica' } });
    expect(p.estado, JSON.stringify(p)).toBe(200);
    expect((await obra(r.id)).name).toBe('Bodega chica');
  });

  it('renombrar no se lleva de paso el cliente ni el estado', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Pedregal', client: 'Fam. Ruiz', suite: true } });
    await q('mike', `/projects/${r.id}`, { method: 'PATCH', json: { status: 'cerrado' } });
    await q('mike', `/projects/${r.id}`, { method: 'PATCH', json: { name: 'Casa Pedregal 3' } });
    const x = await obra(r.id);
    expect(x.name).toBe('Casa Pedregal 3');
    expect(x.client, 'el cliente sigue ahí').toBe('Fam. Ruiz');
    expect(x.status, 'y el archivado también').toBe('cerrado');
  });

  it('un nombre en blanco no borra nada', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Sur', client: 'Fam. Vela', suite: true } });
    const pid = r.proyecto_id as string;
    await q('mike', `/projects/${r.id}`, { method: 'PATCH', json: { name: '   ' } });
    expect((await proyecto(pid)).nombre, 'el proyecto conserva su nombre').toBe('Casa Sur');
  });

  it('quell101 sigue sin poder escribir en `proyectos` por el cable', async () => {
    expect(Object.keys(ESCRITORES.proyectos ?? {}), 'los escritores de proyectos no cambiaron').toEqual(['dash101', 'cotizador101']);
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Norte', client: 'Fam. Paz', suite: true } });
    const pid = r.proyecto_id as string;
    // La misma petición, pero hecha a la tabla con la cabecera de quell101.
    const p = await o('mike', `/proyectos/${pid}`, { method: 'PATCH', json: { nombre: 'Por la puerta de atrás' }, app: 'quell101' });
    expect(p.estado, 'la API no se lo permite').not.toBe(200);
    expect((await proyecto(pid)).nombre, 'y el nombre no se movió').toBe('Casa Norte');
  });

});

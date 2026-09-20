/* La obra de quell101 y el proyecto de dash101, ligados · contrato 0.22.0
 *
 * Encargo de Mike del 20-sep: la obra que se abre en quell101 y el proyecto
 * que se abre en dash101 son la misma casa. Al crear un proyecto en dash101
 * tienen que salir las obras de quell101 que todavía no están activadas, y
 * las que ya se crearon de los dos lados se tienen que poder ligar.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que un proyecto NO pueda quedar ligado a dos obras ni una obra a dos
 *     proyectos. Si pasara, «el avance del proyecto» tendría dos respuestas
 *     ciertas a la vez, y eso no se arregla después: se arregla a mano,
 *     renglón por renglón, cuando alguien lo note;
 *   · que borrar el proyecto NO borre la obra. La obra tiene planos, fotos y
 *     bitácora de gente que estuvo ahí; una decisión de contabilidad no se
 *     lleva eso;
 *   · que la liga la pueda poner quien dirige la empresa y no cualquiera con
 *     la app abierta. Se cierra en el servidor, no en la pantalla.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'obras-ligadas';
const GENTE = {
  sol: { correo: 'sol-obra@ejemplo.mx', nombre: 'Sol Socia', rol: 'socio' },
  tin: { correo: 'tin-obra@ejemplo.mx', nombre: 'Tin Taller', rol: 'staff' },
};

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
/** Las rutas del motor de quell101 contestan sin envolver. */
const q = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) =>
  pedir(quien, `/orgs/${ORG}/quell${ruta}`, { app: 'quell101', ...op });

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, `código para ${correo}: ${JSON.stringify(c)}`).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}

let negocio = '', cliente = '', casaUno = '', casaDos = '';
let obraUno = '', obraDos = '', obraTres = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Obras ligadas', apps: { dash: true, quell: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, g] of Object.entries(GENTE)) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: g.correo, rol: g.rol, nombre: g.nombre, apps: ['dash', 'quell'] }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar(apodo, g.correo);
  }

  // El lado del dinero: dos proyectos en dash101.
  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Familia Uno' } })).data.id;
  casaUno = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Casa Uno' } })).data.id;
  casaDos = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Casa Dos' } })).data.id;

  // El lado de la obra: tres obras en quell101.
  await q('mike', '/me');
  obraUno = (await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Uno (obra)', client: 'Familia Uno' } })).id;
  obraDos = (await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Dos (obra)', client: 'Familia Uno' } })).id;
  obraTres = (await q('mike', '/projects', { method: 'POST', json: { name: 'Depa suelto', client: 'Otro' } })).id;
  expect(obraUno && obraDos && obraTres).toBeTruthy();
}, 60000);

describe('las obras salen al crear un proyecto', () => {
  it('sin ninguna liga, las tres obras están sueltas', async () => {
    const r = await o('mike', '/obras?sueltas=1');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.obras.map((x: any) => x.nombre).sort()).toEqual(['Casa Dos (obra)', 'Casa Uno (obra)', 'Depa suelto']);
    // Y vienen dichas con los nombres de la suite, no con los de quell101.
    const una = r.data.obras[0];
    expect(Object.keys(una)).toContain('cliente');
    expect(Object.keys(una)).not.toContain('client');
    expect(una.proyecto_id).toBe(null);
  });

  it('una obra recién nacida no trae planos ni ítems ubicados', async () => {
    const r = await o('mike', '/obras');
    const una = r.data.obras.find((x: any) => x.id === obraUno);
    expect(una.planos).toBe(0);
    expect(una.ubicados).toBe(0);
  });
});

describe('ligar', () => {
  it('se ligan los dos que son la misma casa, y esa obra deja de estar suelta', async () => {
    const r = await o('mike', `/obras/${obraUno}/ligar`, { method: 'POST', json: { proyecto_id: casaUno } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.obra.proyecto_id).toBe(casaUno);
    expect(r.data.obra.proyecto_nombre).toBe('Casa Uno');

    const sueltas = await o('mike', '/obras?sueltas=1');
    expect(sueltas.data.obras.map((x: any) => x.id)).not.toContain(obraUno);
    expect(sueltas.data.obras).toHaveLength(2);
  });

  it('desde el proyecto se pregunta por su obra, y se contesta null si no tiene', async () => {
    const con = await o('mike', `/obras/de-proyecto/${casaUno}`);
    expect(con.data.obra.id).toBe(obraUno);
    const sin = await o('mike', `/obras/de-proyecto/${casaDos}`);
    expect(sin.data.obra).toBe(null);
  });

  it('ligar lo mismo otra vez no truena ni cambia nada: es el mismo par', async () => {
    const r = await o('mike', `/obras/${obraUno}/ligar`, { method: 'POST', json: { proyecto_id: casaUno } });
    expect(r.estado).toBe(200);
    expect(r.data.obra.proyecto_id).toBe(casaUno);
  });

  it('una obra no se liga a un segundo proyecto: 409', async () => {
    const r = await o('mike', `/obras/${obraUno}/ligar`, { method: 'POST', json: { proyecto_id: casaDos } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('ya_ligada');
    expect(r.detalle.que).toBe('obra');
    // y el par de antes quedó intacto
    expect((await o('mike', `/obras/de-proyecto/${casaUno}`)).data.obra.id).toBe(obraUno);
  });

  it('un proyecto no recibe una segunda obra: 409 y dice con cuál ya estaba', async () => {
    const r = await o('mike', `/obras/${obraDos}/ligar`, { method: 'POST', json: { proyecto_id: casaUno } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('ya_ligada');
    expect(r.detalle.que).toBe('proyecto');
    expect(r.detalle.obra_id).toBe(obraUno);
  });

  it('lo que no existe se dice cuál de los dos falta', async () => {
    const sinObra = await o('mike', '/obras/no-existe/ligar', { method: 'POST', json: { proyecto_id: casaDos } });
    expect(sinObra.estado).toBe(404);
    expect(sinObra.detalle.que).toBe('obra');
    const sinProyecto = await o('mike', `/obras/${obraDos}/ligar`, { method: 'POST', json: { proyecto_id: 'no-existe' } });
    expect(sinProyecto.estado).toBe(404);
    expect(sinProyecto.detalle.que).toBe('proyecto');
    const sinNada = await o('mike', `/obras/${obraDos}/ligar`, { method: 'POST', json: {} });
    expect(sinNada.estado).toBe(400);
    expect(sinNada.detalle.falta).toBe('proyecto_id');
  });

  it('desligar deja a los dos sueltos y no borra ninguno', async () => {
    expect((await o('mike', `/obras/${obraUno}/ligar`, { method: 'DELETE' })).estado).toBe(200);
    expect((await o('mike', `/obras/de-proyecto/${casaUno}`)).data.obra).toBe(null);
    expect((await o('mike', '/obras?sueltas=1')).data.obras).toHaveLength(3);
    // el proyecto sigue ahí
    expect((await o('mike', `/proyectos/${casaUno}`)).estado).toBe(200);
    // y ahora sí se puede ligar el otro
    expect((await o('mike', `/obras/${obraDos}/ligar`, { method: 'POST', json: { proyecto_id: casaUno } })).estado).toBe(200);
  });
});

describe('quién puede', () => {
  it('un socio liga; alguien de taller mira pero no liga', async () => {
    const solLiga = await o('sol', `/obras/${obraTres}/ligar`, { method: 'POST', json: { proyecto_id: casaDos } });
    expect(solLiga.estado, JSON.stringify(solLiga)).toBe(200);

    expect((await o('tin', '/obras')).estado).toBe(200);
    const tinLiga = await o('tin', `/obras/${obraTres}/ligar`, { method: 'DELETE' });
    expect(tinLiga.estado).toBe(403);
    expect(tinLiga.error).toBe('sin_permiso');
    // y no se movió
    expect((await o('mike', `/obras/de-proyecto/${casaDos}`)).data.obra.id).toBe(obraTres);
  });
});

describe('borrar el proyecto no se lleva la obra', () => {
  it('la obra queda suelta, con sus planos y su bitácora', async () => {
    // `casaDos` está ligada a `obraTres` por la prueba de arriba.
    const borrado = await o('mike', `/proyectos/${casaDos}`, { method: 'DELETE' });
    expect(borrado.estado, JSON.stringify(borrado)).toBe(200);

    const obra = (await o('mike', '/obras')).data.obras.find((x: any) => x.id === obraTres);
    expect(obra, 'la obra sigue existiendo').toBeTruthy();
    expect(obra.proyecto_id, 'y quedó suelta').toBe(null);
    // quell101 la sigue abriendo igual
    expect((await q('mike', `/projects/${obraTres}`)).estado).toBe(200);
  });
});

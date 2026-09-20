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

/** Un PNG de un pixel: lo mínimo para subir un plano. */
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

/* ─────────────── la cantidad y los «ítems sin ubicar» (0.24.0) ───────────────
 *
 * Mike, 20-sep: «a veces son 20 puertas del mismo acabado y precio […] Y
 * cuando se genera un nuevo proyecto con su cantidad de ítems, en quell […]
 * deben de aparecer en una lista de "ítems sin ubicar". Para ir seleccionando
 * y ubicando cada ítem en su lugar.»
 *
 * Lo que de verdad aportan:
 *
 *   · que la cuenta de cuántas faltan la haga EL SERVIDOR. Dos personas
 *     ubicando piezas a la vez, cada una con su cuenta, es un plano con 21
 *     puertas de un ítem de 20;
 *   · que una pieza no se pueda colgar del ítem de OTRA casa;
 *   · que `monto` siga siendo el importe de la línea, y por tanto que
 *     `precio_venta` no se mueva al poner cantidades.
 */

describe('la cantidad y los ítems sin ubicar', () => {
  let obra = '', proyecto = '', plano = '', puertas = '', barra = '';

  it('un ítem de 20 puertas: el precio de venta es el importe de la línea, no ×20', async () => {
    obra = (await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Tres (obra)', client: 'Familia Uno' } })).id;
    proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Casa Tres' } })).data.id;
    expect((await o('mike', `/obras/${obra}/ligar`, { method: 'POST', json: { proyecto_id: proyecto } })).estado).toBe(200);

    // 20 puertas a $1,500.00 cada una = $30,000.00 de línea.
    const r = await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Puerta de clóset', monto: 30_000_00, cantidad: 20, estado: 'vendido',
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    puertas = r.data.id;
    expect(r.data.cantidad).toBe(20);
    expect(r.data.monto).toBe(30_000_00);

    const p = await o('mike', `/proyectos/${proyecto}`);
    expect(p.data.precio_venta, 'la suma es del importe, no del importe por la cantidad').toBe(30_000_00);
  });

  it('lo que ya existía vale 1 sin que nadie lo diga', async () => {
    const r = await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Barra de cocina', monto: 12_000_00, estado: 'vendido',
    } });
    barra = r.data.id;
    expect(r.data.cantidad).toBe(1);
  });

  it('sin ubicar: las 20 puertas y la barra, con el precio por pieza', async () => {
    const r = await o('mike', `/obras/${obra}/sin-ubicar`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const porNombre = Object.fromEntries(r.data.items.map((i: any) => [i.nombre, i]));
    expect(porNombre['Puerta de clóset'].faltan).toBe(20);
    expect(porNombre['Puerta de clóset'].ubicados).toBe(0);
    expect(porNombre['Puerta de clóset'].monto_unitario, 'el precio de UNA puerta').toBe(1_500_00);
    expect(porNombre['Barra de cocina'].faltan).toBe(1);
  });

  it('lo que sólo está cotizado no llena el plano', async () => {
    const cotizado = await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Librero que quizá', monto: 9_000_00, cantidad: 3,
    } });
    expect(cotizado.data.estado).toBe('cotizado');
    const r = await o('mike', `/obras/${obra}/sin-ubicar`);
    expect(r.data.items.map((i: any) => i.nombre)).not.toContain('Librero que quizá');
  });

  it('al ubicar una puerta, faltan 19 — y la cuenta la hace el servidor', async () => {
    const fd = new FormData();
    fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
    fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
    const pl = await q('mike', `/projects/${obra}/plans`, { method: 'POST', body: fd });
    expect(pl.estado, JSON.stringify(pl)).toBe(200);
    plano = pl.id;

    const puesta = await q('mike', `/plans/${plano}/elements`, { method: 'POST', json: {
      op_id: crypto.randomUUID(), name: 'Puerta 1', type: 'Puerta', x: 0.4, y: 0.6, item_id: puertas,
    } });
    expect(puesta.estado, JSON.stringify(puesta)).toBe(200);
    expect(puesta.item_id).toBe(puertas);

    const r = await o('mike', `/obras/${obra}/sin-ubicar`);
    const puerta = r.data.items.find((i: any) => i.id === puertas);
    expect(puerta.ubicados).toBe(1);
    expect(puerta.faltan).toBe(19);
  });

  it('una pieza no se cuelga del ítem de otra casa', async () => {
    // `obraDos` quedó ligada a `casaUno` en las pruebas de arriba; sus ítems
    // no son de esta obra.
    const ajeno = await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: casaUno,
      nombre: 'Mueble de otra casa', monto: 1_000_00, estado: 'vendido',
    } });
    const r = await q('mike', `/plans/${plano}/elements`, { method: 'POST', json: {
      op_id: crypto.randomUUID(), name: 'Intruso', type: 'Otro', x: 0.1, y: 0.1, item_id: ajeno.data.id,
    } });
    expect(r.estado).toBe(400);
  });

  it('cuando ya no falta ninguna, el ítem sale de la lista y no se puede poner otra', async () => {
    const soloUna = await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Cabecera', monto: 5_000_00, cantidad: 1, estado: 'vendido',
    } });
    const id = soloUna.data.id;
    const poner = () => q('mike', `/plans/${plano}/elements`, { method: 'POST', json: {
      op_id: crypto.randomUUID(), name: 'Cabecera', type: 'Otro', x: 0.2, y: 0.2, item_id: id,
    } });
    expect((await poner()).estado).toBe(200);
    const otra = await poner();
    expect(otra.estado, 'la segunda ya no cabe').toBe(409);

    const r = await o('mike', `/obras/${obra}/sin-ubicar`);
    expect(r.data.items.map((i: any) => i.id)).not.toContain(id);
  });

  it('una obra sin proyecto ligado lo dice, en vez de contestar una lista vacía', async () => {
    const suelta = (await q('mike', '/projects', { method: 'POST', json: { name: 'Obra suelta', client: '' } })).id;
    const r = await o('mike', `/obras/${suelta}/sin-ubicar`);
    expect(r.estado).toBe(409);
    expect(r.error).toBe('sin_liga');
  });
});

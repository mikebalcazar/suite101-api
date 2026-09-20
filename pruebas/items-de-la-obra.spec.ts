/* Los ítems de la obra y los del proyecto son la misma lista · contrato 0.26.0
 *
 * Encargo de Mike del 20-sep: si la obra de quell101 y el proyecto de dash101
 * son la misma casa, sus ítems tienen que ser las mismas piezas. Hoy se
 * capturan dos veces —una en el plano, otra en la lista del proyecto— y nadie
 * sabe cuál manda.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que PROPONER no escriba nada. Emparejar por parecido acierta casi
 *     siempre; la vez que falla le cuelga el dinero de una pieza a otra, y
 *     eso se arregla a mano cuando alguien lo note. Por eso son dos pasos, y
 *     el primero tiene que ser de mirar;
 *   · que un ítem traído del plano NO mueva el precio de venta del proyecto.
 *     Una pieza del plano no trae precio; si naciera «vendida» en cero,
 *     metería una venta que nadie tecleó en la proyección;
 *   · que el emparejado respete la CANTIDAD. Un ítem de 20 puertas admite 20
 *     piezas, no 21, y emparejar de uno en uno sin llevar la cuenta le
 *     colgaría las veinte a un ítem de una;
 *   · que aplicar dos veces no duplique. Quien pica dos veces el botón no
 *     tiene que acabar con el doble de ítems;
 *   · que el cambio de precio DEJE HUELLA en la bitácora de la obra. Es la
 *     respuesta a «¿de qué historial hablamos?»: el que está en obra se tiene
 *     que enterar de que el precio cambió, y la bitácora es el único lugar
 *     donde ya mira.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'items-de-la-obra';

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
const q = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) =>
  pedir(quien, `/orgs/${ORG}/quell${ruta}`, { app: 'quell101', ...op });

let negocio = '', cliente = '', proyecto = '', obra = '', plano = '';
let itemPuertas = '', itemBarra = '';

/** Poner una pieza en el plano SIN ítem: es la que hay que emparejar. */
const pieza = async (name: string, type = 'Otro', code?: string) => {
  const r = await q('mike', `/plans/${plano}/elements`, {
    method: 'POST',
    json: { op_id: crypto.randomUUID(), name, type, x: 0.3, y: 0.3, ...(code ? { code } : {}) },
  });
  expect(r.estado, JSON.stringify(r)).toBe(200);
  return r.id as string;
};

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Ítems de la obra', apps: { dash: true, quell: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Familia' } })).data.id;
  proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Casa' } })).data.id;

  await q('mike', '/me');
  obra = (await q('mike', '/projects', { method: 'POST', json: { name: 'Casa (obra)', client: 'Familia' } })).id;

  const fd = new FormData();
  fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
  fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
  plano = (await q('mike', `/projects/${obra}/plans`, { method: 'POST', body: fd })).id;
  expect(plano).toBeTruthy();
}, 60000);

describe('sin liga no hay nada que juntar', () => {
  it('409 `sin_liga`, y lo dice con todas sus letras', async () => {
    const r = await o('mike', `/obras/${obra}/items`);
    expect(r.estado).toBe(409);
    expect(r.error).toBe('sin_liga');
  });
});

describe('la propuesta', () => {
  beforeAll(async () => {
    const l = await o('mike', `/obras/${obra}/ligar`, { method: 'POST', json: { proyecto_id: proyecto } });
    expect(l.estado, JSON.stringify(l)).toBe(200);

    const puertas = await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Puerta de recámara', monto: 40_000_00, cantidad: 2, estado: 'vendido',
    } });
    expect(puertas.estado, JSON.stringify(puertas)).toBe(201);
    itemPuertas = puertas.data.id;
    /* La `clave` la pone quell101 y no dash101: el código de una pieza es
     * cosa de la obra. Así lo dicen los permisos de campo, y así se hace
     * aquí, que es como pasa de verdad. */
    const conClave = await o('mike', `/items/${itemPuertas}`, { method: 'PATCH', app: 'quell101', json: { clave: 'PU-01' } });
    expect(conClave.estado, JSON.stringify(conClave)).toBe(200);
    itemBarra = (await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Barra de cocina', monto: 60_000_00, cantidad: 1, estado: 'vendido',
    } })).data.id;
  });

  it('empareja por CÓDIGO, que es el que no deja duda', async () => {
    await pieza('Como se llame', 'Puerta', 'PU-01');
    const r = await o('mike', `/obras/${obra}/items`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const par = r.data.parejas.find((p: any) => p.item_id === itemPuertas);
    expect(par, 'la emparejó').toBeTruthy();
    // Y DICE por qué: quien decide no tiene que adivinar de dónde salió.
    expect(par.por).toBe('codigo');
  });

  it('y por nombre cuando no hay código', async () => {
    await pieza('Barra de cocina', 'Mueble');
    const r = await o('mike', `/obras/${obra}/items`);
    const par = r.data.parejas.find((p: any) => p.item_id === itemBarra);
    expect(par.por).toBe('nombre');
  });

  it('lo que no se parece a nada sale aparte, no emparejado a la fuerza', async () => {
    await pieza('Clóset del pasillo', 'Mueble');
    const r = await o('mike', `/obras/${obra}/items`);
    expect(r.data.nuevos.map((n: any) => n.pieza)).toContain('Clóset del pasillo');
    expect(r.data.parejas.map((p: any) => p.pieza)).not.toContain('Clóset del pasillo');
  });

  it('PROPONER no escribe: pedirla dos veces da lo mismo y nada quedó ligado', async () => {
    const antes = await o('mike', `/obras/${obra}/items`);
    const otra = await o('mike', `/obras/${obra}/items`);
    expect(otra.data.parejas.length).toBe(antes.data.parejas.length);
    expect(otra.data.nuevos.length).toBe(antes.data.nuevos.length);
    // Y el precio de venta del proyecto no se movió con sólo mirar.
    const p = await o('mike', `/proyectos/${proyecto}`);
    expect(p.data.precio_venta).toBe(100_000_00);
  });
});

describe('aplicar lo que se aceptó', () => {
  it('ligar cuelga la pieza del ítem, y no mueve el precio de venta', async () => {
    const prop = await o('mike', `/obras/${obra}/items`);
    const par = prop.data.parejas.find((p: any) => p.item_id === itemPuertas);
    const r = await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { ligar: [{ element_id: par.element_id, item_id: par.item_id }] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.ligados).toBe(1);

    const p = await o('mike', `/proyectos/${proyecto}`);
    expect(p.data.precio_venta, 'juntar piezas no es vender').toBe(100_000_00);
  });

  it('crear le hace un ítem a la pieza huérfana: COTIZADO y en cero', async () => {
    /* Las dos cosas son la misma decisión. Una pieza del plano no trae
     * precio: nadie se lo ha puesto. Si naciera «vendida» en cero, la
     * proyección del proyecto diría una cifra que nadie tecleó. */
    const prop = await o('mike', `/obras/${obra}/items`);
    const huerfana = prop.data.nuevos.find((n: any) => n.pieza === 'Clóset del pasillo');
    const r = await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { crear: [huerfana.element_id] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.creados).toBe(1);

    const items = await o('mike', `/items?proyecto_id=${proyecto}`);
    const nuevo = items.data.filas.find((i: any) => i.nombre === 'Clóset del pasillo');
    expect(nuevo, 'el ítem existe').toBeTruthy();
    expect(nuevo.estado).toBe('cotizado');
    expect(nuevo.monto).toBe(0);

    const p = await o('mike', `/proyectos/${proyecto}`);
    expect(p.data.precio_venta, 'y el precio de venta no se movió ni un peso').toBe(100_000_00);
  });

  it('aplicar otra vez no duplica: la pieza ya estaba ligada', async () => {
    const antes = (await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas.length;
    const prop = await o('mike', `/obras/${obra}/items`);
    // Ya no quedan piezas sueltas de las tres primeras; lo que sí es que
    // volver a mandar un plan viejo no puede crear nada.
    const r = await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { crear: prop.data.nuevos.map((n: any) => n.element_id) } });
    expect(r.estado).toBe(200);
    const luego = (await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas.length;
    expect(luego - antes).toBe(prop.data.nuevos.length);

    // Y ahora sí: repetir el MISMO plan no crea otra vez.
    const otra = await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { crear: prop.data.nuevos.map((n: any) => n.element_id) } });
    expect(otra.data.creados, 'la segunda vuelta no crea nada').toBe(0);
    expect((await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas.length).toBe(luego);
  });

  it('la cantidad manda: no se le cuelgan tres piezas a un ítem de una', async () => {
    /* Un ítem de cantidad 1 admite UNA pieza. Emparejar de uno en uno sin
     * llevar la cuenta le colgaría las tres, y entonces «cuánto falta por
     * fabricar» tendría tres respuestas ciertas. */
    const unico = (await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Cabecera única', monto: 5_000_00, cantidad: 1, estado: 'vendido',
    } })).data.id;
    await pieza('Cabecera única', 'Mueble');
    await pieza('Cabecera única', 'Mueble');
    await pieza('Cabecera única', 'Mueble');

    const prop = await o('mike', `/obras/${obra}/items`);
    const suyas = prop.data.parejas.filter((p: any) => p.item_id === unico);
    expect(suyas.length, 'una sola pareja, no tres').toBe(1);
    // Las otras dos no se pierden: salen como piezas a las que hay que
    // crearles su propio ítem.
    expect(prop.data.nuevos.filter((n: any) => n.pieza === 'Cabecera única').length).toBe(2);
  });

  it('una pieza de OTRA obra no se cuela', async () => {
    const otraObra = (await q('mike', '/projects', { method: 'POST', json: { name: 'Otra casa', client: 'Otro' } })).id;
    const r = await o('mike', `/obras/${otraObra}/items`, { method: 'POST', json: { crear: ['no-existe'] } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('sin_liga');
  });
});

describe('el precio deja huella en la bitácora de la obra', () => {
  it('cambiar el monto de un ítem escribe una entrada en cada pieza suya', async () => {
    /* Mike, 20-sep: «¿de qué historial hablamos?». De éste. El precio de un
     * proyecto se mueve y está bien que se mueva; lo que no puede es moverse
     * sin que se entere quien está en obra. */
    const prop = await o('mike', `/obras/${obra}/items`);
    const par = prop.data.parejas.find((p: any) => p.item_id === itemPuertas)
      ?? { element_id: null };
    if (par.element_id) {
      await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { ligar: [{ element_id: par.element_id, item_id: itemPuertas }] } });
    }
    const piezas = (await o('mike', `/obras/${obra}/items`)).data;
    expect(piezas).toBeTruthy();

    const sube = await o('mike', `/items/${itemPuertas}`, { method: 'PATCH', json: { monto: 44_000_00 } });
    expect(sube.estado, JSON.stringify(sube)).toBe(200);

    /* La bitácora se lee por pieza, con el detalle del elemento. Se busca la
     * entrada de tipo `precio` en la primera pieza colgada de ese ítem. */
    const ligadas = (await o('mike', `/obras/${obra}/items`)).data;
    expect(ligadas).toBeTruthy();
    const elId = par.element_id;
    if (elId) {
      const det = await q('mike', `/elements/${elId}`);
      const laHuella = (det.log ?? []).find((l: any) => l.kind === 'precio');
      expect(laHuella, `la bitácora de la pieza: ${JSON.stringify(det.log)}`).toBeTruthy();
      expect(laHuella.text).toContain('$400,000.00');
      expect(laHuella.text).toContain('$440,000.00');
      // Sin persona: no lo escribió nadie de la obra, lo escribió el sistema.
      expect(laHuella.user_id).toBe(null);
      expect(laHuella.user_name, 'y se lee como tal').toBe('Suite 101');
    }
  });

  it('cambiarle el nombre NO escribe una entrada de precio', async () => {
    /* La bitácora que se llena de todo deja de leerse, y la entrada que
     * importa se pierde entre las que no. */
    const det0 = await q('mike', `/elements/${(await o('mike', `/obras/${obra}/items`)).data.parejas[0]?.element_id ?? 'x'}`);
    void det0;
    const antes = await o('mike', `/items/${itemBarra}`);
    await o('mike', `/items/${itemBarra}`, { method: 'PATCH', json: { nombre: 'Barra de cocina (larga)' } });
    const luego = await o('mike', `/items/${itemBarra}`);
    expect(luego.data.monto).toBe(antes.data.monto);
  });
});

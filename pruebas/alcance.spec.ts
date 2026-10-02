/* El alcance del ítem: dentro o fuera, y su bitácora · 0.64.0 (antes 0.31.0)
 *
 * Mike, 20-sep-2026: «se debe poder cancelar algún ítem ya sea desde quell o
 * desde dash, y se refleja en los 2. (…) Los no aprobados, a pesar de que
 * tienen precio y toda la info, NO SUMAN en dash y NO APARECEN en quell al
 * menos que veas la vista de ítems fuera de alcance.»
 *
 * Mike, 2-oct-2026: «Hay que eliminar el estado de los ítems de "cancelado" y
 * solo existirá "en alcance" o "fuera de alcance". (…) no pasan a otra lista,
 * regresan a fuera de alcance, solo en la bitácora sí aparecerá como "se sacó
 * del alcance" y si se agrega de nuevo aparecerá después "se agregó al
 * alcance" con su fecha y quién la agregó.»
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que un fuera del alcance NO SUME, aunque traiga precio. Un
 *     requerimiento con precio metido en el precio de venta es una cifra que
 *     el cliente nunca aceptó, viajando en un estado de cuenta;
 *   · que sólo haya DOS respuestas, dentro y fuera, por cualquier puerta: lo
 *     que estuvo dentro y se sacó regresa a la misma lista que lo que nadie
 *     aprobó. Un tercer estado que se cuele es la lista partida que Mike
 *     mandó quitar;
 *   · que la BITÁCORA tenga cada entrada y salida con fecha, quién y motivo,
 *     y que la escriba toda puerta que mueva el estado —aprobar, sacar, el
 *     CRUD, nacer vendido—, no sólo las dos rutas con nombre;
 *   · que la copia de la regla que vive en el motor de quell (SQL) diga lo
 *     MISMO que la del contrato (`alcanceDeItem`). Son dos copias por una
 *     razón real —el motor es JavaScript suelto—, y dos copias sin una
 *     prueba que las compare son dos reglas.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { alcanceDeItem } from '../schema/tipos';

const CORREO = 'mike@forespot.com';
const ORG = 'alcance';

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

const item = async (nombre: string, monto: number, estado = 'vendido') =>
  (await o('mike', '/items', { method: 'POST', json: {
    negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto, nombre, monto, cantidad: 1, estado,
  } })).data.id as string;

const venta = async () => Number((await o('mike', `/proyectos/${proyecto}`)).data.precio_venta);

const pieza = async (name: string, item_id: string) => {
  const r = await q('mike', `/plans/${plano}/elements`, {
    method: 'POST', json: { op_id: crypto.randomUUID(), name, type: 'Mueble', x: 0.3, y: 0.3 },
  });
  const l = await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { ligar: [{ element_id: r.id, item_id }] } });
  expect(l.estado, JSON.stringify(l)).toBe(200);
  return r.id as string;
};

const enPlano = async () => {
  const r = await q('mike', `/projects/${obra}`);
  return Object.fromEntries((r.elements ?? []).map((e: any) => [e.name, e.alcance]));
};

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Alcance', apps: { dash: true, quell: true, cotizador: true } }, app: '' });

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Familia' } })).data.id;
  proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Casa' } })).data.id;

  await q('mike', '/me');
  obra = (await q('mike', '/projects', { method: 'POST', json: { name: 'Casa (obra)', client: 'Familia' } })).id;
  await o('mike', `/obras/${obra}/ligar`, { method: 'POST', json: { proyecto_id: proyecto } });
  const fd = new FormData();
  fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
  fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
  plano = (await q('mike', `/projects/${obra}/plans`, { method: 'POST', body: fd })).id;
}, 60000);

describe('la regla, escrita una vez', () => {
  it('el contrato sólo conoce dos respuestas: dentro y fuera', () => {
    expect(alcanceDeItem({ estado: 'vendido' })).toBe('dentro');
    expect(alcanceDeItem({ estado: 'cotizado' })).toBe('fuera');
    /* Un 'cancelado' viejo —de antes de la 0028— también es fuera, y nada
     * más: ya no hay cancelados ni descartados. */
    expect(alcanceDeItem({ estado: 'cancelado' })).toBe('fuera');
    expect(alcanceDeItem({})).toBe('fuera');
  });
});

describe('el requerimiento: tiene precio y no suma', () => {
  let req = '', vendido = '';

  beforeAll(async () => {
    vendido = await item('Cocina', 100_000_00);
    req = await item('Clóset de más', 20_000_00, 'cotizado');
    await pieza('Cocina', vendido);
    await pieza('Clóset de más', req);
  });

  it('no mueve el precio de venta aunque traiga su importe', async () => {
    expect(await venta(), 'sólo la cocina').toBe(100_000_00);
    expect((await o('mike', `/items/${req}`)).data.monto, 'y el requerimiento sí trae precio').toBe(20_000_00);
  });

  it('en el plano sale marcado como fuera, no escondido en el servidor', async () => {
    /* El recorte es de la pantalla, no de la API: quell tiene que poder
     * enseñarlo cuando alguien pide ver los que están fuera de alcance, y
     * para eso tiene que llegarle. */
    const plano_ = await enPlano();
    expect(plano_['Clóset de más']).toBe('fuera');
    expect(plano_['Cocina']).toBe('dentro');
  });

  it('al aprobarlo entra al alcance y ahí sí suma', async () => {
    const r = await o('mike', `/items/${req}/aprobar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.era).toBe('cotizado');
    expect(await venta()).toBe(120_000_00);
    expect((await enPlano())['Clóset de más']).toBe('dentro');
    expect((await o('mike', `/items/${req}`)).data.aprobado_at, 'y queda la fecha en que entró').toBeTruthy();
  });
});

describe('sacar del alcance', () => {
  it('lo que estaba dentro queda FUERA, deja de sumar y regresa a estado cotizado', async () => {
    const it = await item('Barra', 30_000_00);
    await pieza('Barra', it);
    const antes = await venta();
    const r = await o('mike', `/items/${it}/sacar`, { method: 'POST', json: { motivo: 'El cliente quitó la barra' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('fuera');
    expect(await venta()).toBe(antes - 30_000_00);
    expect((await enPlano())['Barra']).toBe('fuera');
    const fila = (await o('mike', `/items/${it}`)).data;
    expect(fila.estado, 'no hay un tercer estado: fuera es cotizado').toBe('cotizado');
    expect(fila.cancelado_motivo).toBe('El cliente quitó la barra');
    expect(fila.cancelado_at, 'y queda dicho que lo SACARON').toBeTruthy();
  });

  it('/cancelar sigue contestando, con el nombre de antes y la respuesta de ahora', async () => {
    const it = await item('Repisa vieja', 2_000_00);
    const r = await o('mike', `/items/${it}/cancelar`, { method: 'POST', json: {} });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('fuera');
  });

  it('lo que NUNCA estuvo aprobado también se saca, y es la misma palabra: fuera', async () => {
    /* Ya no hay «descartado»: Mike, 2-oct, «no pasan a otra lista». Lo que
     * cambia es que deja de salir en el plano como pendiente. */
    const it = await item('Pérgola que no fue', 50_000_00, 'cotizado');
    await pieza('Pérgola que no fue', it);
    const r = await o('mike', `/items/${it}/sacar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('fuera');
    expect((await enPlano())['Pérgola que no fue']).toBe('fuera');
  });

  it('sacar no borra que estuvo aprobado', async () => {
    const it = await item('Librero', 10_000_00);
    const cuando = (await o('mike', `/items/${it}`)).data.aprobado_at;
    expect(cuando).toBeTruthy();
    await o('mike', `/items/${it}/sacar`, { method: 'POST' });
    expect((await o('mike', `/items/${it}`)).data.aprobado_at, 'la fecha sigue ahí').toBe(cuando);
  });

  it('se puede sacar desde quell101, que es el otro lado de la misma pieza', async () => {
    const it = await item('Cabecera', 8_000_00);
    const r = await o('mike', `/items/${it}/sacar`, { method: 'POST', app: 'quell101', json: { motivo: 'Se cayó en obra' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('fuera');
  });

  it('y volver a agregarlo lo regresa, con su fecha original y sin rastro de la salida en el renglón', async () => {
    const it = await item('Mesa', 15_000_00);
    const cuando = (await o('mike', `/items/${it}`)).data.aprobado_at;
    await o('mike', `/items/${it}/sacar`, { method: 'POST' });
    const r = await o('mike', `/items/${it}/aprobar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('dentro');
    const ya = (await o('mike', `/items/${it}`)).data;
    expect(ya.estado).toBe('vendido');
    expect(ya.aprobado_at, 'estuvo aprobado desde el principio, y eso no se reescribe').toBe(cuando);
    expect(ya.cancelado_at, 'y ya no está sacado').toBeFalsy();
  });
});

/* ─────────────── la bitácora (0.64.0) ───────────────
 *
 * Mike, 2-oct: «solo en la bitácora sí aparecerá como "se sacó del alcance" y
 * si se agrega de nuevo aparecerá después "se agregó al alcance" con su fecha
 * y quién la agregó». */
describe('la bitácora del alcance', () => {
  const bitacora = async (id: string) => (await o('mike', `/items/${id}/alcance`)).data;

  it('un ítem que nace vendido entra al alcance al nacer, y queda quién', async () => {
    const it = await item('Vitrina', 9_000_00);
    const b = await bitacora(it);
    expect(b.alcance).toBe('dentro');
    expect(b.movimientos.map((m: any) => m.accion)).toEqual(['entra']);
    expect(b.movimientos[0]).toMatchObject({ item_id: it, proyecto_id: proyecto, quien: CORREO, app: 'dash101', motivo: null });
    expect(b.movimientos[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sacar y volver a agregar deja los dos renglones, en orden, con motivo y quién', async () => {
    const it = await item('Alacena', 12_000_00);
    await o('mike', `/items/${it}/sacar`, { method: 'POST', app: 'quell101', json: { motivo: 'No cabe' } });
    await o('mike', `/items/${it}/aprobar`, { method: 'POST' });
    const b = await bitacora(it);
    expect(b.alcance).toBe('dentro');
    expect(b.movimientos.map((m: any) => m.accion)).toEqual(['entra', 'sale', 'entra']);
    expect(b.movimientos[1]).toMatchObject({ quien: CORREO, app: 'quell101', motivo: 'No cabe' });
    expect(b.movimientos[2]).toMatchObject({ quien: CORREO, app: 'dash101' });
  });

  it('un requerimiento nace sin movimientos: todavía no ha entrado ni salido', async () => {
    const it = await item('Tapanco', 3_000_00, 'cotizado');
    const b = await bitacora(it);
    expect(b.alcance).toBe('fuera');
    expect(b.movimientos).toEqual([]);
  });

  it('el CRUD también la escribe: PATCH estado lo mueve y queda anotado', async () => {
    /* La pantalla del proyecto de dash101 quita un renglón con PATCH
     * {estado:'cancelado'}. Eso ya no es un tercer estado: se guarda como
     * cotizado, con su salida en la bitácora. */
    const it = await item('Zapatera grande', 4_000_00);
    const r = await o('mike', `/items/${it}`, { method: 'PATCH', json: { estado: 'cancelado' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.estado).toBe('cotizado');
    expect(r.data.alcance).toBe('fuera');
    expect(r.data.cancelado_at).toBeTruthy();
    const r2 = await o('mike', `/items/${it}`, { method: 'PATCH', json: { estado: 'vendido' } });
    expect(r2.data.alcance).toBe('dentro');
    expect(r2.data.cancelado_at).toBeFalsy();
    const b = await bitacora(it);
    expect(b.movimientos.map((m: any) => m.accion)).toEqual(['entra', 'sale', 'entra']);
    expect(b.movimientos[1].quien).toBe(CORREO);
  });

  it('cambiar otra cosa del ítem no inventa movimientos', async () => {
    const it = await item('Cómoda', 5_000_00);
    await o('mike', `/items/${it}`, { method: 'PATCH', json: { nombre: 'Cómoda de nogal' } });
    await o('mike', `/items/${it}`, { method: 'PATCH', json: { estado: 'vendido' } });
    expect((await bitacora(it)).movimientos.length).toBe(1);
  });

  it('la bitácora de un ítem que no existe es 404', async () => {
    expect((await o('mike', '/items/no-existe/alcance')).estado).toBe(404);
  });
});

describe('las dos copias de la regla dicen lo mismo', () => {
  it('lo que contesta el motor de quell coincide con `alcanceDeItem`', async () => {
    /* El motor la lleva en SQL porque es JavaScript suelto y no importa el
     * contrato. Dos copias sin una prueba que las compare son dos reglas, y
     * la que se quede atrás va a ser la que nadie mire. */
    const casos: Array<{ nombre: string; estado: string; cancelar: boolean }> = [
      { nombre: 'Caso dentro', estado: 'vendido', cancelar: false },
      { nombre: 'Caso fuera sin decidir', estado: 'cotizado', cancelar: false },
      { nombre: 'Caso fuera sacado', estado: 'vendido', cancelar: true },
      { nombre: 'Caso fuera descartado', estado: 'cotizado', cancelar: true },
    ];
    for (const c of casos) {
      const it = await item(c.nombre, 1_000_00, c.estado);
      await pieza(c.nombre, it);
      if (c.cancelar) await o('mike', `/items/${it}/sacar`, { method: 'POST' });
      const fila = (await o('mike', `/items/${it}`)).data;
      expect((await enPlano())[c.nombre], `${c.nombre}: el motor y el contrato`).toBe(alcanceDeItem(fila));
    }
  });
});

describe('el alcance viaja calculado', () => {
  it('cada ítem lo trae, sin que la pantalla tenga que deducirlo', async () => {
    /* Si cada app aplicara la regla por su cuenta habría tantas reglas como
     * apps. Así la dice el servidor una vez y las tres la leen. */
    const it = await item('Zapatera', 4_000_00, 'cotizado');
    expect((await o('mike', `/items/${it}`)).data.alcance).toBe('fuera');
    await o('mike', `/items/${it}/aprobar`, { method: 'POST' });
    expect((await o('mike', `/items/${it}`)).data.alcance).toBe('dentro');
    const lista = await o('mike', `/items?proyecto_id=${proyecto}`);
    expect(lista.data.filas.find((f: any) => f.id === it).alcance, 'y también en la lista').toBe('dentro');
  });

  it('no se puede escribir desde fuera: no es columna, es cuenta', async () => {
    const it = await item('Banco', 900_00, 'cotizado');
    const r = await o('mike', `/items/${it}`, { method: 'PATCH', json: { alcance: 'dentro' } });
    /* El CRUD ignora lo que no es columna, así que no truena; lo que importa
     * es que el alcance siga diciendo la verdad. */
    expect((await o('mike', `/items/${it}`)).data.alcance).toBe('fuera');
    void r;
  });
});

describe('los cinco campos del ítem, en la obra (§105)', () => {
  /* Mike, 20-sep: «todos los ítems se deben identificar con estos campos:
   * código, nombre, precio, descripción, tipo. Y así ayuda a organizar
   * entre quell y dash y quote».
   *
   * Y la decisión que tomó con botones el mismo día: en quell el precio lo
   * ven «sólo tú y la administración». */
  let conTodo = '', pieza_ = '';

  beforeAll(async () => {
    conTodo = (await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Puerta de nogal', descripcion: '0.90 × 2.40, nogal natural', tipo: 'Puerta',
      monto: 18_000_00, cantidad: 1, estado: 'vendido',
    } })).data.id;
    pieza_ = await pieza('Puerta de nogal', conTodo);
  });

  it('el detalle de la pieza trae código, nombre, tipo y DESCRIPCIÓN', async () => {
    const det = await q('mike', `/elements/${pieza_}`);
    /* El código de la PIEZA lo propone la obra (MW-…, PT-…) y es suyo. El
     * del PRODUCTO es otro campo y otra cosa —el del modelo en el
     * catálogo—, y ligar ya no copia uno al otro: Mike lo ordenó así el
     * 20-sep. */
    expect(det.element.code, 'el código de la pieza').toBeTruthy();
    expect((await o('mike', `/items/${conTodo}`)).data.clave ?? '', 'y el del producto no se lo robó').toBeFalsy();
    expect(det.element.name, 'el nombre').toBeTruthy();
    expect(det.element.type, 'el tipo').toBeTruthy();
    /* La descripción vivía sólo en dash101. Ahora viaja de ida: es el campo
     * que faltaba de los cinco. */
    expect(det.element.item_descripcion).toBe('0.90 × 2.40, nogal natural');
  });

  it('y el PRECIO sólo para quien manda en la empresa', async () => {
    /* Se recorta en el servidor, no al pintar: lo que viaja se lee. Mike lo
     * escogió así el 20-sep sabiendo el costo —un supervisor en obra no ve
     * en cuánto se vendió—. */
    const det = await q('mike', `/elements/${pieza_}`);
    expect(det.element.item_monto, 'el dueño sí lo ve, en centavos').toBe(18_000_00);
  });
});

describe('una pieza sin ítem sigue dentro', () => {
  it('no se esconde del plano por no tener renglón en dash', async () => {
    /* Es trabajo de la obra que nadie cotizó. Esconderlo por una razón de
     * contabilidad sería borrarlo de la obra. */
    await q('mike', `/plans/${plano}/elements`, {
      method: 'POST', json: { op_id: crypto.randomUUID(), name: 'Remate sin cotizar', type: 'Otro', x: 0.8, y: 0.8 },
    });
    expect((await enPlano())['Remate sin cotizar']).toBe('dentro');
  });
});

/* ─────────────── 0.49.0 · el requerimiento cae en un borrador de quote101 ───────────────
 *
 * Mike, 29-sep: «los requerimientos generados me deberían generar un borrador
 * en quote dentro del proyecto para poder enviarla al cliente a que me
 * autorice», y decidió que fuera solo, al levantarlos. Y después: «al
 * aprobarse los requerimientos cambia su código a alguno de mueble, puerta
 * etc.».
 *
 * Lo que se cuida: que el requerimiento sea UN solo ítem de principio a fin
 * —nace cotizado, cae en el borrador, y al aprobar el borrador ese mismo
 * queda vendido—, que no sume hasta que se apruebe, y que al aprobarse la
 * pieza del plano cambie de tipo y estrene código con el prefijo del tipo.
 */
describe('0.49.0 · el requerimiento nace como ítem y cae en el borrador de quote101', () => {
  let rq1 = '', it1 = '', it2 = '', borrador = '';
  const C = { app: 'cotizador101' } as const;
  const levantar = (name: string, plano_ = plano) => q('mike', `/plans/${plano_}/elements`, {
    method: 'POST', json: { op_id: crypto.randomUUID(), name, type: 'Requerimiento', x: 0.6, y: 0.6 },
  });
  const borradores = async () =>
    ((await o('mike', `/cotizaciones?negocio_id=${negocio}`, C)).data.filas as any[])
      .filter((c) => c.estado === 'borrador' && c.datos?.de_requerimientos === true && c.datos?.proyecto_id === proyecto);

  it('al levantarlo en una obra ligada ya es ítem cotizado del proyecto, con su código RQ-, y no suma', async () => {
    const v = await venta();
    const r = await levantar('Barra de la cocina');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    rq1 = r.id; it1 = r.item_id; borrador = r.cotizacion_id;
    expect(it1, 'la pieza sale con su ítem').toBeTruthy();
    expect(borrador, 'y con el borrador donde cayó').toBeTruthy();
    const item = (await o('mike', `/items/${it1}`)).data;
    expect(item).toMatchObject({ proyecto_id: proyecto, estado: 'cotizado', tipo: 'requerimiento', monto: 0, cantidad: 1, alcance: 'fuera' });
    expect(item.clave, 'el mismo código que la pieza').toMatch(/^RQ-\d+$/);
    expect(await venta(), 'un cotizado no mueve la venta').toBe(v);
    /* En el plano sigue DENTRO: un requerimiento pendiente no se esconde
     * (Mike, 22-sep: «sí aparece en mapa»); su tipo ya dice lo que es. */
    expect((await enPlano())['Barra de la cocina']).toBe('dentro');
  });

  it('el borrador es UNO por proyecto y se llama «Requerimientos»: el segundo cae en el mismo', async () => {
    const r = await levantar('Repisa del baño');
    expect(r.cotizacion_id).toBe(borrador);
    it2 = r.item_id;
    const lista = await borradores();
    expect(lista.length).toBe(1);
    expect(lista[0].id).toBe(borrador);
    expect(lista[0].datos.nombre).toBe('Requerimientos');
    const muebles = lista[0].datos.versiones[0].muebles;
    expect(muebles.map((m: any) => m.item_id)).toEqual([it1, it2]);
    expect(muebles[0], 'en la forma de un renglón «a mano» de quote101, en pesos').toMatchObject({ manual: true, nombre: 'Barra de la cocina', qty: 1, precio: 0 });
    expect(muebles[0].codigo).toMatch(/^RQ-\d+$/);
  });

  it('sacar un requerimiento lo saca del borrador y del plano', async () => {
    const r = await o('mike', `/items/${it2}/sacar`, { method: 'POST', json: { motivo: 'el cliente ya no lo quiso' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('fuera');
    expect((await borradores())[0].datos.versiones[0].muebles.map((m: any) => m.item_id)).toEqual([it1]);
    expect((await enPlano())['Repisa del baño'], 'y en el plano ya no está como pendiente').toBe('fuera');
  });

  it('aprobar el borrador aprueba ESE ítem —precio, tipo, código nuevo, pestaña— y no duplica nada', async () => {
    const antes = (await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas as any[];
    const v = await venta();
    const r = await o('mike', `/cotizaciones/${borrador}/aprobar`, { ...C, method: 'POST', json: {
      proyecto_id: proyecto,
      lineas: [{ item_id: it1, nombre: 'Barra de la cocina', descripcion: 'Encino, 2.40 m', tipo: 'puerta', cantidad: 1, precio: 150000 }],
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.items).toBe(1);
    expect(r.data.cotizacion.estado).toBe('aceptada');

    const despues = (await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas as any[];
    expect(despues.length, 'ninguna pieza de más: se aprobó la que ya estaba').toBe(antes.length);
    const item = despues.find((i) => i.id === it1);
    expect(item).toMatchObject({ estado: 'vendido', tipo: 'puerta', monto: 150000, cantidad: 1, partida: 'Requerimientos', descripcion: 'Encino, 2.40 m' });
    expect(item.aprobado_at).toBeTruthy();
    expect(item.clave, 'estrena el prefijo de su tipo').toMatch(/^PT-\d+$/);
    expect(await venta(), 'ahora sí suma').toBe(v + 150000);
    /* Y la entrada quedó en la bitácora, con quién la aprobó (0.64.0). */
    const b = (await o('mike', `/items/${it1}/alcance`)).data;
    expect(b.movimientos.map((m: any) => m.accion)).toEqual(['entra']);
    expect(b.movimientos[0]).toMatchObject({ quien: CORREO, app: 'cotizador101' });

    const det = await q('mike', `/elements/${rq1}`);
    expect(det.element.type, 'la pieza del plano cambió de tipo').toBe('Puerta');
    expect(det.element.code, 'y de código, el mismo que el ítem').toBe(item.clave);
    expect((await enPlano())['Barra de la cocina']).toBe('dentro');
  });

  it('aprobada ya no es borrador: el siguiente requerimiento abre otro', async () => {
    const r = await levantar('Zoclo de la sala');
    expect(r.cotizacion_id).toBeTruthy();
    expect(r.cotizacion_id).not.toBe(borrador);
    expect((await borradores()).length).toBe(1);
    await o('mike', `/items/${r.item_id}/sacar`, { method: 'POST', json: {} });
  });

  it('aprobar desde dash también lo saca del borrador: ya no está pendiente del cliente', async () => {
    const r = await levantar('Cenefa');
    const ap = await o('mike', `/items/${r.item_id}/aprobar`, { method: 'POST' });
    expect(ap.estado).toBe(200);
    expect((await borradores())[0].datos.versiones[0].muebles.map((m: any) => m.item_id)).not.toContain(r.item_id);
  });

  it('en una obra sin proyecto ligado la pieza se levanta igual, y nada más', async () => {
    const obra2 = (await q('mike', '/projects', { method: 'POST', json: { name: 'Obra suelta', client: 'Nadie' } })).id;
    const fd = new FormData();
    fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
    fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
    const plano2 = (await q('mike', `/projects/${obra2}/plans`, { method: 'POST', body: fd })).id;
    const r = await levantar('Sin proyecto', plano2);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.code).toBe('RQ-01');
    expect(r.item_id).toBeNull();
    expect(r.cotizacion_id).toBeNull();
  });
});

/* ─────────────── 0.49.0 · cada cotización aprobada es una pestaña ───────────────
 *
 * Mike, 29-sep: «dividir por partidas (grupos de cotizaciones) los ítems (…)
 * pestañas, tipo los libros de Excel». Las piezas nacen con la partida de la
 * cotización que las vendió, o con la que se pida. */
describe('0.49.0 · las piezas de una cotización aprobada nacen en su partida', () => {
  const C = { app: 'cotizador101' } as const;
  const cotizacion = async (nombre: string) =>
    (await o('mike', '/cotizaciones', { ...C, method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, total: 0, datos: { nombre, proyecto_id: proyecto, versiones: [] } } })).data.id as string;

  it('con el nombre de la cotización cuando no se dice otra cosa', async () => {
    const c = await cotizacion('Corrida 3');
    const r = await o('mike', `/cotizaciones/${c}/aprobar`, { ...C, method: 'POST', json: { proyecto_id: proyecto, lineas: [{ nombre: 'Mesa de la corrida 3', cantidad: 2, precio: 1000 }] } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    const mesas = ((await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas as any[]).filter((i) => i.nombre === 'Mesa de la corrida 3');
    expect(mesas.length).toBe(2);
    expect(mesas.every((i) => i.partida === 'Corrida 3')).toBe(true);
  });

  it('o con la partida que se pida', async () => {
    const c = await cotizacion('Corrida 4');
    const r = await o('mike', `/cotizaciones/${c}/aprobar`, { ...C, method: 'POST', json: { proyecto_id: proyecto, partida: 'Etapa 2', lineas: [{ nombre: 'Silla de la corrida 4', cantidad: 1, precio: 500 }] } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    const silla = ((await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas as any[]).find((i) => i.nombre === 'Silla de la corrida 4');
    expect(silla.partida).toBe('Etapa 2');
  });

  it('un item_id que no es del proyecto se rechaza sin escribir nada', async () => {
    const c = await cotizacion('Corrida 5');
    const r = await o('mike', `/cotizaciones/${c}/aprobar`, { ...C, method: 'POST', json: { proyecto_id: proyecto, lineas: [{ nombre: 'Buena', cantidad: 1, precio: 100 }, { item_id: 'no-existe', nombre: 'Mala', cantidad: 1, precio: 100 }] } });
    expect(r.estado).toBe(404);
    expect(((await o('mike', `/items?proyecto_id=${proyecto}`)).data.filas as any[]).some((i) => i.nombre === 'Buena')).toBe(false);
    expect((await o('mike', `/cotizaciones/${c}`, C)).data.estado).not.toBe('aceptada');
  });
});

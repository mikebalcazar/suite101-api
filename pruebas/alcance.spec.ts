/* El alcance del ítem: dentro, no aprobado, cancelado y descartado · 0.31.0
 *
 * Mike, 20-sep-2026: «se debe poder cancelar algún ítem ya sea desde quell o
 * desde dash, y se refleja en los 2. (…) Hay ítems nuevos no aprobados e
 * ítems cancelados. PARA QUE UN ÍTEM SE CONSIDERE CANCELADO TIENE QUE HABER
 * ESTADO APROBADO PRIMERO y luego cancelado. (…) Los no aprobados, a pesar
 * de que tienen precio y toda la info, NO SUMAN en dash y NO APARECEN en
 * quell al menos que veas la vista de ítems fuera de alcance.»
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que un no aprobado NO SUME, aunque traiga precio. Es la mitad del
 *     encargo, y es la que se rompería sin que nadie lo note: un
 *     requerimiento con precio metido en el precio de venta es una cifra que
 *     el cliente nunca aceptó, viajando en un estado de cuenta;
 *   · que cancelar algo que nunca estuvo aprobado NO se cuente como
 *     cancelado. Esa es la regla textual de Mike, y de ella depende que la
 *     lista de «cancelados» signifique algo: si se llena de requerimientos
 *     que nadie aprobó, deja de poder leerse;
 *   · que APROBADO_AT no se borre al cancelar. Es el único dato del que sale
 *     la clasificación; si se limpiara al cancelar, todo cancelado pasaría a
 *     descartado al día siguiente;
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
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Alcance', apps: { dash: true, quell: true } }, app: '' });

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
  it('el contrato la dice en sus cuatro casos', () => {
    expect(alcanceDeItem({ estado: 'vendido' })).toBe('dentro');
    expect(alcanceDeItem({ estado: 'cotizado' })).toBe('no_aprobado');
    expect(alcanceDeItem({ estado: 'cancelado', aprobado_at: '2026-09-20T00:00:00Z' })).toBe('cancelado');
    expect(alcanceDeItem({ estado: 'cancelado', aprobado_at: null })).toBe('descartado');
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

  it('en el plano sale marcado como no aprobado, no escondido en el servidor', async () => {
    /* El recorte es de la pantalla, no de la API: quell tiene que poder
     * enseñarlo cuando alguien pide ver los que están fuera de alcance, y
     * para eso tiene que llegarle. */
    const plano_ = await enPlano();
    expect(plano_['Clóset de más']).toBe('no_aprobado');
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

describe('cancelar', () => {
  it('lo que estuvo aprobado queda CANCELADO, y deja de sumar', async () => {
    const it = await item('Barra', 30_000_00);
    await pieza('Barra', it);
    const antes = await venta();
    const r = await o('mike', `/items/${it}/cancelar`, { method: 'POST', json: { motivo: 'El cliente quitó la barra' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('cancelado');
    expect(await venta()).toBe(antes - 30_000_00);
    expect((await enPlano())['Barra']).toBe('cancelado');
    expect((await o('mike', `/items/${it}`)).data.cancelado_motivo).toBe('El cliente quitó la barra');
  });

  it('lo que NUNCA estuvo aprobado queda descartado, no cancelado', async () => {
    /* La regla textual de Mike. De ella depende que la lista de cancelados
     * signifique algo: si se llena de requerimientos que nadie aprobó, deja
     * de poder leerse. */
    const it = await item('Pérgola que no fue', 50_000_00, 'cotizado');
    await pieza('Pérgola que no fue', it);
    const r = await o('mike', `/items/${it}/cancelar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('descartado');
    expect((await enPlano())['Pérgola que no fue']).toBe('descartado');
  });

  it('cancelar no borra que estuvo aprobado', async () => {
    const it = await item('Librero', 10_000_00);
    const cuando = (await o('mike', `/items/${it}`)).data.aprobado_at;
    expect(cuando).toBeTruthy();
    await o('mike', `/items/${it}/cancelar`, { method: 'POST' });
    expect((await o('mike', `/items/${it}`)).data.aprobado_at, 'la fecha sigue ahí').toBe(cuando);
  });

  it('se puede cancelar desde quell101, que es el otro lado de la misma pieza', async () => {
    const it = await item('Cabecera', 8_000_00);
    const r = await o('mike', `/items/${it}/cancelar`, { method: 'POST', app: 'quell101', json: { motivo: 'Se cayó en obra' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.alcance).toBe('cancelado');
  });

  it('y volver a aprobarlo lo revive, con su fecha original', async () => {
    const it = await item('Mesa', 15_000_00);
    const cuando = (await o('mike', `/items/${it}`)).data.aprobado_at;
    await o('mike', `/items/${it}/cancelar`, { method: 'POST' });
    const r = await o('mike', `/items/${it}/aprobar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const ya = (await o('mike', `/items/${it}`)).data;
    expect(ya.estado).toBe('vendido');
    expect(ya.aprobado_at, 'estuvo aprobado desde el principio, y eso no se reescribe').toBe(cuando);
    expect(ya.cancelado_at, 'y ya no está cancelado').toBeFalsy();
  });
});

describe('las dos copias de la regla dicen lo mismo', () => {
  it('lo que contesta el motor de quell coincide con `alcanceDeItem`', async () => {
    /* El motor la lleva en SQL porque es JavaScript suelto y no importa el
     * contrato. Dos copias sin una prueba que las compare son dos reglas, y
     * la que se quede atrás va a ser la que nadie mire. */
    const casos: Array<{ nombre: string; estado: string; cancelar: boolean }> = [
      { nombre: 'Caso dentro', estado: 'vendido', cancelar: false },
      { nombre: 'Caso no aprobado', estado: 'cotizado', cancelar: false },
      { nombre: 'Caso cancelado', estado: 'vendido', cancelar: true },
      { nombre: 'Caso descartado', estado: 'cotizado', cancelar: true },
    ];
    for (const c of casos) {
      const it = await item(c.nombre, 1_000_00, c.estado);
      await pieza(c.nombre, it);
      if (c.cancelar) await o('mike', `/items/${it}/cancelar`, { method: 'POST' });
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
    expect((await o('mike', `/items/${it}`)).data.alcance).toBe('no_aprobado');
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
    expect((await o('mike', `/items/${it}`)).data.alcance).toBe('no_aprobado');
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
    /* El código de la pieza lo propone la obra (MW-…, PT-…) y al ligarla se
     * copia al ítem, que no lo traía: por eso los dos dicen lo mismo. */
    expect(det.element.code, 'el código').toBeTruthy();
    expect((await o('mike', `/items/${conTodo}`)).data.clave, 'y el ítem quedó con el mismo').toBe(det.element.code);
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

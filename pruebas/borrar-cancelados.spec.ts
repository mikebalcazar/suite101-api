/* Borrar lo cancelado de un proyecto · contrato 0.38.0
 *
 * Mike, 21-sep, con HOLCIM enfrente: «ya todo lo cancelado lo puedes
 * eliminar por completo».
 *
 * Es de las poquísimas operaciones de esta API que NO SE DESHACEN, y por eso
 * estas pruebas no miden que borre: miden QUÉ NO BORRA.
 *
 * LO QUE DE VERDAD APORTAN:
 *
 *   · que un cancelado con un COBRO encima no se vaya. Borrarlo dejaría un
 *     movimiento de dinero sin dueño, y el dinero de una empresa no se
 *     queda huérfano porque alguien picó un botón de limpieza;
 *   · lo mismo con un AVANCE de obra, un COMPROMISO con proveedor y un
 *     ARCHIVO: son historia que no es del ítem, es de quien la vivió;
 *   · que el MODO SECO no escriba NADA y conteste exactamente lo mismo que
 *     el borrado. Una vista previa que no coincide con lo que después pasa
 *     es peor que no tener vista previa: hace confiar;
 *   · que el PRECIO DE VENTA no se mueva. Un cancelado nunca sumó, así que
 *     esto tiene que dar lo mismo antes y después, y se comprueba con el
 *     número, no con el razonamiento;
 *   · que la PIEZA DEL PLANO sobreviva al ítem. Es de quell101; borrarla
 *     desde dash101 sería borrar el trabajo de otra aplicación;
 *   · que lo VIVO no se toque, que es lo único que sería imperdonable.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'borrar-cancelados';

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

let negocio = '', cliente = '', cuenta = '', proyecto = '', obra = '', plano = '';

/** Un ítem vivo del proyecto. */
const item = async (nombre: string, monto = 5_000_00) => {
  const r = await o('mike', '/items', { method: 'POST', json: {
    negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
    nombre, monto, cantidad: 1, estado: 'vendido', tipo: 'mueble',
  } });
  expect(r.estado, JSON.stringify(r)).toBe(201);
  return r.data.id as string;
};

/** Un ítem que estuvo aprobado y se canceló: un CANCELADO de verdad. */
const cancelado = async (nombre: string, monto = 5_000_00) => {
  const id = await item(nombre, monto);
  expect((await o('mike', `/items/${id}/aprobar`, { method: 'POST', json: {} })).estado).toBe(200);
  const r = await o('mike', `/items/${id}/cancelar`, { method: 'POST', json: { motivo: 'el cliente lo quitó' } });
  expect(r.estado, JSON.stringify(r)).toBe(200);
  expect(r.data.alcance).toBe('cancelado');
  return id;
};

const cobrar = async (item_id: string) => {
  const r = await o('mike', '/movimientos', { method: 'POST', json: {
    negocio_id: negocio, tipo: 'ingreso', monto: 1_000_00, fecha: '2026-03-01',
    cuenta_id: cuenta, proyecto_id: proyecto, item_id, contraparte_tipo: 'cliente', contraparte_id: cliente,
  } });
  expect(r.estado, JSON.stringify(r)).toBe(201);
  return r.data.id as string;
};

const pieza = async (name: string, item_id: string) => {
  const r = await q('mike', `/plans/${plano}/elements`, {
    method: 'POST', json: { op_id: crypto.randomUUID(), name, type: 'Puerta', x: 0.4, y: 0.4 },
  });
  expect(r.estado, JSON.stringify(r)).toBe(200);
  const l = await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { ligar: [{ element_id: r.id, item_id }] } });
  expect(l.estado, JSON.stringify(l)).toBe(200);
  return r.id as string;
};

const seco = () => o('mike', `/proyectos/${proyecto}/borrar-cancelados`, { method: 'POST', json: { modo: 'seco' } });
const borrar = () => o('mike', `/proyectos/${proyecto}/borrar-cancelados`, { method: 'POST', json: { modo: 'borrar' } });
const precioVenta = async () => Number((await o('mike', `/proyectos/${proyecto}`)).data.precio_venta);
const vive = async (id: string) => (await o('mike', `/items/${id}`)).estado === 200;

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Borrar cancelados', apps: { dash: true, quell: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'HOLCIM' } })).data.id;
  cuenta = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco' } })).data.id;
  proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Obra' } })).data.id;

  await q('mike', '/me');
  obra = (await q('mike', '/projects', { method: 'POST', json: { name: 'Obra (plano)', client: 'HOLCIM' } })).id;
  await o('mike', `/obras/${obra}/ligar`, { method: 'POST', json: { proyecto_id: proyecto } });

  const fd = new FormData();
  fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
  fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
  plano = (await q('mike', `/projects/${obra}/plans`, { method: 'POST', body: fd })).id;
  expect(plano).toBeTruthy();
}, 60000);

describe('el censo, antes de escribir', () => {
  it('sin cancelados, contesta cero y no truena', async () => {
    const r = await seco();
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.total).toBe(0);
    expect(r.data.se_van).toEqual([]);
    expect(r.data.borrados).toBe(0);
  });

  it('un proyecto que no existe es 404, no un borrado en el vacío', async () => {
    const r = await o('mike', '/proyectos/no-existe/borrar-cancelados', { method: 'POST', json: { modo: 'seco' } });
    expect(r.estado).toBe(404);
  });

  it('cuenta los cancelados y los descartados por separado', async () => {
    /* Los DESCARTADOS —cancelados que nunca estuvieron aprobados— no salen
     * en la pestaña «Cancelados» de dash101, así que el censo puede dar más
     * de lo que Mike ve en pantalla. Eso se dice antes, no después. */
    const c1 = await cancelado('Puerta que se cayó');
    /* Nace COTIZADO: nunca estuvo aprobado, así que cancelarlo lo vuelve un
     * descartado y no un cancelado. Ésa es la regla textual de Mike. */
    const d1 = (await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Requerimiento descartado', monto: 1_000_00, cantidad: 1, estado: 'cotizado', tipo: 'mueble',
    } })).data.id as string;
    expect((await o('mike', `/items/${d1}/cancelar`, { method: 'POST', json: {} })).data.alcance).toBe('descartado');

    const r = await seco();
    expect(r.data.total).toBe(2);
    expect(r.data.cancelados).toBe(1);
    expect(r.data.descartados).toBe(1);
    expect(r.data.se_van.map((x: any) => x.id).sort()).toEqual([c1, d1].sort());
  });

  it('el seco NO escribe: los dos siguen ahí y el dinero no se movió', async () => {
    const antes = await precioVenta();
    const r = await seco();
    expect(r.data.borrados).toBe(0);
    expect(r.data.total).toBe(2);
    expect(await precioVenta()).toBe(antes);
    for (const x of r.data.se_van) expect(await vive(x.id)).toBe(true);
  });
});

describe('lo que trae dinero o historia NO se borra', () => {
  let conCobro = '', conAvance = '', conCompromiso = '', conArchivo = '', limpio = '';

  beforeAll(async () => {
    conCobro = await cancelado('Con un cobro encima');
    await cobrar(conCobro);

    conAvance = await cancelado('Con avance de obra');
    expect((await o('mike', `/items/${conAvance}/etapa`, { method: 'POST', json: { etapa: 2, nota: 'se fabricó' } })).estado).toBe(200);

    conCompromiso = await cancelado('Con compromiso de proveedor');
    const par = await o('mike', '/partidas', { method: 'POST', json: {
      proyecto_id: proyecto, item_id: conCompromiso, concepto: 'Herrería', monto_acordado: 2_000_00,
    } });
    expect(par.estado, JSON.stringify(par)).toBe(201);

    conArchivo = await cancelado('Con un papel colgado');
    const fd = new FormData();
    fd.append('de_tabla', 'items'); fd.append('de_id', conArchivo);
    fd.append('archivo', new File([PNG], 'foto.png', { type: 'image/png' }));
    expect((await o('mike', '/archivos', { method: 'POST', body: fd })).estado).toBe(201);

    limpio = await cancelado('Éste sí se puede ir');
  });

  it('el censo dice, renglón por renglón, qué lo detiene', async () => {
    const r = await seco();
    const porque = (id: string) => r.data.se_quedan.find((x: any) => x.id === id)?.porque ?? [];
    expect(porque(conCobro).join(' ')).toContain('movimiento');
    expect(porque(conAvance).join(' ')).toContain('avance');
    expect(porque(conCompromiso).join(' ')).toContain('compromiso');
    expect(porque(conArchivo).join(' ')).toContain('archivo');
    expect(r.data.se_van.map((x: any) => x.id)).toContain(limpio);
  });

  it('y después de borrar, los cuatro siguen vivos', async () => {
    const r = await borrar();
    expect(r.estado, JSON.stringify(r)).toBe(200);
    for (const id of [conCobro, conAvance, conCompromiso, conArchivo]) {
      expect(await vive(id), `${id} debía quedarse`).toBe(true);
    }
    expect(await vive(limpio)).toBe(false);
  });

  it('el cobro del cancelado que se quedó sigue colgado de su ítem', async () => {
    const movs = await o('mike', `/movimientos?item_id=${conCobro}`);
    expect(movs.data.total).toBe(1);
  });
});

describe('borrar de verdad', () => {
  let conPieza = '', vivo = '', elemento = '';

  beforeAll(async () => {
    vivo = await item('Éste está vendido y NO se toca', 9_000_00);
    conPieza = await cancelado('Cancelado con pieza en el plano');
    elemento = await pieza('PT-99', conPieza);
  });

  it('el precio de venta no se mueve: un cancelado nunca sumó', async () => {
    const antes = await precioVenta();
    const r = await borrar();
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.venta_antes).toBe(antes);
    expect(r.data.venta_despues).toBe(antes);
    expect(await precioVenta()).toBe(antes);
  });

  it('lo vendido sigue intacto', async () => {
    expect(await vive(vivo)).toBe(true);
    expect((await o('mike', `/items/${vivo}`)).data.monto).toBe(9_000_00);
  });

  it('la pieza del plano sobrevive al ítem, sin ítem', async () => {
    /* `ON DELETE SET NULL` de la migración 0011. La pieza es de quell101 y
     * borrarla desde aquí sería borrarle el plano a otra aplicación. */
    expect(await vive(conPieza)).toBe(false);
    const r = await o('mike', `/obras/${obra}/items`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    /* Sin ítem, la pieza cae en los montones de «hay que resolverla»: es
     * exactamente lo que queremos que pase, y no que desaparezca. */
    const sinItem = [...r.data.parejas, ...r.data.nuevos, ...r.data.sueltos]
      .map((x: any) => x.element_id ?? x.id);
    expect(sinItem, 'la pieza sigue en el plano, sin ítem').toContain(elemento);
  });

  it('volver a correrlo no borra nada nuevo ni truena', async () => {
    const r = await borrar();
    expect(r.estado).toBe(200);
    expect(r.data.borrados).toBe(0);
  });
});

describe('quién puede', () => {
  it('un cliente no entra ni al censo', async () => {
    const r = await o('cliente-de-fuera', `/proyectos/${proyecto}/borrar-cancelados`, { method: 'POST', json: { modo: 'seco' } });
    expect([401, 403]).toContain(r.estado);
  });
});

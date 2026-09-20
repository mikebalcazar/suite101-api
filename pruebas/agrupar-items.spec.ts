/* Varios ítems iguales, un solo concepto · contrato 0.30.0
 *
 * Encargo de Mike del 20-sep-2026: «necesito poder agrupar varios ítems en un
 * solo concepto. Son varias puertas iguales en diferente ubicación —quell las
 * ubica en plano y cada una tiene su seguimiento— pero el producto es el
 * mismo, "una puerta de X*X de tal acabado", y no tiene caso tener 21 ítems
 * idénticos enlistados en dash».
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que juntar NO MUEVA EL PRECIO DE VENTA del proyecto. Es la única
 *     manera de que acomodar la lista sea acomodar la lista y no un cambio
 *     de precio disfrazado. Si esta prueba se pone roja, lo que se rompió no
 *     es una pantalla: es una cifra que alguien le mandó a un cliente;
 *   · que las PIEZAS DEL PLANO no se pierdan. Las 21 puertas siguen siendo
 *     21 en quell101, con su ubicación y su bitácora; lo que se junta es el
 *     renglón que se cobra. Si al juntar se cayera una pieza, el que está en
 *     obra dejaría de ver un mueble que sí existe;
 *   · que no se pierda un COBRO ni un AVANCE. El renglón que se va se borra,
 *     y antes de borrarse su historia tiene que estar del otro lado;
 *   · que no se junten dos estados distintos. Juntar un cotizado con un
 *     vendido vendería el cotizado sin que nadie lo decida;
 *   · que un rechazo no deje nada a medias, que es la lección del 20-sep.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'agrupar-items';

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

/** Una puerta: el renglón capturado por separado, como salen hoy. */
const puerta = async (nombre = 'Puerta de recámara', monto = 8_000_00, extra: Record<string, unknown> = {}) => {
  const r = await o('mike', '/items', { method: 'POST', json: {
    negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
    nombre, monto, cantidad: 1, estado: 'vendido', tipo: 'mueble', ...extra,
  } });
  expect(r.estado, JSON.stringify(r)).toBe(201);
  return r.data.id as string;
};

const pieza = async (name: string, item_id?: string) => {
  const r = await q('mike', `/plans/${plano}/elements`, {
    method: 'POST', json: { op_id: crypto.randomUUID(), name, type: 'Puerta', x: 0.4, y: 0.4 },
  });
  expect(r.estado, JSON.stringify(r)).toBe(200);
  if (item_id) {
    const l = await o('mike', `/obras/${obra}/items`, { method: 'POST', json: { ligar: [{ element_id: r.id, item_id }] } });
    expect(l.estado, JSON.stringify(l)).toBe(200);
    expect(l.data.ligados).toBe(1);
  }
  return r.id as string;
};

const precioVenta = async () => Number((await o('mike', `/proyectos/${proyecto}`)).data.precio_venta);

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Agrupar ítems', apps: { dash: true, quell: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Familia' } })).data.id;
  cuenta = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco' } })).data.id;
  proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Casa' } })).data.id;

  await q('mike', '/me');
  obra = (await q('mike', '/projects', { method: 'POST', json: { name: 'Casa (obra)', client: 'Familia' } })).id;
  await o('mike', `/obras/${obra}/ligar`, { method: 'POST', json: { proyecto_id: proyecto } });

  const fd = new FormData();
  fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
  fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
  plano = (await q('mike', `/projects/${obra}/plans`, { method: 'POST', body: fd })).id;
  expect(plano).toBeTruthy();
}, 60000);

describe('la propuesta', () => {
  let a = '', b = '', caro = '';

  beforeAll(async () => {
    a = await puerta();
    b = await puerta();
    caro = await puerta('Puerta de recámara', 11_000_00); // mismo nombre, otro precio
  });

  it('junta los que son el mismo producto y deja fuera el que cuesta distinto', async () => {
    const r = await o('mike', `/proyectos/${proyecto}/agrupables`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const g = r.data.grupos.find((x: any) => x.nombre === 'Puerta de recámara' && x.precio_pieza === 8_000_00);
    expect(g, 'propone las dos de ocho mil').toBeTruthy();
    expect(g.items.map((i: any) => i.id).sort()).toEqual([a, b].sort());
    /* El precio va en la llave a propósito: dos renglones que se llaman
     * igual y cuestan distinto no son el mismo producto, o alguien se
     * equivocó en uno, y juntarlos taparía el error en un promedio. */
    expect(g.items.map((i: any) => i.id)).not.toContain(caro);
  });

  it('proponer no escribe nada', async () => {
    const antes = await precioVenta();
    await o('mike', `/proyectos/${proyecto}/agrupables`);
    expect(await precioVenta()).toBe(antes);
    expect((await o('mike', `/items/${a}`)).data.cantidad).toBe(1);
  });
});

describe('juntarlos', () => {
  let p1 = '', p2 = '', p3 = '', e1 = '', e2 = '';

  beforeAll(async () => {
    p1 = await puerta('Puerta de clóset', 5_000_00);
    p2 = await puerta('Puerta de clóset', 5_000_00);
    p3 = await puerta('Puerta de clóset', 5_000_00);
    e1 = await pieza('Clóset recámara 1', p1);
    e2 = await pieza('Clóset recámara 2', p2);
    // Un cobro y un avance colgados del que se va: no se pueden perder.
    await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'ingreso', monto: 2_000_00, fecha: '2026-09-01',
      cuenta_id: cuenta, proyecto_id: proyecto, item_id: p2, descripcion: 'Anticipo de la segunda',
    } });
    await o('mike', `/items/${p2}/etapa`, { method: 'POST', json: { etapa: 3, nota: 'en fabricación' } });
  });

  it('el PRECIO DE VENTA del proyecto no se mueve', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { queda_id: p1, se_van: [p2, p3], nombre: 'Puerta de clóset 0.80 × 2.40, nogal' },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(await precioVenta(), 'la suma es la misma').toBe(antes);
  });

  it('queda UN renglón, con la cantidad y el importe sumados', async () => {
    const it = (await o('mike', `/items/${p1}`)).data;
    expect(it.cantidad).toBe(3);
    expect(it.monto).toBe(15_000_00);
    expect(it.nombre).toBe('Puerta de clóset 0.80 × 2.40, nogal');
    expect((await o('mike', `/items/${p2}`)).estado, 'el que se fue ya no está').toBe(404);
    expect((await o('mike', `/items/${p3}`)).estado).toBe(404);
  });

  it('las piezas del plano siguen ahí, ahora colgadas del concepto', async () => {
    for (const eid of [e1, e2]) {
      const det = await q('mike', `/elements/${eid}`);
      expect(det.element, 'la pieza no se borró').toBeTruthy();
    }
    const prop = await o('mike', `/obras/${obra}/items`);
    const cand = prop.data.candidatos.find((c: any) => c.id === p1);
    expect(cand.ubicados, 'las dos cuelgan del concepto').toBe(2);
    expect(cand.cupo, 'y todavía cabe la tercera').toBe(1);
  });

  it('no se pierde el cobro ni el avance del que se fue', async () => {
    const movs = await o('mike', `/movimientos?item_id=${p1}`);
    expect(movs.data.filas.length, 'el anticipo se mudó').toBe(1);
    expect(movs.data.filas[0].descripcion).toBe('Anticipo de la segunda');
    const av = await o('mike', `/avances?item_id=${p1}`);
    expect(av.data.filas.length, 'y el avance también').toBeGreaterThan(0);
  });

  it('la etapa queda la del MÁS ATRASADO', async () => {
    /* Un concepto no va más adelantado que su pieza más atrasada: decir que
     * las tres van en fabricación porque una lo está es decir que ya están
     * tres cuando falta trabajo de dos. */
    expect((await o('mike', `/items/${p1}`)).data.etapa).toBe(0);
  });
});

describe('lo que no se junta', () => {
  let vendido = '', cotizado = '', deOtro = '';

  beforeAll(async () => {
    vendido = await puerta('Repisa', 1_000_00);
    cotizado = await puerta('Repisa', 1_000_00, { estado: 'cotizado' });
    const p2 = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Otra casa' } })).data.id;
    deOtro = (await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: p2, nombre: 'Repisa', monto: 1_000_00, estado: 'vendido',
    } })).data.id;
  });

  it('un cotizado con un vendido: 409, y dice por qué', async () => {
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { queda_id: vendido, se_van: [cotizado] } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('estado_distinto');
  });

  it('un ítem de otro proyecto: 404', async () => {
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { queda_id: vendido, se_van: [deOtro] } });
    expect(r.estado).toBe(404);
  });

  it('y el rechazo no deja nada a medias', async () => {
    /* La lección del 20-sep: un guardado que valida a medio camino miente en
     * su mensaje de error. Aquí se revisa todo y sólo entonces se escribe. */
    expect((await o('mike', `/items/${vendido}`)).data.cantidad).toBe(1);
    expect((await o('mike', `/items/${cotizado}`)).estado, 'el cotizado sigue vivo').toBe(200);
    expect((await o('mike', `/items/${deOtro}`)).data.proyecto_id, 'y el de la otra casa no se movió').not.toBe(proyecto);
  });

  it('juntar un ítem consigo mismo no es juntar: 400', async () => {
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { queda_id: vendido, se_van: [vendido] } });
    expect(r.estado).toBe(400);
  });
});

describe('el código del concepto', () => {
  it('se conserva si todos traían el mismo, y se limpia si diferían', async () => {
    /* Un código nombra UNA pieza del plano —la base lo impide dos veces en
     * la misma obra—. Dejarle PT-01 a un concepto de tres puertas nombra a
     * una y esconde dos; el código de cada pieza sigue en su plano, que es
     * donde se lee. */
    const a = await puerta('Cajonera', 3_000_00);
    const b = await puerta('Cajonera', 3_000_00);
    await o('mike', `/items/${a}`, { method: 'PATCH', app: 'quell101', json: { clave: 'CJ-01' } });
    await o('mike', `/items/${b}`, { method: 'PATCH', app: 'quell101', json: { clave: 'CJ-02' } });
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { queda_id: a, se_van: [b] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect((await o('mike', `/items/${a}`)).data.clave).toBe('');

    const c = await puerta('Banca', 2_000_00);
    const d = await puerta('Banca', 2_000_00);
    await o('mike', `/items/${c}`, { method: 'PATCH', app: 'quell101', json: { clave: 'BA-01' } });
    await o('mike', `/items/${d}`, { method: 'PATCH', app: 'quell101', json: { clave: 'BA-01' } });
    expect((await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { queda_id: c, se_van: [d] } })).estado).toBe(200);
    expect((await o('mike', `/items/${c}`)).data.clave).toBe('BA-01');
  });

  it('y queda escrito qué renglones se juntaron', async () => {
    /* El renglón se borra; lo que decía, no. Sin esto, «¿por qué este
     * concepto dice 3 y yo capturé tres cosas?» no tiene respuesta. */
    const it = (await o('mike', '/items?proyecto_id=' + proyecto)).data.filas.find((i: any) => i.nombre === 'Banca');
    expect(Array.isArray(it.refs.agrupados)).toBe(true);
    expect(it.refs.agrupados[0].clave).toBe('BA-01');
  });
});

describe('las 29 puertas del mismo modelo (§108)', () => {
  /* Mike, 20-sep, con la pantalla enfrente: «en juntar iguales no funciona
   * como debería. El código sí es diferente por ítem (PT-01, PT-02, PT-03)
   * pero el concepto se puede agrupar porque todas son el mismo modelo de
   * puerta».
   *
   * Tenía razón y el defecto era de la propuesta: agrupaba por nombre
   * IDÉNTICO, y una pieza traída del plano se llama «Puerta 01» —con su
   * número, así se dibuja en obra—. Así nunca iba a encontrar dos iguales.
   *
   * Y su segunda idea es la que ya sostiene todo esto: «un ítem/código
   * puede tener varias instancias que se comportan como ítems
   * independientes pero derivados del ítem modelo». Eso es exactamente un
   * concepto con `cantidad` y sus piezas en el plano: el modelo es el
   * renglón que se cobra, las instancias son las piezas, cada una con su
   * código y su bitácora.
   */
  let deLaObra: string[] = [];

  beforeAll(async () => {
    /* Cinco puertas como salen del plano: nombre con número, código propio,
     * sin precio todavía. */
    deLaObra = [];
    for (let i = 1; i <= 5; i++) {
      const id = await puerta(`Puerta ${String(i).padStart(2, '0')}`, 0, { estado: 'cotizado' });
      await o('mike', `/items/${id}`, { method: 'PATCH', app: 'quell101', json: { clave: `PP-${String(i).padStart(2, '0')}` } });
      deLaObra.push(id);
    }
  });

  it('ahora sí las propone: la familia del nombre, sin el número', async () => {
    const g = (await o('mike', `/proyectos/${proyecto}/agrupables`)).data.grupos
      .find((x: any) => x.items.some((i: any) => i.id === deLaObra[0]));
    expect(g, 'las encontró').toBeTruthy();
    expect(g.renglones).toBe(5);
    expect(g.nombre, 'y propone el nombre de la familia, no el de una pieza').toBe('Puerta');
    /* Y enseña qué nombres trae adentro: es lo que deja ver que se está
     * juntando lo correcto antes de aplicar. */
    expect(g.nombres).toContain('Puerta 01');
    expect(g.nombres).toContain('Puerta 05');
  });

  it('el número de la MEDIDA no se toca: eso sí es el producto', async () => {
    /* «Puerta 0.90» y «Puerta 1.20» no son la misma puerta. Se quita un
     * entero corto del final —un folio—, no un decimal. */
    const a = await puerta('Tablón 0.90', 1_000_00, { estado: 'cotizado' });
    const b = await puerta('Tablón 1.20', 1_000_00, { estado: 'cotizado' });
    const grupos = (await o('mike', `/proyectos/${proyecto}/agrupables`)).data.grupos;
    const juntos = grupos.find((x: any) => x.items.some((i: any) => i.id === a) && x.items.some((i: any) => i.id === b));
    expect(juntos, 'no se proponen juntas').toBeFalsy();
  });

  it('juntarlas deja UN concepto de cinco piezas y sin código', async () => {
    /* «¿Que cuando es un grupo, lo que viene en vez de código es un
     * nombre?» — sí: el código nombra una pieza del plano, y el concepto
     * son cinco. Cada pieza conserva el suyo. */
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST',
      json: { queda_id: deLaObra[0], se_van: deLaObra.slice(1), nombre: 'Puerta modelo A, 0.90 × 2.40' },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const it = (await o('mike', `/items/${deLaObra[0]}`)).data;
    expect(it.cantidad).toBe(5);
    expect(it.clave, 'sin código: el concepto son cinco piezas').toBe('');
    expect(it.nombre).toBe('Puerta modelo A, 0.90 × 2.40');
  });
});

describe('la partida y el orden (§102)', () => {
  /* Mike, 20-sep: «quiero también poder ordenar los ítems y agrupar por
   * partidas. Incluso podría ser por pestañas (como folders) para cambiar
   * entre partidas».
   *
   * OJO con la palabra: esta `partida` es el capítulo de la cotización
   * —Cocina, Recámaras—, no la tabla `partidas`, que son los compromisos con
   * proveedores. Lo que estas pruebas cuidan es que acomodar sea acomodar:
   * que no mueva dinero, que no se acomode media lista, y que renombrar una
   * partida sea una sola llamada. */
  let uno = '', dos = '', tres = '';

  beforeAll(async () => {
    uno = await puerta('Tarja', 4_000_00);
    dos = await puerta('Grifo', 1_500_00);
    tres = await puerta('Espejo', 900_00);
  });

  it('nace sin partida y en orden cero: nada se acomoda solo', async () => {
    const it = (await o('mike', `/items/${uno}`)).data;
    expect(it.partida).toBe('');
    expect(it.orden).toBe(0);
  });

  it('se acomoda todo en un solo envío, y el precio de venta no se mueve', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/proyectos/${proyecto}/acomodar`, { method: 'POST', json: { items: [
      { id: uno, partida: 'Cocina', orden: 1 },
      { id: dos, partida: 'Cocina', orden: 2 },
      { id: tres, partida: 'Baño', orden: 1 },
    ] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.acomodados).toBe(3);
    expect(await precioVenta(), 'acomodar no es cambiar de precio').toBe(antes);
    expect((await o('mike', `/items/${dos}`)).data.partida).toBe('Cocina');
    expect((await o('mike', `/items/${dos}`)).data.orden).toBe(2);
  });

  it('se puede pedir sólo una partida', async () => {
    const r = await o('mike', `/items?proyecto_id=${proyecto}&partida=Cocina`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.filas.map((f: any) => f.id).sort()).toEqual([uno, dos].sort());
  });

  it('renombrar la partida es mandar sus ítems con el nombre nuevo', async () => {
    const r = await o('mike', `/proyectos/${proyecto}/acomodar`, {
      method: 'POST', json: { items: [{ id: uno, partida: 'Cocina y barra' }, { id: dos, partida: 'Cocina y barra' }] },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    // Y el orden que ya tenían no se pierde: lo que no viene, no se toca.
    expect((await o('mike', `/items/${dos}`)).data.orden).toBe(2);
    expect((await o('mike', `/items/${tres}`)).data.partida, 'la otra partida ni se enteró').toBe('Baño');
  });

  it('un ítem de otro proyecto rechaza el envío entero', async () => {
    /* La misma lección: se revisa todo y sólo entonces se escribe. Si se
     * acomodara hasta el renglón malo, la lista quedaría a medio acomodar y
     * el mensaje diría que no se hizo nada. */
    const otroProyecto = (await o('mike', '/proyectos', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, nombre: 'Ajena',
    } })).data.id;
    const ajeno = (await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: otroProyecto, nombre: 'Puerta ajena', monto: 100_00, estado: 'vendido',
    } })).data.id;

    const r = await o('mike', `/proyectos/${proyecto}/acomodar`, {
      method: 'POST', json: { items: [{ id: tres, partida: 'Se quedó a medias' }, { id: ajeno, partida: 'Se quedó a medias' }] },
    });
    expect(r.estado).toBe(404);
    expect((await o('mike', `/items/${tres}`)).data.partida, 'no se acomodó ni el primero').toBe('Baño');
  });
});

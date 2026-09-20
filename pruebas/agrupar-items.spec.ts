/* Varios ítems del mismo producto · contrato 0.35.0
 *
 * Encargo de Mike del 20-sep-2026: «necesito poder agrupar varios ítems en un
 * solo concepto. Son varias puertas iguales en diferente ubicación —quell las
 * ubica en plano y cada una tiene su seguimiento— pero el producto es el
 * mismo, "una puerta de X*X de tal acabado", y no tiene caso tener 21 ítems
 * idénticos enlistados en dash».
 *
 * Y esa misma tarde, lo que cambió CÓMO se hace: «cuando un ítem se asigna a
 * un grupo de ítems que son del mismo producto, el ítem adquiere en
 * automático ese costo. También debe poder moverse de grupo de producto un
 * ítem ya agrupado».
 *
 * AGRUPAR YA NO FUSIONA. La primera versión de esto borraba los renglones
 * que se juntaban y dejaba uno solo con `cantidad = 21`. Un renglón borrado
 * no se puede mover de grupo, así que contradecía de frente lo segundo que
 * pidió. Le pregunté con botones y escogió que el grupo de producto
 * reemplace a la fusión: ahora hay una tabla `productos` y cada pieza le
 * apunta.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que NINGÚN RENGLÓN SE BORRE al agrupar. Es lo que hace posible sacar
 *     una pieza del grupo, que es lo que Mike pidió y lo que la versión
 *     anterior hacía imposible;
 *   · que HEREDAR EL PRECIO mueva el precio de venta del proyecto y que la
 *     respuesta diga cuánto, antes y después. Es la única regla de esto con
 *     consecuencia en dinero: si se rompe, lo que se rompió no es una
 *     pantalla, es una cifra que alguien le mandó a un cliente;
 *   · que las PIEZAS DEL PLANO sigan colgadas de SU renglón, no de uno solo.
 *     Ésa es la diferencia entre agrupar y fusionar, y es lo que deja que en
 *     obra se vea cuál puerta va adelantada;
 *   · que el COBRO y el AVANCE se queden con la pieza que los tuvo;
 *   · que el código de CATÁLOGO y el de PIEZA no se pisen —la corrección de
 *     Mike del 20-sep—;
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
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Agrupar ítems', apps: { dash: true, quell: true, nest: true } }, app: '' });
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

describe('agruparlas escribe un producto y NO borra ningún renglón', () => {
  let p1 = '', p2 = '', p3 = '', e1 = '', e2 = '', producto = '';

  beforeAll(async () => {
    p1 = await puerta('Puerta de clóset', 5_000_00);
    p2 = await puerta('Puerta de clóset', 5_000_00);
    p3 = await puerta('Puerta de clóset', 5_000_00);
    e1 = await pieza('Clóset recámara 1', p1);
    e2 = await pieza('Clóset recámara 2', p2);
    // Un cobro y un avance colgados de una de ellas: tienen que seguir suyos.
    await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'ingreso', monto: 2_000_00, fecha: '2026-09-01',
      cuenta_id: cuenta, proyecto_id: proyecto, item_id: p2, descripcion: 'Anticipo de la segunda',
    } });
    await o('mike', `/items/${p2}/etapa`, { method: 'POST', json: { etapa: 3, nota: 'en fabricación' } });
  });

  it('el PRECIO DE VENTA no se mueve si el producto cuesta lo que ya costaban', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: [p1, p2, p3], nombre: 'Puerta de clóset 0.80 × 2.40, nogal' },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    producto = r.data.producto.id;
    expect(r.data.producto.precio, 'el precio del modelo es el de la pieza').toBe(5_000_00);
    expect(await precioVenta(), 'la suma es la misma').toBe(antes);
    expect(r.data.venta_antes).toBe(antes);
    expect(r.data.venta_despues).toBe(antes);
  });

  it('LOS TRES RENGLONES SIGUEN AHÍ, apuntando al mismo producto', async () => {
    /* Esto es lo que cambió el 20-sep y es el corazón de todo: antes
     * quedaba UN renglón de tres piezas y los otros dos se borraban. Mike
     * pidió poder mover de grupo un ítem ya agrupado, y un renglón borrado
     * no se puede mover. */
    for (const id of [p1, p2, p3]) {
      const it = (await o('mike', `/items/${id}`)).data;
      expect(it, `${id} sigue existiendo`).toBeTruthy();
      expect(it.producto_id).toBe(producto);
      expect(it.cantidad, 'cada renglón sigue siendo UNA pieza').toBe(1);
      expect(it.monto, 'y hereda el precio del producto').toBe(5_000_00);
    }
  });

  it('cada pieza conserva su nombre: el del modelo se lee del producto', async () => {
    /* Pisar «Puerta de clóset» con «Puerta de clóset 0.80 × 2.40, nogal» en
     * los tres renglones deja tres líneas idénticas que ya no se distinguen
     * entre sí, y en obra hay que saber cuál es cuál. */
    expect((await o('mike', `/items/${p1}`)).data.nombre).toBe('Puerta de clóset');
    const pr = (await o('mike', `/productos/${producto}`)).data;
    expect(pr.nombre).toBe('Puerta de clóset 0.80 × 2.40, nogal');
  });

  it('las piezas del plano no se movieron de dueño', async () => {
    /* Cada una sigue colgada de SU renglón, no de uno solo: es la
     * diferencia entre agrupar y fusionar. Con la fusión, las dos acababan
     * apuntando al único renglón que sobrevivía. */
    for (const [eid, dueño] of [[e1, p1], [e2, p2]] as const) {
      const det = await q('mike', `/elements/${eid}`);
      expect(det.element, 'la pieza no se borró').toBeTruthy();
      expect(det.element.item_id, 'y sigue siendo de su renglón').toBe(dueño);
    }
    /* Y ninguno de los dos admite otra pieza: cada renglón es UNA puerta y
     * ya la tiene. Ésa es la lectura de que no se acumularon en uno. */
    const prop = await o('mike', `/obras/${obra}/items`);
    for (const id of [p1, p2]) {
      expect(prop.data.candidatos.some((c: any) => c.id === id), `${id} ya está lleno`).toBe(false);
    }
    expect(prop.data.candidatos.some((c: any) => c.id === p3), 'la tercera sí espera la suya').toBe(true);
  });

  it('el cobro y el avance se quedan en la pieza que los tuvo', async () => {
    /* Con la fusión había que mudarlos al renglón que se quedaba. Ya no hay
     * a dónde mudarlos: el renglón que los tenía sigue vivo, y que sigan
     * siendo suyos es lo que permite saber qué puerta va adelantada. */
    const movs = await o('mike', `/movimientos?item_id=${p2}`);
    expect(movs.data.filas.length).toBe(1);
    expect(movs.data.filas[0].descripcion).toBe('Anticipo de la segunda');
    expect((await o('mike', `/items/${p2}`)).data.etapa, 'la segunda va en fabricación').toBe(3);
    expect((await o('mike', `/items/${p1}`)).data.etapa, 'y la primera no, aunque sean el mismo modelo').toBe(0);
  });

  it('y ya no se vuelven a proponer: están agrupadas', async () => {
    const grupos = (await o('mike', `/proyectos/${proyecto}/agrupables`)).data.grupos;
    const otra = grupos.find((x: any) => x.items.some((i: any) => [p1, p2, p3].includes(i.id)));
    expect(otra).toBeFalsy();
  });
});

describe('heredar el precio: lo que Mike pidió con todas sus letras', () => {
  /* «Cuando un ítem se asigna a un grupo de ítems que son del mismo
   * producto, el ítem adquiere en automático ese costo.»
   *
   * Es la regla con consecuencia en dinero de todo esto, y por eso tiene su
   * propia prueba: mover una pieza de grupo CAMBIA el precio de venta del
   * proyecto, y la respuesta tiene que decir cuánto. */
  let cara = '', barata = '', modeloCaro = '';

  beforeAll(async () => {
    cara = await puerta('Ventanal', 30_000_00);
    const otra = await puerta('Ventanal', 30_000_00);
    barata = await puerta('Ventanal chico', 12_000_00);
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [cara, otra] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    modeloCaro = r.data.producto.id;
  });

  it('entrar a un producto le pone su precio, y el proyecto lo refleja', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/items/${barata}/producto`, { method: 'POST', json: { producto_id: modeloCaro } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.item.monto, 'de 12 mil a 30 mil').toBe(30_000_00);
    expect(r.data.venta_antes).toBe(antes);
    expect(r.data.venta_despues).toBe(antes + 18_000_00);
    expect(await precioVenta()).toBe(antes + 18_000_00);
  });

  it('con cantidad, el precio es POR PIEZA', async () => {
    /* `productos.precio` es de una; `items.monto` es de la línea. Un
     * renglón de 4 piezas del modelo de 30 mil son 120 mil, no 30. */
    const cuatro = await puerta('Ventanal', 1_00, { cantidad: 4 });
    const r = await o('mike', `/items/${cuatro}/producto`, { method: 'POST', json: { producto_id: modeloCaro } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.item.monto).toBe(4 * 30_000_00);
  });

  it('salirse NO le quita el precio: se queda con el que ya tenía', async () => {
    /* Salirse de un grupo es dejar de seguir a un modelo, no volverse
     * gratis. Si al salir se fuera a cero, sacar una pieza del grupo
     * equivocado tiraría el precio de venta sin que nadie lo pidiera. */
    const antes = await precioVenta();
    const r = await o('mike', `/items/${barata}/producto`, { method: 'POST', json: { solo: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.producto).toBeNull();
    expect(r.data.item.producto_id).toBeNull();
    expect(r.data.item.monto, 'conserva los 30 mil que heredó').toBe(30_000_00);
    expect(await precioVenta(), 'y el proyecto no se mueve').toBe(antes);
  });
});

describe('el dropdown del producto, y cambiarse de grupo (§111)', () => {
  /* Mike, 20-sep: «todos los ítems, aparte del tipo de ítem, deberían tener
   * un dropdown para seleccionar qué producto es, o nuevo si el ítem es su
   * mismo producto único. El dropdown debe tener 1) los ítems que son
   * únicos en el proyecto 2) los productos que ya tienen varios ítems
   * agrupados en el proyecto». */
  let solo1 = '', solo2 = '', modeloA = '', modeloB = '';

  beforeAll(async () => {
    solo1 = await puerta('Librero de estudio', 22_000_00);
    solo2 = await puerta('Recibidor', 7_000_00);
    const a1 = await puerta('Cabecera', 9_000_00);
    const a2 = await puerta('Cabecera', 9_000_00);
    modeloA = (await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: [a1, a2], nombre: 'Cabecera modelo A' },
    })).data.producto.id;
    const b1 = await puerta('Buró', 4_500_00);
    const b2 = await puerta('Buró', 4_500_00);
    modeloB = (await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: [b1, b2], nombre: 'Buró modelo B' },
    })).data.producto.id;
  });

  it('trae las dos listas: los productos de la obra y los ítems todavía únicos', async () => {
    const r = await o('mike', `/proyectos/${proyecto}/productos`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const ids = r.data.productos.map((p: any) => p.id);
    expect(ids).toContain(modeloA);
    expect(ids).toContain(modeloB);
    const a = r.data.productos.find((p: any) => p.id === modeloA);
    expect(a.items, 'dice cuántas piezas trae, que es lo que se lee al escoger').toBe(2);
    expect(a.nombre).toBe('Cabecera modelo A');

    const unicos = r.data.unicos.map((i: any) => i.id);
    expect(unicos).toContain(solo1);
    expect(unicos).toContain(solo2);
    expect(unicos, 'los que ya están en un producto no salen como únicos').not.toContain(
      r.data.productos.find((p: any) => p.id === modeloA).id,
    );
    const u = r.data.unicos.find((i: any) => i.id === solo1);
    expect(u.precio_pieza, 'y cada único trae su precio por pieza').toBe(22_000_00);
  });

  it('pasar de modelo A a modelo B es una sola llamada, y el ítem no deja de existir', async () => {
    /* «A lo mejor un ítem pasó de ser modelo A a modelo B y sólo se cambia
     * de grupo». Esto es lo que la fusión hacía imposible. */
    const deA = (await o('mike', `/items?proyecto_id=${proyecto}&producto_id=${modeloA}`)).data.filas[0].id;
    const r = await o('mike', `/items/${deA}/producto`, { method: 'POST', json: { producto_id: modeloB } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.item.producto_id).toBe(modeloB);
    expect(r.data.item.monto, 'y toma el precio del B').toBe(4_500_00);
    expect((await o('mike', `/items/${deA}`)).estado, 'sigue vivo').toBe(200);
  });

  it('escoger otro ítem único es decir «somos el mismo modelo»: nace el producto', async () => {
    /* Es el caso 1) del dropdown: un ítem único ES un producto que todavía
     * no se ha escrito, y escogerlo desde otro es lo que lo escribe. */
    const r = await o('mike', `/items/${solo2}/producto`, { method: 'POST', json: { desde_item: solo1 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.producto.nombre).toBe('Librero de estudio');
    expect(r.data.producto.precio, 'el precio es el de aquél').toBe(22_000_00);
    expect(r.data.item.monto, 'y el que escogió lo hereda').toBe(22_000_00);
    /* Y el que sirvió de modelo también queda adentro: si no, el producto
     * tendría una sola pieza y la otra se habría quedado fuera de su
     * propio grupo. */
    expect((await o('mike', `/items/${solo1}`)).data.producto_id).toBe(r.data.producto.id);
  });

  it('un ítem no se agrupa consigo mismo: 400', async () => {
    const r = await o('mike', `/items/${solo1}/producto`, { method: 'POST', json: { desde_item: solo1 } });
    expect(r.estado).toBe(400);
  });

  it('sin decir a qué producto: 400', async () => {
    const r = await o('mike', `/items/${solo1}/producto`, { method: 'POST', json: {} });
    expect(r.estado).toBe(400);
  });

  it('el apuntador no se puede escribir por PATCH', async () => {
    /* Un PATCH suelto lo dejaría apuntando a un modelo de $4,500 con su
     * precio viejo de $22,000, y el proyecto sumando mal. Se cambia por la
     * ruta, que hace las dos cosas juntas. */
    const r = await o('mike', `/items/${solo1}`, { method: 'PATCH', json: { producto_id: modeloB } });
    expect(r.estado).toBe(403);
  });
});

describe('lo que no se agrupa', () => {
  let vendido = '', cotizado = '', deOtro = '';

  beforeAll(async () => {
    vendido = await puerta('Repisa', 1_000_00);
    cotizado = await puerta('Repisa', 1_000_00, { estado: 'cotizado' });
    const p2 = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Otra casa' } })).data.id;
    deOtro = (await o('mike', '/items', { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: p2, nombre: 'Repisa', monto: 1_000_00, estado: 'vendido',
    } })).data.id;
  });

  it('un cotizado con un vendido SÍ se agrupa: cada uno conserva su estado', async () => {
    /* Con la fusión esto era un 409 —juntar un cotizado con un vendido lo
     * habría vendido sin que nadie lo decida—. Ya no aplica: los dos
     * renglones siguen existiendo con su propio estado; lo único que
     * comparten es el modelo. Un requerimiento no aprobado del mismo modelo
     * que una puerta ya vendida es justo lo que Mike va a tener. */
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [vendido, cotizado] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect((await o('mike', `/items/${vendido}`)).data.estado).toBe('vendido');
    expect((await o('mike', `/items/${cotizado}`)).data.estado, 'sigue sin aprobarse').toBe('cotizado');
  });

  it('un ítem de otro proyecto: 404, y no deja nada a medias', async () => {
    const suelto = await puerta('Ménsula', 600_00);
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [suelto, deOtro] } });
    expect(r.estado).toBe(404);
    /* La lección del 20-sep: se revisa todo y sólo entonces se escribe. */
    expect((await o('mike', `/items/${suelto}`)).data.producto_id, 'ni el bueno se agrupó').toBeNull();
    expect((await o('mike', `/items/${deOtro}`)).data.proyecto_id).not.toBe(proyecto);
  });

  it('un solo ítem no es un grupo: 400', async () => {
    const suelto = await puerta('Ménsula', 600_00);
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [suelto] } });
    expect(r.estado).toBe(400);
  });
});

describe('el código: el del catálogo y el de la pieza son dos', () => {
  it('si todas traían el mismo, ése es el del producto', async () => {
    const c = await puerta('Banca', 2_000_00);
    const d = await puerta('Banca', 2_000_00);
    await o('mike', `/items/${c}`, { method: 'PATCH', app: 'quell101', json: { clave: 'BA-01' } });
    await o('mike', `/items/${d}`, { method: 'PATCH', app: 'quell101', json: { clave: 'BA-01' } });
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [c, d] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.producto.codigo).toBe('BA-01');
    expect((await o('mike', `/items/${c}`)).data.clave, 'y las piezas dicen el del producto').toBe('BA-01');
  });

  it('si diferían, el producto nace SIN código para que lo cataloguen', async () => {
    /* PT-01 y PT-02 son códigos de PIEZA. Ponerle uno de ellos al modelo
     * nombraría a una y escondería la otra. Es la corrección de Mike del
     * 20-sep: «una cosa es el código de ítem (pieza física en obra) y otra
     * diferente el código de producto de catálogo». */
    const a = await puerta('Cajonera', 3_000_00);
    const b = await puerta('Cajonera', 3_000_00);
    await o('mike', `/items/${a}`, { method: 'PATCH', app: 'quell101', json: { clave: 'CJ-01' } });
    await o('mike', `/items/${b}`, { method: 'PATCH', app: 'quell101', json: { clave: 'CJ-02' } });
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [a, b] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.producto.codigo).toBe('');
    /* Y la pieza NO pierde el suyo: el producto no tiene con qué pisarlo, y
     * borrárselo sería perder un dato a cambio de nada. */
    expect((await o('mike', `/items/${a}`)).data.clave).toBe('CJ-01');
  });

  it('dos productos con el mismo código de catálogo: 409', async () => {
    const a = await puerta('Tarima', 800_00);
    const b = await puerta('Tarima', 800_00);
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [a, b], codigo: 'BA-01' } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('codigo_en_uso');
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
   * Y su segunda idea —«un ítem/código puede tener varias instancias que se
   * comportan como ítems independientes pero derivados del ítem modelo»— es
   * ahora literal: el ítem modelo es el PRODUCTO y las instancias son los
   * ítems. El día que lo escribí lo resolví con `cantidad` en un solo
   * renglón, que era la lectura pobre de lo mismo.
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

  it('agruparlas deja UN producto y CINCO piezas, cada una con su código', async () => {
    /* «¿Que cuando es un grupo, lo que viene en vez de código es un
     * nombre?» — el producto lleva nombre y su propio código de catálogo;
     * cada pieza conserva el de obra. Y ahora las cinco siguen siendo
     * cinco renglones, que es lo que permite mover una sola de grupo. */
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: deLaObra, nombre: 'Puerta modelo A, 0.90 × 2.40', precio: 8_500_00 },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.producto.nombre).toBe('Puerta modelo A, 0.90 × 2.40');
    expect(r.data.producto.codigo, 'sin código de catálogo: los cinco traían el suyo').toBe('');
    expect(r.data.items).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      const it = (await o('mike', `/items/${deLaObra[i]}`)).data;
      expect(it.producto_id).toBe(r.data.producto.id);
      expect(it.clave, 'cada pieza conserva su código de obra').toBe(`PP-0${i + 1}`);
      expect(it.monto, 'y todas toman el precio del modelo').toBe(8_500_00);
    }
  });

  it('y sacar UNA del grupo no toca a las otras cuatro', async () => {
    const r = await o('mike', `/items/${deLaObra[2]}/producto`, { method: 'POST', json: { solo: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect((await o('mike', `/items/${deLaObra[2]}`)).data.producto_id).toBeNull();
    for (const id of [deLaObra[0], deLaObra[1], deLaObra[3], deLaObra[4]]) {
      expect((await o('mike', `/items/${id}`)).data.producto_id, `${id} sigue en el modelo`).toBeTruthy();
    }
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

describe('separar: deshacer el grupo (§113)', () => {
  /* Mike, 20-sep, con HOLCIM enfrente: «ya se hizo un desastre con todos los
   * cambios y ahora no puedo separar los ítems para agruparlos en otro
   * producto. O mejor sepárame todos los ítems de puertas otra vez». */
  let a = '', b = '', producto = '';

  beforeAll(async () => {
    a = await puerta('Mampara', 6_000_00);
    b = await puerta('Mampara', 6_000_00);
    producto = (await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: [a, b], nombre: 'Mampara modelo único' },
    })).data.producto.id;
  });

  it('un ítem sale del grupo y conserva su precio', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/items/${a}/separar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.salio_de).toBe(producto);
    expect(r.data.item.producto_id).toBeNull();
    expect(r.data.item.monto, 'salirse no lo vuelve gratis').toBe(6_000_00);
    expect(r.data.reconstruidos, 'no había nada fusionado que devolver').toHaveLength(0);
    expect(await precioVenta()).toBe(antes);
  });

  it('separar el producto entero saca a los que queden, de un golpe', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/proyectos/${proyecto}/separar`, { method: 'POST', json: { producto_id: producto } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.separados).toBe(1);
    expect((await o('mike', `/items/${b}`)).data.producto_id).toBeNull();
    expect(await precioVenta()).toBe(antes);
  });

  it('un producto sin piezas en la obra: 404', async () => {
    const r = await o('mike', `/proyectos/${proyecto}/separar`, { method: 'POST', json: { producto_id: producto } });
    expect(r.estado).toBe(404);
  });
});

describe('rescatar un renglón FUSIONADO por el contrato 0.30.0 (§113)', () => {
  /* Aquel «juntar los iguales» BORRABA los renglones que absorbía y dejaba
   * uno con `cantidad = 29`. Mike alcanzó a usarlo antes de que lo
   * cambiáramos, y por eso no puede separar sus puertas: no hay 29 ítems que
   * sacar de un grupo, hay uno solo que la lista de productos no puede
   * partir.
   *
   * Se puede deshacer porque aquella versión dejó escrito en
   * `refs.agrupados` qué se había tragado. Aquí se arma ese estado exacto
   * —un renglón gordo, sus piezas en el plano y la anotación— y se mide el
   * rescate. Es la prueba más importante de este archivo: si el dinero se
   * moviera al rescatar, lo que se rompe es el precio de una obra.
   *
   * Las anotaciones se escriben con `X-App: nest101`, que es la única que
   * puede tocar `refs` (src/permisos.ts). No es un truco de la prueba: es
   * cómo se ve un renglón fusionado de verdad. */
  const ID2 = '01M30FUSIONADO000000000002';
  const ID3 = '01M30FUSIONADO000000000003';
  let gordo = '', e1 = '', e2 = '', e3 = '', c1 = '', c2 = '', c3 = '';

  beforeAll(async () => {
    // El renglón que sobrevivió a la fusión: tres piezas en uno.
    gordo = await puerta('Portón', 3 * 9_000_00, { cantidad: 3 });
    e1 = await pieza('Portón norte', gordo);
    e2 = await pieza('Portón sur', gordo);
    e3 = await pieza('Portón poniente', gordo);
    // Los códigos los pone quell101 por tipo; se leen, no se suponen.
    const codigo = async (eid: string) => String((await q('mike', `/elements/${eid}`)).element.code);
    [c1, c2, c3] = [await codigo(e1), await codigo(e2), await codigo(e3)];
    expect(new Set([c1, c2, c3]).size, 'tres códigos distintos').toBe(3);
    // El renglón se quedó con el código de una de sus piezas, como pasaba.
    await o('mike', `/items/${gordo}`, { method: 'PATCH', app: 'quell101', json: { clave: c1 } });
    // Y la anotación que dejó la fusión.
    const r = await o('mike', `/items/${gordo}`, { method: 'PATCH', app: 'nest101', json: { refs: {
      agrupados: [
        { id: ID2, clave: c2, nombre: 'Portón 02', cantidad: 1, monto: 9_000_00, agrupado_at: '2026-09-19T10:00:00Z', agrupado_por: 'u1' },
        { id: ID3, clave: c3, nombre: 'Portón 03', cantidad: 1, monto: 9_000_00, agrupado_at: '2026-09-19T10:00:00Z', agrupado_por: 'u1' },
      ],
    } } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
  });

  it('devuelve los renglones borrados, con su id, su código y su importe', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/items/${gordo}/separar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.reconstruidos).toHaveLength(2);

    for (const [id, clave, nombre] of [[ID2, c2, 'Portón 02'], [ID3, c3, 'Portón 03']] as const) {
      const it = (await o('mike', `/items/${id}`)).data;
      expect(it, `${id} volvió`).toBeTruthy();
      expect(it.clave, 'con su código de obra').toBe(clave);
      expect(it.nombre).toBe(nombre);
      expect(it.cantidad).toBe(1);
      expect(it.monto).toBe(9_000_00);
      expect(it.producto_id, 'y suelto, listo para agruparse en otro').toBeNull();
    }

    /* EL DINERO NO SE MOVIÓ. Es lo único que no se puede equivocar: lo que
     * se le restó al gordo es lo que se les puso a los dos. */
    const ya = (await o('mike', `/items/${gordo}`)).data;
    expect(ya.cantidad, 'el que sobrevivió vuelve a ser una pieza').toBe(1);
    expect(ya.monto).toBe(9_000_00);
    expect(await precioVenta(), 'el precio de venta de la obra es el mismo').toBe(antes);
    expect(r.data.venta_antes).toBe(r.data.venta_despues);
  });

  it('y cada pieza del plano se fue con su renglón, buscándola por código', async () => {
    expect((await q('mike', `/elements/${e2}`)).element.item_id).toBe(ID2);
    expect((await q('mike', `/elements/${e3}`)).element.item_id).toBe(ID3);
    expect((await q('mike', `/elements/${e1}`)).element.item_id, 'la del que sobrevivió no se mueve').toBe(gordo);
  });

  it('separar dos veces no duplica nada', async () => {
    const antes = await precioVenta();
    const r = await o('mike', `/items/${gordo}/separar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.reconstruidos, 'ya no hay nada anotado que devolver').toHaveLength(0);
    expect((await o('mike', `/items/${gordo}`)).data.cantidad).toBe(1);
    expect(await precioVenta()).toBe(antes);
  });

  it('si la anotación ya no cuadra con el renglón, NO se escribe nada', async () => {
    /* Alguien le bajó la cantidad al renglón gordo después de juntarlo:
     * devolver lo anotado lo dejaría en cero piezas. Más vale no separar que
     * separar cambiando el precio de una obra. */
    const otro = await puerta('Reja', 5_000_00, { cantidad: 1 });
    await o('mike', `/items/${otro}`, { method: 'PATCH', app: 'nest101', json: { refs: {
      agrupados: [{ id: '01M30FUSIONADO000000000009', clave: 'RJ-99', nombre: 'Reja 02', cantidad: 4, monto: 20_000_00 }],
    } } });
    const antes = await precioVenta();
    const r = await o('mike', `/items/${otro}/separar`, { method: 'POST' });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('no_cuadra');
    expect((await o('mike', `/items/${otro}`)).data.cantidad, 'intacto').toBe(1);
    expect((await o('mike', '/items/01M30FUSIONADO000000000009')).estado, 'no nació nada').toBe(404);
    expect(await precioVenta()).toBe(antes);
  });
});

describe('agrupar a un producto QUE YA EXISTE (§114)', () => {
  /* Mike, 20-sep, con la pantalla de juntar enfrente: «donde dice nombre del
   * modelo debería poderse hacer uno nuevo, o seleccionar agregar a alguno ya
   * existente. Recuerda que al asignarlo a un producto existente, adopta en
   * automático el precio del producto al que se agrupa».
   *
   * Es su caso de HOLCIM tal cual: 25 puertas traídas del plano a $0 y dos ya
   * cotizadas a $2,850. Meter las 25 al modelo de las dos les pone $2,850 a
   * cada una, y eso SUBE el precio de venta de la obra. Que lo suba está
   * bien —es lo que pidió—; lo que no puede pasar es que suba sin decirlo. */
  let modelo = '', precio = 0;

  beforeAll(async () => {
    const a = await puerta('Domo', 2_850_00);
    const b = await puerta('Domo', 2_850_00);
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, { method: 'POST', json: { items: [a, b], nombre: 'Domo modelo A' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    modelo = r.data.producto.id;
    precio = r.data.producto.precio;
    expect(r.data.nuevo, 'ése sí nació aquí').toBe(true);
  });

  it('las piezas sin precio adoptan el del modelo, y la venta sube lo que debe', async () => {
    const sinPrecio = [await puerta('Domo', 0, { estado: 'vendido' }), await puerta('Domo', 0, { estado: 'vendido' })];
    const antes = await precioVenta();
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: sinPrecio, producto_id: modelo },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.nuevo, 'no se escribió un producto nuevo').toBe(false);
    expect(r.data.producto.id).toBe(modelo);
    for (const id of sinPrecio) expect((await o('mike', `/items/${id}`)).data.monto).toBe(precio);
    expect(r.data.venta_antes).toBe(antes);
    expect(r.data.venta_despues, 'dos piezas a 2,850 más').toBe(antes + 2 * precio);
    expect(await precioVenta()).toBe(antes + 2 * precio);
  });

  it('el nombre y el precio que manden se IGNORAN: el modelo ya tiene los suyos', async () => {
    /* Dejar que la pantalla de juntar le cambie el precio a un producto
     * movería el importe de sus piezas en OTRAS obras sin que nadie lo
     * pidiera. Para cambiarle el precio a un modelo está su propia edición. */
    const otra = await puerta('Domo', 0, { estado: 'vendido' });
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: [otra, await puerta('Domo', 0, { estado: 'vendido' })],
                              producto_id: modelo, nombre: 'Otro nombre', precio: 99_00 },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.producto.nombre).toBe('Domo modelo A');
    expect(r.data.producto.precio).toBe(precio);
    expect((await o('mike', `/items/${otra}`)).data.monto, 'la pieza tomó el del modelo, no el del cuerpo').toBe(precio);
  });

  it('un producto que no existe: 404, y nada se agrupa', async () => {
    const x = await puerta('Tragaluz', 1_000_00);
    const y = await puerta('Tragaluz', 1_000_00);
    const r = await o('mike', `/proyectos/${proyecto}/agrupar`, {
      method: 'POST', json: { items: [x, y], producto_id: '01NOEXISTE0000000000000000' },
    });
    expect(r.estado).toBe(404);
    expect((await o('mike', `/items/${x}`)).data.producto_id).toBeNull();
  });
});

/* Un ingreso también puede estar pendiente de facturar · contrato 0.25.0
 *
 * Encargo de Mike del 20-sep: «En los ingresos hay que registrar si fue
 * facturado, y si sí, agregar/adjuntar la factura, o marcar como pendiente de
 * facturar. Y tener una lista con ingresos pendientes de facturar.»
 *
 * Casi todo ya existía desde el contrato 0.21.x y servía para los dos lados:
 * `facturado`, el desglose de IVA, la tabla `cfdi` con su tipo ingreso|egreso,
 * el IVA trasladado del mes. Lo que faltaba era la ESPERA de la factura, que
 * vivía en la orden de compra (`ordenes.con_factura`) — y un ingreso no tiene
 * orden de compra, así que no podía estar pendiente jamás.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que un cobro marcado «falta facturar» salga en la lista, que es el
 *     encargo entero en una línea;
 *   · que `requiere_factura` y `facturado` NO se pisen. Son la decisión y el
 *     hecho: si marcar una factura borrara la espera, cancelarla después
 *     dejaría el cobro fuera de la lista y nadie volvería a perseguirlo;
 *   · que un ingreso que NO lleva factura no estorbe. Un préstamo del socio o
 *     una devolución no son ventas, y una lista con ruido se deja de leer;
 *   · que el lado de los egresos siga funcionando igual, que es lo único que
 *     Mike ya usa hoy;
 *   · que la factura se pueda colgar con la tabla `archivos` de siempre, sin
 *     columna nueva y sin ruta nueva.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'ingresos-factura';
const galletas: Record<string, string> = {};

async function pedir(ruta: string, op: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (op.app !== '') cabeceras['X-App'] = op.app ?? 'dash101';
  if (galletas.mike) cabeceras.Cookie = galletas.mike;
  let body = op.body;
  if (op.json !== undefined) { body = JSON.stringify(op.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...op, body, headers: { ...cabeceras, ...(op.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas.mike = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ...cuerpo } as { estado: number; [k: string]: any };
}
const o = (ruta: string, op: Parameters<typeof pedir>[1] = {}) => pedir(`/orgs/${ORG}${ruta}`, op);

let negocio = '', cuenta = '', cliente = '';
let cobroPorFacturar = '', cobroFacturado = '', prestamo = '';

/** Un cobro al cliente. `requiere_factura` es la decisión de quien captura. */
async function cobrar(monto: number, requiere_factura: boolean) {
  const r = await o('/movimientos', {
    method: 'POST',
    json: {
      negocio_id: negocio, tipo: 'ingreso', monto, fecha: '2026-03-10', cuenta_id: cuenta,
      contraparte_tipo: 'cliente', contraparte_id: cliente, requiere_factura,
    },
  });
  expect(r.estado, JSON.stringify(r)).toBe(201);
  return r.data.id as string;
}

const pendientes = async (q = '') => (await o(`/fiscal/pendientes${q}`)).data.filas as any[];

beforeAll(async () => {
  const c = await pedir('/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  expect(c.estado).toBe(200);
  const e = await pedir('/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado).toBe(200);

  const alta = await pedir('/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Ingresos por facturar' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = (await o('/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cuenta = (await o('/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco', saldo_inicial: 0 } })).data.id;
  cliente = (await o('/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'HOLCIM' } })).data.id;

  cobroPorFacturar = await cobrar(900_000_00, true);
  cobroFacturado = await cobrar(300_000_00, true);
  prestamo = await cobrar(50_000_00, false); // un préstamo del socio: no lleva factura
}, 60_000);

describe('los ingresos pendientes de facturar', () => {
  it('un cobro marcado «falta facturar» sale en la lista', async () => {
    const filas = await pendientes('?tipo=ingreso');
    expect(filas.map((m) => m.id).sort()).toEqual([cobroFacturado, cobroPorFacturar].sort());
    expect(filas.every((m) => m.tipo === 'ingreso')).toBe(true);
  });

  it('y el que NO lleva factura no estorba', async () => {
    const filas = await pendientes('?tipo=ingreso');
    expect(filas.some((m) => m.id === prestamo), 'un préstamo del socio no es una venta').toBe(false);
  });

  it('al llegar la factura deja de pedirse, y sigue diciendo que se esperaba', async () => {
    const r = await o(`/fiscal/movimientos/${cobroFacturado}/facturado`, {
      method: 'POST',
      json: { facturado: true, tasa_iva: 1600, uuid_cfdi: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', fecha_cfdi: '2026-03-11' },
    });
    expect(r.estado, JSON.stringify(r)).toBe(200);

    const filas = await pendientes('?tipo=ingreso');
    expect(filas.map((m) => m.id), 'ya no está en la lista').toEqual([cobroPorFacturar]);

    const mov = (await o(`/movimientos/${cobroFacturado}`)).data;
    expect(mov.facturado).toBe(true);
    expect(mov.requiere_factura, 'la espera no se borró: son cosas distintas').toBe(true);
    expect(mov.subtotal + mov.iva, 'y el desglose cuadra con el total').toBe(mov.monto);
  });

  it('si la factura se cancela, el cobro vuelve a la lista solo', async () => {
    /* Es la razón de que marcar la factura no borre la espera. Si la borrara,
     * cancelar dejaría el cobro fuera de la lista y nadie volvería a
     * perseguirlo: se pierde dinero sin que truene nada. */
    const r = await o(`/fiscal/movimientos/${cobroFacturado}/facturado`, { method: 'POST', json: { facturado: false } });
    expect(r.estado).toBe(200);
    const filas = await pendientes('?tipo=ingreso');
    expect(filas.map((m) => m.id).sort()).toEqual([cobroFacturado, cobroPorFacturar].sort());
  });

  it('se puede dejar de esperar la factura sin inventarse que llegó', async () => {
    /* El caso de «me equivoqué, esto no llevaba factura». No se marca como
     * facturado —sería mentira y ensuciaría el IVA—: se quita la espera. */
    await o(`/movimientos/${cobroFacturado}`, { method: 'PATCH', json: { requiere_factura: false } });
    const filas = await pendientes('?tipo=ingreso');
    expect(filas.map((m) => m.id)).toEqual([cobroPorFacturar]);
    expect((await o(`/movimientos/${cobroFacturado}`)).data.facturado, 'y sigue sin factura, que es la verdad').toBe(false);
  });

  it('sin filtro vienen los dos lados, y el egreso conserva su folio de orden', async () => {
    /* La lista de egresos es la que Mike ya usa. Aquí no hay órdenes, así que
     * lo que se comprueba es que la consulta ya no DEPENDA de ellas: antes
     * empezaba con un JOIN contra `ordenes` y sin órdenes devolvía cero. */
    const egreso = await o('/movimientos', {
      method: 'POST',
      json: { negocio_id: negocio, tipo: 'egreso', monto: 40_000_00, fecha: '2026-03-12', cuenta_id: cuenta, requiere_factura: true },
    });
    expect(egreso.estado).toBe(201);

    const todos = await pendientes();
    expect(todos.map((m) => m.id).sort()).toEqual([cobroPorFacturar, egreso.data.id].sort());
    expect(todos.find((m) => m.id === egreso.data.id).orden_folio, 'sin orden, el folio viene vacío y no estorba').toBeFalsy();
  });

  it('un tipo que no existe se rechaza en vez de contestar cualquier cosa', async () => {
    const r = await o('/fiscal/pendientes?tipo=lo-que-sea');
    expect(r.estado).toBe(400);
    expect(r.error).toBe('tipo_desconocido');
  });

  it('la factura se cuelga del movimiento con la tabla de archivos de siempre', async () => {
    /* Mike pidió «agregar/adjuntar la factura». No hace falta columna nueva:
     * `archivos` ya es genérica (`de_tabla` + `de_id`). */
    const forma = new FormData();
    forma.set('archivo', new File(['<cfdi:Comprobante/>'], 'factura-holcim.xml', { type: 'application/xml' }));
    forma.set('de_tabla', 'movimientos');
    forma.set('de_id', cobroPorFacturar);
    const sube = await o('/archivos', { method: 'POST', body: forma });
    expect(sube.estado, JSON.stringify(sube)).toBe(201);

    const suyos = (await o(`/archivos?de_tabla=movimientos&de_id=${cobroPorFacturar}`)).data.filas;
    expect(suyos.map((a: any) => a.nombre)).toEqual(['factura-holcim.xml']);
    // Y se puede volver a bajar: colgarla sin poder abrirla no sirve de nada.
    const baja = await SELF.fetch(`https://api.local/orgs/${ORG}/archivos/${sube.data.id}`, {
      headers: { 'X-App': 'dash101', Cookie: galletas.mike },
    });
    expect(baja.status).toBe(200);
    expect(await baja.text()).toContain('cfdi:Comprobante');
  });

  it('el IVA trasladado del mes sale de los CFDI de ingreso, no de la bandera', async () => {
    /* Se deja medido porque es lo que decide cuánto se entera: marcar un
     * movimiento como facturado NO inventa IVA trasladado; ése sale de la
     * factura capturada. */
    const antes = (await o('/fiscal/iva?mes=2026-03')).data;
    const f = await o('/fiscal/cfdi', {
      method: 'POST',
      json: {
        negocio_id: negocio, uuid: '11111111-2222-3333-4444-555555555555', tipo: 'ingreso',
        subtotal: 100_000_00, iva: 16_000_00, total: 116_000_00, fecha: '2026-03-15', rfc: 'XAXX010101000',
      },
    });
    expect(f.estado, JSON.stringify(f)).toBe(201);
    const despues = (await o('/fiscal/iva?mes=2026-03')).data;
    expect(despues.trasladado - antes.trasladado).toBe(16_000_00);
  });
});

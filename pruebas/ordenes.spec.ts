/* Órdenes de compra y contabilidad fiscal · contrato 0.21.0
 *
 * Los 17 casos numerados del encargo de dash101 (19-sep-2026), en orden, más
 * los que hicieron falta al construirlo.
 *
 * LO QUE DE VERDAD APORTAN, que es lo que no se ve probando a mano:
 *
 *   · que pagar dos veces la misma orden NO haga dos egresos. Es un doble
 *     clic en un celular, y el dinero sale dos veces;
 *   · que un miembro no pueda leer las órdenes de otro ni el buzón. Esa
 *     puerta se cierra en el servidor, y una pantalla que filtra bien no
 *     prueba nada;
 *   · que una factura que llega DESPUÉS del pago se cuelgue del movimiento
 *     que ya existe, en vez de crear otro. Es la razón entera de que no haya
 *     dos contabilidades.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'compras';
const GENTE = {
  ana:  { correo: 'ana-oc@ejemplo.mx',  nombre: 'Ana Pide' },
  beto: { correo: 'beto-oc@ejemplo.mx', nombre: 'Beto Paga' },
  caro: { correo: 'caro-oc@ejemplo.mx', nombre: 'Caro Mira' },
  /* Dora tiene dash101 pero NO supply: es el caso de «tu usuario no está
   * autorizado para compras» (0.47.0). Entra a supply101 sólo a reembolsos. */
  dora: { correo: 'dora-oc@ejemplo.mx', nombre: 'Dora Reembolsa' },
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

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, `código para ${correo}: ${JSON.stringify(c)}`).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}

const dia = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

let negocio = '', cuenta = '', proveedor = '', cliente = '', proyecto = '', partida = '';
let pAna = '', pBeto = '', uAna = '', uBeto = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Compras de prueba', apps: { dash: true, supply: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, g] of Object.entries(GENTE)) {
    // Dora es la única sin la llave `supply` (0.47.0).
    const apps = apodo === 'dora' ? ['dash'] : ['dash', 'supply'];
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: g.correo, rol: 'staff', nombre: g.nombre, apps }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar(apodo, g.correo);
  }

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cuenta = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco' } })).data.id;
  proveedor = (await o('mike', '/proveedores', { method: 'POST', json: { nombre: 'Maderas SA' } })).data.id;
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Cliente Uno' } })).data.id;
  proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Casa Uno' } })).data.id;
  partida = (await o('mike', '/partidas', { method: 'POST', json: { proyecto_id: proyecto, proveedor_id: proveedor, proveedor_nombre: 'Maderas SA', concepto: 'Madera', monto_acordado: 500_00 } })).data.id;

  for (const apodo of ['ana', 'beto'] as const) {
    const yo = await pedir(apodo, '/yo', { app: '' });
    if (apodo === 'ana') uAna = yo.data.usuario.id; else uBeto = yo.data.usuario.id;
  }
  /* Mike (dueño) marca a Beto como contador POR SU usuario, sin que nadie
   * haya creado antes su fila de `personal`. Es el caso normal de una empresa
   * que sólo usa dash101, donde esa tabla está vacía: la decisión 6 dice «se
   * le asigna a cualquier miembro», y tiene que poderse. */
  const marca = await o('mike', '/ordenes/contadores', { method: 'POST', json: { usuario_id: uBeto, valor: true } });
  expect(marca.estado, JSON.stringify(marca)).toBe(200);
  expect(marca.data.es_contador).toBe(true);
  pBeto = marca.data.id;
}, 90000);

describe('19 · órdenes de compra (los casos del encargo)', () => {
  let oc1 = '', oc2 = '', oc3 = '', oc4 = '';

  it('1 · se captura el TOTAL y la suite lo separa: $1,160 da 1 000 00 + 160 00 exactos', async () => {
    const r = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_id: proveedor, proveedor_nombre: 'Maderas SA',
      concepto: 'Tornillería', monto: 1_160_00, con_factura: true, fecha_maxima_pago: dia(5),
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.subtotal).toBe(1_000_00);
    expect(r.data.iva).toBe(160_00);
    expect(r.data.subtotal + r.data.iva, 'la suma da el total exacto').toBe(r.data.monto);
    expect(r.data.estado, 'sin autorización previa: nace en el buzón').toBe('en_buzon');
    expect(r.data.folio).toMatch(/^OC-\d{6}$/);
    expect(r.data.solicitante_correo, 'el correo se copia al crear').toBe(GENTE.ana.correo);
    oc1 = r.data.id;
  });

  it('2 · quien no es contador pide el buzón y el servidor le dice que no', async () => {
    const r = await o('ana', '/ordenes/buzon');
    expect(r.estado).toBe(403);
    expect(r.error).toBe('sin_permiso');
  });

  it('3 · un miembro ve SÓLO sus órdenes, nunca las de otro', async () => {
    const deBeto = await o('beto', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'Ferretería', concepto: 'Brocas', monto: 300_00,
    } });
    expect(deBeto.estado).toBe(201);
    oc2 = deBeto.data.id;

    const mias = await o('ana', '/ordenes');
    expect(mias.data.filas.every((f: any) => f.solicitante_correo === GENTE.ana.correo)).toBe(true);
    expect(mias.data.filas.some((f: any) => f.id === oc2), 'la de Beto no sale en la lista de Ana').toBe(false);
    // Y tampoco se abre por su id: el filtro no es sólo de la lista.
    expect((await o('ana', `/ordenes/${oc2}`)).estado).toBe(403);
    // Beto sí abre la de Ana, pero porque es contador, no porque sea suya.
    expect((await o('beto', `/ordenes/${oc1}`)).estado).toBe(200);
    expect((await o('caro', `/ordenes/${oc1}`)).estado, 'Caro no es contador ni la pidió').toBe(403);
  });

  it('4 · al pagar se crea UN egreso, el saldo baja el monto exacto y la orden queda pagada', async () => {
    const antes = await o('mike', `/movimientos?cuenta_id=${cuenta}`);
    const r = await o('beto', `/ordenes/${oc1}/pagar`, { method: 'POST', json: { cuenta_id: cuenta, fecha: dia(0) } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.orden.estado).toBe('pagada');
    expect(r.data.orden.movimiento_id).toBe(r.data.movimiento.id);
    expect(r.data.movimiento.tipo).toBe('egreso');
    expect(r.data.movimiento.monto).toBe(1_160_00);
    expect(r.data.movimiento.facturado, 'con factura esperada, pero el CFDI todavía no llega').toBe(false);

    const despues = await o('mike', `/movimientos?cuenta_id=${cuenta}`);
    expect(despues.data.filas.length - antes.data.filas.length, 'exactamente un egreso, no dos').toBe(1);
    const suma = despues.data.filas.filter((m: any) => m.tipo === 'egreso').reduce((s: number, m: any) => s + m.monto, 0);
    expect(suma).toBe(1_160_00);
  });

  it('0.56.1 · del egreso se llega a la orden, con su historia y sus papeles', async () => {
    const pagada = await o('beto', `/ordenes/${oc1}`);
    expect(pagada.estado, JSON.stringify(pagada)).toBe(200);
    const mid = pagada.data.orden.movimiento_id;
    expect(mid, JSON.stringify(pagada.data.orden)).toBeTruthy();
    const r = await o('mike', `/ordenes/de-movimiento/${mid}`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.orden.id).toBe(oc1);
    expect(r.data.orden.estado).toBe('pagada');
    expect(Array.isArray(r.data.eventos) && r.data.eventos.some((e: any) => e.que === 'pagada')).toBe(true);
    expect(Array.isArray(r.data.archivos)).toBe(true);
    const nada = await o('mike', '/ordenes/de-movimiento/no-es-de-una-orden');
    expect(nada.estado).toBe(404);
  });

  it('5 · la misma orden no se paga dos veces: nada de dobles egresos', async () => {
    const otra = await o('beto', `/ordenes/${oc1}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(otra.estado).toBe(409);
    expect(otra.error).toBe('orden_no_esta_en_buzon');
    const movs = await o('mike', `/movimientos?cuenta_id=${cuenta}`);
    expect(movs.data.filas.filter((m: any) => m.categoria === 'orden_de_compra').length).toBe(1);
  });

  it('6 · con partida existente sube lo pagado de la partida y el compromiso NO cambia', async () => {
    const antes = (await o('mike', `/proyectos/${proyecto}`)).data;
    const oc = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_id: proveedor, proveedor_nombre: 'Maderas SA',
      concepto: 'Madera de la partida', monto: 200_00, proyecto_id: proyecto, partida_id: partida,
    } });
    expect(oc.estado).toBe(201);
    const pago = await o('beto', `/ordenes/${oc.data.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(pago.estado, JSON.stringify(pago)).toBe(200);

    const despues = (await o('mike', `/proyectos/${proyecto}`)).data;
    expect(despues.compromiso, 'ya estaba comprometido: no se cuenta dos veces').toBe(antes.compromiso);
    const par = (await o('mike', `/partidas/${partida}`)).data;
    expect(par.monto_pagado).toBe(200_00);
    expect(par.estado).toBe('parcial');
  });

  it('7 · sin partida que le quede, se crea una y el compromiso sube ese monto una sola vez', async () => {
    const antes = (await o('mike', `/proyectos/${proyecto}`)).data;
    const oc = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'Vidrios del Norte',
      concepto: 'Cristal templado', monto: 900_00, proyecto_id: proyecto,
    } });
    const pago = await o('beto', `/ordenes/${oc.data.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(pago.estado, JSON.stringify(pago)).toBe(200);
    expect(pago.data.partida_id, 'se creó la partida').toBeTruthy();

    const despues = (await o('mike', `/proyectos/${proyecto}`)).data;
    expect(despues.compromiso - antes.compromiso, 'sube exactamente el monto, una vez').toBe(900_00);

    /* EL CASO DE HOLCIM (Mike, 1-oct-2026): proveedor escrito a mano, sin
     * fila en `proveedores`. La partida nace sin proveedor_id y el egreso con
     * contraparte «otro»; hasta el 0.58.0 no cuadraban y la partida se
     * quedaba «pendiente» con $0 ya pagada. */
    const par = (await o('mike', `/partidas/${pago.data.partida_id}`)).data;
    expect(par.proveedor_id).toBeNull();
    expect(par.monto_pagado, 'lo pagado es el monto de la orden').toBe(900_00);
    expect(par.estado).toBe('pagado');
    expect(pago.data.movimiento.partida_id, 'el egreso sabe su partida').toBe(pago.data.partida_id);
    const porPartida = await o('mike', `/movimientos?partida_id=${pago.data.partida_id}`);
    expect(porPartida.data.filas.map((m: any) => m.id)).toEqual([pago.data.movimiento.id]);
  });

  it('7b · una partida sin proveedor registrado, escogida al pedir, también queda pagada', async () => {
    const suelta = await o('mike', '/partidas', { method: 'POST', app: 'dash101', json: {
      proyecto_id: proyecto, proveedor_nombre: 'Flete Güero', concepto: 'Flete', monto_acordado: 100_00,
    } });
    expect(suelta.estado, JSON.stringify(suelta)).toBe(201);
    const oc = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'Flete Güero', concepto: 'Flete de la solera', monto: 60_00,
      proyecto_id: proyecto, partida_id: suelta.data.id,
    } });
    expect(oc.estado, JSON.stringify(oc)).toBe(201);
    const pago = await o('beto', `/ordenes/${oc.data.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(pago.estado, JSON.stringify(pago)).toBe(200);
    const par = (await o('mike', `/partidas/${suelta.data.id}`)).data;
    expect(par.monto_pagado).toBe(60_00);
    expect(par.estado).toBe('parcial');
    /* Y lo pagado a mano a nombre del proveedor de otra partida no se le
     * cuelga a ésta: sin proveedor_id, sólo cuentan sus propios egresos. */
    await o('beto', `/ordenes/${(await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'Flete Güero', concepto: 'Otro flete', monto: 40_00, proyecto_id: proyecto, partida_id: suelta.data.id,
    } })).data.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect((await o('mike', `/partidas/${suelta.data.id}`)).data.estado).toBe('pagado');
  });

  it('8 · gasto general: el egreso va sin proyecto y ningún proyecto se mueve', async () => {
    const antes = (await o('mike', `/proyectos/${proyecto}`)).data;
    const oc = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'Papelería', concepto: 'Tóner', monto: 150_00,
    } });
    const pago = await o('beto', `/ordenes/${oc.data.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(pago.estado).toBe(200);
    expect(pago.data.movimiento.proyecto_id, 'sin proyecto').toBeFalsy();
    const despues = (await o('mike', `/proyectos/${proyecto}`)).data;
    expect(despues.cobrado).toBe(antes.cobrado);
    expect(despues.pagado_prov).toBe(antes.pagado_prov);
    expect(despues.compromiso).toBe(antes.compromiso);
    oc4 = oc.data.id;
  });

  it('9 · devuelta con motivo, corregida y de vuelta al buzón: mismo folio y toda su historia', async () => {
    const oc = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'Aceros', concepto: 'Perfil', monto: 400_00,
    } });
    oc3 = oc.data.id;
    const folio = oc.data.folio;

    expect((await o('beto', `/ordenes/${oc3}/devolver`, { method: 'POST', json: {} })).estado, 'sin motivo no se devuelve').toBe(400);
    const dev = await o('beto', `/ordenes/${oc3}/devolver`, { method: 'POST', json: { nota: 'Falta la cotización firmada' } });
    expect(dev.estado, JSON.stringify(dev)).toBe(200);
    expect(dev.data.orden.estado).toBe('devuelta');
    expect(dev.data.orden.nota_contador).toMatch(/cotización/);

    expect((await o('beto', `/ordenes/${oc3}`, { method: 'PATCH', json: { monto: 450_00 } })).estado, 'sólo quien la pidió corrige').toBe(403);
    const corr = await o('ana', `/ordenes/${oc3}`, { method: 'PATCH', json: { monto: 450_00, concepto: 'Perfil de acero' } });
    expect(corr.estado, JSON.stringify(corr)).toBe(200);
    expect(corr.data.estado, 'vuelve al buzón').toBe('en_buzon');
    expect(corr.data.folio, 'MISMO folio').toBe(folio);
    expect(corr.data.monto).toBe(450_00);
    expect(corr.data.nota_contador, 'el motivo viejo ya no aplica').toBeFalsy();

    const det = await o('ana', `/ordenes/${oc3}`);
    expect(det.data.eventos.map((e: any) => e.que)).toEqual(['creada', 'devuelta', 'corregida']);
  });

  it('10 · el correo se encola al solicitante; fuera de producción no sale, y eso se dice', async () => {
    const pago = await o('beto', `/ordenes/${oc3}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(pago.estado).toBe(200);
    expect(pago.data.correo.para, 'va al correo copiado en la orden').toBe(GENTE.ana.correo);
    expect(pago.data.correo.enviado, 'en pruebas NO sale: rebotes y reputación del dominio').toBe(false);
    /* Mike, 29-sep: «cuando le doy click en “ver comprobante” me manda a una
     * URL que despliega {"ok":false,"error":"sin_sesion"}». La liga iba a la
     * API; tiene que ir a supply101, donde sí hay sesión y se ve la orden. */
    expect(pago.data.correo.url, 'la liga del correo va a supply101, a la orden').toMatch(/^https:\/\/[^/]+\/#\/orden\/[A-Za-z0-9_-]+$/);
    expect(pago.data.correo.url).not.toContain('/orgs/');
    expect(['correo_apagado_fuera_de_produccion', 'correo_no_configurado']).toContain(pago.data.correo.motivo);
  });

  it('0.59.0 · el historial de lo pagado: quien paga lo ve, la más reciente arriba, y suma lo que lista', async () => {
    const r = await o('beto', '/ordenes/pagadas');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.filas.length).toBeGreaterThanOrEqual(4);
    expect(r.data.filas.every((f: any) => f.estado === 'pagada')).toBe(true);
    const fechas = r.data.filas.map((f: any) => String(f.pagada_at));
    expect([...fechas].sort().reverse(), 'la más reciente arriba').toEqual(fechas);
    expect(r.data.filas[0].id, 'la última que se pagó (la 10) encabeza').toBe(oc3);
    expect(r.data.total).toBe(r.data.filas.reduce((s: number, f: any) => s + f.monto, 0));
    const ana = await o('ana', '/ordenes/pagadas');
    expect(ana.estado, 'quien no paga no ve el historial de la empresa').toBe(403);
    const otro = await o('beto', '/ordenes/pagadas?negocio_id=no-existe');
    expect(otro.data.filas.length, '`?negocio_id=` se ignora (0.63.0): es la misma lista').toBe(r.data.filas.length);
    const una = await o('beto', '/ordenes/pagadas?limite=1');
    expect(una.data.filas.length).toBe(1);
    const mal = await o('beto', '/ordenes/pagadas?tipo=chueco');
    expect(mal.estado).toBe(400);
  });

  it('11 · los folios no se repiten con dos órdenes creadas a la vez', async () => {
    const cuerpo = { negocio_id: negocio, proveedor_nombre: 'Varios', concepto: 'A la vez', monto: 100_00 };
    const [a, b, d] = await Promise.all([
      o('ana', '/ordenes', { method: 'POST', json: cuerpo }),
      o('beto', '/ordenes', { method: 'POST', json: cuerpo }),
      o('caro', '/ordenes', { method: 'POST', json: cuerpo }),
    ]);
    const folios = [a.data.folio, b.data.folio, d.data.folio];
    expect(new Set(folios).size, `tres folios distintos: ${folios.join(', ')}`).toBe(3);
  });

  it('el buzón del contador ordena por lo que vence primero y suma lo que hay por pagar', async () => {
    const buzon = await o('beto', '/ordenes/buzon');
    expect(buzon.estado).toBe(200);
    expect(buzon.data.filas.every((f: any) => f.estado === 'en_buzon')).toBe(true);
    const conFecha = buzon.data.filas.filter((f: any) => f.fecha_maxima_pago).map((f: any) => f.fecha_maxima_pago);
    expect([...conFecha].sort()).toEqual(conFecha);
    expect(buzon.data.total).toBe(buzon.data.filas.reduce((s: number, f: any) => s + f.monto, 0));
  });

  it('sólo el dueño reparte la etiqueta de contador, y queda apuntado quién y cuándo', async () => {
    expect((await o('beto', '/ordenes/contadores', { method: 'POST', json: { usuario_id: uAna, valor: true } })).estado).toBe(403);
    expect((await o('ana', '/ordenes/contadores')).estado).toBe(403);

    const lista = await o('mike', '/ordenes/contadores');
    expect(lista.estado).toBe(200);
    expect(lista.data.filas.some((f: any) => f.usuario_id === uBeto && f.es_contador), 'Beto sale marcado').toBe(true);
    /* Salen los MIEMBROS de la empresa aunque nadie haya llenado `personal`:
     * eso es lo que hace posible la decisión 6 en una empresa que sólo usa
     * dash101. */
    for (const g of Object.values(GENTE)) {
      expect(lista.data.filas.some((f: any) => f.correo === g.correo), `${g.correo} sale en la lista`).toBe(true);
    }
    /* Y sale quien está leyendo. Mike entra aquí como superadmin de la suite,
     * no como miembro de esta empresa —es de Taller 101, no de ella—, así que
     * no está en la lista de miembros; aun así tiene que poder marcarse, o una
     * empresa recién dada de alta se queda sin quién pague. */
    expect(lista.data.filas.some((f: any) => f.correo === CORREO), 'quien lee sale en la lista').toBe(true);

    const r = await o('mike', '/ordenes/contadores', { method: 'POST', json: { usuario_id: uAna, valor: true } });
    expect(r.estado).toBe(200);
    pAna = r.data.id;
    expect((await o('ana', '/ordenes/buzon')).estado, 'ya puede pagar').toBe(200);
    // Y se le quita, y surte efecto al momento.
    await o('mike', '/ordenes/contadores', { method: 'POST', json: { personal_id: pAna, valor: false } });
    expect((await o('ana', '/ordenes/buzon')).estado).toBe(403);
  });

  it('el buzón y mis órdenes son de la empresa: `?negocio_id=` ya no acota nada (0.63.0)', async () => {
    /* Hasta 0.62.0 dash101 trabajaba con un negocio activo a la vez y el
     * buzón se pedía por negocio. Ya no hay negocios: una orden que llega
     * con un negocio_id cualquiera es de la empresa, y el buzón y sus
     * TOTALES —que salen de la misma consulta— la traen con las demás. */
    const ajena = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: 'otro-taller', proveedor_nombre: 'Otra', concepto: 'De otro negocio', monto: 700_00,
    } });
    expect(ajena.estado).toBe(201);
    expect('negocio_id' in ajena.data).toBe(false);

    const todo = await o('beto', '/ordenes/buzon');
    const conFiltro = await o('beto', '/ordenes/buzon?negocio_id=otro-taller');
    expect(conFiltro.data.filas.length, 'el filtro se ignora: es el mismo buzón').toBe(todo.data.filas.length);
    expect(conFiltro.data.total).toBe(todo.data.total);
    expect(todo.data.filas.some((f: any) => f.id === ajena.data.id), 'la orden está en el buzón de la empresa').toBe(true);
    expect(todo.data.total).toBe(todo.data.filas.reduce((s: number, f: any) => s + f.monto, 0));

    const mias = await o('ana', '/ordenes?negocio_id=otro-taller');
    expect(mias.data.filas.some((f: any) => f.id === ajena.data.id)).toBe(true);
    expect(mias.data.filas.every((f: any) => !('negocio_id' in f))).toBe(true);
  });

  it('el comprobante del pago viaja con la orden, para quien la pidió', async () => {
    /* La cotización cuelga de la orden y el comprobante cuelga del
     * movimiento. Quien pidió la compra necesita los dos —el segundo es con
     * el que le reclama al proveedor— y no tiene por qué saber que viven en
     * tablas distintas. */
    const o1 = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'Papeles SA', concepto: 'Con comprobante', monto: 200_00,
    } });
    const subir = async (tabla: string, id: string, nombre: string) => {
      const forma = new FormData();
      forma.set('archivo', new File(['x'], nombre, { type: 'image/png' }));
      forma.set('de_tabla', tabla);
      forma.set('de_id', id);
      const r = await pedir('ana', `/orgs/${ORG}/archivos`, { method: 'POST', body: forma });
      expect(r.estado, JSON.stringify(r)).toBe(201);
      return r.data.id as string;
    };
    await subir('ordenes', o1.data.id, 'cotizacion.png');

    const pago = await o('beto', `/ordenes/${o1.data.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(pago.estado).toBe(200);
    await subir('movimientos', pago.data.movimiento.id, 'comprobante.png');

    const vista = await o('ana', `/ordenes/${o1.data.id}`);
    const nombres = vista.data.archivos.map((a: any) => `${a.de}:${a.nombre}`).sort();
    expect(nombres).toEqual(['orden:cotizacion.png', 'pago:comprobante.png']);
  });

  it('lo fiscal es de la empresa entera: el RFC es uno (0.63.0)', async () => {
    /* Hasta 0.62.0 el IVA se pedía por negocio, porque el RFC vivía ahí. Ya
     * no hay negocios: `?negocio_id=` se ignora y las cifras son las de la
     * empresa, que es con la que se entera al SAT. */
    const hoy = dia(0);
    const uuid = `PRUEBA-NEG-${Date.now()}`;
    const c = await o('mike', '/fiscal/cfdi', { method: 'POST', json: {
      negocio_id: 'fiscal-aparte', uuid, tipo: 'ingreso', subtotal: 1_000_00, iva: 160_00, total: 1_160_00, fecha: hoy,
    } });
    expect(c.estado, JSON.stringify(c)).toBe(201);
    expect('negocio_id' in c.data).toBe(false);

    const todo = await o('mike', `/fiscal/iva?desde=${hoy}&hasta=${hoy}`);
    expect(todo.data.trasladado, 'el de la empresa entera').toBeGreaterThanOrEqual(160_00);
    const conFiltro = await o('mike', `/fiscal/iva?desde=${hoy}&hasta=${hoy}&negocio_id=fiscal-aparte`);
    expect(conFiltro.data.trasladado, 'el filtro se ignora').toBe(todo.data.trasladado);

    const lista = await o('mike', `/fiscal/cfdi?desde=${hoy}&hasta=${hoy}&negocio_id=fiscal-aparte`);
    expect(lista.data.filas.some((f: any) => f.uuid === uuid)).toBe(true);
    expect(lista.data.filas.length).toBe((await o('mike', `/fiscal/cfdi?desde=${hoy}&hasta=${hoy}`)).data.filas.length);

    const cuadre = await o('mike', `/fiscal/cuadre?desde=${hoy}&hasta=${hoy}&negocio_id=fiscal-aparte`);
    expect(cuadre.data.egresos.total).toBe((await o('mike', `/fiscal/cuadre?desde=${hoy}&hasta=${hoy}`)).data.egresos.total);
  });

  it('quien abre como dueño sin ser miembro se puede marcar a sí mismo', async () => {
    // El superadmin no está en la lista de miembros de la empresa, pero sí
    // pasó la puerta de dueño de ESTA empresa. Sin esto, una empresa recién
    // dada de alta no tiene a nadie que pueda pagar.
    const yo = (await pedir('mike', '/yo', { app: '' })).data.usuario.id;
    const r = await o('mike', '/ordenes/contadores', { method: 'POST', json: { usuario_id: yo, valor: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.es_contador).toBe(true);
    expect((await o('mike', '/ordenes/buzon')).estado, 'ya puede pagar').toBe(200);
    // Y se deja como estaba, para no dejarle el buzón abierto a las que siguen.
    await o('mike', '/ordenes/contadores', { method: 'POST', json: { usuario_id: yo, valor: false } });
    expect((await o('mike', '/ordenes/buzon')).estado).toBe(403);
  });

  it('el desglose que se manda a mano tiene que cuadrar con el total', async () => {
    const r = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, proveedor_nombre: 'X', concepto: 'Desglose malo', monto: 1_000_00,
      con_factura: true, subtotal: 900_00, iva: 50_00,
    } });
    expect(r.estado).toBe(400);
    expect(r.error).toBe('desglose_no_cuadra');
  });

  it('sin factura no se inventa IVA: el subtotal es el total y el IVA es cero', async () => {
    // La abre Ana, que la pidió: Mike entra como superadmin y no es contador
    // de esta empresa, así que no tiene por qué ver órdenes ajenas.
    const det = await o('ana', `/ordenes/${oc4}`);
    expect(det.data.orden.con_factura).toBe(false);
    expect(det.data.orden.iva).toBe(0);
    expect(det.data.orden.subtotal).toBe(det.data.orden.monto);
  });
});

describe('20 · contabilidad fiscal (los casos del encargo)', () => {
  let movConFactura = '', movSinFactura = '', cfdiTarde = '', movA = '', movB = '';
  const hoy = dia(0);
  const rango = `?desde=${dia(-30)}&hasta=${dia(30)}`;

  beforeAll(async () => {
    // Dos egresos sueltos, capturados como cualquier gasto.
    movSinFactura = (await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'egreso', monto: 500_00, fecha: hoy, cuenta_id: cuenta, descripcion: 'Sin factura',
    } })).data.id;
    movConFactura = (await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'egreso', monto: 1_160_00, fecha: hoy, cuenta_id: cuenta, descripcion: 'Con factura',
    } })).data.id;
    movA = (await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'egreso', monto: 580_00, fecha: hoy, cuenta_id: cuenta, descripcion: 'Parte A',
    } })).data.id;
    movB = (await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'egreso', monto: 580_00, fecha: hoy, cuenta_id: cuenta, descripcion: 'Parte B',
    } })).data.id;
  });

  it('12 · el IVA del mes sólo cuenta lo facturado', async () => {
    const antes = (await o('mike', `/fiscal/iva${rango}`)).data;
    const c = await o('mike', '/fiscal/cfdi', { method: 'POST', json: {
      negocio_id: negocio, uuid: 'AAAA1111-0000-0000-0000-000000000001', rfc: 'XAXX010101000',
      tipo: 'egreso', subtotal: 1_000_00, iva: 160_00, total: 1_160_00, fecha: hoy,
    } });
    expect(c.estado, JSON.stringify(c)).toBe(201);
    cfdiTarde = c.data.id;
    const l = await o('mike', `/fiscal/cfdi/${cfdiTarde}/ligar`, { method: 'POST', json: { movimiento_id: movConFactura } });
    expect(l.estado, JSON.stringify(l)).toBe(200);

    const despues = (await o('mike', `/fiscal/iva${rango}`)).data;
    expect(despues.acreditable - antes.acreditable, 'sube sólo el IVA de la factura').toBe(160_00);
    expect((await o('mike', `/movimientos/${movSinFactura}`)).data.facturado, 'el otro sigue sin facturar').toBe(false);
  });

  it('13 · la factura que llega DESPUÉS del pago se cuelga del movimiento que ya existía', async () => {
    const mov = (await o('mike', `/movimientos/${movConFactura}`)).data;
    expect(mov.facturado, 'el pago ya existía y ahora es fiscal').toBe(true);
    expect(mov.uuid_cfdi).toBe('AAAA1111-0000-0000-0000-000000000001');
    expect(mov.iva).toBe(160_00);
    // Y no se creó otro movimiento: sigue siendo el mismo id.
    const egresos = (await o('mike', `/movimientos?tipo=egreso`)).data.filas;
    expect(egresos.filter((m: any) => m.id === movConFactura).length).toBe(1);
  });

  it('14 · un CFDI cubriendo dos pagos y dos CFDI cubriendo un pago: los montos cuadran', async () => {
    const uno = await o('mike', '/fiscal/cfdi', { method: 'POST', json: {
      negocio_id: negocio, uuid: 'BBBB2222-0000-0000-0000-000000000002', tipo: 'egreso',
      subtotal: 1_000_00, iva: 160_00, total: 1_160_00, fecha: hoy,
    } });
    const a = await o('mike', `/fiscal/cfdi/${uno.data.id}/ligar`, { method: 'POST', json: { movimiento_id: movA, monto_aplicado: 580_00 } });
    const b = await o('mike', `/fiscal/cfdi/${uno.data.id}/ligar`, { method: 'POST', json: { movimiento_id: movB, monto_aplicado: 580_00 } });
    expect(b.estado).toBe(200);
    expect(b.data.aplicado_total, 'los dos pagos suman el total de la factura').toBe(1_160_00);
    expect(a.data.movimiento.facturado).toBe(true);
    expect((await o('mike', `/movimientos/${movB}`)).data.facturado).toBe(true);

    // Y al revés: dos facturas sobre un mismo pago.
    const dos = await o('mike', '/fiscal/cfdi', { method: 'POST', json: {
      negocio_id: negocio, uuid: 'CCCC3333-0000-0000-0000-000000000003', tipo: 'egreso',
      subtotal: 250_00, iva: 40_00, total: 290_00, fecha: hoy,
    } });
    const l = await o('mike', `/fiscal/cfdi/${dos.data.id}/ligar`, { method: 'POST', json: { movimiento_id: movA, monto_aplicado: 290_00 } });
    expect(l.estado).toBe(200);
    const mov = (await o('mike', `/movimientos/${movA}`)).data;
    expect(mov.facturado).toBe(true);
    expect(mov.uuid_cfdi, 'con dos facturas ningún UUID solo dice la verdad').toBeFalsy();
  });

  it('15 · un UUID repetido en la misma empresa se rechaza', async () => {
    const r = await o('mike', '/fiscal/cfdi', { method: 'POST', json: {
      negocio_id: negocio, uuid: 'AAAA1111-0000-0000-0000-000000000001', tipo: 'egreso',
      subtotal: 1_000_00, iva: 160_00, total: 1_160_00, fecha: hoy,
    } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('uuid_repetido');
    expect(r.detalle.ya_capturada).toBe(cfdiTarde);
  });

  it('16 · un CFDI cancelado sale del IVA del mes y aparece en su propia lista', async () => {
    const antes = (await o('mike', `/fiscal/iva${rango}`)).data;
    const r = await o('mike', `/fiscal/cfdi/${cfdiTarde}/cancelar`, { method: 'POST', json: {} });
    expect(r.estado).toBe(200);
    expect(r.data.estado).toBe('cancelada');
    const despues = (await o('mike', `/fiscal/iva${rango}`)).data;
    expect(antes.acreditable - despues.acreditable, 'se le resta su IVA').toBe(160_00);
    expect(despues.facturas.canceladas).toBeGreaterThanOrEqual(1);
    const lista = await o('mike', `/fiscal/cfdi${rango}&estado=cancelada`);
    expect(lista.data.filas.some((f: any) => f.id === cfdiTarde)).toBe(true);
    // El pago que sólo ella respaldaba vuelve a estar sin facturar: el pago
    // ocurrió, la factura ya no vale.
    expect((await o('mike', `/movimientos/${movConFactura}`)).data.facturado).toBe(false);
  });

  it('17 · con retención, el IVA acreditable es el neto y no el bruto', async () => {
    const antes = (await o('mike', `/fiscal/iva${rango}`)).data;
    const c = await o('mike', '/fiscal/cfdi', { method: 'POST', json: {
      negocio_id: negocio, uuid: 'DDDD4444-0000-0000-0000-000000000004', tipo: 'egreso',
      subtotal: 1_000_00, iva: 160_00, retenciones: 106_67, total: 1_053_33, fecha: hoy,
    } });
    expect(c.estado).toBe(201);
    const despues = (await o('mike', `/fiscal/iva${rango}`)).data;
    expect(despues.acreditable - antes.acreditable, 'IVA menos lo retenido').toBe(160_00 - 106_67);
    expect(despues.retenciones - antes.retenciones).toBe(106_67);
  });

  it('lo facturado contra lo real dice qué anda fuera, y la lista de pendientes persigue las que faltan', async () => {
    const cuadre = (await o('mike', `/fiscal/cuadre${rango}`)).data;
    expect(cuadre.egresos.total).toBeGreaterThan(0);
    expect(cuadre.egresos.fuera).toBe(cuadre.egresos.total - cuadre.egresos.facturado);

    // La orden 1 se pagó con `con_factura` y su CFDI nunca llegó.
    const pend = (await o('mike', '/fiscal/pendientes')).data.filas;
    expect(pend.length, 'hay al menos una esperando factura').toBeGreaterThan(0);
    expect(pend.every((m: any) => m.facturado === false || m.facturado === 0)).toBe(true);
    expect(pend[0].orden_folio).toMatch(/^OC-/);
  });

  it('el IVA del mes acepta ?mes=AAAA-MM y calcula el último día solo', async () => {
    const r = await o('mike', '/fiscal/iva?mes=2026-02');
    expect(r.estado).toBe(200);
    expect(r.data.desde).toBe('2026-02-01');
    expect(r.data.hasta, 'febrero de 2026 tiene 28 días').toBe('2026-02-28');
  });

  it('lo fiscal es dinero: un cliente del portal no lo abre', async () => {
    const inv = await o('mike', '/clientes/invitar', { method: 'POST', json: { correo: 'cliente-oc@ejemplo.mx', nombre: 'Cliente Uno', usar_existente: true } });
    expect([200, 201]).toContain(inv.estado);
    await entrar('clienteoc', 'cliente-oc@ejemplo.mx');
    expect((await o('clienteoc', '/fiscal/iva', { app: 'peek101' })).estado).toBe(403);
    expect((await o('clienteoc', '/ordenes', { app: 'peek101' })).estado).toBe(403);
  });
});

/* ─────────────── 0.47.0 · reembolsos ───────────────
 * Mike, 28-sep-2026: «que el trabajador pueda pedir reembolsos y en dash le
 * aparezcan (similar a las Órdenes de compra) (…) poner una opción en el
 * tipo de orden si es reembolso o compra (…) si el usuario no está
 * autorizado para compras, que solo le diga “tu usuario no está autorizado
 * para compras” y solo le permita ingresar un reembolso (…) los movimientos
 * se registrarán como reembolso o gasto pero son salidas de dinero las 2».
 *
 * Lo que de verdad miden, que no se ve a mano: que un reembolso pagado deje
 * UN egreso con la categoría correcta y a nombre de la persona (no de un
 * proveedor); que el buzón por pestaña sume SÓLO lo suyo; que la cifra del
 * inicio cuadre con el buzón; y que la puerta de supply101 deje pasar a quien
 * no tiene la llave de compras, pero sólo a reembolsos. */
describe('0.47.0 · reembolsos: la misma orden, de otro tipo', () => {
  let re1 = '', re2 = '';
  const supply = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => o(quien, ruta, { ...op, app: 'supply101' });

  it('un reembolso nace en el buzón con folio RE- y tipo reembolso; lo de antes sigue siendo compra', async () => {
    const r = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'reembolso', concepto: 'Gasolina de la camioneta', monto: 850_00, con_factura: false,
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.tipo).toBe('reembolso');
    expect(r.data.folio).toMatch(/^RE-\d{6}$/);
    expect(r.data.estado).toBe('en_buzon');
    re1 = r.data.id;

    const compra = await o('ana', '/ordenes', { method: 'POST', json: { negocio_id: negocio, concepto: 'Lijas', monto: 120_00 } });
    expect(compra.data.tipo, 'sin tipo, es compra').toBe('compra');
    expect(compra.data.folio).toMatch(/^OC-/);

    const raro = await o('ana', '/ordenes', { method: 'POST', json: { negocio_id: negocio, tipo: 'prestamo', concepto: 'x', monto: 1_00 } });
    expect(raro.estado).toBe(400);
    expect(raro.error).toBe('tipo_invalido');
  });

  it('el buzón por pestaña: ?tipo=reembolso trae sólo reembolsos y suma sólo lo suyo; sin tipo, todo', async () => {
    const todo = await o('beto', '/ordenes/buzon');
    const re = await o('beto', '/ordenes/buzon?tipo=reembolso');
    const oc = await o('beto', '/ordenes/buzon?tipo=compra');
    expect(re.estado).toBe(200);
    expect(re.data.filas.length).toBeGreaterThan(0);
    expect(re.data.filas.every((f: any) => f.tipo === 'reembolso')).toBe(true);
    expect(oc.data.filas.every((f: any) => f.tipo === 'compra')).toBe(true);
    expect(re.data.total).toBe(re.data.filas.reduce((s: number, f: any) => s + f.monto, 0));
    expect(re.data.filas.length + oc.data.filas.length, 'las dos pestañas son el buzón entero').toBe(todo.data.filas.length);
    expect(re.data.total + oc.data.total).toBe(todo.data.total);
    expect((await o('beto', '/ordenes/buzon?tipo=otra')).estado).toBe(400);
  });

  it('el resumen del inicio cuadra con el buzón, y lo lee quien ve dinero aunque no pague', async () => {
    const re = await o('beto', '/ordenes/buzon?tipo=reembolso');
    const oc = await o('beto', '/ordenes/buzon?tipo=compra');
    // Ana ve dinero (es miembro) pero no es contadora: el buzón le dice que
    // no y el resumen sí, porque es una cifra del tablero, no la bandeja.
    expect((await o('ana', '/ordenes/buzon')).estado).toBe(403);
    const r = await o('ana', '/ordenes/resumen');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.reembolsos.total).toBe(re.data.total);
    expect(r.data.reembolsos.cuantas).toBe(re.data.filas.length);
    expect(r.data.compras.total).toBe(oc.data.total);
    // `?negocio_id=` se ignora (0.63.0): es la cifra de la empresa.
    const igual = await o('ana', '/ordenes/resumen?negocio_id=no-existe');
    expect(igual.data).toEqual(r.data);
  });

  it('al pagar un reembolso el egreso es UNO, categoría reembolso y a nombre de quien lo pidió', async () => {
    const antes = await o('mike', `/movimientos?cuenta_id=${cuenta}`);
    const r = await o('beto', `/ordenes/${re1}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.orden.estado).toBe('pagada');
    expect(r.data.movimiento.tipo, 'es una salida de dinero, como una compra').toBe('egreso');
    expect(r.data.movimiento.monto).toBe(850_00);
    expect(r.data.movimiento.categoria).toBe('reembolso');
    expect(r.data.movimiento.contraparte_nombre, 'se le paga a la persona, no a un proveedor').toBe(GENTE.ana.nombre);
    expect(r.data.movimiento.descripcion).toMatch(/^RE-\d{6} · Gasolina/);
    const despues = await o('mike', `/movimientos?cuenta_id=${cuenta}`);
    expect(despues.data.filas.length - antes.data.filas.length).toBe(1);
    expect((await o('beto', `/ordenes/${re1}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } })).estado, 'no se paga dos veces').toBe(409);
    expect((await o('beto', '/ordenes/buzon?tipo=reembolso')).data.filas.some((f: any) => f.id === re1), 'ya no está en la pestaña').toBe(false);
  });

  it('un reembolso se devuelve, se corrige y vuelve con el MISMO folio, igual que una compra', async () => {
    const r = await o('ana', '/ordenes', { method: 'POST', json: { negocio_id: negocio, tipo: 'reembolso', concepto: 'Taxi', monto: 200_00 } });
    re2 = r.data.id;
    const dev = await o('beto', `/ordenes/${re2}/devolver`, { method: 'POST', json: { nota: 'Sube el ticket' } });
    expect(dev.estado).toBe(200);
    const corr = await o('ana', `/ordenes/${re2}`, { method: 'PATCH', json: { monto: 210_00 } });
    expect(corr.estado, JSON.stringify(corr)).toBe(200);
    expect(corr.data.folio).toBe(r.data.folio);
    expect(corr.data.tipo, 'corregirlo no lo vuelve compra').toBe('reembolso');
    expect(corr.data.estado).toBe('en_buzon');
  });

  it('sin la llave de compras, supply101 abre pero sólo para reembolsos: «tu usuario no está autorizado para compras»', async () => {
    // Antes de 0.47.0 esto era `app_no_permitida` en la puerta.
    const lista = await supply('dora', '/ordenes');
    expect(lista.estado, JSON.stringify(lista)).toBe(200);
    const permisos = await supply('dora', '/ordenes/permisos');
    expect(permisos.data.puede_comprar).toBe(false);
    expect(permisos.data.puede_pagar).toBe(false);

    const compra = await supply('dora', '/ordenes', { method: 'POST', json: { negocio_id: negocio, concepto: 'Clavos', monto: 50_00 } });
    expect(compra.estado).toBe(403);
    expect(compra.error).toBe('compras_no_autorizadas');
    expect(compra.detalle.mensaje).toBe('Tu usuario no está autorizado para compras');

    const re = await supply('dora', '/ordenes', { method: 'POST', json: { negocio_id: negocio, tipo: 'reembolso', concepto: 'Pasaje', monto: 60_00 } });
    expect(re.estado, JSON.stringify(re)).toBe(201);
    expect(re.data.folio).toMatch(/^RE-/);

    // En las demás apps la puerta sigue cerrada como siempre: Dora no tiene
    // quell101, y quell101 no tiene excepción.
    const otra = await o('dora', '/ordenes', { app: 'quell101' });
    expect(otra.estado).toBe(403);
    // Y quien SÍ tiene la llave sigue pudiendo comprar desde supply101.
    const ana = await supply('ana', '/ordenes/permisos');
    expect(ana.estado).toBe(200);
    expect(ana.data.puede_comprar).toBe(true);
  });
});

/* 0.67.0 · Mike, 5-oct-2026: «en las órdenes de compra, ahí mismo en la
 * orden (desde dash) aparezcan los datos bancarios o de pago del proveedor
 * para hacer ese pago». La orden trae `proveedor` con sus cuentas. */
describe('0.67.0 · los datos de pago del proveedor vienen en la orden', () => {
  // Una CLABE que cuadra: 17 dígitos y su verificador calculado.
  const clabeDe = (base17: string) => {
    const pesos = [3, 7, 1];
    let suma = 0;
    for (let i = 0; i < 17; i++) suma += (Number(base17[i]) * pesos[i % 3]) % 10;
    return base17 + String((10 - (suma % 10)) % 10);
  };
  const PRINCIPAL = clabeDe('01218000555566667');
  const DOLARES = clabeDe('00218000111122223');
  let herrajes = '';

  it('una orden a un proveedor dado de alta trae su ficha de pago y todas sus cuentas', async () => {
    const alta = await o('mike', '/proveedores', { method: 'POST', json: { nombre: 'Herrajes del Norte', rfc: 'HNO010101AB1', correo: 'pagos@herrajes.mx', terminos_pago: '50 % anticipo', clabe: PRINCIPAL, banco: 'Banorte', beneficiario: 'Herrajes del Norte SA' } });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
    herrajes = alta.data.id;
    const otra = await o('mike', '/proveedor_cuentas', { method: 'POST', json: { proveedor_id: herrajes, alias: 'Dólares', clabe: DOLARES, banco: 'BBVA', beneficiario: 'Herrajes del Norte SA', notas: 'sólo para importaciones' } });
    expect(otra.estado, JSON.stringify(otra)).toBe(201);

    const oc = await o('ana', '/ordenes', { method: 'POST', json: { proveedor_id: herrajes, proveedor_nombre: 'Herrajes del Norte', concepto: 'Bisagras', monto: 2_320_00, con_factura: true } });
    expect(oc.estado, JSON.stringify(oc)).toBe(201);

    for (const quien of ['ana', 'beto'] as const) {   // quien la pidió y quien paga
      const r = await o(quien, `/ordenes/${oc.data.id}`);
      expect(r.estado, JSON.stringify(r)).toBe(200);
      const p = r.data.proveedor;
      expect(p, `${quien} ve al proveedor`).toBeTruthy();
      expect(p).toMatchObject({ id: herrajes, nombre: 'Herrajes del Norte', rfc: 'HNO010101AB1', correo: 'pagos@herrajes.mx', terminos_pago: '50 % anticipo' });
      // Las cuentas: la principal (de la ficha) y la otra, sin repetir la principal.
      expect(p.cuentas.map((c: any) => c.clabe).sort()).toEqual([PRINCIPAL, DOLARES].sort());
      const principal = p.cuentas.find((c: any) => c.clabe === PRINCIPAL);
      expect(principal).toMatchObject({ alias: 'Principal', banco: 'Banorte', beneficiario: 'Herrajes del Norte SA' });
      const dolares = p.cuentas.find((c: any) => c.clabe === DOLARES);
      expect(dolares).toMatchObject({ alias: 'Dólares', banco: 'BBVA', notas: 'sólo para importaciones' });
      // Para pagar, no la ficha entera.
      expect('direccion' in p).toBe(false);
      expect('maps_url' in p).toBe(false);
    }
  });

  it('una orden con el proveedor escrito a mano no tiene de dónde: proveedor null', async () => {
    const oc = await o('ana', '/ordenes', { method: 'POST', json: { proveedor_nombre: 'El de la esquina', concepto: 'Lijas', monto: 150_00 } });
    expect(oc.estado, JSON.stringify(oc)).toBe(201);
    const r = await o('ana', `/ordenes/${oc.data.id}`);
    expect(r.estado).toBe(200);
    expect(r.data.proveedor).toBeNull();
  });
});

/* 0.86.0 · Cancelar una orden que ya no se necesita. Mike, 9-oct-2026: «en
 * supply, hay que poner un botón para cancelar una orden que ya no se
 * necesita». Lo que de verdad importa medir: que sólo la cancele quien la
 * pidió, que una pagada no se cancele nunca, y que una cancelada deje de
 * contar como dinero que se debe —fuera del buzón, de sus totales y del
 * resumen del inicio— sin desaparecer de la lista de quien la pidió. */
describe('0.86.0 · cancelar una orden que ya no se necesita', () => {
  let enBuzon = '', devuelta = '';

  const pedirUna = async (concepto: string, monto: number) => {
    const r = await o('ana', '/ordenes', { method: 'POST', json: { proveedor_nombre: 'Ferretería', concepto, monto, fecha_maxima_pago: dia(2) } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    return r.data as { id: string; folio: string; monto: number };
  };

  it('quien la pidió cancela una orden en el buzón, con su porqué, y sigue con el mismo folio', async () => {
    const oc = await pedirUna('Clavos que ya no hacen falta', 321_00);
    enBuzon = oc.id;
    const r = await o('ana', `/ordenes/${oc.id}/cancelar`, { method: 'POST', json: { nota: '  Ya los trajo el cliente  ' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.estado).toBe('cancelada');
    expect(r.data.folio, 'el mismo papel, con el mismo número').toBe(oc.folio);
    expect(r.data.monto).toBe(321_00);
    expect(r.data.actualizado_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.data.nota_contador, 'el porqué de quien cancela no es nota de quien paga').toBeNull();
    expect(r.data.movimiento_id, 'no hay egreso').toBeNull();
    expect('correo' in r.data, 'no manda correo').toBe(false);
  });

  it('queda apuntado en su historia: quién, cuándo y por qué', async () => {
    const r = await o('ana', `/ordenes/${enBuzon}`);
    expect(r.estado).toBe(200);
    expect(r.data.eventos.map((e: any) => e.que)).toEqual(['creada', 'cancelada']);
    const ev = r.data.eventos[1];
    expect(ev.quien_usuario_id).toBe(uAna);
    expect(ev.quien_nombre).toBe(GENTE.ana.correo);
    expect(ev.nota, 'el porqué, ya sin espacios de sobra').toBe('Ya los trajo el cliente');
    expect(ev.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('quien la pidió cancela una devuelta, sin porqué, y lo que dijo quien paga sigue dicho', async () => {
    const oc = await pedirUna('Bisagras', 88_00);
    devuelta = oc.id;
    const dev = await o('beto', `/ordenes/${oc.id}/devolver`, { method: 'POST', json: { nota: 'Falta la cotización' } });
    expect(dev.estado, JSON.stringify(dev)).toBe(200);
    const r = await o('ana', `/ordenes/${oc.id}/cancelar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.estado).toBe('cancelada');
    expect(r.data.nota_contador, 'nota_contador no se toca').toBe('Falta la cotización');
    const det = await o('ana', `/ordenes/${oc.id}`);
    expect(det.data.eventos.map((e: any) => e.que)).toEqual(['creada', 'devuelta', 'cancelada']);
    expect(det.data.eventos[2].nota, 'sin porqué, la historia no inventa uno').toBeNull();
  });

  it('nadie más la cancela, ni quien paga: 403 solo_quien_la_pidio', async () => {
    const oc = await pedirUna('Lijas de Ana', 45_00);
    for (const quien of ['beto', 'caro', 'mike']) {
      const r = await o(quien, `/ordenes/${oc.id}/cancelar`, { method: 'POST', json: { nota: 'no es mía' } });
      expect(r.estado, `${quien}: ${JSON.stringify(r)}`).toBe(403);
      expect(r.error).toBe('sin_permiso');
      expect(r.detalle).toEqual({ motivo: 'solo_quien_la_pidio' });
    }
    const sigue = await o('ana', `/ordenes/${oc.id}`);
    expect(sigue.data.orden.estado, 'y la orden sigue en el buzón').toBe('en_buzon');
    expect(sigue.data.eventos.map((e: any) => e.que)).toEqual(['creada']);
    expect((await o('ana', '/ordenes/01NOEXISTE/cancelar', { method: 'POST' })).estado).toBe(404);
  });

  it('una pagada no se cancela nunca: 409 con su estado; tampoco una rechazada ni una ya cancelada', async () => {
    const pagada = await pedirUna('Pegamento', 60_00);
    expect((await o('beto', `/ordenes/${pagada.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } })).estado).toBe(200);
    const r = await o('ana', `/ordenes/${pagada.id}/cancelar`, { method: 'POST', json: { nota: 'ya no' } });
    expect(r.estado, JSON.stringify(r)).toBe(409);
    expect(r.error).toBe('orden_no_se_puede_cancelar');
    expect(r.detalle).toEqual({ estado: 'pagada' });
    const sigue = await o('ana', `/ordenes/${pagada.id}`);
    expect(sigue.data.orden.estado, 'sigue pagada').toBe('pagada');
    expect(sigue.data.eventos.map((e: any) => e.que)).toEqual(['creada', 'pagada']);

    const rechazada = await pedirUna('Brochas', 30_00);
    expect((await o('beto', `/ordenes/${rechazada.id}/rechazar`, { method: 'POST', json: { nota: 'Hay en bodega' } })).estado).toBe(200);
    const r2 = await o('ana', `/ordenes/${rechazada.id}/cancelar`, { method: 'POST' });
    expect([r2.estado, r2.detalle]).toEqual([409, { estado: 'rechazada' }]);

    const otraVez = await o('ana', `/ordenes/${enBuzon}/cancelar`, { method: 'POST' });
    expect([otraVez.estado, otraVez.detalle], 'cancelar dos veces').toEqual([409, { estado: 'cancelada' }]);
  });

  it('una cancelada ya no se paga, ni se devuelve, ni se rechaza, ni se corrige', async () => {
    const pagar = await o('beto', `/ordenes/${enBuzon}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect([pagar.estado, pagar.error], 'pagarla sería un egreso de algo que ya no se compra').toEqual([409, 'orden_no_esta_en_buzon']);
    expect((await o('beto', `/ordenes/${enBuzon}/devolver`, { method: 'POST', json: { nota: 'x' } })).estado).toBe(409);
    expect((await o('beto', `/ordenes/${enBuzon}/rechazar`, { method: 'POST', json: { nota: 'x' } })).estado).toBe(409);
    expect((await o('ana', `/ordenes/${devuelta}`, { method: 'PATCH', json: { monto: 99_00 } })).estado, 'corregirla la regresaría al buzón').toBe(409);
  });

  it('el porqué es texto de hasta 500 letras', async () => {
    const oc = await pedirUna('Tornillos', 20_00);
    const largo = await o('ana', `/ordenes/${oc.id}/cancelar`, { method: 'POST', json: { nota: 'x'.repeat(501) } });
    expect([largo.estado, largo.error, largo.detalle?.maximo]).toEqual([400, 'datos_invalidos', 500]);
    const numero = await o('ana', `/ordenes/${oc.id}/cancelar`, { method: 'POST', json: { nota: 12 } });
    expect(numero.estado).toBe(400);
    expect((await o('ana', `/ordenes/${oc.id}`)).data.orden.estado, 'un rechazo no la cancela a medias').toBe('en_buzon');
    const justo = await o('ana', `/ordenes/${oc.id}/cancelar`, { method: 'POST', json: { nota: 'y'.repeat(500) } });
    expect(justo.estado, JSON.stringify(justo).slice(0, 200)).toBe(200);
  });

  it('una cancelada sale del buzón, de sus totales y del resumen; no es dinero que se debe', async () => {
    const antesBuzon = await o('beto', '/ordenes/buzon');
    const antesResumen = await o('ana', '/ordenes/resumen');
    const oc = await pedirUna('Silicón', 777_00);
    const conElla = await o('beto', '/ordenes/buzon');
    expect(conElla.data.filas.some((f: any) => f.id === oc.id)).toBe(true);
    expect(conElla.data.total).toBe(antesBuzon.data.total + 777_00);

    expect((await o('ana', `/ordenes/${oc.id}/cancelar`, { method: 'POST' })).estado).toBe(200);

    const buzon = await o('beto', '/ordenes/buzon');
    expect(buzon.data.filas.some((f: any) => f.id === oc.id), 'ya no está en el buzón').toBe(false);
    for (const id of [enBuzon, devuelta]) expect(buzon.data.filas.some((f: any) => f.id === id)).toBe(false);
    expect(buzon.data.total, 'ni en su total').toBe(antesBuzon.data.total);
    expect(buzon.data.vence_esta_semana, 'ni en lo que vence esta semana').toBe(antesBuzon.data.vence_esta_semana);
    expect((await o('beto', '/ordenes/buzon?tipo=compra')).data.filas.some((f: any) => f.id === oc.id)).toBe(false);
    const resumen = await o('ana', '/ordenes/resumen');
    expect(resumen.data.compras, 'el resumen del inicio no la cuenta').toEqual(antesResumen.data.compras);
    const pagadas = await o('beto', '/ordenes/pagadas');
    expect(pagadas.data.filas.some((f: any) => f.estado === 'cancelada'), 'y no es historial de pagos').toBe(false);
  });

  it('quien la pidió la sigue viendo en su lista, con su estado', async () => {
    const mias = await o('ana', '/ordenes');
    const canceladas = mias.data.filas.filter((f: any) => f.estado === 'cancelada').map((f: any) => f.id);
    expect(canceladas).toEqual(expect.arrayContaining([enBuzon, devuelta]));
    expect((await o('beto', '/ordenes')).data.filas.some((f: any) => f.id === enBuzon), 'y nadie más').toBe(false);
  });
});

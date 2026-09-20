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
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Compras de prueba', apps: { dash: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, g] of Object.entries(GENTE)) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: g.correo, rol: 'staff', nombre: g.nombre, apps: ['dash'] }, app: '' });
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
    expect(['correo_apagado_fuera_de_produccion', 'correo_no_configurado']).toContain(pago.data.correo.motivo);
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

  it('el buzón y mis órdenes se pueden pedir de un solo negocio', async () => {
    /* dash101 trabaja con un negocio activo a la vez. Sin este filtro, el
     * buzón mezcla los negocios de la empresa y —peor— sus TOTALES suman
     * dinero de otro lado sin decirlo. */
    const otro = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Otro taller' } })).data.id;
    const ajena = await o('ana', '/ordenes', { method: 'POST', json: {
      negocio_id: otro, proveedor_nombre: 'Otra', concepto: 'De otro negocio', monto: 700_00,
    } });
    expect(ajena.estado).toBe(201);

    const todo = await o('beto', '/ordenes/buzon');
    const soloOtro = await o('beto', `/ordenes/buzon?negocio_id=${otro}`);
    expect(soloOtro.data.filas.length, 'sólo la del otro negocio').toBe(1);
    expect(soloOtro.data.filas[0].id).toBe(ajena.data.id);
    expect(soloOtro.data.total, 'y el total es el de esa sola').toBe(700_00);
    expect(todo.data.filas.length, 'sin filtro salen todas').toBeGreaterThan(1);
    expect(todo.data.total).toBeGreaterThan(soloOtro.data.total);

    const mias = await o('ana', `/ordenes?negocio_id=${otro}`);
    expect(mias.data.filas.length).toBe(1);
    expect(mias.data.filas[0].negocio_id).toBe(otro);
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
    const inv = await o('mike', '/clientes/invitar', { method: 'POST', json: { correo: 'cliente-oc@ejemplo.mx', nombre: 'Cliente Uno' } });
    expect([200, 201]).toContain(inv.estado);
    await entrar('clienteoc', 'cliente-oc@ejemplo.mx');
    expect((await o('clienteoc', '/fiscal/iva', { app: 'peek101' })).estado).toBe(403);
    expect((await o('clienteoc', '/ordenes', { app: 'peek101' })).estado).toBe(403);
  });
});

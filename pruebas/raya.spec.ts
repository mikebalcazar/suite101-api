/* La raya: lo que se le paga a la gente, y su recibo · contrato 0.27.0
 *
 * Mike, 20-sep: «pon en la fila un administrador de nóminas», y al
 * analizarlo escogió el alcance —pagos de raya y recibos, no nómina
 * calculada— y el lugar: dentro de dash101, con permiso aparte.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que el permiso SEA de verdad. Lo que gana cada quien es el dato que
 *     más caro cuesta que ande suelto en una oficina chica, y un permiso que
 *     sólo esconde el botón no es un permiso;
 *   · que el NETO y el TOTAL los calcule el servidor. Si vinieran de la
 *     pantalla, dos personas capturando a la vez mandarían dos totales y los
 *     dos se creerían. Es la misma regla que `precio_venta`;
 *   · que pagar deje UN EGRESO POR PERSONA. Con un egreso global, conciliar
 *     contra el banco es adivinar y corregirle a uno obliga a tocar a todos;
 *   · que una raya pagada NO se reescriba ni se cancele. Ese dinero ya salió;
 *     borrarlo de aquí no lo regresa a la cuenta;
 *   · que la misma persona no venga dos veces en el mismo corte. Si viniera,
 *     se le paga dos veces y el total cuadra igual, así que nadie lo nota
 *     hasta que falta dinero;
 *   · que la raya NO caiga en la lista de «falta la factura». Un pago de
 *     raya no lleva factura de proveedor, y si cayera, esa lista —que Mike
 *     sí usa— se llenaría de renglones que nunca se van a resolver.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'raya-de-la-semana';
const GENTE = {
  sol: { correo: 'sol-raya@ejemplo.mx', nombre: 'Sol Socia', rol: 'socio' },
  tin: { correo: 'tin-raya@ejemplo.mx', nombre: 'Tin Taller', rol: 'staff' },
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
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}

let negocio = '', cuenta = '', lupe = '', beto = '', raya = '';

/* El saldo de una cuenta NO se guarda: es `saldo_inicial + ingresos −
 * egresos`, y se suma al leer (la API nunca lo cachea, para que no pueda
 * contradecir a los movimientos). Aquí se suma igual. */
const saldoDe = async (cuenta_id: string) => {
  const c = (await o('mike', `/cuentas/${cuenta_id}`)).data;
  const { filas } = (await o('mike', `/movimientos?negocio_id=${negocio}`)).data;
  return filas
    .filter((m: any) => m.cuenta_id === cuenta_id)
    .reduce((s: number, m: any) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), Number(c.saldo_inicial));
};

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Raya', apps: { dash: true, roster: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, g] of Object.entries(GENTE)) {
    await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: g.correo, rol: g.rol, nombre: g.nombre, apps: ['dash'] }, app: '' });
    await entrar(apodo, g.correo);
  }

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller' } })).data.id;
  cuenta = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Caja', tipo: 'caja', saldo_inicial: 100_000_00 } })).data.id;

  /* Dos trabajadores. No son miembros de la suite: son gente de taller.
   *
   * Se dan de alta por la puerta de nóminas y NO por el CRUD de `personal`,
   * porque dash101 no puede escribir esa tabla —no está en ESCRITORES— y eso
   * no cambia. Es justo el caso que la puerta existe para resolver: una
   * empresa que le paga a su gente sin llevar expedientes en roster101. */
  const alguien = async (nombre: string, puesto: string) => {
    const r = await o('mike', '/nomina/gente', { method: 'POST', json: { nombre, puesto } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    return r.data.persona.id as string;
  };
  lupe = await alguien('Lupe Carpintera', 'Carpintería');
  beto = await alguien('Beto Ayudante', 'Ayudante');
  expect(lupe && beto).toBeTruthy();
}, 60000);

describe('el permiso aparte', () => {
  it('sin la etiqueta no se ve la raya, aunque sea socio de la empresa', async () => {
    /* Un permiso que sólo esconde el botón no es un permiso. Aquí se cierra
     * en el servidor, que es lo único que cuenta. */
    const r = await o('sol', `/nomina/rayas?negocio_id=${negocio}`);
    expect(r.estado).toBe(403);
    expect(r.error).toBe('sin_permiso');
  });

  it('el dueño entra sin etiqueta: si no, una empresa nueva no podría empezar', async () => {
    const r = await o('mike', `/nomina/rayas?negocio_id=${negocio}`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.rayas).toEqual([]);
  });

  it('sólo el dueño la reparte, y en cuanto la pone surte efecto', async () => {
    const ajeno = await o('sol', '/nomina/encargados', { method: 'POST', json: { usuario_id: 'x', valor: true } });
    expect(ajeno.estado, 'un socio no reparte permisos').toBe(403);

    const lista = await o('mike', '/nomina/encargados');
    expect(lista.estado, JSON.stringify(lista)).toBe(200);
    const laSol = lista.data.gente.find((g: any) => g.correo === GENTE.sol.correo);
    expect(laSol.es_nominas).toBe(false);

    const m = await o('mike', '/nomina/encargados', { method: 'POST', json: { usuario_id: laSol.usuario_id, valor: true } });
    expect(m.estado, JSON.stringify(m)).toBe(200);

    const ya = await o('sol', `/nomina/rayas?negocio_id=${negocio}`);
    expect(ya.estado, 'con la etiqueta puesta, entra').toBe(200);
  });

  it('y quitarla también surte efecto al momento', async () => {
    const lista = await o('mike', '/nomina/encargados');
    const laSol = lista.data.gente.find((g: any) => g.correo === GENTE.sol.correo);
    await o('mike', '/nomina/encargados', { method: 'POST', json: { personal_id: laSol.personal_id, valor: false } });
    expect((await o('sol', `/nomina/rayas?negocio_id=${negocio}`)).estado).toBe(403);
    // Y se devuelve, que es como sigue el resto del archivo.
    await o('mike', '/nomina/encargados', { method: 'POST', json: { personal_id: laSol.personal_id, valor: true } });
  });
});

describe('abrir el corte', () => {
  it('el neto y el total los calcula el servidor, no la pantalla', async () => {
    const r = await o('sol', '/nomina/rayas', { method: 'POST', json: {
      negocio_id: negocio, periodo_inicio: '2026-03-16', periodo_fin: '2026-03-22',
      pagos: [
        { personal_id: lupe, concepto: 'Semana', sueldo: 3_500_00, extras: 600_00, descuentos: 100_00 },
        { personal_id: beto, concepto: 'Semana', sueldo: 2_200_00 },
      ],
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    raya = r.data.raya.id;
    const deLupe = r.data.pagos.find((p: any) => p.personal_id === lupe);
    expect(deLupe.neto, '3,500 + 600 − 100').toBe(4_000_00);
    expect(r.data.raya.total, 'y el corte es la suma de los netos').toBe(6_200_00);
    expect(r.data.raya.estado).toBe('borrador');
  });

  it('el nombre se CONGELA en el renglón: un recibo dice a quién se le pagó ese día', async () => {
    /* Si el nombre saliera de `personal` por llave, corregir un apellido mal
     * escrito el año que entra cambiaría todos los recibos viejos. */
    const antes = (await o('sol', `/nomina/rayas/${raya}`)).data.pagos.find((p: any) => p.personal_id === lupe);
    expect(antes.nombre).toBe('Lupe Carpintera');
    await o('mike', `/personal/${lupe}`, { method: 'PATCH', json: { nombre: 'Guadalupe Carpintera' } });
    const luego = (await o('sol', `/nomina/rayas/${raya}`)).data.pagos.find((p: any) => p.personal_id === lupe);
    expect(luego.nombre, 'el recibo sigue diciendo lo que decía').toBe('Lupe Carpintera');
  });

  it('la misma persona no viene dos veces en el mismo corte', async () => {
    /* Si viniera, se le paga dos veces y el total cuadra igual: nadie lo
     * nota hasta que falta dinero en la caja. */
    const r = await o('sol', '/nomina/rayas', { method: 'POST', json: {
      negocio_id: negocio, periodo_inicio: '2026-03-16', periodo_fin: '2026-03-22',
      pagos: [{ personal_id: beto, sueldo: 1_000_00 }, { personal_id: beto, sueldo: 1_000_00 }],
    } });
    expect(r.estado).toBe(400);
    expect(r.detalle.motivo).toMatch(/dos veces/);
  });

  it('un neto negativo se rechaza: ese renglón le debería dinero a la empresa', async () => {
    const r = await o('sol', '/nomina/rayas', { method: 'POST', json: {
      negocio_id: negocio, periodo_inicio: '2026-03-16', periodo_fin: '2026-03-22',
      pagos: [{ personal_id: beto, sueldo: 1_000_00, descuentos: 1_500_00 }],
    } });
    expect(r.estado).toBe(400);
  });

  it('corregir el borrador REEMPLAZA los renglones, no los suma', async () => {
    /* Es el defecto que Mike vivió con los ítems del proyecto el 20-sep:
     * guardar dos veces duplicaba todo. */
    const r = await o('sol', `/nomina/rayas/${raya}`, { method: 'PATCH', json: {
      pagos: [
        { personal_id: lupe, concepto: 'Semana', sueldo: 3_500_00, extras: 600_00, descuentos: 100_00 },
        { personal_id: beto, concepto: 'Semana', sueldo: 2_400_00 },
      ],
    } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.pagos).toHaveLength(2);
    expect(r.data.raya.total).toBe(6_400_00);
  });
});

describe('pagar', () => {
  it('deja UN EGRESO POR PERSONA, con su nombre, y baja la cuenta', async () => {
    const antes = await saldoDe(cuenta);

    const r = await o('sol', `/nomina/rayas/${raya}/pagar`, { method: 'POST', json: { cuenta_id: cuenta, fecha: '2026-03-23' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.raya.estado).toBe('pagada');
    expect(r.data.pagos.every((p: any) => p.movimiento_id), 'cada renglón con su movimiento').toBe(true);

    const movs = await o('mike', `/movimientos?negocio_id=${negocio}`);
    const dela = movs.data.filas.filter((m: any) => m.categoria === 'raya');
    expect(dela, 'dos egresos, uno por persona').toHaveLength(2);
    expect(dela.map((m: any) => m.contraparte_nombre).sort()).toEqual(['Beto Ayudante', 'Lupe Carpintera']);
    expect(dela.every((m: any) => m.tipo === 'egreso' && m.contraparte_tipo === 'personal')).toBe(true);

    const luego = await saldoDe(cuenta);
    expect(antes - luego, 'salió el total del corte').toBe(6_400_00);
  });

  it('y NO cae en la lista de «falta la factura»', async () => {
    /* Una raya no lleva factura de proveedor. Si cayera, esa lista se
     * llenaría cada semana de renglones que nunca se van a resolver, y una
     * lista así deja de leerse. */
    const p = await o('mike', `/fiscal/pendientes?negocio_id=${negocio}`);
    expect(p.estado, JSON.stringify(p)).toBe(200);
    const nombres = (p.data.pendientes ?? []).map((x: any) => x.contraparte_nombre ?? '');
    expect(nombres).not.toContain('Lupe Carpintera');
    expect(nombres).not.toContain('Beto Ayudante');
  });

  it('una raya pagada NO se reescribe', async () => {
    const r = await o('sol', `/nomina/rayas/${raya}`, { method: 'PATCH', json: { nota: 'ups' } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('ya_pagada');
  });

  it('ni se cancela: ese dinero ya salió y cancelar no lo regresa', async () => {
    const r = await o('sol', `/nomina/rayas/${raya}/cancelar`, { method: 'POST' });
    expect(r.estado).toBe(409);
    expect(r.detalle.motivo).toMatch(/ya salió/);
  });

  it('ni se paga dos veces', async () => {
    const r = await o('sol', `/nomina/rayas/${raya}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('ya_pagada');
  });

  it('un corte vacío no se paga', async () => {
    const vacia = await o('sol', '/nomina/rayas', { method: 'POST', json: {
      negocio_id: negocio, periodo_inicio: '2026-03-23', periodo_fin: '2026-03-29',
    } });
    const r = await o('sol', `/nomina/rayas/${vacia.data.raya.id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(r.estado).toBe(400);
  });

  it('ni se paga de una cuenta de otro negocio', async () => {
    const otro = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Otro' } })).data.id;
    const ajena = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: otro, nombre: 'Ajena', tipo: 'banco', saldo_inicial: 0 } })).data.id;
    const corte = await o('sol', '/nomina/rayas', { method: 'POST', json: {
      negocio_id: negocio, periodo_inicio: '2026-03-30', periodo_fin: '2026-04-05',
      pagos: [{ personal_id: beto, sueldo: 500_00 }],
    } });
    const r = await o('sol', `/nomina/rayas/${corte.data.raya.id}/pagar`, { method: 'POST', json: { cuenta_id: ajena } });
    expect(r.estado).toBe(400);
  });
});

describe('el recibo', () => {
  it('se marca de recibido, y se puede desmarcar', async () => {
    /* Se palomea por error más seguido de lo que uno cree, y un recibo
     * «firmado» que nadie firmó es justo lo que no sirve en una aclaración. */
    const pagos = (await o('sol', `/nomina/rayas/${raya}`)).data.pagos;
    const uno = pagos[0];
    expect(uno.recibido_at).toBe(null);

    const si = await o('sol', `/nomina/pagos/${uno.id}/recibido`, { method: 'POST', json: { recibido: true } });
    expect(si.estado, JSON.stringify(si)).toBe(200);
    expect(si.data.pago.recibido_at).toBeTruthy();

    const no = await o('sol', `/nomina/pagos/${uno.id}/recibido`, { method: 'POST', json: { recibido: false } });
    expect(no.data.pago.recibido_at).toBe(null);
  });

  it('un corte cancelado queda cancelado, sin tocar cuentas', async () => {
    const corte = await o('sol', '/nomina/rayas', { method: 'POST', json: {
      negocio_id: negocio, periodo_inicio: '2026-04-06', periodo_fin: '2026-04-12',
      pagos: [{ personal_id: beto, sueldo: 700_00 }],
    } });
    const antes = await saldoDe(cuenta);
    const r = await o('sol', `/nomina/rayas/${corte.data.raya.id}/cancelar`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.raya.estado).toBe('cancelada');
    expect(await saldoDe(cuenta), 'no se movió un peso').toBe(antes);
  });
});

describe('a quién se le paga sale de los expedientes de roster101 (§107)', () => {
  /* Mike, 20-sep: «en la sección de raya de dash debo poder escoger a quién
   * se le paga de la lista de los trabajadores en roster101, no en la de
   * dash. Y de agregar las personas a las que se les realiza el pago».
   *
   * LO QUE ESTAS PRUEBAS CUIDAN:
   *
   *   · que la lista larga —los expedientes— llegue completa, con el nombre
   *     armado. Es la que la pantalla ofrece;
   *   · que escoger a alguien DOS VECES no le abra dos renglones. Sin la
   *     liga por `expediente_ref`, la raya le pagaría doble al mismo y nada
   *     se vería raro: dos nombres iguales en un corte parecen dos personas;
   *   · que el alta a mano siga existiendo. Una empresa que paga sin llevar
   *     expedientes no se puede quedar sin poder pagar.
   */
  const correoTrabajador = 'trabajador-raya@ejemplo.mx';
  let rosterId = '';

  beforeAll(async () => {
    /* El trabajador se da de alta por SU puerta, como en la vida real: su
     * correo y su código, sin cuenta en la suite. */
    const c = await pedir('juan', `/roster/${ORG}/api/codigo`, { method: 'POST', json: { email: correoTrabajador }, app: 'roster101' });
    expect(c.estado, JSON.stringify(c)).toBe(200);
    const e = await pedir('juan', `/roster/${ORG}/api/entrar`, { method: 'POST', json: { email: correoTrabajador, codigo: c.codigo_prueba }, app: 'roster101' });
    expect(e.estado, JSON.stringify(e)).toBe(200);
    /* Se queda así, EN BORRADOR y sin nombre, que es como está la mayoría el
     * día que hay que pagarles: el trabajador entró con su correo y todavía
     * no llena su ficha. Guardarla completa exige CURP, NSS y CLABE
     * válidos, y quien arma la raya no los va a teclear para poder pagar. */
  });

  it('la lista de expedientes llega, y quien no tiene nombre sale con su correo', async () => {
    const r = await o('mike', '/nomina/trabajadores');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const juan = r.data.trabajadores.find((x: any) => x.correo === correoTrabajador);
    expect(juan, `salió: ${JSON.stringify(r.data.trabajadores)}`).toBeTruthy();
    /* Sin nombre todavía, sale con su correo: hay que poder distinguirlo
     * para escogerlo, y un renglón vacío en una lista de gente no sirve. */
    expect(juan.nombre).toBe(correoTrabajador);
    expect(juan.personal_id, 'todavía no tiene renglón en la lista corta').toBeFalsy();
    rosterId = juan.id;
  });

  it('escogerlo le abre su lugar para poder pagarle', async () => {
    const r = await o('mike', '/nomina/gente/de-roster', { method: 'POST', json: { roster_id: rosterId } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.nueva).toBe(true);
    expect(r.data.persona.nombre).toBe(correoTrabajador);
    expect((await o('mike', '/nomina/gente')).data.gente.map((g: any) => g.id)).toContain(r.data.persona.id);
  });

  it('y escogerlo otra vez NO lo duplica', async () => {
    /* Dos renglones del mismo nombre en un corte parecen dos personas, y la
     * raya le pagaría dos veces sin que nada se viera raro. */
    const antes = (await o('mike', '/nomina/gente')).data.gente.length;
    const r = await o('mike', '/nomina/gente/de-roster', { method: 'POST', json: { roster_id: rosterId } });
    expect(r.estado).toBe(200);
    expect(r.data.nueva).toBe(false);
    expect((await o('mike', '/nomina/gente')).data.gente.length).toBe(antes);
    expect((await o('mike', '/nomina/trabajadores')).data.trabajadores.find((x: any) => x.id === rosterId).personal_id).toBe(r.data.persona.id);
  });

  it('un expediente que no existe: 404', async () => {
    expect((await o('mike', '/nomina/gente/de-roster', { method: 'POST', json: { roster_id: 'no-existe' } })).estado).toBe(404);
  });

  it('y el alta a mano sigue ahí, para quien no lleva expedientes', async () => {
    const r = await o('mike', '/nomina/gente', { method: 'POST', json: { nombre: 'Ayudante de fuera', puesto: 'Ayudante' } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
  });
});

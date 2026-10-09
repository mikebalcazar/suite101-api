/* bill101, fase A · contrato 0.85.0.
 *
 * Mike, 8-oct-2026: «Quiero hacer un módulo para generar y timbrar facturas y
 * también importar y actualizar las facturas recibidas (…) Ligar a gastos de
 * dash si es posible y coinciden. Y aparte (…) un estado de cuenta de
 * movimientos exclusivamente fiscales (…) Esta ventana debe calcular los
 * pagos de impuestos que deben hacerse mensuales y anuales».
 *
 * Aquí se mide de punta a punta, por las rutas y contra el Durable Object de
 * verdad: se suben XML, se ligan con dinero, se le pregunta al SAT (con el
 * SAT simulado: lo que conteste el de verdad se mide en el humo) y se piden
 * los impuestos.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que una factura que NO es de la empresa no entre, por más que alguien
 *     la suba: el lado lo decide el RFC, no quien sube;
 *   · que subir dos veces la misma no la duplique —es el error más fácil de
 *     cometer y el que más ensucia el IVA del mes—;
 *   · que la liga con el dinero se PROPONGA y no se haga sola, salvo cuando
 *     el movimiento ya traía escrito el folio fiscal;
 *   · que los impuestos que contesta la ruta sean LOS MISMOS del caso hecho
 *     a mano de `fiscal.spec.ts`, ahora con las facturas entrando por XML: si
 *     el lector o la base torcieran un importe, aquí se ve;
 *   · que una factura que el SAT da por cancelada salga de los impuestos y
 *     suelte el pago que respaldaba; y que «el SAT no contestó» no se anote
 *     como «no existe»;
 *   · que la migración 0044 no le mueva un centavo a lo que ya estaba.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { MIGRACIONES } from '../src/org-db';
import { expresionImpresa, leerRespuestaSat, sobreDeConsulta } from '../src/sat';
import { RFC_AJENO, RFC_CLIENTE, RFC_EMPRESA, RFC_PROVEEDOR, uuidDe, xmlCfdi, type DatosCfdi } from './cfdi-de-prueba';

const ORG = 'bill-prueba';
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'bill101';
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
  expect(c.estado, JSON.stringify(c)).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

const P = (pesos: number) => Math.round(pesos * 100);
const EMP = { rfc: RFC_EMPRESA, nombre: 'ESCUELA KEMPER URGATE' };
const CLI = { rfc: RFC_CLIENTE, nombre: 'UNIVERSIDAD ROBOTICA ESPAÑOLA' };
const PRO = { rfc: RFC_PROVEEDOR, nombre: 'MADERAS EL ROBLE SA DE CV' };
const FLE = { rfc: RFC_AJENO, nombre: 'TRANSPORTES RAPIDOS DEL NORTE' };

/* El mismo caso de `fiscal.spec.ts`, ahora como XML. */
const U = { A: uuidDe(101), B: uuidDe(102), C: uuidDe(103), D: uuidDe(104), E: uuidDe(105), F: uuidDe(106), G: uuidDe(107), H: uuidDe(108), N: uuidDe(109), REP: uuidDe(110), VIEJA: uuidDe(120), AJENA: uuidDe(199) };
const CASO: Record<string, DatosCfdi> = {
  A: { uuid: U.A, emisor: EMP, receptor: CLI, fecha: '2026-01-15', serie: 'F', folio: '1', subtotal: '100000.00' },
  B: { uuid: U.B, emisor: EMP, receptor: CLI, fecha: '2026-01-20', serie: 'F', folio: '2', subtotal: '300000.00', metodo: 'PPD', forma: '99' },
  C: { uuid: U.C, emisor: PRO, receptor: EMP, fecha: '2026-01-10', subtotal: '50000.00' },
  D: { uuid: U.D, emisor: PRO, receptor: EMP, fecha: '2026-02-03', serie: 'R', folio: '881', subtotal: '200000.00' },
  E: { uuid: U.E, tipo: 'E', emisor: EMP, receptor: CLI, fecha: '2026-03-12', subtotal: '10000.00', relacionados: { tipo: '01', uuids: [U.A] } },
  F: { uuid: U.F, emisor: FLE, receptor: EMP, fecha: '2026-03-20', subtotal: '20000.00', iva_retenido: '800.00' },
  G: { uuid: U.G, emisor: PRO, receptor: EMP, fecha: '2026-03-25', subtotal: '80000.00' },
  H: { uuid: U.H, emisor: PRO, receptor: EMP, fecha: '2026-01-30', subtotal: '5000.00' },
  N: { uuid: U.N, tipo: 'N', emisor: EMP, receptor: { rfc: 'XAXX010101000', nombre: 'UN TRABAJADOR' }, fecha: '2026-01-31', subtotal: '40000.00', descuento: '6500.00', total: '33500.00', nomina: { percepciones: '40000.00', deducciones: '6500.00' } },
  REP: { uuid: U.REP, tipo: 'P', emisor: EMP, receptor: CLI, fecha: '2026-03-06', pagos: [
    { fecha: '2026-02-10', monto: '116000.00', doctos: [{ uuid: U.B, pagado: '116000.00', parcialidad: 1 }] },
    { fecha: '2026-03-05', monto: '232000.00', doctos: [{ uuid: U.B, pagado: '232000.00', parcialidad: 2 }] },
  ] },
};
const xml = (k: keyof typeof CASO) => xmlCfdi(CASO[k]);

const subir = (quien: string, xmls: string[]) => o(quien, '/fiscal/xml', { method: 'POST', json: { xmls } });
const idDe = async (uuid: string): Promise<string> => {
  const filas = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
  const f = filas.find((x) => x.uuid === uuid);
  if (!f) throw new Error(`no está la factura ${uuid}`);
  return f.id as string;
};
const mov = async (id: string) => (await o('mike', `/movimientos/${id}`, { app: 'dash101' })).data;

let cuenta = '', proveedor = '';
async function movimiento(tipo: 'ingreso' | 'egreso', monto: number, fecha: string, extra: Record<string, unknown> = {}) {
  const r = await o('mike', '/movimientos', { method: 'POST', app: 'dash101', json: { tipo, monto, fecha, cuenta_id: cuenta, ...extra } });
  expect(r.estado, JSON.stringify(r)).toBe(201);
  return r.data.id as string;
}

beforeAll(async () => {
  await entrar('mike', 'mike@forespot.com');
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Facturas de prueba', apps: { dash: true, bill: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  const sin = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: 'bill-sin-licencia', nombre: 'Sin bill101', apps: { dash: true } }, app: '' });
  expect(sin.estado, JSON.stringify(sin)).toBe(201);
  for (const [apodo, correo] of [['ana', 'ana-bill@ejemplo.mx'], ['beto', 'beto-bill@ejemplo.mx']] as const) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo, rol: 'staff', nombre: apodo }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar(apodo, correo);
  }
  const uBeto = (await pedir('beto', '/yo', { app: '' })).data.usuario.id;
  const marca = await o('mike', '/ordenes/contadores', { method: 'POST', app: 'dash101', json: { usuario_id: uBeto, valor: true } });
  expect(marca.estado, JSON.stringify(marca)).toBe(200);

  cuenta = (await o('mike', '/cuentas', { method: 'POST', app: 'dash101', json: { nombre: 'Banco', tipo: 'banco' } })).data.id;
  proveedor = (await o('mike', '/proveedores', { method: 'POST', app: 'dash101', json: { nombre: 'Maderas El Roble', rfc: RFC_PROVEEDOR } })).data.id;
}, 90_000);

afterEach(() => { vi.restoreAllMocks(); });

describe('bill101 es una app con licencia por empresa', () => {
  it('una empresa sin la licencia no la abre', async () => {
    const r = await pedir('mike', '/orgs/bill-sin-licencia/fiscal/config');
    expect(r.estado).toBe(403);
    expect(r.error).toBe('app_inactiva');
  });

  it('con la licencia, sí; y dash101 entra a las mismas rutas', async () => {
    expect((await o('mike', '/fiscal/config')).estado).toBe(200);
    expect((await o('mike', '/fiscal/config', { app: 'dash101' })).estado).toBe(200);
    expect((await pedir('mike', '/orgs/bill-sin-licencia/fiscal/config', { app: 'dash101' })).estado, 'y sin bill101, por dash101 siguen abiertas').toBe(200);
  });
});

describe('subir facturas', () => {
  it('sin el RFC de la empresa no entra ninguna: no se sabría de qué lado están', async () => {
    const r = await subir('mike', [xml('A')]);
    expect(r.estado).toBe(409);
    expect(r.error).toBe('falta_rfc_empresa');
    expect((await o('mike', '/fiscal/cfdi')).data.filas).toHaveLength(0);

    const e = await o('mike', '/empresa', { method: 'PATCH', app: 'dash101', json: { rfc: RFC_EMPRESA.toLowerCase() } });
    expect(e.estado, JSON.stringify(e)).toBe(200);
    expect((await o('mike', '/fiscal/config')).data.rfc).toBe(RFC_EMPRESA);
  });

  it('el RFC escrito con guiones o espacios es el mismo RFC', async () => {
    await o('mike', '/empresa', { method: 'PATCH', app: 'dash101', json: { rfc: 'eku-900317 3c9' } });
    expect((await o('mike', '/fiscal/config')).data.rfc).toBe(RFC_EMPRESA);
  });

  it('entra la emitida, entra la recibida, y la que no es de la empresa NO entra', async () => {
    const ajena = xmlCfdi({ uuid: U.AJENA, emisor: FLE, receptor: CLI, fecha: '2026-01-05', subtotal: '999.00' });
    const r = await subir('mike', [xml('A'), xml('C'), ajena, '<html>no soy una factura</html>']);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.resumen).toEqual({ recibidas: 4, nuevas: 2, actualizadas: 0, repetidas: 0, rechazadas: 2 });

    const [a, c, x, basura] = r.data.resultados;
    expect(a).toMatchObject({ uuid: U.A, resultado: 'nueva', lado: 'emitida', tipo_comprobante: 'I', total: P(116_000), contraparte: CLI.nombre });
    expect(c).toMatchObject({ uuid: U.C, resultado: 'nueva', lado: 'recibida', total: P(58_000), contraparte: PRO.nombre });
    expect(x).toMatchObject({ uuid: U.AJENA, resultado: 'rechazada', motivo: 'no_es_de_la_empresa' });
    expect(basura).toMatchObject({ resultado: 'rechazada', motivo: 'no_es_cfdi' });

    const filas = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
    expect(filas.map((f) => f.uuid).sort()).toEqual([U.A, U.C].sort());
    const fa = filas.find((f) => f.uuid === U.A), fc = filas.find((f) => f.uuid === U.C);
    expect(fa).toMatchObject({ tipo: 'ingreso', origen: 'xml', rfc: RFC_CLIENTE, razon_social: CLI.nombre, subtotal: P(100_000), iva: P(16_000), serie: 'F', folio: '1', metodo_pago: 'PUE', estado: 'vigente' });
    expect(fc).toMatchObject({ tipo: 'egreso', origen: 'xml', rfc: RFC_PROVEEDOR, rfc_emisor: RFC_PROVEEDOR, rfc_receptor: RFC_EMPRESA, total_original: '58000.00' });
  });

  it('el archivo queda guardado y se puede bajar idéntico', async () => {
    const id = await idDe(U.A);
    const r = await SELF.fetch(`https://api.local/orgs/${ORG}/fiscal/cfdi/${id}/xml`, { headers: { 'X-App': 'bill101', Cookie: galletas.mike } });
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('xml');
    expect(await r.text()).toBe(xml('A'));
  });

  it('una factura trae sus renglones', async () => {
    const d = (await o('mike', `/fiscal/cfdi/${await idDe(U.A)}`)).data;
    expect(d.conceptos).toHaveLength(1);
    expect(d.conceptos[0]).toMatchObject({ descripcion: 'Mueble sobre medida', importe: P(100_000), iva: P(16_000) });
    expect(d.lado).toBe('emitida');
    expect(d.tiene_xml).toBe(true);
  });

  it('subir la misma otra vez no la duplica', async () => {
    const r = await subir('mike', [xml('A'), xml('A')]);
    expect(r.data.resumen).toMatchObject({ nuevas: 0, repetidas: 2 });
    expect((await o('mike', '/fiscal/cfdi')).data.filas).toHaveLength(2);
  });

  it('una que estaba tecleada a mano se completa con su XML, sin cambiar de id', async () => {
    const manual = await o('mike', '/fiscal/cfdi', { method: 'POST', app: 'dash101', json: { uuid: U.D.toLowerCase(), tipo: 'egreso', subtotal: P(200_000), iva: P(32_000), fecha: '2026-02-03', razon_social: 'maderas' } });
    expect(manual.estado, JSON.stringify(manual)).toBe(201);
    const antes = (await o('mike', `/fiscal/cfdi/${manual.data.id}`)).data;
    expect(antes.origen, 'lo tecleado se lee como «manual»').toBe('manual');
    expect(antes.tiene_xml).toBe(false);

    const r = await subir('mike', [xml('D')]);
    expect(r.data.resultados[0]).toMatchObject({ uuid: U.D, resultado: 'actualizada', id: manual.data.id });
    const despues = (await o('mike', `/fiscal/cfdi/${manual.data.id}`)).data;
    expect(despues).toMatchObject({ origen: 'xml', razon_social: PRO.nombre, serie: 'R', folio: '881', total: P(232_000), tiene_xml: true });
    expect((await o('mike', '/fiscal/cfdi')).data.filas, 'sigue siendo una, no dos').toHaveLength(3);
  });

  it('un .zip con varias: entran los XML y lo demás se ignora', async () => {
    const zip = zipSync({ 'B.xml': strToU8(xml('B')), 'carpeta/E.XML': strToU8(xml('E')), 'B.pdf': strToU8('%PDF-1.4 no soy xml') });
    const forma = new FormData();
    forma.append('archivo', new File([zip], 'facturas.zip', { type: 'application/zip' }));
    const r = await o('mike', '/fiscal/xml', { method: 'POST', body: forma });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.resumen).toMatchObject({ recibidas: 2, nuevas: 2, rechazadas: 0 });
    const e = r.data.resultados.find((x: any) => x.uuid === U.E);
    expect(e).toMatchObject({ lado: 'emitida', tipo_comprobante: 'E' });
  });

  it('el XML suelto en el cuerpo también entra', async () => {
    const r = await o('mike', '/fiscal/xml', { method: 'POST', body: xml('H'), headers: { 'Content-Type': 'application/xml' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.resumen.nuevas).toBe(1);
  });

  it('más de las que caben en una tanda se rechazan enteras, diciendo cuántas caben', async () => {
    const muchas = Array.from({ length: 21 }, (_, i) => xmlCfdi({ uuid: uuidDe(900 + i), emisor: PRO, receptor: EMP, fecha: '2024-01-01', subtotal: '1.00' }));
    const r = await subir('mike', muchas);
    expect(r.estado).toBe(413);
    expect(r.error).toBe('demasiadas_facturas');
    expect(r.detalle.tope).toBe(20);
    expect((await o('mike', '/fiscal/cfdi?desde=2024-01-01&hasta=2024-12-31')).data.filas, 'no entró ninguna').toHaveLength(0);
  });

  it('un traslado no es fiscal y un recibo de nómina ajeno no es gasto de la empresa', async () => {
    const r = await subir('mike', [
      xmlCfdi({ uuid: uuidDe(801), tipo: 'T', emisor: EMP, receptor: EMP, fecha: '2026-01-02', subtotal: '0', iva: null }),
      xmlCfdi({ uuid: uuidDe(802), tipo: 'N', emisor: PRO, receptor: EMP, fecha: '2026-01-02', subtotal: '100.00', nomina: { percepciones: '100.00', deducciones: '0.00' } }),
    ]);
    expect(r.data.resultados.map((x: any) => x.motivo)).toEqual(['traslado_no_es_fiscal', 'nomina_ajena']);
  });
});

describe('la factura recibida y el gasto que se le parece', () => {
  let m1 = '', m2 = '', m3 = '', m4 = '', m5 = '';

  it('se proponen los movimientos del mismo monto y cercanos; los demás no', async () => {
    await subir('mike', [xml('F')]);
    // C: 58,000 del 10-ene.  D: 232,000 del 3-feb.  F: 22,400 del 20-mar.
    m1 = await movimiento('egreso', P(58_000), '2026-01-12', { contraparte_tipo: 'proveedor', contraparte_id: proveedor });
    m2 = await movimiento('egreso', P(232_000), '2026-03-05', { contraparte_tipo: 'proveedor', contraparte_id: proveedor }); // a 30 días, mismo RFC
    m3 = await movimiento('egreso', P(232_000), '2026-03-01', { descripcion: 'Pago de renta' });                           // a 26 días, sin nada que coincida
    m4 = await movimiento('egreso', P(57_000), '2026-01-11', { contraparte_tipo: 'proveedor', contraparte_id: proveedor }); // cerca, pero otro monto
    m5 = await movimiento('egreso', P(22_400.50), '2026-04-15', { descripcion: 'Flete Transportes Rapidos' });             // a 26 días, coincide el nombre, 50 centavos de más
    await movimiento('ingreso', P(58_000), '2026-01-12');                                                                  // mismo monto, del otro lado

    const filas = (await o('mike', '/fiscal/sugerencias')).data.filas as any[];
    const de = (uuid: string) => filas.find((x) => x.cfdi.uuid === uuid);

    expect(de(U.C).restante).toBe(P(58_000));
    expect(de(U.C).candidatos.map((k: any) => k.movimiento.id), 'ni el de otro monto ni el ingreso').toEqual([m1]);
    expect(de(U.C).candidatos[0]).toMatchObject({ confianza: 'alta', dias: 2, mismo_rfc: true, diferencia: 0 });

    expect(de(U.D).candidatos.map((k: any) => k.movimiento.id), 'a 30 días sólo el que coincide en RFC').toEqual([m2]);
    expect(de(U.D).candidatos[0]).toMatchObject({ confianza: 'media', dias: 30, mismo_rfc: true });

    expect(de(U.F).candidatos.map((k: any) => k.movimiento.id)).toEqual([m5]);
    expect(de(U.F).candidatos[0]).toMatchObject({ confianza: 'media', coincide_nombre: true, mismo_rfc: false, diferencia: 50 });
    expect(m3 && m4).toBeTruthy();
  });

  it('proponer NO es ligar: nada quedó facturado', async () => {
    expect((await mov(m1)).facturado).toBe(false);
    expect((await o('mike', `/fiscal/cfdi/${await idDe(U.C)}`)).data.movimientos).toHaveLength(0);
  });

  it('al confirmar, el gasto queda facturado y la propuesta desaparece', async () => {
    const c = await idDe(U.C);
    const r = await o('mike', `/fiscal/cfdi/${c}/ligar`, { method: 'POST', json: { movimiento_id: m1 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const m = await mov(m1);
    expect(m).toMatchObject({ facturado: true, uuid_cfdi: U.C, iva: P(8_000), subtotal: P(50_000) });
    const filas = (await o('mike', '/fiscal/sugerencias')).data.filas as any[];
    expect(filas.some((x) => x.cfdi.uuid === U.C), 'la factura ya está cubierta').toBe(false);
    expect(filas.flatMap((x) => x.candidatos).some((k: any) => k.movimiento.id === m1), 'y ese gasto ya no se le propone a nadie').toBe(false);
  });

  it('una liga equivocada se deshace, y el gasto vuelve a estar sin facturar', async () => {
    const c = await idDe(U.C);
    const r = await o('mike', `/fiscal/cfdi/${c}/desligar`, { method: 'POST', json: { movimiento_id: m1 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.movimiento_facturado).toBe(false);
    expect(await mov(m1)).toMatchObject({ facturado: false, uuid_cfdi: null });
    expect(((await o('mike', '/fiscal/sugerencias')).data.filas as any[]).some((x) => x.cfdi.uuid === U.C), 'y se vuelve a proponer').toBe(true);

    expect((await o('mike', `/fiscal/cfdi/${c}/desligar`, { method: 'POST', json: { movimiento_id: m1 } })).estado, 'deshacer lo que no existe es 404').toBe(404);
    // Se deja ligada: las pruebas del SAT de abajo la necesitan así.
    expect((await o('mike', `/fiscal/cfdi/${c}/ligar`, { method: 'POST', json: { movimiento_id: m1 } })).estado).toBe(200);
  });

  it('la única liga que se hace sola: el movimiento ya traía escrito el folio fiscal', async () => {
    const cobro = await movimiento('ingreso', P(1_160), '2025-06-11');
    const marca = await o('mike', `/fiscal/movimientos/${cobro}/facturado`, { method: 'POST', app: 'dash101', json: { facturado: true, uuid_cfdi: U.VIEJA.toLowerCase(), fecha_cfdi: '2025-06-10' } });
    expect(marca.estado, JSON.stringify(marca)).toBe(200);

    const r = await subir('mike', [xmlCfdi({ uuid: U.VIEJA, emisor: EMP, receptor: CLI, fecha: '2025-06-10', subtotal: '1000.00' })]);
    expect(r.data.resultados[0]).toMatchObject({ resultado: 'nueva', ligada_a: [cobro] });
    const d = (await o('mike', `/fiscal/cfdi/${r.data.resultados[0].id}`)).data;
    expect(d.movimientos.map((x: any) => x.movimiento_id)).toEqual([cobro]);
    expect(d.aplicado).toBe(P(1_160));
  });
});

describe('quién puede cambiar lo que mueve la cuenta', () => {
  it('el trato de una factura lo decide quien dirige o quien lleva la contabilidad', async () => {
    await subir('mike', [xml('G')]);
    const g = await idDe(U.G), h = await idDe(U.H);
    expect((await o('ana', `/fiscal/cfdi/${g}/trato`, { method: 'POST', json: { trato: 'inversion' } })).estado, 'alguien de oficina, no').toBe(403);
    const r = await o('beto', `/fiscal/cfdi/${g}/trato`, { method: 'POST', json: { trato: 'inversion' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.trato).toBe('inversion');
    expect((await o('mike', `/fiscal/cfdi/${h}/trato`, { method: 'POST', json: { trato: 'no_deducible' } })).data.trato).toBe('no_deducible');
  });

  it('un trato que no existe, o sobre una factura emitida, se rechaza', async () => {
    expect((await o('mike', `/fiscal/cfdi/${await idDe(U.G)}/trato`, { method: 'POST', json: { trato: 'gratis' } })).error).toBe('trato_invalido');
    expect((await o('mike', `/fiscal/cfdi/${await idDe(U.A)}/trato`, { method: 'POST', json: { trato: 'inversion' } })).error).toBe('solo_recibidas');
  });

  it('el coeficiente y los ajustes del contador: quien dirige sí, oficina no; y se validan', async () => {
    expect((await o('ana', '/fiscal/ejercicios/2026', { method: 'PUT', json: { coeficiente: 800 } })).estado).toBe(403);
    expect((await o('mike', '/fiscal/ejercicios/2026', { method: 'PUT', json: { coeficiente: 12000 } })).error).toBe('coeficiente_invalido');
    expect((await o('mike', '/fiscal/ejercicios/2026', { method: 'PUT', json: { coeficiente: 0.08 } })).error, 'va en diezmilésimas, entero').toBe('coeficiente_invalido');
    expect((await o('mike', '/fiscal/ejercicios/2026', { method: 'PUT', json: { ajuste_deducciones: -5 } })).error).toBe('monto_invalido');

    const antes = (await o('ana', '/fiscal/ejercicios/2026')).data;
    expect(antes).toMatchObject({ anio: 2026, coeficiente: null, tasa_isr: 3000, guardado: false });

    const r = await o('mike', '/fiscal/ejercicios/2026', { method: 'PUT', json: { coeficiente: 800, ajuste_deducciones: P(15_000), nota: 'lo dio el contador' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ coeficiente: 800, ajuste_deducciones: P(15_000), tasa_isr: 3000, guardado: true });
    // Cambiar una cosa no borra las otras.
    const r2 = await o('beto', '/fiscal/ejercicios/2026', { method: 'PUT', json: { nota: 'revisado' } });
    expect(r2.data).toMatchObject({ coeficiente: 800, ajuste_deducciones: P(15_000), nota: 'revisado' });
  });

  it('los datos con que se factura', async () => {
    expect((await o('ana', '/fiscal/config', { method: 'PUT', json: { regimen: '601' } })).estado).toBe(403);
    expect((await o('mike', '/fiscal/config', { method: 'PUT', json: { regimen: 'general' } })).error).toBe('regimen_invalido');
    expect((await o('mike', '/fiscal/config', { method: 'PUT', json: { cp: '6400' } })).error).toBe('cp_invalido');
    const r = await o('mike', '/fiscal/config', { method: 'PUT', json: { regimen: '601', cp: '64000', razon_social: 'ESCUELA KEMPER URGATE' } });
    expect(r.data).toMatchObject({ rfc: RFC_EMPRESA, regimen: '601', cp: '64000', razon_social: 'ESCUELA KEMPER URGATE' });
  });
});

describe('los impuestos, con las facturas entrando por XML', () => {
  it('se completa el caso: la nómina y el complemento de pago de la factura a crédito', async () => {
    const r = await subir('mike', [xml('N'), xml('REP')]);
    expect(r.data.resumen).toMatchObject({ nuevas: 2, rechazadas: 0 });
    expect(r.data.resultados[0]).toMatchObject({ lado: 'emitida', tipo_comprobante: 'N' });
    const b = (await o('mike', `/fiscal/cfdi/${await idDe(U.B)}`)).data;
    expect(b.pagada_con.map((p: any) => [p.fecha, p.pagado]), 'la factura a crédito ya sabe cuándo se cobró').toEqual([['2026-02-10', P(116_000)], ['2026-03-05', P(232_000)]]);
    const rep = (await o('mike', `/fiscal/cfdi/${await idDe(U.REP)}`)).data;
    expect(rep.paga).toHaveLength(2);
    expect(rep.paga[0].cfdi_id).toBe(b.id);
  });

  it('el IVA de cada mes es el del caso hecho a mano', async () => {
    const r = await o('mike', '/fiscal/impuestos?anio=2026');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const [ene, feb, mar, abr] = r.data.meses.map((m: any) => m.iva);
    expect(ene).toMatchObject({ mes: '2026-01', trasladado: P(16_000), acreditable: P(8_000), a_pagar: P(8_000), a_favor: 0, vence: '2026-02-17' });
    expect(feb).toMatchObject({ trasladado: P(16_000), acreditable: P(32_000), a_pagar: 0, a_favor: P(16_000) });
    expect(mar).toMatchObject({ trasladado: P(30_400), acreditable: P(15_200), retenido_a_terceros: P(800), favor_anterior: P(16_000), a_pagar: 0, a_favor: P(800) });
    expect(abr).toMatchObject({ resultado: 0, a_favor: P(800) });
    expect(r.data.iva_pendiente).toEqual({ por_cobrar: 0, por_pagar: 0 });
  });

  it('el ISR provisional también', async () => {
    const r = (await o('mike', '/fiscal/impuestos?anio=2026')).data;
    const [ene, feb, mar] = r.meses.map((m: any) => m.isr);
    expect(ene).toMatchObject({ ingresos_del_mes: P(400_000), utilidad_estimada: P(32_000), isr_acumulado: P(9_600), a_pagar: P(9_600), del_mes: P(9_600), falta_coeficiente: false });
    expect(feb).toMatchObject({ ingresos_acumulados: P(400_000), del_mes: 0 });
    expect(mar).toMatchObject({ ingresos_acumulados: P(390_000), isr_acumulado: P(9_360) });
    expect(r.avisos.falta_coeficiente).toBe(false);
  });

  it('y la anual estimada', async () => {
    const a = (await o('mike', '/fiscal/impuestos?anio=2026')).data.anual;
    expect(a).toMatchObject({
      ingresos_facturados: P(400_000), notas_de_credito_emitidas: P(10_000), ingresos: P(390_000),
      compras: P(270_000), nomina: P(40_000), ajuste_deducciones: P(15_000), deducciones: P(325_000),
      utilidad: P(65_000), isr: P(19_500), a_pagar: P(19_500), vence: '2027-03-31',
    });
    expect(a.fuera).toEqual({ inversion: { facturas: 1, subtotal: P(80_000) }, no_deducible: { facturas: 1, subtotal: P(5_000) } });
  });

  it('registrar un pago provisional lo resta de los meses siguientes y de la anual; borrarlo lo regresa', async () => {
    expect((await o('ana', '/fiscal/pagos', { method: 'POST', json: { impuesto: 'isr_provisional', periodo: '2026-01', monto: P(9_600), fecha: '2026-02-17' } })).estado).toBe(403);
    expect((await o('mike', '/fiscal/pagos', { method: 'POST', json: { impuesto: 'isr_provisional', periodo: '2026-13', monto: P(1), fecha: '2026-02-17' } })).error).toBe('periodo_invalido');
    expect((await o('mike', '/fiscal/pagos', { method: 'POST', json: { impuesto: 'ieps', periodo: '2026-01', monto: P(1), fecha: '2026-02-17' } })).error).toBe('impuesto_invalido');
    expect((await o('mike', '/fiscal/pagos', { method: 'POST', json: { impuesto: 'iva', periodo: '2026-01', monto: 0, fecha: '2026-02-17' } })).error).toBe('monto_invalido');

    const p = await o('beto', '/fiscal/pagos', { method: 'POST', json: { impuesto: 'isr_provisional', periodo: '2026-01', monto: P(9_600), fecha: '2026-02-17', nota: 'línea de captura 123' } });
    expect(p.estado, JSON.stringify(p)).toBe(201);

    const r = (await o('mike', '/fiscal/impuestos?anio=2026')).data;
    expect(r.meses[0].isr.pagado).toBe(P(9_600));
    expect(r.meses[1].isr).toMatchObject({ pagos_anteriores: P(9_600), a_pagar: 0 });
    expect(r.anual).toMatchObject({ provisionales_pagados: P(9_600), a_pagar: P(9_900) });
    expect((await o('mike', '/fiscal/pagos?anio=2026')).data.filas).toHaveLength(1);

    expect((await o('mike', `/fiscal/pagos/${p.data.id}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await o('mike', '/fiscal/impuestos?anio=2026')).data.anual.a_pagar).toBe(P(19_500));
    expect((await o('mike', `/fiscal/pagos/${p.data.id}`, { method: 'DELETE' })).estado).toBe(404);
  });

  it('un año sin coeficiente no inventa el ISR: lo dice', async () => {
    const r = (await o('mike', '/fiscal/impuestos?anio=2025')).data;
    expect(r.avisos.falta_coeficiente).toBe(true);
    expect(r.meses[5].isr).toMatchObject({ ingresos_del_mes: P(1_000), falta_coeficiente: true, a_pagar: 0 });
    expect(r.meses[5].iva.trasladado, 'el IVA no depende del coeficiente').toBe(P(160));
  });

  it('un año que no es un año', async () => {
    expect((await o('mike', '/fiscal/impuestos?anio=mil')).error).toBe('anio_invalido');
  });
});

describe('el estado de cuenta fiscal', () => {
  it('un renglón por factura vigente, con la nota de crédito en negativo y los totales por lado', async () => {
    const e = (await o('mike', '/fiscal/estado-de-cuenta?anio=2026')).data;
    expect(e.renglones.map((r: any) => r.uuid).sort(), 'las nueve del caso; el complemento de pago no es renglón').toEqual([U.A, U.B, U.C, U.D, U.E, U.F, U.G, U.H, U.N].sort());
    expect(e.complementos_de_pago).toBe(1);
    expect(e.ingresos).toMatchObject({ facturas: 3, subtotal: P(390_000), iva: P(62_400) });
    expect(e.egresos).toMatchObject({ facturas: 6, subtotal: P(395_000) });
    expect(e.neto.subtotal).toBe(P(-5_000));
    const nc = e.renglones.find((r: any) => r.uuid === U.E);
    expect(nc).toMatchObject({ tipo: 'ingreso', tipo_comprobante: 'E', subtotal: P(-10_000), iva: P(-1_600), total: P(-11_600) });
  });

  it('va en orden de fecha y con saldo corrido', async () => {
    const e = (await o('mike', '/fiscal/estado-de-cuenta?anio=2026')).data;
    const fechas = e.renglones.map((r: any) => r.fecha);
    expect(fechas).toEqual([...fechas].sort());
    expect(e.renglones[0]).toMatchObject({ uuid: U.C, saldo: P(-58_000) });
    expect(e.renglones[1]).toMatchObject({ uuid: U.A, saldo: P(58_000) });
    expect(e.renglones.at(-1).saldo).toBe(e.ingresos.total - e.egresos.total);
  });

  it('dice cuánto de cada factura ya está cubierto por dinero', async () => {
    const e = (await o('mike', '/fiscal/estado-de-cuenta?mes=2026-01')).data;
    expect(e.renglones).toHaveLength(5); // C, A, B, H, N
    expect(e.renglones.find((r: any) => r.uuid === U.C).aplicado).toBe(P(58_000));
    expect(e.renglones.find((r: any) => r.uuid === U.A).aplicado).toBe(0);
  });

  it('y aparte, lo marcado «facturado» sin factura cargada: no suma, se enseña para arreglarlo', async () => {
    const suelto = await movimiento('egreso', P(3_480), '2026-05-20', { descripcion: 'Tornillería' });
    await o('mike', `/fiscal/movimientos/${suelto}/facturado`, { method: 'POST', app: 'dash101', json: { facturado: true } });
    const e = (await o('mike', '/fiscal/estado-de-cuenta?mes=2026-05')).data;
    expect(e.renglones).toHaveLength(0);
    expect(e.marcados_sin_factura).toMatchObject({ movimientos: 1, total: P(3_480) });
    expect(e.marcados_sin_factura.filas[0].id).toBe(suelto);
    expect((await o('mike', '/fiscal/impuestos?anio=2026')).data.meses[4].iva.acreditable, 'no entra al IVA de mayo').toBe(0);
  });
});

describe('las rutas de la 0009 siguen contestando', () => {
  it('/fiscal/iva suma por fecha de factura, y la nota de crédito resta', async () => {
    const ene = (await o('mike', '/fiscal/iva?mes=2026-01', { app: 'dash101' })).data;
    expect(ene.trasladado, 'A y B, por su fecha').toBe(P(64_000));
    expect(ene.acreditable, 'C y H').toBe(P(8_800));
    expect(ene.facturas, 'la nómina no es «una factura recibida»').toMatchObject({ emitidas: 2, recibidas: 2 });
    const mar = (await o('mike', '/fiscal/iva?mes=2026-03', { app: 'dash101' })).data;
    expect(mar.trasladado, 'sólo la nota de crédito, en negativo').toBe(P(-1_600));
    expect(mar.acreditable, 'F (3,200 − 800) + G (12,800)').toBe(P(15_200));
  });
});

describe('preguntarle al SAT', () => {
  const respuesta = (estado: string, codigo = 'S - Comprobante obtenido satisfactoriamente.') =>
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><ConsultaResponse xmlns="http://tempuri.org/"><ConsultaResult xmlns:a="http://schemas.datacontract.org/2004/07/Sat.Cfdi.Negocio.ConsultaCfdi.Servicio" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><a:CodigoEstatus>${codigo}</a:CodigoEstatus><a:EsCancelable>Cancelable sin aceptación</a:EsCancelable><a:Estado>${estado}</a:Estado><a:EstatusCancelacion/></ConsultaResult></ConsultaResponse></s:Body></s:Envelope>`;
  /** Simula al SAT. Devuelve lo que se le haya pedido, para poder mirarlo. */
  const sat = (contesta: (cuerpo: string) => Response | Promise<Response>) => {
    const pedidos: { url: string; cuerpo: string; accion: string | null }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
      const cuerpo = String(init?.body ?? '');
      pedidos.push({ url: String(url), cuerpo, accion: new Headers(init?.headers).get('SOAPAction') });
      return contesta(cuerpo);
    });
    return pedidos;
  };

  it('la pregunta lleva los cuatro datos del código QR, y un RFC con & no rompe el sobre', () => {
    expect(expresionImpresa({ rfc_emisor: 'AAA010101AAA', rfc_receptor: 'BBB010101BBB', total_original: '116.00', uuid: U.A, sello8: 'abc12345' }))
      .toBe(`?re=AAA010101AAA&rr=BBB010101BBB&tt=116.00&id=${U.A}&fe=abc12345`);
    const sobre = sobreDeConsulta({ rfc_emisor: 'P&G851223B24', rfc_receptor: 'BBB010101BBB', total_original: '1.00', uuid: U.A });
    expect(sobre).toContain('re=P&amp;G851223B24&amp;rr=');
    expect(sobre).not.toMatch(/&(?!amp;)/);
  });

  it('una página de error no es una respuesta: no se lee como «no encontrada»', () => {
    expect(leerRespuestaSat('<html><body>Service Unavailable</body></html>')).toBeNull();
    expect(leerRespuestaSat('')).toBeNull();
    expect(leerRespuestaSat(respuesta('Vigente'))).toMatchObject({ estado: 'vigente', es_cancelable: 'Cancelable sin aceptación', estatus_cancelacion: null });
    expect(leerRespuestaSat(respuesta('No Encontrado', 'N - 602: Comprobante no encontrado.'))).toMatchObject({ estado: 'no_encontrado', codigo: 'N - 602: Comprobante no encontrado.' });
  });

  it('vigente: se anota, con la fecha de la revisión', async () => {
    const pedidos = sat(() => new Response(respuesta('Vigente')));
    const a = await idDe(U.A);
    const r = await o('mike', '/fiscal/verificar', { method: 'POST', json: { ids: [a] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ revisadas: 1, sin_respuesta: 0, canceladas: 0 });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toContain('consultaqr.facturaelectronica.sat.gob.mx');
    expect(pedidos[0].accion).toBe('http://tempuri.org/IConsultaCFDIService/Consulta');
    expect(pedidos[0].cuerpo).toContain(`re=${RFC_EMPRESA}&amp;rr=${RFC_CLIENTE}&amp;tt=116000.00&amp;id=${U.A}`);
    const f = (await o('mike', `/fiscal/cfdi/${a}`)).data;
    expect(f.estado_sat).toBe('vigente');
    expect(f.sat_revisado_at).toBeTruthy();
    expect(f.estado).toBe('vigente');
  });

  it('si el SAT no contesta NO se anota nada: no pude preguntar no es «no existe»', async () => {
    sat(() => { throw new TypeError('la red se cayó'); });
    const b = await idDe(U.B);
    const r = await o('mike', '/fiscal/verificar', { method: 'POST', json: { ids: [b] } });
    expect(r.estado).toBe(200);
    expect(r.data).toMatchObject({ revisadas: 0, sin_respuesta: 1 });
    const f = (await o('mike', `/fiscal/cfdi/${b}`)).data;
    expect(f.estado_sat).toBeNull();
    expect(f.sat_revisado_at).toBeNull();

    sat(() => new Response('<html>503</html>', { status: 503 }));
    expect((await o('mike', '/fiscal/verificar', { method: 'POST', json: { ids: [b] } })).data).toMatchObject({ revisadas: 0, sin_respuesta: 1 });
    expect((await o('mike', `/fiscal/cfdi/${b}`)).data.sat_revisado_at).toBeNull();
  });

  it('«no encontrada» se anota y se avisa, pero NO cancela: el SAT tarda en reconocer una recién timbrada', async () => {
    sat(() => new Response(respuesta('No Encontrado', 'N - 602: Comprobante no encontrado.')));
    const d = await idDe(U.D);
    const r = await o('mike', '/fiscal/verificar', { method: 'POST', json: { ids: [d] } });
    expect(r.data).toMatchObject({ revisadas: 1, canceladas: 0 });
    expect((await o('mike', `/fiscal/cfdi/${d}`)).data).toMatchObject({ estado: 'vigente', estado_sat: 'no_encontrado' });
    expect((await o('mike', '/fiscal/impuestos?anio=2026')).data.avisos.no_encontradas_en_sat).toBe(1);
  });

  it('cancelada en el SAT: se cancela aquí, sale de los impuestos y suelta el pago que respaldaba', async () => {
    const c = await idDe(U.C);
    const antes = (await o('mike', '/fiscal/impuestos?anio=2026')).data.meses[0].iva;
    expect(antes.acreditable).toBe(P(8_000));
    const m1 = (await o('mike', `/fiscal/cfdi/${c}`)).data.movimientos[0].movimiento_id;
    expect((await mov(m1)).facturado).toBe(true);

    sat(() => new Response(respuesta('Cancelado')));
    const r = await o('mike', '/fiscal/verificar', { method: 'POST', json: { ids: [c] } });
    expect(r.data).toMatchObject({ revisadas: 1, canceladas: 1 });
    expect(r.data.resultados[0]).toMatchObject({ cancelada_aqui: true, sat: { estado: 'cancelado' } });

    const f = (await o('mike', `/fiscal/cfdi/${c}`)).data;
    expect(f).toMatchObject({ estado: 'cancelada', estado_sat: 'cancelado' });
    expect(f.cancelada_at).toBeTruthy();
    expect((await mov(m1)).facturado, 'el pago ocurrió, pero su factura ya no vale').toBe(false);

    const despues = (await o('mike', '/fiscal/impuestos?anio=2026')).data;
    expect(despues.meses[0].iva.acreditable, 'ya no se acredita su IVA').toBe(0);
    expect(despues.meses[0].iva.a_pagar).toBe(P(16_000));
    expect(despues.anual.compras, 'ni se deduce').toBe(P(220_000));
    const e = (await o('mike', '/fiscal/estado-de-cuenta?mes=2026-01')).data;
    expect(e.renglones.some((x: any) => x.uuid === U.C)).toBe(false);
    expect(e.canceladas).toBe(1);
  });

  it('y ese pago queda libre para la factura que la sustituye', async () => {
    // El proveedor canceló C y la volvió a emitir: mismo monto, otro folio.
    const r = await subir('mike', [xmlCfdi({ uuid: uuidDe(130), emisor: PRO, receptor: EMP, fecha: '2026-01-11', subtotal: '50000.00' })]);
    const nueva = r.data.resultados[0].id;
    const s = (await o('mike', `/fiscal/sugerencias?cfdi_id=${nueva}`)).data.filas[0];
    const m1 = (await o('mike', `/fiscal/cfdi/${await idDe(U.C)}`)).data.movimientos[0].movimiento_id;
    expect(s.candidatos.map((k: any) => k.movimiento.id)).toContain(m1);
    // Se cancela para no mover los números de las pruebas que siguen.
    expect((await o('mike', `/fiscal/cfdi/${nueva}/cancelar`, { method: 'POST' })).estado).toBe(200);
  });

  it('sin decir cuáles, revisa primero las que nunca se han revisado', async () => {
    const pedidos = sat(() => new Response(respuesta('Vigente')));
    const r = await o('mike', '/fiscal/verificar', { method: 'POST', json: { limite: 5 } });
    expect(r.data.revisadas).toBe(5);
    expect(pedidos).toHaveLength(5);
    expect(pedidos.some((p) => p.cuerpo.includes(U.A) || p.cuerpo.includes(U.D)), 'las que ya se revisaron van al final de la fila').toBe(false);
    expect(pedidos.some((p) => p.cuerpo.includes(U.C)), 'una cancelada no se vuelve a preguntar').toBe(false);
  });

  it('una capturada a mano no trae con qué preguntar', async () => {
    const pedidos = sat(() => new Response(respuesta('Vigente')));
    const manual = await o('mike', '/fiscal/cfdi', { method: 'POST', app: 'dash101', json: { uuid: uuidDe(700), tipo: 'egreso', subtotal: P(100), iva: P(16), fecha: '2026-06-01' } });
    const r = await o('mike', '/fiscal/verificar', { method: 'POST', json: { ids: [manual.data.id] } });
    expect(r.data.revisadas).toBe(0);
    expect(pedidos).toHaveLength(0);
    expect((await o('mike', '/fiscal/impuestos?anio=2026')).data.avisos.capturadas_a_mano).toBe(1);
  });
});

describe('la migración 0044 sobre una base que ya tenía facturas', () => {
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const entorno = env as unknown as { ORG: DurableObjectNamespace };
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0044')) as unknown as DurableObjectStub;
  const HASTA = MIGRACIONES.findIndex((m) => m.includes('CREATE TABLE IF NOT EXISTS cfdi_conceptos'));
  const NUEVAS = ['cfdi_conceptos', 'cfdi_pagos', 'fiscal_config', 'fiscal_ejercicios', 'fiscal_pagos'];
  const T = '2026-09-20T00:00:00.000Z';
  const foto = (db: any) => JSON.stringify({
    cfdi: db.sql.exec(`SELECT id, uuid, rfc, razon_social, tipo, subtotal, iva, retenciones, total, fecha, forma_pago, estado, creado_por FROM cfdi ORDER BY id`).toArray(),
    ligas: db.sql.exec(`SELECT * FROM cfdi_movimientos ORDER BY cfdi_id`).toArray(),
    movs: db.sql.exec(`SELECT id, monto, facturado, iva, uuid_cfdi FROM movimientos ORDER BY id`).toArray(),
  });
  let antes = '';

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.migrar();
      // Como estaba ANTES de la 0044: sin sus tablas y sin sus columnas.
      db.sql.exec(`DELETE FROM _migraciones WHERE version > ?`, HASTA);
      for (const t of NUEVAS) db.sql.exec(`DROP TABLE ${t}`);
      const puestas = (db.sql.exec(`SELECT name FROM pragma_table_info('cfdi')`).toArray() as any[]).map((c) => c.name);
      for (const m of MIGRACIONES[HASTA].matchAll(/^ALTER TABLE cfdi ADD COLUMN (\w+) /gm)) if (puestas.includes(m[1])) db.sql.exec(`ALTER TABLE cfdi DROP COLUMN ${m[1]}`);
      const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
      x(`INSERT INTO cuentas (id, nombre, tipo, saldo_inicial, creado_at) VALUES ('cu1','Banco','banco',0,?)`, T);
      x(`INSERT INTO movimientos (id, tipo, monto, fecha, cuenta_id, facturado, subtotal, iva, uuid_cfdi, creado_por, creado_at) VALUES ('m1','egreso',116000,'2026-09-01','cu1',1,100000,16000,'AAAAAAAA-0000-4000-8000-000000000001','prueba',?)`, T);
      x(`INSERT INTO cfdi (id, uuid, rfc, razon_social, tipo, subtotal, iva, retenciones, total, fecha, forma_pago, estado, creado_por, creado_at) VALUES ('f1','AAAAAAAA-0000-4000-8000-000000000001','JES900109Q90','Maderas','egreso',100000,16000,0,116000,'2026-09-01','03','vigente','prueba',?)`, T);
      x(`INSERT INTO cfdi (id, uuid, rfc, razon_social, tipo, subtotal, iva, retenciones, total, fecha, forma_pago, estado, creado_por, creado_at) VALUES ('f2','AAAAAAAA-0000-4000-8000-000000000002','URE180429TM6','Cliente','ingreso',5000000,800000,0,5800000,'2026-09-15','03','cancelada','prueba',?)`, T);
      x(`INSERT INTO cfdi_movimientos (cfdi_id, movimiento_id, monto_aplicado, creado_at) VALUES ('f1','m1',116000,?)`, T);
      return true;
    });
    antes = await dentro(elDO(), (db: any) => foto(db));
  });

  it('la base vieja no trae nada de bill101', async () => {
    const r = await dentro(elDO(), (db: any) => ({
      version: db.version(),
      cols: (db.sql.exec(`SELECT name FROM pragma_table_info('cfdi')`).toArray() as any[]).map((c) => c.name),
      tablas: (db.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table'`).toArray() as any[]).map((t) => t.name),
    }));
    expect(r.version).toBe(HASTA);
    expect(r.cols).not.toContain('origen');
    expect(r.cols).not.toContain('tipo_comprobante');
    for (const t of NUEVAS) expect(r.tablas).not.toContain(t);
  });

  it('al migrar no cambia ni un dato de lo que había, y las llaves siguen sanas', async () => {
    const r = await dentro(elDO(), (db: any) => {
      db.migrar();
      return {
        version: db.version(),
        despues: foto(db),
        nuevas: db.sql.exec(`SELECT id, origen, tipo_comprobante, trato, metodo_pago, estado_sat, xml_llave FROM cfdi ORDER BY id`).toArray(),
        tablas: (db.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table'`).toArray() as any[]).map((t) => t.name),
        llaves: db.sql.exec(`PRAGMA foreign_key_check`).toArray(),
      };
    });
    expect(r.version).toBe(MIGRACIONES.length);
    expect(r.despues, 'ni un centavo, ni un estado, ni una liga').toBe(antes);
    expect(r.nuevas).toEqual([
      { id: 'f1', origen: null, tipo_comprobante: null, trato: null, metodo_pago: null, estado_sat: null, xml_llave: null },
      { id: 'f2', origen: null, tipo_comprobante: null, trato: null, metodo_pago: null, estado_sat: null, xml_llave: null },
    ]);
    for (const t of NUEVAS) expect(r.tablas).toContain(t);
    expect(r.llaves).toEqual([]);
  });

  it('lo viejo se lee como lo que es: una factura normal, capturada a mano', async () => {
    const d = await dentro(elDO(), (db: any) => db.fiscal('detalle', ['f1']));
    expect(d).toMatchObject({ origen: 'manual', tipo_comprobante: 'I', trato: 'normal', lado: 'recibida', aplicado: 116000, tiene_xml: false });
    expect(d.movimientos).toHaveLength(1);
  });

  it('y da el mismo IVA por la ruta vieja y por la cuenta nueva', async () => {
    const r = await dentro(elDO(), (db: any) => ({
      vieja: db.ivaDelMes('2026-09-01', '2026-09-30'),
      nueva: db.fiscal('impuestos', [2026]),
    }));
    expect(r.vieja).toMatchObject({ trasladado: 0, acreditable: 16000, facturas: { emitidas: 0, recibidas: 1, canceladas: 1 } });
    expect(r.nueva.meses[8].iva).toMatchObject({ trasladado: 0, acreditable: 16000 });
  });

  it('correrla otra vez no truena ni duplica nada', async () => {
    const r = await dentro(elDO(), (db: any) => {
      db.sql.exec(`DELETE FROM _migraciones WHERE version > ?`, HASTA);
      db.migrar();
      return { version: db.version(), despues: foto(db), cols: (db.sql.exec(`SELECT name FROM pragma_table_info('cfdi')`).toArray() as any[]).map((c) => c.name) };
    });
    expect(r.version).toBe(MIGRACIONES.length);
    expect(r.despues).toBe(antes);
    expect(r.cols.filter((c: string) => c === 'origen')).toHaveLength(1);
  });
});

/* investor101 — rondas de inversión y préstamos a la empresa (0.82.0).
 *
 * Mike, 8-oct-2026: «una plataforma para inversionistas o personas que hacen
 * préstamos/créditos a taller101 durante periodos de tiempo definidos».
 *
 * Dos mitades:
 *   1. LA CUENTA (src/inversion.ts), pura: los ejemplos de Mike dan lo que él
 *      dijo, al centavo, y los centavos no se pierden ni se inventan.
 *   2. LAS RUTAS, contra el Durable Object y el D1 de verdad: una ronda de
 *      punta a punta —abrir, ofrecer, aprobar, depósito, pagar— y, sobre
 *      todo, lo que cada quien NO puede ver ni hacer.
 */
import { SELF, env } from 'cloudflare:test';
import { ponerAcceso, usuarioPorCorreo } from '../src/maestro';
import { beforeAll, describe, expect, it } from 'vitest';
import { interesDelPeriodo, mesesYDias, revisarCondiciones, sumarDias, sumarMeses, tablaDePagos, totalesDe, tasaEnPalabras } from '../src/inversion';
import { hoyMx } from '../src/costos';
import {
  CATEGORIA_PRESTAMO_CAPITAL, CATEGORIA_PRESTAMO_INTERES, CATEGORIA_PRESTAMO_RECIBIDO, CONTRAPARTE_INVERSIONISTA,
} from '../schema/tipos';

/* ════════════════════════ 1 · la cuenta ════════════════════════ */

describe('la cuenta de un préstamo', () => {
  it('el ejemplo de Mike: 50 mil a 10 meses, 5 mil cada mes más el interés sobre saldo', () => {
    const t = tablaDePagos({ monto: 50_000_00, tipo_tasa: 'mensual', tasa_pb: 200, esquema: 'parcialidades', frecuencia: 'mensual', num_pagos: 10, fecha_inicio: '2026-10-08' });
    expect(t).toHaveLength(10);
    expect(t.map((r) => r.capital)).toEqual(Array(10).fill(5_000_00));
    // 2 % mensual sobre lo que se sigue debiendo: 1,000 · 900 · 800 … 100.
    expect(t.map((r) => r.interes)).toEqual([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100].map((p) => p * 100));
    expect(t[0]).toMatchObject({ numero: 1, fecha: '2026-11-08', total: 6_000_00, saldo: 45_000_00 });
    expect(t[9]).toMatchObject({ numero: 10, fecha: '2027-08-08', total: 5_100_00, saldo: 0 });
    expect(totalesDe(t)).toMatchObject({ capital: 50_000_00, interes: 5_500_00, total: 55_500_00, pagos: 10 });
  });

  it('un solo pago a tres semanas: la tasa mensual se prorratea entre 30', () => {
    const t = tablaDePagos({ monto: 30_000_00, tipo_tasa: 'mensual', tasa_pb: 200, esquema: 'unico', fecha_inicio: '2026-10-08', fecha_vencimiento: '2026-10-29' });
    // 30,000 × 2 % × 21/30 = 420.00
    expect(t).toEqual([{ numero: 1, fecha: '2026-10-29', capital: 30_000_00, interes: 420_00, total: 30_420_00, saldo: 0 }]);
  });

  it('un mes entero es un mes, tenga 28 días o 31', () => {
    expect(interesDelPeriodo(10_000_00, 'mensual', 300, '2027-02-08', '2027-03-08')).toBe(300_00); // 28 días
    expect(interesDelPeriodo(10_000_00, 'mensual', 300, '2026-10-08', '2026-11-08')).toBe(300_00); // 31 días
    expect(mesesYDias('2026-10-08', '2026-12-08')).toEqual({ meses: 2, dias: 0 });
    expect(mesesYDias('2026-10-08', '2026-12-20')).toEqual({ meses: 2, dias: 12 });
    // El 31 de enero más un mes es el 28 de febrero, y ese mes ya se cumplió.
    expect(sumarMeses('2027-01-31', 1)).toBe('2027-02-28');
    expect(mesesYDias('2027-01-31', '2027-02-28')).toEqual({ meses: 1, dias: 0 });
    expect(sumarMeses('2026-11-30', 3)).toBe('2027-02-28');
    expect(sumarMeses('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('la tasa anual va por días reales entre 365, redondeada al centavo', () => {
    // 30,000 × 24 % × 21/365 = 414.2465… → 414.25
    expect(interesDelPeriodo(30_000_00, 'anual', 2400, '2026-10-08', '2026-10-29')).toBe(414_25);
    expect(interesDelPeriodo(100_000_00, 'anual', 1200, '2026-01-01', '2027-01-01')).toBe(12_000_00);
  });

  it('la tasa fija es por todo el plazo, sin importar los días, y se reparte pareja', () => {
    const uno = tablaDePagos({ monto: 90_000_00, tipo_tasa: 'fija', tasa_pb: 500, esquema: 'unico', fecha_inicio: '2026-10-08', fecha_vencimiento: '2026-10-29' });
    expect(uno[0].interes).toBe(4_500_00);
    const mismoPlazoMasLargo = tablaDePagos({ monto: 90_000_00, tipo_tasa: 'fija', tasa_pb: 500, esquema: 'unico', fecha_inicio: '2026-10-08', fecha_vencimiento: '2027-03-08' });
    expect(mismoPlazoMasLargo[0].interes).toBe(4_500_00);
    const tres = tablaDePagos({ monto: 10_000_00, tipo_tasa: 'fija', tasa_pb: 1000, esquema: 'parcialidades', frecuencia: 'semanal', num_pagos: 3, fecha_inicio: '2026-10-08' });
    // 1,000.00 de interés entre tres: 333.33 · 333.33 · 333.34. Ni un centavo de más ni de menos.
    expect(tres.map((r) => r.interes)).toEqual([333_33, 333_33, 333_34]);
    expect(tres.map((r) => r.fecha)).toEqual(['2026-10-15', '2026-10-22', '2026-10-29']);
  });

  it('el capital que no se reparte parejo cae en el último pago, y siempre suma lo prestado', () => {
    const t = tablaDePagos({ monto: 100_000_00, tipo_tasa: 'mensual', tasa_pb: 150, esquema: 'parcialidades', frecuencia: 'quincenal', num_pagos: 3, fecha_inicio: '2026-10-08' });
    expect(t.map((r) => r.capital)).toEqual([33_333_33, 33_333_33, 33_333_34]);
    expect(t.map((r) => r.fecha)).toEqual(['2026-10-23', '2026-11-07', '2026-11-22']);
    expect(totalesDe(t).capital).toBe(100_000_00);
    expect(t[2].saldo).toBe(0);
    for (const monto of [1, 7, 999_99, 1_234_567_89]) {
      for (const n of [1, 2, 3, 7, 12]) {
        const x = tablaDePagos({ monto, tipo_tasa: 'anual', tasa_pb: 1850, esquema: 'parcialidades', frecuencia: 'mensual', num_pagos: n, fecha_inicio: '2026-10-08' });
        expect(totalesDe(x).capital, `${monto} en ${n}`).toBe(monto);
        expect(x.every((r) => Number.isInteger(r.interes) && r.interes >= 0 && r.capital >= 0)).toBe(true);
      }
    }
  });

  it('con primer pago fijo, el primer periodo cuenta los días de verdad', () => {
    const t = tablaDePagos({ monto: 10_000_00, tipo_tasa: 'mensual', tasa_pb: 300, esquema: 'parcialidades', frecuencia: 'mensual', num_pagos: 2, fecha_inicio: '2026-10-08', fecha_primer_pago: '2026-11-01' });
    expect(t.map((r) => r.fecha)).toEqual(['2026-11-01', '2026-12-01']);
    expect(t[0].interes).toBe(240_00); // 10,000 × 3 % × 24/30
    expect(t[1].interes).toBe(150_00); // 5,000 × 3 % × 1 mes
  });

  it('una tasa de cero es un préstamo sin interés, no un error', () => {
    const t = tablaDePagos({ monto: 5_000_00, tipo_tasa: 'mensual', tasa_pb: 0, esquema: 'unico', fecha_inicio: '2026-10-08', fecha_vencimiento: '2026-11-08' });
    expect(t[0]).toMatchObject({ interes: 0, total: 5_000_00 });
  });

  it('no se sale del entero seguro con un préstamo grande', () => {
    const t = tablaDePagos({ monto: 500_000_000_00, tipo_tasa: 'anual', tasa_pb: 9999, esquema: 'unico', fecha_inicio: '2026-01-01', fecha_vencimiento: '2027-12-31' });
    expect(Number.isSafeInteger(t[0].interes)).toBe(true);
    expect(t[0].interes).toBe(Math.round((500_000_000_00 * 0.9999 * 729) / 365));
  });

  it('rechaza con palabras lo que no es un préstamo', () => {
    const base = { monto: 10_000_00, tipo_tasa: 'mensual' as const, tasa_pb: 200, esquema: 'unico' as const, fecha_inicio: '2026-10-08', fecha_vencimiento: '2026-11-08' };
    expect(revisarCondiciones(base)).toEqual({});
    expect(revisarCondiciones({ ...base, monto: 100.5 })).toHaveProperty('monto');
    expect(revisarCondiciones({ ...base, monto: 0 })).toHaveProperty('monto');
    expect(revisarCondiciones({ ...base, tasa_pb: 2.5 })).toHaveProperty('tasa_pb');
    expect(revisarCondiciones({ ...base, tasa_pb: -1 })).toHaveProperty('tasa_pb');
    expect(revisarCondiciones({ ...base, tipo_tasa: 'diaria' as never })).toHaveProperty('tipo_tasa');
    expect(revisarCondiciones({ ...base, fecha_inicio: '2026-02-30' })).toHaveProperty('fecha_inicio');
    expect(revisarCondiciones({ ...base, fecha_vencimiento: '2026-10-08' })).toHaveProperty('fecha_vencimiento');
    expect(revisarCondiciones({ ...base, fecha_vencimiento: null })).toHaveProperty('fecha_vencimiento');
    // «Semanas o meses, pero no más»: dos años es el tope.
    expect(revisarCondiciones({ ...base, fecha_vencimiento: '2028-10-08' })).toEqual({});
    expect(revisarCondiciones({ ...base, fecha_vencimiento: '2028-10-09' })).toHaveProperty('fecha_vencimiento');
    const parc = { monto: 10_000_00, tipo_tasa: 'mensual' as const, tasa_pb: 200, esquema: 'parcialidades' as const, frecuencia: 'mensual' as const, num_pagos: 10, fecha_inicio: '2026-10-08' };
    expect(revisarCondiciones(parc)).toEqual({});
    expect(revisarCondiciones({ ...parc, num_pagos: 0 })).toHaveProperty('num_pagos');
    expect(revisarCondiciones({ ...parc, num_pagos: 25 })).toHaveProperty('num_pagos');
    expect(revisarCondiciones({ ...parc, frecuencia: null })).toHaveProperty('frecuencia');
    expect(revisarCondiciones({ ...parc, fecha_primer_pago: '2026-10-08' })).toHaveProperty('fecha_primer_pago');
  });

  it('la tasa se dice como la diría una persona', () => {
    expect(tasaEnPalabras('mensual', 250)).toBe('2.5 % mensual');
    expect(tasaEnPalabras('anual', 2400)).toBe('24 % anual');
    expect(tasaEnPalabras('fija', 525)).toBe('5.25 % por todo el plazo');
  });
});

/* ════════════════════════ 2 · las rutas ════════════════════════ */

const CORREO = 'mike@forespot.com';
const ORG = 'inversion';
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'investor101';
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
const i = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}/inversion${ruta}`, op);
const o = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}${ruta}`, op);

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, JSON.stringify(c)).toBe(200);
  expect(c.data.codigo_prueba, `a ${correo} no le salió código: no tiene cuenta`).toBeTruthy();
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

const HOY = hoyMx();
const en = (dias: number) => sumarDias(HOY, dias);

let cuenta = '';
const ids: Record<string, string> = {};

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Taller de prueba', apps: { dash: true, investor: true, peek: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  const cta = await o('mike', '/cuentas', { method: 'POST', app: 'dash101', json: { nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldo_inicial: 10_000_00 } });
  expect(cta.estado, JSON.stringify(cta)).toBe(201);
  cuenta = cta.data.id;
  for (const [correo, rol] of [['admin@ejemplo.mx', 'admin'], ['oficina@ejemplo.mx', 'staff']]) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo, rol }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBeLessThan(300);
  }
});

describe('la licencia y la puerta', () => {
  it('una empresa sin investor101 prendida contesta app_inactiva', async () => {
    const otra = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: 'sin-investor', nombre: 'Sin investor', apps: { dash: true } }, app: '' });
    expect(otra.estado).toBe(201);
    const r = await pedir('mike', '/orgs/sin-investor/inversion');
    expect(r.estado).toBe(403);
    expect(r.error).toBe('app_inactiva');
    // Y TAMPOCO por dash101, que sí está prendida ahí: la licencia que cuenta
    // es la de investor101, no la de la app por la que se llega.
    for (const [metodo, ruta] of [['GET', ''], ['GET', '/flujo'], ['GET', '/pagos'], ['GET', '/rondas'], ['POST', '/rondas'], ['POST', '/inversionistas'], ['POST', '/simular']] as const) {
      const d = await pedir('mike', `/orgs/sin-investor/inversion${ruta}`, { app: 'dash101', method: metodo, json: metodo === 'GET' ? undefined : { nombre: 'X', monto_meta: 100 } });
      expect(d.estado, `dash101 ${metodo} ${ruta}`).toBe(403);
      expect(d.error, `dash101 ${metodo} ${ruta}`).toBe('app_inactiva');
    }
  });

  it('quien dirige entra como admin; el resumen arranca en ceros', async () => {
    const r = await i('mike', '');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.papel).toBe('admin');
    expect(r.data.empresa).toMatchObject({ id: ORG, nombre: 'Taller de prueba' });
    expect(r.data.resumen).toMatchObject({ capital_vigente: 0, prestamos_activos: 0, rondas_abiertas: 0, ofertas_pendientes: 0 });
  });

  it('alguien de oficina (ni dueño ni administración) no administra', async () => {
    await entrar('oficina', 'oficina@ejemplo.mx');
    for (const ruta of ['', '/inversionistas', '/rondas', '/prestamos', '/pagos', '/flujo']) {
      const r = await i('oficina', ruta);
      expect(r.estado, ruta).toBe(403);
    }
  });

  it('otra app de la suite no administra préstamos; dash101 sí', async () => {
    const quote = await i('mike', '/rondas', { app: 'cotizador101' });
    expect([403]).toContain(quote.estado);
    const dash = await i('mike', '/flujo', { app: 'dash101' });
    expect(dash.estado, JSON.stringify(dash)).toBe(200);
    expect(dash.data).toEqual({ pagos: [], depositos: [] });
  });
});

describe('el directorio de inversionistas', () => {
  it('se da de alta con nombre, correo y teléfono; el correo se normaliza y queda con cuenta', async () => {
    const r = await i('mike', '/inversionistas', { method: 'POST', json: { nombre: '  Ana Robles ', correo: 'Ana@Ejemplo.MX', telefono: '55 1234 5678', clabe: '0021 8001 2345 6789 01', banco: 'Banamex' } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    ids.ana = r.data.id;
    expect(r.data).toMatchObject({ nombre: 'Ana Robles', nombre_norm: 'ana robles', correo: 'ana@ejemplo.mx', telefono: '5512345678', clabe: '002180012345678901', activo: true, recibe_avisos: true });
    expect(r.data.usuario_id, 'sin cuenta, su correo no abre nada').toBeTruthy();
    for (const [k, d] of [['beto', { nombre: 'Beto Cruz', correo: 'beto@ejemplo.mx', telefono: '+52 81 5555 0000' }], ['caro', { nombre: 'Caro Díaz', correo: 'caro@ejemplo.mx' }], ['sincorreo', { nombre: 'Don Efra', telefono: '5500001111' }]] as const) {
      const x = await i('mike', '/inversionistas', { method: 'POST', json: d });
      expect(x.estado, JSON.stringify(x)).toBe(201);
      ids[k] = x.data.id;
    }
    const lista = await i('mike', '/inversionistas');
    expect(lista.data.filas.map((f: any) => f.nombre)).toEqual(['Ana Robles', 'Beto Cruz', 'Caro Díaz', 'Don Efra']);
    expect(lista.data.filas.every((f: any) => f.es_prospecto && f.capital_vigente === 0)).toBe(true);
  });

  it('rechaza con palabras: sin nombre, correo chueco, teléfono corto, CLABE corta, correo repetido', async () => {
    const sin = await i('mike', '/inversionistas', { method: 'POST', json: { correo: 'x@ejemplo.mx' } });
    expect(sin.estado).toBe(400);
    expect(sin.detalle.errores).toHaveProperty('nombre');
    const mal = await i('mike', '/inversionistas', { method: 'POST', json: { nombre: 'X', correo: 'sin-arroba', telefono: '123', clabe: '1234' } });
    expect(mal.estado).toBe(400);
    expect(Object.keys(mal.detalle.errores).sort()).toEqual(['clabe', 'correo', 'telefono']);
    const rep = await i('mike', '/inversionistas', { method: 'POST', json: { nombre: 'Otra Ana', correo: 'ana@ejemplo.mx' } });
    expect(rep.estado).toBe(409);
    expect(rep.error).toBe('correo_repetido');
  });

  it('el inversionista entra con su correo y ve su estado de cuenta vacío; /yo dice a quién le presta', async () => {
    await entrar('ana', 'ana@ejemplo.mx');
    const yo = await pedir('ana', '/yo', { app: '' });
    expect(yo.data.orgs).toEqual([]);
    expect(yo.data.inversion).toEqual([{ org_id: ORG, nombre: 'Taller de prueba', ref_id: ids.ana }]);
    const r = await i('ana', '');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.papel).toBe('inversionista');
    expect(r.data.inversionista).toMatchObject({ id: ids.ana, nombre: 'Ana Robles' });
    expect(r.data.resumen).toMatchObject({ invertido: 0, por_recibir: 0, prestamos_activos: 0 });
    expect(r.data.prestamos).toEqual([]);
    expect(r.data).not.toHaveProperty('ajustes');
  });

  it('UN INVERSIONISTA NO ABRE NADA MÁS: ni tablas, ni la empresa, ni otra app, ni lo de quien dirige', async () => {
    for (const ruta of ['', '/movimientos', '/cuentas', '/clientes', '/proyectos', '/pool', '/empresa', '/ordenes', '/accionistas', '/ajustes', `/archivos/x`, '/peek', '/costos']) {
      const r = await o('ana', ruta);
      expect(r.estado, `investor101 ${ruta || '/'}`).toBe(403);
    }
    for (const app of ['dash101', 'peek101', 'cotizador101', 'supply101', 'quell101']) {
      const r = await o('ana', '/inversion', { app });
      expect(r.estado, app).toBe(403);
      const m = await o('ana', '/movimientos', { app });
      expect(m.estado, `${app} movimientos`).toBe(403);
    }
    for (const [metodo, ruta] of [['GET', '/inversionistas'], ['POST', '/inversionistas'], ['GET', `/inversionistas/${ids.ana}`], ['POST', '/rondas'], ['GET', '/pagos'], ['GET', '/flujo'], ['GET', '/ajustes'], ['PUT', '/ajustes'], ['POST', '/prestamos']] as const) {
      const r = await i('ana', ruta, { method: metodo, json: metodo === 'GET' ? undefined : {} });
      expect(r.estado, `${metodo} ${ruta}`).toBe(403);
    }
    const otraEmpresa = await pedir('ana', '/orgs/sin-investor/inversion');
    expect(otraEmpresa.estado).toBe(403);
  });

  it('quien no tiene correo, o se desactiva, o cambia de correo: el acceso sigue al dato', async () => {
    const sinCorreo = await pedir('nadie', '/auth/codigo', { method: 'POST', json: { correo: 'efra@ejemplo.mx' }, app: '' });
    expect(sinCorreo.data.enviado).toBe(false);
    // Se le pone correo: ahora sí tiene cuenta.
    const pon = await i('mike', `/inversionistas/${ids.sincorreo}`, { method: 'PATCH', json: { correo: 'efra@ejemplo.mx' } });
    expect(pon.estado, JSON.stringify(pon)).toBe(200);
    await entrar('efra', 'efra@ejemplo.mx');
    expect((await i('efra', '')).estado).toBe(200);
    // Se desactiva: la misma sesión ya no abre.
    await i('mike', `/inversionistas/${ids.sincorreo}`, { method: 'PATCH', json: { activo: false } });
    expect((await i('efra', '')).estado).toBe(403);
    await i('mike', `/inversionistas/${ids.sincorreo}`, { method: 'PATCH', json: { activo: true } });
    expect((await i('efra', '')).estado).toBe(200);
    // Cambia de correo: el viejo deja de abrir.
    await i('mike', `/inversionistas/${ids.sincorreo}`, { method: 'PATCH', json: { correo: 'efra.nuevo@ejemplo.mx' } });
    expect((await i('efra', '')).estado).toBe(403);
    // Sin préstamos ni ofertas, se puede borrar.
    const b = await i('mike', `/inversionistas/${ids.sincorreo}`, { method: 'DELETE' });
    expect(b.estado, JSON.stringify(b)).toBe(200);
  });
});

describe('una ronda, de punta a punta', () => {
  it('dash101 la deja en borrador desde un hueco de su flujo, con lo mínimo', async () => {
    const r = await i('mike', '/rondas', { method: 'POST', app: 'dash101', json: { nombre: 'Puente de octubre', monto_meta: 90_000_00, fecha_inicio: en(3), fecha_vencimiento: en(24), origen: { desde: en(0), hasta: en(21), deficit: 90_000_00 } } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    ids.ronda = r.data.id;
    expect(r.data).toMatchObject({ folio: 'RON-000001', estado: 'borrador', monto_meta: 90_000_00, tipo_tasa: 'mensual', tasa_pb: 0, esquema: 'unico', fecha_inicio: en(3), fecha_vencimiento: en(24) });
    expect(r.data.origen).toMatchObject({ app: 'dash101', deficit: 90_000_00 });
    expect(r.data.avance).toMatchObject({ juntado: 0, falta: 90_000_00, porcentaje: 0 });
    const sin = await i('mike', '/rondas', { method: 'POST', json: { nombre: '', monto_meta: 0 } });
    expect(sin.estado).toBe(400);
    expect(Object.keys(sin.detalle.errores).sort()).toEqual(['monto_meta', 'nombre']);
  });

  it('un borrador no lo ve nadie de afuera, ni se le puede ofrecer ni avisar', async () => {
    expect((await i('ana', '/rondas')).data.filas).toEqual([]);
    expect((await i('ana', `/rondas/${ids.ronda}`)).estado).toBe(404);
    const of = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 10_000_00 } });
    expect(of.estado).toBe(409);
    expect(of.error).toBe('ronda_no_esta_abierta');
    expect((await i('mike', `/rondas/${ids.ronda}/avisar`, { method: 'POST', json: {} })).estado).toBe(409);
  });

  it('se detalla en investor101 y se abre; abrir revisa las condiciones completas', async () => {
    const mal = await i('mike', `/rondas/${ids.ronda}`, { method: 'PATCH', json: { fecha_vencimiento: en(1) } });
    expect(mal.estado).toBe(200); // en borrador se deja a medias…
    const abre = await i('mike', `/rondas/${ids.ronda}/abrir`, { method: 'POST' });
    expect(abre.estado, '…pero no se abre con el pago antes del inicio').toBe(400);
    expect(abre.detalle.errores).toHaveProperty('fecha_vencimiento');

    const p = await i('mike', `/rondas/${ids.ronda}`, { method: 'PATCH', json: {
      descripcion: 'Tres semanas de nómina mientras cobra la obra.', tasa_pb: 300, fecha_vencimiento: en(24), monto_minimo: 5_000_00,
      instrucciones: 'BBVA · CLABE 012180001234567895 · Taller de prueba SA de CV',
    } });
    expect(p.estado, JSON.stringify(p)).toBe(200);
    expect(p.data.ejemplo.totales).toMatchObject({ capital: 10_000_00, interes: 210_00 }); // 3 % × 21/30 de 10,000
    const ok = await i('mike', `/rondas/${ids.ronda}/abrir`, { method: 'POST' });
    expect(ok.estado, JSON.stringify(ok)).toBe(200);
    expect(ok.data.estado).toBe('abierta');
    expect(ok.data.abierta_at).toBeTruthy();
  });

  it('el aviso: a quién, con qué palabras y con su liga de WhatsApp; fuera de producción el correo no sale', async () => {
    const previo = await i('mike', `/rondas/${ids.ronda}/aviso`);
    expect(previo.data.filas.map((f: any) => f.nombre)).toEqual(['Ana Robles', 'Beto Cruz', 'Caro Díaz']);
    const ana = previo.data.filas[0];
    expect(ana.whatsapp).toMatch(/^https:\/\/wa\.me\/525512345678\?text=/);
    expect(previo.data.filas[1].whatsapp).toMatch(/^https:\/\/wa\.me\/528155550000\?text=/);
    expect(previo.data.filas[2].whatsapp, 'sin teléfono no hay liga').toBeNull();
    expect(ana.mensaje).toContain('Hola, Ana.');
    expect(ana.mensaje).toContain('Puente de octubre');
    expect(ana.mensaje).toContain('$90,000.00');
    expect(ana.mensaje).toContain('3 % mensual');
    expect(ana.mensaje).toContain('$10,210.00');
    expect(ana.mensaje).toContain('/#/ronda/');
    const manda = await i('mike', `/rondas/${ids.ronda}/avisar`, { method: 'POST', json: { a: [ids.ana, ids.beto] } });
    expect(manda.estado, JSON.stringify(manda)).toBe(200);
    expect(manda.data.filas).toHaveLength(2);
    expect(manda.data.filas[0].correo_enviado).toMatchObject({ enviado: false, para: 'ana@ejemplo.mx' });
    const todos = await i('mike', `/rondas/${ids.ronda}/avisar`, { method: 'POST', json: {} });
    expect(todos.data.filas).toHaveLength(3);
  });

  it('el inversionista ve las condiciones y el avance total, y nada de los demás', async () => {
    const r = await i('ana', `/rondas/${ids.ronda}`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ nombre: 'Puente de octubre', estado: 'abierta', monto_meta: 90_000_00, tasa_pb: 300, monto_minimo: 5_000_00 });
    expect(r.data.avance).toEqual({ juntado: 0, falta: 90_000_00, porcentaje: 0 });
    expect(r.data.instrucciones, 'a dónde depositar se dice hasta que se le acepta').toBeNull();
    expect(r.data.mis_ofertas).toEqual([]);
    for (const k of ['ofertas', 'prestamos', 'origen', 'creado_por']) expect(r.data, k).not.toHaveProperty(k);
    // 0.84.0 · El aviso de riesgos viene con la ronda, y dice lo del no pago del cliente.
    expect(r.data.riesgos).toContain('Si un cliente se atrasa o no paga');
  });

  it('0.84.0 · sin aceptar los riesgos, quien presta no ofrece; aceptarlos deja la hora y el texto', async () => {
    for (const cuerpo of [{ monto: 40_000_00 }, { monto: 40_000_00, acepta_riesgos: false }, { monto: 40_000_00, acepta_riesgos: 'true' }, { monto: 40_000_00, acepta_riesgos: 1 }]) {
      const sin = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: cuerpo });
      expect(sin.estado, JSON.stringify(cuerpo)).toBe(400);
      expect(sin.error).toBe('riesgos_sin_aceptar');
    }
    expect((await i('ana', `/rondas/${ids.ronda}`)).data.mis_ofertas, 'un rechazo no deja oferta').toEqual([]);
  });

  it('«le entro con tanto»: queda pendiente; volver a ofrecer la cambia, no la duplica', async () => {
    const poco = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 1_000_00 } });
    expect(poco.estado).toBe(400);
    expect(poco.detalle.errores.monto).toContain('mínimo');
    const flot = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 50000.5 } });
    expect(flot.estado).toBe(400);

    const a = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 40_000_00, nota: 'El lunes deposito' } });
    expect(a.estado, JSON.stringify(a)).toBe(201);
    ids.ofertaAna = a.data.id;
    expect(a.data).toMatchObject({ estado: 'pendiente', monto: 40_000_00, inversionista_id: ids.ana });
    const a2 = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 50_000_00 } });
    expect(a2.data.id).toBe(ids.ofertaAna);
    expect(a2.data.monto).toBe(50_000_00);
    // Un inversionista no ofrece a nombre de otro, aunque mande su id.
    const trampa = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 6_000_00, inversionista_id: ids.beto } });
    expect(trampa.data.inversionista_id).toBe(ids.ana);
    await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 50_000_00 } });

    await entrar('beto', 'beto@ejemplo.mx');
    const b = await i('beto', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 30_000_00 } });
    ids.ofertaBeto = b.data.id;
    // Quien dirige captura la de alguien que se lo dijo por teléfono.
    const c = await i('mike', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { inversionista_id: ids.caro, monto: 20_000_00 } });
    expect(c.estado, JSON.stringify(c)).toBe(201);
    ids.ofertaCaro = c.data.id;

    const ronda = await i('mike', `/rondas/${ids.ronda}`);
    expect(ronda.data.ofertas.map((x: any) => [x.inversionista_nombre, x.monto, x.estado])).toEqual([['Ana Robles', 50_000_00, 'pendiente'], ['Beto Cruz', 30_000_00, 'pendiente'], ['Caro Díaz', 20_000_00, 'pendiente']]);
    expect(ronda.data.avance).toMatchObject({ juntado: 0, por_aprobar: 100_000_00, ofertas_pendientes: 3 });
    // Lo ofrecido no es «juntado»: Beto sigue viendo cero, y sólo su oferta.
    const vistaBeto = await i('beto', `/rondas/${ids.ronda}`);
    expect(vistaBeto.data.avance.juntado).toBe(0);
    expect(vistaBeto.data.mis_ofertas).toHaveLength(1);
    expect(vistaBeto.data.mis_ofertas[0].monto).toBe(30_000_00);
    // 0.84.0 · Quien ofreció por sí mismo aceptó los riesgos; la que capturó
    // quien dirige (Caro, por teléfono) no trae aceptación, y no se finge.
    expect(vistaBeto.data.mis_ofertas[0].riesgos_aceptados_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const porQuien = Object.fromEntries(ronda.data.ofertas.map((x: any) => [x.inversionista_nombre, x.riesgos_aceptados_at]));
    expect(porQuien['Ana Robles']).toMatch(/^\d{4}-/);
    expect(porQuien['Beto Cruz']).toMatch(/^\d{4}-/);
    expect(porQuien['Caro Díaz']).toBeNull();
    for (const o of ronda.data.ofertas) expect(o, 'el texto no viaja en la lista').not.toHaveProperty('riesgos_texto');
  });

  it('nadie retira ni resuelve la oferta de otro', async () => {
    expect((await i('beto', `/ofertas/${ids.ofertaAna}/retirar`, { method: 'POST' })).estado).toBe(404);
    expect((await i('beto', `/ofertas/${ids.ofertaBeto}/aprobar`, { method: 'POST', json: {} })).estado).toBe(403);
    expect((await i('beto', `/ofertas/${ids.ofertaAna}/rechazar`, { method: 'POST', json: {} })).estado).toBe(403);
  });

  it('quien dirige aprueba (ajustando el monto), y rechaza con motivo; cada aprobada es un préstamo por depositar', async () => {
    const a = await i('mike', `/ofertas/${ids.ofertaAna}/aprobar`, { method: 'POST', json: {} });
    expect(a.estado, JSON.stringify(a)).toBe(200);
    ids.pAna = a.data.prestamo.id;
    expect(a.data.oferta).toMatchObject({ estado: 'aprobada', monto_aprobado: 50_000_00, prestamo_id: ids.pAna });
    expect(a.data.prestamo).toMatchObject({ folio: 'PRE-000001', estado: 'por_depositar', monto: 50_000_00, tipo_tasa: 'mensual', tasa_pb: 300, esquema: 'unico', fecha_inicio: en(3), fecha_vencimiento: en(24) });
    expect(a.data.prestamo.pagos).toHaveLength(1);
    expect(a.data.prestamo.pagos[0]).toMatchObject({ numero: 1, fecha: en(24), capital: 50_000_00, interes: 1_050_00, total: 51_050_00, estado: 'pendiente' });
    expect(a.data.correo).toMatchObject({ enviado: false, para: 'ana@ejemplo.mx' });
    // 0.84.0 · El préstamo carga el aviso que Ana aceptó, con su hora: es lo que imprime el pagaré.
    expect(a.data.prestamo.riesgos.aceptados_at).toMatch(/^\d{4}-/);
    expect(a.data.prestamo.riesgos.texto).toContain('Si un cliente se atrasa o no paga');

    // A Beto se le acepta menos de lo que ofreció, y en parcialidades: «libre por préstamo».
    const b = await i('mike', `/ofertas/${ids.ofertaBeto}/aprobar`, { method: 'POST', json: { monto_aprobado: 20_000_00, condiciones: { esquema: 'parcialidades', frecuencia: 'semanal', num_pagos: 4, tipo_tasa: 'fija', tasa_pb: 400 } } });
    expect(b.estado, JSON.stringify(b)).toBe(200);
    ids.pBeto = b.data.prestamo.id;
    expect(b.data.oferta).toMatchObject({ monto: 30_000_00, monto_aprobado: 20_000_00 });
    expect(b.data.prestamo.pagos.map((g: any) => [g.fecha, g.capital, g.interes])).toEqual([1, 2, 3, 4].map((k) => [en(3 + 7 * k), 5_000_00, 200_00]));

    const c = await i('mike', `/ofertas/${ids.ofertaCaro}/rechazar`, { method: 'POST', json: { motivo: 'Ya se juntó lo que hacía falta.' } });
    expect(c.estado, JSON.stringify(c)).toBe(200);
    expect(c.data.oferta).toMatchObject({ estado: 'rechazada', motivo: 'Ya se juntó lo que hacía falta.' });
    // Lo resuelto no se vuelve a resolver.
    expect((await i('mike', `/ofertas/${ids.ofertaAna}/aprobar`, { method: 'POST', json: {} })).estado).toBe(409);
    expect((await i('ana', `/ofertas/${ids.ofertaAna}/retirar`, { method: 'POST' })).estado).toBe(409);

    const ronda = await i('mike', `/rondas/${ids.ronda}`);
    expect(ronda.data.avance).toMatchObject({ juntado: 70_000_00, recibido: 0, falta: 20_000_00, porcentaje: 78, ofertas_pendientes: 0 });
    // Y ése es el avance que ve cualquiera de afuera: el total, sin nombres.
    const vista = await i('ana', `/rondas/${ids.ronda}`);
    expect(vista.data.avance).toEqual({ juntado: 70_000_00, falta: 20_000_00, porcentaje: 78 });
    expect(vista.data.instrucciones, 'ya aceptada, ya ve a dónde depositar').toContain('CLABE');
    expect(JSON.stringify(vista.data)).not.toContain('Beto');
  });

  it('cada quien ve SU préstamo; el del otro no existe para él', async () => {
    const mio = await i('ana', `/prestamos/${ids.pAna}`);
    expect(mio.estado, JSON.stringify(mio)).toBe(200);
    expect(mio.data).toMatchObject({ folio: 'PRE-000001', estado: 'por_depositar', monto: 50_000_00 });
    expect(mio.data.instrucciones).toContain('CLABE');
    for (const k of ['notas', 'creado_por', 'cuenta_id', 'movimiento_id']) expect(mio.data, k).not.toHaveProperty(k);
    expect(mio.data.inversionista).toEqual({ id: ids.ana, nombre: 'Ana Robles' });
    expect((await i('ana', `/prestamos/${ids.pBeto}`)).estado).toBe(404);
    const lista = await i('ana', '/prestamos');
    expect(lista.data.filas.map((f: any) => f.id)).toEqual([ids.pAna]);
    const conFiltro = await i('ana', `/prestamos?inversionista_id=${ids.beto}`);
    expect(conFiltro.data.filas.map((f: any) => f.id), 'el filtro no le abre lo de otro').toEqual([ids.pAna]);
    // Y no lo edita, ni lo marca recibido, ni se paga solo.
    expect((await i('ana', `/prestamos/${ids.pAna}`, { method: 'PATCH', json: { tasa_pb: 9000 } })).estado).toBe(403);
    expect((await i('ana', `/prestamos/${ids.pAna}/recibido`, { method: 'POST', json: { cuenta_id: cuenta } })).estado).toBe(403);
    expect((await i('ana', `/prestamos/${ids.pAna}/tabla`, { method: 'PUT', json: {} })).estado).toBe(403);
    expect((await i('ana', `/pagos/${mio.data.pagos[0].id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } })).estado).toBe(403);
  });

  it('lo que dash101 pone en su flujo: los depósitos que van a entrar y los pagos que van a salir', async () => {
    const f = await i('mike', '/flujo', { app: 'dash101' });
    expect(f.data.depositos.map((d: any) => [d.folio, d.monto, d.fecha, d.inversionista_nombre])).toEqual([['PRE-000001', 50_000_00, en(3), 'Ana Robles'], ['PRE-000002', 20_000_00, en(3), 'Beto Cruz']]);
    expect(f.data.pagos).toHaveLength(5);
    expect(f.data.pagos.reduce((s: number, g: any) => s + g.total, 0)).toBe(51_050_00 + 20_800_00);
    expect(f.data.pagos.every((g: any) => g.vencido === false)).toBe(true);
    // El buzón de pagos, en cambio, sólo trae lo de préstamos que ya arrancaron.
    expect((await i('mike', '/pagos', { app: 'dash101' })).data.filas).toEqual([]);
  });
});

describe('el dinero llega, y el préstamo arranca', () => {
  it('no se paga lo que no ha arrancado', async () => {
    const p = await i('mike', `/prestamos/${ids.pAna}`);
    const r = await i('mike', `/pagos/${p.data.pagos[0].id}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(r.estado).toBe(409);
    expect(r.error).toBe('prestamo_no_activo');
  });

  it('el inversionista sube su comprobante; el otro no lo alcanza', async () => {
    const forma = new FormData();
    forma.set('archivo', new File([new Uint8Array([37, 80, 68, 70])], 'depósito ana.pdf', { type: 'application/pdf' }));
    forma.set('prestamo_id', ids.pAna);
    forma.set('clase', 'comprobante_deposito');
    const r = await i('ana', '/archivos', { method: 'POST', body: forma });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    ids.archivo = r.data.id;
    expect(r.data).toMatchObject({ clase: 'comprobante_deposito', mime: 'application/pdf', bytes: 4 });
    expect(r.data).not.toHaveProperty('r2_key');

    const baja = await SELF.fetch(`https://api.local/orgs/${ORG}/inversion/archivos/${ids.archivo}`, { headers: { 'X-App': 'investor101', Cookie: galletas.ana } });
    expect(baja.status).toBe(200);
    expect(baja.headers.get('Content-Type')).toBe('application/pdf');
    expect(new Uint8Array(await baja.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect((await i('beto', `/archivos/${ids.archivo}`)).estado).toBe(404);
    expect((await i('beto', `/archivos/${ids.archivo}`, { method: 'DELETE' })).estado).toBe(404);

    // No sube papeles al préstamo de otro, ni comprobantes de pago, ni un .exe.
    const ajeno = new FormData();
    ajeno.set('archivo', new File(['x'], 'x.pdf', { type: 'application/pdf' }));
    ajeno.set('prestamo_id', ids.pBeto);
    ajeno.set('clase', 'comprobante_deposito');
    expect((await i('ana', '/archivos', { method: 'POST', body: ajeno })).estado).toBe(404);
    const dePago = new FormData();
    dePago.set('archivo', new File(['x'], 'x.pdf', { type: 'application/pdf' }));
    dePago.set('prestamo_id', ids.pAna);
    dePago.set('clase', 'comprobante_pago');
    expect((await i('ana', '/archivos', { method: 'POST', body: dePago })).estado).toBe(403);
    const exe = new FormData();
    exe.set('archivo', new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' }));
    exe.set('prestamo_id', ids.pAna);
    exe.set('clase', 'comprobante_deposito');
    const rx = await i('ana', '/archivos', { method: 'POST', body: exe });
    expect(rx.estado).toBe(400);
    expect(rx.error).toBe('archivo_no_aceptado');

    const visto = await i('mike', `/prestamos/${ids.pAna}`);
    expect(visto.data.archivos.map((a: any) => [a.clase, a.nombre])).toEqual([['comprobante_deposito', 'depósito ana.pdf']]);
  });

  it('marcar recibido: nace el ingreso, sube el saldo de la cuenta, y la tabla se rehace con la fecha de verdad', async () => {
    const futuro = await i('mike', `/prestamos/${ids.pAna}/recibido`, { method: 'POST', json: { cuenta_id: cuenta, fecha: en(1) } });
    expect(futuro.estado, 'un depósito de mañana no ha llegado').toBe(400);
    const sinCuenta = await i('mike', `/prestamos/${ids.pAna}/recibido`, { method: 'POST', json: {} });
    expect(sinCuenta.estado).toBe(400);
    const cuentaRara = await i('mike', `/prestamos/${ids.pAna}/recibido`, { method: 'POST', json: { cuenta_id: 'no-existe' } });
    expect(cuentaRara.estado).toBe(404);

    // Llegó HOY, tres días antes de lo estimado: son 24 días de interés, no 21.
    const r = await i('mike', `/prestamos/${ids.pAna}/recibido`, { method: 'POST', app: 'dash101', json: { cuenta_id: cuenta } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.prestamo).toMatchObject({ estado: 'activo', fecha_inicio: HOY, cuenta_id: cuenta });
    expect(r.data.prestamo.pagos).toHaveLength(1);
    expect(r.data.prestamo.pagos[0]).toMatchObject({ fecha: en(24), capital: 50_000_00, interes: 1_200_00 }); // 50,000 × 3 % × 24/30
    ids.pagoAna = r.data.prestamo.pagos[0].id;

    const mov = await o('mike', `/movimientos/${r.data.movimiento_id}`, { app: 'dash101' });
    expect(mov.estado, JSON.stringify(mov)).toBe(200);
    expect(mov.data).toMatchObject({ tipo: 'ingreso', monto: 50_000_00, fecha: HOY, cuenta_id: cuenta, categoria: CATEGORIA_PRESTAMO_RECIBIDO, contraparte_tipo: CONTRAPARTE_INVERSIONISTA, contraparte_id: ids.ana, contraparte_nombre: 'Ana Robles' });
    expect(mov.data.descripcion).toBe('PRE-000001 · Préstamo de Ana Robles');
    const ctas = await o('mike', '/cuentas', { app: 'dash101' });
    expect(ctas.data.filas[0].saldo).toBe(10_000_00 + 50_000_00);

    expect((await i('mike', `/prestamos/${ids.pAna}/recibido`, { method: 'POST', json: { cuenta_id: cuenta } })).estado, 'dos veces no').toBe(409);
    expect((await i('mike', `/prestamos/${ids.pAna}`, { method: 'PATCH', json: { tasa_pb: 100 } })).estado, 'ya arrancado, las condiciones no se tocan').toBe(409);
    expect((await i('mike', `/prestamos/${ids.pAna}/cancelar`, { method: 'POST', json: {} })).estado).toBe(409);
  });

  it('el de Beto llega también; ya no hay depósitos por recibir y la ronda dice cuánto llegó', async () => {
    const r = await i('mike', `/prestamos/${ids.pBeto}/recibido`, { method: 'POST', json: { cuenta_id: cuenta, fecha: HOY } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    // Tasa fija: el interés no cambia aunque el dinero llegue antes; las fechas sí.
    expect(r.data.prestamo.pagos.map((g: any) => [g.fecha, g.capital, g.interes])).toEqual([1, 2, 3, 4].map((k) => [en(7 * k), 5_000_00, 200_00]));
    ids.pagosBeto = r.data.prestamo.pagos.map((g: any) => g.id).join(',');
    const f = await i('mike', '/flujo', { app: 'dash101' });
    expect(f.data.depositos).toEqual([]);
    const ronda = await i('mike', `/rondas/${ids.ronda}`);
    expect(ronda.data.avance).toMatchObject({ juntado: 70_000_00, recibido: 70_000_00 });
    const res = await i('mike', '');
    expect(res.data.resumen).toMatchObject({ capital_vigente: 70_000_00, interes_por_pagar: 1_200_00 + 800_00, prestamos_activos: 2 });
    expect(res.data.resumen.proximos_30).toEqual({ cuantos: 5, monto: 51_200_00 + 20_800_00 });
    const dir = await i('mike', '/inversionistas');
    const fila = (n: string) => dir.data.filas.find((x: any) => x.nombre === n);
    expect(fila('Ana Robles')).toMatchObject({ es_prospecto: false, capital_vigente: 50_000_00, prestamos_activos: 1 });
    expect(fila('Caro Díaz')).toMatchObject({ es_prospecto: true, capital_vigente: 0 });
  });

  it('el estado de cuenta del inversionista: cuánto tiene, cuánto le van a pagar y cuándo', async () => {
    const r = await i('beto', '');
    expect(r.data.resumen).toMatchObject({ invertido: 20_000_00, por_recibir: 20_800_00, interes_ganado: 0, interes_por_ganar: 800_00, prestamos_activos: 1 });
    expect(r.data.resumen.proximo).toMatchObject({ numero: 1, de: 4, fecha: en(7), total: 5_200_00, vencido: false });
    expect(r.data.proximos).toHaveLength(4);
    expect(r.data.prestamos).toHaveLength(1);
    expect(r.data.prestamos[0].resumen).toMatchObject({ capital_pendiente: 20_000_00, pagos_hechos: 0, pagos_total: 4 });
  });
});

describe('los pagos', () => {
  it('pagar deja dos egresos —capital e interés—, baja el saldo, y lo ve quien prestó', async () => {
    const [p1] = ids.pagosBeto.split(',');
    const buzon = await i('mike', '/pagos', { app: 'dash101' });
    expect(buzon.data.filas).toHaveLength(5);
    expect(buzon.data.filas[0]).toMatchObject({ id: p1, folio: 'PRE-000002', inversionista_nombre: 'Beto Cruz', numero: 1, de: 4, total: 5_200_00, vencido: false });

    const r = await i('mike', `/pagos/${p1}/pagar`, { method: 'POST', app: 'dash101', json: { cuenta_id: cuenta, fecha: HOY, nota: 'SPEI 123' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.liquidado).toBe(false);
    expect(r.data.pago).toMatchObject({ estado: 'pagado', pagado_fecha: HOY, total: 5_200_00 });
    expect(r.data.movimientos).toHaveLength(2);
    const [mc, mi] = await Promise.all(r.data.movimientos.map((m: string) => o('mike', `/movimientos/${m}`, { app: 'dash101' })));
    expect(mc.data).toMatchObject({ tipo: 'egreso', monto: 5_000_00, categoria: CATEGORIA_PRESTAMO_CAPITAL, contraparte_tipo: CONTRAPARTE_INVERSIONISTA, contraparte_id: ids.beto, fecha: HOY });
    expect(mi.data).toMatchObject({ tipo: 'egreso', monto: 200_00, categoria: CATEGORIA_PRESTAMO_INTERES });
    expect(mc.data.descripcion).toBe('PRE-000002 · pago 1 de 4 a Beto Cruz · capital');
    const ctas = await o('mike', '/cuentas', { app: 'dash101' });
    expect(ctas.data.filas[0].saldo).toBe(10_000_00 + 70_000_00 - 5_200_00);

    expect((await i('mike', `/pagos/${p1}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } })).estado, 'dos veces no').toBe(409);

    // El comprobante del pago lo sube quien paga, y lo baja quien prestó.
    const forma = new FormData();
    forma.set('archivo', new File([new Uint8Array([1, 2, 3])], 'spei.png', { type: 'image/png' }));
    forma.set('prestamo_id', ids.pBeto);
    forma.set('pago_id', p1);
    forma.set('clase', 'comprobante_pago');
    const sube = await i('mike', '/archivos', { method: 'POST', app: 'dash101', body: forma });
    expect(sube.estado, JSON.stringify(sube)).toBe(201);
    const mio = await i('beto', `/prestamos/${ids.pBeto}`);
    expect(mio.data.resumen).toMatchObject({ capital_pagado: 5_000_00, interes_pagado: 200_00, capital_pendiente: 15_000_00, pagos_hechos: 1 });
    expect(mio.data.pagos[0]).toMatchObject({ estado: 'pagado', pagado_fecha: HOY });
    expect(mio.data.pagos[0]).not.toHaveProperty('movimiento_capital_id');
    expect(mio.data.archivos.map((a: any) => [a.clase, a.pago_id])).toEqual([['comprobante_pago', p1]]);
    expect((await i('beto', `/archivos/${sube.data.id}`)).estado).toBe(200);
    expect((await i('ana', `/archivos/${sube.data.id}`)).estado).toBe(404);
    expect((await i('beto', `/archivos/${sube.data.id}`, { method: 'DELETE' })).estado, 'no quita lo que subió la empresa').toBe(403);
    expect(mio.data.eventos.map((e: any) => e.que)).toEqual(['prestamo_creado', 'recibido', 'pago']);
    expect(mio.data.eventos.every((e: any) => !('quien_nombre' in e))).toBe(true);
  });

  it('un pago capturado por error se deshace, con motivo: se van sus egresos y vuelve a pendiente', async () => {
    const [p1] = ids.pagosBeto.split(',');
    // 0.83.0 · dash101 los saca de aquí para ofrecer «deshacer».
    const hechos = await i('mike', '/pagos?estado=pagado', { app: 'dash101' });
    expect(hechos.estado, JSON.stringify(hechos)).toBe(200);
    expect(hechos.data.filas.map((g: any) => g.id)).toContain(p1);
    expect(hechos.data.filas.find((g: any) => g.id === p1)).toMatchObject({ pagado_fecha: HOY, total: 5_200_00, inversionista_nombre: 'Beto Cruz' });
    expect((await i('beto', '/pagos?estado=pagado')).estado, 'quien presta no ve la lista de la empresa').toBe(403);
    // 0.83.0 · El cuadre fiscal no cuenta el préstamo como ingreso ni el
    // capital como gasto; el interés sí es gasto.
    const cuadre = await o('mike', `/fiscal/cuadre?desde=${HOY}&hasta=${HOY}`, { app: 'dash101' });
    expect(cuadre.estado, JSON.stringify(cuadre)).toBe(200);
    expect(cuadre.data.ingresos.total, 'lo que entró del préstamo no es ingreso').toBe(0);
    expect(cuadre.data.egresos.total, 'del pago sólo cuenta el interés').toBe(200_00);
    expect((await i('mike', `/pagos/${p1}/deshacer`, { method: 'POST', json: {} })).estado).toBe(400);
    const r = await i('mike', `/pagos/${p1}/deshacer`, { method: 'POST', json: { motivo: 'Lo capturé en la cuenta equivocada' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.pagos[0]).toMatchObject({ estado: 'pendiente', pagado_fecha: null });
    const ctas = await o('mike', '/cuentas', { app: 'dash101' });
    expect(ctas.data.filas[0].saldo).toBe(10_000_00 + 70_000_00);
    const movs = await o('mike', '/movimientos?limite=100', { app: 'dash101' });
    expect(movs.data.filas.filter((m: any) => m.tipo === 'egreso')).toEqual([]);
    expect((await i('mike', '/pagos?estado=pagado', { app: 'dash101' })).data.filas.map((g: any) => g.id), 'deshecho, ya no sale entre los hechos').not.toContain(p1);
    const otra = await i('mike', `/pagos/${p1}/pagar`, { method: 'POST', json: { cuenta_id: cuenta, fecha: HOY } });
    expect(otra.estado).toBe(200);
  });

  it('editar la tabla a mano: el capital tiene que seguir sumando lo que se debe, y el motivo es obligatorio', async () => {
    const sinMotivo = await i('mike', `/prestamos/${ids.pBeto}/tabla`, { method: 'PUT', json: { pagos: [{ fecha: en(30), capital: 15_000_00, interes: 900_00 }] } });
    expect(sinMotivo.estado).toBe(400);
    expect(sinMotivo.detalle.errores).toHaveProperty('motivo');
    const deMenos = await i('mike', `/prestamos/${ids.pBeto}/tabla`, { method: 'PUT', json: { motivo: 'x', pagos: [{ fecha: en(30), capital: 14_000_00, interes: 0 }] } });
    expect(deMenos.estado).toBe(400);
    expect(deMenos.error).toBe('capital_no_cuadra');
    expect(deMenos.detalle).toMatchObject({ debe: 15_000_00, suma: 14_000_00 });
    const chueco = await i('mike', `/prestamos/${ids.pBeto}/tabla`, { method: 'PUT', json: { motivo: 'x', pagos: [{ fecha: '2026-13-01', capital: 15_000_00, interes: 0 }] } });
    expect(chueco.estado).toBe(400);

    // Se junta lo que falta en dos pagos, más tarde, con un interés distinto.
    const r = await i('mike', `/prestamos/${ids.pBeto}/tabla`, { method: 'PUT', json: { motivo: 'Se recorrió el cobro de la obra dos semanas', pagos: [
      { fecha: en(42), capital: 10_000_00, interes: 350_00 }, { fecha: en(28), capital: 5_000_00, interes: 300_00 },
    ] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.tabla_editada).toBe(true);
    expect(r.data.pagos.map((g: any) => [g.numero, g.estado, g.fecha, g.capital, g.interes])).toEqual([
      [1, 'pagado', en(7), 5_000_00, 200_00], [2, 'pendiente', en(28), 5_000_00, 300_00], [3, 'pendiente', en(42), 10_000_00, 350_00],
    ]);
    expect(r.data.resumen).toMatchObject({ capital_pendiente: 15_000_00, interes_pendiente: 650_00, pagos_total: 3 });
    // Quien prestó ve la tabla nueva, el motivo, y cómo estaba antes.
    const mio = await i('beto', `/prestamos/${ids.pBeto}`);
    const cambio = mio.data.eventos.find((e: any) => e.que === 'tabla_editada');
    expect(cambio.nota).toBe('Se recorrió el cobro de la obra dos semanas');
    expect(cambio.datos.antes).toHaveLength(3);
    expect(cambio.datos.despues).toHaveLength(2);
    expect(mio.data.pagos).toHaveLength(3);
    ids.pagosBeto = r.data.pagos.map((g: any) => g.id).join(',');
  });

  it('con el último pago el préstamo se liquida solo, y deja de contar como capital vigente', async () => {
    const [, p2, p3] = ids.pagosBeto.split(',');
    const a = await i('mike', `/pagos/${p2}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(a.data.liquidado).toBe(false);
    const b = await i('mike', `/pagos/${p3}/pagar`, { method: 'POST', json: { cuenta_id: cuenta } });
    expect(b.estado, JSON.stringify(b)).toBe(200);
    expect(b.data.liquidado).toBe(true);
    expect(b.data.prestamo).toMatchObject({ estado: 'liquidado' });
    expect(b.data.prestamo.resumen).toMatchObject({ capital_pendiente: 0, capital_pagado: 20_000_00, interes_pagado: 850_00, proximo: null });
    const res = await i('mike', '');
    expect(res.data.resumen).toMatchObject({ capital_vigente: 50_000_00, prestamos_activos: 1 });
    const beto = await i('beto', '');
    expect(beto.data.resumen).toMatchObject({ invertido: 0, por_recibir: 0, interes_ganado: 850_00, prestamos_activos: 0 });
    // Todo lo que entró y salió por Beto cuadra: 20,000 de ida, 20,850 de vuelta.
    const ctas = await o('mike', '/cuentas', { app: 'dash101' });
    expect(ctas.data.filas[0].saldo).toBe(10_000_00 + 50_000_00 - 850_00);
    // Y ya liquidado, la tabla no se edita.
    expect((await i('mike', `/prestamos/${ids.pBeto}/tabla`, { method: 'PUT', json: { motivo: 'x', pagos: [{ fecha: en(1), capital: 1, interes: 0 }] } })).estado).toBe(409);
  });
});

describe('préstamos directos, cancelar y cerrar', () => {
  it('un préstamo sin ronda, en parcialidades mensuales: el ejemplo de Mike, por la ruta', async () => {
    const r = await i('mike', '/prestamos', { method: 'POST', json: { inversionista_id: ids.caro, monto: 50_000_00, tipo_tasa: 'mensual', tasa_pb: 200, esquema: 'parcialidades', frecuencia: 'mensual', num_pagos: 10, fecha_inicio: HOY } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    ids.pCaro = r.data.id;
    expect(r.data).toMatchObject({ estado: 'por_depositar', ronda: null });
    expect(r.data.pagos).toHaveLength(10);
    expect(r.data.resumen).toMatchObject({ interes_total: 5_500_00, capital_pendiente: 50_000_00 });
    const sim = await i('mike', '/simular', { method: 'POST', json: { monto: 50_000_00, tipo_tasa: 'mensual', tasa_pb: 200, esquema: 'parcialidades', frecuencia: 'mensual', num_pagos: 10, fecha_inicio: HOY } });
    expect(sim.data.totales).toMatchObject({ capital: 50_000_00, interes: 5_500_00, total: 55_500_00 });
    expect(sim.data.tabla.map((x: any) => x.interes)).toEqual(r.data.pagos.map((x: any) => x.interes));
    const mal = await i('mike', '/prestamos', { method: 'POST', json: { inversionista_id: ids.caro, monto: 50_000_00, tipo_tasa: 'mensual', tasa_pb: 200, esquema: 'parcialidades', frecuencia: 'mensual', num_pagos: 30, fecha_inicio: HOY } });
    expect(mal.estado).toBe(400);
    expect(mal.detalle.errores.num_pagos).toContain('24');
  });

  it('antes del depósito las condiciones se cambian y la tabla se rehace; o se cancela', async () => {
    const r = await i('mike', `/prestamos/${ids.pCaro}`, { method: 'PATCH', json: { num_pagos: 5, tasa_pb: 300 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.pagos).toHaveLength(5);
    expect(r.data.pagos[0]).toMatchObject({ capital: 10_000_00, interes: 1_500_00 });
    const c = await i('mike', `/prestamos/${ids.pCaro}/cancelar`, { method: 'POST', json: { motivo: 'Ya no hizo falta' } });
    expect(c.estado).toBe(200);
    expect(c.data).toMatchObject({ estado: 'cancelado', pagos: [] });
    expect((await i('mike', '/flujo')).data.depositos).toEqual([]);
    // Caro tiene historia (una oferta, un préstamo cancelado): no se borra.
    const b = await i('mike', `/inversionistas/${ids.caro}`, { method: 'DELETE' });
    expect(b.estado).toBe(409);
    expect(b.error).toBe('en_uso');
  });

  it('cerrar la ronda: ya no entran ofertas; quien entró la sigue viendo, quien no, ya no', async () => {
    const c = await i('mike', `/rondas/${ids.ronda}/cerrar`, { method: 'POST' });
    expect(c.data.estado).toBe('cerrada');
    await entrar('caro', 'caro@ejemplo.mx');
    const of = await i('ana', `/rondas/${ids.ronda}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 10_000_00 } });
    expect(of.estado).toBe(409);
    expect((await i('ana', `/rondas/${ids.ronda}`)).estado).toBe(200);
    expect((await i('caro', `/rondas/${ids.ronda}`)).estado, 'Caro ofreció: la ve con su oferta rechazada').toBe(200);
    expect((await i('mike', `/rondas/${ids.ronda}`, { method: 'DELETE' })).estado, 'sólo se borra un borrador').toBe(409);
  });

  it('cancelar una ronda rechaza lo pendiente; un borrador se borra', async () => {
    const r = await i('mike', '/rondas', { method: 'POST', json: { nombre: 'Otra', monto_meta: 10_000_00, tasa_pb: 200, fecha_inicio: en(2), fecha_vencimiento: en(30) } });
    await i('mike', `/rondas/${r.data.id}/abrir`, { method: 'POST' });
    const of = await i('ana', `/rondas/${r.data.id}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 4_000_00 } });
    expect(of.estado).toBe(201);
    const c = await i('mike', `/rondas/${r.data.id}/cancelar`, { method: 'POST' });
    expect(c.data.estado).toBe('cancelada');
    expect(c.data.ofertas[0]).toMatchObject({ estado: 'rechazada', motivo: 'La ronda se canceló.' });
    const b = await i('mike', '/rondas', { method: 'POST', json: { nombre: 'Borrador', monto_meta: 1_00 } });
    expect((await i('mike', `/rondas/${b.data.id}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await i('mike', '/rondas')).data.filas.map((x: any) => x.nombre)).toEqual(['Otra', 'Puente de octubre']);
  });

  it('una ronda con fecha límite ya no recibe ofertas pasado el día', async () => {
    const r = await i('mike', '/rondas', { method: 'POST', json: { nombre: 'Vencida', monto_meta: 10_000_00, fecha_inicio: en(2), fecha_vencimiento: en(30), fecha_limite: en(-1) } });
    await i('mike', `/rondas/${r.data.id}/abrir`, { method: 'POST' });
    const of = await i('ana', `/rondas/${r.data.id}/ofertas`, { method: 'POST', json: { acepta_riesgos: true, monto: 4_000_00 } });
    expect(of.estado).toBe(409);
    expect(of.error).toBe('ronda_vencida');
  });

  it('0.84.0 · el aviso de riesgos se edita en Ajustes; lo ya aceptado no cambia; vacío regresa al base', async () => {
    const antes = await i('mike', '/ajustes');
    expect(antes.data.riesgos_propio).toBe(false);
    expect(antes.data.riesgos).toContain('No lo protege el IPAB');
    const g = await i('mike', '/ajustes', { method: 'PUT', json: { riesgos: '  Texto del abogado: puedes perder tu dinero.  ' } });
    expect(g.data).toMatchObject({ riesgos: 'Texto del abogado: puedes perder tu dinero.', riesgos_propio: true });
    // Lo que Ana aceptó aquel día sigue siendo lo que aceptó.
    const pAna = await i('mike', `/prestamos/${ids.pAna}`);
    expect(pAna.data.riesgos.texto).toContain('Si un cliente se atrasa o no paga');
    expect(pAna.data.riesgos.aceptados_at).toMatch(/^\d{4}-/);
    // Guardar otra cosa no borra el aviso propio…
    expect((await i('mike', '/ajustes', { method: 'PUT', json: { lugar: 'Monterrey' } })).data.riesgos_propio).toBe(true);
    // …y vaciarlo regresa al base.
    const v = await i('mike', '/ajustes', { method: 'PUT', json: { riesgos: '' } });
    expect(v.data.riesgos_propio).toBe(false);
    expect(v.data.riesgos).toBe(antes.data.riesgos);
  });

  it('los ajustes: a dónde se deposita, para la siguiente ronda', async () => {
    const g = await i('mike', '/ajustes', { method: 'PUT', json: { instrucciones: 'BBVA 0121 8000 …', representante: 'Mike Balcázar', lugar: 'Ciudad de México' } });
    expect(g.estado).toBe(200);
    const r = await i('mike', '/rondas', { method: 'POST', json: { nombre: 'Con ajustes', monto_meta: 1_000_00 } });
    expect(r.data.instrucciones).toBe('BBVA 0121 8000 …');
    const p = await i('mike', `/prestamos/${ids.pAna}`);
    expect(p.data.ajustes).toMatchObject({ representante: 'Mike Balcázar', lugar: 'Ciudad de México' });
    expect(p.data.empresa.nombre).toBe('Taller de prueba');
  });

  it('un socio que además presta entra como inversionista, no como quien dirige', async () => {
    const alta = await i('mike', '/inversionistas', { method: 'POST', json: { nombre: 'La de oficina', correo: 'oficina@ejemplo.mx' } });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
    const r = await i('oficina', '');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.papel).toBe('inversionista');
    expect((await i('oficina', '/inversionistas')).estado).toBe(403);
    // Y la administración, aunque esté en el directorio, sigue administrando.
    await i('mike', '/inversionistas', { method: 'POST', json: { nombre: 'Admin que presta', correo: 'admin@ejemplo.mx' } });
    await entrar('admin', 'admin@ejemplo.mx');
    expect((await i('admin', '')).data.papel).toBe('admin');
  });

  it('0.84.0 · quien ya era cliente o personal de la empresa, y se da de alta como inversionista, entra sin nada más', async () => {
    // Mike, 8-oct: «deberían estar autorizados y dados de alta en automático
    // cuando yo los registro como inversionistas». A quien ya tenía otra
    // puerta en la empresa (peek101, roster101) esa otra clase le ganaba.
    for (const [quien, tipo] of [['cliente', 'cliente'], ['obrero', 'personal']] as const) {
      const correo = `${quien}@ejemplo.mx`;
      const alta = await i('mike', '/inversionistas', { method: 'POST', json: { nombre: `El ${quien} que presta`, correo } });
      expect(alta.estado, JSON.stringify(alta)).toBe(201);
      const u = await usuarioPorCorreo(env as any, correo);
      await ponerAcceso(env as any, { usuario_id: u!.id, org_id: ORG, tipo, ref_id: `ref-${quien}` });
      await entrar(quien, correo);
      const yo = await pedir(quien, '/yo', { app: '' });
      expect(yo.data.inversion.map((x: any) => x.org_id), quien).toContain(ORG);
      const r = await i(quien, '');
      expect(r.estado, `${quien}: ${JSON.stringify(r)}`).toBe(200);
      expect(r.data.papel).toBe('inversionista');
      // Y sigue sin alcanzar lo de quien dirige ni lo demás de la empresa.
      expect((await i(quien, '/inversionistas')).estado).toBe(403);
      expect((await pedir(quien, `/orgs/${ORG}/movimientos`, { app: 'investor101' })).estado).toBe(403);
    }
  });
});

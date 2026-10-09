/* bill101 fase D, de punta a punta: la FIEL entra por la ruta, la base pide
 * al SAT (de mentira, pruebas/sat-de-mentira.mjs: comprueba la firma de cada
 * sobre), se despierta con su alarma, baja los paquetes, mete las facturas y
 * cancela aquí lo cancelado allá. Nadie llama al motor por dentro: todo por
 * las rutas, la alarma y lo que el SAT de mentira vio llegar.
 */
import { SELF, env, runDurableObjectAlarm } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { RFC_CLIENTE, RFC_EMPRESA, RFC_PROVEEDOR, uuidDe, xmlCfdi } from './cfdi-de-prueba';
import { FIEL_CER_B64, FIEL_CLAVE, FIEL_KEY_B64, SELLO_CER_B64, SELLO_KEY_B64 } from './fiel-de-prueba';
import { crearSat, renglonLista, TITULOS_LISTA, type PedidoSat, type RespuestaSolicitar } from './sat-de-mentira.mjs';

const ORG = 'sat-prueba';
const galletas: Record<string, string> = {};
const bytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

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
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

function forma(cer: Uint8Array | null, key: Uint8Array | null, clave: string | null): FormData {
  const f = new FormData();
  if (cer) f.append('cer', new File([cer], 'fiel.cer'));
  if (key) f.append('key', new File([key], 'fiel.key'));
  if (clave !== null) f.append('clave', clave);
  return f;
}
const subirFiel = (quien: string, cer: Uint8Array | null = bytes(FIEL_CER_B64), key: Uint8Array | null = bytes(FIEL_KEY_B64), clave: string | null = FIEL_CLAVE) =>
  o(quien, '/fiscal/sat/fiel', { method: 'PUT', body: forma(cer, key, clave) });

const entorno = env as unknown as { ORG: DurableObjectNamespace; ARCHIVOS: R2Bucket };
const elDO = () => entorno.ORG.get(entorno.ORG.idFromName(ORG));
/** Deja que la base trabaje: corre su alarma hasta que no quede trabajo inmediato. */
async function trabajar(max = 40): Promise<number> {
  let vueltas = 0;
  for (; vueltas < max; vueltas++) {
    if (!(await runDurableObjectAlarm(elDO()))) break;
    const e = (await o('mike', '/fiscal/sat')).data;
    const pronto = (e.solicitudes as any[]).some((s) => ['por_pedir', 'pedida', 'lista', 'importando'].includes(s.estado) && (!s.proxima_at || Date.parse(s.proxima_at) - Date.now() < 90_000));
    if (!pronto) break;
    // Lo que espera un minuto (verificar) se adelanta: la prueba no espera de verdad.
    vi.setSystemTime(Date.now() + 61_000);
  }
  return vueltas;
}

const sat = crearSat();
const EMP = { rfc: RFC_EMPRESA, nombre: 'ESCUELA KEMPER URGATE' };
const CLI = { rfc: RFC_CLIENTE, nombre: 'UNIVERSIDAD ROBOTICA ESPAÑOLA' };
const PRO = { rfc: RFC_PROVEEDOR, nombre: 'MADERAS EL ROBLE SA DE CV' };
const U = { E1: uuidDe(201), E2: uuidDe(202), R1: uuidDe(211), R2: uuidDe(212), R3: uuidDe(213), MANO: uuidDe(230) };
const XML = {
  E1: xmlCfdi({ uuid: U.E1, emisor: EMP, receptor: CLI, fecha: '2026-02-10', subtotal: '10000.00' }),
  E2: xmlCfdi({ uuid: U.E2, emisor: EMP, receptor: CLI, fecha: '2026-03-15', subtotal: '20000.00' }),
  R1: xmlCfdi({ uuid: U.R1, emisor: PRO, receptor: EMP, fecha: '2026-02-20', subtotal: '5000.00' }),
  R2: xmlCfdi({ uuid: U.R2, emisor: PRO, receptor: EMP, fecha: '2026-03-01', subtotal: '7000.00' }),
  R3: xmlCfdi({ uuid: U.R3, emisor: PRO, receptor: EMP, fecha: '2026-03-20', subtotal: '9000.00' }),
};
const zipDe = (archivos: Record<string, string>): Uint8Array => zipSync(Object.fromEntries(Object.entries(archivos).map(([n, t]) => [n, strToU8(t)])));
const lista = (renglones: Parameters<typeof renglonLista>[0][]): Uint8Array => zipDe({ 'lista.txt': [TITULOS_LISTA, ...renglones.map(renglonLista)].join('\r\n') + '\r\n' });

/** Lo que el SAT de mentira entrega por cada solicitud: se cambia por prueba. */
let entrega: (p: PedidoSat) => RespuestaSolicitar | void = () => ({ estado: 3, paquetes: [] });
sat.st.alSolicitar = (p) => entrega(p);

beforeAll(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T15:00:00Z'));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada: any, init: any) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (!url.startsWith('https://sat.de-mentira')) throw new Error(`la prueba no deja salir a ${url}`);
    const r = await sat.responder(url, Object.fromEntries(new Headers(init?.headers).entries()), String(init?.body));
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'text/xml' } });
  });
  await entrar('mike', 'mike@forespot.com');
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'SAT de prueba', apps: { dash: true, bill: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, correo] of [['ana', 'ana-sat@ejemplo.mx'], ['beto', 'beto-sat@ejemplo.mx']] as const) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo, rol: 'staff', nombre: apodo }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar(apodo, correo);
  }
  const uBeto = (await pedir('beto', '/yo', { app: '' })).data.usuario.id;
  expect((await o('mike', '/ordenes/contadores', { method: 'POST', app: 'dash101', json: { usuario_id: uBeto, valor: true } })).estado).toBe(200);
}, 90_000);

afterAll(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('la FIEL entra por la ruta', () => {
  it('sin FIEL: el estado lo dice, y «bajar» no se puede', async () => {
    const e = await o('mike', '/fiscal/sat');
    expect(e.estado).toBe(200);
    expect(e.data).toMatchObject({ fiel: null, trabajando: false, automatico: true, desde: '2026-01-01', puede_subir_fiel: true, puede_bajar: true });
    expect((await o('mike', '/fiscal/sat/bajar', { method: 'POST' })).estado).toBe(409);
  });

  it('sólo quien dirige la sube; quien lleva la contabilidad no', async () => {
    expect((await subirFiel('ana')).estado).toBe(403);
    expect((await subirFiel('beto')).estado).toBe(403);
    expect((await o('beto', '/fiscal/sat')).data.puede_subir_fiel).toBe(false);
  });

  it('lo que no es la FIEL se rechaza con su motivo, y nada se guarda', async () => {
    expect(await subirFiel('mike', bytes(FIEL_CER_B64), bytes(FIEL_KEY_B64), 'otra')).toMatchObject({ estado: 400, error: 'fiel_clave_incorrecta' });
    expect(await subirFiel('mike', bytes(SELLO_CER_B64), bytes(SELLO_KEY_B64))).toMatchObject({ estado: 400, error: 'fiel_es_sello' });
    expect(await subirFiel('mike', bytes(FIEL_CER_B64), bytes(SELLO_KEY_B64))).toMatchObject({ estado: 400, error: 'fiel_no_casan' });
    expect(await subirFiel('mike', null, bytes(FIEL_KEY_B64))).toMatchObject({ estado: 400, error: 'datos_invalidos' });
    expect((await o('mike', '/fiscal/sat')).data.fiel).toBeNull();
  });

  it('la FIEL de otro RFC no entra', async () => {
    expect((await o('mike', '/empresa', { method: 'PATCH', app: 'dash101', json: { rfc: 'AAA010101AAA' } })).estado).toBe(200);
    expect(await subirFiel('mike')).toMatchObject({ estado: 409, error: 'fiel_de_otro_rfc' });
    expect((await o('mike', '/empresa', { method: 'PATCH', app: 'dash101', json: { rfc: null } })).estado).toBe(200);
  });

  it('con la buena: queda, se dice lo público, y la empresa toma su RFC', async () => {
    const r = await subirFiel('mike');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.fiel).toMatchObject({ rfc: RFC_EMPRESA, nombre: 'ESCUELA KEMPER URGATE SA DE CV', serie: '30001000000500003415', vence: '2027-05-17T04:37:14.000Z' });
    expect(r.data.rfc_empresa).toBe(RFC_EMPRESA);
    expect(r.data.trabajando, 'subirla ya pone a trabajar').toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/llave|pkcs8|clave|BEGIN/i);
    expect((await o('mike', '/empresa', { app: 'dash101' })).data.rfc).toBe(RFC_EMPRESA);
  });

  it('la llave privada no sale por ninguna ruta, y la tabla no se lee por el CRUD', async () => {
    for (const ruta of ['/sat_fiel', '/sat_solicitudes', '/sat_config', '/sat_eventos']) expect((await o('mike', ruta, { app: 'dash101' })).estado, ruta).not.toBe(200);
    const todo = JSON.stringify(await o('mike', '/fiscal/sat'));
    expect(todo).not.toContain('llave_dato');
    expect(todo).not.toContain(FIEL_CLAVE);
  });
});

describe('una empresa recién nacida, sin tocar nada antes', () => {
  it('la FIEL le pone el RFC aunque el renglón de empresa no exista todavía', async () => {
    const NUEVA = 'sat-nueva';
    const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: NUEVA, nombre: 'Recién nacida', apps: { dash: true, bill: true } }, app: '' });
    expect(alta.estado).toBe(201);
    const r = await pedir('mike', `/orgs/${NUEVA}/fiscal/sat/fiel`, { method: 'PUT', body: forma(bytes(FIEL_CER_B64), bytes(FIEL_KEY_B64), FIEL_CLAVE) });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.rfc_empresa).toBe(RFC_EMPRESA);
    expect((await pedir('mike', `/orgs/${NUEVA}/empresa`, { app: 'dash101' })).data.rfc).toBe(RFC_EMPRESA);
    // Y lo que baje entra: `importar` ya sabe de quién es la empresa.
    const nueva = entorno.ORG.get(entorno.ORG.idFromName(NUEVA));
    entrega = () => ({ estado: 3, vueltas: 0, cuantas: 1, paquetes: [zipDe({ 'e1.xml': XML.E1 })] });
    for (let i = 0; i < 10 && (await runDurableObjectAlarm(nueva)); i++) vi.setSystemTime(Date.now() + 61_000);
    const e = (await pedir('mike', `/orgs/${NUEVA}/fiscal/sat`)).data;
    expect((e.solicitudes as any[]).filter((x) => x.estado === 'error'), 'ninguna falla por falta de RFC').toEqual([]);
    expect(e.facturas_del_sat).toBeGreaterThan(0);
    await pedir('mike', `/admin/orgs/${NUEVA}`, { method: 'DELETE', app: '' });
    // Lo que esta empresa le dijo al SAT no cuenta para las siguientes pruebas.
    sat.st.llamadas.splice(0);
  });
});

describe('la primera bajada', () => {
  it('pide cuatro cosas desde el 1-ene-2026: XML y lista, de cada lado', async () => {
    const e = (await o('mike', '/fiscal/sat')).data;
    const s = e.solicitudes as any[];
    expect(s).toHaveLength(4);
    expect(s.map((x) => `${x.lado}/${x.clase}/${x.motivo}/${x.estado}`).sort()).toEqual([
      'emitidas/cfdi/inicial/por_pedir', 'emitidas/metadata/inicial/por_pedir', 'recibidas/cfdi/inicial/por_pedir', 'recibidas/metadata/inicial/por_pedir',
    ]);
    for (const x of s) {
      expect(x.desde).toBe('2026-01-01T00:00:00');
      expect(x.hasta < '2026-10-09T09:00:00' && x.hasta > '2026-10-09T08:50:00', `hasta ${x.hasta}: hace dos minutos, hora de México`).toBe(true);
    }
  });

  it('la base se despierta sola, se autentica una vez, pide, espera, baja y mete las facturas', async () => {
    entrega = (p) => {
      if (p.clase === 'metadata') return { estado: 3, vueltas: 1, cuantas: 2, paquetes: [lista(p.lado === 'emitidas'
        ? [{ uuid: U.E1, rfc_emisor: RFC_EMPRESA, rfc_receptor: RFC_CLIENTE, fecha: '2026-02-10', monto: '11600.00' }, { uuid: U.E2, rfc_emisor: RFC_EMPRESA, rfc_receptor: RFC_CLIENTE, fecha: '2026-03-15', monto: '23200.00' }]
        : [{ uuid: U.R1, rfc_emisor: RFC_PROVEEDOR, rfc_receptor: RFC_EMPRESA, fecha: '2026-02-20', monto: '5800.00' }, { uuid: U.R2, rfc_emisor: RFC_PROVEEDOR, rfc_receptor: RFC_EMPRESA, fecha: '2026-03-01', monto: '8120.00' }])] };
      return p.lado === 'emitidas'
        ? { estado: 3, vueltas: 2, cuantas: 2, paquetes: [zipDe({ 'a.xml': XML.E1 }), zipDe({ 'b.xml': XML.E2, 'basura.pdf': 'no', 'c.xml': XML.E1 })] }
        : { estado: 3, vueltas: 1, cuantas: 2, paquetes: [zipDe({ 'r1.xml': XML.R1, 'r2.xml': XML.R2 })] };
    };
    await trabajar();
    const e = (await o('mike', '/fiscal/sat')).data;
    expect(e.trabajando, JSON.stringify(e.solicitudes)).toBe(false);
    const por = (lado: string, clase: string) => (e.solicitudes as any[]).find((x) => x.lado === lado && x.clase === clase);
    expect(por('emitidas', 'cfdi')).toMatchObject({ estado: 'terminada', cuantas: 2, nuevas: 2, repetidas: 1, rechazadas: 0 });
    expect(por('recibidas', 'cfdi')).toMatchObject({ estado: 'terminada', nuevas: 2 });
    expect(por('emitidas', 'metadata')).toMatchObject({ estado: 'terminada', revisadas: 2, canceladas: 0, faltantes: 0 });
    expect(por('recibidas', 'metadata')).toMatchObject({ estado: 'terminada', revisadas: 2, faltantes: 0 });
    expect(e.facturas_del_sat).toBe(4);
    expect(e.cubierto_hasta.emitidas).toBe(por('emitidas', 'cfdi').hasta);
    expect(e.ultima_corrida_at).toBeTruthy();
    expect(e.proxima_noche_at, 'queda puesta la siguiente noche').toBeTruthy();

    // Lo que vio el SAT: una sola autenticación (el permiso se reutiliza), las cuatro solicitudes bien firmadas.
    const pasos = sat.st.llamadas.map((l) => l.paso);
    expect(pasos.filter((p) => p === 'firma_mala' || p === 'sin_permiso')).toEqual([]);
    expect(pasos.filter((p) => p === 'autenticar')).toHaveLength(1);
    expect(pasos.filter((p) => p === 'solicitar')).toHaveLength(4);
    expect(pasos.filter((p) => p === 'descargar')).toHaveLength(5);
    const rec = sat.st.llamadas.find((l) => l.paso === 'solicitar' && l.lado === 'recibidas' && l.clase === 'cfdi')!;
    expect(rec).toMatchObject({ estado: 'Vigente', rfc: RFC_EMPRESA });
    expect(rec.attrs.RfcReceptor).toBe(RFC_EMPRESA);
    expect(rec.accion).toBe('http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescargaRecibidos');
    expect(sat.st.llamadas.find((l) => l.paso === 'solicitar' && l.clase === 'metadata')!.estado).toBe('Todos');
  });

  it('las facturas quedaron como las que se suben a mano, con origen «sat» y su XML', async () => {
    const filas = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
    const e1 = filas.find((f) => f.uuid === U.E1);
    expect(e1).toMatchObject({ tipo: 'ingreso', rfc: RFC_CLIENTE, total: 1_160_000, origen: 'sat', estado: 'vigente', estado_sat: 'vigente' });
    const d = (await o('mike', `/fiscal/cfdi/${e1.id}`)).data;
    expect(d.conceptos).toHaveLength(1);
    const xml = await SELF.fetch(`https://api.local/orgs/${ORG}/fiscal/cfdi/${e1.id}/xml`, { headers: { Cookie: galletas.mike, 'X-App': 'bill101' } });
    expect(xml.status).toBe(200);
    expect(await xml.text()).toBe(XML.E1);
    const lis = await entorno.ARCHIVOS.list({ prefix: `orgs/${ORG}/sat/` });
    expect(lis.objects, 'los .zip del SAT se tiran al terminar').toHaveLength(0);
  });

  it('los impuestos las cuentan', async () => {
    const i = (await o('mike', '/fiscal/impuestos?anio=2026')).data;
    const feb = i.meses.find((m: any) => m.mes === '2026-02').iva;
    expect(feb.trasladado, 'IVA de la emitida de febrero').toBe(160_000);
    expect(feb.acreditable, 'IVA de la recibida de febrero').toBe(80_000);
  });
});

describe('la segunda bajada', () => {
  it('pide sólo desde tres días antes de donde se quedó, y la lista completa', async () => {
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
    const antes = (await o('mike', '/fiscal/sat')).data.cubierto_hasta.emitidas as string;
    const r = await o('beto', '/fiscal/sat/bajar', { method: 'POST' });
    expect(r.estado, 'quien lleva la contabilidad sí puede bajar').toBe(200);
    expect(r.data.ya_trabajando).toBe(false);
    const nuevas = (r.data.solicitudes as any[]).filter((s) => s.estado === 'por_pedir');
    expect(nuevas).toHaveLength(4);
    const xmlE = nuevas.find((s) => s.lado === 'emitidas' && s.clase === 'cfdi');
    expect(xmlE.motivo).toBe('mano');
    expect(Date.parse(`${xmlE.desde}Z`)).toBe(Date.parse(`${antes}Z`) - 3 * 86_400_000);
    expect(nuevas.find((s) => s.clase === 'metadata').desde).toBe('2026-01-01T00:00:00');
    expect((await o('ana', '/fiscal/sat/bajar', { method: 'POST' })).estado).toBe(403);
  });

  it('cancelada allá → cancelada aquí; una vigente que falta se pide aparte, una vez', async () => {
    entrega = (p) => {
      if (p.clase === 'cfdi' && p.attrs.FechaInicial > '2026-10-01') return { estado: 3, vueltas: 0, paquetes: [] };
      if (p.clase === 'metadata') return { estado: 3, vueltas: 0, cuantas: 3, paquetes: [lista(p.lado === 'emitidas'
        ? [{ uuid: U.E1, rfc_emisor: RFC_EMPRESA, rfc_receptor: RFC_CLIENTE, fecha: '2026-02-10', monto: '11600.00', vigente: false, cancelada_el: '2026-10-10 09:00:00' }, { uuid: U.E2, rfc_emisor: RFC_EMPRESA, rfc_receptor: RFC_CLIENTE, fecha: '2026-03-15', monto: '23200.00' }]
        : [{ uuid: U.R1, rfc_emisor: RFC_PROVEEDOR, rfc_receptor: RFC_EMPRESA, fecha: '2026-02-20', monto: '5800.00' }, { uuid: U.R2, rfc_emisor: RFC_PROVEEDOR, rfc_receptor: RFC_EMPRESA, fecha: '2026-03-01', monto: '8120.00' },
           { uuid: U.R3, rfc_emisor: RFC_PROVEEDOR, rfc_receptor: RFC_EMPRESA, fecha: '2026-03-20', monto: '10440.00' }])] };
      // La que faltaba, cuando se pide su tramo.
      if (p.lado === 'recibidas' && p.attrs.FechaInicial.startsWith('2026-03-20')) return { estado: 3, vueltas: 0, cuantas: 1, paquetes: [zipDe({ 'r3.xml': XML.R3 })] };
      return { estado: 3, vueltas: 0, paquetes: [] };
    };
    await trabajar();
    const e = (await o('mike', '/fiscal/sat')).data;
    expect(e.trabajando, JSON.stringify(e.solicitudes.slice(0, 6))).toBe(false);
    const s = e.solicitudes as any[];
    expect(s.find((x) => x.lado === 'emitidas' && x.clase === 'metadata' && x.motivo === 'mano')).toMatchObject({ estado: 'terminada', revisadas: 2, canceladas: 1 });
    const falt = s.find((x) => x.motivo === 'faltantes');
    expect(falt, 'se pidió la que faltaba').toMatchObject({ lado: 'recibidas', clase: 'cfdi', estado: 'terminada', nuevas: 1 });
    expect(falt.desde).toBe('2026-03-20T09:59:59');
    expect(falt.hasta).toBe('2026-03-20T10:00:01');
    const filas = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
    expect(filas.find((f) => f.uuid === U.E1)).toMatchObject({ estado: 'cancelada', estado_sat: 'cancelado' });
    expect(filas.find((f) => f.uuid === U.R3)).toMatchObject({ origen: 'sat', estado: 'vigente' });
    expect(e.facturas_del_sat).toBe(5);
  });
});

describe('cuando el SAT no está, o dice que no', () => {
  it('no contesta: se anota, se espera, no se insiste; y al volver, sigue', async () => {
    vi.setSystemTime(new Date('2026-10-13T15:00:00Z'));
    sat.st.modo = 'caido';
    const antes = sat.st.llamadas.length;
    entrega = () => ({ estado: 3, vueltas: 0, paquetes: [] });
    expect((await o('mike', '/fiscal/sat/bajar', { method: 'POST' })).estado).toBe(200);
    await runDurableObjectAlarm(elDO());
    let e = (await o('mike', '/fiscal/sat')).data;
    expect(e.ultimo_error).toMatch(/no contestó/);
    expect(e.trabajando).toBe(true);
    expect(sat.st.llamadas.length - antes, 'una sola llamada y alto').toBeLessThanOrEqual(1);
    const esperan = (e.solicitudes as any[]).filter((s) => s.estado === 'por_pedir').map((s) => Date.parse(s.proxima_at));
    expect(Math.min(...esperan)).toBeGreaterThan(Date.now() + 60_000);
    sat.st.modo = 'bien';
    vi.setSystemTime(Date.now() + 3 * 60_000);
    await trabajar();
    e = (await o('mike', '/fiscal/sat')).data;
    expect(e.trabajando).toBe(false);
    expect(e.ultimo_error).toBeNull();
  });

  it('si nunca vuelve, cada solicitud se da por perdida tras doce intentos y la noche sigue llegando', async () => {
    vi.setSystemTime(new Date('2026-10-13T20:00:00Z'));
    sat.st.modo = 'caido';
    expect((await o('mike', '/fiscal/sat/bajar', { method: 'POST' })).estado).toBe(200);
    for (let i = 0; i < 80; i++) {
      await runDurableObjectAlarm(elDO());
      if (!(await o('mike', '/fiscal/sat')).data.trabajando) break;
      vi.setSystemTime(Date.now() + 7 * 3600_000);
    }
    const e = (await o('mike', '/fiscal/sat')).data;
    expect(e.trabajando, 'no se queda trabajando para siempre').toBe(false);
    const perdidas = (e.solicitudes as any[]).filter((x) => x.estado === 'error' && /12 veces/.test(x.mensaje));
    expect(perdidas.length).toBe(4);
    expect(e.proxima_noche_at, 'y la noche queda puesta').toBeTruthy();
    sat.st.modo = 'bien';
  });

  it('rechaza la FIEL: se dice arriba, con las palabras del SAT', async () => {
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    sat.st.modo = 'fiel_rechazada';
    expect((await o('mike', '/fiscal/sat/bajar', { method: 'POST' })).estado).toBe(200);
    await runDurableObjectAlarm(elDO());
    const e = (await o('mike', '/fiscal/sat')).data;
    expect(e.ultimo_error).toMatch(/rechazó.*revocado/i);
    sat.st.modo = 'bien';
    // Tras tantas fallas seguidas la espera ya es la máxima: seis horas.
    vi.setSystemTime(Date.now() + 7 * 3600_000);
    await trabajar();
    expect((await o('mike', '/fiscal/sat')).data.trabajando).toBe(false);
  });

  it('5002 «agotado»: se recorre un segundo y se vuelve a pedir; 5004: queda vacía', async () => {
    vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
    let agotado = 0;
    entrega = (p) => {
      if (p.clase === 'cfdi' && p.lado === 'emitidas' && agotado++ === 0) return { codigo: 5002, mensaje: 'Se han agotado las solicitudes de por vida' };
      if (p.clase === 'cfdi' && p.lado === 'recibidas') return { estado: 5, codigo_solicitud: 5004, vueltas: 0, mensaje: 'No se encontró la información' };
      return { estado: 3, vueltas: 0, paquetes: [] };
    };
    const r = await o('mike', '/fiscal/sat/bajar', { method: 'POST' });
    const hasta0 = (r.data.solicitudes as any[]).find((s) => s.estado === 'por_pedir' && s.lado === 'emitidas' && s.clase === 'cfdi').hasta;
    await trabajar();
    const s = (await o('mike', '/fiscal/sat')).data.solicitudes as any[];
    const em = s.find((x) => x.lado === 'emitidas' && x.clase === 'cfdi' && x.creada_at > '2026-10-15');
    expect(em.estado).toBe('vacia');
    expect(Date.parse(`${em.hasta}Z`)).toBe(Date.parse(`${hasta0}Z`) - 1000);
    expect(s.find((x) => x.lado === 'recibidas' && x.clase === 'cfdi' && x.creada_at > '2026-10-15')).toMatchObject({ estado: 'vacia', codigo: 5004 });
  });

  it('5003 «tope»: se parte en dos mitades', async () => {
    vi.setSystemTime(new Date('2026-10-16T15:00:00Z'));
    let tope = 0;
    entrega = (p) => (p.clase === 'cfdi' && p.lado === 'emitidas' && tope++ === 0 ? { codigo: 5003, mensaje: 'Tope máximo' } : { estado: 3, vueltas: 0, paquetes: [] });
    await o('mike', '/fiscal/sat/bajar', { method: 'POST' });
    await trabajar();
    const s = ((await o('mike', '/fiscal/sat')).data.solicitudes as any[]).filter((x) => x.creada_at > '2026-10-16' && x.lado === 'emitidas' && x.clase === 'cfdi');
    expect(s.map((x) => `${x.motivo}/${x.estado}`).sort()).toEqual(['mano/partida', 'partida/vacia', 'partida/vacia']);
    const [a, b] = s.filter((x) => x.motivo === 'partida').sort((x, y) => (x.desde < y.desde ? -1 : 1));
    expect(a.hasta).toBe(b.desde);
  });
});

describe('apagar y quitar', () => {
  it('sin lo automático no queda noche puesta; con ello, sí', async () => {
    let r = await o('beto', '/fiscal/sat/config', { method: 'PUT', json: { automatico: false } });
    expect(r.estado).toBe(200);
    expect(r.data.proxima_noche_at).toBeNull();
    expect((await o('ana', '/fiscal/sat/config', { method: 'PUT', json: { automatico: true } })).estado).toBe(403);
    expect((await o('mike', '/fiscal/sat')).data.proxima_noche_at, 'apagado, no queda noche guardada').toBeNull();
    r = await o('mike', '/fiscal/sat/config', { method: 'PUT', json: { automatico: true } });
    const noche = new Date(r.data.proxima_noche_at);
    const hMx = (noche.getUTCHours() - 6 + 24) % 24;
    expect(hMx === 3 || hMx === 4, `${r.data.proxima_noche_at}: entre 3 y 4:30 de México`).toBe(true);
  });

  it('quitar la FIEL cancela lo pendiente y deja las facturas', async () => {
    entrega = () => ({ estado: 3, vueltas: 5, paquetes: [] });
    await o('mike', '/fiscal/sat/bajar', { method: 'POST' });
    await runDurableObjectAlarm(elDO());
    expect((await o('beto', '/fiscal/sat/fiel', { method: 'DELETE' })).estado).toBe(403);
    const r = await o('mike', '/fiscal/sat/fiel', { method: 'DELETE' });
    expect(r.estado).toBe(200);
    expect(r.data.fiel).toBeNull();
    expect(r.data.trabajando).toBe(false);
    expect((r.data.solicitudes as any[]).filter((s) => s.estado === 'cancelada').length).toBeGreaterThan(0);
    expect(await runDurableObjectAlarm(elDO()), 'ya no hay alarma').toBe(false);
    expect((await o('mike', '/fiscal/cfdi')).data.filas.length).toBe(5);
  });
});

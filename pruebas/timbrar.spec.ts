/* bill101 fase C — emitir y timbrar, de punta a punta contra un Facturama de
 * mentira (pruebas/facturama-de-mentira.ts) que pide la cuenta, revisa el
 * cuerpo como Facturama y timbra. Todo por las rutas.
 */
import { SELF, env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RFC_CLIENTE, RFC_EMPRESA } from './cfdi-de-prueba';
import { crearFacturama } from './facturama-de-mentira';
import { cuentas, cuerpoFacturama, revisarBorrador, esFallaPac } from '../src/pac';

const ORG = 'timbrar-prueba';
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
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}
const entorno = env as unknown as { ARCHIVOS: R2Bucket };
const fac = crearFacturama('mike-sandbox', 'clave-sandbox');
const P = (pesos: number) => Math.round(pesos * 100);

const RECEPTOR = { rfc: RFC_CLIENTE, razon_social: 'Universidad Robotica Española', regimen_fiscal: '603', cp_fiscal: '65000', uso_cfdi: 'G03' };
const RENGLON = { clave_prod_serv: '56101700', clave_unidad: 'H87', unidad: 'Pieza', descripcion: 'Cocina integral de nogal', cantidad: 1, precio_unitario: P(85_000), iva: 16 };
const BORRADOR = { receptor: RECEPTOR, forma_pago: '03', renglones: [RENGLON, { clave_prod_serv: '72101500', clave_unidad: 'E48', descripcion: 'Instalación', cantidad: 2, precio_unitario: P(1_500), descuento: P(300), iva: 16 }] };

let cliente = '', proyecto = '';

beforeAll(async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada: any, init: any) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (!url.startsWith('https://facturama.de-mentira')) throw new Error(`la prueba no deja salir a ${url}`);
    const cab = Object.fromEntries(new Headers(init?.headers).entries());
    cab['x-metodo'] = String(init?.method || 'GET');
    const r = await fac.responder(url, cab, typeof init?.body === 'string' ? init.body : undefined);
    return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
  await entrar('mike', 'mike@forespot.com');
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Timbrar de prueba', apps: { dash: true, bill: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, correo] of [['ana', 'ana-timbrar@ejemplo.mx'], ['beto', 'beto-timbrar@ejemplo.mx']] as const) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo, rol: 'staff', nombre: apodo }, app: '' });
    expect(m.estado).toBe(201);
    await entrar(apodo, correo);
  }
  const uBeto = (await pedir('beto', '/yo', { app: '' })).data.usuario.id;
  expect((await o('mike', '/ordenes/contadores', { method: 'POST', app: 'dash101', json: { usuario_id: uBeto, valor: true } })).estado).toBe(200);
  expect((await o('mike', '/empresa', { method: 'PATCH', app: 'dash101', json: { rfc: RFC_EMPRESA } })).estado).toBe(200);
  cliente = (await o('mike', '/clientes', { method: 'POST', app: 'dash101', json: { nombre: 'Universidad Robótica', rfc: RFC_CLIENTE } })).data.id;
  const pr = await o('mike', '/proyectos', { method: 'POST', app: 'dash101', json: { nombre: 'Cocina casa Robótica', cliente_id: cliente } });
  expect(pr.estado, JSON.stringify(pr)).toBe(201);
  proyecto = pr.data.id;
  expect(cliente && proyecto).toBeTruthy();
}, 90_000);

afterAll(() => { vi.restoreAllMocks(); });

describe('el borrador, sin red', () => {
  it('las cuentas van en centavos, el IVA por renglón sobre su base', () => {
    const c = cuentas(BORRADOR.renglones as any);
    expect(c.renglones[0]).toEqual({ importe: P(85_000), descuento: 0, base: P(85_000), iva: P(13_600), total: P(98_600) });
    expect(c.renglones[1]).toEqual({ importe: P(3_000), descuento: P(300), base: P(2_700), iva: P(432), total: P(3_132) });
    expect(c).toMatchObject({ subtotal: P(88_000), descuento: P(300), iva: P(14_032), total: P(101_732) });
  });

  it('lo que el SAT va a rechazar se dice antes, con el campo', () => {
    const mal = (cambio: Record<string, unknown>, campo: string) => {
      const r = revisarBorrador({ ...BORRADOR, ...cambio });
      expect(esFallaPac(r) && r.detalle?.campo, JSON.stringify(r)).toBe(campo);
    };
    mal({ receptor: { ...RECEPTOR, rfc: 'NO-ES' } }, 'receptor.rfc');
    mal({ receptor: { ...RECEPTOR, razon_social: 'UNIVERSIDAD ROBOTICA ESPAÑOLA S.A. DE C.V.' } }, 'receptor.razon_social');
    mal({ receptor: { ...RECEPTOR, regimen_fiscal: '612' } }, 'receptor.regimen_fiscal'); // persona física con RFC de empresa
    mal({ receptor: { ...RECEPTOR, cp_fiscal: '6500' } }, 'receptor.cp_fiscal');
    mal({ receptor: { ...RECEPTOR, uso_cfdi: 'ZZ9' } }, 'receptor.uso_cfdi');
    mal({ forma_pago: '99' }, 'forma_pago');
    mal({ renglones: [] }, 'renglones');
    mal({ renglones: [{ ...RENGLON, clave_prod_serv: '5610' }] }, 'renglones[0].clave_prod_serv');
    mal({ renglones: [{ ...RENGLON, cantidad: 0 }] }, 'renglones[0].cantidad');
    mal({ renglones: [{ ...RENGLON, precio_unitario: 12.5 }] }, 'renglones[0].precio_unitario');
    mal({ renglones: [{ ...RENGLON, descuento: P(90_000) }] }, 'renglones[0].descuento');
    mal({ renglones: [{ ...RENGLON, iva: 8 }] }, 'renglones[0].iva');
    const bien = revisarBorrador({ ...BORRADOR, receptor: { ...RECEPTOR, rfc: ' ure-180429-tm6 ', razon_social: '  universidad   robotica  española ' } });
    expect(esFallaPac(bien)).toBe(false);
    expect(!esFallaPac(bien) && bien.receptor).toMatchObject({ rfc: RFC_CLIENTE, razon_social: 'UNIVERSIDAD ROBOTICA ESPAÑOLA' });
  });

  it('a Facturama se le manda en pesos, con los nombres que espera', () => {
    const b = revisarBorrador(BORRADOR);
    if (esFallaPac(b)) throw new Error('borrador malo');
    const c = cuerpoFacturama(b, { serie: 'A', folio: 7, fecha: '2026-10-09T10:00:00', lugar_expedicion: '64000' }) as any;
    expect(c).toMatchObject({ Serie: 'A', Folio: '7', CfdiType: 'I', PaymentMethod: 'PUE', PaymentForm: '03', Currency: 'MXN', ExpeditionPlace: '64000', Exportation: '01' });
    expect(c.Receiver).toEqual({ Rfc: RFC_CLIENTE, Name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', CfdiUse: 'G03', FiscalRegime: '603', TaxZipCode: '65000' });
    expect(c.Items[0]).toMatchObject({ ProductCode: '56101700', UnitCode: 'H87', Unit: 'Pieza', Quantity: 1, UnitPrice: 85000, Subtotal: 85000, TaxObject: '02', Total: 98600 });
    expect(c.Items[0].Taxes[0]).toMatchObject({ Name: 'IVA', Rate: 0.16, Base: 85000, Total: 13600, IsRetention: false });
    expect(c.Items[1]).toMatchObject({ Quantity: 2, UnitPrice: 1500, Subtotal: 3000, Discount: 300, Total: 3132 });
    expect(c.Items[1].Taxes[0]).toMatchObject({ Base: 2700, Total: 432 });
    const publico = cuerpoFacturama({ ...b, receptor: { ...b.receptor, rfc: 'XAXX010101000', uso_cfdi: 'G03', regimen_fiscal: '601', cp_fiscal: '65000' } }, { serie: 'A', folio: 9, fecha: '2026-10-09T10:00:00', lugar_expedicion: '64000' }) as any;
    expect(publico.Receiver, 'público en general: lo que el SAT exige, aunque la pantalla diga otra cosa').toEqual({ Rfc: 'XAXX010101000', Name: 'PUBLICO EN GENERAL', CfdiUse: 'S01', FiscalRegime: '616', TaxZipCode: '64000' });
    expect(publico.GlobalInformation, 'público en general lleva InformacionGlobal: diaria, del mes y año de la factura').toEqual({ Periodicity: '01', Months: '10', Year: 2026 });
    expect((cuerpoFacturama(b, { serie: 'A', folio: 9, fecha: '2026-10-09T10:00:00', lugar_expedicion: '64000' }) as any).GlobalInformation, 'un receptor con RFC no la lleva').toBeUndefined();
    const sin = cuerpoFacturama({ ...b, renglones: [{ ...b.renglones[0], iva: null }] }, { serie: 'A', folio: 8, fecha: '2026-10-09T10:00:00', lugar_expedicion: '64000' }) as any;
    expect(sin.Items[0].TaxObject).toBe('01');
    expect(sin.Items[0].Taxes).toBeUndefined();
  });
});

describe('la cuenta de Facturama', () => {
  it('sin cuenta: se dice, y emitir no se puede', async () => {
    const r = await o('mike', '/fiscal/pac');
    expect(r.estado).toBe(200);
    expect(r.data).toMatchObject({ cuenta: null, emitidas: 0, puede_configurar: true, puede_emitir: true });
    expect((await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: BORRADOR } })).estado).toBe(409);
  });

  it('sólo quien dirige la pone', async () => {
    expect((await o('beto', '/fiscal/pac', { method: 'PUT', json: { usuario: 'x', clave: 'y', sandbox: true } })).estado).toBe(403);
    expect((await o('ana', '/fiscal/pac')).data.puede_configurar).toBe(false);
  });

  it('una cuenta que Facturama no acepta no se guarda', async () => {
    const r = await o('mike', '/fiscal/pac', { method: 'PUT', json: { usuario: 'mike-sandbox', clave: 'otra', sandbox: true } });
    expect(r.estado, 'no 401: la pantalla lo leería como sesión vencida').toBe(422);
    expect(r.error).toBe('pac_credenciales');
    expect((await o('mike', '/fiscal/pac')).data.cuenta).toBeNull();
  });

  it('la buena queda, con su perfil, y sin la contraseña por ninguna parte', async () => {
    const r = await o('mike', '/fiscal/pac', { method: 'PUT', json: { usuario: 'mike-sandbox', clave: 'clave-sandbox', sandbox: true, serie: 'f' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.cuenta).toMatchObject({ usuario: 'mike-sandbox', sandbox: true, serie: 'F', folio_siguiente: 1, perfil: { rfc: RFC_EMPRESA, csd: true, regimen: '601' } });
    // La serie se da de alta en la sucursal de Facturama al guardar la cuenta (lo que pidió el de verdad).
    expect(r.data.serie_en_facturama).toEqual({ creada: true, sucursal: 'suc-1', cp: '64000' });
    expect(fac.st.sucursales[0].series.map((x) => x.Name)).toEqual(['F']);
    expect(JSON.stringify(r)).not.toContain('clave-sandbox');
    for (const ruta of ['/pac_config', '/emisiones']) expect((await o('mike', ruta, { app: 'dash101' })).estado, ruta).not.toBe(200);
  });

  it('una cuenta de producción con otro RFC no entra; en sandbox da igual', async () => {
    fac.st.perfil.Rfc = 'AAA010101AAA';
    expect(await o('mike', '/fiscal/pac', { method: 'PUT', json: { usuario: 'mike-sandbox', clave: 'clave-sandbox', sandbox: false } })).toMatchObject({ estado: 409, error: 'pac_de_otro_rfc' });
    expect((await o('mike', '/fiscal/pac', { method: 'PUT', json: { usuario: 'mike-sandbox', clave: 'clave-sandbox', sandbox: true } })).estado).toBe(200);
    fac.st.perfil.Rfc = RFC_EMPRESA;
    expect((await o('mike', '/fiscal/pac/perfil', { method: 'POST' })).data.cuenta.perfil.rfc).toBe(RFC_EMPRESA);
  });

  it('la serie y el folio se ajustan', async () => {
    const aj = await o('mike', '/fiscal/pac', { method: 'PATCH', json: { serie: 'FAC', folio_siguiente: 100 } });
    expect(aj.data.cuenta).toMatchObject({ serie: 'FAC', folio_siguiente: 100 });
    expect(aj.data.serie_en_facturama, 'la serie nueva también se da de alta en Facturama').toEqual({ creada: true, sucursal: 'suc-1', cp: '64000' });
    expect(fac.st.sucursales[0].series.find((x) => x.Name === 'FAC')?.Folio).toBe(100);
    expect((await o('mike', '/fiscal/pac', { method: 'PATCH', json: { folio_siguiente: 0 } })).estado).toBe(400);
  });
});

describe('emitir', () => {
  it('prellenar desde el proyecto trae al cliente y lo que se le conoce', async () => {
    const r = await o('mike', `/fiscal/emitir/prellenar?proyecto_id=${proyecto}`);
    expect(r.estado).toBe(200);
    expect(r.data.proyecto).toMatchObject({ id: proyecto, nombre: 'Cocina casa Robótica', facturado: 0 });
    expect(r.data.cliente).toMatchObject({ id: cliente });
    expect(r.data.receptor).toMatchObject({ rfc: RFC_CLIENTE, razon_social: 'Universidad Robótica', regimen_fiscal: '', uso_cfdi: 'G03' });
    expect((await o('mike', '/fiscal/emitir/prellenar?proyecto_id=nada')).estado).toBe(404);
  });

  it('revisar: las cuentas sin timbrar', async () => {
    const r = await o('ana', '/fiscal/emitir/revisar', { method: 'POST', json: { borrador: BORRADOR } });
    expect(r.estado).toBe(200);
    expect(r.data.cuentas.total).toBe(P(101_732));
    expect(await o('ana', '/fiscal/emitir/revisar', { method: 'POST', json: { borrador: { ...BORRADOR, forma_pago: '99' } } })).toMatchObject({ estado: 400, error: 'borrador_invalido', detalle: { campo: 'forma_pago' } });
  });

  it('el lugar de expedición es el CP de la sucursal de Facturama; sin ninguno, no se timbra', async () => {
    fac.st.perfil.TaxAddress.ZipCode = '';
    fac.st.sucursales[0].Address.ZipCode = '';
    await o('mike', '/fiscal/pac/perfil', { method: 'POST' });
    expect(await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: BORRADOR } })).toMatchObject({ estado: 409, error: 'falta_cp_empresa' });
    fac.st.perfil.TaxAddress.ZipCode = '64000';
    fac.st.sucursales[0].Address.ZipCode = '10900';
    // En Ajustes dice 64000, pero Facturama sólo acepta el CP de su sucursal: 10900.
    expect((await o('mike', '/fiscal/config', { method: 'PUT', json: { cp: '64000', regimen: '601', razon_social: 'ESCUELA KEMPER URGATE' } })).estado).toBe(200);
  });

  it('quien no dirige ni lleva la contabilidad no emite', async () => {
    expect((await o('ana', '/fiscal/emitir', { method: 'POST', json: { borrador: BORRADOR } })).estado).toBe(403);
  });

  it('se timbra: Facturama recibe el cuerpo, la factura entra como emitida con su XML, el folio corre', async () => {
    const r = await o('beto', '/fiscal/emitir', { method: 'POST', json: { borrador: BORRADOR, proyecto_id: proyecto, cliente_id: cliente } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.folio).toBe('FAC-100');
    expect(r.data.uuid).toMatch(/^F0000001-/);
    expect(r.data.cfdi).toMatchObject({ tipo: 'ingreso', lado: 'emitida', origen: 'timbrado', estado: 'vigente', total: P(101_732), subtotal: P(87_700), iva: P(14_032), serie: 'FAC', folio: '100', rfc: RFC_CLIENTE, proyecto_id: proyecto, tiene_xml: true, metodo_pago: 'PUE', forma_pago: '03' });
    const mandado = fac.st.llamadas.find((l) => l.paso === 'timbrar')!.cuerpo as any;
    expect(mandado).toMatchObject({ Serie: 'FAC', Folio: '100', ExpeditionPlace: '10900', Receiver: { Rfc: RFC_CLIENTE, Name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', FiscalRegime: '603', TaxZipCode: '65000', CfdiUse: 'G03' } });
    expect(mandado.Date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    const xml = await SELF.fetch(`https://api.local/orgs/${ORG}/fiscal/cfdi/${r.data.cfdi_id}/xml`, { headers: { Cookie: galletas.mike, 'X-App': 'bill101' } });
    expect(xml.status).toBe(200);
    expect(await xml.text()).toContain(`UUID="${r.data.uuid}"`);
    const pac = (await o('mike', '/fiscal/pac')).data;
    expect(pac.cuenta.folio_siguiente).toBe(101);
    expect(pac.emitidas).toBe(1);
    // Al cliente se le quedó lo fiscal con que se le facturó.
    const cli = (await o('mike', `/clientes/${cliente}`, { app: 'dash101' })).data;
    expect(cli).toMatchObject({ rfc: RFC_CLIENTE, razon_social: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', regimen_fiscal: '603', cp_fiscal: '65000', uso_cfdi: 'G03' });
    expect((await o('mike', `/fiscal/emitir/prellenar?cliente_id=${cliente}`)).data.receptor).toMatchObject({ razon_social: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', regimen_fiscal: '603', cp_fiscal: '65000' });
    expect((await o('mike', `/fiscal/emitir/prellenar?proyecto_id=${proyecto}`)).data.proyecto.facturado).toBe(P(101_732));
    // Y cuenta en los impuestos del mes.
    const imp = (await o('mike', '/fiscal/impuestos?anio=2026')).data;
    expect(imp.meses.reduce((s: number, m: any) => s + m.iva.trasladado, 0)).toBe(P(14_032));
  });

  it('la emisión quedó registrada', async () => {
    const e = (await o('mike', '/fiscal/emisiones')).data.filas as any[];
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ serie: 'FAC', folio: 100, estado: 'timbrada', rfc: RFC_CLIENTE, total: P(101_732), cfdi_estado: 'vigente' });
    expect(e[0].uuid).toBeTruthy();
  });

  it('Facturama la rechaza: se dice campo por campo, la emisión queda fallida y el folio no se repite', async () => {
    const r = await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: { ...BORRADOR, receptor: { ...RECEPTOR, rfc: 'XXX010101XXX' } } } });
    expect(r.estado).toBe(422);
    expect(r.error).toBe('pac_rechaza');
    expect(r.detalle.motivos[0]).toMatch(/no está en la lista/);
    expect(r.detalle.folio).toBe('FAC-101');
    const e = (await o('mike', '/fiscal/emisiones')).data.filas as any[];
    expect(e[0]).toMatchObject({ folio: 101, estado: 'fallida' });
    expect((await o('mike', '/fiscal/pac')).data.cuenta.folio_siguiente).toBe(102);
  });

  it('Facturama no contesta al timbrar: la emisión se queda «timbrando», se dice que no se reintente a ciegas, y nada más se timbra hasta resolverla', async () => {
    fac.st.modo = 'calla_al_timbrar';
    const r = await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: { ...BORRADOR, renglones: [{ ...RENGLON, cantidad: 3 }] } } });
    expect(r.estado).toBe(502);
    expect(r.error).toBe('pac_no_responde');
    expect(r.detalle.que_hacer).toMatch(/no se sabe/);
    fac.st.modo = 'bien';
    const e = (await o('mike', '/fiscal/emisiones')).data.filas as any[];
    expect(e[0]).toMatchObject({ folio: 102, estado: 'timbrando' });
    expect((await o('mike', '/fiscal/pac')).data.en_camino).toBe(1);
    // La puerta queda cerrada: otra factura, aunque sea distinta, no se timbra.
    const otra = await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: { ...BORRADOR, renglones: [{ ...RENGLON, descripcion: 'Otra' }] } } });
    expect(otra).toMatchObject({ estado: 409, error: 'emision_en_camino' });
    expect(otra.detalle.emision_id).toBe(e[0].id);
    expect(fac.st.llamadas.filter((l) => l.paso === 'timbrar' && (l.cuerpo as any).Items[0].Description === 'Otra')).toHaveLength(0);
  });

  it('resolver: Facturama no tiene ese folio → queda fallida, y se vuelve a poder timbrar', async () => {
    const e = (await o('mike', '/fiscal/emisiones')).data.filas as any[];
    expect((await o('ana', `/fiscal/emisiones/${e[0].id}/resolver`, { method: 'POST' })).estado).toBe(403);
    const r = await o('mike', `/fiscal/emisiones/${e[0].id}/resolver`, { method: 'POST' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.resultado).toBe('fallida');
    expect(fac.st.llamadas.find((l) => l.paso === 'buscar')).toMatchObject({ keyword: '102' });
    expect((await o('mike', '/fiscal/emisiones')).data.filas[0]).toMatchObject({ folio: 102, estado: 'fallida' });
    expect((await o('mike', '/fiscal/pac')).data.en_camino).toBe(0);
    expect((await o('mike', `/fiscal/emisiones/${e[0].id}/resolver`, { method: 'POST' })).estado, 'una cerrada no se resuelve dos veces').toBe(409);
  });

  it('resolver: Facturama SÍ la timbró aunque no contestó → se recupera con su XML, sin timbrar otra', async () => {
    fac.st.modo = 'timbra_y_calla';
    const r = await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: { ...BORRADOR, renglones: [{ ...RENGLON, descripcion: 'Librero' }] } } });
    expect(r.estado).toBe(502);
    fac.st.modo = 'bien';
    const em = (await o('mike', '/fiscal/emisiones')).data.filas[0];
    expect(em).toMatchObject({ estado: 'timbrando', folio: 103 });
    const timbres = fac.st.llamadas.filter((l) => l.paso === 'timbrar').length;
    const res = await o('mike', `/fiscal/emisiones/${em.id}/resolver`, { method: 'POST' });
    expect(res.estado, JSON.stringify(res)).toBe(200);
    expect(res.data.resultado).toBe('timbrada');
    expect(res.data.cfdi).toMatchObject({ folio: '103', origen: 'timbrado', estado: 'vigente' });
    expect(fac.st.llamadas.filter((l) => l.paso === 'timbrar').length, 'no se volvió a timbrar').toBe(timbres);
    expect((await o('mike', '/fiscal/emisiones')).data.filas[0]).toMatchObject({ estado: 'timbrada', folio: 103 });
    const cf = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
    expect(cf.filter((x) => x.pac_id).map((x) => x.folio).sort(), 'la 100 y la 103 tienen su id de Facturama').toEqual(['100', '103']);
  });

  it('en una cuenta de pruebas el emisor es el RFC del sandbox, y aun así entra como emitida de la empresa', async () => {
    expect((await o('mike', '/empresa', { method: 'PATCH', app: 'dash101', json: { rfc: 'AAA010101AAA' } })).estado).toBe(200);
    const r = await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: { ...BORRADOR, renglones: [{ ...RENGLON, descripcion: 'Mesa' }] } } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.cfdi).toMatchObject({ lado: 'emitida', tipo: 'ingreso', rfc_emisor: RFC_EMPRESA });
    expect((await o('mike', '/empresa', { method: 'PATCH', app: 'dash101', json: { rfc: RFC_EMPRESA } })).estado).toBe(200);
  });

  it('el mismo clic dos veces no timbra dos veces', async () => {
    const b = { ...BORRADOR, renglones: [{ ...RENGLON, descripcion: 'Closet' }] };
    const [a, c] = await Promise.all([
      o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: b } }),
      o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: b } }),
    ]);
    const estados = [a.estado, c.estado].sort();
    expect(estados, JSON.stringify([a, c])).toEqual([201, 409]);
    expect(fac.st.llamadas.filter((l) => l.paso === 'timbrar' && (l.cuerpo as any).Items[0].Description === 'Closet')).toHaveLength(1);
    expect([a, c].find((x) => x.estado === 409)!.error).toBe('emision_repetida');
  });

  it('sin el sello en Facturama no se intenta', async () => {
    fac.st.perfil.Csd.Certificate = null;
    await o('mike', '/fiscal/pac/perfil', { method: 'POST' });
    expect(await o('mike', '/fiscal/emitir', { method: 'POST', json: { borrador: BORRADOR } })).toMatchObject({ estado: 409, error: 'pac_sin_sello' });
    fac.st.perfil.Csd.Certificate = 'MIIF…';
    expect((await o('mike', '/fiscal/pac/perfil', { method: 'POST' })).data.cuenta.perfil.csd).toBe(true);
  });
});

describe('el PDF y la cancelación', () => {
  let id = '';
  beforeAll(async () => {
    const filas = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
    id = filas.find((f) => f.folio === '100').id;
  });

  it('el PDF lo arma Facturama la primera vez y luego se sirve de aquí', async () => {
    const r1 = await SELF.fetch(`https://api.local/orgs/${ORG}/fiscal/cfdi/${id}/pdf`, { headers: { Cookie: galletas.ana, 'X-App': 'bill101' } });
    expect(r1.status).toBe(200);
    expect(r1.headers.get('Content-Type')).toBe('application/pdf');
    expect(r1.headers.get('Content-Disposition')).toContain('FAC-100.pdf');
    expect(await r1.text()).toContain('%PDF');
    const antes = fac.st.llamadas.filter((l) => l.paso === 'bajar_pdf').length;
    const r2 = await SELF.fetch(`https://api.local/orgs/${ORG}/fiscal/cfdi/${id}/pdf`, { headers: { Cookie: galletas.ana, 'X-App': 'bill101' } });
    expect(r2.status).toBe(200);
    expect(fac.st.llamadas.filter((l) => l.paso === 'bajar_pdf').length, 'la segunda vez no se le pide a Facturama').toBe(antes);
    expect((await entorno.ARCHIVOS.list({ prefix: `orgs/${ORG}/cfdi/` })).objects.some((x) => x.key.endsWith('.pdf'))).toBe(true);
  });

  it('cancelar: motivo obligatorio; el 01 pide la que sustituye; quien no puede, no', async () => {
    expect((await o('ana', `/fiscal/cfdi/${id}/cancelar`, { method: 'POST', json: { motivo: '02' } })).estado).toBe(403);
    expect((await o('mike', `/fiscal/cfdi/${id}/cancelar`, { method: 'POST', json: { motivo: '09' } })).estado).toBe(400);
    expect((await o('mike', `/fiscal/cfdi/${id}/cancelar`, { method: 'POST', json: { motivo: '01' } })).estado).toBe(400);
  });

  it('una subida a mano no se cancela desde aquí', async () => {
    const filas = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
    const manual = await o('mike', '/fiscal/cfdi', { method: 'POST', app: 'dash101', json: { uuid: 'AAAAAAAA-0000-4000-8000-00000000AAAA', tipo: 'ingreso', total: P(100), subtotal: P(100), iva: 0, fecha: '2026-05-05', rfc: RFC_CLIENTE } });
    expect(manual.estado, JSON.stringify(manual)).toBe(201);
    // La ruta de la 0009 sigue: una capturada a mano se cancela aquí, sin SAT.
    const r = await o('mike', `/fiscal/cfdi/${manual.data.id}/cancelar`, { method: 'POST', json: { motivo: '02' } });
    expect(r.estado).toBe(200);
    expect(r.data.estado).toBe('cancelada');
    expect(fac.st.llamadas.some((l) => l.paso === 'cancelar'), 'sin pasar por Facturama').toBe(false);
    expect(filas.length).toBeGreaterThan(0);
  });

  it('se cancela: Facturama lo recibe, aquí queda cancelada con su motivo y el acuse guardado', async () => {
    const r = await o('beto', `/fiscal/cfdi/${id}/cancelar`, { method: 'POST', json: { motivo: '02' } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data).toMatchObject({ estado: 'cancelada', cambio: true, cfdi: { estado: 'cancelada', motivo_cancelacion: '02', cancelacion: 'cancelada', estado_sat: 'cancelado' } });
    expect(r.data.cfdi.acuse_llave).toBeTruthy();
    expect(r.data.acuse_llave).toBe(r.data.cfdi.acuse_llave);
    expect(fac.st.llamadas.find((l) => l.paso === 'cancelar')).toMatchObject({ motive: '02', type: 'issued', uuidReplacement: null });
    expect((await o('mike', `/fiscal/cfdi/${id}/cancelar`, { method: 'POST', json: { motivo: '02' } })).estado).toBe(409);
    const imp = (await o('mike', '/fiscal/impuestos?anio=2026')).data;
    expect(imp.meses.reduce((s: number, m: any) => s + m.iva.trasladado, 0), 'ya no cuenta en el IVA: quedan Closet, Librero y Mesa').toBe(P(40_800));
  });

  it('cuando el receptor tiene que aceptar, queda pendiente y sigue vigente', async () => {
    const filas = (await o('mike', '/fiscal/cfdi')).data.filas as any[];
    const closet = filas.find((f) => f.origen === 'timbrado' && f.estado === 'vigente');
    fac.st.modo = 'cancelacion_pendiente';
    const r = await o('mike', `/fiscal/cfdi/${closet.id}/cancelar`, { method: 'POST', json: { motivo: '03' } });
    fac.st.modo = 'bien';
    expect(r.estado).toBe(200);
    expect(r.data).toMatchObject({ estado: 'pendiente', cambio: false, cfdi: { estado: 'vigente', cancelacion: 'pendiente', motivo_cancelacion: '03' } });
    // La lista del SAT (fase D) la resuelve: el SAT dice cancelada → aquí también.
    const dentro = (await import('cloudflare:test')).runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T) => Promise<T>;
    const entorno2 = env as unknown as { ORG: DurableObjectNamespace };
    const a = await dentro(entorno2.ORG.get(entorno2.ORG.idFromName(ORG)), (db: any) => db.fiscal('anotarSat', [closet.id, { estado: 'cancelado' }]));
    expect(a.cambio).toBe(true);
    const f2 = (await o('mike', `/fiscal/cfdi/${closet.id}`)).data;
    expect(f2).toMatchObject({ estado: 'cancelada', cancelacion: 'cancelada', estado_sat: 'cancelado' });
  });
});

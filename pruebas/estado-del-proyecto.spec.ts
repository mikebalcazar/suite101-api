/* El estado de cuenta de un proyecto · contrato 0.39.0
 *
 * Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
 * excel con lo siguiente de cada proyecto: saldo general, lista de productos
 * en proyecto, subtotal, IVA y total de proyecto completo, movimientos de
 * proyecto (pagos), fecha del día que se genera el status. Creo que esto es
 * lo mismo que el cliente podría descargar desde peek101».
 *
 * Este documento se le manda a un cliente, así que lo que estas pruebas
 * cuidan no es que la ruta conteste: es que lo que diga el papel sea cierto.
 *
 * LO QUE DE VERDAD APORTAN:
 *
 *   · que LA SUMA DE LA LISTA SEA EL SUBTOTAL. Si un renglón que no suma se
 *     colara en la tabla —un cotizado, un cancelado—, el cliente sumaría la
 *     columna con una calculadora y no le daría el total de abajo. Es el
 *     error más barato de cometer y el más caro de explicar;
 *   · que el DESGLOSE cuadre al centavo en los dos sentidos, y que al 0 %
 *     las dos lecturas coincidan;
 *   · que NO VIAJE UN SOLO EGRESO. Lo que le pagas a un proveedor no es
 *     asunto de tu cliente, y esta misma ruta la abre él;
 *   · que un cliente SÓLO abra el suyo. Es la puerta, y se mide con un
 *     proyecto de otro cliente enfrente;
 *   · que la FECHA la ponga el servidor, no el navegador de quien imprime;
 *   · que cambiar el modo de IVA NO MUEVA ningún peso guardado: cambia cómo
 *     se lee `precio_venta`, no cuánto vale;
 *   · que el EXCEL lleve los MISMOS números que el JSON y que sea un archivo
 *     válido. Un .xlsx mal armado no avisa: abre con «archivo dañado» y no
 *     dice dónde.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { crc32 } from '../src/xlsx';

const CORREO = 'mike@forespot.com';
const ORG = 'estado-proyecto';

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

let negocio = '', cliente = '', otroCliente = '', cuenta = '', proyecto = '', ajeno = '';

const item = async (nombre: string, monto: number, cantidad = 1, estado = 'vendido') =>
  (await o('mike', '/items', { method: 'POST', json: {
    negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
    nombre, monto, cantidad, estado, tipo: 'mueble',
  } })).data.id as string;

const estado = (quien = 'mike', pid = proyecto) => o(quien, `/proyectos/${pid}/estado`);
const modoIva = (incluido: boolean, tasa = 1600) =>
  o('mike', `/proyectos/${proyecto}`, { method: 'PATCH', json: { iva_incluido: incluido ? 1 : 0, tasa_iva: tasa } });

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Estado del proyecto', apps: { dash: true, peek: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);

  negocio = (await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller', rfc: 'AAA010101AAA' } })).data.id;
  cliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'HOLCIM', rfc: 'BBB020202BBB', correo: 'contacto@holcim.mx' } })).data.id;
  otroCliente = (await o('mike', '/clientes', { method: 'POST', json: { negocio_id: negocio, nombre: 'Otro' } })).data.id;
  cuenta = (await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco' } })).data.id;
  proyecto = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Obra HOLCIM' } })).data.id;
  ajeno = (await o('mike', '/proyectos', { method: 'POST', json: { negocio_id: negocio, cliente_id: otroCliente, nombre: 'Obra de otro' } })).data.id;

  /* OJO: `items.monto` es el IMPORTE del renglón, no el precio por pieza.
   * Así lo escribe `agrupar` (monto = precio × cantidad) y así lo suma
   * `recalcularProyecto`. El precio unitario se saca dividiendo, que es
   * justo lo que el documento tiene que hacer bien. */
  await item('Puerta modelo A', 2_850_00 * 25, 25);
  await item('Clóset', 40_000_00, 1);
  await item('Pérgola que nadie aprobó', 90_000_00, 1, 'cotizado');
}, 60000);

describe('lo que dice el papel', () => {
  it('la suma de la lista ES el subtotal', async () => {
    const r = await estado();
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const suma = r.data.items.reduce((t: number, i: any) => t + i.importe, 0);
    expect(suma).toBe(r.data.totales.subtotal);
    /* 25 × 2,850 + 40,000 = 111,250. El cotizado NO entra. */
    expect(suma).toBe(2_850_00 * 25 + 40_000_00);
    expect(r.data.items).toHaveLength(2);
    expect(r.data.totales.piezas).toBe(26);
  });

  it('el precio unitario sale de la cantidad, no del renglón', async () => {
    const r = await estado();
    const puerta = r.data.items.find((i: any) => i.nombre === 'Puerta modelo A');
    expect(puerta.cantidad).toBe(25);
    expect(puerta.precio_unitario).toBe(2_850_00);
    expect(puerta.importe).toBe(2_850_00 * 25);
  });

  it('lo que no está vendido no sale', async () => {
    const r = await estado();
    expect(r.data.items.map((i: any) => i.nombre)).not.toContain('Pérgola que nadie aprobó');
  });

  it('la fecha la pone el servidor', async () => {
    const r = await estado();
    expect(r.data.generado_at, 'viene con forma de fecha ISO').toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Math.abs(Date.now() - Date.parse(r.data.generado_at)), 'y es de ahorita').toBeLessThan(120_000);
  });
});

describe('el desglose de IVA', () => {
  it('«+ IVA» es como nace: lo capturado es el subtotal', async () => {
    const r = await estado();
    const t = r.data.totales;
    expect(t.iva_incluido).toBe(false);
    expect(t.tasa_iva).toBe(1600);
    expect(t.subtotal).toBe(111_250_00);
    expect(t.iva).toBe(17_800_00);
    expect(t.total).toBe(129_050_00);
    expect(t.subtotal + t.iva).toBe(t.total);
  });

  it('«IVA incluido» desglosa hacia atrás y cuadra al centavo', async () => {
    expect((await modoIva(true)).estado).toBe(200);
    const t = (await estado()).data.totales;
    expect(t.iva_incluido).toBe(true);
    expect(t.total, 'el total es lo capturado').toBe(111_250_00);
    expect(t.subtotal + t.iva).toBe(t.total);
    expect(t.subtotal).toBe(Math.round((111_250_00 * 10000) / 11600));
  });

  it('cambiar el modo NO mueve un peso de lo guardado', async () => {
    const antes = Number((await o('mike', `/proyectos/${proyecto}`)).data.precio_venta);
    await modoIva(false);
    expect(Number((await o('mike', `/proyectos/${proyecto}`)).data.precio_venta)).toBe(antes);
    const items = await o('mike', `/items?proyecto_id=${proyecto}`);
    expect(items.data.filas.reduce((t: number, i: any) => t + Number(i.monto), 0)).toBe(antes + 90_000_00);
  });

  it('al 0 % las dos lecturas dan lo mismo', async () => {
    await modoIva(false, 0);
    const a = (await estado()).data.totales;
    await modoIva(true, 0);
    const b = (await estado()).data.totales;
    expect(a.iva).toBe(0);
    expect(b.iva).toBe(0);
    expect(a.total).toBe(b.total);
    expect(a.subtotal).toBe(b.subtotal);
    await modoIva(false, 1600);
  });
});

describe('los pagos y el saldo', () => {
  beforeAll(async () => {
    await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'ingreso', monto: 50_000_00, fecha: '2026-03-01',
      cuenta_id: cuenta, proyecto_id: proyecto, contraparte_tipo: 'cliente', contraparte_id: cliente,
      descripcion: 'Anticipo',
    } });
    await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'egreso', monto: 9_000_00, fecha: '2026-03-05',
      cuenta_id: cuenta, proyecto_id: proyecto, contraparte_tipo: 'proveedor',
      descripcion: 'Herrería — ESTO NO LO VE EL CLIENTE',
    } });
  });

  it('sólo van ingresos: el egreso al proveedor no viaja', async () => {
    const r = await estado();
    expect(r.data.movimientos).toHaveLength(1);
    expect(JSON.stringify(r.data.movimientos)).not.toContain('NO LO VE EL CLIENTE');
  });

  it('el saldo es contra el TOTAL con IVA, que es lo que va a pagar', async () => {
    const t = (await estado()).data.totales;
    expect(t.cobrado).toBe(50_000_00);
    expect(t.saldo).toBe(t.total - 50_000_00);
    expect(t.saldo).toBe(129_050_00 - 50_000_00);
  });
});

describe('quién lo abre', () => {
  let usuarioCliente = '';

  beforeAll(async () => {
    /* La invitación encuentra al cliente POR CORREO —por eso HOLCIM se creó
     * con el suyo—; si no lo encontrara crearía otro y la prueba de «sólo el
     * suyo» estaría midiendo un cliente distinto al del proyecto. */
    const inv = await o('mike', '/clientes/invitar', { method: 'POST', json: { correo: 'contacto@holcim.mx', nombre: 'Contacto' } });
    expect(inv.estado, JSON.stringify(inv)).toBe(201);
    expect(inv.data.cliente_id, 'invitó al cliente que ya existía, no a uno nuevo').toBe(cliente);
    usuarioCliente = 'contacto@holcim.mx';
    const c = await pedir('holcim', '/auth/codigo', { method: 'POST', json: { correo: usuarioCliente }, app: '' });
    await pedir('holcim', '/auth/entrar', { method: 'POST', json: { correo: usuarioCliente, codigo: c.data.codigo_prueba }, app: '' });
  });

  it('el cliente abre el estado de SU proyecto', async () => {
    const r = await o('holcim', `/proyectos/${proyecto}/estado`, { app: 'peek101' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.totales.total).toBe(129_050_00);
    expect(r.data.movimientos).toHaveLength(1);
  });

  it('y NO el de otro cliente', async () => {
    const r = await o('holcim', `/proyectos/${ajeno}/estado`, { app: 'peek101' });
    expect(r.estado).toBe(403);
  });

  it('un proyecto que no existe es 404', async () => {
    expect((await o('mike', '/proyectos/no-existe/estado')).estado).toBe(404);
  });
});

describe('el mismo estado, en Excel', () => {
  /** Abre el ZIP como lo abriría Excel y devuelve sus partes. */
  const abrir = (bytes: Uint8Array) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let fin = bytes.length - 22;
    while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin--;
    expect(fin, 'trae su fin de directorio central').toBeGreaterThanOrEqual(0);
    const cuantos = v.getUint16(fin + 10, true);
    let p = v.getUint32(fin + 16, true);
    const partes: Record<string, string> = {};
    const texto = new TextDecoder();
    for (let i = 0; i < cuantos; i++) {
      const suma = v.getUint32(p + 16, true);
      const tam = v.getUint32(p + 24, true);
      const largo = v.getUint16(p + 28, true);
      const donde = v.getUint32(p + 42, true);
      const nombre = texto.decode(bytes.subarray(p + 46, p + 46 + largo));
      const inicio = donde + 30 + v.getUint16(donde + 26, true) + v.getUint16(donde + 28, true);
      const datos = bytes.subarray(inicio, inicio + tam);
      expect(crc32(datos), `${nombre} cuadra con su suma`).toBe(suma);
      partes[nombre] = texto.decode(datos);
      p += 46 + largo + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    return partes;
  };

  const bajar = async (quien: string, pid: string, app = 'dash101') => {
    const cabeceras: Record<string, string> = { 'X-App': app };
    if (galletas[quien]) cabeceras.Cookie = galletas[quien];
    return SELF.fetch(`https://api.local/orgs/${ORG}/proyectos/${pid}/estado.xlsx`, { headers: cabeceras });
  };

  it('baja como archivo, con su tipo y su nombre', async () => {
    const r = await bajar('mike', proyecto);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('spreadsheetml.sheet');
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="estado-.*\.xlsx"/);
  });

  it('es un ZIP válido con las dos hojas, y los números son los del documento', async () => {
    const bytes = new Uint8Array(await (await bajar('mike', proyecto)).arrayBuffer());
    expect(bytes[0], 'empieza con PK').toBe(0x50);
    const partes = abrir(bytes);
    expect(Object.keys(partes)).toContain('xl/worksheets/sheet1.xml');
    expect(Object.keys(partes)).toContain('xl/worksheets/sheet2.xml');
    expect(partes['xl/workbook.xml']).toContain('name="Ítems"');
    expect(partes['xl/workbook.xml']).toContain('name="Pagos"');

    const t = (await estado()).data.totales;
    const hoja = partes['xl/worksheets/sheet1.xml'];
    /* En PESOS y como NÚMERO: si viajara «$129,050.00» la suma de Excel
     * daría cero y quien lo abra creería que no le deben nada. */
    expect(hoja, 'el total en pesos, como número').toContain(`<v>${t.total / 100}</v>`);
    expect(hoja).toContain(`<v>${t.subtotal / 100}</v>`);
    expect(partes['xl/worksheets/sheet2.xml'], 'el pago').toContain(`<v>${t.cobrado / 100}</v>`);
  });

  it('el cliente baja el suyo y NO el de otro', async () => {
    expect((await bajar('holcim', proyecto, 'peek101')).status).toBe(200);
    expect((await bajar('holcim', ajeno, 'peek101')).status).toBe(403);
  });
});

/* Accionistas y retiros de utilidades (0.57.0).
 *
 * Mike, 30-sep-2026: «El dash, necesito un módulo de accionistas donde se
 * registren pagos a los accionistas como retiro de utilidades».
 *
 * Lo que se mide: dash101 da de alta un accionista por el CRUD genérico y la
 * API lo normaliza y lo revisa (nombre, participación 0-100, RFC, correo);
 * el retiro es un egreso con categoria 'retiro_utilidades' y contraparte
 * 'accionista' que baja el saldo de la cuenta; la lista sale por negocio y
 * la ve quien ve dinero; quote101 y supply101 no escriben accionistas; y un
 * negocio con accionistas colgados no se borra (409 en_uso), como con todo.
 */
import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIA_RETIRO_UTILIDADES } from '../schema/tipos';

const CORREO = 'mike@forespot.com';
const ORG = 'accionistas';
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
  expect(c.estado, JSON.stringify(c)).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

let negocio = '';
let otroNegocio = '';
let cuenta = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Accionistas de prueba', apps: { dash: true, roster: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  const n = await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Taller', moneda: 'MXN' } });
  expect(n.estado, JSON.stringify(n)).toBe(201);
  negocio = n.data.id;
  const n2 = await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Otro', moneda: 'MXN' } });
  otroNegocio = n2.data.id;
  const cta = await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldo_inicial: 1_000_000 } });
  expect(cta.estado, JSON.stringify(cta)).toBe(201);
  cuenta = cta.data.id;
});

describe('el alta del accionista', () => {
  let id = '';
  it('dash101 lo da de alta con todo; la API normaliza RFC y correo y guarda la participación como número', async () => {
    const r = await o('mike', '/accionistas', { method: 'POST', json: {
      negocio_id: negocio, nombre: '  Mike Balcázar ', rfc: 'bamx800101 ab1', correo: 'Mike@Ejemplo.MX', telefono: '55 1234 5678', porcentaje: '60', notas: 'socio fundador',
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    id = r.data.id;
    expect(r.data.nombre).toBe('Mike Balcázar');
    expect(r.data.nombre_norm).toBe('mike balcazar');
    expect(r.data.rfc).toBe('BAMX800101AB1');
    expect(r.data.correo).toBe('mike@ejemplo.mx');
    expect(r.data.porcentaje).toBe(60);
    expect(r.data.activo).toBe(true);
    const leido = await o('mike', `/accionistas/${id}`);
    expect(leido.estado).toBe(200);
    expect(leido.data.porcentaje).toBe(60);
  });
  it('rechaza sin nombre, con participación fuera de 0-100, con RFC chueco o correo sin arroba', async () => {
    const sinNombre = await o('mike', '/accionistas', { method: 'POST', json: { negocio_id: negocio, nombre: '   ' } });
    expect(sinNombre.estado).toBe(400);
    expect(sinNombre.detalle.errores.nombre).toMatch(/nombre/);
    const pasado = await o('mike', '/accionistas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Paco', porcentaje: 140 } });
    expect(pasado.estado).toBe(400);
    expect(pasado.detalle.errores.porcentaje).toMatch(/entre 0 y 100/);
    const negativo = await o('mike', '/accionistas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Paco', porcentaje: -1 } });
    expect(negativo.estado).toBe(400);
    const rfc = await o('mike', '/accionistas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Paco', rfc: 'NOESRFC' } });
    expect(rfc.estado).toBe(400);
    expect(rfc.detalle.errores.rfc).toMatch(/RFC/);
    const correo = await o('mike', '/accionistas', { method: 'POST', json: { negocio_id: negocio, nombre: 'Paco', correo: 'paco-sin-arroba' } });
    expect(correo.estado).toBe(400);
    expect(correo.detalle.errores.correo).toMatch(/correo/);
    /* Sin negocio_id ya NO es error (0.61.0): la API le pone el de la
     * empresa. Se borra enseguida para que las listas de abajo no lo vean. */
    const sinNegocio = await o('mike', '/accionistas', { method: 'POST', json: { nombre: 'Paco' } });
    expect(sinNegocio.estado, JSON.stringify(sinNegocio)).toBe(201);
    expect(sinNegocio.data.negocio_id).toBeTruthy();
    expect((await o('mike', `/accionistas/${sinNegocio.data.id}`, { method: 'DELETE' })).estado).toBe(200);
  });
  it('se corrige por PATCH con la misma vara, y la participación vacía queda en null', async () => {
    const mal = await o('mike', `/accionistas/${id}`, { method: 'PATCH', json: { porcentaje: 'mucho' } });
    expect(mal.estado).toBe(400);
    const bien = await o('mike', `/accionistas/${id}`, { method: 'PATCH', json: { porcentaje: '', telefono: '' } });
    expect(bien.estado, JSON.stringify(bien)).toBe(200);
    expect(bien.data.porcentaje).toBeNull();
    expect(bien.data.telefono).toBeNull();
    const de40 = await o('mike', `/accionistas/${id}`, { method: 'PATCH', json: { porcentaje: 40.5 } });
    expect(de40.data.porcentaje).toBe(40.5);
  });
  it('quote101 y supply101 no escriben accionistas; el personal sin ve_dinero no los lee', async () => {
    const q = await o('mike', '/accionistas', { method: 'POST', app: 'cotizador101', json: { negocio_id: negocio, nombre: 'Colado' } });
    expect(q.estado).toBe(403);
    const s = await o('mike', '/accionistas', { method: 'POST', app: 'supply101', json: { negocio_id: negocio, nombre: 'Colado' } });
    expect(s.estado).toBe(403);
    const p = await o('mike', '/personal', { method: 'POST', app: 'roster101', json: { nombre: 'Lupe Piso', correo: 'lupe-acc@ejemplo.mx', activo: true } });
    expect(p.estado, JSON.stringify(p)).toBe(201);
    const acceso = await o('mike', `/personal/${p.data.id}/acceso`, { method: 'POST', app: 'roster101', json: { correo: 'lupe-acc@ejemplo.mx', pin: '730514' } });
    expect([200, 201]).toContain(acceso.estado);
    await entrar('lupe', 'lupe-acc@ejemplo.mx');
    const lista = await o('lupe', `/accionistas?negocio_id=${negocio}`);
    expect(lista.estado).toBe(403);
  });
});

describe('el retiro de utilidades', () => {
  let acc = '';
  it('es un egreso con la categoría y la contraparte del accionista, y baja el saldo de la cuenta', async () => {
    const lista = await o('mike', `/accionistas?negocio_id=${negocio}`);
    acc = lista.data.filas[0].id;
    const saldo = async () => {
      const c = (await o('mike', `/cuentas/${cuenta}`)).data;
      const movs = (await o('mike', `/movimientos?cuenta_id=${cuenta}`)).data.filas;
      return movs.reduce((s: number, m: any) => s + (m.tipo === 'ingreso' ? m.monto : -m.monto), c.saldo_inicial);
    };
    const antes = await saldo();
    const r = await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'egreso', monto: 250_000, fecha: '2026-09-30', cuenta_id: cuenta,
      contraparte_tipo: 'accionista', contraparte_id: acc, contraparte_nombre: 'Mike Balcázar',
      categoria: CATEGORIA_RETIRO_UTILIDADES, descripcion: 'Retiro de utilidades de septiembre',
    } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.contraparte_tipo).toBe('accionista');
    expect(r.data.categoria).toBe('retiro_utilidades');
    const despues = await saldo();
    expect(antes - despues).toBe(250_000);
  });
  it('los retiros se encuentran por negocio y tipo, apartados por la categoría', async () => {
    const otro = await o('mike', '/movimientos', { method: 'POST', json: {
      negocio_id: negocio, tipo: 'egreso', monto: 1_000, fecha: '2026-09-30', cuenta_id: cuenta, contraparte_tipo: 'otro', categoria: 'papeleria',
    } });
    expect(otro.estado).toBe(201);
    const egresos = await o('mike', `/movimientos?negocio_id=${negocio}&tipo=egreso`);
    const retiros = egresos.data.filas.filter((m: any) => m.categoria === CATEGORIA_RETIRO_UTILIDADES);
    expect(retiros.length).toBe(1);
    expect(retiros[0].contraparte_id).toBe(acc);
    expect(retiros[0].monto).toBe(250_000);
  });
});

describe('la lista por negocio y la baja', () => {
  it('cada negocio ve sólo los suyos, y sin negocio_id la API pone el primero del que pregunta', async () => {
    const enOtro = await o('mike', '/accionistas', { method: 'POST', json: { negocio_id: otroNegocio, nombre: 'Socia del otro' } });
    expect(enOtro.estado).toBe(201);
    const uno = await o('mike', `/accionistas?negocio_id=${negocio}`);
    expect(uno.data.filas.map((a: any) => a.nombre)).toEqual(['Mike Balcázar']);
    const dos = await o('mike', `/accionistas?negocio_id=${otroNegocio}`);
    expect(dos.data.filas.map((a: any) => a.nombre)).toEqual(['Socia del otro']);
  });
  it('dar de baja es activo=false y la lista lo filtra; el negocio no se borra con un accionista colgado, y sin él sí', async () => {
    const dos = await o('mike', `/accionistas?negocio_id=${otroNegocio}`);
    const id = dos.data.filas[0].id;
    const baja = await o('mike', `/accionistas/${id}`, { method: 'PATCH', json: { activo: false } });
    expect(baja.estado).toBe(200);
    expect(baja.data.activo).toBe(false);
    expect((await o('mike', `/accionistas?negocio_id=${otroNegocio}&activo=true`)).data.filas.length).toBe(0);
    expect((await o('mike', `/accionistas?negocio_id=${otroNegocio}`)).data.filas.length).toBe(1);
    /* El negocio no se borra mientras algo apunte a él (409 en_uso): primero
     * se quita el accionista, y ya sin nada colgado el negocio se va. */
    const enUso = await o('mike', `/negocios/${otroNegocio}`, { method: 'DELETE' });
    expect(enUso.estado).toBe(409);
    expect(enUso.error).toBe('en_uso');
    const quitado = await o('mike', `/accionistas/${id}`, { method: 'DELETE' });
    expect(quitado.estado, JSON.stringify(quitado)).toBe(200);
    expect((await o('mike', `/accionistas?negocio_id=${otroNegocio}`)).data.filas.length).toBe(0);
    const fuera = await o('mike', `/negocios/${otroNegocio}`, { method: 'DELETE' });
    expect(fuera.estado, JSON.stringify(fuera)).toBe(200);
  });
});

describe('jalar al accionista de roster101 (0.60.0)', () => {
  /* Mike, 1-oct: «en el menú de accionistas, se debe poder jalar al
   * accionista de la base de datos de roster». */
  const correoSocio = 'socio-roster@ejemplo.mx';

  beforeAll(async () => {
    /* Entra por su puerta, con su correo y su código, como en la vida real. */
    const c = await pedir('socio', `/roster/${ORG}/api/codigo`, { method: 'POST', json: { email: correoSocio }, app: 'roster101' });
    expect(c.estado, JSON.stringify(c)).toBe(200);
    const e = await pedir('socio', `/roster/${ORG}/api/entrar`, { method: 'POST', json: { email: correoSocio, codigo: c.codigo_prueba }, app: 'roster101' });
    expect(e.estado, JSON.stringify(e)).toBe(200);
  });

  it('la lista de expedientes llega con id, nombre, rfc, correo y puesto; sin nombre, sale con su correo', async () => {
    const r = await o('mike', '/accionistas/de-roster');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const socio = r.data.personas.find((p: any) => p.correo === correoSocio);
    expect(socio, JSON.stringify(r.data)).toBeTruthy();
    expect(Object.keys(socio).sort()).toEqual(['correo', 'id', 'nombre', 'puesto', 'rfc']);
    expect(socio.nombre).toBe(correoSocio);
  });

  it('y con eso se da de alta como accionista, sin teclearlo', async () => {
    const r = await o('mike', '/accionistas/de-roster');
    const socio = r.data.personas.find((p: any) => p.correo === correoSocio);
    const alta = await o('mike', '/accionistas', { method: 'POST', json: { negocio_id: negocio, nombre: socio.nombre, rfc: socio.rfc || undefined, correo: socio.correo, porcentaje: 10 } });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
    expect(alta.data.correo).toBe(correoSocio);
  });
});

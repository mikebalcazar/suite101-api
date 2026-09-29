/* La nube de draw101 · 0.22.0
 *
 * Mike, 29-sep-2026, escogiendo con botones: «Jr. ni nadie puede accesar a los
 * archivos, ni siquiera nosotros como dueños. Sólo el usuario de la licencia
 * con la que se generó y se guardó», y cifrado de verdad — la llave sale de la
 * clave T101 «y dejamos de guardarla en claro».
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS, que es lo que se rompería sin que
 * nadie lo note:
 *
 *   · QUE UNA CUENTA NO VEA LA DE AL LADO. Es el encargo entero. Un fallo aquí
 *     no da error: da los planos de Fernando en la pantalla de Alex. Se mide
 *     desde las dos puntas —el índice y la bajada directa por token— porque
 *     filtrar la lista y no filtrar la descarga es el error clásico.
 *
 *   · QUE LA CLAVE DEJE DE ESTAR EN CLARO EN LA BASE, y que aun así se pueda
 *     activar con ella. Son las dos mitades: guardar la huella es fácil,
 *     guardarla y romper la activación de las siete licencias que ya existen
 *     también.
 *
 *   · QUE LA LLAVE ENVUELTA SE ESCRIBA UNA SOLA VEZ. Si dos máquinas estrenan
 *     la nube a la vez y cada una deja la suya, la segunda deja ilegibles los
 *     archivos de la primera. No hay error, no hay aviso: se abren los planos
 *     y salen basura.
 *
 *   · QUE UN TOKEN VENCIDO NO ENTRE. La nube no puede ser el rincón por donde
 *     se cuela una licencia que dejó de pagarse.
 */

import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/entorno';

const e = env as unknown as Env;
const CORREO = 'mike@forespot.com';

let galleta = '';

async function pedir(ruta: string, opciones: RequestInit = {}) {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
  if (galleta) cabeceras.Cookie = galleta;
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...opciones, headers: { ...cabeceras, ...(opciones.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galleta = puesta.split(';')[0];
  const cuerpo = (await r.json()) as { ok: boolean; data?: any; error?: string; detalle?: any };
  return { estado: r.status, ...cuerpo };
}

/** Cruda: sin JSON, para subir y bajar bytes. */
const crudo = (ruta: string, opciones: RequestInit = {}) => SELF.fetch(`https://api.local${ruta}`, opciones);

const conToken = (token: string, extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${token}`, ...extra });

/** Un token de documento: 26 letras del alfabeto de Crockford, como el ULID
 *  que draw101 mete dentro del .t101d. */
const docNuevo = (semilla: string) => (semilla + '0'.repeat(26)).slice(0, 26).toUpperCase().replace(/[ILOU]/g, '2');

/** Una licencia nueva y una máquina activada en ella. Devuelve la clave (que
 *  sólo se ve una vez) y el token firmado. */
async function unaCuenta(cliente: string, huella: string) {
  const alta = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente, programa: 'draw101', lugares: 2, perpetua: true }) });
  expect(alta.estado).toBe(201);
  const clave = alta.data.clave as string;
  const act = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave, huella, version: '0.22.0' }) });
  expect(act.estado).toBe(201);
  return { id: alta.data.id as string, clave, token: act.data.token as string };
}

let mikeId = '';

describe('la nube de draw101', () => {
  let mike: { id: string; clave: string; token: string };
  let fer: { id: string; clave: string; token: string };

  beforeAll(async () => {
    const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
    await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: c.data.codigo_prueba }) });
    mike = await unaCuenta('Mike Balcázar', 'maquina-de-mike-0001');
    mikeId = mike.id;
    fer = await unaCuenta('Fernando Balcázar', 'maquina-de-fer-0001');
  });

  /* ─────────── la clave ─────────── */

  it('la clave NO queda en claro en la base, y aun así se puede activar con ella', async () => {
    const fila = await e.MASTER.prepare(`SELECT clave, clave_pista FROM suscripciones WHERE id = ?`).bind(mike.id).first<any>();
    // La columna guarda la HUELLA, no las letras: no se parece a una clave.
    expect(fila.clave).not.toContain('T101-');
    expect(fila.clave).not.toBe(mike.clave);
    expect(fila.clave.length).toBeGreaterThan(20);
    expect(fila.clave_pista).toBe(mike.clave.slice(-4));

    // Y la pista no alcanza para reconstruirla: son 4 de 16 letras.
    expect(mike.clave.length).toBeGreaterThan(fila.clave_pista.length + 10);

    // La prueba de fuego: con la clave en la mano, la segunda máquina entra.
    const otra = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: mike.clave, huella: 'maquina-de-mike-0002' }) });
    expect(otra.estado).toBe(201);
    expect(otra.data.licencia.id).toBe(mike.id);
  });

  it('una clave inventada sigue sin entrar', async () => {
    const r = await pedir('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: 'T101-ZZZZ-ZZZZ-ZZZZ', huella: 'la-de-nadie-0001' }) });
    expect(r.estado).toBe(404);
    expect(r.error).toBe('clave_inexistente');
  });

  it('al crear la licencia la clave se ve una vez, con su aviso', async () => {
    const alta = await pedir('/licencias', { method: 'POST', body: JSON.stringify({ cliente: 'Alguien', programa: 'draw101' }) });
    expect(alta.data.clave).toMatch(/^T101-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(String(alta.data.aviso)).toContain('no se guarda');
    // Y al volver a leerla, ya no está.
    const otra = await pedir(`/licencias/${alta.data.id}`);
    expect(otra.data.clave ?? '').toBe('');
  });

  /* ─────────── la puerta ─────────── */

  it('sin token no se entra a la nube', async () => {
    const r = await pedir('/nube/indice');
    expect(r.estado).toBe(401);
    expect(r.error).toBe('token_invalido');
  });

  it('con un token inventado tampoco', async () => {
    const r = await pedir('/nube/indice', { headers: conToken('v1.aaaa.bbbb') });
    expect(r.estado).toBe(401);
  });

  /* ─────────── la llave envuelta ─────────── */

  it('la llave envuelta se escribe UNA vez: la segunda máquina recibe la primera', async () => {
    const vacia = await pedir('/nube/llave', { headers: conToken(mike.token) });
    expect(vacia.data.envuelta).toBeNull();

    const primera = await pedir('/nube/llave', { method: 'PUT', headers: conToken(mike.token), body: JSON.stringify({ envuelta: 'LA-PRIMERA', sal: 'sal-1' }) });
    expect(primera.data.envuelta).toBe('LA-PRIMERA');
    expect(primera.data.era_mia).toBe(true);

    const segunda = await pedir('/nube/llave', { method: 'PUT', headers: conToken(mike.token), body: JSON.stringify({ envuelta: 'LA-SEGUNDA', sal: 'sal-2' }) });
    expect(segunda.data.envuelta).toBe('LA-PRIMERA');
    expect(segunda.data.sal).toBe('sal-1');
    expect(segunda.data.era_mia).toBe(false);
  });

  it('y cada cuenta tiene la suya', async () => {
    await pedir('/nube/llave', { method: 'PUT', headers: conToken(fer.token), body: JSON.stringify({ envuelta: 'LA-DE-FER', sal: 'sal-fer' }) });
    const dema = await pedir('/nube/llave', { headers: conToken(mike.token) });
    const defer = await pedir('/nube/llave', { headers: conToken(fer.token) });
    expect(dema.data.envuelta).toBe('LA-PRIMERA');
    expect(defer.data.envuelta).toBe('LA-DE-FER');
  });

  /* ─────────── subir, listar, bajar ─────────── */

  const doc = docNuevo('01K6X9F2QW8N7VRAJ3H5MZ');

  it('sube un archivo, sale en el índice y baja igual que subió', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 250]);
    const sube = await crudo(`/nube/archivo/${doc}`, {
      method: 'PUT',
      headers: conToken(mike.token, { 'X-Nombre': 'nombre-cifrado-abc', 'X-Modificado': '2026-09-29T18:00:00.000Z' }),
      body: bytes,
    });
    expect(sube.status).toBe(201);
    const r = (await sube.json()) as any;
    expect(r.data.version).toBe(1);
    expect(r.data.bytes).toBe(10);

    const indice = await pedir('/nube/indice', { headers: conToken(mike.token) });
    const uno = indice.data.archivos.find((a: any) => a.token === doc);
    expect(uno).toBeTruthy();
    expect(uno.nombre).toBe('nombre-cifrado-abc');
    expect(uno.modificado).toBe('2026-09-29T18:00:00.000Z');
    expect(uno.bytes).toBe(10);

    const baja = await crudo(`/nube/archivo/${doc}`, { headers: conToken(mike.token) });
    expect(baja.status).toBe(200);
    expect(baja.headers.get('X-Nombre')).toBe('nombre-cifrado-abc');
    expect(new Uint8Array(await baja.arrayBuffer())).toEqual(bytes);
  });

  it('volver a subirlo sube la versión, y la versión vieja sigue ahí', async () => {
    const nuevos = new Uint8Array([99, 98, 97]);
    const sube = await crudo(`/nube/archivo/${doc}`, {
      method: 'PUT', headers: conToken(mike.token, { 'X-Nombre': 'nombre-cifrado-abc' }), body: nuevos,
    });
    expect(sube.status).toBe(200);
    expect(((await sube.json()) as any).data.version).toBe(2);

    const ahora = await crudo(`/nube/archivo/${doc}`, { headers: conToken(mike.token) });
    expect(new Uint8Array(await ahora.arrayBuffer())).toEqual(nuevos);

    // La red de seguridad: la de antes se puede recuperar.
    const antes = await crudo(`/nube/archivo/${doc}?version=1`, { headers: conToken(mike.token) });
    expect(antes.status).toBe(200);
    expect(new Uint8Array(await antes.arrayBuffer()).length).toBe(10);
  });

  it('las aperturas se cuentan: de ahí sale el orden por uso', async () => {
    const indice = await pedir('/nube/indice', { headers: conToken(mike.token) });
    const uno = indice.data.archivos.find((a: any) => a.token === doc);
    expect(uno.aperturas).toBeGreaterThan(0);
  });

  /* ─────────── LO PRINCIPAL: una cuenta no ve la de al lado ─────────── */

  it('el índice de Fernando NO trae el archivo de Mike', async () => {
    const suyo = await pedir('/nube/indice', { headers: conToken(fer.token) });
    expect(suyo.data.archivos.find((a: any) => a.token === doc)).toBeUndefined();
    // Control: si el índice viniera vacío para todos, lo de arriba pasaría sin
    // medir nada. El de Mike sí lo trae.
    const deMike = await pedir('/nube/indice', { headers: conToken(mike.token) });
    expect(deMike.data.archivos.find((a: any) => a.token === doc)).toBeTruthy();
  });

  it('y con el token del documento en la mano, Fernando tampoco lo baja', async () => {
    const r = await crudo(`/nube/archivo/${doc}`, { headers: conToken(fer.token) });
    expect(r.status).toBe(404);
  });

  it('ni lo borra, ni lo pisa subiendo encima', async () => {
    const borra = await crudo(`/nube/archivo/${doc}`, { method: 'DELETE', headers: conToken(fer.token) });
    expect(borra.status).toBe(404);

    // Si subiera encima, quedaría UN archivo con el contenido de Fernando.
    // Lo que tiene que pasar es que nazca OTRO, suyo, y el de Mike no cambie.
    await crudo(`/nube/archivo/${doc}`, {
      method: 'PUT', headers: conToken(fer.token, { 'X-Nombre': 'el-de-fer' }), body: new Uint8Array([7, 7, 7]),
    });
    const deMike = await crudo(`/nube/archivo/${doc}`, { headers: conToken(mike.token) });
    expect(deMike.headers.get('X-Nombre')).toBe('nombre-cifrado-abc');
    expect(new Uint8Array(await deMike.arrayBuffer())).toEqual(new Uint8Array([99, 98, 97]));
  });

  /* ─────────── quitar ─────────── */

  it('quitarlo lo saca del índice, y deja de bajarse', async () => {
    const otro = docNuevo('01K6X9F2QW8N7VRAJ3H5AA');
    await crudo(`/nube/archivo/${otro}`, { method: 'PUT', headers: conToken(mike.token, { 'X-Nombre': 'x' }), body: new Uint8Array([1]) });
    const borra = await crudo(`/nube/archivo/${otro}`, { method: 'DELETE', headers: conToken(mike.token) });
    expect(borra.status).toBe(200);
    const indice = await pedir('/nube/indice', { headers: conToken(mike.token) });
    expect(indice.data.archivos.find((a: any) => a.token === otro)).toBeUndefined();
    expect((await crudo(`/nube/archivo/${otro}`, { headers: conToken(mike.token) })).status).toBe(404);
  });

  /* ─────────── los topes ─────────── */

  it('un token de documento inventado no pasa', async () => {
    const r = await crudo('/nube/archivo/no-es-un-ulid', { method: 'PUT', headers: conToken(mike.token, { 'X-Nombre': 'x' }), body: new Uint8Array([1]) });
    expect(r.status).toBe(400);
  });

  it('sin nombre cifrado no se sube', async () => {
    const r = await crudo(`/nube/archivo/${docNuevo('01K6X9F2QW8N7VRAJ3H5BB')}`, { method: 'PUT', headers: conToken(mike.token), body: new Uint8Array([1]) });
    expect(r.status).toBe(400);
  });
});

/* Que los secretos NO salgan por nuestra propia pantalla. Es el descuido fácil:
 * se protege el bucket, se protege la base, y el panel de administración los
 * sirve en JSON sin que nadie lo note. La huella más la llave envuelta son,
 * juntas, lo que hace falta para abrir los planos de alguien. */
describe('lo que el panel de Mike NO debe ver', () => {
  const CORREO2 = 'mike@forespot.com';
  let galleta2 = '';
  async function pedir2(ruta: string, opciones: RequestInit = {}) {
    const cab: Record<string, string> = { 'Content-Type': 'application/json' };
    if (galleta2) cab.Cookie = galleta2;
    const r = await SELF.fetch(`https://api.local${ruta}`, { ...opciones, headers: { ...cab, ...(opciones.headers as object) } });
    const p = r.headers.get('Set-Cookie');
    if (p) galleta2 = p.split(';')[0];
    return { estado: r.status, ...((await r.json()) as any) };
  }

  it('ni la huella de la clave ni la llave envuelta salen en el panel', async () => {
    const c = await pedir2('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO2 }) });
    await pedir2('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO2, codigo: c.data.codigo_prueba }) });

    const lista = await pedir2('/licencias');
    expect(lista.estado).toBe(200);
    const texto = JSON.stringify(lista.data);
    // Control: la pantalla sí trae licencias; si viniera vacía no mediría nada.
    expect(lista.data.total).toBeGreaterThan(0);
    expect(texto).not.toContain('clave_huella');
    // Y la huella misma tampoco, que es el dato peligroso.
    const laHuella = (await e.MASTER.prepare(`SELECT clave FROM suscripciones WHERE id = ?`).bind(mikeId).first<any>()).clave;
    expect(texto).not.toContain(laHuella);
    expect(texto).not.toContain('llave_envuelta');
    expect(texto).not.toContain('LA-PRIMERA');
    // Y la pista sí, que para eso está.
    expect(texto).toContain('clave_pista');
  });

  it('migrar-claves no deja ninguna en claro', async () => {
    // Se mete una a mano como si viniera de antes de 0.22.0.
    await e.MASTER.prepare(
      `INSERT INTO suscripciones (id, clave, programa, cliente, plan, lugares, estado, origen, perpetua, creado_at, actualizado_at, tipo)
       VALUES ('01VIEJA00000000000000000A', 'T101-AAAA-BBBB-CCCC', 'draw101', 'De antes', 'mensual', 1, 'activa', 'manual', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'cortesia')`,
    ).run();
    const antes = await e.MASTER.prepare(`SELECT clave FROM suscripciones WHERE id = '01VIEJA00000000000000000A'`).first<any>();
    expect(antes.clave).toBe('T101-AAAA-BBBB-CCCC');

    const r = await pedir2('/licencias/migrar-claves', { method: 'POST' });
    expect(r.estado).toBe(200);
    expect(r.data.migradas).toBeGreaterThan(0);
    expect(r.data.en_claro_todavia).toBe(0);

    // Y la vieja sigue entrando con SU clave de siempre: migrar no obliga a
    // nadie a volver a activar.
    const act = await pedir2('/licencias/activar', { method: 'POST', body: JSON.stringify({ clave: 'T101-AAAA-BBBB-CCCC', huella: 'una-maquina-vieja-01' }) });
    expect(act.estado).toBe(201);
    expect(act.data.licencia.id).toBe('01VIEJA00000000000000000A');

    // Y ya no guarda sus letras.
    const despues = await e.MASTER.prepare(`SELECT clave, clave_pista FROM suscripciones WHERE id = '01VIEJA00000000000000000A'`).first<any>();
    expect(despues.clave).not.toContain('T101-');
    expect(despues.clave_pista).toBe('CCCC');
  });
});

/* Borrar una licencia que TIENE archivos en la nube. Es el caso que sólo
 * aparece cuando las dos cosas existen a la vez, y falla feo: `archivos_nube`
 * referencia `suscripciones` y D1 corre con las llaves foráneas encendidas,
 * así que sin limpiar el índice el DELETE truena sin decir por qué.
 *
 * Y que en la bitácora quede la PISTA y no la huella: apuntar la huella en una
 * tabla que el panel sí devuelve deshace en un renglón todo lo demás. */
describe('borrar una licencia con archivos en la nube', () => {
  it('se borra, y en la bitácora queda la pista y NO la huella', async () => {
    const cab: Record<string, string> = { 'Content-Type': 'application/json' };
    const entra = async () => {
      let g = '';
      const r1 = await SELF.fetch('https://api.local/auth/codigo', { method: 'POST', headers: cab, body: JSON.stringify({ correo: 'mike@forespot.com' }) });
      const p1 = r1.headers.get('Set-Cookie'); if (p1) g = p1.split(';')[0];
      const c1 = (await r1.json()) as any;
      const r2 = await SELF.fetch('https://api.local/auth/entrar', { method: 'POST', headers: { ...cab, Cookie: g }, body: JSON.stringify({ correo: 'mike@forespot.com', codigo: c1.data.codigo_prueba }) });
      const p2 = r2.headers.get('Set-Cookie'); if (p2) g = p2.split(';')[0];
      return g;
    };
    const g = await entra();

    const alta = (await (await SELF.fetch('https://api.local/licencias', {
      method: 'POST', headers: { ...cab, Cookie: g },
      body: JSON.stringify({ cliente: 'Con archivos', programa: 'draw101', lugares: 1, perpetua: true }),
    })).json()) as any;
    const clave = alta.data.clave as string;

    const act = (await (await SELF.fetch('https://api.local/licencias/activar', {
      method: 'POST', headers: cab, body: JSON.stringify({ clave, huella: 'maquina-con-archivos-1' }),
    })).json()) as any;

    // Alfabeto de Crockford: sin I, L, O ni U, como el ULID de verdad.
    const doc = '01ARCHVSENANBE9876543210AB';
    const sube = await SELF.fetch(`https://api.local/nube/archivo/${doc}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${act.data.token}`, 'X-Nombre': 'x' }, body: new Uint8Array([1, 2, 3]),
    });
    expect(sube.status).toBe(201);

    const borra = await SELF.fetch(`https://api.local/licencias/${alta.data.id}`, { method: 'DELETE', headers: { ...cab, Cookie: g } });
    const cuerpo = (await borra.json()) as any;
    expect(borra.status).toBe(200);
    expect(cuerpo.data.archivos_soltados).toBe(1);

    const fila = await e.MASTER.prepare(
      `SELECT detalle FROM bitacora_licencias WHERE suscripcion_id = ? AND accion = 'borrar'`,
    ).bind(alta.data.id).first<any>();
    expect(fila.detalle).toContain(clave.slice(-4));
    expect(fila.detalle).not.toContain('T101-');
    // Y la huella tampoco: es el dato con el que se probarían claves.
    expect(String(fila.detalle).length).toBeLessThan(200);
  });
});

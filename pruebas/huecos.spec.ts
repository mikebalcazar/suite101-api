/* Los tres huecos que quedaron sin medir al cerrar la fase 1
 * (`claude/CONTINUAR.md` §2). No agregan superficie: miden la que ya hay.
 *
 *   R2           las rutas estaban escritas y nadie había subido un archivo.
 *   CORS         solo se había probado con curl, que no aplica la política del
 *                navegador. La primera app que se conecte es la que lo iba a
 *                descubrir, y sería tarde.
 *   concurrencia la decisión 2 del documento dice que un solo hilo por empresa
 *                encola las escrituras y nadie pisa a nadie. Estaba afirmado,
 *                no medido.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const ORG = 'huecos';
const CORREO = 'mike@forespot.com';
let galleta = '';

async function pedir(ruta: string, opciones: RequestInit & { app?: string } = {}) {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opciones.app) cabeceras['X-App'] = opciones.app;
  if (galleta) cabeceras.Cookie = galleta;
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...opciones, headers: { ...cabeceras, ...(opciones.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galleta = puesta.split(';')[0];
  const cuerpo = (await r.json()) as { ok: boolean; data?: any; error?: string; detalle?: any };
  return { estado: r.status, ...cuerpo };
}

const ids: Record<string, string> = {};

beforeAll(async () => {
  const c = await pedir('/auth/codigo', { method: 'POST', body: JSON.stringify({ correo: CORREO }) });
  await pedir('/auth/entrar', { method: 'POST', body: JSON.stringify({ correo: CORREO, codigo: c.data.codigo_prueba }) });
  await pedir('/admin/orgs', { method: 'POST', body: JSON.stringify({ id: ORG, nombre: 'Huecos' }) });

  const n = await pedir(`/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Taller' }) });
  ids.negocio = n.data.id;
  const cl = await pedir(`/orgs/${ORG}/clientes`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Cliente', negocio_id: ids.negocio }) });
  ids.cliente = cl.data.id;
  const cu = await pedir(`/orgs/${ORG}/cuentas`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Banco', tipo: 'banco', negocio_id: ids.negocio, saldo_inicial: 0 }) });
  ids.cuenta = cu.data.id;
  const it = await pedir(`/orgs/${ORG}/items`, { app: 'dash101', method: 'POST', body: JSON.stringify({ nombre: 'Cocina', negocio_id: ids.negocio, cliente_id: ids.cliente, monto: 10000000, estado: 'cotizado' }) });
  ids.item = it.data.id;
  const v = await pedir(`/orgs/${ORG}/items/vender`, { app: 'dash101', method: 'POST', body: JSON.stringify({ item_ids: [ids.item], nombre_proyecto: 'Obra' }) });
  ids.proyecto = v.data.proyecto.id;
});

describe('R2: un archivo sube y baja igual', () => {
  it('se sube por multipart y vuelve byte por byte', async () => {
    const contenido = 'plano de la cocina — línea con acentos y ñ\n'.repeat(40);
    const forma = new FormData();
    forma.append('archivo', new File([contenido], 'plano.txt', { type: 'text/plain' }));
    forma.append('de_tabla', 'items');
    forma.append('de_id', ids.item);

    const subida = await SELF.fetch(`https://api.local/orgs/${ORG}/archivos`, {
      method: 'POST',
      headers: { Cookie: galleta, 'X-App': 'nest101' },
      body: forma,
    });
    expect(subida.status).toBe(201);
    const alta = (await subida.json()) as any;
    expect(alta.data.bytes).toBe(new TextEncoder().encode(contenido).length);
    // La llave lleva la org por delante: los archivos de dos empresas no se
    // pueden mezclar aunque el id se repita.
    expect(alta.data.r2_key).toMatch(new RegExp(`^orgs/${ORG}/items/${ids.item}/`));

    const baja = await SELF.fetch(`https://api.local/orgs/${ORG}/archivos/${alta.data.id}`, {
      headers: { Cookie: galleta, 'X-App': 'nest101' },
    });
    expect(baja.status).toBe(200);
    expect(baja.headers.get('Content-Type')).toBe('text/plain');
    expect(await baja.text()).toBe(contenido);
  });

  it('sin sesión no se baja', async () => {
    const l = await pedir(`/orgs/${ORG}/archivos?de_id=${ids.item}`, { app: 'nest101' });
    const r = await SELF.fetch(`https://api.local/orgs/${ORG}/archivos/${l.data.filas[0].id}`, { headers: { 'X-App': 'nest101' } });
    expect(r.status).toBe(401);
  });

  it('un archivo que no existe da 404, no una respuesta vacía', async () => {
    const r = await pedir(`/orgs/${ORG}/archivos/no-existe`, { app: 'nest101' });
    expect(r.estado).toBe(404);
    expect(r.error).toBe('no_encontrado');
  });
});

describe('CORS: lo que va a ver el navegador', () => {
  const ORIGEN = 'https://conta-master.netlify.app';

  it('el preflight de un origen conocido contesta con el origen exacto', async () => {
    const r = await SELF.fetch(`https://api.local/orgs/${ORG}/items`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGEN, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'X-App,Content-Type' },
    });
    expect(r.status).toBe(204);
    // Con credenciales no se puede contestar `*`: el navegador tira la
    // respuesta. Tiene que venir el origen exacto.
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN);
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(r.headers.get('Access-Control-Allow-Headers')).toContain('X-App');
    expect(r.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    expect(r.headers.get('Vary')).toBe('Origin');
  });

  it('una respuesta normal también trae el permiso', async () => {
    const r = await SELF.fetch('https://api.local/salud', { headers: { Origin: ORIGEN } });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN);
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('un origen que no está en la lista no recibe permiso', async () => {
    const r = await SELF.fetch('https://api.local/salud', { headers: { Origin: 'https://sitio-de-nadie.example' } });
    // La petición se contesta —eso lo decide el navegador, no el servidor—,
    // pero sin la cabecera el navegador no deja leerla.
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(null);
  });
});

describe('un solo hilo por empresa: dos escrituras al mismo tiempo', () => {
  it('diez ingresos en paralelo suman exactamente, sin perder ninguno', async () => {
    const cuantos = 10;
    const cada = 300000; // $3,000.00
    const peticiones = Array.from({ length: cuantos }, (_, i) =>
      pedir(`/orgs/${ORG}/movimientos`, {
        app: 'dash101',
        method: 'POST',
        body: JSON.stringify({
          negocio_id: ids.negocio, tipo: 'ingreso', monto: cada, fecha: '2026-09-09',
          cuenta_id: ids.cuenta, proyecto_id: ids.proyecto, contraparte_tipo: 'cliente',
          contraparte_id: ids.cliente, descripcion: `pago ${i + 1}`,
        }),
      }),
    );
    const hechos = await Promise.all(peticiones);
    expect(hechos.every((h) => h.estado === 201)).toBe(true);

    // Diez ids distintos: el ULID no colisiona aunque caigan en el mismo
    // milisegundo.
    expect(new Set(hechos.map((h) => h.data.id)).size).toBe(cuantos);

    const filas = await pedir(`/orgs/${ORG}/movimientos?proyecto_id=${ids.proyecto}`, { app: 'dash101' });
    expect(filas.data.total).toBe(cuantos);

    // Y el caché quedó bien. Esto es lo que en conta-master había que resolver
    // con transacciones y aun así podía perder una carrera.
    const p = await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' });
    expect(p.data.cobrado).toBe(cuantos * cada);
  });

  it('borrar un movimiento devuelve el caché a su sitio', async () => {
    const filas = await pedir(`/orgs/${ORG}/movimientos?proyecto_id=${ids.proyecto}`, { app: 'dash101' });
    const antes = (await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' })).data.cobrado;
    const uno = filas.data.filas[0];
    const r = await pedir(`/orgs/${ORG}/movimientos/${uno.id}`, { app: 'dash101', method: 'DELETE' });
    expect(r.estado).toBe(200);
    const despues = (await pedir(`/orgs/${ORG}/proyectos/${ids.proyecto}`, { app: 'dash101' })).data.cobrado;
    expect(despues).toBe(antes - uno.monto);
  });
});

describe('salir mata la sesión de verdad', () => {
  it('después de /auth/salir la misma cookie ya no sirve', async () => {
    const viva = await pedir('/yo');
    expect(viva.estado).toBe(200);
    const cerrada = galleta;
    await pedir('/auth/salir', { method: 'POST' });
    galleta = cerrada; // se vuelve a mandar la de antes, como haría un ladrón
    const muerta = await pedir('/yo');
    expect(muerta.estado).toBe(401);
    galleta = '';
  });
});

/* /nube/* — los archivos de draw101 en la nube.
 *
 * Quién entra: la app, con el token de licencia que ya trae (el Ed25519 que
 * firma /licencias/activar). No hay sesión ni cookie: draw101 es un programa
 * instalado, no una pestaña. El token dice de qué suscripción es y de qué
 * máquina, y eso basta —y es lo único que hace falta— para saber qué archivos
 * son suyos.
 *
 * QUÉ GUARDA Y QUÉ NO SABE: todo lo que llega ya viene cifrado de la máquina
 * del dueño —el contenido y también el nombre—, así que estas rutas mueven
 * bultos sin poder leerlos. La llave con la que se cifraron sí la tiene este
 * servidor, y se la entrega a la app de esa cuenta cuando la pide: es lo que
 * Mike escogió el 29-sep («que el servidor pueda — nadie pierde nada nunca»),
 * y en src/nube.ts está dicho qué se gana y qué se deja de ganar con eso.
 */

import { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import { ahora, ulid } from '../lib';
import { abrirToken } from '../licencias';
import type { TokenLicencia } from '../../schema/tipos';
import { TOPE_BYTES, VERSIONES_GUARDADAS, asegurarClaves, llaveDeLaCuenta, paraLaApp, rutaEnR2, tokenValido, type ArchivoNube } from '../nube';

const rutas = new Hono<{ Bindings: Env; Variables: Vars }>();

/* ─────────────── la puerta ─────────────── */

/** El token va en `Authorization: Bearer <token>`. Se comprueba la firma Y la
 *  fecha: un token vencido es de una licencia que dejó de pagarse, y la nube
 *  no es un rincón por el que colarse cuando la app ya no abre. */
rutas.use('/*', async (c, next) => {
  await asegurarClaves(c.env);
  const cab = c.req.header('Authorization') ?? '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
  const carga = await abrirToken(c.env, token);
  if (!carga) return err(c, 'token_invalido', 401);
  if (carga.hasta && carga.hasta < ahora()) return err(c, 'token_vencido', 401, { hasta: carga.hasta });
  if (carga.programa !== 'draw101') return err(c, 'programa_sin_nube', 403, { programa: carga.programa });
  c.set('carga', carga);
  await next();
});

/** De qué cuenta es quien llama. La puerta de arriba ya dejó la carga, así
 *  que aquí siempre está. */
const laCuenta = (c: Ctx): string => c.get('carga')!.licencia;
const laMaquina = (c: Ctx): string => c.get('carga')!.maquina;

/* ─────────────── la llave de la cuenta ─────────────── */

/* La llave con la que draw101 cifra y descifra SUS archivos. La genera y la
 * guarda este servidor (Mike, 29-sep-2026, confirmándolo a propósito: «que el
 * servidor pueda — nadie pierde nada nunca»), así que nadie teclea nada de más
 * y perder una clave ya no cuesta los planos.
 *
 * Viaja en claro por TLS a una app que ya probó ser de esa cuenta con su token
 * firmado. Lo que no viaja nunca es la de OTRA cuenta: la suscripción sale del
 * token, no de nada que mande quien llama.
 *
 * Nace la primera vez que se pide y no cambia nunca. Si cambiara, los archivos
 * subidos con la anterior quedarían ilegibles sin error y sin aviso: se
 * abrirían y saldrían basura. */
rutas.get('/llave', async (c) => {
  const llave = await llaveDeLaCuenta(c.env, laCuenta(c));
  if (!llave) return err(c, 'licencia_desconocida', 404);
  return ok(c, { llave });
});

/* ─────────────── el índice ─────────────── */

/** La lista entera, que es lo que draw101 baja al arrancar. Sólo la lista:
 *  los archivos se quedan aquí hasta que alguien abra uno. */
rutas.get('/indice', async (c) => {
  const r = await c.env.MASTER.prepare(
    `SELECT * FROM archivos_nube WHERE suscripcion_id = ? AND borrado = 0 ORDER BY modificado_at DESC`,
  ).bind(laCuenta(c)).all<ArchivoNube>();
  return ok(c, { archivos: r.results.map(paraLaApp), al: ahora() });
});

/* ─────────────── subir y bajar ─────────────── */

/** Subir. El cuerpo es el bulto YA CIFRADO; el nombre —también cifrado— y las
 *  fechas van en cabeceras, porque el cuerpo son bytes y no JSON. */
rutas.put('/archivo/:token', async (c) => {
  const doc = c.req.param('token')!;
  if (!tokenValido(doc)) return err(c, 'token_invalido', 400, { motivo: 'no es un token de documento' });

  const nombre = c.req.header('X-Nombre') ?? '';
  if (!nombre || nombre.length > 4096) return err(c, 'datos_invalidos', 400, { falta: 'X-Nombre (cifrado)' });
  const modificado = c.req.header('X-Modificado') || ahora();

  const cuerpo = await c.req.arrayBuffer();
  if (cuerpo.byteLength === 0) return err(c, 'datos_invalidos', 400, { motivo: 'vacío' });
  if (cuerpo.byteLength > TOPE_BYTES) return err(c, 'muy_grande', 413, { tope: TOPE_BYTES, trae: cuerpo.byteLength });

  const cuenta = laCuenta(c);
  const ya = await c.env.MASTER.prepare(`SELECT * FROM archivos_nube WHERE suscripcion_id = ? AND id = ?`)
    .bind(cuenta, doc).first<ArchivoNube>();
  const version = (ya?.version ?? 0) + 1;
  const t = ahora();

  // Primero R2 y luego el índice: si se cae en medio, queda un bulto huérfano
  // —que no le estorba a nadie— y no un renglón que promete un archivo que no
  // está. Al revés, la app bajaría un 404 creyendo que hay algo.
  await c.env.ARCHIVOS.put(rutaEnR2(cuenta, doc, version), cuerpo);

  if (ya) {
    await c.env.MASTER.prepare(
      `UPDATE archivos_nube SET nombre_cifrado = ?, bytes = ?, version = ?, modificado_at = ?, subido_at = ?, equipo = ?, borrado = 0
       WHERE suscripcion_id = ? AND id = ?`,
    ).bind(nombre, cuerpo.byteLength, version, modificado, t, laMaquina(c), cuenta, doc).run();
  } else {
    await c.env.MASTER.prepare(
      `INSERT INTO archivos_nube (suscripcion_id, id, nombre_cifrado, bytes, version, creado_at, modificado_at, subido_at, equipo)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(cuenta, doc, nombre, cuerpo.byteLength, version, t, modificado, t, laMaquina(c)).run();
  }

  // Las viejas de más. Se borran después de escribir el índice: si falla, lo
  // único que pasa es que sobra un bulto.
  const vieja = version - VERSIONES_GUARDADAS;
  if (vieja > 0) await c.env.ARCHIVOS.delete(rutaEnR2(cuenta, doc, vieja)).catch(() => undefined);

  return ok(c, { token: doc, version, bytes: cuerpo.byteLength, subido: t }, ya ? 200 : 201);
});

/** Bajar. Devuelve los bytes cifrados tal cual llegaron. */
rutas.get('/archivo/:token', async (c) => {
  const doc = c.req.param('token')!;
  if (!tokenValido(doc)) return err(c, 'token_invalido', 400);
  const cuenta = laCuenta(c);
  const a = await c.env.MASTER.prepare(`SELECT * FROM archivos_nube WHERE suscripcion_id = ? AND id = ? AND borrado = 0`)
    .bind(cuenta, doc).first<ArchivoNube>();
  if (!a) return err(c, 'no_encontrado', 404);

  const pedida = Number(c.req.query('version') ?? a.version);
  const version = Number.isFinite(pedida) && pedida > 0 && pedida <= a.version ? Math.floor(pedida) : a.version;
  const obj = await c.env.ARCHIVOS.get(rutaEnR2(cuenta, doc, version));
  if (!obj) return err(c, 'no_encontrado', 404, { motivo: 'el índice lo tiene pero el bulto no está' });

  // Se apunta que se abrió: es de donde sale el orden por «frecuencia de uso»
  // que pidió Mike. Es un contador, no un registro de qué hizo quién.
  await c.env.MASTER.prepare(`UPDATE archivos_nube SET aperturas = aperturas + 1, abierto_at = ? WHERE suscripcion_id = ? AND id = ?`)
    .bind(ahora(), cuenta, doc).run();

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Nombre': a.nombre_cifrado,
      'X-Version': String(version),
      'X-Modificado': a.modificado_at,
    },
  });
});

/** Quitar de la nube. Se marca y no se borra: el bulto sigue ahí por si fue un
 *  error, y deja de salir en el índice. Borrarlo de verdad es otra decisión,
 *  y no una que deba tomar un clic. */
rutas.delete('/archivo/:token', async (c) => {
  const doc = c.req.param('token')!;
  if (!tokenValido(doc)) return err(c, 'token_invalido', 400);
  const r = await c.env.MASTER.prepare(`UPDATE archivos_nube SET borrado = 1 WHERE suscripcion_id = ? AND id = ? AND borrado = 0`)
    .bind(laCuenta(c), doc).run();
  if (!r.meta.changes) return err(c, 'no_encontrado', 404);
  return ok(c, { token: doc, borrado: true });
});

export default rutas;
export { ulid as tokenNuevo };

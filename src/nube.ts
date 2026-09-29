/* draw101 en la nube — lo que el servidor puede hacer, que es a propósito poco.
 *
 * Mike, 29-sep-2026: «Jr. ni nadie puede accesar a los archivos, ni siquiera
 * nosotros como dueños. Sólo el usuario de la licencia con la que se generó y
 * se guardó», y escogió cifrado de verdad y no sólo control de acceso.
 *
 * DE AHÍ SALE TODO EL DISEÑO, y conviene decir en voz alta lo que el servidor
 * NO sabe, porque es el punto:
 *
 *   · no sabe cómo se llama un archivo (el nombre viaja cifrado);
 *   · no sabe qué hay dentro (el contenido también);
 *   · no puede averiguarlo, porque la llave nace en la máquina del dueño y lo
 *     que se guarda aquí es esa llave YA CIFRADA con lo que sale de su clave
 *     T101.
 *
 * Lo único que sabe: que la cuenta X tiene N archivos, de tanto peso, tocados
 * tal día. Eso hace falta para decidir cuál copia es más nueva sin bajarla.
 *
 * DONDE SÍ PASA LA CLAVE EN CLARO: por `/licencias/activar`, un momento, para
 * poder buscarla. No se guarda —se guarda su huella— pero tampoco hay que
 * prometer más de lo que hay: quien controlara este Worker podría apuntarla al
 * vuelo. Lo que este diseño sí garantiza es que un volcado de la base, del
 * bucket, o los dos juntos, no abren un solo plano.
 */

import type { Env } from './entorno';
import { b64url, deB64url } from './lib';

/* ─────────────── la huella de la clave ─────────────── */

/** El secreto del HMAC. Vive en `config`, no en la tabla de suscripciones: un
 *  volcado de `suscripciones` no alcanza para probar claves a fuerza bruta,
 *  que es justo lo que se quiere evitar (doce letras de 32 son ~60 bits, y un
 *  SHA-256 pelón se recorrería entero). Nace solo al primer uso, como la
 *  llave de firma de las licencias. */
const SECRETO_CONFIG = 'nube_huella_secreto';
let cacheSecreto: string | null = null;

async function secretoDeHuella(env: Env): Promise<string> {
  if (cacheSecreto) return cacheSecreto;
  const fila = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = ?`).bind(SECRETO_CONFIG).first<{ valor: string }>();
  if (fila?.valor) {
    cacheSecreto = fila.valor;
    return cacheSecreto;
  }
  const nuevo = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.MASTER.prepare(`INSERT OR IGNORE INTO config (llave, valor) VALUES (?, ?)`).bind(SECRETO_CONFIG, nuevo).run();
  // Dos Workers a la vez podrían generar dos: gana el primero y el segundo
  // vuelve a leer. Si no, media base quedaría con huellas de otro secreto.
  const puesto = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = ?`).bind(SECRETO_CONFIG).first<{ valor: string }>();
  cacheSecreto = puesto!.valor;
  return cacheSecreto;
}

/** La huella de una clave T101, determinista: la misma clave da la misma
 *  huella siempre, y por eso se puede buscar por índice. */
export async function huellaDeClave(env: Env, clave: string): Promise<string> {
  const secreto = await secretoDeHuella(env);
  const llave = await crypto.subtle.importKey('raw', deB64url(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(clave));
  return b64url(firma);
}

/** Las últimas cuatro letras, que es lo que master101 enseña para distinguir
 *  una licencia de otra. Cuatro de doce no sirven para adivinar el resto. */
export const pistaDeClave = (clave: string): string => clave.slice(-4);

/* Las claves que quedaron en claro, a huella, SIN QUE NADIE LO PIDA.
 *
 * La primera versión de esto era una ruta que Mike llamaba una vez tras el
 * despliegue. Se cambió por dos razones, y la segunda es la que importa:
 *
 *   · quien escribió el código no alcanza la API desde su sesión —el proxy
 *     rechaza *.workers.dev y api.taller101.com—, así que no podía llamarla ni
 *     comprobar que hubiera corrido;
 *   · y una migración que depende de que alguien se acuerde de apretar un
 *     botón no es una migración: es una nota en un cuaderno. El día que se
 *     olvide, las claves siguen en claro y nadie se entera, porque todo
 *     funciona igual.
 *
 * Así que corre sola, una vez por isolate, la primera vez que alguien toca
 * `/licencias/*` o `/nube/*`. Es baratísima: una consulta que normalmente
 * devuelve cero filas. Y es idempotente por construcción —una huella no tiene
 * la forma `T101-…`, así que no se puede volver a migrar—.
 *
 * Lo que NO alcanza y conviene decirlo: las copias de seguridad de D1 (el
 * «Time Travel» de Cloudflare guarda 30 días). Durante ese mes las claves
 * viejas siguen siendo recuperables desde ahí, y después no.
 */
let yaRevisadas = false;

export async function asegurarClaves(env: Env): Promise<number> {
  if (yaRevisadas) return 0;
  yaRevisadas = true;   // se marca ANTES: si falla, no se reintenta en bucle
  try {
    const filas = (await env.MASTER.prepare(
      `SELECT id, clave FROM suscripciones WHERE clave LIKE 'T101-%'`,
    ).all<{ id: string; clave: string }>()).results;
    let hechas = 0;
    for (const f of filas) {
      const clave = String(f.clave).trim().toUpperCase();
      if (!/^T101-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(clave)) continue;
      await env.MASTER.prepare(`UPDATE suscripciones SET clave = ?, clave_pista = ? WHERE id = ?`)
        .bind(await huellaDeClave(env, clave), pistaDeClave(clave), f.id).run();
      hechas++;
    }
    return hechas;
  } catch (e) {
    // Que no tumbe la petición: si esto falla, el puente de `porClave` sigue
    // encontrando las claves por sus letras y nadie se queda fuera.
    yaRevisadas = false;
    console.warn('no se pudieron migrar las claves:', (e as Error).message);
    return 0;
  }
}

/** Sólo para las pruebas: vuelve a armar el disparador de una sola vez. */
export const olvidarQueYaSeRevisaron = (): void => { yaRevisadas = false; };

/* ─────────────── los archivos ─────────────── */

/** Dónde vive un archivo en R2. La versión va en la ruta, no encima de la
 *  anterior: así una subida a medias nunca pisa la copia buena, y se pueden
 *  guardar las últimas N. */
export const rutaEnR2 = (suscripcion: string, doc: string, version: number): string =>
  `draw101/${suscripcion}/${doc}/${version}.bin`;

/** Un token de documento válido: el ULID que draw101 mete dentro del .t101d. */
export const TOKEN_FORMA = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const tokenValido = (v: unknown): v is string => typeof v === 'string' && TOKEN_FORMA.test(v);

/** Cuánto puede pesar un plano. Un .t101d grande del taller anda en cientos de
 *  KB; 64 MB es techo de sobra y a la vez un tope de verdad, para que una app
 *  con un error no llene el bucket. */
export const TOPE_BYTES = 64 * 1024 * 1024;

/** Cuántas versiones se guardan de cada archivo. Es la red de seguridad para
 *  el día que alguien guarde encima de algo bueno; en R2 cuesta centavos. */
export const VERSIONES_GUARDADAS = 10;

export interface ArchivoNube {
  suscripcion_id: string;
  id: string;
  nombre_cifrado: string;
  bytes: number;
  version: number;
  creado_at: string;
  modificado_at: string;
  subido_at: string;
  equipo: string | null;
  aperturas: number;
  abierto_at: string | null;
  borrado: 0 | 1;
}

/** Lo que se le manda a la app por cada archivo. Es el índice entero: todo lo
 *  que hace falta para buscar, ordenar y decidir qué bajar. */
export const paraLaApp = (a: ArchivoNube) => ({
  token: a.id,
  nombre: a.nombre_cifrado,
  bytes: a.bytes,
  version: a.version,
  creado: a.creado_at,
  modificado: a.modificado_at,
  subido: a.subido_at,
  equipo: a.equipo,
  aperturas: a.aperturas,
  abierto: a.abierto_at,
});

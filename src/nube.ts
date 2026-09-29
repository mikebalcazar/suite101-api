/* draw101 en la nube — lo que el servidor puede hacer, que es a propósito poco.
 *
 * Mike, 29-sep-2026: «Jr. ni nadie puede accesar a los archivos (...) Sólo el
 * usuario de la licencia con la que se generó y se guardó». Eso se cumple:
 * cada cuenta ve lo suyo y nada más, medido desde las dos puntas.
 *
 * SOBRE LA LLAVE, Mike cambió de parecer el mismo día y lo confirmó a
 * propósito, después de que se le dijera que deshacía su decisión anterior:
 * «que el servidor pueda — nadie pierde nada nunca». Primero había escogido
 * cifrado sin llave maestra; al toparse con que las máquinas que entran con
 * cuenta nunca teclean la clave T101, prefirió que la llave la dé el servidor.
 *
 * ASÍ QUE ESTO ES LO QUE HAY, dicho sin adornos: **quien controle este Worker
 * puede abrir los archivos de cualquiera.** No es el diseño de «ni siquiera
 * nosotros»; es el otro, el de «nadie ve lo ajeno, pero el dueño del taller
 * puede recuperar». A cambio, nadie se queda sin sus planos por perder una
 * clave.
 *
 * LO QUE SÍ SE GANA, y por eso se cifra igual:
 *
 *   · el servidor no sabe cómo se llama un archivo (el nombre viaja cifrado);
 *   · no sabe qué hay dentro (el contenido también);
 *   · un volcado del bucket R2 no abre un solo plano, porque la llave no está
 *     ahí;
 *   · y un volcado de D1 tampoco, porque la llave se guarda ENVUELTA con un
 *     secreto que vive en `config`. Hacen falta las dos cosas, y saber cómo
 *     se juntan.
 *
 * Lo único que el servidor sí sabe en claro: que la cuenta X tiene N archivos,
 * de tanto peso, tocados tal día. Eso hace falta para decidir cuál copia es
 * más nueva sin bajarla, que es justo lo que no se quiere hacer.
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

/* ─────────────── la llave de la cuenta ─────────────── */

/* La llave la genera y la guarda ESTE servidor, y draw101 se la pide (por qué,
 * y qué se gana y qué no, está arriba en la cabecera del archivo).
 *
 * Lo que sigue es la mecánica: se guarda ENVUELTA con un secreto que vive en
 * `config`, no en `suscripciones`. Así un volcado de la tabla no alcanza, y la
 * columna se llama `llave_envuelta` porque de verdad lo está. Lo que cambió
 * respecto del plan original no es eso, sino QUIÉN tiene con qué desenvolverla:
 * antes la clave T101 del dueño, ahora el Worker. */

const LLAVE_CONFIG = 'nube_llave_secreto';
let cacheLlaveSecreto: CryptoKey | null = null;

async function secretoQueEnvuelve(env: Env): Promise<CryptoKey> {
  if (cacheLlaveSecreto) return cacheLlaveSecreto;
  let fila = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = ?`).bind(LLAVE_CONFIG).first<{ valor: string }>();
  if (!fila?.valor) {
    await env.MASTER.prepare(`INSERT OR IGNORE INTO config (llave, valor) VALUES (?, ?)`)
      .bind(LLAVE_CONFIG, b64url(crypto.getRandomValues(new Uint8Array(32)))).run();
    fila = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = ?`).bind(LLAVE_CONFIG).first<{ valor: string }>();
  }
  cacheLlaveSecreto = await crypto.subtle.importKey('raw', deB64url(fila!.valor), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return cacheLlaveSecreto;
}

/** La llave de esta cuenta, en claro, para dársela a su propia app.
 *
 *  Nace la primera vez que alguien la pide y NO cambia nunca: si cambiara, los
 *  archivos subidos con la anterior quedarían ilegibles —sin error y sin
 *  aviso, se abrirían y saldrían basura—. Por eso el INSERT va con la
 *  condición en el WHERE y después se vuelve a leer: dos máquinas pidiéndola
 *  al mismo tiempo tienen que recibir la MISMA. */
export async function llaveDeLaCuenta(env: Env, suscripcion: string): Promise<string | null> {
  const secreto = await secretoQueEnvuelve(env);

  const leer = () => env.MASTER.prepare(`SELECT llave_envuelta, llave_sal FROM suscripciones WHERE id = ?`)
    .bind(suscripcion).first<{ llave_envuelta: string | null; llave_sal: string | null }>();

  let fila = await leer();
  if (!fila) return null;                       // no existe esa suscripción

  if (!fila.llave_envuelta || !fila.llave_sal) {
    const cruda = crypto.getRandomValues(new Uint8Array(32));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const envuelta = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, secreto, cruda);
    await env.MASTER.prepare(
      `UPDATE suscripciones SET llave_envuelta = ?, llave_sal = ? WHERE id = ? AND llave_envuelta IS NULL`,
    ).bind(b64url(envuelta), b64url(nonce), suscripcion).run();
    fila = await leer();                        // gana quien haya llegado primero
    if (!fila?.llave_envuelta || !fila.llave_sal) return null;
  }

  const cruda = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deB64url(fila.llave_sal) }, secreto, deB64url(fila.llave_envuelta));
  return b64url(cruda);
}

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

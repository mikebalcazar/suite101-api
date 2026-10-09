/* bill101 fase D — la FIEL (e.firma) de la empresa. Contrato 0.87.0.
 *
 * Mike, 8-oct-2026, con botones: las facturas recibidas y emitidas se bajan
 * del SAT directo, con la FIEL; y la FIEL vive «guardada cifrada»: se sube
 * una vez y bill101 baja solo cada noche.
 *
 * QUÉ ES. Dos archivos y una contraseña: el certificado (.cer, público: dice
 * de quién es y hasta cuándo vale) y la llave privada (.key, cifrada con la
 * contraseña). Quien tiene la llave abierta firma ante el SAT a nombre de la
 * empresa. Por eso aquí:
 *
 *   · la CONTRASEÑA no se guarda nunca: se usa una vez, al subir, para abrir
 *     la llave, y se suelta;
 *   · la LLAVE ABIERTA no se guarda tal cual: se vuelve a cifrar (AES-GCM)
 *     con una llave que se deriva de un secreto del Worker y del id de la
 *     empresa. Lo cifrado vive en la base de la empresa (su Durable Object);
 *     el secreto vive en otro lado (variable `LLAVE_FIEL` o, si no está, la
 *     tabla `config` del D1 «master», donde nace solo, igual que la firma de
 *     las cookies). Un volcado de la base de la empresa no alcanza para
 *     firmar; uno del master tampoco;
 *   · nada de esto sale por ninguna ruta: `sat_fiel` es tabla interna y las
 *     rutas sólo dicen de quién es la FIEL y cuándo vence;
 *   · NO se acepta un sello (CSD): ése es para timbrar, no para bajar, y
 *     confundirlos es el error de siempre.
 *
 * LO QUE NO PROTEGE, dicho: quien tome la cuenta de Cloudflare entera tiene
 * las dos mitades. Mike lo escogió sabiéndolo (la opción «contraseña cada
 * vez» lo evitaba, a cambio de no bajar solo).
 *
 * Abrir la llave usa `node:crypto` (el .key del SAT viene en PKCS#8 cifrado
 * con 3DES, que WebCrypto no trae); firmar y cifrar, WebCrypto.
 */

import { Buffer } from 'node:buffer';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import type { Env } from './entorno';

export type FallaFiel = { error: string; detalle?: Record<string, unknown> };
export const esFallaFiel = (r: unknown): r is FallaFiel => !!r && typeof r === 'object' && typeof (r as { error?: unknown }).error === 'string';

/** Lo que se sabe de una FIEL sin tener su llave: sale por las rutas. */
export interface DatosFiel {
  rfc: string;
  nombre: string | null;
  /** El número de serie como lo imprime el SAT (20 dígitos). */
  serie: string;
  /** El mismo número, en decimal: así lo pide la firma XML. */
  serie_decimal: string;
  /** Quién la emitió, en una línea: así lo pide la firma XML. */
  emisor: string;
  vale_desde: string;
  vence: string;
  /** El certificado, en base64 (DER). Es público. */
  cer_b64: string;
}

export interface FielAbierta extends DatosFiel { pkcs8: Uint8Array }

const TOPE_ARCHIVO = 16 * 1024;

const b64 = (b: ArrayBuffer | Uint8Array): string => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64');
const deB64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

function campos(nombre: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const linea of nombre.split('\n')) {
    const i = linea.indexOf('=');
    if (i > 0 && !m.has(linea.slice(0, i))) m.set(linea.slice(0, i), linea.slice(i + 1));
  }
  return m;
}

/** Lee el certificado. Sin llave ni contraseña: lo que dice es público. */
export function leerCertificado(cer: Uint8Array, hoy: Date = new Date()): DatosFiel | FallaFiel {
  if (!cer.length || cer.length > TOPE_ARCHIVO) return { error: 'fiel_cer_ilegible', detalle: { motivo: 'el archivo .cer está vacío o es demasiado grande' } };
  let c: X509Certificate;
  try {
    c = new X509Certificate(Buffer.from(cer));
  } catch {
    return { error: 'fiel_cer_ilegible', detalle: { motivo: 'el archivo .cer no es un certificado' } };
  }
  const sujeto = campos(c.subject);
  const rfc = (sujeto.get('x500UniqueIdentifier') ?? '').split('/')[0].trim().toUpperCase();
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) return { error: 'fiel_cer_sin_rfc', detalle: { motivo: 'el certificado no trae un RFC: no es del SAT' } };
  // Un sello (CSD) trae el nombre de la sucursal en «OU»; la FIEL no.
  if (sujeto.has('OU')) return { error: 'fiel_es_sello', detalle: { motivo: 'este certificado es un SELLO (CSD), el de timbrar. Para bajar del SAT hace falta la FIEL (e.firma)', rfc } };
  const desde = new Date(c.validFrom), hasta = new Date(c.validTo);
  if (!(hasta.getTime() > 0) || !(desde.getTime() > 0)) return { error: 'fiel_cer_ilegible', detalle: { motivo: 'el certificado no dice hasta cuándo vale' } };
  if (hasta.getTime() <= hoy.getTime()) return { error: 'fiel_vencida', detalle: { motivo: 'esta FIEL ya venció; se renueva en el SAT', vencio: hasta.toISOString(), rfc } };
  if (desde.getTime() > hoy.getTime() + 86_400_000) return { error: 'fiel_aun_no_vale', detalle: { vale_desde: desde.toISOString(), rfc } };
  const hex = c.serialNumber;
  let serie = '';
  for (let i = 0; i + 1 < hex.length; i += 2) serie += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  if (!/^\d+$/.test(serie)) serie = hex;
  return {
    rfc,
    nombre: sujeto.get('CN') ?? sujeto.get('O') ?? null,
    serie,
    serie_decimal: BigInt(`0x${hex}`).toString(),
    emisor: c.issuer.split('\n').join(','),
    vale_desde: desde.toISOString(),
    vence: hasta.toISOString(),
    cer_b64: b64(c.raw),
  };
}

const RSA_SHA1 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' } as const;

/** Abre la FIEL: certificado + llave + contraseña. Comprueba que la llave
 *  sea LA de ese certificado firmando algo y verificándolo con él: dos
 *  archivos de personas distintas, o una llave de sello con el certificado
 *  de la FIEL, se quedan aquí. */
export async function abrirFiel(cer: Uint8Array, key: Uint8Array, clave: string, hoy: Date = new Date()): Promise<FielAbierta | FallaFiel> {
  const datos = leerCertificado(cer, hoy);
  if (esFallaFiel(datos)) return datos;
  if (!key.length || key.length > TOPE_ARCHIVO) return { error: 'fiel_key_ilegible', detalle: { motivo: 'el archivo .key está vacío o es demasiado grande' } };
  if (!clave) return { error: 'fiel_clave_incorrecta', detalle: { motivo: 'falta la contraseña de la llave privada' } };
  let pkcs8: Uint8Array;
  try {
    const k = createPrivateKey({ key: Buffer.from(key), format: 'der', type: 'pkcs8', passphrase: clave });
    pkcs8 = new Uint8Array(k.export({ format: 'der', type: 'pkcs8' }) as Buffer);
  } catch {
    // No se puede distinguir «contraseña mala» de «archivo dañado»: se dicen las dos.
    return { error: 'fiel_clave_incorrecta', detalle: { motivo: 'la contraseña no abre la llave (.key), o el archivo .key no es el de la FIEL' } };
  }
  try {
    const firma = await crypto.subtle.importKey('pkcs8', pkcs8, RSA_SHA1, false, ['sign']);
    const prueba = new TextEncoder().encode('suite101 · bill101 · la llave es la del certificado');
    const sello = await crypto.subtle.sign(RSA_SHA1.name, firma, prueba);
    const spki = new X509Certificate(Buffer.from(cer)).publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const publica = await crypto.subtle.importKey('spki', spki, RSA_SHA1, false, ['verify']);
    if (!(await crypto.subtle.verify(RSA_SHA1.name, publica, sello, prueba))) {
      return { error: 'fiel_no_casan', detalle: { motivo: 'la llave (.key) no es la de ese certificado (.cer): son de FIEL distintas, o una es del sello', rfc: datos.rfc } };
    }
  } catch {
    return { error: 'fiel_key_ilegible', detalle: { motivo: 'la llave no es RSA: no es una FIEL del SAT' } };
  }
  return { ...datos, pkcs8 };
}

/* ─────────────── guardar la llave abierta ─────────────── */

const LLAVE_CONFIG = 'fiel_llave_maestra';
let cacheMaestra: string | null = null;

/** El secreto del que se derivan las llaves de cifrado. `LLAVE_FIEL` si
 *  alguien la puso; si no, nace sola en `config` del master. Dos Workers a
 *  la vez podrían generar dos: gana la primera y la segunda vuelve a leer
 *  —si no, lo cifrado con la perdedora no se abriría jamás—. */
export async function llaveMaestraFiel(env: Env): Promise<string> {
  const puesta = env.LLAVE_FIEL;
  if (puesta) return puesta;
  if (cacheMaestra) return cacheMaestra;
  const leer = () => env.MASTER.prepare(`SELECT valor FROM config WHERE llave = ?`).bind(LLAVE_CONFIG).first<{ valor: string }>();
  let fila = await leer();
  if (!fila?.valor) {
    await env.MASTER.prepare(`INSERT OR IGNORE INTO config (llave, valor) VALUES (?, ?)`).bind(LLAVE_CONFIG, b64(crypto.getRandomValues(new Uint8Array(32)))).run();
    fila = await leer();
  }
  cacheMaestra = fila!.valor;
  return cacheMaestra;
}

async function llaveDe(maestra: string, org: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(maestra), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('suite101 · fiel · v1'), info: new TextEncoder().encode(org) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** Lo cifrado va atado a la empresa y al RFC: copiado a la base de otra
 *  empresa, o junto a otro certificado, no abre. */
const atadura = (org: string, rfc: string): Uint8Array => new TextEncoder().encode(`fiel|${org}|${rfc}`);

export interface LlaveCifrada { iv: string; dato: string }

export async function cifrarLlave(pkcs8: Uint8Array, maestra: string, org: string, rfc: string): Promise<LlaveCifrada> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dato = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: atadura(org, rfc) }, await llaveDe(maestra, org), pkcs8);
  return { iv: b64(iv), dato: b64(dato) };
}

/** `null` si no abre: otro secreto, otra empresa, o lo guardado se dañó. */
export async function descifrarLlave(c: LlaveCifrada, maestra: string, org: string, rfc: string): Promise<Uint8Array | null> {
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv), additionalData: atadura(org, rfc) }, await llaveDe(maestra, org), deB64(c.dato));
    return new Uint8Array(claro);
  } catch {
    return null;
  }
}

/* ─────────────── firmar ─────────────── */

export type Firmante = (texto: string) => Promise<string>;

/** El SAT pide RSA con SHA-1 en sus servicios de descarga (es lo que dice su
 *  WSDL; no se escoge). Devuelve quien firma un texto y da la firma en base64. */
export async function firmante(pkcs8: Uint8Array): Promise<Firmante> {
  const llave = await crypto.subtle.importKey('pkcs8', pkcs8, RSA_SHA1, false, ['sign']);
  return async (texto) => b64(await crypto.subtle.sign(RSA_SHA1.name, llave, new TextEncoder().encode(texto)));
}

export async function sha1b64(texto: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(texto)));
}

/* La firma de `motor.js` para TypeScript. El motor es JavaScript a propósito
 * (se movió tal cual desde el Worker de roster101); esto es lo que el Durable
 * Object necesita saber de él. */

import type { BaseQuell } from '../quell/motor.js';

/** Lo que la puerta de la suite ya resolvió y el motor recibe en `env.SESION`.
 *  Null cuando quien viene no trae sesión de la suite (un trabajador). */
export interface SesionRoster {
  correo: string;
  nombre: string | null;
  superadmin: boolean;
  quien: { clase: 'miembro'; rol?: string; usuario_id: string };
}

/** Los datos de la empresa que manda su Worker en cada petición (cabecera
 *  `X-Roster`, JSON). Siguen viviendo en el wrangler.toml de cada empresa. */
export interface DatosEmpresaRoster {
  empresa?: string;
  razon_social?: string;
  domicilio?: string;
  correo_privacidad?: string;
  correo_avisos?: string;
  correo_remitente?: string;
  aviso_version?: string;
  version?: string;
}

/** El bucket con el prefijo de la empresa puesto: las llaves que guarda la
 *  base son relativas (`trabajadores/{id}/…`). */
export interface BucketRoster {
  get(llave: string): Promise<R2ObjectBody | null>;
  head(llave: string): Promise<R2Object | null>;
  put(llave: string, cuerpo: ArrayBuffer | Uint8Array | ReadableStream, opciones?: R2PutOptions): Promise<R2Object | null>;
  delete(llave: string): Promise<void>;
}

export interface EntornoRoster {
  DB: BaseQuell;
  DOCS: BucketRoster;
  SESION: SesionRoster | null;
  /** El secreto de la suite: firma la cookie del trabajador. */
  SECRETO: string;
  RESEND_API_KEY?: string;
  /** Fuera de producción el correo no sale y el código se devuelve. */
  CORREO_SALE: boolean;
  EMPRESA: string;
  RAZON_SOCIAL: string;
  DOMICILIO: string;
  CORREO_PRIVACIDAD: string;
  CORREO_AVISOS: string;
  CORREO_REMITENTE: string;
  AVISO_VERSION: string;
  PORTAL_VERSION: string;
}

export function atender(req: Request, env: EntornoRoster, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response>;

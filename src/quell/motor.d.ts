/* La firma de `motor.js` para TypeScript. El motor es JavaScript a propósito
 * (se movió tal cual desde el Worker de quell101); esto es lo que el Durable
 * Object necesita saber de él. */

/** Lo que la puerta de la suite ya resolvió y el motor recibe en `env.SESION`. */
export interface SesionQuell {
  correo: string;
  nombre: string | null;
  superadmin: boolean;
  quien: { clase: 'miembro' | 'personal' | 'cliente'; rol?: string; usuario_id: string };
}

/** La cara de D1 que el motor espera. La da `baseSobreSql` (org-db.ts). */
export interface BaseQuell {
  prepare(sql: string): {
    bind(...args: unknown[]): { first(): Promise<any>; all(): Promise<{ results: any[] }>; run(): Promise<{ success: boolean; meta: { changes: number } }> };
    first(): Promise<any>;
    all(): Promise<{ results: any[] }>;
    run(): Promise<{ success: boolean; meta: { changes: number } }>;
  };
  batch(stmts: Array<{ run(): Promise<unknown> }>): Promise<unknown[]>;
}

export interface EntornoQuell {
  DB: BaseQuell;
  FILES: R2Bucket;
  SESION: SesionQuell;
  /** `orgs/{org}/quell/` — todo lo que se sube va debajo. */
  PREFIJO_R2: string;
  /** El sitio de quell101, para las ligas de los correos. */
  SITIO: string;
  APP_NAME: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
  /** Fuera de producción el correo no sale. */
  CORREO_SALE: boolean;
  /** Invita al cliente en la suite (src/clientes.ts). */
  INVITAR_EN_SUITE: (correo: string, nombre: string) => Promise<{ ok: true; data: unknown } | { ok: false; error: string; detalle?: unknown }>;
}

export function atender(req: Request, env: EntornoQuell, url: URL, path: string): Promise<Response>;

/* La firma de `motor.js` para TypeScript. El motor es JavaScript a propósito
 * (se movió tal cual desde el Worker de quell101); esto es lo que el Durable
 * Object necesita saber de él. */

/** Lo que la puerta de la suite ya resolvió y el motor recibe en `env.SESION`. */
export interface SesionQuell {
  correo: string;
  nombre: string | null;
  superadmin: boolean;
  quien: { clase: 'miembro' | 'personal' | 'cliente'; rol?: string; usuario_id: string; ref_id?: string | null };
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
  INVITAR_EN_SUITE: (correo: string, nombre: string, usarExistente?: boolean) => Promise<{ ok: true; data: unknown } | { ok: false; error: string; detalle?: unknown }>;
  /** 0.49.0: al levantar un requerimiento en una obra ligada, la suite le
   *  hace su ítem y lo mete al borrador de quote101 (org-db.ts). */
  LEVANTAR_REQUERIMIENTO?: (d: { element_id: string; obra_id: string; code: string; name: string; padre_item_id?: string | null }) => { item_id: string | null; cotizacion_id: string | null } | Promise<{ item_id: string | null; cotizacion_id: string | null }>;
  /** 0.73.0: las partidas que nacen de las fases del cronograma mueven el
   *  compromiso del proyecto de dash101 (org-db.ts recalcularProyecto). */
  RECALCULAR_PROYECTO?: (proyecto_id: string) => void | Promise<void>;
}

export function atender(req: Request, env: EntornoQuell, url: URL, path: string): Promise<Response>;

/** 0.59.1 · El correo al cliente con sus puntos por definir, armado aparte para medirlo. */
/** La dirección de peek101 deducida de la de quell101 (5-oct-2026). */
export function sitioPeek(sitioQuell: string): string;
export function correoDePuntos(args: {
  sitio: string;
  quien: { name?: string | null };
  obra: { id: string; name: string };
  dudas: Array<{ texto: string; pieza: string | null }>;
}): { asunto: string; html: string; liga: string };

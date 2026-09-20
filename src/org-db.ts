/* OrgDB — una empresa, un Durable Object, un SQLite suyo.
 *
 * Nace solo la primera vez que alguien le habla (`ORG.idFromName(orgId)`), sin
 * redeploy. Al despertar mira su versión y, si está atrás, se migra.
 *
 * Un solo hilo por empresa: dos escrituras al mismo tiempo se encolan y nadie
 * pisa a nadie. Por eso los cachés del proyecto (precio_venta, cobrado, avance)
 * se pueden recalcular aquí adentro sin transacciones ni condiciones de carrera
 * — que es justo lo que en conta-master había que resolver a mano.
 *
 * Aquí no hay permisos: los permisos se resuelven en el Worker, antes de llegar
 * (§7). Este objeto guarda y calcula.
 */

import { DurableObject } from 'cloudflare:workers';
import inicial from '../migrations/org/0001_inicial.sql';
import partidasATabla from '../migrations/org/0002_partidas.sql';
import conciliaciones from '../migrations/org/0003_conciliaciones.sql';
import folios from '../migrations/org/0004_folios.sql';
import ajustes from '../migrations/org/0005_ajustes.sql';
import quell from '../migrations/org/0006_quell.sql';
import roster from '../migrations/org/0007_roster.sql';
import ordenes from '../migrations/org/0008_ordenes.sql';
import fiscal from '../migrations/org/0009_fiscal.sql';
import obras from '../migrations/org/0010_obras.sql';
import cantidad from '../migrations/org/0011_cantidad.sql';
import facturaEsperada from '../migrations/org/0012_factura_esperada.sql';
import bitacoraPrecio from '../migrations/org/0013_bitacora_precio.sql';
import { atender as atenderQuell, type BaseQuell, type SesionQuell } from './quell/motor.js';
import { atender as atenderRoster, type DatosEmpresaRoster, type SesionRoster } from './roster/motor.js';
import { invitarClienteEnSuite } from './clientes';
import { secretoDe } from './maestro';
import type { Quien } from './http';
import { DEFS, type Def, type Tipo } from './tablas';
import { ahora, normalizar, ulid } from './lib';
import { TABLAS, type Aviso, type Etapa, type Peek, type Pool, type Tabla } from '../schema/tipos';
import type { Env } from './entorno';

/* Las migraciones del OrgDB, en orden. Para agregar una: se escribe el .sql,
 * se importa y se empuja aquí. El DO la aplica al despertar. Nunca se edita
 * una que ya salió: las bases que ya la corrieron no la volverían a correr. */
/** Las migraciones del OrgDB, en orden. Se exporta porque es el ÚNICO dueño de
 *  esta lista: el DO las aplica de aquí, `VERSION_ORG_DB` se cuenta de aquí y
 *  `esquema.spec.ts` compara contra esto mismo. Una prueba que se armara su
 *  propia lista compararía contra una base que no existe — y eso pasó: la
 *  prueba del esquema se quedó en la 0003 y nadie lo notó, porque la 0004 sólo
 *  agregaba una tabla que el contrato no expone. */
export const MIGRACIONES: string[] = [inicial, partidasATabla, conciliaciones, folios, ajustes, quell, roster, ordenes, fiscal, obras, cantidad, facturaEsperada, bitacoraPrecio];

/** La versión a la que llega un OrgDB al día. Se exporta para que las pruebas
 *  no la escriban a mano: el 16-sep, subir la migración 0004 y olvidar el
 *  número dejó el humo en rojo con la migración ya publicada y funcionando.
 *  El repositorio define qué es «al día»; nadie más. */
export const VERSION_ORG_DB = MIGRACIONES.length;

const PREFIJO_CLAVE: Record<string, string> = { mueble: 'M', servicio: 'S', visita: 'V', otro: 'O' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

export interface Sujeto {
  usuario_id: string;
  /** 'miembro' ve todo; 'personal' no ve dinero salvo ve_dinero; 'cliente' solo /peek */
  clase: 'miembro' | 'personal' | 'cliente';
  ref_id?: string;
  ve_dinero?: boolean;
}

/* La cara del Durable Object vista desde el Worker.
 *
 * El stub tipado que da `DurableObjectNamespace<OrgDB>` obliga a TypeScript a
 * recorrer la clase entera en cada llamada, y con trece tablas eso se le acaba
 * saliendo de las manos (TS2589). Esta interfaz dice lo mismo en plano: mismos
 * metodos, mismas firmas, envueltos en Promise porque del otro lado hay una
 * llamada a distancia. Si se agrega un metodo publico, se agrega aqui. */
export interface ApiOrgDB {
  version(): Promise<number>;
  /** Puerta de servicio: borra TODO y vuelve a migrar. Solo DELETE /admin/orgs/:o fuera de producción. */
  vaciar(): Promise<number>;
  listar(tabla: Tabla, filtros?: Record<string, string>, sujeto?: Sujeto, limite?: number): Promise<{ total: number; filas: Fila[] }>;
  obtener(tabla: Tabla, id: string): Promise<Fila | null>;
  crear(tabla: Tabla, datos: Fila, contexto: { app: string; usuario_id: string }): Promise<Fila>;
  /** Deja el contador de folios en un número. La usa la mudanza de la fase 4
   *  para dejarlo justo después de lo que acabó de importar. */
  fijarFolio(siguiente: number, serie?: string): Promise<number>;
  /** Aparta el siguiente número de una serie (lo consume). */
  apartarNumero(serie: string): Promise<number>;
  /** Mira el siguiente número sin apartarlo. */
  verNumero(serie: string): Promise<number>;
  actualizar(tabla: Tabla, id: string, datos: Fila): Promise<Fila | null>;
  /** false si no existía; 'en_uso' si otras filas apuntan a esta (llave foránea). */
  borrar(tabla: Tabla, id: string): Promise<boolean | 'en_uso'>;
  recalcularProyecto(proyecto_id: string): Promise<Fila | null>;
  /** La conciliación semanal, entera o nada (B1). Sólo la llama POST /conciliaciones. */
  conciliar(args: {
    negocio_id: string; corte_at: string; usuario_id: string;
    saldos: Array<{ cuenta_id: string; saldo_real: number }>;
  }): Promise<{ ok: true; conciliacion: Fila; cuentas: Fila[]; diferencia_total: number } | { ok: false; error: string; detalle?: Record<string, any> }>;
  estadisticaConciliacion(negocio_id: string): Promise<{
    cortes: Array<Record<string, any>>;
    por_cuenta: Array<Record<string, any>>;
    acumulado: { cortes: number; diferencia_total: number; faltante: number; sobrante: number };
  }>;
  moverEtapa(args: {
    item_id: string; etapa: number; nota?: string | null; foto?: string | null;
    usuario_id: string; persona_id?: string | null; etapas_permitidas?: number[] | null;
  }): Promise<{ ok: true; item: Fila; avance: Fila } | { ok: false; error: string; detalle?: Record<string, any> }>;
  exportarItems(args: {
    cotizacion_id: string; lineas: Array<Record<string, any>>; negocio_id: string; cliente_id: string; usuario_id: string;
  }): Promise<{ total: number; filas: Fila[] }>;
  venderItems(args: {
    item_ids: string[]; proyecto_id?: string | null; nombre_proyecto?: string; app: string; usuario_id: string;
  }): Promise<{ ok: true; proyecto: Fila; items: Fila[] } | { ok: false; error: string; detalle?: Record<string, any> }>;
  registrarArchivo(datos: {
    id: string; r2_key: string; nombre: string; mime: string | null; bytes: number;
    de_tabla: string; de_id: string; subido_por: string;
  }): Promise<Fila | null>;
  pool(): Promise<Pool>;
  peek(cliente_id: string): Promise<Peek | null>;
  conectados(): Promise<number>;
  /** Puerta de servicio: solo la usa POST /admin/importar (fase 2). */
  importar(args: { filas: Record<string, Fila[]>; seco: boolean }): Promise<Importacion>;
  conteos(): Promise<{ filas: Record<string, number>; sumas: Record<string, number> }>;
  /** Cuántas filas hay en cada tabla de quell101. Para master101 y para medir la mudanza. */
  conteosQuell(): Promise<Record<string, number>>;
  /** Cuántas filas hay en cada tabla de roster101. Para master101 y para medir la mudanza. */
  conteosRoster(): Promise<Record<string, number>>;
  /* Órdenes de compra (0008). Los permisos los resuelve el Worker; aquí sólo
   * viven las reglas que son verdad de la base —una orden pagada no se vuelve
   * a pagar— y lo que tiene que pasar todo o nada. */
  personalDeUsuario(usuario_id: string): Promise<Fila | null>;
  asegurarPersonal(args: { usuario_id: string; nombre: string; correo?: string | null }): Promise<Fila>;
  esContador(usuario_id: string): Promise<boolean>;
  marcarContador(args: { personal_id: string; valor: boolean; quien_usuario_id: string; quien_nombre?: string | null }): Promise<Fila | null>;
  crearOrden(args: Record<string, unknown>): Promise<Fila | { error: string; detalle?: unknown }>;
  misOrdenes(usuario_id: string, negocio_id?: string | null): Promise<Fila[]>;
  buzon(hoy?: string, negocio_id?: string | null): Promise<{ filas: Fila[]; total: number; vence_esta_semana: number; vencidas: number }>;
  verOrden(id: string): Promise<{ orden: Fila; eventos: Fila[]; archivos: Fila[] } | null>;
  pagarOrden(args: Record<string, unknown>): Promise<{ ok: true; orden: Fila; movimiento: Fila; partida_id: string | null } | { error: string; detalle?: unknown }>;
  resolverOrden(args: { id: string; que: 'devuelta' | 'rechazada'; nota: string; quien_usuario_id: string; quien_nombre?: string | null }): Promise<Fila | { error: string; detalle?: unknown }>;
  corregirOrden(args: { id: string; quien_usuario_id: string; quien_nombre?: string | null; cambios: Record<string, unknown> }): Promise<Fila | { error: string; detalle?: unknown }>;

  /* Contabilidad fiscal (0009). Una sola lista de movimientos; la fiscal es
   * la misma filtrada por `facturado`. */
  crearCfdi(args: Record<string, unknown>): Promise<Fila | { error: string; detalle?: unknown }>;
  ligarCfdi(args: { cfdi_id: string; movimiento_id: string; monto_aplicado?: number }): Promise<{ ok: true; cfdi: Fila; movimiento: Fila; aplicado_total: number } | { error: string; detalle?: unknown }>;
  cancelarCfdi(id: string): Promise<Fila | { error: string }>;
  marcarFacturado(args: Record<string, unknown>): Promise<Fila | { error: string; detalle?: unknown }>;
  /* Todas llevan `negocio_id` opcional: el RFC vive en el negocio, así que
   * un IVA del mes que mezcle dos negocios no es el IVA de nadie. Sin él,
   * salen las cifras de toda la empresa. */
  ivaDelMes(desde: string, hasta: string, negocio_id?: string | null): Promise<{ desde: string; hasta: string; trasladado: number; acreditable: number; retenciones: number; a_enterar: number; facturas: { emitidas: number; recibidas: number; canceladas: number } }>;
  facturadoVsReal(desde: string, hasta: string, negocio_id?: string | null): Promise<{ desde: string; hasta: string; ingresos: { total: number; facturado: number; fuera: number }; egresos: { total: number; facturado: number; fuera: number } }>;
  pendientesDeFactura(negocio_id?: string | null, tipo?: string | null): Promise<Fila[]>;
  listaCfdi(args: { desde?: string; hasta?: string; tipo?: string; estado?: string; negocio_id?: string | null }): Promise<Fila[]>;

  /* El cliente es uno solo en las tres apps: avisar del parecido y juntar
   * los dos que ya se crearon. */
  clientesParecidos(nombre: string, negocio_id?: string | null): Promise<Fila[]>;
  fusionarClientes(queda_id: string, se_va_id: string): Promise<{ ok: true; cliente: Fila; movidos: Record<string, number> } | { error: string; detalle?: unknown }>;

  /* La obra de quell101 ligada al proyecto de dash101 (0010). */
  obras(args?: { sueltas?: boolean }): Promise<Fila[]>;
  obraDeProyecto(proyecto_id: string): Promise<Fila | null>;
  sinUbicar(obra_id: string): Promise<{ obra: Fila; items: Fila[] } | { error: string; detalle?: unknown }>;
  ligarObra(obra_id: string, proyecto_id: string): Promise<{ ok: true; obra: Fila } | { error: string; detalle?: unknown }>;
  itemsDeLaObra(obra_id: string): Promise<{ obra: Fila; parejas: Fila[]; nuevos: Fila[]; sueltos: Fila[] } | { error: string; detalle?: unknown }>;
  fusionarItemsDeLaObra(
    obra_id: string,
    plan: { ligar?: Array<{ element_id: string; item_id: string }>; crear?: string[] },
    contexto: { usuario_id: string },
  ): Promise<{ ok: true; ligados: number; creados: number; obra: Fila } | { error: string; detalle?: unknown }>;
  desligarObra(obra_id: string): Promise<{ ok: true; obra: Fila } | { error: string; detalle?: unknown }>;

  fetch(req: Request): Promise<Response>;
}

/* ─────────────── quell101 sobre el SqlStorage ───────────────
 * El motor de quell101 (src/quell/motor.js) habla D1: prepare · bind · first ·
 * all · run · batch. El SqlStorage del Durable Object habla `exec(sql, ...args)`
 * y devuelve un cursor. Esto es la traducción, y es lo único que cambió del
 * motor al mudarse: las consultas son las mismas. */
export function baseSobreSql(sql: SqlStorage): BaseQuell {
  const arma = (q: string, args: unknown[]) => ({
    async first() {
      const filas = sql.exec(q, ...(args as SqlStorageValue[])).toArray();
      return filas.length ? filas[0] : null;
    },
    async all() { return { results: sql.exec(q, ...(args as SqlStorageValue[])).toArray() }; },
    async run() {
      const cursor = sql.exec(q, ...(args as SqlStorageValue[]));
      cursor.toArray();
      return { success: true, meta: { changes: cursor.rowsWritten } };
    },
  });
  return {
    prepare(q: string) { const sin = arma(q, []); return { ...sin, bind: (...args: unknown[]) => arma(q, args) }; },
    async batch(stmts) { const out: unknown[] = []; for (const st of stmts) out.push(await st.run()); return out; },
  };
}

/** Una cabecera que viajó codificada (encodeURIComponent) del Worker al
 *  objeto, porque una cabecera sólo lleva ASCII. Tolera la forma vieja. */
function cabeceraJson<T>(valor: string | null, siNo: T): T {
  if (!valor) return siNo;
  let texto = valor;
  try { texto = decodeURIComponent(valor); } catch { /* venía sin codificar */ }
  try { return JSON.parse(texto) as T; } catch { return siNo; }
}

/** Las tablas de roster101 (0007) en el orden en que se pueden insertar. Los
 *  códigos de acceso se cuentan pero no se mudan: valen diez minutos. */
export const TABLAS_ROSTER = [
  'roster_trabajadores', 'roster_documentos', 'roster_consentimientos', 'roster_papelera', 'roster_bitacora',
  'roster_administradores', 'roster_codigos',
] as const;

/** El bucket de la suite con el prefijo de una app dentro de una empresa:
 *  el motor de roster101 guarda llaves relativas (`trabajadores/{id}/…`) y
 *  todas caen bajo `orgs/{org}/roster/`. */
function bucketConPrefijo(b: R2Bucket, prefijo: string) {
  return {
    get: (k: string) => b.get(prefijo + k),
    head: (k: string) => b.head(prefijo + k),
    put: (k: string, cuerpo: ArrayBuffer | Uint8Array | ReadableStream, o?: R2PutOptions) => b.put(prefijo + k, cuerpo as ArrayBuffer, o),
    delete: (k: string) => b.delete(prefijo + k),
  };
}

/** Las tablas de quell101 en el orden en que se pueden insertar (las llaves
 *  foráneas apuntan hacia arriba). La mudanza y el conteo las recorren así. */
export const TABLAS_QUELL = [
  'quell_users', 'quell_projects', 'quell_project_members', 'quell_plans', 'quell_elements', 'quell_log_entries',
  'quell_punch_items', 'quell_photos', 'quell_operaciones', 'quell_etapas', 'quell_element_etapas', 'quell_dudas',
  'quell_duda_respuestas', 'quell_element_contratistas',
] as const;

/** Lo que devuelve una corrida del importador. Todo son números medidos
 *  dentro del SQLite, no lo que el importador creyó escribir. */
export interface Importacion {
  antes: Record<string, number>;
  despues: Record<string, number>;
  nuevas: Record<string, number>;
  actualizadas: Record<string, number>;
  fallos: Array<{ tabla: string; id: string; motivo: string }>;
  /** Toda la plata que hay en la base, en centavos. Informativo. */
  sumas: Record<string, number>;
  /** La plata SOLO de las filas que trajo esta corrida, leída de la base
   *  después de escribir. Es contra esto que se compara lo convertido: el
   *  total de la tabla no sirve, porque a la segunda corrida ya está adentro
   *  y compararlo contra lo convertido lo contaría dos veces. */
  sumas_importadas: Record<string, number>;
  /** Tres ids por tabla, releídos de la base: sirven para enseñar que son los mismos. */
  muestra: Array<{ tabla: string; id: string }>;
  enlaces: { movimientos_con_item: number; item_que_no_existe: string[] };
  proyectos_recalculados: number;
  /** Cotizaciones que llegaron sin folio y se fueron con uno. La mudanza de
   *  quote101 trae muchas así: la app nunca les puso número. */
  folios_asignados: number;
}

export class OrgDB extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrar());
  }

  /* ─────────────── migraciones ───────────────
   * El documento decía `PRAGMA user_version`. Se usa una tabla en su lugar:
   * el SQLite del Durable Object no expone ese pragma para escritura, y una
   * tabla además deja fecha de cuándo corrió cada una. */
  private migrar(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS _migraciones (version INTEGER PRIMARY KEY, aplicada_at TEXT NOT NULL)`);
    const fila = this.sql.exec(`SELECT MAX(version) AS v FROM _migraciones`).one() as { v: number | null };
    const desde = fila?.v ?? 0;
    for (let i = desde; i < MIGRACIONES.length; i++) {
      this.sql.exec(MIGRACIONES[i]);
      this.sql.exec(`INSERT INTO _migraciones (version, aplicada_at) VALUES (?, ?)`, i + 1, new Date().toISOString());
    }
  }

  /** Borra todo lo que hay en el SQLite de esta empresa y lo deja como recién
   *  nacido: tablas vacías y las migraciones aplicadas. Para resembrar la org
   *  demo de staging; la ruta que lo llama no existe en producción. */
  async vaciar(): Promise<number> {
    await this.ctx.storage.deleteAll();
    this.migrar();
    return this.version();
  }

  version(): number {
    const f = this.sql.exec(`SELECT MAX(version) AS v FROM _migraciones`).one() as { v: number | null };
    return f?.v ?? 0;
  }

  /* ─────────────── conversión de filas ───────────────
   * SQLite no tiene booleanos ni JSON: guarda 0/1 y texto. Hacia afuera se
   * devuelve lo que la app espera, para que ninguna tenga que acordarse. */

  private afuera(tabla: Tabla, fila: Fila | null): Fila | null {
    if (!fila) return null;
    const cols = DEFS[tabla].cols;
    const out: Fila = {};
    for (const [k, v] of Object.entries(fila)) {
      const t = cols[k] as Tipo | undefined;
      if (t === 'json') {
        try {
          out[k] = JSON.parse(String(v ?? (k === 'asignados' || k === 'etapas_permitidas' ? '[]' : '{}')));
        } catch {
          out[k] = null;
        }
      } else if (t === 'bool') out[k] = !!v;
      else out[k] = v;
    }
    return out;
  }

  private adentro(tipo: Tipo, v: unknown): unknown {
    if (v === undefined) return null;
    if (tipo === 'json') return JSON.stringify(v ?? null);
    if (tipo === 'bool') return v ? 1 : 0;
    if (tipo === 'dinero' || tipo === 'entero') return v === null ? null : Math.trunc(Number(v));
    if (tipo === 'real') return v === null ? null : Number(v);
    return v === null ? null : String(v);
  }

  /* ─────────────── CRUD genérico ─────────────── */

  listar(
    tabla: Tabla,
    filtros: Record<string, string> = {},
    sujeto?: Sujeto,
    limite = 500,
  ): { total: number; filas: Fila[] } {
    const def: Def = DEFS[tabla];
    const donde: string[] = [];
    const args: unknown[] = [];

    for (const f of def.filtros) {
      if (filtros[f] !== undefined && filtros[f] !== '') {
        donde.push(`${f} = ?`);
        args.push(def.cols[f] === 'bool' ? (filtros[f] === 'true' || filtros[f] === '1' ? 1 : 0) : filtros[f]);
      }
    }
    if (def.fecha) {
      if (filtros.desde) { donde.push(`${def.fecha} >= ?`); args.push(filtros.desde); }
      if (filtros.hasta) { donde.push(`${def.fecha} <= ?`); args.push(filtros.hasta); }
    }
    // Un cliente jamás llega hasta aquí: desde el 12-sep la ruta le contesta
    // 403 antes (puedeLeer). Esto se queda como segunda cerradura: si algún
    // día una ruta nueva se olvida de preguntar, lo peor que ve es lo suyo.
    if (sujeto?.clase === 'cliente') {
      if (tabla === 'items' || tabla === 'proyectos') { donde.push(`cliente_id = ?`); args.push(sujeto.ref_id ?? '—'); }
      else if (tabla === 'clientes') { donde.push(`id = ?`); args.push(sujeto.ref_id ?? '—'); }
    }

    const w = donde.length ? ` WHERE ${donde.join(' AND ')}` : '';
    const total = (this.sql.exec(`SELECT COUNT(*) AS n FROM ${tabla}${w}`, ...args).one() as { n: number }).n;
    const filas = this.sql
      .exec(`SELECT * FROM ${tabla}${w} ORDER BY ${def.orden} LIMIT ?`, ...args, limite)
      .toArray() as Fila[];
    return { total, filas: filas.map((f) => this.afuera(tabla, f)!) };
  }

  obtener(tabla: Tabla, id: string): Fila | null {
    const f = this.sql.exec(`SELECT * FROM ${tabla} WHERE id = ?`, id).toArray()[0] as Fila | undefined;
    return this.afuera(tabla, f ?? null);
  }

  /* ─────────────── el folio de la cotización ───────────────
   * Se asigna AQUÍ, dentro del Durable Object, y por eso es atómico sin
   * transacciones: un solo hilo por empresa, así que «leer, sumar uno,
   * guardar» no se puede entrelazar con otra ejecución. Es la respuesta de
   * verdad a «dos personas cotizando a la vez», y es más fuerte que una
   * transacción, porque no depende de que esté bien escrita.
   *
   * Formato: `COT-` y seis dígitos. Lo decidió Mike el 16-sep —consecutivo
   * corrido, sin año— porque quiere que el número diga cuántas cotizaciones
   * llevan en total.
   *
   * El candado del `while`: los 39 folios que traerá la mudanza son números
   * derivados de 008406 a 874280, y ninguno baja de 1000, así que la cuenta
   * nueva tiene 8,366 de margen. Aun así se comprueba, porque cuesta una
   * consulta con índice y cubre el día que se importe el histórico de otro
   * cliente. Hoy no se dispara nunca.
   */
  private siguienteFolio(serie = 'COT'): string {
    for (;;) {
      const folio = `${serie}-${String(this.apartarNumero(serie)).padStart(6, '0')}`;
      const ocupado = this.sql.exec(`SELECT 1 AS x FROM cotizaciones WHERE folio = ? LIMIT 1`, folio).toArray()[0];
      if (!ocupado) return folio;
    }
  }

  /** Aparta el siguiente número de una serie y lo devuelve. El contador queda
   *  ya avanzado: quien lo pidió se lo llevó, aunque después no lo use.
   *
   *  Es el mismo mecanismo del folio, y es lo que hace falta para CUALQUIER
   *  consecutivo: el de los recibos de quote101 vivía en Firestore con la
   *  cuenta hecha en el navegador —leer, sumar uno, guardar— y ahí dos
   *  personas guardando a la vez se llevan el mismo número. Aquí no puede
   *  pasar: un solo hilo por empresa.
   *
   *  Un número apartado NO se devuelve si el recibo no se acaba imprimiendo.
   *  Eso deja huecos en la numeración, y es lo correcto: un consecutivo que
   *  reusa números es un consecutivo que puede repetir. Un hueco se explica;
   *  dos recibos con el mismo número, no. */
  apartarNumero(serie: string): number {
    const fila = this.sql.exec(`SELECT siguiente FROM folios WHERE serie = ?`, serie).toArray()[0] as
      { siguiente: number } | undefined;
    const n = fila?.siguiente ?? 1;
    this.sql.exec(
      `INSERT INTO folios (serie, siguiente) VALUES (?,?) ON CONFLICT(serie) DO UPDATE SET siguiente = excluded.siguiente`,
      serie, n + 1,
    );
    return n;
  }

  /** Mira el siguiente número sin apartarlo. Para enseñarlo en una pantalla
   *  antes de que el usuario confirme: si se apartara al abrir la pantalla,
   *  cada vez que alguien se asomara y cerrara se iría un número. */
  verNumero(serie: string): number {
    const fila = this.sql.exec(`SELECT siguiente FROM folios WHERE serie = ?`, serie).toArray()[0] as
      { siguiente: number } | undefined;
    return fila?.siguiente ?? 1;
  }

  /** Deja el contador en un número dado. La usa la mudanza de la fase 4 para
   *  dejarlo justo después de lo que acabó de importar. */
  fijarFolio(siguiente: number, serie = 'COT'): number {
    const n = Math.max(1, Math.floor(siguiente));
    this.sql.exec(
      `INSERT INTO folios (serie, siguiente) VALUES (?,?) ON CONFLICT(serie) DO UPDATE SET siguiente = excluded.siguiente`,
      serie, n,
    );
    return n;
  }

  crear(tabla: Tabla, datos: Fila, contexto: { app: string; usuario_id: string }): Fila {
    const def = DEFS[tabla];
    const fila: Fila = { ...datos };

    fila.id = (datos.id as string) || ulid();

    /* El folio no lo pone la app. Lo pone la suite, y una sola vez.
     *
     * La única excepción es `suite101`, que es con la que entra la mudanza de
     * la fase 4: ésa trae los folios viejos ya congelados y hay que
     * respetarlos, porque son los que andan impresos en los PDFs de los
     * clientes. Cualquier otra app que mande un folio se lo ignora: si se
     * dejara pasar, el navegador volvería a decidir el folio y estaríamos en
     * el problema del que venimos. */
    if (tabla === 'cotizaciones') {
      const traido = String(datos.folio ?? '').trim();
      fila.folio = contexto.app === 'suite101' && traido ? traido : this.siguienteFolio();
    }
    /* El ajuste es de la app que lo escribe, y su `id` se calcula: `app:clave`.
     *
     * Ni el `id` ni el `app` vienen de fuera, aunque los manden: si una app
     * pudiera elegir su id, podría escribir `cotizador101:precios` desde otra
     * app y pisarle la lista de precios. Con el id armado aquí, el candado no
     * depende de que ninguna ruta se acuerde de revisar. */
    if (tabla === 'ajustes') {
      fila.app = contexto.app;
      fila.clave = String(datos.clave ?? '').trim();
      fila.id = `${contexto.app}:${fila.clave}`;
      fila.actualizado_at = ahora();
    }
    if (def.cols.creado_at) fila.creado_at = ahora();
    if (def.cols.ts && !fila.ts) fila.ts = ahora();
    if (def.cols.creado_por) fila.creado_por = contexto.usuario_id;
    if (def.cols.creado_en_app) fila.creado_en_app = contexto.app;
    if (def.cols.nombre_norm) fila.nombre_norm = normalizar(datos.nombre_norm ?? datos.nombre);

    const cols = Object.keys(fila).filter((c) => c in def.cols);
    const valores = cols.map((c) => this.adentro(def.cols[c], fila[c]));
    /* Guardar un ajuste es un solo POST: su id se calcula, así que el segundo
     * POST con la misma clave no es un choque, es la misma gaveta otra vez. Sin
     * esto la app tendría que preguntar antes si existía, y dos pestañas
     * guardando a la vez se llevarían un 409 por turnarse mal. */
    const choque = tabla === 'ajustes'
      ? ' ON CONFLICT(id) DO UPDATE SET valor = excluded.valor, actualizado_at = excluded.actualizado_at'
      : '';
    this.sql.exec(
      `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})${choque}`,
      ...valores,
    );

    this.despuesDeEscribir(tabla, fila.id as string);
    return this.obtener(tabla, fila.id as string)!;
  }

  actualizar(tabla: Tabla, id: string, datos: Fila): Fila | null {
    const def = DEFS[tabla];
    const cols = Object.keys(datos).filter((c) => c in def.cols && c !== 'id');
    if (!cols.length) return this.obtener(tabla, id);
    /* El precio de ANTES, para poder contarlo en la bitácora de la obra. Se
     * lee aquí y no después porque después ya no existe: un `UPDATE` no deja
     * copia. Sólo cuando de verdad viene un monto nuevo, para no pagar una
     * lectura en cada cambio de nombre. */
    const montoAntes =
      tabla === 'items' && datos.monto !== undefined
        ? (this.sql.exec(`SELECT monto FROM items WHERE id = ?`, id).toArray()[0] as Fila | undefined)?.monto
        : undefined;
    if (def.cols.nombre_norm && datos.nombre !== undefined && datos.nombre_norm === undefined) {
      cols.push('nombre_norm');
      datos.nombre_norm = normalizar(datos.nombre);
    }
    if (def.cols.actualizado_at) {
      cols.push('actualizado_at');
      datos.actualizado_at = ahora();
    }
    const valores = cols.map((c) => this.adentro(def.cols[c], datos[c]));
    this.sql.exec(`UPDATE ${tabla} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...valores, id);

    this.despuesDeEscribir(tabla, id);
    if (montoAntes !== undefined) this.huellaDePrecio(id, Number(montoAntes));
    return this.obtener(tabla, id);
  }

  borrar(tabla: Tabla, id: string): boolean | 'en_uso' {
    const antes = this.obtener(tabla, id);
    if (!antes) return false;
    // Las llaves foráneas se aplican. Se contesta con un valor y no con una
    // excepción: cruzar el RPC con una excepción deja «uncaught» en el registro
    // del Worker aunque el Worker la atrape.
    try {
      this.sql.exec(`DELETE FROM ${tabla} WHERE id = ?`, id);
    } catch (e) {
      if (/FOREIGN KEY/i.test((e as Error).message ?? '')) return 'en_uso';
      throw e;
    }
    if ((tabla === 'movimientos' || tabla === 'partidas') && antes.proyecto_id) this.recalcularProyecto(String(antes.proyecto_id));
    return true;
  }

  /** Lo que hay que recalcular y avisar después de tocar una tabla. */
  private despuesDeEscribir(tabla: Tabla, id: string): void {
    if (tabla === 'items') {
      const it = this.obtener('items', id);
      if (it?.proyecto_id) this.recalcularProyecto(String(it.proyecto_id));
      this.avisar({ t: 'item.cambio', id }, 'todos');
    }
    if (tabla === 'movimientos') {
      const m = this.obtener('movimientos', id);
      if (m?.proyecto_id) this.recalcularProyecto(String(m.proyecto_id));
      this.avisar({ t: 'movimiento.nuevo', id, proyecto_id: (m?.proyecto_id as string) ?? null }, 'dinero');
    }
    if (tabla === 'partidas') {
      const par = this.obtener('partidas', id);
      if (par?.proyecto_id) this.recalcularProyecto(String(par.proyecto_id));
    }
  }

  /* ─────────────── agregados del proyecto (§4) ───────────────
   * Los calcula la API, no las apps. Un caché que escribe cualquiera deja de
   * ser un caché: se contradice con la tabla y nadie sabe cuál manda. */

  /* ─────────────── la conciliación semanal (B1) ───────────────
   * Una sola operación: o queda la conciliación con sus renglones y sus
   * ajustes, o no queda nada. `transactionSync` da esa garantía dentro del
   * SQLite del Durable Object; el aviso por WebSocket se manda después, ya
   * con todo escrito, porque un aviso no se puede deshacer.
   *
   * El saldo registrado se calcula aquí y se guarda como foto: es lo que
   * dash101 creía tener al corte. Si mañana alguien captura un gasto con
   * fecha vieja, esta conciliación no cambia; eso sale en la siguiente. */
  conciliar(args: {
    negocio_id: string; corte_at: string; usuario_id: string;
    saldos: Array<{ cuenta_id: string; saldo_real: number }>;
  }): { ok: true; conciliacion: Fila; cuentas: Fila[]; diferencia_total: number } | { ok: false; error: string; detalle?: Record<string, any> } {
    const negocio = this.sql.exec(`SELECT id FROM negocios WHERE id = ?`, args.negocio_id).toArray()[0] as Fila | undefined;
    if (!negocio) return { ok: false, error: 'no_encontrado', detalle: { negocio_id: args.negocio_id } };

    const cuentas = this.sql
      .exec(`SELECT id, nombre, saldo_inicial FROM cuentas WHERE negocio_id = ? ORDER BY nombre`, args.negocio_id)
      .toArray() as Fila[];
    if (!cuentas.length) return { ok: false, error: 'datos_invalidos', detalle: { motivo: 'el negocio no tiene cuentas' } };

    // Mike decidió que se concilian TODAS las cuentas, iguales: bancos,
    // efectivo y tarjetas. Que falte una es un error, no un silencio.
    const dados = new Map(args.saldos.map((s) => [s.cuenta_id, s.saldo_real]));
    const faltan = cuentas.filter((c) => !dados.has(String(c.id))).map((c) => ({ id: c.id, nombre: c.nombre }));
    if (faltan.length) return { ok: false, error: 'faltan_cuentas', detalle: { faltan } };
    const sobran = args.saldos.filter((s) => !cuentas.some((c) => String(c.id) === s.cuenta_id)).map((s) => s.cuenta_id);
    if (sobran.length) return { ok: false, error: 'no_encontrado', detalle: { cuentas: sobran, motivo: 'no son de este negocio' } };

    // Los movimientos llevan día, no hora: al corte entra todo lo registrado
    // hasta ese día inclusive.
    const dia = args.corte_at.slice(0, 10);
    const id = ulid();
    const at = ahora();
    const renglones: Fila[] = [];
    let diferencia_total = 0;

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO conciliaciones (id, negocio_id, corte_at, hecha_por, creado_at) VALUES (?,?,?,?,?)`,
        id, args.negocio_id, args.corte_at, args.usuario_id, at,
      );

      for (const c of cuentas) {
        const cuenta_id = String(c.id);
        const movidos = this.sql
          .exec(
            `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS s
             FROM movimientos WHERE cuenta_id = ? AND fecha <= ?`,
            cuenta_id, dia,
          )
          .one() as { s: number };
        const saldo_registrado = Number(c.saldo_inicial || 0) + Number(movidos.s || 0);
        const saldo_real = Number(dados.get(cuenta_id) || 0);
        const diferencia = saldo_registrado - saldo_real;
        diferencia_total += diferencia;

        // El ajuste deja la cuenta igual a la realidad (decisión 1 de Mike).
        // Va SIN proyecto: por eso no mueve `cobrado` ni `pagado_prov`.
        let movimiento_id: string | null = null;
        if (diferencia !== 0) {
          const mov = this.crear(
            'movimientos',
            {
              negocio_id: args.negocio_id,
              tipo: diferencia > 0 ? 'egreso' : 'ingreso',
              monto: Math.abs(diferencia),
              fecha: dia,
              cuenta_id,
              proyecto_id: null,
              item_id: null,
              contraparte_tipo: 'otro',
              contraparte_nombre: 'Sin identificar',
              categoria: 'ajuste_conciliacion',
              descripcion: `Ajuste por conciliación del ${dia}`,
            },
            { app: 'dash101', usuario_id: args.usuario_id },
          );
          movimiento_id = String(mov.id);
        }

        const rid = ulid();
        this.sql.exec(
          `INSERT INTO conciliacion_cuentas
             (id, conciliacion_id, cuenta_id, saldo_registrado, saldo_real, diferencia, movimiento_id, creado_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          rid, id, cuenta_id, saldo_registrado, saldo_real, diferencia, movimiento_id, at,
        );
        renglones.push(this.obtener('conciliacion_cuentas', rid)!);
      }
    });

    this.avisar({ t: 'conciliacion.nueva', id, negocio_id: args.negocio_id, diferencia_total }, 'dinero');
    return { ok: true, conciliacion: this.obtener('conciliaciones', id)!, cuentas: renglones, diferencia_total };
  }

  /** Lo que se escapó: por corte, por cuenta y el acumulado. */
  estadisticaConciliacion(negocio_id: string): {
    cortes: Array<Record<string, unknown>>;
    por_cuenta: Array<Record<string, unknown>>;
    acumulado: { cortes: number; diferencia_total: number; faltante: number; sobrante: number };
  } {
    const cortes = this.sql
      .exec(
        `SELECT c.id, c.corte_at, c.hecha_por,
                COUNT(cc.id) AS cuentas,
                COALESCE(SUM(cc.diferencia), 0) AS diferencia_total,
                COALESCE(SUM(CASE WHEN cc.diferencia > 0 THEN cc.diferencia ELSE 0 END), 0) AS faltante,
                COALESCE(SUM(CASE WHEN cc.diferencia < 0 THEN -cc.diferencia ELSE 0 END), 0) AS sobrante
         FROM conciliaciones c
         LEFT JOIN conciliacion_cuentas cc ON cc.conciliacion_id = c.id
         WHERE c.negocio_id = ?
         GROUP BY c.id ORDER BY c.corte_at DESC`,
        negocio_id,
      )
      .toArray() as Array<Record<string, unknown>>;

    const por_cuenta = this.sql
      .exec(
        `SELECT cc.cuenta_id, cu.nombre, COUNT(*) AS cortes,
                COALESCE(SUM(cc.diferencia), 0) AS diferencia_total
         FROM conciliacion_cuentas cc
         JOIN conciliaciones c ON c.id = cc.conciliacion_id
         LEFT JOIN cuentas cu ON cu.id = cc.cuenta_id
         WHERE c.negocio_id = ?
         GROUP BY cc.cuenta_id ORDER BY diferencia_total DESC`,
        negocio_id,
      )
      .toArray() as Array<Record<string, unknown>>;

    const acumulado = {
      cortes: cortes.length,
      diferencia_total: cortes.reduce((t, c) => t + Number(c.diferencia_total || 0), 0),
      faltante: cortes.reduce((t, c) => t + Number(c.faltante || 0), 0),
      sobrante: cortes.reduce((t, c) => t + Number(c.sobrante || 0), 0),
    };
    return { cortes, por_cuenta, acumulado };
  }

  recalcularProyecto(proyecto_id: string): Fila | null {
    const p = this.sql.exec(`SELECT id, estado FROM proyectos WHERE id = ?`, proyecto_id).toArray()[0] as Fila | undefined;
    if (!p) return null;

    const venta = this.sql
      .exec(`SELECT COALESCE(SUM(monto),0) AS s, COUNT(*) AS n, COALESCE(AVG(etapa),0) AS e,
             COALESCE(SUM(CASE WHEN etapa = 7 THEN 1 ELSE 0 END),0) AS cerrados
             FROM items WHERE proyecto_id = ? AND estado = 'vendido'`, proyecto_id)
      .one() as { s: number; n: number; e: number; cerrados: number };
    const cobrado = (this.sql
      .exec(`SELECT COALESCE(SUM(monto),0) AS s FROM movimientos WHERE proyecto_id = ? AND tipo = 'ingreso'`, proyecto_id)
      .one() as { s: number }).s;
    const pagado = (this.sql
      .exec(`SELECT COALESCE(SUM(monto),0) AS s FROM movimientos WHERE proyecto_id = ? AND tipo = 'egreso'`, proyecto_id)
      .one() as { s: number }).s;
    const avance = venta.n ? venta.e / 7 : 0;

    // Las partidas: lo pagado a cada proveedor sale de los egresos del
    // proyecto que lo traen como contraparte —igual que lo hacía conta-master—
    // y de ahí su estado. Son cachés de la partida: los escribe esto y nadie
    // más. Y lo acordado con todos se suma en `compromiso`, el del proyecto.
    for (const par of this.sql
      .exec(`SELECT id, proveedor_id, monto_acordado FROM partidas WHERE proyecto_id = ?`, proyecto_id)
      .toArray() as Fila[]) {
      const pagadoProv = par.proveedor_id
        ? (this.sql
            .exec(`SELECT COALESCE(SUM(monto),0) AS s FROM movimientos
                   WHERE proyecto_id = ? AND tipo = 'egreso' AND contraparte_tipo = 'proveedor' AND contraparte_id = ?`,
                  proyecto_id, par.proveedor_id)
            .one() as { s: number }).s
        : 0;
      const acordado = Number(par.monto_acordado || 0);
      const estadoPar = pagadoProv >= acordado && acordado > 0 ? 'pagado' : pagadoProv > 0 ? 'parcial' : 'pendiente';
      this.sql.exec(`UPDATE partidas SET monto_pagado = ?, estado = ? WHERE id = ?`, pagadoProv, estadoPar, par.id);
    }
    const compromiso = (this.sql
      .exec(`SELECT COALESCE(SUM(monto_acordado),0) AS s FROM partidas WHERE proyecto_id = ?`, proyecto_id)
      .one() as { s: number }).s;

    // Cuando TODOS los ítems vendidos llegan a la etapa 7, el proyecto queda en
    // finiquito. No se toca si ya está cerrado: eso lo decide la oficina.
    let estado = String(p.estado);
    if (venta.n > 0 && venta.cerrados === venta.n && estado !== 'cerrado') estado = 'finiquito';

    this.sql.exec(
      `UPDATE proyectos SET precio_venta = ?, cobrado = ?, pagado_prov = ?, compromiso = ?, avance = ?, estado = ?, actualizado_at = ? WHERE id = ?`,
      venta.s, cobrado, pagado, compromiso, avance, estado, ahora(), proyecto_id,
    );
    this.avisar({ t: 'proyecto.cache', id: proyecto_id, precio_venta: venta.s, cobrado, avance }, 'dinero');
    return this.obtener('proyectos', proyecto_id);
  }

  /* ─────────────── etapa del ítem (§4) ───────────────
   * Único camino para mover la etapa. Deja renglón en `avances` (append-only),
   * refresca el caché del ítem, bautiza la clave en la 4 y avisa por WebSocket. */

  moverEtapa(args: {
    item_id: string;
    etapa: number;
    nota?: string | null;
    foto?: string | null;
    usuario_id: string;
    persona_id?: string | null;
    /** null = sin restricción (miembro de la org). [] = no puede mover ninguna. */
    etapas_permitidas?: number[] | null;
  }): { ok: true; item: Fila; avance: Fila } | { ok: false; error: string; detalle?: Record<string, any> } {
    const etapa = Math.trunc(Number(args.etapa));
    if (!Number.isInteger(etapa) || etapa < 0 || etapa > 7) {
      return { ok: false, error: 'datos_invalidos', detalle: { etapa: 'entero de 0 a 7' } };
    }
    const item = this.obtener('items', args.item_id);
    if (!item) return { ok: false, error: 'no_encontrado' };

    // El instalador no puede marcar «anticipo pagado». §4.
    if (args.etapas_permitidas && !args.etapas_permitidas.includes(etapa)) {
      return { ok: false, error: 'etapa_no_permitida', detalle: { etapa, permitidas: args.etapas_permitidas } };
    }

    const ts = ahora();
    const avance = this.crear(
      'avances',
      {
        item_id: args.item_id,
        etapa,
        persona_id: args.persona_id ?? null,
        usuario_id: args.usuario_id,
        nota: args.nota ?? null,
        foto: args.foto ?? null,
        ts,
      },
      { app: 'quell101', usuario_id: args.usuario_id },
    );

    let clave = (item.clave as string | null) ?? null;
    if (!clave && etapa >= 4) clave = this.claveNueva(String(item.tipo || 'otro'));

    this.sql.exec(
      `UPDATE items SET etapa = ?, etapa_at = ?, etapa_por = ?, clave = ?, actualizado_at = ? WHERE id = ?`,
      etapa, ts, args.usuario_id, clave, ts, args.item_id,
    );
    if (item.proyecto_id) this.recalcularProyecto(String(item.proyecto_id));

    const fresco = this.obtener('items', args.item_id)!;
    this.avisar({ t: 'item.etapa', id: args.item_id, etapa: etapa as Etapa, clave, at: ts }, 'todos');
    return { ok: true, item: fresco, avance };
  }

  /** 'M07'. Nace en la etapa 4, cuando el ítem se embala y se etiqueta. */
  private claveNueva(tipo: string): string {
    const p = PREFIJO_CLAVE[tipo] ?? 'O';
    const n = (this.sql.exec(`SELECT COUNT(*) AS n FROM items WHERE clave LIKE ?`, `${p}%`).one() as { n: number }).n;
    return `${p}${String(n + 1).padStart(2, '0')}`;
  }

  /* ─────────────── cotizador101 → ítems ─────────────── */

  exportarItems(args: {
    cotizacion_id: string;
    lineas: Array<Record<string, unknown>>;
    negocio_id: string;
    cliente_id: string;
    usuario_id: string;
  }): { total: number; filas: Fila[] } {
    const filas: Fila[] = [];
    args.lineas.forEach((l, i) => {
      filas.push(
        this.crear(
          'items',
          {
            negocio_id: l.negocio_id ?? args.negocio_id,
            cliente_id: l.cliente_id ?? args.cliente_id,
            proyecto_id: null,
            nombre: l.nombre,
            descripcion: l.descripcion ?? null,
            tipo: l.tipo ?? 'mueble',
            monto: l.monto ?? 0,
            /* La cantidad que trae la cotización (0011). quote101 ya cotiza
             * «× 20» desde siempre —`m.qty`— y su total ya viene
             * multiplicado; lo que faltaba era que ese 20 cruzara a la suite,
             * para que en dash101 se vea y para que en quell101 haya 20
             * piezas que ubicar en el plano. Sin él se exportaba un renglón
             * de 20 puertas que valía por una sola pieza. */
            cantidad: Number.isFinite(Number(l.cantidad)) && Number(l.cantidad) > 0 ? Math.trunc(Number(l.cantidad)) : 1,
            moneda: l.moneda ?? 'MXN',
            estado: 'cotizado',
            origen: { app: 'cotizador101', cotizacion_id: args.cotizacion_id, linea: i + 1 },
          },
          { app: 'cotizador101', usuario_id: args.usuario_id },
        ),
      );
    });
    return { total: filas.length, filas };
  }

  venderItems(args: {
    item_ids: string[];
    proyecto_id?: string | null;
    nombre_proyecto?: string;
    app: string;
    usuario_id: string;
  }): { ok: true; proyecto: Fila; items: Fila[] } | { ok: false; error: string; detalle?: Record<string, any> } {
    const items = args.item_ids.map((id) => this.obtener('items', id)).filter(Boolean) as Fila[];
    if (!items.length) return { ok: false, error: 'no_encontrado', detalle: { item_ids: args.item_ids } };

    let proyecto_id = args.proyecto_id ?? null;
    if (!proyecto_id) {
      const p = this.crear(
        'proyectos',
        {
          negocio_id: items[0].negocio_id,
          cliente_id: items[0].cliente_id,
          nombre: args.nombre_proyecto || `Proyecto ${String(items[0].nombre).slice(0, 40)}`,
          estado: 'activo',
          fecha_inicio: ahora().slice(0, 10),
        },
        { app: args.app, usuario_id: args.usuario_id },
      );
      proyecto_id = String(p.id);
    } else if (!this.obtener('proyectos', proyecto_id)) {
      return { ok: false, error: 'no_encontrado', detalle: { proyecto_id } };
    }

    for (const it of items) {
      this.sql.exec(
        `UPDATE items SET estado = 'vendido', proyecto_id = ?, actualizado_at = ? WHERE id = ?`,
        proyecto_id, ahora(), it.id,
      );
      this.avisar({ t: 'item.cambio', id: String(it.id) }, 'todos');
    }
    const proyecto = this.recalcularProyecto(proyecto_id)!;
    return { ok: true, proyecto, items: args.item_ids.map((id) => this.obtener('items', id)!).filter(Boolean) };
  }

  /** Alta de un archivo ya subido a R2. Va aparte del CRUD genérico porque el
   *  Worker necesita la fila de vuelta con tipos concretos y porque nadie
   *  escribe `archivos` a mano: siempre es consecuencia de una subida. */
  registrarArchivo(datos: {
    id: string; r2_key: string; nombre: string; mime: string | null; bytes: number;
    de_tabla: string; de_id: string; subido_por: string;
  }): Fila | null {
    this.sql.exec(
      `INSERT INTO archivos (id, r2_key, nombre, mime, bytes, de_tabla, de_id, subido_por, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      datos.id, datos.r2_key, datos.nombre, datos.mime, datos.bytes,
      datos.de_tabla, datos.de_id, datos.subido_por, ahora(),
    );
    return this.obtener('archivos', datos.id)!;
  }

  /* ─────────────── puerta de servicio: importación (fase 2) ───────────────
   *
   * ESTO NO ES UNA RUTA NORMAL. Entra por debajo de `permisos.ts` a propósito
   * y escribe columnas que ninguna app puede escribir: `etapa`, `creado_at`,
   * `creado_por`, los ids que vengan. Existe para una sola cosa —traer lo que
   * ya vivía en Firestore sin inventarle historial— y solo la alcanza el
   * superadmin por `POST /admin/importar`. Si alguien la encuentra abierta
   * dentro de un año: es la puerta de servicio de la migración, y la razón de
   * que exista está en `claude/CONTINUAR.md`.
   *
   * Escribe por id, así que correrla dos veces no duplica: la segunda vez
   * actualiza las mismas filas. `seco` hace el trabajo completo dentro de una
   * transacción y la deshace al final, para poder medir sin escribir.
   */

  importar(args: { filas: Record<string, Fila[]>; seco: boolean }): Importacion {
    const antes = this.contarFilas();
    const salida: Importacion = {
      antes,
      despues: antes,
      nuevas: {},
      actualizadas: {},
      fallos: [],
      sumas: {},
      sumas_importadas: {},
      muestra: [],
      enlaces: { movimientos_con_item: 0, item_que_no_existe: [] },
      proyectos_recalculados: 0,
      folios_asignados: 0,
    };

    const trabajo = (): void => {
      // El orden de TABLAS ya respeta las dependencias: negocios antes que
      // cuentas, clientes antes que proyectos, proyectos antes que ítems,
      // ítems antes que movimientos.
      for (const tabla of TABLAS) {
        const filas = args.filas[tabla];
        if (!filas?.length) continue;
        let nuevas = 0;
        let actualizadas = 0;
        for (const fila of filas) {
          try {
            if (this.grabarImportada(tabla, fila)) nuevas++;
            else actualizadas++;
          } catch (e) {
            salida.fallos.push({ tabla, id: String(fila.id ?? '(sin id)'), motivo: (e as Error).message });
          }
        }
        salida.nuevas[tabla] = nuevas;
        salida.actualizadas[tabla] = actualizadas;
      }

      /* El folio de las cotizaciones que llegaron sin uno.
       *
       * Se pone AQUÍ y no en el mapeo por dos razones. Una: el contador vive
       * en esta base, y una cuenta paralela en el importador se desalinearía
       * con la del contrato 0.9.0 en cuanto alguien cotizara. Dos:
       * `siguienteFolio` se salta los folios ya ocupados, así que los que la
       * mudanza trae congelados no chocan con los que se asignan, y al final
       * el contador queda solo después del último — sin acomodarlo a mano.
       *
       * En orden de `creado_at` para que los números salgan en el orden en que
       * las cotizaciones se hicieron, no en el que el árbol venía armado.
       *
       * Las que ya tenían folio no entran: si entraran, una segunda corrida le
       * cambiaría el folio a una cotización que ya salió impresa. */
      if (args.filas.cotizaciones?.length) {
        const sinFolio = this.sql
          .exec(`SELECT id FROM cotizaciones WHERE folio IS NULL OR folio = '' ORDER BY creado_at, id`)
          .toArray() as Fila[];
        for (const f of sinFolio) {
          this.sql.exec(`UPDATE cotizaciones SET folio = ? WHERE id = ?`, this.siguienteFolio(), f.id);
        }
        salida.folios_asignados = sinFolio.length;
      }

      // Los cachés del proyecto NO se importan: se recalculan aquí, una vez
      // por proyecto y no una vez por fila. Importar un caché sería importar
      // una opinión de otra base sobre lo que suman estos movimientos.
      const proyectos = this.sql.exec(`SELECT id FROM proyectos`).toArray() as Fila[];
      for (const p of proyectos) this.recalcularProyecto(String(p.id));
      salida.proyectos_recalculados = proyectos.length;

      // Que un movimiento apunte a un ítem que no existe se dice, no se calla:
      // es justo el enlace que la migración tiene que conservar.
      const conItem = this.sql
        .exec(`SELECT m.id, m.item_id FROM movimientos m WHERE m.item_id IS NOT NULL`)
        .toArray() as Fila[];
      salida.enlaces.movimientos_con_item = conItem.length;
      for (const m of conItem) {
        const hay = this.sql.exec(`SELECT 1 AS x FROM items WHERE id = ?`, m.item_id).toArray().length;
        if (!hay) salida.enlaces.item_que_no_existe.push(String(m.id));
      }

      salida.despues = this.contarFilas();
      salida.sumas = this.sumarDinero();
      salida.sumas_importadas = this.sumarDineroDe(args.filas);
      salida.muestra = this.muestraDeIds();
    };

    if (args.seco) {
      // Se hace el trabajo de verdad y se deshace: es la única manera de que
      // un ensayo mida lo mismo que la corrida buena, incluidos los CHECK del
      // esquema, que solo gritan cuando se escribe.
      const marcha = new Error('__ensayo__');
      try {
        this.ctx.storage.transactionSync(() => {
          trabajo();
          throw marcha;
        });
      } catch (e) {
        if (e !== marcha) throw e;
      }
      return salida;
    }

    this.ctx.storage.transactionSync(trabajo);
    return salida;
  }

  /** Una fila importada. Devuelve `true` si era nueva. */
  private grabarImportada(tabla: Tabla, datos: Fila): boolean {
    const def = DEFS[tabla];
    const id = String(datos.id ?? '').trim();
    if (!id) throw new Error('la fila no trae id');

    const fila: Fila = { ...datos, id };
    // `nombre_norm` lo pone la API, nunca el importador (CONTINUAR §5).
    if (def.cols.nombre_norm) fila.nombre_norm = normalizar(datos.nombre_norm ?? datos.nombre);
    if (def.cols.creado_at && !fila.creado_at) fila.creado_at = ahora();
    if (def.cols.creado_por && !fila.creado_por) fila.creado_por = 'importacion';
    if (def.cols.creado_en_app && !fila.creado_en_app) fila.creado_en_app = 'importacion';

    const cols = Object.keys(fila).filter((c) => c in def.cols);
    const valores = cols.map((c) => this.adentro(def.cols[c], fila[c]));
    const existe = this.sql.exec(`SELECT 1 AS x FROM ${tabla} WHERE id = ?`, id).toArray().length > 0;

    if (existe) {
      const set = cols.filter((c) => c !== 'id');
      if (set.length) {
        this.sql.exec(
          `UPDATE ${tabla} SET ${set.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          ...set.map((c) => this.adentro(def.cols[c], fila[c])),
          id,
        );
      }
      return false;
    }

    this.sql.exec(
      `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      ...valores,
    );
    return true;
  }

  private contarFilas(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of TABLAS) out[t] = (this.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one() as { n: number }).n;
    return out;
  }

  /** Toda la plata que hay en la base, en centavos, columna por columna. Es la
   *  cifra que tiene que cuadrar contra Firestore. Desde 0002 las partidas son
   *  una tabla como las demás y un SUM las alcanza: ya no hay JSON que abrir. */
  private sumarDinero(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const tabla of TABLAS) {
      for (const [col, tipo] of Object.entries(DEFS[tabla].cols)) {
        if (tipo !== 'dinero') continue;
        out[`${tabla}.${col}`] = (this.sql
          .exec(`SELECT COALESCE(SUM(${col}),0) AS s FROM ${tabla}`)
          .one() as { s: number }).s;
      }
    }
    return out;
  }

  /** La plata de un puñado de filas concretas, leída de la base por su id.
   *  Se hace en tandas porque un `IN (?)` con demasiados marcadores no lo
   *  aguanta SQLite, y porque un día habrá más de dos proyectos. */
  private sumarDineroDe(filas: Record<string, Fila[]>): Record<string, number> {
    const out: Record<string, number> = {};
    const TANDA = 200;
    for (const tabla of TABLAS) {
      const ids = (filas[tabla] ?? []).map((f) => String(f.id ?? '')).filter(Boolean);
      if (!ids.length) continue;
      for (const [col, tipo] of Object.entries(DEFS[tabla].cols)) {
        if (tipo !== 'dinero') continue;
        let suma = 0;
        for (let i = 0; i < ids.length; i += TANDA) {
          const tanda = ids.slice(i, i + TANDA);
          suma += (this.sql
            .exec(`SELECT COALESCE(SUM(${col}),0) AS s FROM ${tabla} WHERE id IN (${tanda.map(() => '?').join(',')})`, ...tanda)
            .one() as { s: number }).s;
        }
        out[`${tabla}.${col}`] = suma;
      }
    }
    return out;
  }

  /** Tres ids por tabla, releídos de la base. Para poder enseñar el mismo id
   *  de los dos lados en vez de afirmarlo. */
  private muestraDeIds(): Array<{ tabla: string; id: string }> {
    const out: Array<{ tabla: string; id: string }> = [];
    for (const t of TABLAS) {
      for (const f of this.sql.exec(`SELECT id FROM ${t} LIMIT 3`).toArray() as Fila[]) {
        out.push({ tabla: t, id: String(f.id) });
      }
    }
    return out;
  }

  /** Cuántas filas y cuánto dinero hay ahora. Lo lee el reporte de cuadre sin
   *  tener que importar nada. */
  conteos(): { filas: Record<string, number>; sumas: Record<string, number> } {
    return { filas: this.contarFilas(), sumas: this.sumarDinero() };
  }

  conteosQuell(): Record<string, number> { return this.contarTablas(TABLAS_QUELL); }
  conteosRoster(): Record<string, number> { return this.contarTablas(TABLAS_ROSTER); }

  private contarTablas(tablas: readonly string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of tablas) out[t] = (this.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one() as { n: number }).n;
    return out;
  }


  /* ─────────────── órdenes de compra (0008) ───────────────
   * Encargo de dash101 del 19-sep. Lo que está aquí adentro y no en el Worker
   * es lo que tiene que pasar TODO O NADA: pagar una orden crea el egreso,
   * la liga, deja el evento y recalcula los cachés del proyecto. Un solo hilo
   * por empresa, así que aquí no hay carreras ni transacciones distribuidas.
   *
   * Los permisos NO están aquí: se resuelven en el Worker, antes de llegar
   * (§7). Lo que sí está es la regla de negocio —una orden pagada no se
   * vuelve a pagar—, porque eso no es un permiso: es la verdad de la base.
   */

  /** La fila de `personal` de un usuario de la suite, si la tiene. Un socio o
   *  la oficina pueden no estar en `personal` y aun así pedir compras. */
  personalDeUsuario(usuario_id: string): Fila | null {
    const f = this.sql.exec(`SELECT * FROM personal WHERE usuario_id = ? LIMIT 1`, usuario_id).toArray()[0];
    return (f as Fila) ?? null;
  }

  /* Las tablas de 0008 y 0009 NO están en DEFS: no salen por el CRUD
   * genérico, así que `obtener()` no las conoce (usa DEFS para saber qué
   * columna es booleana o JSON). Este lector hace lo mismo para ellas, y de
   * paso deja dicho qué columnas son 0/1 en SQLite y true/false hacia
   * afuera: una pantalla que recibe `1` y espera `true` pinta la casilla al
   * revés, y eso no truena, sólo miente. */
  private static readonly BOOLS_INTERNAS: Record<string, readonly string[]> = {
    ordenes: ['con_factura', 'urgente'],
  };

  private filaInterna(tabla: string, f: Fila | undefined | null): Fila | null {
    if (!f) return null;
    const bools = OrgDB.BOOLS_INTERNAS[tabla] ?? [];
    const out: Fila = { ...f };
    for (const b of bools) if (out[b] !== undefined && out[b] !== null) out[b] = out[b] === 1 || out[b] === true;
    return out;
  }

  private leerInterna(tabla: string, id: string): Fila | null {
    return this.filaInterna(tabla, this.sql.exec(`SELECT * FROM ${tabla} WHERE id = ?`, id).toArray()[0] as Fila | undefined);
  }

  private leerInternas(tabla: string, filas: Fila[]): Fila[] {
    return filas.map((f) => this.filaInterna(tabla, f)!);
  }

  /** La fila de `personal` de un usuario, creándola si no la tiene.
   *
   *  Hace falta porque «contador» es una etiqueta de `personal` y hay gente
   *  de la empresa que NO está en `personal`: esa tabla la llenan roster101 y
   *  quell101, y una empresa que sólo usa dash101 no tiene ninguna fila. Sin
   *  esto, la decisión de Mike —«se le asigna a cualquier miembro, y el dueño
   *  y el administrador se marcan los dos»— no se podría cumplir en la mitad
   *  de las empresas.
   *
   *  Crea lo mínimo: nombre, correo y el enlace al usuario. No inventa
   *  puesto ni permisos de otras apps. */
  asegurarPersonal(args: { usuario_id: string; nombre: string; correo?: string | null }): Fila {
    const ya = this.sql.exec(`SELECT * FROM personal WHERE usuario_id = ? LIMIT 1`, args.usuario_id).toArray()[0];
    if (ya) return ya as Fila;
    const id = ulid();
    this.sql.exec(
      `INSERT INTO personal (id, nombre, nombre_norm, correo, activo, usuario_id, creado_en_app, creado_at)
       VALUES (?,?,?,?,1,?,'dash101',?)`,
      id, args.nombre, normalizar(args.nombre), args.correo ?? null, args.usuario_id, ahora(),
    );
    return this.obtener('personal', id)!;
  }

  /** ¿Este usuario puede pagar? Lo dice su etiqueta, no su rol. */
  esContador(usuario_id: string): boolean {
    const f = this.sql
      .exec(`SELECT es_contador FROM personal WHERE usuario_id = ? LIMIT 1`, usuario_id)
      .toArray()[0] as { es_contador: number } | undefined;
    return !!f && f.es_contador === 1;
  }

  /** Enciende o apaga la etiqueta de contador y lo deja apuntado. Quién puede
   *  llamarla lo decide el Worker (sólo el dueño). */
  marcarContador(args: { personal_id: string; valor: boolean; quien_usuario_id: string; quien_nombre?: string | null }): Fila | null {
    const persona = this.sql.exec(`SELECT id, nombre FROM personal WHERE id = ?`, args.personal_id).toArray()[0] as Fila | undefined;
    if (!persona) return null;
    this.sql.exec(`UPDATE personal SET es_contador = ? WHERE id = ?`, args.valor ? 1 : 0, args.personal_id);
    this.apuntarOrden({
      orden_id: null,
      que: 'contador',
      quien_usuario_id: args.quien_usuario_id,
      quien_nombre: args.quien_nombre ?? null,
      sobre_personal_id: args.personal_id,
      nota: args.valor ? `${persona.nombre} ya puede pagar órdenes` : `${persona.nombre} ya no puede pagar órdenes`,
    });
    return this.obtener('personal', args.personal_id);
  }

  private apuntarOrden(e: {
    orden_id: string | null; que: string; quien_usuario_id: string;
    quien_nombre?: string | null; sobre_personal_id?: string | null; nota?: string | null;
  }): void {
    this.sql.exec(
      `INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts)
       VALUES (?,?,?,?,?,?,?,?)`,
      ulid(), e.orden_id, e.que, e.quien_usuario_id, e.quien_nombre ?? null,
      e.sobre_personal_id ?? null, e.nota ?? null, ahora(),
    );
  }

  /** El desglose: se captura el TOTAL y la suite lo separa.
   *
   *  Se parte del total hacia atrás —subtotal = total / (1 + tasa)— y el IVA
   *  es la resta, nunca otra multiplicación. Así `subtotal + iva` da el total
   *  exacto siempre, sin un peso perdido por redondeo. $1,160 al 16 % da
   *  1 000 00 y 160 00, que es justo lo que pidió la prueba del encargo.
   *
   *  Sin factura NO se inventa un desglose: subtotal es el total y el IVA es
   *  cero, para que la suma siga cuadrando y nada entre al IVA del mes. */
  private desglosar(monto: number, con_factura: boolean, tasa: number, dados?: { subtotal?: number; iva?: number }):
    { subtotal: number; iva: number; tasa_iva: number } | { error: string } {
    if (!con_factura) return { subtotal: monto, iva: 0, tasa_iva: 0 };
    if (dados && (dados.subtotal !== undefined || dados.iva !== undefined)) {
      const subtotal = Math.round(Number(dados.subtotal ?? 0));
      const iva = Math.round(Number(dados.iva ?? 0));
      if (subtotal < 0 || iva < 0) return { error: 'desglose_negativo' };
      if (subtotal + iva !== monto) return { error: 'desglose_no_cuadra' };
      return { subtotal, iva, tasa_iva: subtotal > 0 ? Math.round((iva * 10000) / subtotal) : 0 };
    }
    const t = Number.isFinite(tasa) && tasa >= 0 ? Math.round(tasa) : 1600;
    const subtotal = Math.round((monto * 10000) / (10000 + t));
    return { subtotal, iva: monto - subtotal, tasa_iva: t };
  }

  crearOrden(args: {
    negocio_id: string; solicitante_usuario_id: string; solicitante_id?: string | null;
    solicitante_correo?: string | null; solicitante_nombre?: string | null;
    proveedor_id?: string | null; proveedor_nombre?: string | null;
    proyecto_id?: string | null; partida_id?: string | null;
    concepto: string; monto: number; moneda?: string;
    con_factura?: boolean; subtotal?: number; iva?: number; tasa_iva?: number;
    fecha_maxima_pago?: string | null; urgente?: boolean;
  }): Fila | { error: string; detalle?: unknown } {
    const monto = Math.round(Number(args.monto));
    if (!Number.isFinite(monto) || monto <= 0) return { error: 'monto_invalido' };
    if (!String(args.concepto ?? '').trim()) return { error: 'falta_concepto' };
    const d = this.desglosar(monto, !!args.con_factura, Number(args.tasa_iva ?? 1600), { subtotal: args.subtotal, iva: args.iva });
    if ('error' in d) return { error: d.error, detalle: { monto, subtotal: args.subtotal, iva: args.iva } };

    const id = ulid();
    const folio = `OC-${String(this.apartarNumero('OC')).padStart(6, '0')}`;
    const t = ahora();
    this.sql.exec(
      `INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, solicitante_id, solicitante_correo,
        solicitante_nombre, proveedor_id, proveedor_nombre, proyecto_id, partida_id, concepto, monto, moneda,
        con_factura, subtotal, iva, tasa_iva, fecha_maxima_pago, urgente, estado, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'en_buzon',?)`,
      id, args.negocio_id, folio, args.solicitante_usuario_id, args.solicitante_id ?? null,
      args.solicitante_correo ?? null, args.solicitante_nombre ?? null,
      args.proveedor_id ?? null, args.proveedor_nombre ?? null,
      args.proyecto_id ?? null, args.partida_id ?? null,
      String(args.concepto).trim(), monto, args.moneda ?? 'MXN',
      args.con_factura ? 1 : 0, d.subtotal, d.iva, d.tasa_iva,
      args.fecha_maxima_pago ?? null, args.urgente ? 1 : 0, t,
    );
    this.apuntarOrden({
      orden_id: id, que: 'creada', quien_usuario_id: args.solicitante_usuario_id,
      quien_nombre: args.solicitante_nombre ?? null, nota: `${args.concepto} · ${args.proveedor_nombre ?? 'sin proveedor'}`,
    });
    this.avisar({ t: 'orden.nueva', id, folio, monto } as unknown as Aviso, 'dinero');
    return this.leerInterna('ordenes', id)!;
  }

  /** Lo que ve quien pidió: SÓLO lo suyo. El filtro va aquí y no en la
   *  pantalla; una pantalla que filtra es una pantalla que se puede saltar. */
  misOrdenes(usuario_id: string, negocio_id?: string | null): Fila[] {
    // El negocio se filtra aquí y no en la pantalla: dash101 trabaja con un
    // negocio activo a la vez, y una lista que mezcle dos negocios enseña
    // números de otro lado sin decirlo.
    const filas = negocio_id
      ? this.sql.exec(`SELECT * FROM ordenes WHERE solicitante_usuario_id = ? AND negocio_id = ? ORDER BY creado_at DESC`, usuario_id, negocio_id).toArray() as Fila[]
      : this.sql.exec(`SELECT * FROM ordenes WHERE solicitante_usuario_id = ? ORDER BY creado_at DESC`, usuario_id).toArray() as Fila[];
    return this.leerInternas('ordenes', filas);
  }

  /** El buzón del contador: lo que vence primero, arriba. Las que ya vencieron
   *  van antes que todo, que es como se lee una bandeja de pagos. */
  buzon(hoy?: string, negocio_id?: string | null): { filas: Fila[]; total: number; vence_esta_semana: number; vencidas: number } {
    const dia = (hoy ?? ahora()).slice(0, 10);
    // Con `negocio_id`, el buzón y sus TOTALES son de ese negocio. Sin él,
    // de toda la empresa. Los totales tienen que salir de la misma consulta
    // que la lista o el número de arriba contradice a los renglones de
    // abajo, que ya fue un defecto real el 7-sep.
    const orden = `ORDER BY (fecha_maxima_pago IS NULL), fecha_maxima_pago ASC, creado_at ASC`;
    const filas = this.leerInternas('ordenes', (negocio_id
      ? this.sql.exec(`SELECT * FROM ordenes WHERE estado = 'en_buzon' AND negocio_id = ? ${orden}`, negocio_id)
      : this.sql.exec(`SELECT * FROM ordenes WHERE estado = 'en_buzon' ${orden}`)
    ).toArray() as Fila[]);
    const enOchoDias = new Date(Date.parse(`${dia}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
    let total = 0, semana = 0, vencidas = 0;
    for (const f of filas) {
      const m = Number(f.monto || 0);
      total += m;
      const v = f.fecha_maxima_pago ? String(f.fecha_maxima_pago) : null;
      if (v && v < dia) { vencidas++; semana += m; } else if (v && v <= enOchoDias) semana += m;
    }
    return { filas, total, vence_esta_semana: semana, vencidas };
  }

  /** Una orden con toda su historia y sus archivos. */
  /** Una orden con su historia y sus papeles.
   *
   *  Los papeles son DOS montones y los dos importan: la cotización, que
   *  cuelga de la orden, y el comprobante del pago, que cuelga del
   *  movimiento —ahí lo sube quien paga—. Quien pidió la compra necesita el
   *  segundo para reclamarle al proveedor, así que salen juntos, cada uno
   *  diciendo de dónde viene en `de`. Buscarlos por separado obligaría a la
   *  pantalla a saber que el comprobante vive colgado de otra tabla. */
  verOrden(id: string): { orden: Fila; eventos: Fila[]; archivos: Fila[] } | null {
    const orden = this.leerInterna('ordenes', id);
    if (!orden) return null;
    const papeles = (tabla: string, de_id: string, de: 'orden' | 'pago') =>
      (this.sql.exec(`SELECT * FROM archivos WHERE de_tabla = ? AND de_id = ? ORDER BY creado_at`, tabla, de_id)
        .toArray() as Fila[]).map((f) => ({ ...f, de }));
    const archivos = papeles('ordenes', id, 'orden');
    if (orden.movimiento_id) archivos.push(...papeles('movimientos', String(orden.movimiento_id), 'pago'));
    return {
      orden,
      eventos: this.sql.exec(`SELECT * FROM orden_eventos WHERE orden_id = ? ORDER BY ts`, id).toArray() as Fila[],
      archivos,
    };
  }

  /** Pagar: TODO O NADA.
   *
   *  Crea el egreso, lo liga, deja el evento, recalcula los cachés del
   *  proyecto y de la partida, y deja la orden en `pagada`. Si algo truena a
   *  la mitad no queda ni medio egreso.
   *
   *  Una orden que no está en el buzón NO se paga: es lo que impide el doble
   *  egreso cuando alguien pica dos veces o se le va el dedo en el celular. */
  pagarOrden(args: {
    id: string; cuenta_id: string; fecha?: string; quien_usuario_id: string; quien_nombre?: string | null;
    nota?: string | null; crear_partida?: boolean;
  }): { ok: true; orden: Fila; movimiento: Fila; partida_id: string | null } | { error: string; detalle?: unknown } {
    const orden = this.leerInterna('ordenes', args.id);
    if (!orden) return { error: 'no_encontrado' };
    if (orden.estado !== 'en_buzon') return { error: 'orden_no_esta_en_buzon', detalle: { estado: orden.estado } };
    const cuenta = this.sql.exec(`SELECT id FROM cuentas WHERE id = ?`, String(args.cuenta_id)).toArray()[0];
    if (!cuenta) return { error: 'cuenta_desconocida', detalle: { cuenta_id: args.cuenta_id } };

    const mov_id = ulid();
    const t = ahora();
    const fecha = (args.fecha ?? t).slice(0, 10);
    let partida_id = orden.partida_id ? String(orden.partida_id) : null;

    this.ctx.storage.transactionSync(() => {
      /* Con proyecto y sin partida que le quede, se crea la partida por el
       * monto de la orden. El `compromiso` del proyecto sube ese monto una
       * sola vez, porque lo recalcula `recalcularProyecto` sumando partidas.
       * Con partida existente NO se toca `monto_acordado`: ya estaba
       * comprometido, y subirlo lo contaría dos veces. */
      if (orden.proyecto_id && !partida_id && args.crear_partida !== false) {
        partida_id = ulid();
        this.sql.exec(
          `INSERT INTO partidas (id, proyecto_id, proveedor_id, proveedor_nombre, concepto, monto_acordado, creado_at)
           VALUES (?,?,?,?,?,?,?)`,
          partida_id, orden.proyecto_id, orden.proveedor_id ?? null, orden.proveedor_nombre ?? null,
          orden.concepto, Number(orden.monto), t,
        );
        this.sql.exec(`UPDATE ordenes SET partida_id = ? WHERE id = ?`, partida_id, args.id);
      }

      this.sql.exec(
        `INSERT INTO movimientos (id, negocio_id, tipo, monto, fecha, cuenta_id, proyecto_id,
          contraparte_tipo, contraparte_id, contraparte_nombre, descripcion, categoria, creado_por, creado_at,
          facturado, requiere_factura, subtotal, iva, tasa_iva)
         VALUES (?,?,'egreso',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        mov_id, orden.negocio_id, Number(orden.monto), fecha, args.cuenta_id, orden.proyecto_id ?? null,
        orden.proveedor_id ? 'proveedor' : 'otro', orden.proveedor_id ?? null, orden.proveedor_nombre ?? null,
        `${orden.folio} · ${orden.concepto}`, 'orden_de_compra', args.quien_usuario_id, t,
        /* `facturado` arranca en 0 aunque la orden diga «con factura»: la
         * marca dice que YA LLEGÓ el CFDI, no que se espera. La factura casi
         * siempre llega después, y es justo lo que persigue la lista de
         * pendientes de factura.
         *
         * `requiere_factura` es la otra mitad, y es la que dice que se
         * espera. Antes del contrato 0.25.0 esa espera se leía de
         * `ordenes.con_factura` con un JOIN, así que aquí no había nada que
         * escribir; ahora vive en el movimiento —para que un INGRESO, que no
         * tiene orden de compra, también pueda estar pendiente—, y hay que
         * copiarla al pagar o el pago nuevo nace fuera de la lista. Es
         * exactamente lo que atrapó la prueba 20 al subir la migración. */
        0, Number(orden.con_factura ?? 0) ? 1 : 0,
        Number(orden.subtotal ?? 0), Number(orden.iva ?? 0), Number(orden.tasa_iva ?? 0),
      );
      this.sql.exec(
        `UPDATE ordenes SET estado = 'pagada', movimiento_id = ?, pagada_at = ?, pagada_por = ?, actualizado_at = ? WHERE id = ?`,
        mov_id, t, args.quien_usuario_id, t, args.id,
      );
      this.apuntarOrden({
        orden_id: args.id, que: 'pagada', quien_usuario_id: args.quien_usuario_id,
        quien_nombre: args.quien_nombre ?? null, nota: args.nota ?? null,
      });
    });

    if (orden.proyecto_id) this.recalcularProyecto(String(orden.proyecto_id));
    this.avisar({ t: 'orden.pagada', id: args.id, folio: orden.folio } as unknown as Aviso, 'dinero');
    return {
      ok: true,
      orden: this.leerInterna('ordenes', args.id)!,
      movimiento: this.obtener('movimientos', mov_id)!,
      partida_id,
    };
  }

  /** Devolver para corregir, o rechazar de plano. El motivo es obligatorio:
   *  una orden que vuelve sin decir por qué se vuelve a mandar igual. */
  resolverOrden(args: { id: string; que: 'devuelta' | 'rechazada'; nota: string; quien_usuario_id: string; quien_nombre?: string | null }):
    Fila | { error: string; detalle?: unknown } {
    const orden = this.leerInterna('ordenes', args.id);
    if (!orden) return { error: 'no_encontrado' };
    if (orden.estado !== 'en_buzon') return { error: 'orden_no_esta_en_buzon', detalle: { estado: orden.estado } };
    if (!String(args.nota ?? '').trim()) return { error: 'falta_motivo' };
    this.sql.exec(
      `UPDATE ordenes SET estado = ?, nota_contador = ?, actualizado_at = ? WHERE id = ?`,
      args.que, String(args.nota).trim(), ahora(), args.id,
    );
    this.apuntarOrden({
      orden_id: args.id, que: args.que, quien_usuario_id: args.quien_usuario_id,
      quien_nombre: args.quien_nombre ?? null, nota: String(args.nota).trim(),
    });
    return this.leerInterna('ordenes', args.id)!;
  }

  /** El solicitante corrige su orden devuelta y vuelve al buzón. MISMO folio y
   *  toda su historia: una orden corregida no es otra orden. */
  corregirOrden(args: {
    id: string; quien_usuario_id: string; quien_nombre?: string | null;
    cambios: Record<string, unknown>;
  }): Fila | { error: string; detalle?: unknown } {
    const orden = this.leerInterna('ordenes', args.id);
    if (!orden) return { error: 'no_encontrado' };
    if (orden.estado !== 'devuelta') return { error: 'orden_no_esta_devuelta', detalle: { estado: orden.estado } };

    const c = args.cambios ?? {};
    const monto = c.monto !== undefined ? Math.round(Number(c.monto)) : Number(orden.monto);
    if (!Number.isFinite(monto) || monto <= 0) return { error: 'monto_invalido' };
    const con_factura = c.con_factura !== undefined ? !!c.con_factura : orden.con_factura === 1;
    const d = this.desglosar(monto, con_factura, Number(c.tasa_iva ?? orden.tasa_iva ?? 1600),
      { subtotal: c.subtotal as number | undefined, iva: c.iva as number | undefined });
    if ('error' in d) return { error: d.error };

    const campos: Record<string, unknown> = {
      monto, con_factura: con_factura ? 1 : 0, subtotal: d.subtotal, iva: d.iva, tasa_iva: d.tasa_iva,
      estado: 'en_buzon', nota_contador: null, actualizado_at: ahora(),
    };
    for (const k of ['concepto', 'proveedor_id', 'proveedor_nombre', 'proyecto_id', 'partida_id', 'fecha_maxima_pago', 'urgente'] as const) {
      if (c[k] !== undefined) campos[k] = k === 'urgente' ? (c[k] ? 1 : 0) : (c[k] as string | null);
    }
    const llaves = Object.keys(campos);
    this.sql.exec(
      `UPDATE ordenes SET ${llaves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      ...(llaves.map((k) => campos[k]) as SqlStorageValue[]), args.id,
    );
    this.apuntarOrden({
      orden_id: args.id, que: 'corregida', quien_usuario_id: args.quien_usuario_id,
      quien_nombre: args.quien_nombre ?? null, nota: 'corregida y de vuelta al buzón',
    });
    return this.leerInterna('ordenes', args.id)!;
  }


  /* ─────────────── contabilidad fiscal (0009) ───────────────
   * No hay dos contabilidades. Hay una lista de movimientos y cada uno dice
   * si es fiscal. Lo de aquí es: capturar facturas, ligarlas a los pagos que
   * ya existen, y sacar los tres números que se miran cada mes.
   *
   * Una advertencia que va también en la pantalla: esto ORDENA la información
   * fiscal, no presenta declaraciones ni sustituye al contador. Los números
   * salen de lo que se capture.
   */

  crearCfdi(args: {
    negocio_id: string; uuid: string; rfc?: string | null; razon_social?: string | null;
    tipo: 'ingreso' | 'egreso'; subtotal?: number; iva?: number; retenciones?: number; total?: number;
    fecha: string; forma_pago?: string | null; creado_por: string;
  }): Fila | { error: string; detalle?: unknown } {
    const uuid = String(args.uuid ?? '').trim().toUpperCase();
    if (!uuid) return { error: 'falta_uuid' };
    if (args.tipo !== 'ingreso' && args.tipo !== 'egreso') return { error: 'tipo_invalido' };
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(args.fecha ?? ''))) return { error: 'fecha_invalida' };
    // Capturar dos veces la misma factura es el error más fácil de cometer y
    // el que más ensucia el IVA del mes. Se caza antes de escribir, para
    // poder decir cuál es la que ya estaba.
    const ya = this.sql.exec(`SELECT id, fecha FROM cfdi WHERE uuid = ?`, uuid).toArray()[0] as Fila | undefined;
    if (ya) return { error: 'uuid_repetido', detalle: { uuid, ya_capturada: ya.id, fecha: ya.fecha } };

    const n = (v: unknown) => Math.round(Number(v ?? 0)) || 0;
    const subtotal = n(args.subtotal), iva = n(args.iva), retenciones = n(args.retenciones);
    const total = args.total !== undefined ? n(args.total) : subtotal + iva - retenciones;
    const id = ulid();
    this.sql.exec(
      `INSERT INTO cfdi (id, negocio_id, uuid, rfc, razon_social, tipo, subtotal, iva, retenciones, total,
        fecha, forma_pago, estado, creado_por, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'vigente',?,?)`,
      id, args.negocio_id, uuid, args.rfc ?? null, args.razon_social ?? null, args.tipo,
      subtotal, iva, retenciones, total, String(args.fecha).slice(0, 10), args.forma_pago ?? null,
      args.creado_por, ahora(),
    );
    return this.leerInterna('cfdi', id)!;
  }

  /** Liga una factura a un pago que YA EXISTE, y con eso el movimiento se
   *  vuelve fiscal. Éste es el camino que una segunda contabilidad no puede
   *  recorrer: la factura casi siempre llega después del pago. */
  ligarCfdi(args: { cfdi_id: string; movimiento_id: string; monto_aplicado?: number }):
    { ok: true; cfdi: Fila; movimiento: Fila; aplicado_total: number } | { error: string; detalle?: unknown } {
    const cfdi = this.leerInterna('cfdi', args.cfdi_id);
    if (!cfdi) return { error: 'cfdi_desconocido' };
    const mov = this.obtener('movimientos', args.movimiento_id);
    if (!mov) return { error: 'movimiento_desconocido' };
    const aplicado = args.monto_aplicado !== undefined
      ? Math.round(Number(args.monto_aplicado))
      : Math.min(Number(cfdi.total || 0), Number(mov.monto || 0));
    if (!Number.isFinite(aplicado) || aplicado <= 0) return { error: 'monto_invalido' };

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO cfdi_movimientos (cfdi_id, movimiento_id, monto_aplicado, creado_at) VALUES (?,?,?,?)
         ON CONFLICT(cfdi_id, movimiento_id) DO UPDATE SET monto_aplicado = excluded.monto_aplicado`,
        args.cfdi_id, args.movimiento_id, aplicado, ahora(),
      );
      /* El movimiento queda facturado. `uuid_cfdi` y `fecha_cfdi` se copian
       * SÓLO cuando es la única factura de ese pago: con dos o más, un solo
       * hueco no puede decir la verdad, y la verdad completa está en la
       * tabla de liga. */
      const cuantas = (this.sql
        .exec(`SELECT COUNT(*) AS n FROM cfdi_movimientos WHERE movimiento_id = ?`, args.movimiento_id)
        .one() as { n: number }).n;
      if (cuantas === 1) {
        this.sql.exec(
          `UPDATE movimientos SET facturado = 1, uuid_cfdi = ?, fecha_cfdi = ?, subtotal = ?, iva = ?, retenciones = ? WHERE id = ?`,
          cfdi.uuid, cfdi.fecha, Number(cfdi.subtotal || 0), Number(cfdi.iva || 0), Number(cfdi.retenciones || 0), args.movimiento_id,
        );
      } else {
        this.sql.exec(`UPDATE movimientos SET facturado = 1, uuid_cfdi = NULL WHERE id = ?`, args.movimiento_id);
      }
    });

    const aplicado_total = (this.sql
      .exec(`SELECT COALESCE(SUM(monto_aplicado),0) AS s FROM cfdi_movimientos WHERE cfdi_id = ?`, args.cfdi_id)
      .one() as { s: number }).s;
    return { ok: true, cfdi: this.leerInterna('cfdi', args.cfdi_id)!, movimiento: this.obtener('movimientos', args.movimiento_id)!, aplicado_total };
  }

  /** Cancelar una factura. NO se borra: sale del IVA del mes y se queda a la
   *  vista en su lista. Un renglón borrado es un hueco que nadie explica. */
  cancelarCfdi(id: string): Fila | { error: string } {
    const cfdi = this.leerInterna('cfdi', id);
    if (!cfdi) return { error: 'cfdi_desconocido' };
    const t = ahora();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE cfdi SET estado = 'cancelada', cancelada_at = ?, actualizado_at = ? WHERE id = ?`, t, t, id);
      // Los pagos que sólo esa factura respaldaba vuelven a estar sin
      // facturar: el pago ocurrió, la factura ya no vale.
      for (const l of this.sql.exec(`SELECT movimiento_id FROM cfdi_movimientos WHERE cfdi_id = ?`, id).toArray() as Fila[]) {
        const vivas = (this.sql
          .exec(`SELECT COUNT(*) AS n FROM cfdi_movimientos lm JOIN cfdi c ON c.id = lm.cfdi_id
                 WHERE lm.movimiento_id = ? AND c.estado = 'vigente'`, l.movimiento_id)
          .one() as { n: number }).n;
        if (vivas === 0) {
          this.sql.exec(`UPDATE movimientos SET facturado = 0, uuid_cfdi = NULL, fecha_cfdi = NULL WHERE id = ?`, l.movimiento_id);
        }
      }
    });
    return this.leerInterna('cfdi', id)!;
  }

  /** Marcar un movimiento como facturado a mano, con su desglose, sin capturar
   *  el CFDI completo. Es la puerta rápida para lo que ya está conciliado. */
  marcarFacturado(args: {
    movimiento_id: string; facturado: boolean; subtotal?: number; iva?: number; tasa_iva?: number;
    retenciones?: number; uuid_cfdi?: string | null; fecha_cfdi?: string | null; forma_pago?: string | null;
  }): Fila | { error: string; detalle?: unknown } {
    const mov = this.obtener('movimientos', args.movimiento_id);
    if (!mov) return { error: 'movimiento_desconocido' };
    if (!args.facturado) {
      this.sql.exec(
        `UPDATE movimientos SET facturado = 0, uuid_cfdi = NULL, fecha_cfdi = NULL WHERE id = ?`,
        args.movimiento_id,
      );
      return this.obtener('movimientos', args.movimiento_id)!;
    }
    const monto = Number(mov.monto || 0);
    const d = this.desglosar(monto, true, Number(args.tasa_iva ?? 1600), { subtotal: args.subtotal, iva: args.iva });
    if ('error' in d) return { error: d.error, detalle: { monto } };
    this.sql.exec(
      `UPDATE movimientos SET facturado = 1, subtotal = ?, iva = ?, tasa_iva = ?, retenciones = ?,
        uuid_cfdi = ?, fecha_cfdi = ?, forma_pago = COALESCE(?, forma_pago) WHERE id = ?`,
      d.subtotal, d.iva, d.tasa_iva, Math.round(Number(args.retenciones ?? 0)) || 0,
      args.uuid_cfdi ?? null, args.fecha_cfdi ?? null, args.forma_pago ?? null, args.movimiento_id,
    );
    return this.obtener('movimientos', args.movimiento_id)!;
  }

  /** El IVA del mes: lo que pagaste a proveedores contra lo que cobraste a
   *  clientes, y la diferencia. Ese número decide cuánto enteras.
   *
   *  Sale de los CFDI vigentes, NO de los movimientos: el IVA se acredita con
   *  la factura, y una factura puede cubrir varios pagos. Una cancelada no
   *  cuenta, por eso el filtro de estado.
   *
   *  El acreditable resta las retenciones: lo que te retuvieron ya no lo
   *  acreditas tú. Es una simplificación —aquí no se separa retención de IVA
   *  de retención de ISR— y está dicha a propósito, porque el número vale lo
   *  que valga lo capturado. */
  ivaDelMes(desde: string, hasta: string, negocio_id?: string | null): {
    desde: string; hasta: string;
    trasladado: number; acreditable: number; retenciones: number; a_enterar: number;
    facturas: { emitidas: number; recibidas: number; canceladas: number };
  } {
    const d = String(desde).slice(0, 10), h = String(hasta).slice(0, 10);
    // El RFC vive en el negocio: un IVA que sume dos negocios no es el IVA
    // de ninguno de los dos, y es el número con el que se entera al SAT.
    const deNegocio = negocio_id ? ' AND negocio_id = ?' : '';
    const conNeg = (...args: SqlStorageValue[]) => (negocio_id ? [...args, negocio_id] : args);
    const suma = (tipo: string) => this.sql
      .exec(`SELECT COALESCE(SUM(iva),0) AS iva, COALESCE(SUM(retenciones),0) AS ret, COUNT(*) AS n
             FROM cfdi WHERE estado = 'vigente' AND tipo = ? AND fecha >= ? AND fecha <= ?${deNegocio}`, ...conNeg(tipo, d, h))
      .one() as { iva: number; ret: number; n: number };
    const ing = suma('ingreso'), egr = suma('egreso');
    const canceladas = (this.sql
      .exec(`SELECT COUNT(*) AS n FROM cfdi WHERE estado = 'cancelada' AND fecha >= ? AND fecha <= ?${deNegocio}`, ...conNeg(d, h))
      .one() as { n: number }).n;
    const acreditable = egr.iva - egr.ret;
    return {
      desde: d, hasta: h,
      trasladado: ing.iva, acreditable, retenciones: egr.ret,
      a_enterar: ing.iva - acreditable,
      facturas: { emitidas: ing.n, recibidas: egr.n, canceladas },
    };
  }

  /** Lo facturado contra lo real. La diferencia es lo que anda fuera. */
  facturadoVsReal(desde: string, hasta: string, negocio_id?: string | null): {
    desde: string; hasta: string;
    ingresos: { total: number; facturado: number; fuera: number };
    egresos: { total: number; facturado: number; fuera: number };
  } {
    const d = String(desde).slice(0, 10), h = String(hasta).slice(0, 10);
    const deNegocio = negocio_id ? ' AND negocio_id = ?' : '';
    const lado = (tipo: string) => {
      const args: SqlStorageValue[] = negocio_id ? [tipo, d, h, negocio_id] : [tipo, d, h];
      const r = this.sql
        .exec(`SELECT COALESCE(SUM(monto),0) AS total,
                      COALESCE(SUM(CASE WHEN facturado = 1 THEN monto ELSE 0 END),0) AS fact
               FROM movimientos WHERE tipo = ? AND fecha >= ? AND fecha <= ?${deNegocio}`, ...args)
        .one() as { total: number; fact: number };
      return { total: r.total, facturado: r.fact, fuera: r.total - r.fact };
    };
    return { desde: d, hasta: h, ingresos: lado('ingreso'), egresos: lado('egreso') };
  }

  /** Pagos que se hicieron esperando factura y cuyo CFDI todavía no llega. Es
   *  la lista que hay que perseguir cada mes. */
  /** Lo que falta facturar, de los dos lados.
   *
   *  Hasta el 20-sep esto empezaba con un `JOIN ordenes`, porque la espera de
   *  la factura vivía en la orden de compra (`con_factura`). Consecuencia: un
   *  INGRESO no podía salir aquí jamás —no tiene orden de compra—, y a Mike
   *  le faltaba justo eso: la lista de lo que cobró y todavía no facturó.
   *
   *  Ahora la espera vive en el movimiento (`requiere_factura`, migración
   *  0012) y la orden es nada más un dato de adorno cuando existe: por eso el
   *  JOIN es LEFT. La 0012 le puso la espera a los pagos de órdenes que hoy
   *  están pendientes, así que la lista de egresos no cambia de contenido. */
  pendientesDeFactura(negocio_id?: string | null, tipo?: string | null): Fila[] {
    const donde: string[] = ['m.requiere_factura = 1', 'm.facturado = 0'];
    const args: SqlStorageValue[] = [];
    if (negocio_id) { donde.push('m.negocio_id = ?'); args.push(negocio_id); }
    if (tipo) { donde.push('m.tipo = ?'); args.push(tipo); }
    return this.sql.exec(
      `SELECT m.*, o.folio AS orden_folio, o.proveedor_nombre AS orden_proveedor
         FROM movimientos m
         LEFT JOIN ordenes o ON o.movimiento_id = m.id
        WHERE ${donde.join(' AND ')}
        ORDER BY m.fecha`,
      ...args,
    ).toArray() as Fila[];
  }

  /** Las facturas de un rango, para la pantalla y para el reporte. */
  listaCfdi(args: { desde?: string; hasta?: string; tipo?: string; estado?: string; negocio_id?: string | null }): Fila[] {
    const donde: string[] = [];
    const vals: SqlStorageValue[] = [];
    if (args.desde) { donde.push('fecha >= ?'); vals.push(String(args.desde).slice(0, 10)); }
    if (args.hasta) { donde.push('fecha <= ?'); vals.push(String(args.hasta).slice(0, 10)); }
    if (args.tipo) { donde.push('tipo = ?'); vals.push(args.tipo); }
    if (args.estado) { donde.push('estado = ?'); vals.push(args.estado); }
    if (args.negocio_id) { donde.push('negocio_id = ?'); vals.push(args.negocio_id); }
    const filtro = donde.length ? ` WHERE ${donde.join(' AND ')}` : '';
    return this.leerInternas('cfdi', this.sql.exec(`SELECT * FROM cfdi${filtro} ORDER BY fecha DESC, creado_at DESC`, ...vals).toArray() as Fila[]);
  }

  /* ─────────────── el cliente es uno solo en las tres apps ───────────────
   * Mike, 20-sep: «cuando creas un nuevo cliente en quote101, es lo mismo que
   * cuando haces uno en quell101 o en dash. El cliente es el mismo en los 3 y
   * debe aparecer en la base de datos de las 3 apps. Si por cualquier cosa se
   * crean en 2 apps diferentes con un nombre diferente, debería haber manera
   * de ligarlo y fusionar los 2 clientes en uno mismo para mejor control. Y si
   * se quiere crear un cliente con el nombre ya existente, preguntar si no te
   * estás refiriendo a X cliente.»
   *
   * Vivir en la misma tabla ya vivían —`clientes` es de la empresa, no de una
   * app—. Lo que faltaba son estas dos: avisar del parecido ANTES de crear, y
   * juntar los dos que ya se crearon.
   */

  /** Los clientes que se parecen a un nombre. La regla se escribe UNA vez y
   *  aquí: mismo nombre normalizado, o uno contenido en el otro («Muebles
   *  Luna» y «Muebles Luna SA de CV»). Menos de tres letras no compara: con
   *  dos, media lista se parece a todo. */
  clientesParecidos(nombre: string, negocio_id?: string | null): Fila[] {
    const n = normalizar(nombre);
    if (n.length < 3) return [];
    const filas = this.sql
      .exec(
        `SELECT * FROM clientes${negocio_id ? ' WHERE negocio_id = ?' : ''} ORDER BY nombre_norm`,
        ...(negocio_id ? [negocio_id] : []),
      )
      .toArray() as Fila[];
    return filas.filter((c) => {
      const o = normalizar(c.nombre_norm || c.nombre);
      return o === n || (o.length >= 3 && (o.includes(n) || n.includes(o)));
    });
  }

  /** Juntar dos clientes en uno. `queda_id` es el que se queda con todo;
   *  `se_va_id` desaparece.
   *
   *  Todo o nada, y por eso vive aquí adentro: si se movieran los proyectos y
   *  fallara al mover los ítems, quedaría un cliente con la mitad de su
   *  historia colgando de un renglón borrado. Un solo hilo por empresa, así
   *  que no hay carreras.
   *
   *  Lo que el que se queda NO tenga —correo, teléfono, RFC, notas, el acceso
   *  al portal— se lo lleva del que se va. Fusionar no puede perder datos: el
   *  que se va casi siempre es el que se capturó en la otra app, y a veces es
   *  el único que trae el correo. */
  fusionarClientes(queda_id: string, se_va_id: string): { ok: true; cliente: Fila; movidos: Record<string, number> } | { error: string; detalle?: unknown } {
    if (queda_id === se_va_id) return { error: 'datos_invalidos', detalle: { motivo: 'son el mismo cliente' } };
    const queda = this.sql.exec(`SELECT * FROM clientes WHERE id = ?`, queda_id).toArray()[0] as Fila | undefined;
    if (!queda) return { error: 'no_encontrado', detalle: { que: 'el cliente que se queda', id: queda_id } };
    const seVa = this.sql.exec(`SELECT * FROM clientes WHERE id = ?`, se_va_id).toArray()[0] as Fila | undefined;
    if (!seVa) return { error: 'no_encontrado', detalle: { que: 'el cliente que se fusiona', id: se_va_id } };

    const cuantos = (sql: string, ...args: SqlStorageValue[]) =>
      Number((this.sql.exec(sql, ...args).toArray()[0] as Fila).n);

    const movidos = {
      proyectos: cuantos(`SELECT COUNT(*) AS n FROM proyectos WHERE cliente_id = ?`, se_va_id),
      items: cuantos(`SELECT COUNT(*) AS n FROM items WHERE cliente_id = ?`, se_va_id),
      cotizaciones: cuantos(`SELECT COUNT(*) AS n FROM cotizaciones WHERE cliente_id = ?`, se_va_id),
      movimientos: cuantos(
        `SELECT COUNT(*) AS n FROM movimientos WHERE contraparte_tipo = 'cliente' AND contraparte_id = ?`, se_va_id),
    };

    this.sql.exec(`UPDATE proyectos SET cliente_id = ? WHERE cliente_id = ?`, queda_id, se_va_id);
    this.sql.exec(`UPDATE items SET cliente_id = ? WHERE cliente_id = ?`, queda_id, se_va_id);
    this.sql.exec(`UPDATE cotizaciones SET cliente_id = ? WHERE cliente_id = ?`, queda_id, se_va_id);
    this.sql.exec(
      `UPDATE movimientos SET contraparte_id = ?, contraparte_nombre = ? WHERE contraparte_tipo = 'cliente' AND contraparte_id = ?`,
      queda_id, String(queda.nombre), se_va_id,
    );

    /* Lo que le falte al que se queda se lo lleva del que se va. `usuario_id`
     * también: si el acceso al portal estaba del otro lado, fusionar no puede
     * dejar al cliente sin poder entrar a ver su estado de cuenta. */
    const hereda: Record<string, unknown> = {};
    for (const campo of ['correo', 'telefono', 'rfc', 'notas', 'usuario_id']) {
      if (!queda[campo] && seVa[campo]) hereda[campo] = seVa[campo];
    }
    if (!queda.portal_activo && seVa.portal_activo) hereda.portal_activo = 1;
    if (Object.keys(hereda).length) {
      const sets = Object.keys(hereda).map((k) => `${k} = ?`).join(', ');
      this.sql.exec(`UPDATE clientes SET ${sets} WHERE id = ?`, ...(Object.values(hereda) as SqlStorageValue[]), queda_id);
    }

    this.sql.exec(`DELETE FROM clientes WHERE id = ?`, se_va_id);
    return { ok: true, cliente: this.obtener('clientes', queda_id) as Fila, movidos };
  }

  /* ─────────────── obras de quell101 y proyectos de dash101 (0010) ───────────────
   * Mike, 20-sep: la obra que se abre en quell101 y el proyecto que se abre
   * en dash101 son la misma casa. Aquí está la liga: listarlas, ponerla y
   * quitarla. Lo que se devuelve va con los nombres de la suite —`nombre`,
   * `cliente`, `estado`— y no con los de quell101 —`name`, `client`,
   * `status`—: una pantalla de dash101 no tiene por qué aprenderse las
   * columnas de otra app para enseñar una lista.
   */

  /** Las obras, con su proyecto si lo tienen. `sueltas` deja sólo las que no
   *  están ligadas, que es lo que dash101 ofrece al crear un proyecto. */
  obras(args: { sueltas?: boolean } = {}): Fila[] {
    const filtro = args.sueltas ? ' WHERE o.proyecto_id IS NULL' : '';
    return this.sql
      .exec(
        `SELECT o.id, o.name AS nombre, o.client AS cliente, o.status AS estado,
                o.created_at AS creado_at, o.proyecto_id,
                p.nombre AS proyecto_nombre, p.negocio_id AS proyecto_negocio_id,
                (SELECT COUNT(*) FROM quell_plans pl WHERE pl.project_id = o.id) AS planos,
                (SELECT COUNT(*) FROM quell_elements e WHERE e.project_id = o.id) AS ubicados
         FROM quell_projects o LEFT JOIN proyectos p ON p.id = o.proyecto_id${filtro}
         ORDER BY o.status, o.name`,
      )
      .toArray() as Fila[];
  }

  /** La obra ligada a un proyecto, si la hay. La pantalla del proyecto la
   *  enseña para poder abrir el plano desde ahí. */
  obraDeProyecto(proyecto_id: string): Fila | null {
    return (this.obras().find((o) => o.proyecto_id === proyecto_id) as Fila) ?? null;
  }

  /** Los ítems vendidos de la obra que todavía NO tienen pieza en un plano.
   *
   *  Mike, 20-sep: «cuando se genera un nuevo proyecto con su cantidad de
   *  ítems, en quell […] deben de aparecer en una lista de "ítems sin
   *  ubicar". Para ir seleccionando y ubicando cada ítem en su lugar.»
   *
   *  Con cantidad 20 y tres ya puestas en el plano, faltan 17: la cuenta la
   *  hace el servidor y no la pantalla, porque dos personas ubicando piezas a
   *  la vez tendrían dos cuentas distintas y las dos se creerían.
   *
   *  Sólo los VENDIDOS: lo que nada más está cotizado no se fabrica todavía,
   *  y llenaría el plano de piezas que quizá nunca se vendan. */
  sinUbicar(obra_id: string): { obra: Fila; items: Fila[] } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    if (!obra.proyecto_id) {
      return { error: 'sin_liga', detalle: { motivo: 'esta obra todavía no está ligada a un proyecto de dash101' } };
    }
    const items = this.sql
      .exec(
        `SELECT i.id, i.nombre, i.descripcion, i.clave, i.tipo, i.monto, i.cantidad, i.fecha_entrega,
                (SELECT COUNT(*) FROM quell_elements e WHERE e.item_id = i.id) AS ubicados
         FROM items i
         WHERE i.proyecto_id = ? AND i.estado = 'vendido'
         ORDER BY i.creado_at`,
        String(obra.proyecto_id),
      )
      .toArray() as Fila[];
    return {
      obra,
      items: items
        .map((i) => ({
          ...i,
          faltan: Math.max(0, Number(i.cantidad ?? 1) - Number(i.ubicados ?? 0)),
          // El precio por pieza, para que la pantalla no divida mal: `monto`
          // es el importe de la línea completa.
          monto_unitario: Number(i.cantidad ?? 1) > 0 ? Math.round(Number(i.monto) / Number(i.cantidad ?? 1)) : Number(i.monto),
        }))
        .filter((i) => i.faltan > 0),
    };
  }

  /** Poner la liga. Se niega si cualquiera de los dos lados ya está ligado a
   *  OTRO: una obra con dos proyectos, o un proyecto con dos obras, deja «el
   *  avance del proyecto» con dos respuestas ciertas al mismo tiempo. Ligar
   *  lo que ya estaba ligado igual no es un error: contesta lo mismo. */
  ligarObra(obra_id: string, proyecto_id: string): { ok: true; obra: Fila } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    const proyecto = this.sql.exec(`SELECT id FROM proyectos WHERE id = ?`, proyecto_id).toArray()[0] as Fila | undefined;
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    if (obra.proyecto_id && obra.proyecto_id !== proyecto_id) {
      return { error: 'ya_ligada', detalle: { que: 'obra', obra_id, proyecto_id: obra.proyecto_id, motivo: 'esa obra ya está ligada a otro proyecto' } };
    }
    const otra = this.sql
      .exec(`SELECT id FROM quell_projects WHERE proyecto_id = ? AND id <> ?`, proyecto_id, obra_id)
      .toArray()[0] as Fila | undefined;
    if (otra) {
      return { error: 'ya_ligada', detalle: { que: 'proyecto', proyecto_id, obra_id: otra.id, motivo: 'ese proyecto ya está ligado a otra obra' } };
    }

    this.sql.exec(`UPDATE quell_projects SET proyecto_id = ? WHERE id = ?`, proyecto_id, obra_id);
    return { ok: true, obra: this.obras().find((o) => o.id === obra_id)! };
  }

  /* ─────────────── los ítems, uno solo de los dos lados (§91) ───────────────
   *
   * Mike, 20-sep: los ítems de una obra en quell101 y los ítems vendidos de
   * su proyecto en dash101 son la misma lista de piezas contada dos veces.
   * Ligar la obra con el proyecto (migración 0010) dijo que son la misma
   * casa; esto dice que son las mismas piezas.
   *
   * Se hace en DOS pasos a propósito —primero se propone, luego se aplica—,
   * que es el mismo modo de las mudanzas de este repositorio. Emparejar
   * piezas por parecido acierta casi siempre y se equivoca a veces, y una
   * equivocación aquí le cuelga el dinero de una pieza a otra. Quien decide
   * mira la propuesta antes de que se escriba nada.
   */

  /** La propuesta: qué se emparejaría con qué, sin tocar nada.
   *
   *  Tres montones, y los tres importan:
   *
   *   · `parejas`  — una pieza del plano y un ítem vendido que se parecen
   *                  tanto que casi seguro son lo mismo. Se emparejan por
   *                  CÓDIGO primero (el código es único dentro de la obra,
   *                  así que si coincide no hay duda) y por nombre después.
   *   · `nuevos`   — piezas del plano sin nada que se les parezca. Se les
   *                  crearía un ítem.
   *   · `sueltos`  — ítems vendidos sin pieza en el plano. NO se tocan: son
   *                  los «ítems sin ubicar», y ubicarlos es poner un punto en
   *                  un plano, que lo hace una persona mirando el dibujo.
   *
   *  Un ítem ya emparejado no vuelve a salir: la propuesta es idempotente y
   *  aplicarla dos veces no duplica nada. */
  itemsDeLaObra(obra_id: string): { obra: Fila; parejas: Fila[]; nuevos: Fila[]; sueltos: Fila[] } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    if (!obra.proyecto_id) {
      return { error: 'sin_liga', detalle: { motivo: 'esta obra todavía no está ligada a un proyecto de dash101' } };
    }
    const proyecto_id = String(obra.proyecto_id);

    const piezas = this.sql
      .exec(`SELECT id, code, name, type FROM quell_elements WHERE project_id = ? AND item_id IS NULL ORDER BY code, name`, obra_id)
      .toArray() as Fila[];
    const libres = this.sql
      .exec(
        `SELECT i.id, i.clave, i.nombre, i.tipo, i.monto, i.cantidad, i.estado
         FROM items i
         WHERE i.proyecto_id = ? AND i.estado <> 'cancelado'
           AND (SELECT COUNT(*) FROM quell_elements e WHERE e.item_id = i.id) < i.cantidad
         ORDER BY i.creado_at`,
        proyecto_id,
      )
      .toArray() as Fila[];

    /* Cuántas piezas de cada ítem quedan por emparejar. Un ítem de cantidad
     * 20 con 3 puestas admite 17 más: emparejar de uno en uno sin llevar la
     * cuenta le colgaría 20 piezas a un ítem de una. */
    const cupo = new Map<string, number>();
    for (const i of libres) {
      const ya = Number(
        (this.sql.exec(`SELECT COUNT(*) AS n FROM quell_elements WHERE item_id = ?`, String(i.id)).toArray()[0] as Fila).n,
      );
      cupo.set(String(i.id), Math.max(0, Number(i.cantidad ?? 1) - ya));
    }

    const porClave = new Map<string, Fila[]>();
    const porNombre = new Map<string, Fila[]>();
    for (const i of libres) {
      if (i.clave) (porClave.get(String(i.clave)) ?? porClave.set(String(i.clave), []).get(String(i.clave))!).push(i);
      const n = normalizar(String(i.nombre ?? ''));
      if (n) (porNombre.get(n) ?? porNombre.set(n, []).get(n)!).push(i);
    }
    const conCupo = (lista: Fila[] | undefined) => lista?.find((i) => (cupo.get(String(i.id)) ?? 0) > 0);

    const parejas: Fila[] = [];
    const nuevos: Fila[] = [];
    for (const pz of piezas) {
      const porCodigo = pz.code ? conCupo(porClave.get(String(pz.code))) : undefined;
      const item = porCodigo ?? conCupo(porNombre.get(normalizar(String(pz.name ?? ''))));
      if (item) {
        cupo.set(String(item.id), (cupo.get(String(item.id)) ?? 1) - 1);
        parejas.push({
          element_id: pz.id, codigo: pz.code, pieza: pz.name, tipo: pz.type,
          item_id: item.id, item_clave: item.clave, item_nombre: item.nombre,
          monto: item.monto, cantidad: item.cantidad, estado: item.estado,
          // Por qué se emparejaron, para que quien decide no tenga que adivinar.
          por: porCodigo ? 'codigo' : 'nombre',
        });
      } else {
        nuevos.push({ element_id: pz.id, codigo: pz.code, pieza: pz.name, tipo: pz.type });
      }
    }
    const emparejados = new Set(parejas.map((p) => String(p.item_id)));
    const sueltos = libres.filter((i) => !emparejados.has(String(i.id)));
    return { obra, parejas, nuevos, sueltos };
  }

  /** Aplicar la propuesta. Lo que no venga en el cuerpo NO se toca.
   *
   *  `ligar` cuelga una pieza del plano de un ítem que ya existe. `crear` le
   *  hace un ítem nuevo a una pieza que no tenía.
   *
   *  El ítem nuevo nace **cotizado y en cero**, y las dos cosas son a
   *  propósito. Una pieza del plano no trae precio: nadie se lo ha puesto.
   *  Nacer «vendido» en cero metería una venta de cero pesos en el precio
   *  del proyecto —`precio_venta` suma los vendidos— y dejaría la proyección
   *  diciendo una cifra que nadie tecleó. Cotizado sale en la lista de
   *  dash101 para ponerle precio, y no mueve un solo peso hasta que alguien
   *  lo decide. */
  fusionarItemsDeLaObra(
    obra_id: string,
    plan: { ligar?: Array<{ element_id: string; item_id: string }>; crear?: string[] },
    contexto: { usuario_id: string },
  ): { ok: true; ligados: number; creados: number; obra: Fila } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT * FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    if (!obra.proyecto_id) return { error: 'sin_liga', detalle: { motivo: 'esta obra todavía no está ligada a un proyecto de dash101' } };
    const proyecto_id = String(obra.proyecto_id);
    const proyecto = this.obtener('proyectos', proyecto_id);
    if (!proyecto) return { error: 'no_encontrado', detalle: { que: 'proyecto', id: proyecto_id } };

    const pieza = (eid: string) =>
      this.sql.exec(`SELECT * FROM quell_elements WHERE id = ? AND project_id = ?`, eid, obra_id).toArray()[0] as Fila | undefined;

    let ligados = 0;
    for (const par of plan.ligar ?? []) {
      const pz = pieza(par.element_id);
      if (!pz) return { error: 'no_encontrado', detalle: { que: 'pieza', id: par.element_id, motivo: 'esa pieza no es de esta obra' } };
      if (pz.item_id) continue; // ya estaba: aplicar dos veces no duplica
      const it = this.sql
        .exec(`SELECT id FROM items WHERE id = ? AND proyecto_id = ?`, par.item_id, proyecto_id)
        .toArray()[0] as Fila | undefined;
      if (!it) return { error: 'no_encontrado', detalle: { que: 'item', id: par.item_id, motivo: 'ese ítem no es del proyecto de esta obra' } };
      this.sql.exec(`UPDATE quell_elements SET item_id = ? WHERE id = ?`, par.item_id, par.element_id);
      ligados++;
    }

    let creados = 0;
    for (const eid of plan.crear ?? []) {
      const pz = pieza(eid);
      if (!pz) return { error: 'no_encontrado', detalle: { que: 'pieza', id: eid, motivo: 'esa pieza no es de esta obra' } };
      if (pz.item_id) continue;
      const item = this.crear(
        'items',
        {
          negocio_id: proyecto.negocio_id, proyecto_id, cliente_id: proyecto.cliente_id,
          clave: pz.code ?? '', nombre: pz.name ?? 'Pieza del plano', tipo: pz.type ?? '',
          monto: 0, cantidad: 1, estado: 'cotizado',
          descripcion: 'Traído del plano de la obra. Falta ponerle precio.',
          origen: { de: 'quell', element_id: pz.id, obra_id },
        } as unknown as Fila,
        { app: 'quell101', usuario_id: contexto.usuario_id },
      );
      this.sql.exec(`UPDATE quell_elements SET item_id = ? WHERE id = ?`, String(item.id), eid);
      creados++;
    }

    return { ok: true, ligados, creados, obra: this.obras().find((o) => o.id === obra_id)! };
  }

  /** El precio de un ítem cambió: se cuenta en la bitácora de cada pieza del
   *  plano que lo cumple.
   *
   *  Va sin persona (`user_id` NULL, migración 0013) y con `kind='precio'`.
   *  No lo escribió alguien de la obra contando lo que hizo: lo escribió el
   *  sistema al ver que el dinero se movió en dash101. Atribuírselo a una
   *  persona de la obra sería una mentira que se lee como verdad tres meses
   *  después, cuando alguien pregunte quién autorizó el cambio.
   *
   *  Si el ítem no está en ningún plano, no hay nada que contar y no se
   *  escribe: una bitácora llena de entradas sin pieza deja de leerse. */
  private huellaDePrecio(item_id: string, antes: number): void {
    const item = this.obtener('items', item_id);
    if (!item) return;
    const ahora_ = Number(item.monto);
    if (!Number.isFinite(ahora_) || ahora_ === antes) return;
    const piezas = this.sql.exec(`SELECT id FROM quell_elements WHERE item_id = ?`, item_id).toArray() as Fila[];
    if (!piezas.length) return;
    const pesos = (c: number) => `$${(Math.round(c) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const texto = `El precio de «${item.nombre}» pasó de ${pesos(antes)} a ${pesos(ahora_)}. Se cambió en dash101.`;
    for (const pz of piezas) {
      this.sql.exec(
        `INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES (?,?,NULL,'precio',?)`,
        crypto.randomUUID(),
        String(pz.id),
        texto,
      );
    }
  }

  /** Quitar la liga. No borra nada de ninguno de los dos lados: los deja
   *  sueltos, cada uno con lo suyo. */
  desligarObra(obra_id: string): { ok: true; obra: Fila } | { error: string; detalle?: unknown } {
    const obra = this.sql.exec(`SELECT id FROM quell_projects WHERE id = ?`, obra_id).toArray()[0] as Fila | undefined;
    if (!obra) return { error: 'no_encontrado', detalle: { que: 'obra', id: obra_id } };
    this.sql.exec(`UPDATE quell_projects SET proyecto_id = NULL WHERE id = ?`, obra_id);
    return { ok: true, obra: this.obras().find((o) => o.id === obra_id)! };
  }

  /* ─────────────── pool para autocompletar (§7) ─────────────── */

  pool(): Pool {
    const q = <T>(s: string) => this.sql.exec(s).toArray() as T[];
    return {
      clientes: q(`SELECT id, nombre, nombre_norm, correo, telefono FROM clientes ORDER BY nombre_norm`),
      proveedores: q(`SELECT id, nombre, nombre_norm, correo, telefono FROM proveedores ORDER BY nombre_norm`),
      personal: q(`SELECT id, nombre, nombre_norm, correo, puesto FROM personal WHERE activo = 1 ORDER BY nombre_norm`),
    } as Pool;
  }

  /* ─────────────── /peek — lo del cliente, ya sumado ───────────────
   * Los totales salen de la misma consulta que la lista, así el KPI y la tabla
   * no se pueden contradecir. Fue un defecto real del 7-sep.
   * Las partidas y los egresos no salen de aquí: el cliente no ve costos. */

  peek(cliente_id: string): Peek | null {
    const cliente = this.sql
      .exec(`SELECT id, nombre, correo FROM clientes WHERE id = ?`, cliente_id)
      .toArray()[0] as Fila | undefined;
    if (!cliente) return null;

    const proyectos = this.sql
      .exec(
        `SELECT id, negocio_id, cliente_id, nombre, descripcion, estado, fecha_inicio, fecha_fin_estimada,
                fecha_cierre, precio_venta, cobrado, avance, creado_at, actualizado_at
         FROM proyectos WHERE cliente_id = ? ORDER BY creado_at DESC`,
        cliente_id,
      )
      .toArray() as Fila[];

    const conItems = proyectos.map((p) => ({
      ...p,
      items: this.sql
        .exec(
          `SELECT id, clave, nombre, monto, moneda, estado, etapa, etapa_at, fecha_entrega
           FROM items WHERE proyecto_id = ? AND estado != 'cancelado' ORDER BY creado_at`,
          p.id,
        )
        .toArray(),
    }));

    const vendido = proyectos.reduce((s, p) => s + Number(p.precio_venta || 0), 0);
    const cobrado = proyectos.reduce((s, p) => s + Number(p.cobrado || 0), 0);
    const avance = proyectos.length ? proyectos.reduce((s, p) => s + Number(p.avance || 0), 0) / proyectos.length : 0;

    const pagos = this.sql
      .exec(
        `SELECT m.id, m.fecha, m.monto, m.proyecto_id, m.descripcion
         FROM movimientos m JOIN proyectos p ON p.id = m.proyecto_id
         WHERE p.cliente_id = ? AND m.tipo = 'ingreso' ORDER BY m.fecha DESC LIMIT 200`,
        cliente_id,
      )
      .toArray();

    return {
      cliente,
      proyectos: conItems,
      totales: { vendido, cobrado, saldo: vendido - cobrado, avance },
      pagos,
    } as unknown as Peek;
  }

  /* ─────────────── WebSocket (§8) ───────────────
   * Hibernation API: mientras nadie habla, no cuesta. Cada conexión guarda a
   * qué tiene derecho, y el filtro es el mismo que el de REST: quien no puede
   * leer dinero por REST tampoco lo recibe por aquí. */

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // quell101: la ruta del Worker (src/rutas/orgs.ts) ya resolvió empresa,
    // app y quién viene, y lo manda en cabeceras. Aquí corre el motor de la
    // bitácora sobre el SQLite de esta empresa.
    if (url.pathname === '/quell' || url.pathname.startsWith('/quell/')) {
      const sesion = cabeceraJson<SesionQuell | null>(req.headers.get('x-sesion'), null);
      if (!sesion) return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401, headers: { 'content-type': 'application/json' } });
      const org = req.headers.get('x-org') || '';
      const e = this.env;
      return atenderQuell(req, {
        DB: baseSobreSql(this.sql),
        FILES: e.ARCHIVOS,
        SESION: sesion,
        PREFIJO_R2: `orgs/${org}/quell/`,
        SITIO: req.headers.get('x-sitio') || 'https://bitacora-obra.mike-929.workers.dev',
        APP_NAME: 'quell101',
        MAIL_FROM: e.CORREO_QUELL || 'quell101 <bitacora@envios.taller101.mx>',
        RESEND_API_KEY: e.RESEND_API_KEY,
        CORREO_SALE: e.ENTORNO === 'produccion' || e.CORREO_DE_VERDAD === '1',
        // La invitación del cliente en la suite, desde adentro: el motor la
        // pide después de revisar que quien invita sea el dueño de la obra.
        INVITAR_EN_SUITE: (correo: string, nombre: string) =>
          invitarClienteEnSuite(e, org, { ...sesion.quien, negocios: [], ve_dinero: true, ve_costos: true } as Quien, this as unknown as ApiOrgDB, 'quell101', correo, nombre),
      }, url, url.pathname);
    }
    // roster101: igual que quell101, pero la sesión de la suite puede venir
    // vacía: el trabajador entra con su propia cookie, que el motor firma y
    // verifica con el secreto de la suite. Los datos de la empresa (nombre,
    // razón social…) vienen de su Worker en `x-roster`.
    if (url.pathname === '/roster' || url.pathname.startsWith('/roster/')) {
      const sesion = cabeceraJson<SesionRoster | null>(req.headers.get('x-sesion'), null);
      const org = req.headers.get('x-org') || '';
      const datos = cabeceraJson<DatosEmpresaRoster>(req.headers.get('x-roster'), {});
      let nombreOrg = 'la empresa';
      try { nombreOrg = decodeURIComponent(req.headers.get('x-empresa') || '') || nombreOrg; } catch { /* venía sin codificar */ }
      const e = this.env;
      const interna = new URL(url.toString());
      interna.pathname = url.pathname.replace(/^\/roster/, '') || '/';
      const peticion = new Request(interna.toString(), req);
      return atenderRoster(peticion, {
        DB: baseSobreSql(this.sql),
        DOCS: bucketConPrefijo(e.ARCHIVOS, `orgs/${org}/roster/`),
        SESION: sesion,
        SECRETO: await secretoDe(e),
        RESEND_API_KEY: e.RESEND_API_KEY,
        CORREO_SALE: e.ENTORNO === 'produccion' || e.CORREO_DE_VERDAD === '1',
        EMPRESA: datos.empresa || nombreOrg,
        RAZON_SOCIAL: datos.razon_social || datos.empresa || nombreOrg,
        DOMICILIO: datos.domicilio || '',
        CORREO_PRIVACIDAD: datos.correo_privacidad || datos.correo_avisos || '',
        CORREO_AVISOS: datos.correo_avisos || '',
        CORREO_REMITENTE: datos.correo_remitente || e.CORREO_ROSTER || 'roster101 <expedientes@envios.taller101.mx>',
        AVISO_VERSION: datos.aviso_version || '1',
        PORTAL_VERSION: datos.version || '',
      }, { waitUntil: (p: Promise<unknown>) => this.ctx.waitUntil(p) });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('solo websocket', { status: 426 });
    const par = new WebSocketPair();
    const [cliente, servidor] = Object.values(par);
    this.ctx.acceptWebSocket(servidor);
    servidor.serializeAttachment({ ve: url.searchParams.get('ve') || 'todos' });
    servidor.send(JSON.stringify({ t: 'listo', at: ahora() }));
    return new Response(null, { status: 101, webSocket: cliente });
  }

  webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer): void {
    if (typeof msg === 'string' && msg === 'ping') ws.send('pong');
  }

  webSocketClose(ws: WebSocket, code: number): void {
    try { ws.close(code === 1006 ? 1000 : code, 'adios'); } catch { /* ya estaba cerrada */ }
  }

  private avisar(aviso: Aviso, alcance: 'todos' | 'dinero'): void {
    const texto = JSON.stringify(aviso);
    for (const ws of this.ctx.getWebSockets()) {
      let ve = 'todos';
      try { ve = (ws.deserializeAttachment() as { ve?: string })?.ve || 'todos'; } catch { /* sin adjunto */ }
      if (alcance === 'dinero' && ve !== 'todos') continue;
      try { ws.send(texto); } catch { /* se cayó; el runtime la limpia */ }
    }
  }

  /** Cuántos hay conectados. Lo usa la prueba de humo para poder afirmar que
   *  el aviso salió a otra pantalla y no al vacío. */
  conectados(): number {
    return this.ctx.getWebSockets().length;
  }
}

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
import { DEFS, type Def, type Tipo } from './tablas';
import { ahora, normalizar, ulid } from './lib';
import { TABLAS, type Aviso, type Etapa, type Peek, type Pool, type Tabla } from '../schema/tipos';
import type { Env } from './entorno';

/* Las migraciones del OrgDB, en orden. Para agregar una: se escribe el .sql,
 * se importa y se empuja aquí. El DO la aplica al despertar. Nunca se edita
 * una que ya salió: las bases que ya la corrieron no la volverían a correr. */
const MIGRACIONES: string[] = [inicial, partidasATabla, conciliaciones, folios];

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
  fetch(req: Request): Promise<Response>;
}

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
    const fila = this.sql.exec(`SELECT siguiente FROM folios WHERE serie = ?`, serie).toArray()[0] as
      { siguiente: number } | undefined;
    let n = fila?.siguiente ?? 1;
    let folio = '';
    for (;;) {
      folio = `${serie}-${String(n).padStart(6, '0')}`;
      const ocupado = this.sql.exec(`SELECT 1 AS x FROM cotizaciones WHERE folio = ? LIMIT 1`, folio).toArray()[0];
      n += 1;
      if (!ocupado) break;
    }
    this.sql.exec(
      `INSERT INTO folios (serie, siguiente) VALUES (?,?) ON CONFLICT(serie) DO UPDATE SET siguiente = excluded.siguiente`,
      serie, n,
    );
    return folio;
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
    if (def.cols.creado_at) fila.creado_at = ahora();
    if (def.cols.ts && !fila.ts) fila.ts = ahora();
    if (def.cols.creado_por) fila.creado_por = contexto.usuario_id;
    if (def.cols.creado_en_app) fila.creado_en_app = contexto.app;
    if (def.cols.nombre_norm) fila.nombre_norm = normalizar(datos.nombre_norm ?? datos.nombre);

    const cols = Object.keys(fila).filter((c) => c in def.cols);
    const valores = cols.map((c) => this.adentro(def.cols[c], fila[c]));
    this.sql.exec(
      `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      ...valores,
    );

    this.despuesDeEscribir(tabla, fila.id as string);
    return this.obtener(tabla, fila.id as string)!;
  }

  actualizar(tabla: Tabla, id: string, datos: Fila): Fila | null {
    const def = DEFS[tabla];
    const cols = Object.keys(datos).filter((c) => c in def.cols && c !== 'id');
    if (!cols.length) return this.obtener(tabla, id);
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
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('solo websocket', { status: 426 });
    const url = new URL(req.url);
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

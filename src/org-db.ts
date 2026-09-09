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
import { DEFS, type Def, type Tipo } from './tablas';
import { ahora, normalizar, ulid } from './lib';
import type { Aviso, Etapa, Peek, Pool, Tabla } from '../schema/tipos';
import type { Env } from './entorno';

/* Las migraciones del OrgDB, en orden. Para agregar una: se escribe el .sql,
 * se importa y se empuja aquí. El DO la aplica al despertar. Nunca se edita
 * una que ya salió: las bases que ya la corrieron no la volverían a correr. */
const MIGRACIONES: string[] = [inicial];

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
  listar(tabla: Tabla, filtros?: Record<string, string>, sujeto?: Sujeto, limite?: number): Promise<{ total: number; filas: Fila[] }>;
  obtener(tabla: Tabla, id: string): Promise<Fila | null>;
  crear(tabla: Tabla, datos: Fila, contexto: { app: string; usuario_id: string }): Promise<Fila>;
  actualizar(tabla: Tabla, id: string, datos: Fila): Promise<Fila | null>;
  borrar(tabla: Tabla, id: string): Promise<boolean>;
  recalcularProyecto(proyecto_id: string): Promise<Fila | null>;
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
  fetch(req: Request): Promise<Response>;
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
          out[k] = JSON.parse(String(v ?? (k === 'partidas' || k === 'asignados' || k === 'etapas_permitidas' ? '[]' : '{}')));
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
    // Un cliente jamás llega hasta aquí (solo tiene /peek). El personal sí, y
    // se le acota a lo suyo: sus ítems y lo que cuelga de ellos.
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

  crear(tabla: Tabla, datos: Fila, contexto: { app: string; usuario_id: string }): Fila {
    const def = DEFS[tabla];
    const fila: Fila = { ...datos };

    fila.id = (datos.id as string) || ulid();
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

  borrar(tabla: Tabla, id: string): boolean {
    const antes = this.obtener(tabla, id);
    if (!antes) return false;
    this.sql.exec(`DELETE FROM ${tabla} WHERE id = ?`, id);
    if (tabla === 'movimientos' && antes.proyecto_id) this.recalcularProyecto(String(antes.proyecto_id));
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
  }

  /* ─────────────── agregados del proyecto (§4) ───────────────
   * Los calcula la API, no las apps. Un caché que escribe cualquiera deja de
   * ser un caché: se contradice con la tabla y nadie sabe cuál manda. */

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

    // Cuando TODOS los ítems vendidos llegan a la etapa 7, el proyecto queda en
    // finiquito. No se toca si ya está cerrado: eso lo decide la oficina.
    let estado = String(p.estado);
    if (venta.n > 0 && venta.cerrados === venta.n && estado !== 'cerrado') estado = 'finiquito';

    this.sql.exec(
      `UPDATE proyectos SET precio_venta = ?, cobrado = ?, pagado_prov = ?, avance = ?, estado = ?, actualizado_at = ? WHERE id = ?`,
      venta.s, cobrado, pagado, avance, estado, ahora(), proyecto_id,
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
   * `partidas` y los egresos no salen de aquí: el cliente no ve costos. */

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

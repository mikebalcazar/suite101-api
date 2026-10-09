/* bill101 fase D — bajar del SAT, dentro de la base de la empresa. 0.87.0.
 *
 * Mike, 8-oct-2026: «revisar facturas ya recibidas y emitidas en el SAT».
 * Con la FIEL guardada (src/fiel.ts), la empresa le pide al SAT lo suyo y lo
 * mete donde ya vivían las facturas que se subían a mano: mismas tablas,
 * misma lectura del XML, misma regla de qué es emitida y qué recibida
 * (`MotorFiscal.importar`, origen `sat`). Una factura que ya estaba no se
 * duplica: se reconoce por su folio fiscal.
 *
 * CÓMO TRABAJA. El SAT no contesta en el momento (src/sat-masiva.ts): hay
 * que pedir, volver a preguntar y luego bajar. Nadie se queda esperando en
 * una pantalla: cada cosa pedida es un renglón de `sat_solicitudes` con su
 * estado, y la base de la empresa se despierta sola (la alarma del Durable
 * Object) a dar el siguiente paso de la que toque. La pantalla sólo mira.
 *
 *   por_pedir → pedida → lista → importando → terminada
 *
 * QUÉ SE PIDE, cada vez (una «tanda»), por cada lado —emitidas y recibidas—:
 *   · los XML vigentes desde donde se quedó la vez pasada, menos tres días
 *     (el SAT tarda en enseñar lo recién timbrado), o desde el principio
 *     (`sat_config.desde`, 1-ene-2026 por decisión de Mike) la primera vez;
 *   · la LISTA completa (metadata) desde el principio: ahí viene cuáles
 *     están canceladas. Una cancelada allá se cancela aquí con la regla de
 *     siempre (0009: sus movimientos vuelven a quedar sin factura). Y si la
 *     lista trae vigentes que aquí no están, se piden ésas, una vez.
 *
 * LO QUE EL SAT NO PERDONA, y cómo se cuida:
 *   · El mismo periodo, como XML, sólo se puede pedir dos veces en la vida.
 *     Nunca se repite un periodo: cada tanda termina en «hace dos minutos»,
 *     que nunca es igual; y si aun así dice 5002, se recorre un segundo.
 *   · Un paquete se puede bajar pocas veces: se guarda en R2 al bajarlo y se
 *     trabaja desde ahí, por tandas, sin volver a pedirlo.
 *   · Si no contesta, se espera cada vez más; no se le insiste.
 *
 * Aquí no se arma ni se firma nada: eso es de sat-masiva.ts y fiel.ts.
 */

import { unzipSync, strFromU8 } from 'fflate';
import type { Env } from './entorno';
import { ahora, ulid } from './lib';
import { esFallaXml, leerCfdi, TOPE_XML, type CfdiLeido } from './cfdi-xml';
import { descifrarLlave, firmante, llaveMaestraFiel, type DatosFiel, type LlaveCifrada } from './fiel';
import {
  autenticar, descargar, esFallaSat, leerLista, solicitar, verificar,
  type Clase, type FallaSatMasiva, type Firma, type Lado, type Ventanilla,
} from './sat-masiva';
import type { Actor, Falla, ResultadoImportar } from './fiscal-db';

type Fila = Record<string, SqlStorageValue>;

export interface MemoriaSat { permiso?: { valor: string; vence: number; serie: string } }

export interface EntornoSat {
  sql: SqlStorage;
  tx<T>(fn: () => T): T;
  env: Env;
  rfcEmpresa(): string;
  ponerRfcEmpresa(rfc: string): void;
  importar(lista: CfdiLeido[], actor: Actor): { resultados: ResultadoImportar[] } | Falla;
  ponerArchivos(lista: { id: string; xml_llave: string }[]): void;
  anotarSat(id: string, estado: 'vigente' | 'cancelado'): { cambio: boolean } | Falla;
  /** Despertar la base dentro de tantos milisegundos; `null`, no despertarla. */
  despertarEn(ms: number | null): Promise<void>;
  /** Lo que se recuerda mientras la base está despierta (el permiso del SAT). */
  memoria: MemoriaSat;
  traer: typeof fetch;
}

const ACTIVAS = ['por_pedir', 'pedida', 'lista', 'importando'] as const;
const EN_ACTIVAS = `('por_pedir','pedida','lista','importando')`;

/** Facturas por paso. Cada una es un archivo que se guarda aparte, y una
 *  base tiene un tope de llamadas por despertada. */
export const LOTE_XML = 20;
/** Renglones de la lista por paso: no llaman a nadie, sólo escriben. */
export const LOTE_LISTA = 400;
const TOPE_LLAMADAS = 40;
const TOPE_MS = 20_000;
const TOPE_PASOS = 30;
/** Veces que se insiste con una solicitud a la que el SAT no contesta bien. */
const TOPE_INTENTOS = 12;
/** Cuánto se espera a una solicitud antes de darla por perdida. Lo normal
 *  son minutos; se han visto de hasta tres días. */
const VENCE_MS = 96 * 3600_000;
const MIN = 60_000;

/* La hora del SAT es la del centro de México, que desde 2022 no cambia: UTC−6. */
const MX = 6 * 3600_000;
export const horaMx = (ms: number): string => new Date(ms - MX).toISOString().slice(0, 19);
export const deMx = (s: string): number => Date.parse(`${s.replace(' ', 'T')}Z`) + MX;
const masSegundos = (s: string, n: number): string => horaMx(deMx(s) + n * 1000);

const esFalla = (r: unknown): r is Falla => !!r && typeof r === 'object' && typeof (r as { error?: unknown }).error === 'string';

/** Cuánto esperar antes de volver a preguntar por una solicitud: seguido al
 *  principio (casi todas están en un par de minutos), espaciado después. */
const esperaVerificar = (intentos: number): number => [1, 1, 2, 3, 5, 10, 15][intentos] !== undefined ? [1, 1, 2, 3, 5, 10, 15][intentos] * MIN : 30 * MIN;
const esperaFalla = (intentos: number): number => ([2, 5, 15, 30][intentos] ?? 60) * MIN;

export const llavePaquete = (org: string, solicitud: string, n: number): string => `orgs/${org}/sat/${solicitud}/${n}.zip`;
const llaveXml = (org: string, id: string): string => `orgs/${org}/cfdi/${id}.xml`;

export class MotorSat {
  private sql: SqlStorage;
  private llamadas = 0;
  /** Los .zip del SAT que ya no hacen falta: se tiran al final del tic. */
  private porTirar: string[] = [];
  constructor(private e: EntornoSat) { this.sql = e.sql; }

  private una(sql: string, ...args: SqlStorageValue[]): Fila | undefined {
    return this.sql.exec(sql, ...args).toArray()[0] as Fila | undefined;
  }
  private todas(sql: string, ...args: SqlStorageValue[]): Fila[] {
    return this.sql.exec(sql, ...args).toArray() as Fila[];
  }

  private fiel(): Fila | undefined { return this.una(`SELECT * FROM sat_fiel WHERE id = 'fiel'`); }

  private cfg(): Fila {
    this.sql.exec(`INSERT OR IGNORE INTO sat_config (id) VALUES ('sat')`);
    return this.una(`SELECT * FROM sat_config WHERE id = 'sat'`)!;
  }

  private evento(solicitud: string | null, paso: string, codigo: unknown, mensaje: unknown): void {
    this.sql.exec(
      `INSERT INTO sat_eventos (at, solicitud_id, paso, codigo, mensaje) VALUES (?,?,?,?,?)`,
      ahora(), solicitud, paso, codigo == null ? null : String(codigo).slice(0, 120), mensaje == null ? null : String(mensaje).slice(0, 300),
    );
    this.sql.exec(`DELETE FROM sat_eventos WHERE id <= (SELECT MAX(id) FROM sat_eventos) - 400`);
  }

  private hayActivas(): boolean {
    return !!this.una(`SELECT 1 AS x FROM sat_solicitudes WHERE estado IN ${EN_ACTIVAS} LIMIT 1`);
  }

  /* ─────────────── lo que ve la pantalla ─────────────── */

  estado(): Fila {
    const f = this.fiel();
    const c = this.cfg();
    const cubierto = (lado: Lado): string | null =>
      (this.una(`SELECT MAX(hasta) AS h FROM sat_solicitudes WHERE lado = ? AND clase = 'cfdi' AND motivo != 'faltantes' AND estado IN ('terminada','vacia')`, lado)?.h as string | null) ?? null;
    const solicitudes = this.todas(
      `SELECT id, tanda, lado, clase, motivo, desde, hasta, estado, codigo, mensaje, cuantas, nuevas, actualizadas, repetidas, rechazadas,
              canceladas, revisadas, faltantes, intentos, proxima_at, creada_at, pedida_at, actualizada_at, terminada_at
         FROM sat_solicitudes ORDER BY creada_at DESC, id DESC LIMIT 40`,
    );
    const bajadas = this.una(`SELECT COUNT(*) AS n FROM cfdi WHERE origen = 'sat'`)?.n ?? 0;
    return {
      rfc_empresa: this.e.rfcEmpresa().toUpperCase().replace(/[\s.-]/g, '') || null,
      fiel: f ? {
        rfc: f.rfc, nombre: f.nombre, serie: f.serie, vale_desde: f.vale_desde, vence: f.vence,
        dias_para_vencer: Math.floor((Date.parse(String(f.vence)) - Date.now()) / 86_400_000),
        subida_at: f.subida_at, subida_por: f.subida_por,
      } : null,
      automatico: !!c.automatico,
      desde: c.desde,
      trabajando: this.hayActivas(),
      proxima_noche_at: f && c.automatico ? c.proxima_noche_at : null,
      ultima_corrida_at: c.ultima_corrida_at,
      ultimo_error: c.ultimo_error, ultimo_error_at: c.ultimo_error_at,
      cubierto_hasta: { emitidas: cubierto('emitidas'), recibidas: cubierto('recibidas') },
      facturas_del_sat: bajadas,
      solicitudes,
      eventos: this.todas(`SELECT at, solicitud_id, paso, codigo, mensaje FROM sat_eventos ORDER BY id DESC LIMIT 25`),
    } as unknown as Fila;
  }

  /* ─────────────── la FIEL ─────────────── */

  /** Guarda una FIEL ya abierta, comprobada y vuelta a cifrar (lo hace la
   *  ruta: la contraseña no llega hasta aquí). Tiene que ser la de la
   *  empresa: con la FIEL de otro RFC el SAT entregaría las facturas de
   *  otro, y aquí se rechazarían una por una por «no es de la empresa». Si
   *  la empresa todavía no tiene RFC, toma el de la FIEL —que es la prueba
   *  más seria que hay de cuál es—. */
  async guardarFiel(a: { org_id: string; datos: DatosFiel; cifrada: LlaveCifrada }, actor: Actor): Promise<Fila | Falla> {
    const d = a.datos;
    const rfc = this.e.rfcEmpresa().toUpperCase().replace(/[\s.-]/g, '');
    if (rfc && rfc !== d.rfc) return { error: 'fiel_de_otro_rfc', detalle: { fiel: d.rfc, empresa: rfc, motivo: 'esta FIEL es de otro RFC, no del de la empresa' } };
    this.e.tx(() => {
      if (!rfc) this.e.ponerRfcEmpresa(d.rfc);
      this.sql.exec(
        `INSERT OR REPLACE INTO sat_fiel (id, org_id, rfc, nombre, serie, serie_decimal, emisor, vale_desde, vence, cer_b64, llave_iv, llave_dato, subida_por, subida_at)
         VALUES ('fiel',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        a.org_id, d.rfc, d.nombre, d.serie, d.serie_decimal, d.emisor, d.vale_desde, d.vence, d.cer_b64, a.cifrada.iv, a.cifrada.dato, actor.usuario_id, ahora(),
      );
      this.cfg();
      this.sql.exec(`UPDATE sat_config SET ultimo_error = NULL, ultimo_error_at = NULL, fallas_seguidas = 0 WHERE id = 'sat'`);
      // Lo que estaba detenido por la FIEL anterior se reintenta ya.
      this.sql.exec(`UPDATE sat_solicitudes SET proxima_at = NULL WHERE estado IN ${EN_ACTIVAS}`);
      this.evento(null, 'fiel', 'guardada', `${d.rfc} · serie ${d.serie} · vence ${d.vence.slice(0, 10)}`);
      if (!this.hayActivas()) this.encolar('mano', actor);
    });
    this.e.memoria.permiso = undefined;
    await this.programar();
    return this.estado();
  }

  /** Quita la FIEL. Lo que estaba a medias se cancela: sin ella no se puede
   *  seguir preguntando. Las facturas que ya bajaron se quedan. */
  async quitarFiel(): Promise<Fila> {
    const f = this.fiel();
    this.e.tx(() => {
      this.sql.exec(`DELETE FROM sat_fiel WHERE id = 'fiel'`);
      const t = ahora();
      this.sql.exec(`UPDATE sat_solicitudes SET estado = 'cancelada', mensaje = 'se quitó la FIEL', terminada_at = ?, actualizada_at = ? WHERE estado IN ${EN_ACTIVAS}`, t, t);
      if (f) this.evento(null, 'fiel', 'quitada', String(f.rfc));
    });
    this.e.memoria.permiso = undefined;
    await this.e.despertarEn(null);
    return this.estado();
  }

  async configurar(d: Record<string, unknown>): Promise<Fila | Falla> {
    this.cfg();
    if (d.automatico !== undefined) {
      if (typeof d.automatico !== 'boolean') return { error: 'datos_invalidos', detalle: { automatico: 'true o false' } };
      this.sql.exec(`UPDATE sat_config SET automatico = ?, proxima_noche_at = NULL WHERE id = 'sat'`, d.automatico ? 1 : 0);
    }
    if (d.desde !== undefined) {
      const s = String(d.desde);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) || Date.parse(s) > Date.now()) return { error: 'datos_invalidos', detalle: { desde: 'AAAA-MM-DD, no en el futuro' } };
      this.sql.exec(`UPDATE sat_config SET desde = ? WHERE id = 'sat'`, s);
    }
    await this.programar();
    return this.estado();
  }

  /** «Bajar ahora». Si ya hay algo en camino no se pide otra vez: se
   *  despierta lo que está. */
  async bajar(actor: Actor): Promise<Fila | Falla> {
    if (!this.fiel()) return { error: 'sin_fiel', detalle: { motivo: 'primero hay que subir la FIEL de la empresa' } };
    const ya = this.hayActivas();
    if (!ya) this.e.tx(() => this.encolar('mano', actor));
    else this.sql.exec(`UPDATE sat_solicitudes SET proxima_at = NULL WHERE estado IN ('por_pedir','pedida','lista') AND proxima_at > ?`, new Date(Date.now() + 2 * MIN).toISOString());
    await this.e.despertarEn(500);
    return { ...this.estado(), ya_trabajando: ya } as unknown as Fila;
  }

  /* ─────────────── qué se pide ─────────────── */

  private poner(tanda: string, lado: Lado, clase: Clase, motivo: string, desde: string, hasta: string, actor: Actor): void {
    const t = ahora();
    this.sql.exec(
      `INSERT INTO sat_solicitudes (id, tanda, lado, clase, motivo, desde, hasta, estado, creada_por, creada_at, actualizada_at) VALUES (?,?,?,?,?,?,?,'por_pedir',?,?,?)`,
      ulid(), tanda, lado, clase, motivo, desde, hasta, actor.usuario_id, t, t,
    );
  }

  /** Una tanda: por cada lado, los XML que faltan y la lista completa. */
  private encolar(motivo: 'mano' | 'noche', actor: Actor): void {
    const c = this.cfg();
    const hasta = horaMx(Date.now() - 2 * MIN);
    // El SAT no da nada de hace más de seis años (contados al día).
    const seis = new Date(Date.now() - MX);
    seis.setUTCFullYear(seis.getUTCFullYear() - 6);
    seis.setUTCDate(seis.getUTCDate() + 1);
    const tope = `${seis.toISOString().slice(0, 10)}T00:00:00`;
    const pedido = `${String(c.desde)}T00:00:00`;
    const piso = pedido > tope ? pedido : tope;
    const tanda = ulid();
    for (const lado of ['emitidas', 'recibidas'] as const) {
      const ult = this.una(`SELECT MAX(hasta) AS h FROM sat_solicitudes WHERE lado = ? AND clase = 'cfdi' AND motivo != 'faltantes' AND estado IN ('terminada','vacia')`, lado)?.h as string | null;
      const atras = ult ? masSegundos(ult, -3 * 86_400) : piso;
      const desde = atras > piso ? atras : piso;
      if (desde < hasta) this.poner(tanda, lado, 'cfdi', ult ? motivo : 'inicial', desde, hasta, actor);
      if (piso < hasta) this.poner(tanda, lado, 'metadata', ult ? motivo : 'inicial', piso, hasta, actor);
    }
  }

  /** La siguiente noche: entre las 3 y las 4:30 de la mañana del centro de
   *  México, con unos minutos propios de cada empresa para no llegar todas
   *  al SAT en el mismo segundo. */
  private siguienteNoche(org: string): string {
    let h = 0;
    for (const ch of org) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const corrida = (3 * 60 + (h % 90)) * MIN;
    const hoyMx0 = Date.parse(`${horaMx(Date.now()).slice(0, 10)}T00:00:00Z`) + MX;
    let t = hoyMx0 + corrida;
    if (t <= Date.now() + MIN) t += 86_400_000;
    return new Date(t).toISOString();
  }

  /* ─────────────── la alarma ─────────────── */

  /** Lo que hace la base cada vez que se despierta: los pasos que quepan, y
   *  dejar puesta la siguiente despertada. */
  async tic(): Promise<void> {
    const inicio = Date.now();
    this.llamadas = 0;
    const f = this.fiel();
    if (!f) { await this.e.despertarEn(null); return; }
    const c = this.cfg();
    if (c.automatico && !this.hayActivas() && c.proxima_noche_at && String(c.proxima_noche_at) <= ahora()) {
      this.e.tx(() => {
        this.encolar('noche', { usuario_id: String(f.subida_por) });
        this.sql.exec(`UPDATE sat_config SET proxima_noche_at = ? WHERE id = 'sat'`, this.siguienteNoche(String(f.org_id)));
      });
    }
    let firma: Firma | null = null;
    const dameFirma = async (): Promise<Firma | null> => {
      if (firma) return firma;
      const pkcs8 = await descifrarLlave({ iv: String(f.llave_iv), dato: String(f.llave_dato) }, await llaveMaestraFiel(this.e.env), String(f.org_id), String(f.rfc));
      if (!pkcs8) return null;
      firma = { fiel: { rfc: String(f.rfc), serie_decimal: String(f.serie_decimal), emisor: String(f.emisor), cer_b64: String(f.cer_b64) }, firmar: await firmante(pkcs8) };
      return firma;
    };
    for (let pasos = 0; pasos < TOPE_PASOS && Date.now() - inicio < TOPE_MS && this.llamadas < TOPE_LLAMADAS; pasos++) {
      const s = this.una(
        `SELECT * FROM sat_solicitudes WHERE estado IN ${EN_ACTIVAS} AND (proxima_at IS NULL OR proxima_at <= ?)
          ORDER BY CASE estado WHEN 'importando' THEN 0 WHEN 'lista' THEN 1 WHEN 'pedida' THEN 2 ELSE 3 END, creada_at, id LIMIT 1`,
        ahora(),
      );
      if (!s) break;
      let sigue: boolean;
      try {
        sigue = await this.paso(s, f, dameFirma);
      } catch (e) {
        // Un paso que truena no debe dejar a la empresa dando vueltas sobre lo mismo.
        this.evento(String(s.id), 'paso', 'excepcion', e instanceof Error ? e.message : 'error');
        this.aplazar(s, esperaFalla(Number(s.intentos)), true);
        sigue = false;
      }
      if (!sigue) break;
    }
    if (this.porTirar.length) {
      const lista = this.porTirar.splice(0);
      this.llamadas++;
      try { await this.e.env.ARCHIVOS.delete(lista); } catch { /* se quedan; no cambian nada */ }
    }
    await this.programar();
  }

  /** Deja puesta la siguiente despertada: ya, si hay trabajo que no depende
   *  del SAT; cuando toque volver a preguntar, si se le está esperando; la
   *  siguiente noche, si no hay nada y se baja solo. */
  private async programar(): Promise<void> {
    const f = this.fiel();
    if (!f) { await this.e.despertarEn(null); return; }
    const activa = this.una(`SELECT MIN(COALESCE(proxima_at, '')) AS p FROM sat_solicitudes WHERE estado IN ${EN_ACTIVAS}`);
    if (activa && activa.p !== null) {
      const cuando = activa.p ? Date.parse(String(activa.p)) : 0;
      await this.e.despertarEn(Math.max(1000, cuando - Date.now()));
      return;
    }
    const c = this.cfg();
    if (!c.automatico) { await this.e.despertarEn(null); return; }
    let noche = c.proxima_noche_at ? String(c.proxima_noche_at) : '';
    if (!noche) {
      noche = this.siguienteNoche(String(f.org_id));
      this.sql.exec(`UPDATE sat_config SET proxima_noche_at = ? WHERE id = 'sat'`, noche);
    }
    await this.e.despertarEn(Math.max(1000, Date.parse(noche) - Date.now()));
  }

  /* ─────────────── los pasos ─────────────── */

  /** Escribe en la solicitud SÓLO si sigue en el estado con que se leyó.
   *  Mientras un paso espera al SAT, la base deja entrar otras peticiones:
   *  si en ese rato alguien quitó la FIEL (la fila pasó a `cancelada`), lo
   *  que contestó el SAT ya no debe revivirla. Devuelve si escribió. */
  private actualizar(s: Fila, campos: Record<string, SqlStorageValue>): boolean {
    const k = Object.keys(campos);
    const c = this.sql.exec(
      `UPDATE sat_solicitudes SET ${k.map((x) => `${x} = ?`).join(', ')}, actualizada_at = ? WHERE id = ? AND estado = ?`,
      ...k.map((x) => campos[x]), ahora(), String(s.id), String(s.estado),
    ).rowsWritten;
    if (c) { Object.assign(s, campos); }
    return c > 0;
  }

  private aplazar(s: Fila, ms: number, cuenta = false): void {
    this.actualizar(s, { proxima_at: new Date(Date.now() + ms).toISOString(), intentos: Number(s.intentos) + (cuenta ? 1 : 0) });
  }

  private terminar(s: Fila, estado: string, campos: Record<string, SqlStorageValue> = {}): void {
    const paquetes = JSON.parse(String(s.paquetes || '[]')) as string[];
    if (!this.actualizar(s, { estado, proxima_at: null, terminada_at: ahora(), ...campos })) return;
    if (estado === 'terminada' || estado === 'vacia') {
      this.sql.exec(`UPDATE sat_config SET ultima_corrida_at = ?, fallas_seguidas = 0, ultimo_error = NULL, ultimo_error_at = NULL WHERE id = 'sat'`, ahora());
    }
    // Lo bajado ya no sirve, termine como termine: lo que traía está guardado factura por factura, o no se pudo leer.
    if (paquetes.length) this.porTirar.push(...paquetes.map((_, i) => llavePaquete(String(this.fiel()?.org_id ?? ''), String(s.id), i)));
  }

  /** El SAT no está, o no quiere a esta FIEL: no se le insiste en esta
   *  despertada ni con las demás solicitudes. Todo lo que depende de él se
   *  recorre. Devuelve `false` («hasta aquí»). */
  private alto(s: Fila, r: FallaSatMasiva): boolean {
    // Rechazo fuera de la primera ventanilla: lo más común es que el permiso
    // venció a medio camino. Se pide otro y se reintenta en un minuto, dos veces.
    if (r.error === 'sat_rechaza' && r.detalle.paso !== 'autenticar' && Number(s.intentos) < 2) {
      this.e.memoria.permiso = undefined;
      this.evento(String(s.id), r.detalle.paso, r.detalle.codigo ?? 'rechazo', r.detalle.mensaje ?? null);
      this.aplazar(s, MIN, true);
      return true;
    }
    // Demasiadas veces sin lograrlo: se da por perdida ESTA solicitud, para que
    // la empresa no se quede «trabajando» para siempre sin que llegue la noche.
    if (Number(s.intentos) >= TOPE_INTENTOS || (s.estado === 'pedida' && Date.now() - Date.parse(String(s.pedida_at ?? s.creada_at)) > VENCE_MS)) {
      this.evento(String(s.id), r.detalle.paso, r.detalle.codigo ?? r.detalle.http ?? r.error, r.detalle.mensaje ?? null);
      this.terminar(s, 'error', { mensaje: `el SAT no contestó bien ${Number(s.intentos)} veces seguidas (${r.detalle.paso})` });
      return true;
    }
    const c = this.cfg();
    const fallas = Number(c.fallas_seguidas) + 1;
    const rechazo = r.error === 'sat_rechaza';
    const texto = rechazo
      ? `El SAT rechazó la petición (${r.detalle.paso}): ${r.detalle.mensaje || r.detalle.codigo || 'sin mensaje'}`
      : `El SAT no contestó (${r.detalle.paso}${r.detalle.http ? `, ${r.detalle.http}` : ''})`;
    this.sql.exec(`UPDATE sat_config SET fallas_seguidas = ?, ultimo_error = ?, ultimo_error_at = ? WHERE id = 'sat'`, fallas, texto, ahora());
    this.evento(String(s.id), r.detalle.paso, r.detalle.codigo ?? r.detalle.http ?? r.error, r.detalle.mensaje ?? null);
    this.e.memoria.permiso = undefined;
    const espera = Math.min(6 * 60, rechazo ? 30 * fallas : [2, 5, 15, 30][fallas - 1] ?? 60) * MIN;
    const hasta = new Date(Date.now() + espera).toISOString();
    this.sql.exec(`UPDATE sat_solicitudes SET proxima_at = ? WHERE estado IN ('por_pedir','pedida','lista') AND (proxima_at IS NULL OR proxima_at < ?)`, hasta, hasta);
    this.actualizar(s, { intentos: Number(s.intentos) + 1 });
    return false;
  }

  private ventanilla(): Ventanilla {
    const env = this.e.env;
    // Sólo fuera de producción se le puede decir que el SAT está en otro lado.
    const base = env.ENTORNO !== 'produccion' && env.SAT_BASE ? env.SAT_BASE.replace(/\/$/, '') : undefined;
    return { traer: this.e.traer, base };
  }

  private async permiso(f: Fila, firma: Firma): Promise<string | FallaSatMasiva> {
    const m = this.e.memoria.permiso;
    if (m && m.serie === f.serie && m.vence > Date.now()) return m.valor;
    this.llamadas++;
    const r = await autenticar(this.ventanilla(), firma);
    if (esFallaSat(r)) return r;
    this.e.memoria.permiso = { valor: r.permiso, vence: r.vence, serie: String(f.serie) };
    return r.permiso;
  }

  /** Un paso de una solicitud. `true`: se puede seguir con otra. */
  private async paso(s: Fila, f: Fila, dameFirma: () => Promise<Firma | null>): Promise<boolean> {
    const id = String(s.id);
    if (s.estado === 'importando') return s.clase === 'cfdi' ? this.importarXml(s, f) : this.importarLista(s, f);

    const firma = await dameFirma();
    if (!firma) {
      // Lo guardado no abre: cambió el secreto, o se dañó. Hay que subirla otra vez.
      this.sql.exec(`UPDATE sat_config SET ultimo_error = ?, ultimo_error_at = ? WHERE id = 'sat'`, 'La FIEL guardada no se pudo abrir: hay que subirla otra vez', ahora());
      this.evento(id, 'fiel', 'no_abre', null);
      const hasta = new Date(Date.now() + 6 * 60 * MIN).toISOString();
      this.sql.exec(`UPDATE sat_solicitudes SET proxima_at = ? WHERE estado IN ('por_pedir','pedida','lista')`, hasta);
      return false;
    }
    const permiso = await this.permiso(f, firma);
    if (esFallaSat(permiso)) return this.alto(s, permiso);
    const v = this.ventanilla();

    if (s.estado === 'por_pedir') {
      this.llamadas++;
      const r = await solicitar(v, firma, permiso, { lado: s.lado as Lado, clase: s.clase as Clase, desde: String(s.desde), hasta: String(s.hasta) });
      if (esFallaSat(r)) return this.alto(s, r);
      this.evento(id, 'solicitar', r.codigo, r.mensaje);
      if (r.codigo === 5000 && r.id_solicitud) {
        this.actualizar(s, { estado: 'pedida', id_solicitud: r.id_solicitud, codigo: r.codigo, mensaje: r.mensaje, pedida_at: ahora(), intentos: 0, proxima_at: new Date(Date.now() + MIN).toISOString() });
        return true;
      }
      return this.sinDatos(s, r.codigo, r.mensaje);
    }

    if (s.estado === 'pedida') {
      this.llamadas++;
      const r = await verificar(v, firma, permiso, String(s.id_solicitud));
      if (esFallaSat(r)) return this.alto(s, r);
      this.evento(id, 'verificar', `${r.codigo}/${r.estado}/${r.codigo_solicitud}`, r.mensaje);
      if (r.estado === 3 && r.paquetes.length) {
        this.actualizar(s, { estado: 'lista', paquetes: JSON.stringify(r.paquetes), cuantas: r.cuantas, codigo: r.codigo_solicitud || r.codigo, mensaje: r.mensaje, paquete_n: 0, cursor: 0, intentos: 0, proxima_at: null });
        return true;
      }
      if (r.estado === 3) { this.terminar(s, 'vacia', { cuantas: 0, codigo: r.codigo_solicitud || r.codigo, mensaje: r.mensaje }); return true; }
      if (r.estado === 1 || r.estado === 2 || r.codigo === 404 || (r.estado === 0 && r.codigo === 5000)) {
        if (Date.now() - Date.parse(String(s.pedida_at ?? s.creada_at)) > VENCE_MS) { this.terminar(s, 'vencida', { mensaje: 'el SAT nunca la terminó' }); return true; }
        this.aplazar(s, esperaVerificar(Number(s.intentos)), true);
        return true;
      }
      if (r.estado === 6) { this.terminar(s, 'vencida', { codigo: r.codigo_solicitud, mensaje: r.mensaje }); return true; }
      return this.sinDatos(s, r.codigo_solicitud || r.codigo, r.mensaje, r.estado === 4 ? 'error' : 'rechazada');
    }

    // lista: bajar el paquete que toca y guardarlo ANTES de abrirlo.
    const paquetes = JSON.parse(String(s.paquetes || '[]')) as string[];
    const n = Number(s.paquete_n);
    if (n >= paquetes.length) { this.terminar(s, 'terminada'); return true; }
    const llave = llavePaquete(String(f.org_id), id, n);
    this.llamadas++;
    if (!(await this.e.env.ARCHIVOS.head(llave))) {
      this.llamadas += 2;
      const r = await descargar(v, firma, permiso, paquetes[n]);
      if (esFallaSat(r)) return this.alto(s, r);
      this.evento(id, 'descargar', r.codigo, r.mensaje);
      if (r.codigo !== 5000 || !r.paquete) {
        if (r.codigo === 404 && Number(s.intentos) < 6) { this.aplazar(s, esperaFalla(Number(s.intentos)), true); return true; }
        this.terminar(s, 'error', { codigo: r.codigo, mensaje: r.mensaje || 'el paquete llegó vacío' });
        return true;
      }
      await this.e.env.ARCHIVOS.put(llave, r.paquete, { httpMetadata: { contentType: 'application/zip' } });
    }
    this.actualizar(s, { estado: 'importando', cursor: 0, intentos: 0, proxima_at: null });
    return true;
  }

  /** Lo que el SAT contesta cuando no va a dar datos. */
  private sinDatos(s: Fila, codigo: number, mensaje: string, estado: 'rechazada' | 'error' = 'rechazada'): boolean {
    const id = String(s.id);
    // 5004: no hay nada en ese periodo. No es un error.
    if (codigo === 5004) { this.terminar(s, 'vacia', { cuantas: 0, codigo, mensaje }); return true; }
    // 5002: ese periodo exacto ya se pidió dos veces en la vida. Un segundo menos es otro periodo.
    if (codigo === 5002 && Number(s.intentos) < 3 && masSegundos(String(s.hasta), -1) > String(s.desde)) {
      this.actualizar(s, { estado: 'por_pedir', hasta: masSegundos(String(s.hasta), -1), intentos: Number(s.intentos) + 1, id_solicitud: null, proxima_at: null, codigo, mensaje });
      return true;
    }
    // 5003: son más de las que caben en una solicitud. Se pide en dos mitades.
    if (codigo === 5003) {
      const a = deMx(String(s.desde)), b = deMx(String(s.hasta));
      const medio = horaMx(Math.floor((a + b) / 2000) * 1000);
      if (medio > String(s.desde) && medio < String(s.hasta)) {
        this.e.tx(() => {
          const actor = { usuario_id: String(s.creada_por) };
          this.poner(String(s.tanda), s.lado as Lado, s.clase as Clase, 'partida', String(s.desde), medio, actor);
          this.poner(String(s.tanda), s.lado as Lado, s.clase as Clase, 'partida', medio, String(s.hasta), actor);
          this.terminar(s, 'partida', { codigo, mensaje });
        });
        return true;
      }
    }
    // 404: «error no controlado», pide reintentar.
    if (codigo === 404 && Number(s.intentos) < 6) { this.aplazar(s, esperaFalla(Number(s.intentos)), true); return true; }
    // 300–305: es la FIEL (revocada, no corresponde…). Se dice arriba, no sólo en el renglón.
    if (codigo >= 300 && codigo <= 305) {
      this.sql.exec(`UPDATE sat_config SET ultimo_error = ?, ultimo_error_at = ? WHERE id = 'sat'`, `El SAT no aceptó la FIEL (${codigo}): ${mensaje}`, ahora());
    }
    this.terminar(s, estado, { codigo, mensaje });
    return true;
  }

  private async zip(s: Fila, f: Fila): Promise<Uint8Array | null> {
    this.llamadas++;
    const obj = await this.e.env.ARCHIVOS.get(llavePaquete(String(f.org_id), String(s.id), Number(s.paquete_n)));
    if (!obj) {
      // Se perdió lo guardado: se vuelve a pedir el paquete (si el SAT deja).
      this.actualizar(s, { estado: 'lista', cursor: 0 });
      return null;
    }
    return new Uint8Array(await obj.arrayBuffer());
  }

  /** Pasa al siguiente paquete, o termina y tira los .zip: lo que traían ya
   *  está guardado factura por factura. */
  private async siguientePaquete(s: Fila, f: Fila, campos: Record<string, SqlStorageValue>): Promise<void> {
    const paquetes = JSON.parse(String(s.paquetes || '[]')) as string[];
    const n = Number(s.paquete_n) + 1;
    if (n < paquetes.length) { this.actualizar(s, { ...campos, estado: 'lista', paquete_n: n, cursor: 0 }); return; }
    this.terminar(s, 'terminada', campos);
  }

  /** Un lote de XML del paquete: leerlos, meterlos y guardar su archivo. */
  private async importarXml(s: Fila, f: Fila): Promise<boolean> {
    const id = String(s.id);
    const bytes = await this.zip(s, f);
    if (!bytes) return true;
    const desde = Number(s.cursor);
    let i = -1, total = 0, grandes = 0;
    let dentro: Record<string, Uint8Array>;
    try {
      dentro = unzipSync(bytes, {
        filter: (a) => {
          if (!/\.xml$/i.test(a.name)) return false;
          i++; total = i + 1;
          if (i < desde || i >= desde + LOTE_XML) return false;
          if (a.originalSize > TOPE_XML) { grandes++; return false; }
          return true;
        },
      });
    } catch {
      this.terminar(s, 'error', { mensaje: 'el paquete del SAT no se pudo abrir' });
      return true;
    }
    const cuenta = { nuevas: Number(s.nuevas), actualizadas: Number(s.actualizadas), repetidas: Number(s.repetidas), rechazadas: Number(s.rechazadas) + grandes };
    const leidas: CfdiLeido[] = [];
    const textos = new Map<string, string>();
    for (const contenido of Object.values(dentro)) {
      const xml = strFromU8(contenido);
      const r = leerCfdi(xml);
      if (esFallaXml(r)) { cuenta.rechazadas++; continue; }
      if (textos.has(r.uuid)) { cuenta.repetidas++; continue; }
      textos.set(r.uuid, xml);
      leidas.push(r);
    }
    if (leidas.length) {
      const r = this.e.importar(leidas, { usuario_id: String(s.creada_por) });
      if (esFalla(r)) { this.terminar(s, 'error', { mensaje: `no se pudieron guardar: ${r.error}` }); return true; }
      const porGuardar: { id: string; xml_llave: string }[] = [];
      for (const x of r.resultados) {
        if (x.resultado === 'nueva') cuenta.nuevas++;
        else if (x.resultado === 'actualizada') cuenta.actualizadas++;
        else if (x.resultado === 'repetida') cuenta.repetidas++;
        else { cuenta.rechazadas++; this.evento(id, 'importar', x.motivo ?? 'rechazada', x.uuid); }
        if (x.id && x.falta_xml && x.resultado !== 'rechazada') {
          const llave = llaveXml(String(f.org_id), x.id);
          this.llamadas++;
          await this.e.env.ARCHIVOS.put(llave, textos.get(x.uuid)!, { httpMetadata: { contentType: 'application/xml' } });
          porGuardar.push({ id: x.id, xml_llave: llave });
        }
      }
      if (porGuardar.length) this.e.ponerArchivos(porGuardar);
    }
    if (desde + LOTE_XML >= total) await this.siguientePaquete(s, f, cuenta);
    else this.actualizar(s, { ...cuenta, cursor: desde + LOTE_XML });
    return true;
  }

  /** Un lote de la lista: lo que el SAT dice de cada factura contra lo que
   *  hay aquí. Espera a que los XML de su tanda hayan entrado —si no, todo
   *  le parecería que falta—. */
  private async importarLista(s: Fila, f: Fila): Promise<boolean> {
    const id = String(s.id);
    const esperando = this.una(`SELECT MAX(COALESCE(proxima_at, '')) AS p FROM sat_solicitudes WHERE tanda = ? AND lado = ? AND clase = 'cfdi' AND estado IN ${EN_ACTIVAS}`, String(s.tanda), String(s.lado));
    if (esperando && esperando.p !== null) {
      // Hasta que a ellos les toque, y un poco más; nunca menos de medio minuto.
      const suya = esperando.p ? Date.parse(String(esperando.p)) - Date.now() : 0;
      this.aplazar(s, Math.max(30_000, suya + 15_000));
      return true;
    }
    const bytes = await this.zip(s, f);
    if (!bytes) return true;
    let filas;
    try {
      const dentro = unzipSync(bytes, { filter: (a) => /\.txt$/i.test(a.name) && !/tercero/i.test(a.name) });
      filas = Object.values(dentro).flatMap((b) => leerLista(strFromU8(b)));
    } catch {
      this.terminar(s, 'error', { mensaje: 'la lista del SAT no se pudo abrir' });
      return true;
    }
    const desde = Number(s.cursor);
    const c = { revisadas: Number(s.revisadas), canceladas: Number(s.canceladas), faltantes: Number(s.faltantes), falta_desde: s.falta_desde as string | null, falta_hasta: s.falta_hasta as string | null };
    {
      for (const r of filas.slice(desde, desde + LOTE_LISTA)) {
        const aqui = this.una(`SELECT id, estado FROM cfdi WHERE uuid = ?`, r.uuid);
        if (aqui) {
          c.revisadas++;
          const a = this.e.anotarSat(String(aqui.id), r.vigente ? 'vigente' : 'cancelado');
          if (!esFalla(a) && a.cambio) c.canceladas++;
          continue;
        }
        // No está aquí. Cancelada: no hace falta. Un traslado, o la nómina
        // de alguien más: bill101 no los guarda (MotorFiscal.importar).
        if (!r.vigente || r.efecto === 'T' || (r.efecto === 'N' && s.lado === 'recibidas')) continue;
        c.faltantes++;
        const cuando = r.fecha.replace(' ', 'T').slice(0, 19);
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(cuando)) {
          if (!c.falta_desde || cuando < c.falta_desde) c.falta_desde = cuando;
          if (!c.falta_hasta || cuando > c.falta_hasta) c.falta_hasta = cuando;
        }
      }
    }
    if (desde + LOTE_LISTA < filas.length) { this.actualizar(s, { ...c, cursor: desde + LOTE_LISTA }); return true; }

    /* La lista trae vigentes que aquí no están: se piden ésas, una vez. Si
     * ya se pidió ese mismo tramo antes y siguen faltando, no se insiste
     * —cada periodo sólo se puede pedir dos veces en la vida—: se queda
     * dicho en el renglón cuántas faltan. */
    const ultimo = Number(s.paquete_n) + 1 >= (JSON.parse(String(s.paquetes || '[]')) as string[]).length;
    if (ultimo && c.faltantes > 0 && c.falta_desde && c.falta_hasta && s.motivo !== 'faltantes') {
      const d = masSegundos(c.falta_desde, -1);
      const tope = horaMx(Date.now() - 2 * MIN);
      const sube = masSegundos(c.falta_hasta, 1);
      const h = sube < tope ? sube : tope;
      const ya = this.una(`SELECT 1 AS x FROM sat_solicitudes WHERE motivo = 'faltantes' AND lado = ? AND desde = ? LIMIT 1`, String(s.lado), d);
      if (!ya && d < h) this.poner(ulid(), s.lado as Lado, 'cfdi', 'faltantes', d, h, { usuario_id: String(s.creada_por) });
    }
    await this.siguientePaquete(s, f, c);
    return true;
  }
}

export { ACTIVAS as ESTADOS_ACTIVOS };

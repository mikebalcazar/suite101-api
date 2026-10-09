/* bill101 — lo que se guarda de una factura y cómo cambia. Contrato 0.85.0.
 *
 * Es el motor de lo que bill101 le agrega a /orgs/:o/fiscal/*. Vive aparte
 * de `org-db.ts`, como el de patron101, y corre DENTRO del Durable Object:
 * recibe su SQLite y cuatro cosas más (la transacción, el RFC de la empresa,
 * y ligar y cancelar, que ya existían y siguen siendo de `org-db.ts`). No
 * sabe de Hono, de sesiones ni de R2: las rutas deciden quién puede y dónde
 * queda el archivo; aquí se decide qué es válido.
 *
 * LA REGLA QUE HEREDA (org/0009). No hay dos contabilidades. La factura vive
 * en `cfdi`, el dinero en `movimientos`, y la liga entre los dos en
 * `cfdi_movimientos`. Este archivo no crea movimientos nunca: una factura
 * que llega NO es dinero que se movió.
 *
 * LA REGLA NUEVA, que Mike escogió con botones: una factura recibida se
 * PROPONE contra el gasto que se le parece, y alguien confirma. Nunca se
 * liga sola por parecido —«el parecido propone, la persona dispone»—. La
 * única liga automática es la que no es parecido sino identidad: el
 * movimiento ya traía escrito el UUID de esa factura.
 *
 * Las fallas se devuelven, no se lanzan: `{ error, detalle }`.
 */

import type { CfdiLeido } from './cfdi-xml';
import {
  TRATOS, ejercicioVacio, isrAnual, isrProvisional, ivaDelAnio, mesesDe,
  type Ejercicio, type FacturaFiscal, type PagoDeFactura, type PagoDeImpuesto, type Trato,
} from './fiscal';
import { CATEGORIA_PRESTAMO_CAPITAL, CATEGORIA_PRESTAMO_RECIBIDO } from '../schema/tipos';
import { ahora, normalizar, ulid } from './lib';

type Fila = Record<string, any>;
export type Falla = { error: string; detalle?: unknown };
export const esFalla = (r: unknown): r is Falla => !!r && typeof r === 'object' && 'error' in (r as Fila) && typeof (r as Fila).error === 'string';

export interface Actor { usuario_id: string }

export interface EntornoFiscal {
  sql: SqlStorage;
  /** Todo o nada. */
  tx<T>(fn: () => T): T;
  /** El RFC de la empresa (`empresa.rfc`), o vacío si no lo han puesto. */
  rfcEmpresa(): string;
  /** Las dos de `org-db.ts` que ya sabían hacer esto (0009). */
  ligar(a: { cfdi_id: string; movimiento_id: string; monto_aplicado?: number }): Fila | Falla;
  cancelar(id: string): Fila | Falla;
}

export type Origen = 'xml' | 'sat' | 'timbrado';
export const ORIGENES: readonly Origen[] = ['xml', 'sat', 'timbrado'];

export interface ResultadoImportar {
  uuid: string;
  /** `nueva`: no estaba. `actualizada`: estaba tecleada a mano y ahora trae
   *  lo del XML. `repetida`: ya estaba completa, no se tocó. `rechazada`: no
   *  entró, y `motivo` dice por qué. */
  resultado: 'nueva' | 'actualizada' | 'repetida' | 'rechazada';
  motivo?: string;
  detalle?: unknown;
  id?: string;
  /** `emitida` o `recibida`, vista desde la empresa. */
  lado?: 'emitida' | 'recibida';
  tipo_comprobante?: string;
  contraparte?: string | null;
  fecha?: string;
  total?: number;
  /** Movimientos que quedaron ligados solos, porque ya traían este UUID. */
  ligada_a?: string[];
  /** Que a esta factura le falta guardar su archivo. */
  falta_xml?: boolean;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Hasta cuánto se toleran de diferencia un total y un pago para proponer
 *  la liga: un peso (Mike, 8-oct). */
export const TOLERANCIA_MONTO = 100;
/** Con esta cercanía de fechas la propuesta vale por sí sola. */
export const DIAS_CERCA = 5;
/** Hasta aquí se propone sólo si además coincide el nombre o el RFC: una
 *  factura a crédito se paga semanas después. */
export const DIAS_LEJOS = 45;

const PALABRAS_HUECAS = new Set(['sa', 'cv', 'de', 'rl', 'sapi', 'sab', 'sc', 'srl', 'the', 'del', 'los', 'las', 'grupo', 'comercializadora', 'servicios', 'mexico', 'compania', 'cia']);
const fichas = (s: unknown): string[] => normalizar(s).split(/[^a-z0-9]+/).filter((x) => x.length >= 4 && !PALABRAS_HUECAS.has(x));

const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);
const diasEntre = (a: string, b: string): number => Math.round(Math.abs(Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

export class MotorFiscal {
  private sql: SqlStorage;
  constructor(private e: EntornoFiscal) { this.sql = e.sql; }

  private una(sql: string, ...args: SqlStorageValue[]): Fila | undefined {
    return this.sql.exec(sql, ...args).toArray()[0] as Fila | undefined;
  }
  private todas(sql: string, ...args: SqlStorageValue[]): Fila[] {
    return this.sql.exec(sql, ...args).toArray() as Fila[];
  }
  private cfdi(id: string): Fila | undefined {
    return this.una(`SELECT * FROM cfdi WHERE id = ?`, id);
  }

  /* ─────────────── entrar: una factura leída de su XML ─────────────── */

  /** Mete a la base una tanda de facturas ya leídas. Cada una se resuelve
   *  por separado: que una no entre no detiene a las demás, y la respuesta
   *  dice qué pasó con cada una.
   *
   *  De qué lado está se decide por el RFC de la empresa, no por lo que diga
   *  quien la sube: si la empresa es el emisor, la emitió; si es el
   *  receptor, la recibió; si no es ninguno de los dos, NO ES SUYA y no
   *  entra. Sin RFC en la empresa no se puede saber, así que no entra
   *  ninguna y se dice qué falta. */
  importar(lista: CfdiLeido[], actor: Actor, origen: Origen = 'xml', rfcComo?: string): { rfc_empresa: string; resultados: ResultadoImportar[] } | Falla {
    // Como lo escribe la gente: «EKU-900317-3C9», con espacios. En el XML va corrido.
    // `rfcComo` (0.88.0): una cuenta de PRUEBAS de Facturama timbra con el RFC
    // del sandbox, no con el de la empresa; lo timbrado entra como si fuera suyo.
    const rfc = (rfcComo || this.e.rfcEmpresa()).toUpperCase().replace(/[\s.-]/g, '');
    if (!rfc) return { error: 'falta_rfc_empresa', detalle: { motivo: 'sin el RFC de la empresa no se sabe si una factura es emitida o recibida', donde: 'PATCH /orgs/:o/empresa { rfc }' } };
    if (!ORIGENES.includes(origen)) return { error: 'origen_invalido', detalle: { origen, acepta: ORIGENES } };
    const resultados: ResultadoImportar[] = [];
    for (const f of lista) resultados.push(this.e.tx(() => this.importarUna(f, rfc, actor, origen)));
    return { rfc_empresa: rfc, resultados };
  }

  private importarUna(f: CfdiLeido, rfc: string, actor: Actor, origen: Origen): ResultadoImportar {
    const base = { uuid: f.uuid, tipo_comprobante: f.tipo_comprobante, fecha: f.fecha, total: f.total };
    const emitida = f.emisor.rfc === rfc;
    if (!emitida && f.receptor.rfc !== rfc) {
      return { ...base, resultado: 'rechazada', motivo: 'no_es_de_la_empresa', detalle: { emisor: f.emisor.rfc, receptor: f.receptor.rfc, empresa: rfc } };
    }
    if (f.tipo_comprobante === 'T') return { ...base, resultado: 'rechazada', motivo: 'traslado_no_es_fiscal' };
    // Un recibo de nómina lo emite la empresa. Recibido no es un gasto suyo.
    if (f.tipo_comprobante === 'N' && !emitida) return { ...base, resultado: 'rechazada', motivo: 'nomina_ajena' };

    const lado: 'emitida' | 'recibida' = emitida ? 'emitida' : 'recibida';
    /* `tipo` (0009) es de qué lado está el DINERO para la empresa. Lo que
     * emite es ingreso, lo que recibe es egreso; la nómina, aunque la emita,
     * es dinero que sale. Que sea factura, nota de crédito o pago lo dice
     * `tipo_comprobante`. */
    const tipo = emitida && f.tipo_comprobante !== 'N' ? 'ingreso' : 'egreso';
    const contra = emitida ? f.receptor : f.emisor;
    const cuerpo = { ...base, lado, contraparte: contra.nombre ?? contra.rfc };

    const ya = this.una(`SELECT id, origen, xml_llave FROM cfdi WHERE uuid = ?`, f.uuid);
    if (ya && ya.origen && ya.origen !== 'manual') {
      return { ...cuerpo, resultado: 'repetida', id: String(ya.id), falta_xml: !ya.xml_llave };
    }

    const cols: Record<string, SqlStorageValue> = {
      rfc: contra.rfc, razon_social: contra.nombre, tipo,
      subtotal: f.subtotal, iva: f.iva, retenciones: f.iva_retenido + f.isr_retenido, total: f.total,
      fecha: f.fecha, forma_pago: f.forma_pago,
      origen, tipo_comprobante: f.tipo_comprobante, version: f.version, serie: f.serie, folio: f.folio,
      metodo_pago: f.metodo_pago, uso: f.receptor.uso, moneda: f.moneda, tipo_cambio: f.tipo_cambio,
      total_original: f.total_original, iva_retenido: f.iva_retenido, isr_retenido: f.isr_retenido, ieps: f.ieps,
      rfc_emisor: f.emisor.rfc, rfc_receptor: f.receptor.rfc, sello8: f.sello8, fecha_timbrado: f.fecha_timbrado,
    };
    const llaves = Object.keys(cols);
    const t = ahora();
    let id: string;
    if (ya) {
      // Estaba tecleada. Se queda con su id, sus ligas y su estado; gana los
      // datos del XML, que son los de verdad.
      id = String(ya.id);
      this.sql.exec(`UPDATE cfdi SET ${llaves.map((k) => `${k} = ?`).join(', ')}, actualizado_at = ? WHERE id = ?`, ...llaves.map((k) => cols[k]), t, id);
      this.sql.exec(`DELETE FROM cfdi_conceptos WHERE cfdi_id = ?`, id);
      this.sql.exec(`DELETE FROM cfdi_pagos WHERE cfdi_id = ?`, id);
    } else {
      id = ulid();
      this.sql.exec(
        `INSERT INTO cfdi (id, uuid, estado, creado_por, creado_at, ${llaves.join(', ')}) VALUES (?, ?, 'vigente', ?, ?, ${llaves.map(() => '?').join(', ')})`,
        id, f.uuid, actor.usuario_id, t, ...llaves.map((k) => cols[k]),
      );
    }
    f.conceptos.forEach((k, i) => {
      this.sql.exec(
        `INSERT INTO cfdi_conceptos (id, cfdi_id, orden, clave_prod_serv, clave_unidad, unidad, cantidad, descripcion, valor_unitario, importe, descuento, iva)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        ulid(), id, i, k.clave_prod_serv, k.clave_unidad, k.unidad, k.cantidad, k.descripcion, k.valor_unitario, k.importe, k.descuento, k.iva,
      );
    });
    for (const p of f.pagos) {
      this.sql.exec(
        `INSERT INTO cfdi_pagos (id, cfdi_id, uuid_docto, fecha, parcialidad, pagado, iva, creado_at) VALUES (?,?,?,?,?,?,?,?)`,
        ulid(), id, p.uuid_docto, p.fecha, p.parcialidad, p.pagado, p.iva, t,
      );
    }

    /* La única liga que se hace sola: el movimiento ya decía que su factura
     * era ésta. No es un parecido, es el mismo folio fiscal escrito dos
     * veces, y dejarlo sin ligar sería pedirle a alguien que confirme lo que
     * ya dijo. Sólo facturas (no complementos de pago ni nómina). */
    const ligada_a: string[] = [];
    if (f.tipo_comprobante === 'I') {
      const candidatos = this.todas(
        `SELECT m.id FROM movimientos m
          WHERE UPPER(TRIM(m.uuid_cfdi)) = ? AND m.tipo = ?
            AND NOT EXISTS (SELECT 1 FROM cfdi_movimientos lm WHERE lm.movimiento_id = m.id AND lm.cfdi_id = ?)`,
        f.uuid, tipo, id,
      );
      for (const m of candidatos) {
        const r = this.e.ligar({ cfdi_id: id, movimiento_id: String(m.id) });
        if (!esFalla(r)) ligada_a.push(String(m.id));
      }
    }
    return { ...cuerpo, resultado: ya ? 'actualizada' : 'nueva', id, ligada_a, falta_xml: !ya?.xml_llave };
  }

  /** Dónde quedó el archivo. Lo llama la ruta después de guardarlo en R2. */
  ponerArchivo(id: string, a: { xml_llave?: string | null; pdf_llave?: string | null }): Fila | Falla {
    if (!this.cfdi(id)) return { error: 'cfdi_desconocido' };
    if (a.xml_llave !== undefined) this.sql.exec(`UPDATE cfdi SET xml_llave = ? WHERE id = ?`, a.xml_llave, id);
    if (a.pdf_llave !== undefined) this.sql.exec(`UPDATE cfdi SET pdf_llave = ? WHERE id = ?`, a.pdf_llave, id);
    return this.forma(this.cfdi(id)!);
  }

  /** Lo mismo, para una tanda: una sola llamada después de subir todos. */
  ponerArchivos(lista: { id: string; xml_llave: string }[]): { puestos: number } {
    let puestos = 0;
    for (const a of lista.slice(0, 100)) {
      if (!this.cfdi(a.id)) continue;
      this.sql.exec(`UPDATE cfdi SET xml_llave = ? WHERE id = ?`, a.xml_llave, a.id);
      puestos++;
    }
    return { puestos };
  }

  /* ─────────────── leer ─────────────── */

  /** Una factura hacia afuera: con lo viejo dicho como lo que es (una fila
   *  tecleada antes de la 0044 es una factura normal, capturada a mano) y
   *  con cuánto de ella ya está ligado a dinero. */
  private forma(f: Fila): Fila {
    const aplicado = Number((this.una(`SELECT COALESCE(SUM(monto_aplicado),0) AS s FROM cfdi_movimientos WHERE cfdi_id = ?`, String(f.id)) as Fila).s);
    return {
      ...f,
      origen: f.origen ?? 'manual',
      tipo_comprobante: f.tipo_comprobante ?? 'I',
      trato: f.trato ?? 'normal',
      lado: f.tipo === 'ingreso' ? 'emitida' : (f.tipo_comprobante === 'N' ? 'emitida' : 'recibida'),
      aplicado,
      tiene_xml: !!f.xml_llave,
    };
  }

  detalle(id: string): Fila | null {
    const f = this.cfdi(id);
    if (!f) return null;
    const conceptos = this.todas(`SELECT * FROM cfdi_conceptos WHERE cfdi_id = ? ORDER BY orden`, id);
    /* Los dos sentidos del complemento de pago: si ésta ES un complemento,
     * qué facturas pagó; si es una factura, con qué complementos se pagó. */
    const paga = this.todas(
      `SELECT p.uuid_docto, p.fecha, p.parcialidad, p.pagado, p.iva, c.id AS cfdi_id, c.serie, c.folio, c.razon_social
         FROM cfdi_pagos p LEFT JOIN cfdi c ON c.uuid = p.uuid_docto WHERE p.cfdi_id = ? ORDER BY p.fecha`, id);
    const pagada_con = this.todas(
      `SELECT p.fecha, p.parcialidad, p.pagado, p.iva, c.id AS cfdi_id, c.uuid, c.serie, c.folio, c.estado
         FROM cfdi_pagos p JOIN cfdi c ON c.id = p.cfdi_id WHERE p.uuid_docto = ? ORDER BY p.fecha`, String(f.uuid));
    const movimientos = this.todas(
      `SELECT lm.movimiento_id, lm.monto_aplicado, m.fecha, m.monto, m.tipo, m.descripcion, m.contraparte_nombre, m.cuenta_id, m.proyecto_id
         FROM cfdi_movimientos lm JOIN movimientos m ON m.id = lm.movimiento_id WHERE lm.cfdi_id = ? ORDER BY m.fecha`, id);
    return { ...this.forma(f), conceptos, paga, pagada_con, movimientos };
  }

  /* ─────────────── la liga con el dinero ─────────────── */

  /** Para cada factura que todavía no está cubierta por dinero, los
   *  movimientos que se le parecen. NO liga nada: propone.
   *
   *  Un movimiento es candidato si es del mismo lado (cobro contra emitida,
   *  pago contra recibida), no es un traspaso ni un préstamo, no está ligado
   *  ya a otra factura VIGENTE (el pago de una que se canceló vuelve a estar
   *  libre: es justo el que hay que proponerle a la que la sustituye), y su monto es el que le falta a la factura con un
   *  peso de tolerancia. De ésos:
   *    · a cinco días o menos: se propone (`alta`);
   *    · hasta cuarenta y cinco: sólo si además coincide el nombre o el RFC
   *      de la contraparte (`media`) —una factura a crédito se paga semanas
   *      después, pero a esa distancia el monto solo ya no alcanza—.
   *  Lo que no cabe ahí (un pago que cubre tres facturas, un anticipo) se
   *  liga a mano, con su monto, por la ruta de siempre. */
  sugerencias(filtro: { cfdi_id?: string; limite?: number } = {}): Fila[] {
    const limite = Math.min(Math.max(1, entero(filtro.limite) ?? 200), 500);
    const facturas = filtro.cfdi_id
      ? this.todas(`SELECT * FROM cfdi WHERE id = ?`, filtro.cfdi_id)
      : this.todas(
          `SELECT c.* FROM cfdi c
            WHERE c.estado = 'vigente' AND COALESCE(c.tipo_comprobante, 'I') = 'I' AND c.total > 0
              AND c.total - (SELECT COALESCE(SUM(lm.monto_aplicado),0) FROM cfdi_movimientos lm WHERE lm.cfdi_id = c.id) > ?
            ORDER BY c.fecha DESC, c.creado_at DESC LIMIT ?`,
          TOLERANCIA_MONTO, limite,
        );
    /* El RFC y el nombre de la contraparte se leen del catálogo, no sólo de
     * lo que el movimiento traiga escrito: `contraparte_nombre` lo pone la
     * app que capturó, y muchas veces viene vacío. */
    const rfcDe = new Map<string, string>();
    const nombreDe = new Map<string, string>();
    for (const t of ['clientes', 'proveedores']) {
      for (const r of this.todas(`SELECT id, nombre, rfc FROM ${t}`)) {
        nombreDe.set(String(r.id), String(r.nombre ?? ''));
        if (r.rfc) rfcDe.set(String(r.id), String(r.rfc).trim().toUpperCase());
      }
    }
    const salida: Fila[] = [];
    for (const f of facturas) {
      if (f.estado !== 'vigente' || (f.tipo_comprobante ?? 'I') !== 'I') continue;
      const aplicado = Number((this.una(`SELECT COALESCE(SUM(monto_aplicado),0) AS s FROM cfdi_movimientos WHERE cfdi_id = ?`, String(f.id)) as Fila).s);
      const restante = Number(f.total) - aplicado;
      if (restante <= TOLERANCIA_MONTO) continue;
      const movs = this.todas(
        `SELECT m.id, m.fecha, m.monto, m.tipo, m.descripcion, m.contraparte_tipo, m.contraparte_id, m.contraparte_nombre,
                m.cuenta_id, m.proyecto_id, m.facturado, m.requiere_factura
           FROM movimientos m
          WHERE m.tipo = ? AND m.transfer_id IS NULL
            AND COALESCE(m.categoria, '') NOT IN (?, ?)
            AND ABS(m.monto - ?) <= ?
            AND m.fecha >= date(?, ?) AND m.fecha <= date(?, ?)
            AND NOT EXISTS (SELECT 1 FROM cfdi_movimientos lm JOIN cfdi k ON k.id = lm.cfdi_id
                             WHERE lm.movimiento_id = m.id AND k.estado = 'vigente')`,
        String(f.tipo), CATEGORIA_PRESTAMO_RECIBIDO, CATEGORIA_PRESTAMO_CAPITAL,
        restante, TOLERANCIA_MONTO,
        String(f.fecha), `-${DIAS_LEJOS} days`, String(f.fecha), `+${DIAS_LEJOS} days`,
      );
      const delNombre = fichas(f.razon_social);
      const rfc = String(f.rfc ?? '').trim().toUpperCase();
      const candidatos = movs
        .map((m) => {
          const dias = diasEntre(String(m.fecha), String(f.fecha));
          const suyo = fichas(`${m.contraparte_nombre ?? ''} ${nombreDe.get(String(m.contraparte_id ?? '')) ?? ''} ${m.descripcion ?? ''}`);
          const mismoRfc = !!rfc && rfcDe.get(String(m.contraparte_id ?? '')) === rfc;
          const coincide_nombre = mismoRfc || delNombre.some((x) => suyo.includes(x));
          const confianza = dias <= DIAS_CERCA ? 'alta' : coincide_nombre ? 'media' : null;
          return { movimiento: { ...m, facturado: !!m.facturado, requiere_factura: !!m.requiere_factura }, dias, coincide_nombre, mismo_rfc: mismoRfc, confianza, diferencia: Number(m.monto) - restante };
        })
        .filter((x) => x.confianza)
        .sort((a, b) => Number(b.confianza === 'alta') - Number(a.confianza === 'alta') || Number(b.coincide_nombre) - Number(a.coincide_nombre) || a.dias - b.dias);
      if (candidatos.length || filtro.cfdi_id) salida.push({ cfdi: this.forma(f), restante, candidatos });
    }
    return salida;
  }

  /** Deshacer una liga. Quien confirma se puede equivocar, y sin esto la
   *  única salida era cancelar la factura. El movimiento vuelve a estar sin
   *  facturar sólo si ninguna otra factura vigente lo respalda. */
  desligar(a: { cfdi_id: string; movimiento_id: string }): { ok: true; cfdi: Fila; movimiento_facturado: boolean } | Falla {
    const f = this.cfdi(a.cfdi_id);
    if (!f) return { error: 'cfdi_desconocido' };
    const liga = this.una(`SELECT 1 AS x FROM cfdi_movimientos WHERE cfdi_id = ? AND movimiento_id = ?`, a.cfdi_id, a.movimiento_id);
    if (!liga) return { error: 'liga_desconocida', detalle: a };
    let facturado = false;
    this.e.tx(() => {
      this.sql.exec(`DELETE FROM cfdi_movimientos WHERE cfdi_id = ? AND movimiento_id = ?`, a.cfdi_id, a.movimiento_id);
      const vivas = this.todas(
        `SELECT c.uuid, c.fecha FROM cfdi_movimientos lm JOIN cfdi c ON c.id = lm.cfdi_id WHERE lm.movimiento_id = ? AND c.estado = 'vigente'`, a.movimiento_id);
      if (vivas.length === 0) {
        this.sql.exec(`UPDATE movimientos SET facturado = 0, uuid_cfdi = NULL, fecha_cfdi = NULL WHERE id = ?`, a.movimiento_id);
      } else {
        facturado = true;
        // Con una sola que queda, el hueco del movimiento vuelve a decir cuál.
        if (vivas.length === 1) this.sql.exec(`UPDATE movimientos SET uuid_cfdi = ?, fecha_cfdi = ? WHERE id = ?`, String(vivas[0].uuid), String(vivas[0].fecha), a.movimiento_id);
      }
    });
    return { ok: true, cfdi: this.forma(this.cfdi(a.cfdi_id)!), movimiento_facturado: facturado };
  }

  /** Cómo cuenta una factura recibida para los impuestos. */
  tratar(id: string, trato: unknown): Fila | Falla {
    const f = this.cfdi(id);
    if (!f) return { error: 'cfdi_desconocido' };
    if (!TRATOS.includes(trato as Trato)) return { error: 'trato_invalido', detalle: { trato, acepta: TRATOS } };
    if (f.tipo !== 'egreso') return { error: 'solo_recibidas', detalle: { motivo: 'cómo se deduce sólo aplica a lo que la empresa recibe' } };
    this.sql.exec(`UPDATE cfdi SET trato = ?, actualizado_at = ? WHERE id = ?`, trato === 'normal' ? null : String(trato), ahora(), id);
    return this.forma(this.cfdi(id)!);
  }

  /* ─────────────── lo que contestó el SAT ─────────────── */

  /** Las facturas a las que toca preguntarle al SAT: primero las que nunca
   *  se han revisado, luego las que llevan más tiempo sin revisar. Una
   *  tecleada a mano no trae con qué preguntar (faltan los dos RFC y el
   *  total como venía) y no sale aquí. */
  porVerificar(a: { ids?: string[]; limite?: number } = {}): Fila[] {
    const campos = `id, uuid, rfc_emisor, rfc_receptor, total_original, sello8, estado, estado_sat, sat_revisado_at`;
    if (a.ids?.length) {
      const ids = a.ids.slice(0, 50);
      return this.todas(`SELECT ${campos} FROM cfdi WHERE id IN (${ids.map(() => '?').join(',')}) AND rfc_emisor IS NOT NULL AND total_original IS NOT NULL`, ...ids);
    }
    const limite = Math.min(Math.max(1, entero(a.limite) ?? 20), 50);
    return this.todas(
      `SELECT ${campos} FROM cfdi
        WHERE estado = 'vigente' AND rfc_emisor IS NOT NULL AND total_original IS NOT NULL
        ORDER BY (sat_revisado_at IS NOT NULL), sat_revisado_at, fecha DESC LIMIT ?`, limite);
  }

  /** Anota la respuesta del SAT. Si dice CANCELADA y aquí seguía vigente, se
   *  cancela aquí también —con la misma regla de siempre: no se borra, sale
   *  de los impuestos y los pagos que sólo ella respaldaba vuelven a estar
   *  sin facturar—. «No encontrada» NO cancela nada: el SAT tarda hasta tres
   *  días en reconocer una factura recién timbrada. */
  anotarSat(id: string, r: { estado: 'vigente' | 'cancelado' | 'no_encontrado' }): { cfdi: Fila; cambio: boolean } | Falla {
    const f = this.cfdi(id);
    if (!f) return { error: 'cfdi_desconocido' };
    if (!['vigente', 'cancelado', 'no_encontrado'].includes(r.estado)) return { error: 'estado_sat_invalido', detalle: { estado: r.estado } };
    let cambio = false;
    this.e.tx(() => {
      this.sql.exec(`UPDATE cfdi SET estado_sat = ?, sat_revisado_at = ? WHERE id = ?`, r.estado, ahora(), id);
      if (r.estado === 'cancelado' && f.estado === 'vigente') cambio = !esFalla(this.e.cancelar(id));
      /* Una cancelación que se pidió por Facturama y esperaba al receptor
       * (0.88.0): lo que diga el SAT la resuelve. Cancelada: quedó. Sigue
       * vigente: el receptor no la aceptó, o aún no. */
      if (f.cancelacion === 'pendiente') {
        if (r.estado === 'cancelado') this.sql.exec(`UPDATE cfdi SET cancelacion = 'cancelada' WHERE id = ?`, id);
        else if (r.estado === 'vigente' && f.actualizado_at && Date.now() - Date.parse(String(f.actualizado_at)) > 4 * 86_400_000) this.sql.exec(`UPDATE cfdi SET cancelacion = 'rechazada' WHERE id = ?`, id);
      }
    });
    return { cfdi: this.forma(this.cfdi(id)!), cambio };
  }

  /* ─────────────── el estado de cuenta fiscal ─────────────── */

  /** Mike, 8-oct: «un estado de cuenta de movimientos exclusivamente
   *  fiscales (solo facturados, ingresos y egresos)».
   *
   *  Un renglón por factura vigente del rango —la nota de crédito en
   *  negativo, del lado en que está—, con cuánto de ella ya está cubierto
   *  por dinero y un saldo corrido. Los complementos de pago no son
   *  renglón: no son ni ingreso ni gasto, dicen cuándo se pagó otra.
   *
   *  Y aparte, porque es lo que hay que arreglar: los movimientos que
   *  alguien marcó «facturado» sin que haya factura cargada. Ésos NO suman
   *  aquí ni en los impuestos —la cuenta sale de las facturas, como desde la
   *  0009—; se enseñan para que se les cargue la suya. */
  estadoDeCuenta(desde: string, hasta: string): Fila {
    const d = String(desde).slice(0, 10), h = String(hasta).slice(0, 10);
    const filas = this.todas(
      `SELECT c.*, (SELECT COALESCE(SUM(lm.monto_aplicado),0) FROM cfdi_movimientos lm WHERE lm.cfdi_id = c.id) AS aplicado
         FROM cfdi c
        WHERE c.estado = 'vigente' AND c.fecha >= ? AND c.fecha <= ? AND COALESCE(c.tipo_comprobante, 'I') IN ('I','E','N')
        ORDER BY c.fecha, c.creado_at`, d, h);
    const cero = () => ({ facturas: 0, subtotal: 0, iva: 0, retenciones: 0, total: 0 });
    const ingresos = cero(), egresos = cero();
    let saldo = 0;
    const renglones = filas.map((f) => {
      const tc = String(f.tipo_comprobante ?? 'I');
      const s = tc === 'E' ? -1 : 1;
      const lado = f.tipo === 'ingreso' ? ingresos : egresos;
      const subtotal = s * Number(f.subtotal), iva = s * Number(f.iva), retenciones = s * Number(f.retenciones), total = s * Number(f.total);
      lado.facturas += 1; lado.subtotal += subtotal; lado.iva += iva; lado.retenciones += retenciones; lado.total += total;
      saldo += f.tipo === 'ingreso' ? total : -total;
      return {
        id: f.id, uuid: f.uuid, fecha: f.fecha, tipo: f.tipo, tipo_comprobante: tc,
        serie: f.serie ?? null, folio: f.folio ?? null, rfc: f.rfc ?? null, razon_social: f.razon_social ?? null,
        metodo_pago: f.metodo_pago ?? null, subtotal, iva, retenciones, total,
        aplicado: Number(f.aplicado), origen: f.origen ?? 'manual', trato: f.trato ?? 'normal',
        estado_sat: f.estado_sat ?? null, tiene_xml: !!f.xml_llave, saldo,
      };
    });
    const cuenta = (sql: string, ...a: SqlStorageValue[]) => Number((this.una(sql, ...a) as Fila).n);
    const sueltos = this.todas(
      `SELECT m.id, m.fecha, m.tipo, m.monto, m.descripcion, m.contraparte_nombre, m.uuid_cfdi
         FROM movimientos m
        WHERE m.facturado = 1 AND m.fecha >= ? AND m.fecha <= ?
          AND NOT EXISTS (SELECT 1 FROM cfdi_movimientos lm JOIN cfdi c ON c.id = lm.cfdi_id WHERE lm.movimiento_id = m.id AND c.estado = 'vigente')
        ORDER BY m.fecha LIMIT 200`, d, h);
    return {
      desde: d, hasta: h,
      renglones,
      ingresos, egresos,
      neto: { subtotal: ingresos.subtotal - egresos.subtotal, iva: ingresos.iva - egresos.iva, total: ingresos.total - egresos.total },
      complementos_de_pago: cuenta(`SELECT COUNT(*) AS n FROM cfdi WHERE estado = 'vigente' AND tipo_comprobante = 'P' AND fecha >= ? AND fecha <= ?`, d, h),
      canceladas: cuenta(`SELECT COUNT(*) AS n FROM cfdi WHERE estado = 'cancelada' AND fecha >= ? AND fecha <= ?`, d, h),
      marcados_sin_factura: {
        movimientos: sueltos.length,
        total: sueltos.reduce((s, m) => s + Number(m.monto), 0),
        ingresos: sueltos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0),
        egresos: sueltos.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0),
        filas: sueltos,
      },
    };
  }

  /* ─────────────── los impuestos ─────────────── */

  /** Las facturas vigentes que le importan a un año, dichas como las pide
   *  `src/fiscal.ts`. Se traen desde dos años antes: una factura a crédito
   *  de diciembre que se cobra en enero cuenta su IVA en enero. */
  private facturasPara(anio: number): FacturaFiscal[] {
    const filas = this.todas(
      `SELECT id, uuid, tipo, tipo_comprobante, fecha, metodo_pago, subtotal, iva, retenciones, iva_retenido, isr_retenido, total, trato
         FROM cfdi WHERE estado = 'vigente' AND fecha >= ? AND fecha <= ?`, `${anio - 2}-01-01`, `${anio}-12-31`);
    /* Con qué se pagó cada una. Manda el complemento de pago, que es el
     * papel fiscal; si no hay ninguno, el dinero que se le ligó. No se
     * suman los dos: sería contar el mismo pago dos veces. */
    const porRep = new Map<string, PagoDeFactura[]>();
    for (const p of this.todas(`SELECT p.uuid_docto, p.fecha, p.pagado, p.iva FROM cfdi_pagos p JOIN cfdi c ON c.id = p.cfdi_id WHERE c.estado = 'vigente'`)) {
      const k = String(p.uuid_docto);
      if (!porRep.has(k)) porRep.set(k, []);
      porRep.get(k)!.push({ fecha: String(p.fecha), monto: Number(p.pagado), iva: p.iva === null ? null : Number(p.iva) });
    }
    const porDinero = new Map<string, PagoDeFactura[]>();
    for (const l of this.todas(`SELECT lm.cfdi_id, lm.monto_aplicado, m.fecha FROM cfdi_movimientos lm JOIN movimientos m ON m.id = lm.movimiento_id`)) {
      const k = String(l.cfdi_id);
      if (!porDinero.has(k)) porDinero.set(k, []);
      porDinero.get(k)!.push({ fecha: String(l.fecha), monto: Number(l.monto_aplicado) });
    }
    return filas.map((f) => {
      const tc = (f.tipo_comprobante ?? 'I') as FacturaFiscal['tc'];
      const lado = f.tipo as 'ingreso' | 'egreso';
      /* Una fila tecleada antes de la 0044 sólo trae `retenciones`, sin
       * decir de qué impuesto. En las recibidas se toma como IVA retenido,
       * que es lo que hace `ivaDelMes` desde la 0009: la misma factura da el
       * mismo número por las dos rutas. */
      const sinDesglose = f.iva_retenido === null && f.isr_retenido === null;
      return {
        id: String(f.id), lado, tc, fecha: String(f.fecha), metodo: f.metodo_pago ?? null,
        subtotal: Number(f.subtotal), iva: Number(f.iva), total: Number(f.total),
        iva_retenido: sinDesglose ? (lado === 'egreso' ? Number(f.retenciones || 0) : 0) : Number(f.iva_retenido || 0),
        isr_retenido: Number(f.isr_retenido || 0),
        trato: (f.trato ?? 'normal') as Trato,
        pagos: porRep.get(String(f.uuid)) ?? porDinero.get(String(f.id)) ?? [],
      };
    });
  }

  ejercicio(anio: number): Ejercicio & { nota: string | null; guardado: boolean } {
    const f = this.una(`SELECT * FROM fiscal_ejercicios WHERE anio = ?`, anio);
    if (!f) return { ...ejercicioVacio(anio), nota: null, guardado: false };
    return {
      anio, coeficiente: f.coeficiente === null ? null : Number(f.coeficiente), tasa_isr: Number(f.tasa_isr),
      perdidas: Number(f.perdidas), iva_a_favor_inicial: Number(f.iva_a_favor_inicial),
      ajuste_deducciones: Number(f.ajuste_deducciones), ajuste_ingresos: Number(f.ajuste_ingresos),
      nota: f.nota ?? null, guardado: true,
    };
  }

  /** Cambia lo que venga; lo demás se queda. */
  guardarEjercicio(anio: number, d: Fila, actor: Actor): Fila | Falla {
    if (!Number.isInteger(anio) || anio < 2017 || anio > 2100) return { error: 'anio_invalido', detalle: { anio } };
    const antes = this.ejercicio(anio);
    const nuevo: Fila = { ...antes };
    if (d.coeficiente !== undefined) {
      if (d.coeficiente === null || d.coeficiente === '') nuevo.coeficiente = null;
      else {
        const c = entero(d.coeficiente);
        // En diezmilésimas: 523 es 0.0523. Un coeficiente no llega a 1.
        if (c === null || c < 0 || c >= 10000) return { error: 'coeficiente_invalido', detalle: { recibido: d.coeficiente, forma: 'entero en diezmilésimas: 523 = 0.0523' } };
        nuevo.coeficiente = c;
      }
    }
    if (d.tasa_isr !== undefined) {
      const t = entero(d.tasa_isr);
      if (t === null || t < 0 || t > 10000) return { error: 'tasa_invalida', detalle: { recibido: d.tasa_isr, forma: 'puntos base: 3000 = 30 %' } };
      nuevo.tasa_isr = t;
    }
    for (const k of ['perdidas', 'iva_a_favor_inicial', 'ajuste_deducciones', 'ajuste_ingresos'] as const) {
      if (d[k] === undefined) continue;
      const v = entero(d[k]);
      if (v === null || v < 0) return { error: 'monto_invalido', detalle: { campo: k, recibido: d[k], forma: 'centavos, entero, no negativo' } };
      nuevo[k] = v;
    }
    if (d.nota !== undefined) nuevo.nota = String(d.nota ?? '').trim().slice(0, 1000) || null;
    this.sql.exec(
      `INSERT INTO fiscal_ejercicios (anio, coeficiente, tasa_isr, perdidas, iva_a_favor_inicial, ajuste_deducciones, ajuste_ingresos, nota, actualizado_por, actualizado_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(anio) DO UPDATE SET coeficiente = excluded.coeficiente, tasa_isr = excluded.tasa_isr, perdidas = excluded.perdidas,
         iva_a_favor_inicial = excluded.iva_a_favor_inicial, ajuste_deducciones = excluded.ajuste_deducciones,
         ajuste_ingresos = excluded.ajuste_ingresos, nota = excluded.nota, actualizado_por = excluded.actualizado_por, actualizado_at = excluded.actualizado_at`,
      anio, nuevo.coeficiente, nuevo.tasa_isr, nuevo.perdidas, nuevo.iva_a_favor_inicial, nuevo.ajuste_deducciones, nuevo.ajuste_ingresos, nuevo.nota, actor.usuario_id, ahora(),
    );
    return this.ejercicio(anio);
  }

  pagos(anio?: number): Fila[] {
    return anio
      ? this.todas(`SELECT * FROM fiscal_pagos WHERE periodo = ? OR periodo LIKE ? ORDER BY periodo, fecha`, String(anio), `${anio}-%`)
      : this.todas(`SELECT * FROM fiscal_pagos ORDER BY periodo DESC, fecha DESC LIMIT 500`);
  }

  registrarPago(d: Fila, actor: Actor): Fila | Falla {
    const impuesto = String(d.impuesto ?? '');
    if (!['iva', 'isr_provisional', 'isr_anual'].includes(impuesto)) return { error: 'impuesto_invalido', detalle: { impuesto, acepta: ['iva', 'isr_provisional', 'isr_anual'] } };
    const periodo = String(d.periodo ?? '').trim();
    const forma = impuesto === 'isr_anual' ? /^\d{4}$/ : /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!forma.test(periodo)) return { error: 'periodo_invalido', detalle: { periodo, forma: impuesto === 'isr_anual' ? 'AAAA' : 'AAAA-MM' } };
    const monto = entero(d.monto);
    if (monto === null || monto <= 0) return { error: 'monto_invalido', detalle: { recibido: d.monto, forma: 'centavos, entero, mayor que cero' } };
    const fecha = String(d.fecha ?? '').slice(0, 10);
    if (!DIA.test(fecha)) return { error: 'fecha_invalida', detalle: { fecha: d.fecha ?? null } };
    const movimiento_id = typeof d.movimiento_id === 'string' && d.movimiento_id ? d.movimiento_id : null;
    if (movimiento_id && !this.una(`SELECT 1 AS x FROM movimientos WHERE id = ?`, movimiento_id)) return { error: 'movimiento_desconocido' };
    const id = ulid();
    this.sql.exec(
      `INSERT INTO fiscal_pagos (id, impuesto, periodo, monto, fecha, nota, movimiento_id, creado_por, creado_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      id, impuesto, periodo, monto, fecha, String(d.nota ?? '').trim().slice(0, 500) || null, movimiento_id, actor.usuario_id, ahora(),
    );
    return this.una(`SELECT * FROM fiscal_pagos WHERE id = ?`, id)!;
  }

  borrarPago(id: string): { borrado: true } | Falla {
    if (!this.una(`SELECT 1 AS x FROM fiscal_pagos WHERE id = ?`, id)) return { error: 'pago_desconocido' };
    this.sql.exec(`DELETE FROM fiscal_pagos WHERE id = ?`, id);
    return { borrado: true };
  }

  /** Todo lo de un año en una respuesta: los doce meses de IVA, los doce de
   *  ISR provisional y la anual, con lo que se usó para sacarlos. La
   *  pantalla no hace cuentas. */
  impuestos(anio: number): Fila | Falla {
    if (!Number.isInteger(anio) || anio < 2017 || anio > 2100) return { error: 'anio_invalido', detalle: { anio } };
    const facturas = this.facturasPara(anio);
    const ej = this.ejercicio(anio);
    const pagos = this.pagos(anio);
    const dePago: PagoDeImpuesto[] = pagos.map((p) => ({ impuesto: p.impuesto, periodo: String(p.periodo), monto: Number(p.monto) }));
    const iva = ivaDelAnio(facturas, anio, ej.iva_a_favor_inicial);
    const isr = isrProvisional(facturas, ej, dePago);
    const pagado = (impuesto: string, periodo: string) => pagos.filter((p) => p.impuesto === impuesto && p.periodo === periodo).reduce((s, p) => s + Number(p.monto), 0);
    const cuenta = (sql: string, ...a: SqlStorageValue[]) => Number((this.una(sql, ...a) as Fila).n);
    const d = `${anio}-01-01`, h = `${anio}-12-31`;
    return {
      anio,
      ejercicio: ej,
      meses: mesesDe(anio).map((mes, i) => ({
        mes,
        iva: { ...iva.meses[i], pagado: pagado('iva', mes) },
        isr: { ...isr[i], pagado: pagado('isr_provisional', mes) },
        /* Lo que le toca a ese mes, junto: el IVA a pagar más el ISR del
         * mes. Va aquí para que ninguna pantalla lo sume por su cuenta. */
        a_pagar_estimado: iva.meses[i].a_pagar + isr[i].del_mes,
      })),
      iva_pendiente: { por_cobrar: iva.por_cobrar, por_pagar: iva.por_pagar },
      anual: { ...isrAnual(facturas, ej, dePago), pagado: pagado('isr_anual', String(anio)) },
      pagos,
      /* Lo que puede estar torciendo la cuenta, contado. Cada uno es algo
       * que se arregla en una pantalla; ninguno detiene el cálculo. */
      avisos: {
        falta_coeficiente: ej.coeficiente === null,
        sin_revisar_en_sat: cuenta(`SELECT COUNT(*) AS n FROM cfdi WHERE estado = 'vigente' AND fecha >= ? AND fecha <= ? AND rfc_emisor IS NOT NULL AND sat_revisado_at IS NULL`, d, h),
        no_encontradas_en_sat: cuenta(`SELECT COUNT(*) AS n FROM cfdi WHERE estado = 'vigente' AND fecha >= ? AND fecha <= ? AND estado_sat = 'no_encontrado'`, d, h),
        capturadas_a_mano: cuenta(`SELECT COUNT(*) AS n FROM cfdi WHERE estado = 'vigente' AND fecha >= ? AND fecha <= ? AND COALESCE(origen, 'manual') = 'manual'`, d, h),
        credito_sin_pago: cuenta(
          `SELECT COUNT(*) AS n FROM cfdi c WHERE c.estado = 'vigente' AND c.fecha >= ? AND c.fecha <= ? AND UPPER(COALESCE(c.metodo_pago,'')) = 'PPD'
             AND COALESCE(c.tipo_comprobante,'I') = 'I'
             AND NOT EXISTS (SELECT 1 FROM cfdi_pagos p JOIN cfdi k ON k.id = p.cfdi_id WHERE p.uuid_docto = c.uuid AND k.estado = 'vigente')
             AND NOT EXISTS (SELECT 1 FROM cfdi_movimientos lm WHERE lm.cfdi_id = c.id)`, d, h),
      },
      nota: 'Estimación con lo facturado. No es la declaración ni sustituye al contador.',
    };
  }

  /* ─────────────── con qué datos factura la empresa ─────────────── */

  config(): Fila {
    const f = this.una(`SELECT * FROM fiscal_config WHERE id = 'fiscal'`);
    return {
      rfc: this.e.rfcEmpresa().toUpperCase().replace(/[\s.-]/g, '') || null,
      regimen: f?.regimen ?? null, razon_social: f?.razon_social ?? null, cp: f?.cp ?? null,
      actualizado_at: f?.actualizado_at ?? null,
    };
  }

  guardarConfig(d: Fila, actor: Actor): Fila | Falla {
    const antes = this.config();
    const nuevo: Fila = { regimen: antes.regimen, razon_social: antes.razon_social, cp: antes.cp };
    if (d.regimen !== undefined) {
      const r = String(d.regimen ?? '').trim();
      if (r && !/^\d{3}$/.test(r)) return { error: 'regimen_invalido', detalle: { recibido: d.regimen, forma: 'la clave del SAT, tres dígitos: 601' } };
      nuevo.regimen = r || null;
    }
    if (d.cp !== undefined) {
      const cp = String(d.cp ?? '').trim();
      if (cp && !/^\d{5}$/.test(cp)) return { error: 'cp_invalido', detalle: { recibido: d.cp, forma: 'cinco dígitos' } };
      nuevo.cp = cp || null;
    }
    if (d.razon_social !== undefined) nuevo.razon_social = String(d.razon_social ?? '').trim().slice(0, 300) || null;
    this.sql.exec(
      `INSERT INTO fiscal_config (id, regimen, razon_social, cp, actualizado_por, actualizado_at) VALUES ('fiscal', ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET regimen = excluded.regimen, razon_social = excluded.razon_social, cp = excluded.cp,
         actualizado_por = excluded.actualizado_por, actualizado_at = excluded.actualizado_at`,
      nuevo.regimen, nuevo.razon_social, nuevo.cp, actor.usuario_id, ahora(),
    );
    return this.config();
  }
}

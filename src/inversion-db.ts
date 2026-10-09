/* investor101 — lo que se guarda y cómo cambia (contrato 0.82.0).
 *
 * Es el motor de /orgs/:o/inversion/*. Vive aparte de `org-db.ts` —que ya
 * pasa de cinco mil renglones— y corre DENTRO del Durable Object: recibe su
 * SQLite y tres cosas más (la transacción, el consecutivo y el aviso). No
 * sabe de Hono, de sesiones ni de correos: las rutas deciden quién puede y
 * este archivo decide qué es válido.
 *
 * Todo es síncrono, como el SQLite del objeto: un solo hilo por empresa, así
 * que dos personas aprobando la misma oferta a la vez no crean dos préstamos.
 *
 * Las fallas se devuelven, no se lanzan: `{ error, detalle }`, igual que las
 * órdenes de compra. La ruta escoge el código HTTP.
 */

import {
  CATEGORIA_PRESTAMO_CAPITAL, CATEGORIA_PRESTAMO_INTERES, CATEGORIA_PRESTAMO_RECIBIDO, CONTRAPARTE_INVERSIONISTA,
  type CondicionesPrestamo,
} from '../schema/tipos';
import { RIESGOS_BASE, RIESGOS_MAX, esDia, revisarCondiciones, sumarDias, tablaDePagos, totalesDe } from './inversion';
import { ahora, correoValido, normalizaCorreo, normalizar, ulid } from './lib';

type Fila = Record<string, any>;
export type Falla = { error: string; detalle?: unknown };
export const esFalla = (r: unknown): r is Falla => !!r && typeof r === 'object' && 'error' in (r as Fila) && typeof (r as Fila).error === 'string';

export interface Actor { usuario_id: string; nombre: string | null }

export interface Entorno {
  sql: SqlStorage;
  /** Todo o nada. */
  tx<T>(fn: () => T): T;
  /** El consecutivo de la empresa (`folios`). */
  apartarNumero(serie: string): number;
  /** Avisar por WebSocket que hay un movimiento nuevo (dash101 lo escucha). */
  alMover?(movimiento_id: string): void;
}

const BOOLS: Record<string, string[]> = {
  inversionistas: ['recibe_avisos', 'activo'],
  prestamos: ['tabla_editada'],
};
const JSONS: Record<string, string[]> = { rondas: ['origen'], inversion_eventos: ['datos'] };

const CONDICIONES = ['tipo_tasa', 'tasa_pb', 'esquema', 'frecuencia', 'num_pagos', 'fecha_inicio', 'fecha_primer_pago', 'fecha_vencimiento'] as const;

const texto = (v: unknown, tope = 500): string | null => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, tope) : null;
};
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

export class MotorInversion {
  private sql: SqlStorage;
  constructor(private e: Entorno) { this.sql = e.sql; }

  /* ─────────────── lectura ─────────────── */

  private forma(tabla: string, f: Fila | undefined | null): Fila | null {
    if (!f) return null;
    const out: Fila = { ...f };
    for (const b of BOOLS[tabla] ?? []) if (out[b] !== undefined && out[b] !== null) out[b] = out[b] === 1 || out[b] === true;
    for (const j of JSONS[tabla] ?? []) {
      if (typeof out[j] === 'string') { try { out[j] = JSON.parse(out[j]); } catch { out[j] = null; } }
    }
    return out;
  }
  private una(tabla: string, id: string): Fila | null {
    return this.forma(tabla, this.sql.exec(`SELECT * FROM ${tabla} WHERE id = ?`, id).toArray()[0] as Fila | undefined);
  }
  private varias(tabla: string, consulta: string, ...args: unknown[]): Fila[] {
    return (this.sql.exec(consulta, ...args).toArray() as Fila[]).map((f) => this.forma(tabla, f)!);
  }
  private numero(consulta: string, ...args: unknown[]): number {
    const f = this.sql.exec(consulta, ...args).toArray()[0] as Fila | undefined;
    return Number(f ? Object.values(f)[0] ?? 0 : 0);
  }

  private apuntar(a: { que: string; actor: Actor; ronda_id?: string | null; prestamo_id?: string | null; inversionista_id?: string | null; nota?: string | null; datos?: unknown }): void {
    this.sql.exec(
      `INSERT INTO inversion_eventos (id, ronda_id, prestamo_id, inversionista_id, que, quien_usuario_id, quien_nombre, nota, datos, ts) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ulid(), a.ronda_id ?? null, a.prestamo_id ?? null, a.inversionista_id ?? null, a.que,
      a.actor.usuario_id, a.actor.nombre ?? null, a.nota ?? null, a.datos === undefined ? null : JSON.stringify(a.datos), ahora(),
    );
  }

  private folio(serie: 'RON' | 'PRE'): string {
    return `${serie}-${String(this.e.apartarNumero(serie)).padStart(6, '0')}`;
  }

  /* ─────────────── el directorio ─────────────── */

  private revisarPersona(d: Fila, id?: string): Falla | Fila {
    const errores: Record<string, string> = {};
    const out: Fila = {};
    if (d.nombre !== undefined) {
      const n = texto(d.nombre, 120);
      if (!n) errores.nombre = 'Escribe el nombre.';
      else { out.nombre = n; out.nombre_norm = normalizar(n); }
    }
    if (d.correo !== undefined) {
      const c = normalizaCorreo(d.correo);
      if (!c) out.correo = null;
      else if (!correoValido(c)) errores.correo = 'Ese correo no parece un correo.';
      else {
        const otro = this.sql.exec(`SELECT id, nombre FROM inversionistas WHERE correo = ? AND id <> ?`, c, id ?? '').toArray()[0] as Fila | undefined;
        if (otro) return { error: 'correo_repetido', detalle: { mensaje: `Ese correo ya es de ${otro.nombre}.`, inversionista_id: otro.id } };
        out.correo = c;
      }
    }
    if (d.telefono !== undefined) {
      const crudo = String(d.telefono ?? '').trim();
      const limpio = crudo.replace(/[^\d+]/g, '');
      if (crudo && limpio.replace(/\D/g, '').length < 10) errores.telefono = 'El teléfono lleva al menos 10 dígitos.';
      else out.telefono = limpio || null;
    }
    if (d.clabe !== undefined) {
      const c = String(d.clabe ?? '').replace(/\D/g, '');
      if (c && c.length !== 18) errores.clabe = 'La CLABE lleva 18 dígitos.';
      else out.clabe = c || null;
    }
    for (const k of ['banco', 'beneficiario'] as const) if (d[k] !== undefined) out[k] = texto(d[k], 120);
    if (d.notas !== undefined) out.notas = texto(d.notas, 2000);
    for (const k of ['recibe_avisos', 'activo'] as const) if (d[k] !== undefined) out[k] = d[k] === true || d[k] === 1 ? 1 : 0;
    if (Object.keys(errores).length) return { error: 'datos_invalidos', detalle: { errores } };
    return out;
  }

  /** El directorio con sus cuentas: cuánto tiene prestado cada quien hoy, y
   *  quién es prospecto todavía (nunca ha prestado). */
  inversionistas(): Fila[] {
    const filas = this.varias('inversionistas', `SELECT * FROM inversionistas ORDER BY nombre_norm`);
    const cuentas = new Map<string, Fila>();
    for (const f of this.sql.exec(
      `SELECT p.inversionista_id AS id,
              COUNT(*) AS prestamos,
              SUM(CASE WHEN p.estado = 'activo' THEN 1 ELSE 0 END) AS activos,
              SUM(CASE WHEN p.estado = 'activo' THEN p.monto ELSE 0 END) AS prestado
         FROM prestamos p WHERE p.estado <> 'cancelado' GROUP BY p.inversionista_id`).toArray() as Fila[]) cuentas.set(String(f.id), f);
    const pagado = new Map<string, number>();
    for (const f of this.sql.exec(
      `SELECT p.inversionista_id AS id, SUM(g.capital) AS capital
         FROM prestamo_pagos g JOIN prestamos p ON p.id = g.prestamo_id
        WHERE g.estado = 'pagado' AND p.estado = 'activo' GROUP BY p.inversionista_id`).toArray() as Fila[]) pagado.set(String(f.id), Number(f.capital ?? 0));
    return filas.map((f) => {
      const c = cuentas.get(String(f.id));
      return {
        ...f,
        prestamos: Number(c?.prestamos ?? 0),
        prestamos_activos: Number(c?.activos ?? 0),
        capital_vigente: Number(c?.prestado ?? 0) - (pagado.get(String(f.id)) ?? 0),
        es_prospecto: !c,
      };
    });
  }

  inversionista(id: string): Fila | null { return this.una('inversionistas', id); }

  inversionistaPorUsuario(usuario_id: string): Fila | null {
    return this.forma('inversionistas', this.sql.exec(`SELECT * FROM inversionistas WHERE usuario_id = ? LIMIT 1`, usuario_id).toArray()[0] as Fila | undefined);
  }

  crearInversionista(d: Fila, actor: Actor): Fila | Falla {
    const r = this.revisarPersona({ nombre: d.nombre ?? '', ...d });
    if (esFalla(r)) return r;
    const id = ulid();
    this.sql.exec(
      `INSERT INTO inversionistas (id, nombre, nombre_norm, correo, telefono, banco, clabe, beneficiario, notas, recibe_avisos, activo, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, r.nombre, r.nombre_norm, r.correo ?? null, r.telefono ?? null, r.banco ?? null, r.clabe ?? null, r.beneficiario ?? null,
      r.notas ?? null, r.recibe_avisos ?? 1, r.activo ?? 1, ahora(),
    );
    this.apuntar({ que: 'inversionista_alta', actor, inversionista_id: id });
    return this.una('inversionistas', id)!;
  }

  actualizarInversionista(id: string, d: Fila): Fila | Falla {
    if (!this.una('inversionistas', id)) return { error: 'no_encontrado' };
    const r = this.revisarPersona(d, id);
    if (esFalla(r)) return r;
    const campos = Object.keys(r);
    if (campos.length) {
      this.sql.exec(`UPDATE inversionistas SET ${campos.map((c) => `${c} = ?`).join(', ')}, actualizado_at = ? WHERE id = ?`, ...campos.map((c) => r[c]), ahora(), id);
    }
    return this.una('inversionistas', id)!;
  }

  ligarUsuario(id: string, usuario_id: string | null): void {
    this.sql.exec(`UPDATE inversionistas SET usuario_id = ? WHERE id = ?`, usuario_id, id);
  }

  /** Se borra sólo quien nunca ofreció ni prestó: lo demás es historia de
   *  dinero, y eso se desactiva, no se borra. */
  borrarInversionista(id: string): { borrado: true; usuario_id: string | null } | Falla {
    const f = this.una('inversionistas', id);
    if (!f) return { error: 'no_encontrado' };
    const prestamos = this.numero(`SELECT COUNT(*) FROM prestamos WHERE inversionista_id = ?`, id);
    const ofertas = this.numero(`SELECT COUNT(*) FROM ronda_ofertas WHERE inversionista_id = ?`, id);
    if (prestamos || ofertas) return { error: 'en_uso', detalle: { prestamos, ofertas, mensaje: 'Ya tiene préstamos u ofertas: se desactiva, no se borra.' } };
    this.sql.exec(`DELETE FROM inversionistas WHERE id = ?`, id);
    return { borrado: true, usuario_id: (f.usuario_id as string) ?? null };
  }

  /* ─────────────── los ajustes de la app ───────────────
   * Un solo renglón en `ajustes`: a dónde se deposita y quién firma. */

  ajustes(): Fila {
    const f = this.sql.exec(`SELECT valor FROM ajustes WHERE id = 'investor101:config'`).toArray()[0] as Fila | undefined;
    let v: Fila = {};
    try { v = f ? JSON.parse(String(f.valor)) : {}; } catch { v = {}; }
    // `riesgos` es SIEMPRE el aviso vigente: el de la empresa si escribió uno,
    // o el base. `riesgos_propio` dice cuál de los dos es, para que Ajustes
    // pueda ofrecer «volver al texto base».
    const propio = String(v.riesgos ?? '').trim();
    return { instrucciones: v.instrucciones ?? '', representante: v.representante ?? '', lugar: v.lugar ?? '', riesgos: propio || RIESGOS_BASE, riesgos_propio: !!propio };
  }

  guardarAjustes(d: Fila): Fila {
    const actual = this.ajustes();
    // Sólo se guarda el aviso si es de la empresa: guardar el base lo
    // congelaría, y una mejora al base ya no le llegaría.
    const v: Fila = { instrucciones: actual.instrucciones, representante: actual.representante, lugar: actual.lugar, riesgos: actual.riesgos_propio ? actual.riesgos : '' };
    if (d.instrucciones !== undefined) v.instrucciones = String(d.instrucciones ?? '').trim().slice(0, 2000);
    if (d.representante !== undefined) v.representante = String(d.representante ?? '').trim().slice(0, 160);
    if (d.lugar !== undefined) v.lugar = String(d.lugar ?? '').trim().slice(0, 160);
    if (d.riesgos !== undefined) {
      const r = String(d.riesgos ?? '').trim().slice(0, RIESGOS_MAX);
      v.riesgos = r === RIESGOS_BASE ? '' : r;
    }
    const t = ahora();
    this.sql.exec(
      `INSERT INTO ajustes (id, app, clave, valor, creado_at, actualizado_at) VALUES ('investor101:config','investor101','config',?,?,?)
       ON CONFLICT(id) DO UPDATE SET valor = excluded.valor, actualizado_at = excluded.actualizado_at`,
      JSON.stringify(v), t, t,
    );
    return this.ajustes();
  }

  /* ─────────────── rondas ─────────────── */

  /** Cuánto lleva una ronda. `juntado` es lo ya aceptado (préstamos que no se
   *  cancelaron); `recibido`, lo que ya llegó a la cuenta. */
  private avance(ronda: Fila): Fila {
    const id = String(ronda.id);
    const juntado = this.numero(`SELECT COALESCE(SUM(monto),0) FROM prestamos WHERE ronda_id = ? AND estado <> 'cancelado'`, id);
    const recibido = this.numero(`SELECT COALESCE(SUM(monto),0) FROM prestamos WHERE ronda_id = ? AND estado IN ('activo','liquidado')`, id);
    const por_aprobar = this.numero(`SELECT COALESCE(SUM(monto),0) FROM ronda_ofertas WHERE ronda_id = ? AND estado = 'pendiente'`, id);
    const ofertas_pendientes = this.numero(`SELECT COUNT(*) FROM ronda_ofertas WHERE ronda_id = ? AND estado = 'pendiente'`, id);
    const meta = Number(ronda.monto_meta);
    return { juntado, recibido, por_aprobar, ofertas_pendientes, falta: Math.max(0, meta - juntado), porcentaje: meta > 0 ? Math.min(100, Math.round((juntado * 100) / meta)) : 0 };
  }

  private camposDeRonda(d: Fila, base: Fila | null): Fila | Falla {
    const errores: Record<string, string> = {};
    const out: Fila = {};
    if (d.nombre !== undefined || !base) {
      const n = texto(d.nombre, 120);
      if (!n) errores.nombre = 'Ponle nombre a la ronda.'; else out.nombre = n;
    }
    if (d.descripcion !== undefined) out.descripcion = texto(d.descripcion, 2000);
    if (d.instrucciones !== undefined) out.instrucciones = texto(d.instrucciones, 2000);
    if (d.monto_meta !== undefined || !base) {
      const m = entero(d.monto_meta);
      if (m === null || m <= 0) errores.monto_meta = 'Cuánto se quiere juntar: centavos, entero y mayor que cero.'; else out.monto_meta = m;
    }
    if (d.monto_minimo !== undefined) {
      if (d.monto_minimo === null || d.monto_minimo === '' || d.monto_minimo === 0) out.monto_minimo = null;
      else if (entero(d.monto_minimo) === null || d.monto_minimo < 0) errores.monto_minimo = 'El mínimo va en centavos, entero.';
      else out.monto_minimo = d.monto_minimo;
    }
    if (d.fecha_limite !== undefined) {
      if (d.fecha_limite === null || d.fecha_limite === '') out.fecha_limite = null;
      else if (!esDia(d.fecha_limite)) errores.fecha_limite = 'La fecha límite no es un día (AAAA-MM-DD).';
      else out.fecha_limite = d.fecha_limite;
    }
    for (const k of CONDICIONES) if (d[k] !== undefined) out[k] = d[k] === '' ? null : d[k];
    if (d.origen !== undefined) out.origen = d.origen && typeof d.origen === 'object' ? JSON.stringify(d.origen) : null;
    if (Object.keys(errores).length) return { error: 'datos_invalidos', detalle: { errores } };
    return out;
  }

  /** Las condiciones de una ronda, dichas como las de un préstamo por su meta. */
  private condicionesDe(f: Fila, monto?: number): Partial<CondicionesPrestamo> {
    return {
      monto: monto ?? Number(f.monto ?? f.monto_meta), tipo_tasa: f.tipo_tasa, tasa_pb: f.tasa_pb, esquema: f.esquema,
      frecuencia: f.esquema === 'parcialidades' ? f.frecuencia : null,
      num_pagos: f.esquema === 'parcialidades' ? f.num_pagos : null,
      fecha_inicio: f.fecha_inicio,
      fecha_primer_pago: f.esquema === 'parcialidades' ? (f.fecha_primer_pago || null) : null,
      fecha_vencimiento: f.esquema === 'unico' ? f.fecha_vencimiento : null,
    };
  }

  /** Nace en borrador, y un borrador puede venir a medias: dash101 manda
   *  sólo cuánto falta y para cuándo. Lo que no venga se pone con lo más
   *  simple —un solo pago a 30 días, sin tasa— para que quien dirige lo
   *  termine en investor101. Lo que se revisa completo es ABRIRLA. */
  crearRonda(d: Fila, actor: Actor, hoy: string): Fila | Falla {
    const r = this.camposDeRonda(d, null);
    if (esFalla(r)) return r;
    const inicio = esDia(r.fecha_inicio) ? r.fecha_inicio : hoy;
    const esquema = r.esquema === 'parcialidades' ? 'parcialidades' : 'unico';
    const id = ulid();
    const t = ahora();
    this.sql.exec(
      `INSERT INTO rondas (id, folio, nombre, descripcion, monto_meta, monto_minimo, tipo_tasa, tasa_pb, esquema, frecuencia, num_pagos,
         fecha_inicio, fecha_primer_pago, fecha_vencimiento, fecha_limite, instrucciones, estado, origen, creado_por, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'borrador',?,?,?)`,
      id, this.folio('RON'), r.nombre, r.descripcion ?? null, r.monto_meta, r.monto_minimo ?? null,
      ['mensual', 'anual', 'fija'].includes(r.tipo_tasa) ? r.tipo_tasa : 'mensual', entero(r.tasa_pb) ?? 0, esquema,
      esquema === 'parcialidades' ? (r.frecuencia ?? 'mensual') : null,
      esquema === 'parcialidades' ? (entero(r.num_pagos) ?? 1) : null,
      inicio, esquema === 'parcialidades' && esDia(r.fecha_primer_pago) ? r.fecha_primer_pago : null,
      esquema === 'unico' ? (esDia(r.fecha_vencimiento) ? r.fecha_vencimiento : sumarDias(inicio, 30)) : null,
      r.fecha_limite ?? null, r.instrucciones ?? (this.ajustes().instrucciones || null), r.origen ?? null, actor.usuario_id, t,
    );
    this.apuntar({ que: 'ronda_creada', actor, ronda_id: id });
    return this.verRonda(id)!;
  }

  actualizarRonda(id: string, d: Fila): Fila | Falla {
    const ronda = this.una('rondas', id);
    if (!ronda) return { error: 'no_encontrado' };
    if (ronda.estado === 'cerrada' || ronda.estado === 'cancelada') return { error: 'ronda_cerrada', detalle: { estado: ronda.estado } };
    const r = this.camposDeRonda(d, ronda);
    if (esFalla(r)) return r;
    const nueva = { ...ronda, ...r };
    // Lo de un esquema no se queda colgando en el otro.
    if (nueva.esquema === 'unico') { r.frecuencia = null; r.num_pagos = null; r.fecha_primer_pago = null; }
    else if (nueva.esquema === 'parcialidades') r.fecha_vencimiento = null;
    /* Abierta, tiene que seguir siendo válida: ya hay gente leyéndola. En
     * borrador se deja a medias. */
    if (ronda.estado === 'abierta') {
      const errores = revisarCondiciones(this.condicionesDe({ ...nueva, ...r }, Number(nueva.monto_meta)));
      if (Object.keys(errores).length) return { error: 'datos_invalidos', detalle: { errores } };
    }
    const campos = Object.keys(r);
    if (campos.length) this.sql.exec(`UPDATE rondas SET ${campos.map((c) => `${c} = ?`).join(', ')}, actualizado_at = ? WHERE id = ?`, ...campos.map((c) => r[c]), ahora(), id);
    return this.verRonda(id)!;
  }

  abrirRonda(id: string, actor: Actor): Fila | Falla {
    const ronda = this.una('rondas', id);
    if (!ronda) return { error: 'no_encontrado' };
    if (ronda.estado !== 'borrador') return { error: 'ronda_no_es_borrador', detalle: { estado: ronda.estado } };
    const errores = revisarCondiciones(this.condicionesDe(ronda, Number(ronda.monto_meta)));
    if (Object.keys(errores).length) return { error: 'datos_invalidos', detalle: { errores } };
    this.sql.exec(`UPDATE rondas SET estado = 'abierta', abierta_at = ?, actualizado_at = ? WHERE id = ?`, ahora(), ahora(), id);
    this.apuntar({ que: 'ronda_abierta', actor, ronda_id: id });
    return this.verRonda(id)!;
  }

  /** Cerrar: ya no entran ofertas; las pendientes se quedan para resolverse.
   *  Cancelar: además se rechazan las pendientes. Los préstamos ya aprobados
   *  no se tocan en ninguno de los dos: son compromisos con una persona. */
  terminarRonda(id: string, que: 'cerrada' | 'cancelada', actor: Actor): Fila | Falla {
    const ronda = this.una('rondas', id);
    if (!ronda) return { error: 'no_encontrado' };
    if (ronda.estado === que) return this.verRonda(id)!;
    if (ronda.estado === 'cancelada') return { error: 'ronda_cerrada', detalle: { estado: ronda.estado } };
    this.e.tx(() => {
      const t = ahora();
      this.sql.exec(`UPDATE rondas SET estado = ?, cerrada_at = ?, actualizado_at = ? WHERE id = ?`, que, t, t, id);
      if (que === 'cancelada') {
        this.sql.exec(
          `UPDATE ronda_ofertas SET estado = 'rechazada', motivo = 'La ronda se canceló.', resuelta_at = ?, resuelta_por = ? WHERE ronda_id = ? AND estado = 'pendiente'`,
          t, actor.usuario_id, id,
        );
      }
      this.apuntar({ que: `ronda_${que}`, actor, ronda_id: id });
    });
    return this.verRonda(id)!;
  }

  reabrirRonda(id: string, actor: Actor): Fila | Falla {
    const ronda = this.una('rondas', id);
    if (!ronda) return { error: 'no_encontrado' };
    if (ronda.estado !== 'cerrada') return { error: 'ronda_no_esta_cerrada', detalle: { estado: ronda.estado } };
    this.sql.exec(`UPDATE rondas SET estado = 'abierta', cerrada_at = NULL, actualizado_at = ? WHERE id = ?`, ahora(), id);
    this.apuntar({ que: 'ronda_reabierta', actor, ronda_id: id });
    return this.verRonda(id)!;
  }

  borrarRonda(id: string): { borrado: true } | Falla {
    const ronda = this.una('rondas', id);
    if (!ronda) return { error: 'no_encontrado' };
    if (ronda.estado !== 'borrador') return { error: 'ronda_no_es_borrador', detalle: { estado: ronda.estado, mensaje: 'Sólo se borra un borrador; una ronda abierta se cancela.' } };
    this.sql.exec(`DELETE FROM rondas WHERE id = ?`, id);
    return { borrado: true };
  }

  /** La ronda con todo, para quien dirige. */
  verRonda(id: string): Fila | null {
    const ronda = this.una('rondas', id);
    if (!ronda) return null;
    const ofertas = this.sql.exec(
      `SELECT o.*, i.nombre AS inversionista_nombre, i.correo AS inversionista_correo, i.telefono AS inversionista_telefono
         FROM ronda_ofertas o JOIN inversionistas i ON i.id = o.inversionista_id WHERE o.ronda_id = ? ORDER BY o.creado_at`, id).toArray() as Fila[];
    const prestamos = this.prestamos({ ronda_id: id });
    const ejemplo = this.ejemploDe(ronda);
    // El texto que aceptó cada quien no viaja en la lista (son párrafos
    // enteros por renglón): viaja cuándo lo aceptó, o null si la oferta la
    // capturó quien dirige. El texto se lee en el préstamo.
    for (const o of ofertas) delete o.riesgos_texto;
    return { ...ronda, avance: this.avance(ronda), ofertas, prestamos, ejemplo };
  }

  /** La tabla que da la ronda por cada $10,000: lo que le enseña a quien la
   *  lee cuánto gana, sin que nadie tenga que hacer la cuenta. */
  private ejemploDe(ronda: Fila): Fila | null {
    const c = this.condicionesDe(ronda, 1_000_000);
    if (Object.keys(revisarCondiciones(c)).length) return null;
    const tabla = tablaDePagos(c as CondicionesPrestamo);
    return { monto: 1_000_000, tabla, totales: totalesDe(tabla) };
  }

  rondas(): Fila[] {
    return this.varias('rondas', `SELECT * FROM rondas ORDER BY creado_at DESC`).map((r) => ({ ...r, avance: this.avance(r) }));
  }

  /** Lo que ve un inversionista de una ronda: las condiciones, el avance
   *  TOTAL y lo suyo. Nunca quién más entró ni con cuánto (decisión de Mike
   *  con botones: «sólo avance total»). */
  rondaPara(id: string, inversionista_id: string): Fila | null {
    const r = this.una('rondas', id);
    if (!r) return null;
    const mias = this.sql.exec(`SELECT id, monto, monto_aprobado, nota, estado, motivo, prestamo_id, creado_at, resuelta_at, riesgos_aceptados_at FROM ronda_ofertas WHERE ronda_id = ? AND inversionista_id = ? ORDER BY creado_at`, id, inversionista_id).toArray() as Fila[];
    if (r.estado !== 'abierta' && !mias.length) return null;
    if (r.estado === 'borrador') return null;
    const a = this.avance(r);
    const aprobada = mias.some((o) => o.estado === 'aprobada');
    return {
      id: r.id, folio: r.folio, nombre: r.nombre, descripcion: r.descripcion, estado: r.estado,
      monto_meta: r.monto_meta, monto_minimo: r.monto_minimo, fecha_limite: r.fecha_limite,
      tipo_tasa: r.tipo_tasa, tasa_pb: r.tasa_pb, esquema: r.esquema, frecuencia: r.frecuencia, num_pagos: r.num_pagos,
      fecha_inicio: r.fecha_inicio, fecha_primer_pago: r.fecha_primer_pago, fecha_vencimiento: r.fecha_vencimiento,
      // A dónde depositar sólo se le dice a quien ya se le aceptó.
      instrucciones: aprobada ? r.instrucciones : null,
      // El aviso que tiene que leer y aceptar antes de ofrecer (0.84.0).
      riesgos: this.ajustes().riesgos,
      avance: { juntado: a.juntado, falta: a.falta, porcentaje: a.porcentaje },
      ejemplo: this.ejemploDe(r),
      mis_ofertas: mias,
    };
  }

  rondasPara(inversionista_id: string): Fila[] {
    const ids = this.sql.exec(
      `SELECT r.id FROM rondas r
        WHERE r.estado = 'abierta'
           OR (r.estado <> 'borrador' AND EXISTS (SELECT 1 FROM ronda_ofertas o WHERE o.ronda_id = r.id AND o.inversionista_id = ?))
        ORDER BY CASE r.estado WHEN 'abierta' THEN 0 ELSE 1 END, r.creado_at DESC`, inversionista_id).toArray() as Fila[];
    return ids.map((f) => this.rondaPara(String(f.id), inversionista_id)!).filter(Boolean);
  }

  /* ─────────────── ofertas ─────────────── */

  /** «Le entro con tanto». Una sola oferta pendiente por persona y ronda:
   *  ofrecer otra vez la cambia, no la duplica. */
  ofrecer(a: { ronda_id: string; inversionista_id: string; monto: unknown; nota?: unknown; exige_riesgos?: boolean; acepta_riesgos?: unknown }, actor: Actor, hoy: string): Fila | Falla {
    const ronda = this.una('rondas', a.ronda_id);
    if (!ronda) return { error: 'no_encontrado' };
    if (ronda.estado !== 'abierta') return { error: 'ronda_no_esta_abierta', detalle: { estado: ronda.estado } };
    if (ronda.fecha_limite && hoy > ronda.fecha_limite) return { error: 'ronda_vencida', detalle: { fecha_limite: ronda.fecha_limite } };
    const inv = this.una('inversionistas', a.inversionista_id);
    if (!inv || !inv.activo) return { error: 'inversionista_desconocido' };
    const monto = entero(a.monto);
    if (monto === null || monto <= 0) return { error: 'datos_invalidos', detalle: { errores: { monto: 'Con cuánto: centavos, entero y mayor que cero.' } } };
    if (ronda.monto_minimo && monto < ronda.monto_minimo) return { error: 'datos_invalidos', detalle: { errores: { monto: 'Es menos que el mínimo de la ronda.' }, monto_minimo: ronda.monto_minimo } };
    const nota = texto(a.nota, 500);
    /* EL AVISO DE RIESGOS (0.84.0; Mike con botones: «Aceptación obligatoria»).
     * Quien presta no ofrece sin decir que lo leyó y lo acepta, y se guarda el
     * texto que tuvo enfrente y la hora. Vale también al CAMBIAR una oferta:
     * es otro monto, y el aviso pudo haber cambiado. Quien dirige captura la
     * oferta de alguien que se lo dijo por teléfono sin aceptación —nadie la
     * dio en pantalla—, y queda en NULL para que se vea. */
    if (a.exige_riesgos && a.acepta_riesgos !== true) {
      return { error: 'riesgos_sin_aceptar', detalle: { mensaje: 'Antes de ofrecer, marca que leíste y aceptas los riesgos.' } };
    }
    const acepto = a.exige_riesgos ? ahora() : null;
    const aviso = a.exige_riesgos ? String(this.ajustes().riesgos) : null;
    const previa = this.sql.exec(`SELECT id FROM ronda_ofertas WHERE ronda_id = ? AND inversionista_id = ? AND estado = 'pendiente'`, a.ronda_id, a.inversionista_id).toArray()[0] as Fila | undefined;
    let id = previa ? String(previa.id) : '';
    if (previa) {
      this.sql.exec(`UPDATE ronda_ofertas SET monto = ?, nota = ?, riesgos_aceptados_at = ?, riesgos_texto = ? WHERE id = ?`, monto, nota, acepto, aviso, id);
      this.apuntar({ que: 'oferta_cambiada', actor, ronda_id: a.ronda_id, inversionista_id: a.inversionista_id, datos: { monto } });
    } else {
      id = ulid();
      this.sql.exec(`INSERT INTO ronda_ofertas (id, ronda_id, inversionista_id, monto, nota, estado, creado_at, riesgos_aceptados_at, riesgos_texto) VALUES (?,?,?,?,?,'pendiente',?,?,?)`, id, a.ronda_id, a.inversionista_id, monto, nota, ahora(), acepto, aviso);
      this.apuntar({ que: 'oferta', actor, ronda_id: a.ronda_id, inversionista_id: a.inversionista_id, datos: { monto, acepto_riesgos: !!acepto } });
    }
    return this.una('ronda_ofertas', id)!;
  }

  oferta(id: string): Fila | null { return this.una('ronda_ofertas', id); }

  retirarOferta(id: string, actor: Actor): Fila | Falla {
    const o = this.una('ronda_ofertas', id);
    if (!o) return { error: 'no_encontrado' };
    if (o.estado !== 'pendiente') return { error: 'oferta_ya_resuelta', detalle: { estado: o.estado } };
    this.sql.exec(`UPDATE ronda_ofertas SET estado = 'retirada', resuelta_at = ?, resuelta_por = ? WHERE id = ?`, ahora(), actor.usuario_id, id);
    this.apuntar({ que: 'oferta_retirada', actor, ronda_id: o.ronda_id, inversionista_id: o.inversionista_id });
    return this.una('ronda_ofertas', id)!;
  }

  rechazarOferta(id: string, motivo: unknown, actor: Actor): Fila | Falla {
    const o = this.una('ronda_ofertas', id);
    if (!o) return { error: 'no_encontrado' };
    if (o.estado !== 'pendiente') return { error: 'oferta_ya_resuelta', detalle: { estado: o.estado } };
    this.sql.exec(`UPDATE ronda_ofertas SET estado = 'rechazada', motivo = ?, resuelta_at = ?, resuelta_por = ? WHERE id = ?`, texto(motivo, 500), ahora(), actor.usuario_id, id);
    this.apuntar({ que: 'oferta_rechazada', actor, ronda_id: o.ronda_id, inversionista_id: o.inversionista_id, nota: texto(motivo, 500) });
    return this.una('ronda_ofertas', id)!;
  }

  /** Aprobar una oferta la vuelve un préstamo `por_depositar`. Se puede
   *  aceptar por menos (o más) de lo ofrecido, y con condiciones distintas a
   *  las de la ronda: «libre por préstamo». */
  aprobarOferta(id: string, a: { monto_aprobado?: unknown; condiciones?: Fila }, actor: Actor, hoy: string): { oferta: Fila; prestamo: Fila } | Falla {
    const o = this.una('ronda_ofertas', id);
    if (!o) return { error: 'no_encontrado' };
    if (o.estado !== 'pendiente') return { error: 'oferta_ya_resuelta', detalle: { estado: o.estado } };
    const ronda = this.una('rondas', String(o.ronda_id))!;
    if (ronda.estado === 'cancelada' || ronda.estado === 'borrador') return { error: 'ronda_no_esta_abierta', detalle: { estado: ronda.estado } };
    const monto = a.monto_aprobado === undefined || a.monto_aprobado === null ? Number(o.monto) : entero(a.monto_aprobado);
    if (monto === null || monto <= 0) return { error: 'datos_invalidos', detalle: { errores: { monto_aprobado: 'Cuánto se le acepta: centavos, entero y mayor que cero.' } } };

    const base: Fila = { ...ronda };
    for (const k of CONDICIONES) if (a.condiciones && a.condiciones[k] !== undefined) base[k] = a.condiciones[k] === '' ? null : a.condiciones[k];
    // El dinero no puede haber llegado antes de hoy: una ronda cuyo inicio
    // ya pasó se estima desde hoy, y se corrige al marcar el depósito.
    if (!(a.condiciones && a.condiciones.fecha_inicio) && base.fecha_inicio < hoy) base.fecha_inicio = hoy;

    let salida: { oferta: Fila; prestamo: Fila } | Falla = { error: 'falla' };
    this.e.tx(() => {
      const p = this.insertarPrestamo({
        inversionista_id: String(o.inversionista_id), ronda_id: String(o.ronda_id), oferta_id: id,
        condiciones: this.condicionesDe(base, monto), instrucciones: ronda.instrucciones ?? null, notas: null,
      }, actor);
      if (esFalla(p)) { salida = p; return; }
      this.sql.exec(`UPDATE ronda_ofertas SET estado = 'aprobada', monto_aprobado = ?, prestamo_id = ?, resuelta_at = ?, resuelta_por = ? WHERE id = ?`, monto, p.id, ahora(), actor.usuario_id, id);
      this.apuntar({ que: 'oferta_aprobada', actor, ronda_id: o.ronda_id, prestamo_id: p.id, inversionista_id: o.inversionista_id, datos: { ofrecido: o.monto, aprobado: monto } });
      salida = { oferta: this.una('ronda_ofertas', id)!, prestamo: this.verPrestamo(String(p.id))! };
    });
    return salida;
  }

  /* ─────────────── préstamos ─────────────── */

  private escribirTabla(prestamo_id: string, c: CondicionesPrestamo): void {
    this.sql.exec(`DELETE FROM prestamo_pagos WHERE prestamo_id = ? AND estado = 'pendiente'`, prestamo_id);
    const t = ahora();
    for (const r of tablaDePagos(c)) {
      this.sql.exec(`INSERT INTO prestamo_pagos (id, prestamo_id, numero, fecha, capital, interes, estado, creado_at) VALUES (?,?,?,?,?,?,'pendiente',?)`, ulid(), prestamo_id, r.numero, r.fecha, r.capital, r.interes, t);
    }
  }

  private insertarPrestamo(a: { inversionista_id: string; ronda_id: string | null; oferta_id: string | null; condiciones: Partial<CondicionesPrestamo>; instrucciones: string | null; notas: string | null }, actor: Actor): Fila | Falla {
    const inv = this.una('inversionistas', a.inversionista_id);
    if (!inv) return { error: 'inversionista_desconocido' };
    const errores = revisarCondiciones(a.condiciones);
    if (Object.keys(errores).length) return { error: 'datos_invalidos', detalle: { errores } };
    const c = a.condiciones as CondicionesPrestamo;
    const id = ulid();
    this.sql.exec(
      `INSERT INTO prestamos (id, folio, inversionista_id, ronda_id, oferta_id, monto, tipo_tasa, tasa_pb, esquema, frecuencia, num_pagos,
         fecha_inicio, fecha_primer_pago, fecha_vencimiento, instrucciones, estado, notas, creado_por, creado_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'por_depositar',?,?,?)`,
      id, this.folio('PRE'), a.inversionista_id, a.ronda_id, a.oferta_id, c.monto, c.tipo_tasa, c.tasa_pb, c.esquema,
      c.frecuencia ?? null, c.num_pagos ?? null, c.fecha_inicio, c.fecha_primer_pago ?? null, c.fecha_vencimiento ?? null,
      a.instrucciones, a.notas, actor.usuario_id, ahora(),
    );
    this.escribirTabla(id, c);
    this.apuntar({ que: 'prestamo_creado', actor, prestamo_id: id, ronda_id: a.ronda_id, inversionista_id: a.inversionista_id });
    return this.una('prestamos', id)!;
  }

  /** Un préstamo directo, sin ronda: alguien presta y ya. */
  crearPrestamo(d: Fila, actor: Actor): Fila | Falla {
    if (typeof d.inversionista_id !== 'string' || !d.inversionista_id) return { error: 'datos_invalidos', detalle: { errores: { inversionista_id: 'Escoge quién presta.' } } };
    let salida: Fila | Falla = { error: 'falla' };
    this.e.tx(() => {
      const p = this.insertarPrestamo({
        inversionista_id: d.inversionista_id, ronda_id: null, oferta_id: null,
        condiciones: this.condicionesDe(d, entero(d.monto) ?? NaN),
        instrucciones: texto(d.instrucciones, 2000) ?? (this.ajustes().instrucciones || null), notas: texto(d.notas, 2000),
      }, actor);
      salida = esFalla(p) ? p : this.verPrestamo(String(p.id))!;
    });
    return salida;
  }

  /** Cambiar lo acordado, mientras el dinero no ha llegado. La tabla se rehace. */
  actualizarPrestamo(id: string, d: Fila, actor: Actor): Fila | Falla {
    const p = this.una('prestamos', id);
    if (!p) return { error: 'no_encontrado' };
    const soloNotas = Object.keys(d).every((k) => k === 'notas' || k === 'instrucciones');
    if (!soloNotas && p.estado !== 'por_depositar') return { error: 'prestamo_ya_arranco', detalle: { estado: p.estado, mensaje: 'Con el dinero recibido, lo que se edita es la tabla de pagos.' } };
    const nuevo: Fila = { ...p };
    for (const k of ['monto', ...CONDICIONES]) if (d[k] !== undefined) nuevo[k] = d[k] === '' ? null : d[k];
    let salida: Fila | Falla = { error: 'falla' };
    this.e.tx(() => {
      if (!soloNotas) {
        const c = this.condicionesDe(nuevo, Number(nuevo.monto));
        const errores = revisarCondiciones(c);
        if (Object.keys(errores).length) { salida = { error: 'datos_invalidos', detalle: { errores } }; return; }
        const cc = c as CondicionesPrestamo;
        this.sql.exec(
          `UPDATE prestamos SET monto = ?, tipo_tasa = ?, tasa_pb = ?, esquema = ?, frecuencia = ?, num_pagos = ?, fecha_inicio = ?, fecha_primer_pago = ?, fecha_vencimiento = ?, tabla_editada = 0, actualizado_at = ? WHERE id = ?`,
          cc.monto, cc.tipo_tasa, cc.tasa_pb, cc.esquema, cc.frecuencia ?? null, cc.num_pagos ?? null, cc.fecha_inicio, cc.fecha_primer_pago ?? null, cc.fecha_vencimiento ?? null, ahora(), id,
        );
        this.escribirTabla(id, cc);
        this.apuntar({ que: 'condiciones_cambiadas', actor, prestamo_id: id, inversionista_id: p.inversionista_id, datos: { antes: this.condicionesDe(p), despues: cc } });
      }
      if (d.notas !== undefined) this.sql.exec(`UPDATE prestamos SET notas = ? WHERE id = ?`, texto(d.notas, 2000), id);
      if (d.instrucciones !== undefined) this.sql.exec(`UPDATE prestamos SET instrucciones = ? WHERE id = ?`, texto(d.instrucciones, 2000), id);
      salida = this.verPrestamo(id)!;
    });
    return salida;
  }

  /** EL DINERO LLEGÓ. Aquí arranca el préstamo (decisión de Mike con
   *  botones): nace el ingreso en la cuenta, la fecha de inicio pasa a ser la
   *  de verdad y la tabla se rehace con ella —salvo que ya se hubiera editado
   *  a mano, que entonces se respeta—. */
  marcarRecibido(id: string, a: { cuenta_id: unknown; fecha?: unknown; nota?: unknown }, actor: Actor, hoy: string): { prestamo: Fila; movimiento_id: string } | Falla {
    const p = this.una('prestamos', id);
    if (!p) return { error: 'no_encontrado' };
    if (p.estado !== 'por_depositar') return { error: 'prestamo_ya_arranco', detalle: { estado: p.estado } };
    if (typeof a.cuenta_id !== 'string' || !a.cuenta_id) return { error: 'datos_invalidos', detalle: { errores: { cuenta_id: 'Escoge a qué cuenta llegó.' } } };
    if (!this.sql.exec(`SELECT id FROM cuentas WHERE id = ?`, a.cuenta_id).toArray()[0]) return { error: 'cuenta_desconocida', detalle: { cuenta_id: a.cuenta_id } };
    const fecha = a.fecha === undefined || a.fecha === null || a.fecha === '' ? hoy : a.fecha;
    if (!esDia(fecha)) return { error: 'datos_invalidos', detalle: { errores: { fecha: 'La fecha no es un día (AAAA-MM-DD).' } } };
    if (fecha > hoy) return { error: 'datos_invalidos', detalle: { errores: { fecha: 'El depósito no puede ser de un día que no ha llegado.' } } };

    const c = this.condicionesDe({ ...p, fecha_inicio: fecha }, Number(p.monto));
    if (!p.tabla_editada) {
      const errores = revisarCondiciones(c);
      if (Object.keys(errores).length) {
        return { error: 'fechas_no_cuadran', detalle: { errores, mensaje: 'Con el dinero llegando ese día, las fechas de pago acordadas ya no caben. Cambia las condiciones del préstamo y vuelve a marcarlo.' } };
      }
    }
    const inv = this.una('inversionistas', String(p.inversionista_id))!;
    const mov = ulid();
    this.e.tx(() => {
      const t = ahora();
      this.sql.exec(
        `INSERT INTO movimientos (id, tipo, monto, fecha, cuenta_id, contraparte_tipo, contraparte_id, contraparte_nombre, descripcion, categoria, creado_por, creado_at)
         VALUES (?,'ingreso',?,?,?,?,?,?,?,?,?,?)`,
        mov, Number(p.monto), fecha, a.cuenta_id, CONTRAPARTE_INVERSIONISTA, inv.id, inv.nombre,
        `${p.folio} · Préstamo de ${inv.nombre}`, CATEGORIA_PRESTAMO_RECIBIDO, actor.usuario_id, t,
      );
      this.sql.exec(
        `UPDATE prestamos SET estado = 'activo', fecha_inicio = ?, cuenta_id = ?, movimiento_id = ?, recibido_at = ?, recibido_por = ?, actualizado_at = ? WHERE id = ?`,
        fecha, a.cuenta_id, mov, t, actor.usuario_id, t, id,
      );
      if (!p.tabla_editada) this.escribirTabla(id, c as CondicionesPrestamo);
      this.apuntar({ que: 'recibido', actor, prestamo_id: id, ronda_id: p.ronda_id, inversionista_id: p.inversionista_id, nota: texto(a.nota, 500), datos: { fecha, monto: p.monto, cuenta_id: a.cuenta_id } });
    });
    this.e.alMover?.(mov);
    return { prestamo: this.verPrestamo(id)!, movimiento_id: mov };
  }

  /** Se cancela lo que no arrancó. Con dinero recibido ya no hay cancelar:
   *  hay pagar. */
  cancelarPrestamo(id: string, motivo: unknown, actor: Actor): Fila | Falla {
    const p = this.una('prestamos', id);
    if (!p) return { error: 'no_encontrado' };
    if (p.estado !== 'por_depositar') return { error: 'prestamo_ya_arranco', detalle: { estado: p.estado } };
    this.e.tx(() => {
      this.sql.exec(`UPDATE prestamos SET estado = 'cancelado', actualizado_at = ? WHERE id = ?`, ahora(), id);
      this.sql.exec(`DELETE FROM prestamo_pagos WHERE prestamo_id = ?`, id);
      this.apuntar({ que: 'prestamo_cancelado', actor, prestamo_id: id, ronda_id: p.ronda_id, inversionista_id: p.inversionista_id, nota: texto(motivo, 500) });
    });
    return this.verPrestamo(id)!;
  }

  /** EDITAR LA TABLA A MANO (decisión de Mike con botones: «recalcular
   *  manual», sin penalizaciones automáticas). Llega la lista completa de lo
   *  que queda PENDIENTE; lo ya pagado no se toca. El capital tiene que
   *  seguir sumando lo que se debe: se puede mover de fecha y repartir
   *  distinto, no desaparecer. El interés es libre. El motivo es obligatorio
   *  y queda, con el antes y el después, a la vista de quien prestó. */
  editarTabla(id: string, a: { pagos?: unknown; motivo?: unknown }, actor: Actor): Fila | Falla {
    const p = this.una('prestamos', id);
    if (!p) return { error: 'no_encontrado' };
    if (p.estado !== 'por_depositar' && p.estado !== 'activo') return { error: 'prestamo_cerrado', detalle: { estado: p.estado } };
    const motivo = texto(a.motivo, 500);
    if (!motivo) return { error: 'datos_invalidos', detalle: { errores: { motivo: 'Di por qué cambia la tabla: quien prestó lo va a leer.' } } };
    if (!Array.isArray(a.pagos) || !a.pagos.length) return { error: 'datos_invalidos', detalle: { errores: { pagos: 'Falta la lista de pagos pendientes.' } } };
    if (a.pagos.length > 200) return { error: 'datos_invalidos', detalle: { errores: { pagos: 'Son demasiados pagos.' } } };

    const nuevos: Array<{ fecha: string; capital: number; interes: number }> = [];
    for (const [i, crudo] of (a.pagos as Fila[]).entries()) {
      const capital = entero(crudo?.capital);
      const interes = entero(crudo?.interes);
      if (!esDia(crudo?.fecha)) return { error: 'datos_invalidos', detalle: { errores: { pagos: `El pago ${i + 1} no trae un día válido.` } } };
      if (capital === null || capital < 0 || interes === null || interes < 0) return { error: 'datos_invalidos', detalle: { errores: { pagos: `El pago ${i + 1}: capital e interés van en centavos, enteros y no negativos.` } } };
      if (capital + interes <= 0) return { error: 'datos_invalidos', detalle: { errores: { pagos: `El pago ${i + 1} está en ceros.` } } };
      nuevos.push({ fecha: crudo.fecha, capital, interes });
    }
    nuevos.sort((x, y) => x.fecha.localeCompare(y.fecha));

    const pagado = this.numero(`SELECT COALESCE(SUM(capital),0) FROM prestamo_pagos WHERE prestamo_id = ? AND estado = 'pagado'`, id);
    const debe = Number(p.monto) - pagado;
    const suma = nuevos.reduce((s, r) => s + r.capital, 0);
    if (suma !== debe) return { error: 'capital_no_cuadra', detalle: { debe, suma, mensaje: 'El capital de los pagos pendientes tiene que sumar exactamente lo que se debe.' } };

    const antes = this.sql.exec(`SELECT fecha, capital, interes FROM prestamo_pagos WHERE prestamo_id = ? AND estado = 'pendiente' ORDER BY numero`, id).toArray();
    this.e.tx(() => {
      const hechos = this.numero(`SELECT COUNT(*) FROM prestamo_pagos WHERE prestamo_id = ? AND estado = 'pagado'`, id);
      // Lo pagado se renumera primero, en el orden en que tocaba, para que la
      // tabla quede 1, 2, 3… sin huecos después de mover fechas.
      const yaPagados = this.sql.exec(`SELECT id FROM prestamo_pagos WHERE prestamo_id = ? AND estado = 'pagado' ORDER BY fecha, numero`, id).toArray() as Fila[];
      yaPagados.forEach((f, i) => this.sql.exec(`UPDATE prestamo_pagos SET numero = ? WHERE id = ?`, i + 1, f.id));
      this.sql.exec(`DELETE FROM prestamo_pagos WHERE prestamo_id = ? AND estado = 'pendiente'`, id);
      const t = ahora();
      nuevos.forEach((r, i) => this.sql.exec(
        `INSERT INTO prestamo_pagos (id, prestamo_id, numero, fecha, capital, interes, estado, creado_at) VALUES (?,?,?,?,?,?,'pendiente',?)`,
        ulid(), id, hechos + i + 1, r.fecha, r.capital, r.interes, t,
      ));
      this.sql.exec(`UPDATE prestamos SET tabla_editada = 1, actualizado_at = ? WHERE id = ?`, t, id);
      this.apuntar({ que: 'tabla_editada', actor, prestamo_id: id, ronda_id: p.ronda_id, inversionista_id: p.inversionista_id, nota: motivo, datos: { antes, despues: nuevos } });
    });
    return this.verPrestamo(id)!;
  }

  /** Las cuentas de un préstamo, sacadas de su tabla. */
  private resumenDe(p: Fila, pagos: Fila[], hoy?: string): Fila {
    const hechos = pagos.filter((g) => g.estado === 'pagado');
    const faltan = pagos.filter((g) => g.estado === 'pendiente');
    const suma = (l: Fila[], k: string) => l.reduce((s, g) => s + Number(g[k]), 0);
    const proximo = faltan[0] ?? null;
    return {
      capital_pagado: suma(hechos, 'capital'), interes_pagado: suma(hechos, 'interes'),
      capital_pendiente: p.estado === 'cancelado' ? 0 : Number(p.monto) - suma(hechos, 'capital'),
      interes_pendiente: suma(faltan, 'interes'),
      interes_total: suma(pagos, 'interes'),
      pagos_hechos: hechos.length, pagos_total: pagos.length,
      proximo: proximo ? { id: proximo.id, numero: proximo.numero, fecha: proximo.fecha, total: Number(proximo.capital) + Number(proximo.interes) } : null,
      ultima_fecha: pagos.length ? pagos[pagos.length - 1].fecha : null,
      vencidos: hoy && p.estado === 'activo' ? faltan.filter((g) => g.fecha < hoy).length : 0,
    };
  }

  private pagosDe(prestamo_id: string): Fila[] {
    return (this.sql.exec(`SELECT * FROM prestamo_pagos WHERE prestamo_id = ? ORDER BY numero`, prestamo_id).toArray() as Fila[])
      .map((g) => ({ ...g, total: Number(g.capital) + Number(g.interes) }));
  }

  prestamo(id: string): Fila | null { return this.una('prestamos', id); }

  /** El préstamo con su tabla, sus papeles y su historia. `para` recorta lo
   *  que no es del inversionista: las notas internas y los datos de quien
   *  capturó. */
  verPrestamo(id: string, opciones: { para?: 'inversionista'; hoy?: string } = {}): Fila | null {
    const p = this.una('prestamos', id);
    if (!p) return null;
    const inv = this.una('inversionistas', String(p.inversionista_id))!;
    const pagos = this.pagosDe(id);
    const archivos = this.sql.exec(`SELECT id, pago_id, clase, nombre, mime, bytes, subido_por_nombre, creado_at FROM inversion_archivos WHERE prestamo_id = ? ORDER BY creado_at`, id).toArray() as Fila[];
    let eventos = this.varias('inversion_eventos', `SELECT * FROM inversion_eventos WHERE prestamo_id = ? ORDER BY ts`, id);
    const ronda = p.ronda_id ? this.sql.exec(`SELECT id, folio, nombre FROM rondas WHERE id = ?`, String(p.ronda_id)).toArray()[0] ?? null : null;
    /* Los riesgos de ESTE préstamo (0.84.0): si nació de una oferta en la que
     * quien presta los aceptó, son el texto que aceptó ese día, con su hora;
     * si no (préstamo directo, u oferta capturada por quien dirige), el aviso
     * vigente, sin aceptación. Es lo que el pagaré imprime: firmarlo es la
     * aceptación que falta en ese caso. */
    const of = p.oferta_id ? this.sql.exec(`SELECT riesgos_aceptados_at, riesgos_texto FROM ronda_ofertas WHERE id = ?`, String(p.oferta_id)).toArray()[0] as Fila | undefined : undefined;
    const riesgos = of?.riesgos_aceptados_at && of.riesgos_texto
      ? { texto: of.riesgos_texto, aceptados_at: of.riesgos_aceptados_at }
      : { texto: this.ajustes().riesgos, aceptados_at: null };
    const base: Fila = { ...p, ronda, pagos, archivos, riesgos, resumen: this.resumenDe(p, pagos, opciones.hoy) };
    if (opciones.para === 'inversionista') {
      delete base.notas; delete base.creado_por; delete base.recibido_por; delete base.cuenta_id; delete base.movimiento_id;
      base.pagos = pagos.map(({ cuenta_id: _c, movimiento_capital_id: _a, movimiento_interes_id: _b, pagado_por: _p, ...g }) => g);
      const VISIBLES = new Set(['prestamo_creado', 'condiciones_cambiadas', 'recibido', 'tabla_editada', 'pago', 'pago_deshecho', 'prestamo_cancelado']);
      eventos = eventos.filter((ev) => VISIBLES.has(String(ev.que))).map(({ quien_usuario_id: _q, quien_nombre: _n, ...ev }) => ev);
      base.inversionista = { id: inv.id, nombre: inv.nombre };
    } else {
      base.inversionista = { id: inv.id, nombre: inv.nombre, correo: inv.correo, telefono: inv.telefono, banco: inv.banco, clabe: inv.clabe, beneficiario: inv.beneficiario };
    }
    base.eventos = eventos;
    return base;
  }

  prestamos(filtro: { inversionista_id?: string; ronda_id?: string; estado?: string } = {}, hoy?: string): Fila[] {
    const donde: string[] = [];
    const args: unknown[] = [];
    if (filtro.inversionista_id) { donde.push('p.inversionista_id = ?'); args.push(filtro.inversionista_id); }
    if (filtro.ronda_id) { donde.push('p.ronda_id = ?'); args.push(filtro.ronda_id); }
    if (filtro.estado) { donde.push('p.estado = ?'); args.push(filtro.estado); }
    const filas = this.sql.exec(
      `SELECT p.*, i.nombre AS inversionista_nombre, r.folio AS ronda_folio, r.nombre AS ronda_nombre
         FROM prestamos p JOIN inversionistas i ON i.id = p.inversionista_id LEFT JOIN rondas r ON r.id = p.ronda_id
        ${donde.length ? `WHERE ${donde.join(' AND ')}` : ''} ORDER BY p.creado_at DESC`, ...args).toArray() as Fila[];
    return filas.map((f) => {
      const p = this.forma('prestamos', f)!;
      return { ...p, resumen: this.resumenDe(p, this.pagosDe(String(p.id)), hoy) };
    });
  }

  /* ─────────────── pagos ─────────────── */

  pago(id: string): Fila | null { return this.una('prestamo_pagos', id); }

  /** PAGAR. Deja uno o dos egresos: el capital que se devuelve y el interés
   *  que se paga. Van separados porque no son lo mismo —devolver lo prestado
   *  no es un gasto; el interés sí— y juntarlos haría imposible saber cuánto
   *  costó el dinero. Cuando ya no queda nada pendiente, el préstamo se
   *  liquida solo. */
  pagar(pago_id: string, a: { cuenta_id: unknown; fecha?: unknown; nota?: unknown }, actor: Actor, hoy: string): { pago: Fila; prestamo: Fila; movimientos: string[]; liquidado: boolean } | Falla {
    const g = this.una('prestamo_pagos', pago_id);
    if (!g) return { error: 'no_encontrado' };
    if (g.estado !== 'pendiente') return { error: 'pago_ya_hecho', detalle: { pagado_fecha: g.pagado_fecha } };
    const p = this.una('prestamos', String(g.prestamo_id))!;
    if (p.estado !== 'activo') return { error: 'prestamo_no_activo', detalle: { estado: p.estado, mensaje: p.estado === 'por_depositar' ? 'Todavía no se marca el depósito recibido.' : undefined } };
    if (typeof a.cuenta_id !== 'string' || !a.cuenta_id) return { error: 'datos_invalidos', detalle: { errores: { cuenta_id: 'Escoge de qué cuenta sale.' } } };
    if (!this.sql.exec(`SELECT id FROM cuentas WHERE id = ?`, a.cuenta_id).toArray()[0]) return { error: 'cuenta_desconocida', detalle: { cuenta_id: a.cuenta_id } };
    const fecha = a.fecha === undefined || a.fecha === null || a.fecha === '' ? hoy : a.fecha;
    if (!esDia(fecha)) return { error: 'datos_invalidos', detalle: { errores: { fecha: 'La fecha no es un día (AAAA-MM-DD).' } } };

    const inv = this.una('inversionistas', String(p.inversionista_id))!;
    const total = this.numero(`SELECT COUNT(*) FROM prestamo_pagos WHERE prestamo_id = ?`, p.id);
    const que = `${p.folio} · pago ${g.numero} de ${total} a ${inv.nombre}`;
    const movs: string[] = [];
    let liquidado = false;
    this.e.tx(() => {
      const t = ahora();
      const egreso = (monto: number, categoria: string, etiqueta: string): string | null => {
        if (monto <= 0) return null;
        const id = ulid();
        this.sql.exec(
          `INSERT INTO movimientos (id, tipo, monto, fecha, cuenta_id, contraparte_tipo, contraparte_id, contraparte_nombre, descripcion, categoria, creado_por, creado_at)
           VALUES (?,'egreso',?,?,?,?,?,?,?,?,?,?)`,
          id, monto, fecha, a.cuenta_id, CONTRAPARTE_INVERSIONISTA, inv.id, inv.nombre, `${que} · ${etiqueta}`, categoria, actor.usuario_id, t,
        );
        movs.push(id);
        return id;
      };
      const mc = egreso(Number(g.capital), CATEGORIA_PRESTAMO_CAPITAL, 'capital');
      const mi = egreso(Number(g.interes), CATEGORIA_PRESTAMO_INTERES, 'interés');
      this.sql.exec(
        `UPDATE prestamo_pagos SET estado = 'pagado', pagado_fecha = ?, cuenta_id = ?, movimiento_capital_id = ?, movimiento_interes_id = ?, pagado_at = ?, pagado_por = ?, nota = ? WHERE id = ?`,
        fecha, a.cuenta_id, mc, mi, t, actor.usuario_id, texto(a.nota, 500), pago_id,
      );
      liquidado = this.numero(`SELECT COUNT(*) FROM prestamo_pagos WHERE prestamo_id = ? AND estado = 'pendiente'`, p.id) === 0;
      if (liquidado) this.sql.exec(`UPDATE prestamos SET estado = 'liquidado', liquidado_at = ?, actualizado_at = ? WHERE id = ?`, t, t, p.id);
      this.apuntar({ que: 'pago', actor, prestamo_id: String(p.id), ronda_id: p.ronda_id, inversionista_id: p.inversionista_id, nota: texto(a.nota, 500), datos: { numero: g.numero, fecha, capital: g.capital, interes: g.interes, liquidado } });
    });
    for (const m of movs) this.e.alMover?.(m);
    return { pago: { ...this.una('prestamo_pagos', pago_id)!, total: Number(g.capital) + Number(g.interes) }, prestamo: this.verPrestamo(String(p.id))!, movimientos: movs, liquidado };
  }

  /** Deshacer un pago capturado por error: se van sus egresos y el pago
   *  vuelve a pendiente. Queda en la bitácora. */
  deshacerPago(pago_id: string, motivo: unknown, actor: Actor): Fila | Falla {
    const g = this.una('prestamo_pagos', pago_id);
    if (!g) return { error: 'no_encontrado' };
    if (g.estado !== 'pagado') return { error: 'pago_no_esta_hecho' };
    const nota = texto(motivo, 500);
    if (!nota) return { error: 'datos_invalidos', detalle: { errores: { motivo: 'Di por qué se deshace.' } } };
    const p = this.una('prestamos', String(g.prestamo_id))!;
    this.e.tx(() => {
      for (const m of [g.movimiento_capital_id, g.movimiento_interes_id]) if (m) this.sql.exec(`DELETE FROM movimientos WHERE id = ?`, String(m));
      this.sql.exec(
        `UPDATE prestamo_pagos SET estado = 'pendiente', pagado_fecha = NULL, cuenta_id = NULL, movimiento_capital_id = NULL, movimiento_interes_id = NULL, pagado_at = NULL, pagado_por = NULL, nota = NULL WHERE id = ?`,
        pago_id,
      );
      this.sql.exec(`UPDATE prestamos SET estado = 'activo', liquidado_at = NULL, actualizado_at = ? WHERE id = ?`, ahora(), p.id);
      this.apuntar({ que: 'pago_deshecho', actor, prestamo_id: String(p.id), ronda_id: p.ronda_id, inversionista_id: p.inversionista_id, nota, datos: { numero: g.numero } });
    });
    return this.verPrestamo(String(p.id))!;
  }

  /** 0.83.0 · Los pagos ya hechos, el más reciente arriba: de aquí se deshace
   *  uno capturado por error desde dash101. */
  pagosHechos(limite = 50): Fila[] {
    const n = Math.min(Math.max(Math.trunc(Number(limite)) || 50, 1), 200);
    return (this.sql.exec(
      `SELECT g.id, g.prestamo_id, g.numero, g.fecha, g.capital, g.interes, g.pagado_fecha, g.cuenta_id,
              p.folio, p.inversionista_id, i.nombre AS inversionista_nombre,
              (SELECT COUNT(*) FROM prestamo_pagos x WHERE x.prestamo_id = p.id) AS de
         FROM prestamo_pagos g JOIN prestamos p ON p.id = g.prestamo_id JOIN inversionistas i ON i.id = p.inversionista_id
        WHERE g.estado = 'pagado' ORDER BY g.pagado_at DESC, g.pagado_fecha DESC LIMIT ?`, n).toArray() as Fila[])
      .map((g) => ({ ...g, total: Number(g.capital) + Number(g.interes) }));
  }

  /** Lo que falta por pagar, de todos los préstamos activos, por fecha. Es
   *  el buzón de pagos de dash101. */
  pagosPendientes(hoy: string): Fila[] {
    return (this.sql.exec(
      `SELECT g.id, g.prestamo_id, g.numero, g.fecha, g.capital, g.interes,
              p.folio, p.inversionista_id, i.nombre AS inversionista_nombre, i.banco, i.clabe, i.beneficiario,
              (SELECT COUNT(*) FROM prestamo_pagos x WHERE x.prestamo_id = p.id) AS de
         FROM prestamo_pagos g JOIN prestamos p ON p.id = g.prestamo_id JOIN inversionistas i ON i.id = p.inversionista_id
        WHERE g.estado = 'pendiente' AND p.estado = 'activo' ORDER BY g.fecha, p.folio, g.numero`).toArray() as Fila[])
      .map((g) => ({ ...g, total: Number(g.capital) + Number(g.interes), vencido: g.fecha < hoy }));
  }

  /** LO QUE DASH101 PONE EN SU FLUJO PROYECTADO: lo que va a salir (los pagos
   *  pendientes de los préstamos activos Y de los que están por depositarse,
   *  porque si el dinero va a entrar también va a tener que salir) y lo que
   *  va a entrar (los depósitos aceptados que no han llegado). */
  flujo(hoy: string): Fila {
    const pagos = (this.sql.exec(
      `SELECT g.id, g.prestamo_id, g.numero, g.fecha, g.capital, g.interes, p.folio, p.estado AS prestamo_estado, i.nombre AS inversionista_nombre,
              (SELECT COUNT(*) FROM prestamo_pagos x WHERE x.prestamo_id = p.id) AS de
         FROM prestamo_pagos g JOIN prestamos p ON p.id = g.prestamo_id JOIN inversionistas i ON i.id = p.inversionista_id
        WHERE g.estado = 'pendiente' AND p.estado IN ('activo','por_depositar') ORDER BY g.fecha`).toArray() as Fila[])
      .map((g) => ({ ...g, total: Number(g.capital) + Number(g.interes), vencido: g.prestamo_estado === 'activo' && g.fecha < hoy }));
    const depositos = this.sql.exec(
      `SELECT p.id, p.folio, p.monto, p.fecha_inicio AS fecha, i.nombre AS inversionista_nombre, p.ronda_id
         FROM prestamos p JOIN inversionistas i ON i.id = p.inversionista_id WHERE p.estado = 'por_depositar' ORDER BY p.fecha_inicio`).toArray() as Fila[];
    return { pagos, depositos };
  }

  /* ─────────────── los dos tableros ─────────────── */

  resumenAdmin(hoy: string): Fila {
    const activos = this.prestamos({ estado: 'activo' }, hoy);
    const porDepositar = this.prestamos({ estado: 'por_depositar' }, hoy);
    const pendientes = this.pagosPendientes(hoy);
    const en30 = sumarDias(hoy, 30);
    return {
      capital_vigente: activos.reduce((s, p) => s + p.resumen.capital_pendiente, 0),
      interes_por_pagar: activos.reduce((s, p) => s + p.resumen.interes_pendiente, 0),
      prestamos_activos: activos.length,
      por_depositar: { cuantos: porDepositar.length, monto: porDepositar.reduce((s, p) => s + Number(p.monto), 0) },
      vencidos: { cuantos: pendientes.filter((g) => g.vencido).length, monto: pendientes.filter((g) => g.vencido).reduce((s, g) => s + g.total, 0) },
      proximos_30: { cuantos: pendientes.filter((g) => !g.vencido && g.fecha <= en30).length, monto: pendientes.filter((g) => !g.vencido && g.fecha <= en30).reduce((s, g) => s + g.total, 0) },
      ofertas_pendientes: this.numero(`SELECT COUNT(*) FROM ronda_ofertas o JOIN rondas r ON r.id = o.ronda_id WHERE o.estado = 'pendiente' AND r.estado IN ('abierta','cerrada')`),
      rondas_abiertas: this.numero(`SELECT COUNT(*) FROM rondas WHERE estado = 'abierta'`),
      inversionistas: this.numero(`SELECT COUNT(*) FROM inversionistas WHERE activo = 1`),
      proximos: pendientes.slice(0, 8),
    };
  }

  /** El estado de cuenta de quien presta. */
  estadoDeCuenta(inversionista_id: string, hoy: string): Fila | null {
    const inv = this.una('inversionistas', inversionista_id);
    if (!inv) return null;
    const lista = this.prestamos({ inversionista_id }, hoy).filter((p) => p.estado !== 'cancelado');
    const activos = lista.filter((p) => p.estado === 'activo');
    const proximos = (this.sql.exec(
      `SELECT g.id, g.prestamo_id, g.numero, g.fecha, g.capital, g.interes, p.folio,
              (SELECT COUNT(*) FROM prestamo_pagos x WHERE x.prestamo_id = p.id) AS de
         FROM prestamo_pagos g JOIN prestamos p ON p.id = g.prestamo_id
        WHERE g.estado = 'pendiente' AND p.estado = 'activo' AND p.inversionista_id = ? ORDER BY g.fecha LIMIT 12`, inversionista_id).toArray() as Fila[])
      .map((g) => ({ ...g, total: Number(g.capital) + Number(g.interes), vencido: g.fecha < hoy }));
    return {
      inversionista: { id: inv.id, nombre: inv.nombre, correo: inv.correo, telefono: inv.telefono, banco: inv.banco, clabe: inv.clabe, beneficiario: inv.beneficiario },
      resumen: {
        invertido: activos.reduce((s, p) => s + p.resumen.capital_pendiente, 0),
        por_recibir: activos.reduce((s, p) => s + p.resumen.capital_pendiente + p.resumen.interes_pendiente, 0),
        interes_ganado: lista.reduce((s, p) => s + p.resumen.interes_pagado, 0),
        interes_por_ganar: activos.reduce((s, p) => s + p.resumen.interes_pendiente, 0),
        prestamos_activos: activos.length,
        por_depositar: lista.filter((p) => p.estado === 'por_depositar').reduce((s, p) => s + Number(p.monto), 0),
        proximo: proximos[0] ?? null,
      },
      prestamos: lista.map(({ notas: _n, creado_por: _c, recibido_por: _r, cuenta_id: _k, movimiento_id: _m, ...p }) => p),
      proximos,
      rondas: this.rondasPara(inversionista_id),
    };
  }

  /* ─────────────── archivos ─────────────── */

  registrarArchivo(a: { id: string; prestamo_id: string; pago_id?: string | null; clase: string; r2_key: string; nombre: string; mime: string | null; bytes: number }, actor: Actor): Fila | Falla {
    const p = this.una('prestamos', a.prestamo_id);
    if (!p) return { error: 'no_encontrado' };
    if (a.pago_id) {
      const g = this.una('prestamo_pagos', a.pago_id);
      if (!g || g.prestamo_id !== a.prestamo_id) return { error: 'pago_desconocido' };
    }
    this.sql.exec(
      `INSERT INTO inversion_archivos (id, prestamo_id, pago_id, clase, r2_key, nombre, mime, bytes, subido_por, subido_por_nombre, creado_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      a.id, a.prestamo_id, a.pago_id ?? null, a.clase, a.r2_key, a.nombre, a.mime, a.bytes, actor.usuario_id, actor.nombre, ahora(),
    );
    return this.una('inversion_archivos', a.id)!;
  }

  archivo(id: string): Fila | null {
    const f = this.una('inversion_archivos', id);
    if (!f) return null;
    const p = this.una('prestamos', String(f.prestamo_id));
    return { ...f, inversionista_id: p?.inversionista_id ?? null };
  }

  borrarArchivo(id: string): { borrado: true; r2_key: string } | Falla {
    const f = this.una('inversion_archivos', id);
    if (!f) return { error: 'no_encontrado' };
    this.sql.exec(`DELETE FROM inversion_archivos WHERE id = ?`, id);
    return { borrado: true, r2_key: String(f.r2_key) };
  }
}

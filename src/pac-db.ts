/* bill101 fase C — emitir, dentro de la base de la empresa. 0.88.0.
 *
 * Lo que aquí vive: la cuenta de Facturama de la empresa (contraseña
 * cifrada, como la FIEL), la serie y el folio que sigue, cada intento de
 * timbrar (`emisiones`) y lo que una factura emitida necesita para
 * cancelarse. Lo que NO vive aquí: hablar con Facturama, que es de la ruta
 * (src/rutas/fiscal-pac.ts) con src/pac.ts; la base nunca abre la red para
 * timbrar, porque quien timbra está esperando en la pantalla.
 *
 * El flujo de una factura:
 *   1. `abrirEmision`  aparta el folio y guarda el borrador: `timbrando`.
 *   2. la ruta llama a Facturama.
 *   3. `timbrada`      mete la factura a `cfdi` por el mismo camino que una
 *                      subida a mano (origen `timbrado`) y la liga a la
 *                      emisión; o `fallida`, con el porqué, y el folio NO se
 *                      reusa: un hueco en los folios se explica, un folio
 *                      repetido no.
 */

import { ahora, ulid } from './lib';
import type { CfdiLeido } from './cfdi-xml';
import type { Actor, Falla, ResultadoImportar } from './fiscal-db';
import type { Borrador } from './pac';
import type { LlaveCifrada } from './fiel';

type Fila = Record<string, SqlStorageValue>;

export interface EntornoPac {
  sql: SqlStorage;
  tx<T>(fn: () => T): T;
  rfcEmpresa(): string;
  importar(lista: CfdiLeido[], actor: Actor): { resultados: ResultadoImportar[] } | Falla;
  ponerArchivo(id: string, a: { xml_llave?: string | null; pdf_llave?: string | null }): unknown;
  cancelar(id: string): Fila | Falla;
}

const esFalla = (r: unknown): r is Falla => !!r && typeof r === 'object' && typeof (r as { error?: unknown }).error === 'string';
const SERIE = /^[A-Z0-9]{1,10}$/;

export class MotorPac {
  private sql: SqlStorage;
  constructor(private e: EntornoPac) { this.sql = e.sql; }

  private una(sql: string, ...args: SqlStorageValue[]): Fila | undefined {
    return this.sql.exec(sql, ...args).toArray()[0] as Fila | undefined;
  }
  private todas(sql: string, ...args: SqlStorageValue[]): Fila[] {
    return this.sql.exec(sql, ...args).toArray() as Fila[];
  }
  private fila(): Fila | undefined { return this.una(`SELECT * FROM pac_config WHERE id = 'pac'`); }

  /* ─────────────── la cuenta ─────────────── */

  /** Lo que ve la pantalla: nunca la contraseña. */
  config(): Fila {
    const f = this.fila();
    const emitidas = Number(this.una(`SELECT COUNT(*) AS n FROM cfdi WHERE origen = 'timbrado'`)?.n ?? 0);
    return {
      rfc_empresa: this.e.rfcEmpresa().toUpperCase().replace(/[\s.-]/g, '') || null,
      cuenta: f ? {
        proveedor: f.proveedor, usuario: f.usuario, sandbox: !!f.sandbox, serie: f.serie, folio_siguiente: f.folio_siguiente,
        perfil: f.perfil_at ? { rfc: f.perfil_rfc, nombre: f.perfil_nombre, regimen: f.perfil_regimen, cp: f.perfil_cp, csd: f.perfil_csd === null ? null : !!f.perfil_csd, revisado_at: f.perfil_at, error: f.perfil_error } : null,
        puesta_por: f.puesta_por, puesta_at: f.puesta_at,
      } : null,
      emitidas,
      en_camino: Number(this.una(`SELECT COUNT(*) AS n FROM emisiones WHERE estado = 'timbrando'`)?.n ?? 0),
    } as unknown as Fila;
  }

  /** Para la ruta, que es quien descifra: el usuario, la contraseña cifrada
   *  y si es sandbox. No sale por ninguna ruta tal cual. */
  cuenta(): { org_id: string; usuario: string; cifrada: LlaveCifrada; sandbox: boolean; serie: string; lugar_expedicion: string | null } | null {
    const f = this.fila();
    if (!f) return null;
    const cp = this.una(`SELECT cp FROM fiscal_config WHERE id = 'fiscal'`)?.cp;
    return {
      org_id: String(f.org_id), usuario: String(f.usuario), cifrada: { iv: String(f.clave_iv), dato: String(f.clave_dato) },
      sandbox: !!f.sandbox, serie: String(f.serie), lugar_expedicion: cp ? String(cp) : (f.perfil_cp ? String(f.perfil_cp) : null),
    };
  }

  guardarCuenta(a: { org_id: string; usuario: string; cifrada: LlaveCifrada; sandbox: boolean; serie?: unknown }, actor: Actor): Fila | Falla {
    const antes = this.fila();
    const serie = a.serie === undefined ? (antes ? String(antes.serie) : 'A') : String(a.serie ?? '').trim().toUpperCase();
    if (!SERIE.test(serie)) return { error: 'serie_invalida', detalle: { recibido: a.serie, forma: 'letras y números, hasta diez' } };
    const t = ahora();
    this.e.tx(() => {
      if (antes) {
        // Misma cuenta, otra contraseña: el folio sigue. Otra cuenta u otro
        // ambiente: lo que Facturama sabía del perfil ya no aplica.
        const otra = String(antes.usuario) !== a.usuario || !!antes.sandbox !== a.sandbox;
        this.sql.exec(
          `UPDATE pac_config SET org_id = ?, usuario = ?, clave_iv = ?, clave_dato = ?, sandbox = ?, serie = ?, puesta_por = ?, puesta_at = ?
             ${otra ? ', perfil_rfc = NULL, perfil_nombre = NULL, perfil_regimen = NULL, perfil_cp = NULL, perfil_csd = NULL, perfil_at = NULL, perfil_error = NULL' : ''}
           WHERE id = 'pac'`,
          a.org_id, a.usuario, a.cifrada.iv, a.cifrada.dato, a.sandbox ? 1 : 0, serie, actor.usuario_id, t,
        );
      } else {
        this.sql.exec(
          `INSERT INTO pac_config (id, proveedor, org_id, usuario, clave_iv, clave_dato, sandbox, serie, folio_siguiente, puesta_por, puesta_at)
           VALUES ('pac', 'facturama', ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          a.org_id, a.usuario, a.cifrada.iv, a.cifrada.dato, a.sandbox ? 1 : 0, serie, actor.usuario_id, t,
        );
      }
    });
    return this.config();
  }

  quitarCuenta(): Fila {
    this.sql.exec(`DELETE FROM pac_config WHERE id = 'pac'`);
    return this.config();
  }

  /** La serie y desde qué folio seguir (al empezar, o al pasar de sandbox a
   *  producción, se suele querer arrancar en 1 o seguir una numeración). */
  ajustar(d: Record<string, unknown>): Fila | Falla {
    const f = this.fila();
    if (!f) return { error: 'sin_pac', detalle: { motivo: 'primero hay que poner la cuenta de Facturama' } };
    if (d.serie !== undefined) {
      const s = String(d.serie ?? '').trim().toUpperCase();
      if (!SERIE.test(s)) return { error: 'serie_invalida', detalle: { recibido: d.serie, forma: 'letras y números, hasta diez' } };
      this.sql.exec(`UPDATE pac_config SET serie = ? WHERE id = 'pac'`, s);
    }
    if (d.folio_siguiente !== undefined) {
      const n = Number(d.folio_siguiente);
      if (!Number.isInteger(n) || n < 1 || n > 99_999_999) return { error: 'folio_invalido', detalle: { recibido: d.folio_siguiente } };
      this.sql.exec(`UPDATE pac_config SET folio_siguiente = ? WHERE id = 'pac'`, n);
    }
    return this.config();
  }

  anotarPerfil(p: { rfc: string | null; nombre: string | null; regimen: string | null; cp: string | null; csd: boolean } | { error: string }): Fila {
    if ('error' in p) {
      this.sql.exec(`UPDATE pac_config SET perfil_at = ?, perfil_error = ? WHERE id = 'pac'`, ahora(), p.error);
    } else {
      this.sql.exec(
        `UPDATE pac_config SET perfil_rfc = ?, perfil_nombre = ?, perfil_regimen = ?, perfil_cp = ?, perfil_csd = ?, perfil_at = ?, perfil_error = NULL WHERE id = 'pac'`,
        p.rfc, p.nombre, p.regimen, p.cp, p.csd ? 1 : 0, ahora(),
      );
    }
    return this.config();
  }

  /* ─────────────── de dónde nace la factura ─────────────── */

  /** Lo que la pantalla pone de entrada: el cliente de un proyecto (o un
   *  cliente a secas) con lo fiscal que ya se le conozca, y el proyecto. */
  prellenar(a: { proyecto_id?: string; cliente_id?: string }): Fila | Falla {
    let proyecto: Fila | undefined;
    let cliente_id = a.cliente_id;
    if (a.proyecto_id) {
      proyecto = this.una(`SELECT id, nombre, cliente_id, precio_venta, cobrado, estado FROM proyectos WHERE id = ?`, a.proyecto_id);
      if (!proyecto) return { error: 'proyecto_desconocido' };
      cliente_id = cliente_id ?? (proyecto.cliente_id ? String(proyecto.cliente_id) : undefined);
    }
    let cliente: Fila | undefined;
    if (cliente_id) {
      cliente = this.una(`SELECT id, nombre, rfc, razon_social, regimen_fiscal, cp_fiscal, uso_cfdi, correo FROM clientes WHERE id = ?`, cliente_id);
      if (!cliente) return { error: 'cliente_desconocido' };
    }
    // Lo último que se le facturó a ese RFC, por si el cliente no tiene lo fiscal guardado.
    const ultima = cliente?.rfc
      ? this.una(`SELECT razon_social, uso FROM cfdi WHERE tipo = 'ingreso' AND rfc = ? AND origen = 'timbrado' ORDER BY fecha DESC LIMIT 1`, String(cliente.rfc).toUpperCase().replace(/[\s.-]/g, ''))
      : undefined;
    const facturado = proyecto
      ? Number(this.una(`SELECT COALESCE(SUM(total),0) AS s FROM cfdi WHERE proyecto_id = ? AND tipo = 'ingreso' AND estado = 'vigente'`, String(proyecto.id))?.s ?? 0)
      : 0;
    return {
      proyecto: proyecto ? { id: proyecto.id, nombre: proyecto.nombre, precio_venta: proyecto.precio_venta, cobrado: proyecto.cobrado, facturado, estado: proyecto.estado } : null,
      cliente: cliente ? { id: cliente.id, nombre: cliente.nombre, correo: cliente.correo } : null,
      receptor: {
        rfc: cliente?.rfc ?? '',
        razon_social: cliente?.razon_social ?? ultima?.razon_social ?? cliente?.nombre ?? '',
        regimen_fiscal: cliente?.regimen_fiscal ?? '',
        cp_fiscal: cliente?.cp_fiscal ?? '',
        uso_cfdi: cliente?.uso_cfdi ?? ultima?.uso ?? 'G03',
      },
    } as unknown as Fila;
  }

  /* ─────────────── una emisión ─────────────── */

  abrirEmision(b: Borrador, a: { proyecto_id?: string | null; cliente_id?: string | null }, actor: Actor): { id: string; serie: string; folio: number } | Falla {
    const f = this.fila();
    if (!f) return { error: 'sin_pac', detalle: { motivo: 'primero hay que poner la cuenta de Facturama' } };
    if (a.proyecto_id && !this.una(`SELECT 1 AS x FROM proyectos WHERE id = ?`, a.proyecto_id)) return { error: 'proyecto_desconocido' };
    if (a.cliente_id && !this.una(`SELECT 1 AS x FROM clientes WHERE id = ?`, a.cliente_id)) return { error: 'cliente_desconocido' };
    // Una ya en camino con el mismo receptor y total, hace menos de un minuto: es el mismo clic dos veces.
    const total = JSON.stringify(b.renglones);
    const gemela = this.una(
      `SELECT id FROM emisiones WHERE estado = 'timbrando' AND creada_at > ? AND json_extract(borrador, '$.receptor.rfc') = ? AND json_extract(borrador, '$.renglones') = json(?)`,
      new Date(Date.now() - 60_000).toISOString(), b.receptor.rfc, total,
    );
    if (gemela) return { error: 'emision_repetida', detalle: { emision_id: gemela.id, motivo: 'esa misma factura se está timbrando ahora mismo' } };
    const id = ulid();
    const folio = Number(f.folio_siguiente);
    this.e.tx(() => {
      this.sql.exec(`UPDATE pac_config SET folio_siguiente = folio_siguiente + 1 WHERE id = 'pac'`);
      this.sql.exec(
        `INSERT INTO emisiones (id, serie, folio, estado, borrador, proyecto_id, cliente_id, creada_por, creada_at) VALUES (?,?,?,'timbrando',?,?,?,?,?)`,
        id, String(f.serie), folio, JSON.stringify(b), a.proyecto_id ?? null, a.cliente_id ?? null, actor.usuario_id, ahora(),
      );
    });
    return { id, serie: String(f.serie), folio };
  }

  /** Facturama timbró y la ruta ya tiene el XML leído: entra a `cfdi` por el
   *  camino de siempre, se liga a la emisión, al proyecto y al cliente, y al
   *  cliente se le guarda lo fiscal con que se le facturó. */
  timbrada(emision_id: string, leida: CfdiLeido, pac_id: string, actor: Actor): Fila | Falla {
    const em = this.una(`SELECT * FROM emisiones WHERE id = ?`, emision_id);
    if (!em) return { error: 'emision_desconocida' };
    const r = this.e.importar([leida], actor);
    if (esFalla(r)) return r;
    const x = r.resultados[0];
    if (!x?.id || x.resultado === 'rechazada') return { error: 'cfdi_no_entro', detalle: { motivo: x?.motivo, detalle: x?.detalle } };
    const b = JSON.parse(String(em.borrador)) as Borrador;
    this.e.tx(() => {
      this.sql.exec(`UPDATE cfdi SET pac_id = ?, proyecto_id = COALESCE(?, proyecto_id), actualizado_at = ? WHERE id = ?`, pac_id, em.proyecto_id, ahora(), x.id!);
      this.sql.exec(`UPDATE emisiones SET estado = 'timbrada', pac_id = ?, uuid = ?, cfdi_id = ?, error = NULL, terminada_at = ? WHERE id = ?`, pac_id, leida.uuid, x.id!, ahora(), emision_id);
      if (em.cliente_id) {
        this.sql.exec(
          `UPDATE clientes SET rfc = ?, razon_social = ?, regimen_fiscal = ?, cp_fiscal = ?, uso_cfdi = ? WHERE id = ?`,
          b.receptor.rfc, b.receptor.razon_social, b.receptor.regimen_fiscal, b.receptor.cp_fiscal, b.receptor.uso_cfdi, String(em.cliente_id),
        );
      }
    });
    return { emision_id, cfdi_id: x.id, uuid: leida.uuid, resultado: x.resultado, ligada_a: x.ligada_a ?? [] } as unknown as Fila;
  }

  /** Facturama dijo que no (o no se sabe). `sin_respuesta`: se mandó y no
   *  contestó; la emisión se queda `timbrando` para poder preguntar después
   *  si de verdad se timbró, en vez de timbrarla dos veces. */
  fallida(emision_id: string, error: string, sin_respuesta = false): Fila | Falla {
    const em = this.una(`SELECT id, estado FROM emisiones WHERE id = ?`, emision_id);
    if (!em) return { error: 'emision_desconocida' };
    if (em.estado !== 'timbrando') return { error: 'emision_cerrada', detalle: { estado: em.estado } };
    if (sin_respuesta) this.sql.exec(`UPDATE emisiones SET error = ? WHERE id = ?`, error.slice(0, 2000), emision_id);
    else this.sql.exec(`UPDATE emisiones SET estado = 'fallida', error = ?, terminada_at = ? WHERE id = ?`, error.slice(0, 2000), ahora(), emision_id);
    return this.una(`SELECT id, serie, folio, estado, error, creada_at, terminada_at FROM emisiones WHERE id = ?`, emision_id)!;
  }

  emision(id: string): Fila | null {
    const em = this.una(`SELECT * FROM emisiones WHERE id = ?`, id);
    if (!em) return null;
    return { ...em, borrador: JSON.parse(String(em.borrador)) };
  }

  emisiones(limite = 50): Fila[] {
    return this.todas(
      `SELECT e.id, e.serie, e.folio, e.estado, e.uuid, e.cfdi_id, e.pac_id, e.error, e.proyecto_id, e.cliente_id, e.creada_por, e.creada_at, e.terminada_at,
              json_extract(e.borrador, '$.receptor.rfc') AS rfc, json_extract(e.borrador, '$.receptor.razon_social') AS razon_social,
              c.total AS total, c.estado AS cfdi_estado
         FROM emisiones e LEFT JOIN cfdi c ON c.id = e.cfdi_id ORDER BY e.creada_at DESC LIMIT ?`,
      Math.min(200, Math.max(1, limite)),
    );
  }

  /* ─────────────── cancelar ─────────────── */

  /** Lo que la ruta necesita para pedirle a Facturama la cancelación. */
  paraCancelar(cfdi_id: string): { pac_id: string; uuid: string; estado: string; cancelacion: string | null } | Falla {
    const f = this.una(`SELECT id, pac_id, uuid, estado, cancelacion, origen, tipo FROM cfdi WHERE id = ?`, cfdi_id);
    if (!f) return { error: 'cfdi_desconocido' };
    if (f.tipo !== 'ingreso' || f.origen !== 'timbrado' || !f.pac_id) return { error: 'no_se_emitio_aqui', detalle: { motivo: 'sólo se puede cancelar desde aquí una factura que se timbró desde aquí' } };
    if (f.estado !== 'vigente') return { error: 'ya_cancelada' };
    return { pac_id: String(f.pac_id), uuid: String(f.uuid), estado: String(f.estado), cancelacion: (f.cancelacion as string | null) ?? null };
  }

  /** Lo que Facturama contestó. `cancelada`: se cancela aquí con la regla de
   *  la 0009 (sus movimientos vuelven a «sin factura»). `pendiente`: el
   *  receptor tiene que aceptar; se anota, y la lista del SAT (fase D) dirá
   *  después en qué quedó. */
  cancelacion(cfdi_id: string, r: { estado: 'cancelada' | 'pendiente' | 'vigente'; motivo: string; acuse_llave?: string | null }): Fila | Falla {
    const f = this.una(`SELECT id, estado FROM cfdi WHERE id = ?`, cfdi_id);
    if (!f) return { error: 'cfdi_desconocido' };
    let cambio = false;
    this.e.tx(() => {
      this.sql.exec(`UPDATE cfdi SET motivo_cancelacion = ?, cancelacion = ?, acuse_llave = COALESCE(?, acuse_llave), actualizado_at = ? WHERE id = ?`, r.motivo, r.estado === 'cancelada' ? 'cancelada' : r.estado === 'pendiente' ? 'pendiente' : 'rechazada', r.acuse_llave ?? null, ahora(), cfdi_id);
      if (r.estado === 'cancelada' && f.estado === 'vigente') cambio = !esFalla(this.e.cancelar(cfdi_id));
      if (r.estado === 'cancelada') this.sql.exec(`UPDATE cfdi SET estado_sat = 'cancelado', sat_revisado_at = ? WHERE id = ?`, ahora(), cfdi_id);
    });
    return { cfdi_id, estado: r.estado, cambio } as unknown as Fila;
  }
}

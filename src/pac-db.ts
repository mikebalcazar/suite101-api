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

import { ahora, normalizar, normalizaCorreo, ulid } from './lib';
import type { CfdiLeido } from './cfdi-xml';
import type { Actor, Falla, ResultadoImportar } from './fiscal-db';
import { RFC_PUBLICO, type Borrador } from './pac';
import type { LlaveCifrada } from './fiel';

type Fila = Record<string, SqlStorageValue>;

export interface EntornoPac {
  sql: SqlStorage;
  tx<T>(fn: () => T): T;
  rfcEmpresa(): string;
  /** `rfcComo`: en una cuenta de pruebas el emisor del XML es el RFC del
   *  sandbox, no el de la empresa; con esto la factura entra como emitida. */
  importar(lista: CfdiLeido[], actor: Actor, rfcComo?: string): { resultados: ResultadoImportar[] } | Falla;
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
    const emitidas = Number(this.una(`SELECT COUNT(*) AS n FROM cfdi WHERE pac_id IS NOT NULL`)?.n ?? 0);
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
      cliente = this.una(`SELECT id, nombre, rfc, razon_social, regimen_fiscal, cp_fiscal, uso_cfdi, correo, correos_factura FROM clientes WHERE id = ?`, cliente_id);
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
      cliente: cliente ? { id: cliente.id, nombre: cliente.nombre, correo: cliente.correo, correos: correosDe(cliente) } : null,
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
    /* Una que sigue «timbrando» —el mismo clic dos veces, o una a la que
     * Facturama no contestó— cierra la puerta: no se timbra nada más hasta
     * saber en qué quedó (POST /fiscal/emisiones/:id/resolver). Es la única
     * manera de no timbrar dos veces la misma factura sin que nadie se entere. */
    // El mismo clic dos veces, y la primera ya terminó: la misma factura
    // (mismo receptor, mismos renglones) timbrada hace menos de un minuto.
    const igual = this.una(
      `SELECT id, serie, folio, cfdi_id FROM emisiones WHERE estado = 'timbrada' AND terminada_at > ?
         AND json_extract(borrador, '$.receptor.rfc') = ? AND json_extract(borrador, '$.renglones') = json(?) ORDER BY terminada_at DESC LIMIT 1`,
      new Date(Date.now() - 60_000).toISOString(), b.receptor.rfc, JSON.stringify(b.renglones),
    );
    if (igual) return { error: 'emision_repetida', detalle: { emision_id: igual.id, cfdi_id: igual.cfdi_id, folio: `${igual.serie}-${igual.folio}`, motivo: 'esa misma factura se acaba de timbrar' } };
    const abierta = this.una(`SELECT id, serie, folio, creada_at, error FROM emisiones WHERE estado = 'timbrando' ORDER BY creada_at LIMIT 1`);
    if (abierta) {
      const reciente = Date.parse(String(abierta.creada_at)) > Date.now() - 60_000 && !abierta.error;
      return {
        error: reciente ? 'emision_repetida' : 'emision_en_camino',
        detalle: { emision_id: abierta.id, folio: `${abierta.serie}-${abierta.folio}`, motivo: reciente ? 'hay una factura timbrándose ahora mismo' : 'hay una emisión sin resolver: no se sabe si se timbró. Hay que resolverla antes de timbrar otra' },
      };
    }
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
  timbrada(emision_id: string, leida: CfdiLeido, pac_id: string, actor: Actor, extra: { correos?: string[] } = {}): Fila | Falla {
    const em = this.una(`SELECT * FROM emisiones WHERE id = ?`, emision_id);
    if (!em) return { error: 'emision_desconocida' };
    if (em.estado === 'timbrada') return { error: 'emision_cerrada', detalle: { estado: em.estado, cfdi_id: em.cfdi_id } };
    // El XML tiene que ser EL de esta emisión: misma serie y folio. Otro
    // archivo (otro id de Facturama) no entra como si fuera ésta.
    if ((leida.serie ?? '') !== String(em.serie) || String(leida.folio ?? '') !== String(em.folio)) {
      return { error: 'xml_de_otra_factura', detalle: { esperado: `${em.serie}-${em.folio}`, vino: `${leida.serie ?? ''}-${leida.folio ?? ''}` } };
    }
    const sandbox = !!this.fila()?.sandbox;
    const r = this.e.importar([leida], actor, sandbox ? leida.emisor.rfc : undefined);
    if (esFalla(r)) return r;
    const x = r.resultados[0];
    if (!x?.id || x.resultado === 'rechazada') return { error: 'cfdi_no_entro', detalle: { motivo: x?.motivo, detalle: x?.detalle } };
    const b = JSON.parse(String(em.borrador)) as Borrador;
    const correos = limpiarCorreos(extra.correos);
    let cliente_id: string | null = em.cliente_id ? String(em.cliente_id) : null;
    this.e.tx(() => {
      this.sql.exec(`UPDATE cfdi SET pac_id = ?, proyecto_id = COALESCE(?, proyecto_id), actualizado_at = ? WHERE id = ?`, pac_id, em.proyecto_id, ahora(), x.id!);
      this.sql.exec(`UPDATE emisiones SET estado = 'timbrada', pac_id = ?, uuid = ?, cfdi_id = ?, error = NULL, terminada_at = ? WHERE id = ?`, pac_id, leida.uuid, x.id!, ahora(), emision_id);
      /* Mike, 9-oct: «si se genera una factura con un RFC nuevo, guardar ese
       * RFC como cliente nuevo para futuras facturas». Sin cliente dicho, se
       * busca por RFC; si no está, se da de alta con lo de la factura. Al
       * público en general no se le abre cliente. */
      if (!cliente_id && b.receptor.rfc !== RFC_PUBLICO) {
        const ya = this.una(`SELECT id FROM clientes WHERE upper(replace(replace(replace(rfc,' ',''),'-',''),'.','')) = ? ORDER BY creado_at LIMIT 1`, b.receptor.rfc);
        if (ya) cliente_id = String(ya.id);
        else {
          cliente_id = ulid();
          this.sql.exec(
            `INSERT INTO clientes (id, nombre, nombre_norm, rfc, creado_en_app, creado_at) VALUES (?,?,?,?,?,?)`,
            cliente_id, b.receptor.razon_social, normalizar(b.receptor.razon_social), b.receptor.rfc, 'bill101', ahora(),
          );
        }
      }
      if (cliente_id) {
        this.sql.exec(`UPDATE emisiones SET cliente_id = ? WHERE id = ?`, cliente_id, emision_id);
        this.sql.exec(
          `UPDATE clientes SET rfc = ?, razon_social = ?, regimen_fiscal = ?, cp_fiscal = ?, uso_cfdi = ?${correos.length ? ', correos_factura = ?' : ''} WHERE id = ?`,
          b.receptor.rfc, b.receptor.razon_social, b.receptor.regimen_fiscal, b.receptor.cp_fiscal, b.receptor.uso_cfdi, ...(correos.length ? [JSON.stringify(correos)] : []), cliente_id,
        );
      }
      this.anotarConceptos(b);
    });
    return { emision_id, cfdi_id: x.id, uuid: leida.uuid, resultado: x.resultado, ligada_a: x.ligada_a ?? [], cliente_id } as unknown as Fila;
  }

  /* ─────────────── el catálogo de facturación ─────────────── */

  /** Mike, 9-oct: «cada vez que se genere un concepto en la factura,
   *  guardarlo en catálogo de facturación». Clave + descripción es la llave;
   *  se guarda lo último con que se facturó y cuántas veces. */
  private anotarConceptos(b: Borrador): void {
    for (const r of b.renglones) {
      const norm = normalizar(r.descripcion);
      if (!norm) continue;
      this.sql.exec(
        `INSERT INTO conceptos_fact (id, clave_prod_serv, clave_unidad, unidad, descripcion, descripcion_norm, precio_unitario, iva, veces, usado_at, creado_at)
           VALUES (?,?,?,?,?,?,?,?,1,?,?)
         ON CONFLICT(clave_prod_serv, descripcion_norm) DO UPDATE SET
           clave_unidad = excluded.clave_unidad, unidad = excluded.unidad, descripcion = excluded.descripcion,
           precio_unitario = excluded.precio_unitario, iva = excluded.iva, veces = veces + 1, usado_at = excluded.usado_at`,
        ulid(), r.clave_prod_serv, r.clave_unidad, r.unidad ?? null, r.descripcion, norm, r.precio_unitario, r.iva ?? null, ahora(), ahora(),
      );
    }
  }

  /** Para escoger: lo más usado primero; con `q`, lo que lo contenga. */
  conceptos(q = '', limite = 30): Fila[] {
    const n = normalizar(q);
    const lim = Math.min(200, Math.max(1, Math.floor(limite) || 30));
    const sel = `SELECT id, clave_prod_serv, clave_unidad, unidad, descripcion, precio_unitario, iva, veces, usado_at FROM conceptos_fact`;
    if (!n) return this.todas(`${sel} ORDER BY veces DESC, usado_at DESC LIMIT ?`, lim);
    const palabras = n.split(' ').filter(Boolean).slice(0, 6);
    const donde = palabras.map(() => `(descripcion_norm LIKE ? OR clave_prod_serv LIKE ?)`).join(' AND ');
    const args = palabras.flatMap((w) => [`%${w}%`, `${w}%`]);
    return this.todas(`${sel} WHERE ${donde} ORDER BY veces DESC, usado_at DESC LIMIT ?`, ...args, lim);
  }

  /** Los clientes, para escoger a quién se le factura: por nombre, razón
   *  social o RFC. Trae lo fiscal que se les conozca y sus correos. */
  clientes(q = '', limite = 30): Record<string, unknown>[] {
    const n = normalizar(q);
    const lim = Math.min(200, Math.max(1, Math.floor(limite) || 30));
    const sel = `SELECT id, nombre, rfc, razon_social, regimen_fiscal, cp_fiscal, uso_cfdi, correo, correos_factura FROM clientes`;
    const filas = !n
      ? this.todas(`${sel} ORDER BY nombre_norm LIMIT ?`, lim)
      : this.todas(`${sel} WHERE nombre_norm LIKE ? OR lower(razon_social) LIKE ? OR upper(rfc) LIKE ? ORDER BY nombre_norm LIMIT ?`, `%${n}%`, `%${n}%`, `${n.toUpperCase().replace(/[\s.-]/g, '')}%`, lim);
    return filas.map((c) => ({ id: c.id, nombre: c.nombre, rfc: c.rfc, razon_social: c.razon_social, regimen_fiscal: c.regimen_fiscal, cp_fiscal: c.cp_fiscal, uso_cfdi: c.uso_cfdi, correos: correosDe(c) }));
  }

  /** Los correos a donde se le manda la factura a este cliente. */
  correosDe(cliente_id: string): string[] {
    const c = this.una(`SELECT correo, correos_factura FROM clientes WHERE id = ?`, cliente_id);
    return c ? correosDe(c) : [];
  }

  ponerCorreos(cliente_id: string, correos: unknown): Fila | Falla {
    if (!this.una(`SELECT 1 AS x FROM clientes WHERE id = ?`, cliente_id)) return { error: 'cliente_desconocido' };
    const lista = limpiarCorreos(correos);
    this.sql.exec(`UPDATE clientes SET correos_factura = ? WHERE id = ?`, lista.length ? JSON.stringify(lista) : null, cliente_id);
    return { cliente_id, correos: lista } as unknown as Fila;
  }

  /* ─────────────── lo que el PDF lleva además de lo fiscal ─────────────── */

  pdfConfig(): Fila {
    const f = this.una(`SELECT banco, clabe, cuenta, beneficiario, leyenda, puesta_por, puesta_at FROM pdf_config WHERE id = 'pdf'`);
    return { banco: f?.banco ?? null, clabe: f?.clabe ?? null, cuenta: f?.cuenta ?? null, beneficiario: f?.beneficiario ?? null, leyenda: f?.leyenda ?? null, puesta_at: f?.puesta_at ?? null };
  }

  ponerPdfConfig(d: Record<string, unknown>, actor: Actor): Fila | Falla {
    const t = (k: string, tope: number) => { const v = d[k]; return typeof v === 'string' && v.trim() ? v.trim().slice(0, tope) : null; };
    const clabe = t('clabe', 18);
    if (clabe && !/^\d{18}$/.test(clabe)) return { error: 'datos_invalidos', detalle: { campo: 'clabe', motivo: 'la CLABE son 18 dígitos' } };
    this.sql.exec(
      `INSERT INTO pdf_config (id, banco, clabe, cuenta, beneficiario, leyenda, puesta_por, puesta_at) VALUES ('pdf',?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET banco = excluded.banco, clabe = excluded.clabe, cuenta = excluded.cuenta, beneficiario = excluded.beneficiario, leyenda = excluded.leyenda, puesta_por = excluded.puesta_por, puesta_at = excluded.puesta_at`,
      t('banco', 60), clabe, t('cuenta', 30), t('beneficiario', 200), t('leyenda', 500), actor.usuario_id, ahora(),
    );
    return this.pdfConfig();
  }

  /** Facturama dijo que no (o no se sabe). `sin_respuesta`: se mandó y no
   *  contestó; la emisión se queda `timbrando` para poder preguntar después
   *  si de verdad se timbró, en vez de timbrarla dos veces. */
  fallida(emision_id: string, error: string, sin_respuesta = false, sabido: { pac_id?: string | null; uuid?: string | null } = {}): Fila | Falla {
    const em = this.una(`SELECT id, estado FROM emisiones WHERE id = ?`, emision_id);
    if (!em) return { error: 'emision_desconocida' };
    if (em.estado !== 'timbrando') return { error: 'emision_cerrada', detalle: { estado: em.estado } };
    // Si Facturama sí la timbró y lo que falló fue después, su id y su folio
    // fiscal se guardan: con ellos se recupera (resolver).
    if (sin_respuesta) this.sql.exec(`UPDATE emisiones SET error = ?, pac_id = COALESCE(?, pac_id), uuid = COALESCE(?, uuid) WHERE id = ?`, error.slice(0, 2000), sabido.pac_id ?? null, sabido.uuid ?? null, emision_id);
    else this.sql.exec(`UPDATE emisiones SET estado = 'fallida', error = ?, terminada_at = ? WHERE id = ?`, error.slice(0, 2000), ahora(), emision_id);
    return this.una(`SELECT id, serie, folio, estado, error, pac_id, uuid, creada_at, terminada_at FROM emisiones WHERE id = ?`, emision_id)!;
  }

  /** Cerrar a mano una emisión que se quedó «timbrando» y que Facturama
   *  dice que NO existe (o que alguien decide dar por perdida). */
  darPorFallida(emision_id: string, motivo: string): Fila | Falla {
    return this.fallida(emision_id, motivo, false);
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
    // Con `pac_id` basta: si primero la bajó el SAT (fase D) y luego se ligó a su emisión, su origen dice `sat` y sigue siendo nuestra.
    if (f.tipo !== 'ingreso' || !f.pac_id) return { error: 'no_se_emitio_aqui', detalle: { motivo: 'sólo se puede cancelar desde aquí una factura que se timbró desde aquí' } };
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

/* ─────────────── correos ─────────────── */

/** Una lista de correos limpia: válidos, sin repetir, a lo más ocho. */
export function limpiarCorreos(v: unknown): string[] {
  const crudos = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\s]+/) : [];
  const vistos = new Set<string>();
  for (const x of crudos) {
    const c = normalizaCorreo(x);
    if (c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) vistos.add(c);
    if (vistos.size >= 8) break;
  }
  return [...vistos];
}

/** Los correos de factura de un cliente; si no tiene, el del contacto. */
function correosDe(c: Fila): string[] {
  const lista = typeof c.correos_factura === 'string' ? limpiarCorreos((() => { try { return JSON.parse(String(c.correos_factura)); } catch { return c.correos_factura; } })()) : [];
  return lista.length ? lista : limpiarCorreos(c.correo);
}

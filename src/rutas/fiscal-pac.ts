/* /orgs/:o/fiscal/pac/* y /fiscal/emitir — bill101 fase C: timbrar (0.88.0).
 *
 *   GET    /fiscal/pac                 la cuenta de Facturama (sin contraseña), su perfil, cuántas emitidas
 *   PUT    /fiscal/pac                 { usuario, clave, sandbox, serie? } — se prueba contra Facturama antes de guardar
 *   DELETE /fiscal/pac
 *   PATCH  /fiscal/pac                 { serie?, folio_siguiente? }
 *   POST   /fiscal/pac/perfil          volver a preguntarle a Facturama de quién es la cuenta y si tiene sello
 *   GET    /fiscal/emitir/prellenar    ?proyecto_id= | ?cliente_id= — con qué arranca la pantalla
 *   POST   /fiscal/emitir/revisar      el borrador → sus cuentas, o la primera falla (sin timbrar)
 *   POST   /fiscal/emitir              el borrador → timbrada (201) o por qué no
 *   GET    /fiscal/emisiones           los intentos, con su folio y en qué quedaron
 *   POST   /fiscal/emisiones/:id/resolver   una que se quedó «timbrando»: se busca en Facturama por su folio;
 *                                       si existe se recupera (XML, PDF, entra a cfdi); si no, queda fallida
 *   POST   /fiscal/cfdi/:id/cancelar   { motivo: '01'..'04', uuid_sustituto? }
 *   GET    /fiscal/cfdi/:id/pdf        el PDF de una emitida (Facturama lo arma; se guarda la primera vez)
 *
 * QUIÉN PUEDE. Poner o quitar la cuenta de Facturama: sólo quien dirige
 * (owner o admin). Emitir y cancelar: quien dirige o quien lleva la
 * contabilidad. Ver: quien ve lo fiscal.
 *
 * LA CONTRASEÑA de Facturama llega una vez, se prueba contra Facturama
 * (perfil fiscal) y se guarda cifrada con la misma llave que la FIEL
 * (src/fiel.ts). Nunca sale por ninguna ruta.
 */

import type { Hono } from 'hono';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { cifrarLlave, descifrarLlave, llaveMaestraFiel } from '../fiel';
import { esFallaXml, leerCfdi } from '../cfdi-xml';
import { horaMx } from '../sat-db';
import {
  asegurarSerie, bajar, buscarPorFolio, cancelar, cuentas, cuerpoFacturama, esFallaPac, MOTIVOS_CANCELACION, perfil, revisarBorrador, timbrar,
  type Cuenta_, type Ventanilla,
} from '../pac';
import type { PermisosFiscales } from './fiscal-sat';

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
const esFalla = (r: unknown): r is { error: string; detalle?: unknown } =>
  !!r && typeof r === 'object' && 'error' in (r as Record<string, unknown>) && typeof (r as Record<string, unknown>).error === 'string';

const llaveXml = (org: string, id: string): string => `orgs/${org}/cfdi/${id}.xml`;
const llavePdf = (org: string, id: string): string => `orgs/${org}/cfdi/${id}.pdf`;
const llaveAcuse = (org: string, id: string): string => `orgs/${org}/cfdi/${id}-acuse.xml`;

/* `pac_credenciales` NO es 401: para las pantallas de la suite un 401 es «se
 * acabó tu sesión» y mandan a entrar. Lo encontró la prueba de pantalla. */
const codigoDe = (e: string): number => (e === 'pac_credenciales' ? 422 : e === 'pac_no_responde' ? 502 : e === 'pac_rechaza' ? 422 : e.endsWith('_desconocido') || e.endsWith('_desconocida') ? 404 : e === 'sin_pac' ? 409 : 400);

export function montarFiscalPac(rutas: App, p: PermisosFiscales): void {
  const dirige = (c: Ctx): boolean => {
    const q = c.get('quien');
    return q.clase === 'miembro' && (q.rol === 'owner' || q.rol === 'admin');
  };
  const ventanilla = (c: Ctx): Ventanilla => {
    // Sólo fuera de producción se le puede decir que Facturama está en otro lado.
    const base = c.env.ENTORNO !== 'produccion' && c.env.FACTURAMA_BASE ? c.env.FACTURAMA_BASE.replace(/\/$/, '') : undefined;
    return { traer: (a, b) => fetch(a, b), base };
  };
  /** La cuenta abierta, o por qué no. */
  const abrirCuenta = async (c: Ctx): Promise<(Cuenta_ & { serie: string; lugar_expedicion: string | null }) | { error: string; detalle?: unknown }> => {
    const k = await stub(c).pac('cuenta');
    if (!k) return { error: 'sin_pac', detalle: { motivo: 'primero hay que poner la cuenta de Facturama' } };
    const clave = await descifrarLlave(k.cifrada, await llaveMaestraFiel(c.env), k.org_id, `pac:${k.usuario}`);
    if (!clave) return { error: 'pac_clave_no_abre', detalle: { motivo: 'la contraseña guardada de Facturama no se pudo abrir: hay que ponerla otra vez' } };
    return { usuario: k.usuario, clave: new TextDecoder().decode(clave), sandbox: k.sandbox, serie: k.serie, lugar_expedicion: k.lugar_expedicion };
  };
  const conPermisos = async (c: Ctx, d: Record<string, unknown>) => ({ ...d, puede_configurar: dirige(c), puede_emitir: await p.administra(c) });

  /* ─────────────── la cuenta ─────────────── */

  rutas.get('/:o/fiscal/pac', async (c) => {
    if (!p.puedeLeer(c)) return err(c, 'sin_permiso', 403);
    return ok(c, await conPermisos(c, await stub(c).pac('config')));
  });

  rutas.put('/:o/fiscal/pac', async (c) => {
    if (!dirige(c)) return err(c, 'sin_permiso', 403, { motivo: 'la cuenta de Facturama sólo la pone quien dirige' });
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const usuario = String(b.usuario ?? '').trim();
    let clave = String(b.clave ?? '');
    if (!usuario || usuario.length > 200) return err(c, 'datos_invalidos', 400, { falta: 'usuario' });
    if (!clave || clave.length > 500) return err(c, 'datos_invalidos', 400, { falta: 'clave' });
    if (typeof b.sandbox !== 'boolean') return err(c, 'datos_invalidos', 400, { falta: 'sandbox', forma: 'true (cuenta de pruebas) o false (cuenta de verdad)' });
    // Antes de guardar nada: ¿Facturama acepta esa cuenta, y de quién es?
    const cuenta: Cuenta_ = { usuario, clave, sandbox: b.sandbox };
    const pf = await perfil(cuenta, ventanilla(c));
    if (esFallaPac(pf)) return err(c, pf.error, codigoDe(pf.error), pf.detalle);
    const rfcEmpresa = String((await stub(c).pac('config')).rfc_empresa ?? '');
    if (!b.sandbox && pf.rfc && rfcEmpresa && pf.rfc !== rfcEmpresa) {
      return err(c, 'pac_de_otro_rfc', 409, { facturama: pf.rfc, empresa: rfcEmpresa, motivo: 'esa cuenta de Facturama factura con otro RFC, no con el de la empresa' });
    }
    const org = c.get('org_id');
    const cifrada = await cifrarLlave(new TextEncoder().encode(clave), await llaveMaestraFiel(c.env), org, `pac:${usuario}`);
    clave = '';
    const r = await stub(c).pac('guardarCuenta', [{ org_id: org, usuario, cifrada, sandbox: b.sandbox, serie: b.serie }, p.actor(c)]);
    if (esFalla(r)) return err(c, r.error, 400, r.detalle);
    const cfg = await stub(c).pac('anotarPerfil', [pf]);
    // La serie tiene que existir en la sucursal de Facturama: se asegura ya,
    // para que la primera factura no se tope con eso.
    const serie = await asegurarSerie(cuenta, ventanilla(c), String(cfg.cuenta.serie), Number(cfg.cuenta.folio_siguiente));
    return ok(c, await conPermisos(c, { ...cfg, serie_en_facturama: esFallaPac(serie) ? { error: serie.error, detalle: serie.detalle } : serie }));
  });

  rutas.delete('/:o/fiscal/pac', async (c) => {
    if (!dirige(c)) return err(c, 'sin_permiso', 403);
    return ok(c, await conPermisos(c, await stub(c).pac('quitarCuenta')));
  });

  rutas.patch('/:o/fiscal/pac', async (c) => {
    if (!dirige(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = await stub(c).pac('ajustar', [b]);
    if (esFalla(r)) return err(c, r.error, codigoDe(r.error), r.detalle);
    let serie_en_facturama: unknown = null;
    if (b.serie !== undefined) {
      const k = await abrirCuenta(c);
      if (!('error' in k)) { const s = await asegurarSerie(k, ventanilla(c), String(r.cuenta.serie), Number(r.cuenta.folio_siguiente)); serie_en_facturama = esFallaPac(s) ? { error: s.error, detalle: s.detalle } : s; }
    }
    return ok(c, await conPermisos(c, { ...r, serie_en_facturama }));
  });

  rutas.post('/:o/fiscal/pac/perfil', async (c) => {
    if (!(await p.administra(c))) return err(c, 'sin_permiso', 403);
    const k = await abrirCuenta(c);
    if ('error' in k) return err(c, k.error, codigoDe(k.error), k.detalle);
    const pf = await perfil(k, ventanilla(c));
    const r = await stub(c).pac('anotarPerfil', [esFallaPac(pf) ? { error: `${pf.error}: ${JSON.stringify(pf.detalle ?? {}).slice(0, 300)}` } : pf]);
    if (esFallaPac(pf)) return err(c, pf.error, codigoDe(pf.error), { ...pf.detalle, config: r });
    return ok(c, await conPermisos(c, r));
  });

  /* ─────────────── emitir ─────────────── */

  rutas.get('/:o/fiscal/emitir/prellenar', async (c) => {
    if (!p.puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const q = c.req.query();
    const r = await stub(c).pac('prellenar', [{ proyecto_id: q.proyecto_id || undefined, cliente_id: q.cliente_id || undefined }]);
    if (esFalla(r)) return err(c, r.error, 404, r.detalle);
    return ok(c, r);
  });

  rutas.post('/:o/fiscal/emitir/revisar', async (c) => {
    if (!p.puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = revisarBorrador(b.borrador ?? b);
    if (esFallaPac(r)) return err(c, r.error, 400, r.detalle);
    return ok(c, { borrador: r, cuentas: cuentas(r.renglones) });
  });

  rutas.post('/:o/fiscal/emitir', async (c) => {
    if (!(await p.administra(c))) return err(c, 'sin_permiso', 403, { motivo: 'emite quien dirige o quien lleva la contabilidad' });
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const borrador = revisarBorrador(b.borrador ?? b);
    if (esFallaPac(borrador)) return err(c, borrador.error, 400, borrador.detalle);
    const k = await abrirCuenta(c);
    if ('error' in k) return err(c, k.error, codigoDe(k.error), k.detalle);
    const cfg = await stub(c).pac('config');
    const pf = cfg.cuenta?.perfil;
    if (pf && pf.csd === false) return err(c, 'pac_sin_sello', 409, { motivo: 'la cuenta de Facturama no tiene cargado el sello (CSD): sin él no timbra. Se carga en el portal de Facturama.' });
    // En producción la factura sale con el RFC de la cuenta de Facturama: tiene que ser el de la empresa.
    if (!k.sandbox && (!cfg.rfc_empresa || (pf?.rfc && pf.rfc !== cfg.rfc_empresa))) {
      return err(c, 'pac_de_otro_rfc', 409, { facturama: pf?.rfc ?? null, empresa: cfg.rfc_empresa ?? null, motivo: 'la cuenta de Facturama factura con otro RFC que el de la empresa (o la empresa no tiene RFC)' });
    }
    const lugar = k.lugar_expedicion;
    if (!lugar || !/^\d{5}$/.test(lugar)) return err(c, 'falta_cp_empresa', 409, { motivo: 'falta el código postal fiscal de la empresa (Ajustes), que es el lugar de expedición' });

    // Por si la serie se puso a mano en Facturama, o se borró allá: se asegura antes de apartar folio.
    const serie = await asegurarSerie(k, ventanilla(c), k.serie, Number(cfg.cuenta?.folio_siguiente ?? 1));
    if (esFallaPac(serie)) return err(c, serie.error, codigoDe(serie.error), serie.detalle);
    const em = await stub(c).pac('abrirEmision', [borrador, { proyecto_id: typeof b.proyecto_id === 'string' ? b.proyecto_id : null, cliente_id: typeof b.cliente_id === 'string' ? b.cliente_id : null }, p.actor(c)]);
    if (esFalla(em)) return err(c, em.error, em.error === 'emision_repetida' || em.error === 'emision_en_camino' ? 409 : codigoDe(em.error), em.detalle);
    const org = c.get('org_id');
    const cuerpo = cuerpoFacturama(borrador, { serie: em.serie, folio: em.folio, fecha: horaMx(Date.now() - 60_000), lugar_expedicion: lugar });
    const t = await timbrar(k, ventanilla(c), cuerpo);
    if (esFallaPac(t)) {
      const sinRespuesta = t.error === 'pac_no_responde';
      const texto = `${t.error}: ${JSON.stringify(t.detalle ?? {})}`;
      await stub(c).pac('fallida', [em.id, texto, sinRespuesta]);
      return err(c, t.error, codigoDe(t.error), { ...t.detalle, emision_id: em.id, folio: `${em.serie}-${em.folio}`, ...(sinRespuesta ? { que_hacer: 'no se sabe si se timbró. Antes de volver a intentar, revisar en Facturama si existe el folio.' } : {}) });
    }
    // Timbrada. Su XML es la verdad: se baja, se lee y entra como cualquier otra.
    const fin = await recuperar(c, k, { id: em.id, serie: em.serie, folio: em.folio }, t.pac_id, t.uuid);
    if ('error' in fin) return err(c, fin.error, fin.estado, fin.detalle);
    return ok(c, fin.data, 201);
  });

  /** Lo que sigue a un timbre: bajar el XML, comprobar que es ÉSTE, meterlo.
   *  Si algo falla a medias, la emisión guarda lo que se sabe (id y folio
   *  fiscal) y se queda «timbrando» para resolverla después, nunca para
   *  timbrarla otra vez. */
  async function recuperar(c: Ctx, k: Cuenta_, em: { id: string; serie: string; folio: number }, pac_id: string, uuid: string | null): Promise<{ data: Record<string, unknown> } | { error: string; estado: number; detalle?: unknown }> {
    const sabido = { pac_id, uuid };
    const x = await bajar(k, ventanilla(c), pac_id, 'xml');
    if (esFallaPac(x)) {
      await stub(c).pac('fallida', [em.id, `timbrada en Facturama (${uuid ?? pac_id}) pero no se pudo bajar su XML: ${JSON.stringify(x.detalle ?? {})}`, true, sabido]);
      return { error: 'timbrada_sin_xml', estado: 502, detalle: { uuid, pac_id, emision_id: em.id, motivo: 'Facturama la timbró pero no entregó el XML; se resuelve desde «Lo intentado»' } };
    }
    const leida = leerCfdi(new TextDecoder().decode(x.bytes));
    if (esFallaXml(leida)) {
      await stub(c).pac('fallida', [em.id, `timbrada (${uuid ?? pac_id}) pero su XML no se pudo leer: ${leida.error}`, true, sabido]);
      return { error: 'timbrada_xml_ilegible', estado: 502, detalle: { uuid, emision_id: em.id, motivo: leida.error } };
    }
    if (uuid && leida.uuid !== uuid) {
      await stub(c).pac('fallida', [em.id, `Facturama contestó el folio fiscal ${uuid} pero el XML trae ${leida.uuid}`, true, sabido]);
      return { error: 'xml_de_otra_factura', estado: 502, detalle: { esperado: uuid, vino: leida.uuid, emision_id: em.id } };
    }
    const r = await stub(c).pac('timbrada', [em.id, leida, pac_id, p.actor(c)]);
    if (esFalla(r)) {
      await stub(c).pac('fallida', [em.id, `timbrada (${leida.uuid}) pero no entró a la base: ${r.error} ${JSON.stringify(r.detalle ?? {})}`, true, sabido]);
      return { error: r.error, estado: r.error === 'xml_de_otra_factura' ? 502 : 500, detalle: { ...((r.detalle as object) ?? {}), uuid: leida.uuid, emision_id: em.id } };
    }
    const org = c.get('org_id');
    const llave = llaveXml(org, String(r.cfdi_id));
    await c.env.ARCHIVOS.put(llave, x.bytes, { httpMetadata: { contentType: 'application/xml' } });
    await stub(c).fiscal('ponerArchivo', [String(r.cfdi_id), { xml_llave: llave }]);
    const detalle = await stub(c).fiscal('detalle', [String(r.cfdi_id)]);
    return { data: { ...(r as Record<string, unknown>), folio: `${em.serie}-${em.folio}`, cfdi: detalle } };
  }

  rutas.post('/:o/fiscal/emisiones/:id/resolver', async (c) => {
    if (!(await p.administra(c))) return err(c, 'sin_permiso', 403);
    const em = await stub(c).pac('emision', [c.req.param('id')!]);
    if (!em) return err(c, 'emision_desconocida', 404);
    if (em.estado !== 'timbrando') return err(c, 'emision_cerrada', 409, { estado: em.estado, cfdi_id: em.cfdi_id });
    const k = await abrirCuenta(c);
    if ('error' in k) return err(c, k.error, codigoDe(k.error), k.detalle);
    let pac_id: string | null = em.pac_id ? String(em.pac_id) : null;
    let uuid: string | null = em.uuid ? String(em.uuid) : null;
    if (!pac_id) {
      // No se sabe si Facturama la timbró: se le pregunta por el folio.
      const b = await buscarPorFolio(k, ventanilla(c), String(em.serie), Number(em.folio));
      if (esFallaPac(b)) return err(c, b.error, codigoDe(b.error), b.detalle);
      if (!b) {
        const f = await stub(c).pac('darPorFallida', [em.id, 'Facturama no tiene este folio: no se timbró']);
        return ok(c, { resultado: 'fallida', emision: f });
      }
      pac_id = b.pac_id; uuid = b.uuid;
    }
    const fin = await recuperar(c, k, { id: String(em.id), serie: String(em.serie), folio: Number(em.folio) }, pac_id, uuid);
    if ('error' in fin) return err(c, fin.error, fin.estado, fin.detalle);
    return ok(c, { ...fin.data, resultado: 'timbrada' });
  });

  rutas.get('/:o/fiscal/emisiones', async (c) => {
    if (!p.puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const lim = Number(c.req.query('limite') || 50);
    return ok(c, { filas: await stub(c).pac('emisiones', [Number.isFinite(lim) ? lim : 50]) });
  });

  /* ─────────────── el PDF y la cancelación ─────────────── */

  rutas.get('/:o/fiscal/cfdi/:id/pdf', async (c) => {
    if (!p.puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const id = c.req.param('id')!;
    const f = (await stub(c).fiscal('detalle', [id])) as Record<string, unknown> | null;
    if (!f) return err(c, 'no_encontrado', 404);
    const org = c.get('org_id');
    const nombre = `${String(f.serie ?? '')}${f.serie && f.folio ? '-' : ''}${String(f.folio ?? '')}`.trim() || String(f.uuid);
    const entregar = (cuerpo: ReadableStream | Uint8Array) => new Response(cuerpo, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nombre}.pdf"`, 'Cache-Control': 'private, no-store' },
    });
    if (f.pdf_llave) {
      const obj = await c.env.ARCHIVOS.get(String(f.pdf_llave));
      if (obj) return entregar(obj.body);
    }
    if (!f.pac_id) return err(c, 'sin_archivo', 404, { motivo: 'esta factura no se timbró desde aquí: no hay PDF' });
    const k = await abrirCuenta(c);
    if ('error' in k) return err(c, k.error, codigoDe(k.error), k.detalle);
    const pdf = await bajar(k, ventanilla(c), String(f.pac_id), 'pdf');
    if (esFallaPac(pdf)) return err(c, pdf.error, codigoDe(pdf.error), pdf.detalle);
    const llave = llavePdf(org, id);
    await c.env.ARCHIVOS.put(llave, pdf.bytes, { httpMetadata: { contentType: 'application/pdf' } });
    await stub(c).fiscal('ponerArchivo', [id, { pdf_llave: llave }]);
    return entregar(pdf.bytes);
  });

  rutas.post('/:o/fiscal/cfdi/:id/cancelar', async (c) => {
    if (!(await p.administra(c))) return err(c, 'sin_permiso', 403, { motivo: 'cancela quien dirige o quien lleva la contabilidad' });
    const id = c.req.param('id')!;
    const b = await c.req.json<{ motivo?: unknown; uuid_sustituto?: unknown }>().catch(() => ({}) as never);
    const motivo = String(b.motivo ?? '').trim();
    if (!MOTIVOS_CANCELACION[motivo]) return err(c, 'motivo_invalido', 400, { motivos: MOTIVOS_CANCELACION });
    const sustituto = typeof b.uuid_sustituto === 'string' ? b.uuid_sustituto.trim().toUpperCase() : '';
    if (motivo === '01' && !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(sustituto)) return err(c, 'falta_uuid_sustituto', 400, { motivo: 'con el motivo 01 va el folio fiscal de la factura que la sustituye' });
    const q = await stub(c).pac('paraCancelar', [id]);
    if (esFalla(q)) return err(c, q.error, q.error === 'cfdi_desconocido' ? 404 : 409, q.detalle);
    const k = await abrirCuenta(c);
    if ('error' in k) return err(c, k.error, codigoDe(k.error), k.detalle);
    const r = await cancelar(k, ventanilla(c), q.pac_id, motivo, motivo === '01' ? sustituto : null);
    if (esFallaPac(r)) return err(c, r.error, codigoDe(r.error), r.detalle);
    // Lo que el SAT ya hizo se anota PRIMERO; el acuse, después y aparte:
    // si guardarlo truena, la factura no se queda vigente aquí y cancelada allá.
    const a = await stub(c).pac('cancelacion', [id, { estado: r.estado, motivo }]);
    if (esFalla(a)) return err(c, a.error, 404, a.detalle);
    let acuse_llave: string | null = null;
    if (r.acuse_b64) {
      try {
        acuse_llave = llaveAcuse(c.get('org_id'), id);
        await c.env.ARCHIVOS.put(acuse_llave, Uint8Array.from(atob(r.acuse_b64), (ch) => ch.charCodeAt(0)), { httpMetadata: { contentType: 'application/xml' } });
        await stub(c).pac('cancelacion', [id, { estado: r.estado, motivo, acuse_llave }]);
      } catch { acuse_llave = null; }
    }
    return ok(c, { ...a, acuse_llave, mensaje: r.mensaje, cfdi: await stub(c).fiscal('detalle', [id]) });
  });
}

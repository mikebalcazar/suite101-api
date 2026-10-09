/* /orgs/:o/fiscal/* — lo que bill101 le agrega (contrato 0.85.0).
 *
 * Las rutas de la 0009 —/fiscal/iva, /cuadre, /pendientes, /cfdi, ligar,
 * cancelar, marcar facturado— siguen en `rutas/ordenes.ts` y contestan lo
 * mismo. Aquí va lo nuevo, y se monta sobre el mismo enrutador de /orgs,
 * después de sus cuatro puertas y ANTES del CRUD genérico.
 *
 *   POST /fiscal/xml                   subir facturas (XML o un .zip de XML)
 *   GET  /fiscal/cfdi/:id              una factura con sus renglones, pagos y ligas
 *   GET  /fiscal/cfdi/:id/xml          su archivo
 *   POST /fiscal/cfdi/:id/desligar     deshacer una liga con un movimiento
 *   POST /fiscal/cfdi/:id/trato        normal | inversion | no_deducible
 *   GET  /fiscal/sugerencias           factura ↔ movimiento que se le parece
 *   POST /fiscal/verificar             preguntarle al SAT si siguen vigentes
 *   GET  /fiscal/estado-de-cuenta      sólo lo facturado, ingresos y egresos
 *   GET  /fiscal/impuestos?anio=       IVA, ISR provisional e ISR anual
 *   GET|PUT /fiscal/config             régimen, razón social y código postal
 *   GET|PUT /fiscal/ejercicios/:anio   coeficiente, pérdidas, ajustes
 *   GET|POST /fiscal/pagos, DELETE /fiscal/pagos/:id   impuestos ya pagados
 *   /fiscal/sat/*                      la FIEL y lo que se baja del SAT (rutas/fiscal-sat.ts)
 *   /fiscal/pac/*, /fiscal/emitir/*    la cuenta de Facturama y timbrar (rutas/fiscal-pac.ts)
 *
 * QUIÉN PUEDE. Leer: quien ve dinero y no es cliente, igual que el resto de
 * /fiscal. Cambiar lo que mueve la cuenta de los impuestos —el ejercicio,
 * los pagos, el trato de una factura, los datos fiscales—: quien dirige
 * (owner o admin) o quien trae la etiqueta de contador.
 */

import type { Hono } from 'hono';
import { unzipSync, strFromU8 } from 'fflate';
import { err, ok, type Ctx, type Vars } from '../http';
import type { Env } from '../entorno';
import type { ApiOrgDB } from '../org-db';
import { esFallaXml, leerCfdi, TOPE_XML, type CfdiLeido } from '../cfdi-xml';
import { consultarSat } from '../sat';
import { hoyMx } from '../costos';
import type { ResultadoImportar } from '../fiscal-db';
import { montarFiscalSat } from './fiscal-sat';
import { montarFiscalPac } from './fiscal-pac';

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const stub = (c: Ctx): ApiOrgDB => c.env.ORG.get(c.env.ORG.idFromName(c.get('org_id'))) as unknown as ApiOrgDB;
const esFalla = (r: unknown): r is { error: string; detalle?: unknown } =>
  !!r && typeof r === 'object' && 'error' in (r as Record<string, unknown>) && typeof (r as Record<string, unknown>).error === 'string';

/** Cuántas facturas caben en una sola subida. Cada una es un archivo que se
 *  guarda aparte, y un Worker tiene un tope de llamadas por petición: la
 *  pantalla parte una tanda grande en varias de éstas. */
export const TOPE_FACTURAS = 20;
/** Cuántas se le preguntan al SAT en una petición: es una llamada a su
 *  servicio por cada una, y a veces tarda. */
export const TOPE_VERIFICAR = 10;
const TOPE_SUBIDA = 8 * 1024 * 1024;

const llaveXml = (org: string, id: string): string => `orgs/${org}/cfdi/${id}.xml`;

function mes(ym: string): { desde: string; hasta: string } {
  const [a, m] = ym.split('-').map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${ym}-01`, hasta: `${ym}-${String(fin).padStart(2, '0')}` };
}

export function montarFiscal(rutas: App): void {
  const puedeLeer = (c: Ctx) => c.get('quien').clase !== 'cliente' && c.get('quien').clase !== 'inversionista' && c.get('quien').ve_dinero;
  const administra = async (c: Ctx): Promise<boolean> => {
    const q = c.get('quien');
    if (q.clase === 'miembro' && (q.rol === 'owner' || q.rol === 'admin')) return true;
    return puedeLeer(c) && (await stub(c).esContador(q.usuario_id));
  };
  const actor = (c: Ctx) => ({ usuario_id: c.get('quien').usuario_id });
  const anioDe = (c: Ctx): number => Number(c.req.query('anio') || hoyMx().slice(0, 4));

  /* ─────────────── subir facturas ───────────────
   * Tres formas de mandarlas, a escoger por quien llama:
   *   · JSON `{ "xmls": ["<cfdi:Comprobante…", …] }` (o `xml`, una sola);
   *   · multipart con uno o varios `archivo`, cada uno un .xml o un .zip;
   *   · el XML tal cual en el cuerpo, con Content-Type de XML.
   * Lo que no sea un XML dentro de un .zip (los PDF que suelen venir junto)
   * se ignora sin ruido.
   *
   * La respuesta dice qué pasó con CADA una. Una que no se pudo leer o que
   * no es de la empresa no detiene a las demás: sale `rechazada` con su
   * motivo, y la petición sigue siendo un 200. */
  rutas.post('/:o/fiscal/xml', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const tamano = Number(c.req.header('Content-Length') || 0);
    if (tamano > TOPE_SUBIDA) return err(c, 'subida_muy_grande', 413, { tope_bytes: TOPE_SUBIDA });

    const docs: { nombre: string; xml: string }[] = [];
    const tipo = (c.req.header('Content-Type') || '').toLowerCase();
    // Se mide lo que de verdad llegó: una petición sin Content-Length (por
    // trozos) se saltaría el tope de arriba.
    const cuerpo = await c.req.arrayBuffer().catch(() => null);
    if (!cuerpo) return err(c, 'datos_invalidos', 400, { motivo: 'no se pudo leer lo que se subió' });
    if (cuerpo.byteLength > TOPE_SUBIDA) return err(c, 'subida_muy_grande', 413, { tope_bytes: TOPE_SUBIDA });
    try {
      if (tipo.includes('multipart/form-data')) {
        const forma = await new Response(cuerpo, { headers: { 'Content-Type': c.req.header('Content-Type')! } }).formData();
        for (const v of forma.getAll('archivo')) {
          if (typeof v === 'string') { docs.push({ nombre: 'archivo', xml: v }); continue; }
          const f = v as File;
          const bytes = new Uint8Array(await f.arrayBuffer());
          // Un .zip empieza con «PK»; se mira el contenido, no el nombre.
          if (bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
            // Sólo los XML, de tamaño de factura, y no más de los que caben:
            // un .zip puede decir que trae lo que quiera.
            let van = 0;
            const dentro = unzipSync(bytes, { filter: (a) => /\.xml$/i.test(a.name) && a.originalSize <= TOPE_XML && ++van <= TOPE_FACTURAS + 1 });
            for (const [nombre, contenido] of Object.entries(dentro)) docs.push({ nombre, xml: strFromU8(contenido) });
          } else {
            docs.push({ nombre: f.name || 'archivo.xml', xml: new TextDecoder().decode(bytes) });
          }
        }
      } else if (tipo.includes('json')) {
        const b = JSON.parse(new TextDecoder().decode(cuerpo)) as { xmls?: unknown; xml?: unknown };
        const lista = Array.isArray(b.xmls) ? b.xmls : b.xml !== undefined ? [b.xml] : [];
        lista.forEach((x, i) => docs.push({ nombre: `xml ${i + 1}`, xml: typeof x === 'string' ? x : '' }));
      } else {
        docs.push({ nombre: 'cuerpo', xml: new TextDecoder().decode(cuerpo) });
      }
    } catch {
      return err(c, 'datos_invalidos', 400, { motivo: 'no se pudo leer lo que se subió' });
    }
    if (!docs.length) return err(c, 'datos_invalidos', 400, { falta: 'xmls', formas: ['JSON { xmls: [...] }', 'multipart con `archivo` (.xml o .zip)', 'el XML en el cuerpo'] });
    if (docs.length > TOPE_FACTURAS) return err(c, 'demasiadas_facturas', 413, { recibidas: docs.length, tope: TOPE_FACTURAS, que_hacer: 'mandarlas en varias tandas' });

    // Los resultados salen EN EL ORDEN en que se subieron: quien sube veinte
    // archivos tiene que poder decir cuál es cuál sin buscar por folio.
    const resultados: (ResultadoImportar & { nombre: string })[] = new Array(docs.length);
    const leidas: CfdiLeido[] = [];
    const deQuien = new Map<string, { nombre: string; xml: string; lugar: number }>();
    docs.forEach((d, lugar) => {
      const r = leerCfdi(d.xml);
      if (esFallaXml(r)) { resultados[lugar] = { nombre: d.nombre, uuid: '', resultado: 'rechazada', motivo: r.error, detalle: r.detalle }; return; }
      // La misma factura dos veces en la misma tanda: entra una.
      if (deQuien.has(r.uuid)) { resultados[lugar] = { nombre: d.nombre, uuid: r.uuid, resultado: 'repetida', motivo: 'dos_veces_en_la_subida' }; return; }
      deQuien.set(r.uuid, { ...d, lugar });
      leidas.push(r);
    });

    if (leidas.length) {
      const r = await stub(c).fiscal('importar', [leidas, actor(c), 'xml']);
      if (esFalla(r)) return err(c, r.error, r.error === 'falta_rfc_empresa' ? 409 : 400, r.detalle);
      const porGuardar: { id: string; xml_llave: string }[] = [];
      for (const x of r.resultados as ResultadoImportar[]) {
        const d = deQuien.get(x.uuid)!;
        resultados[d.lugar] = { nombre: d.nombre, ...x };
        if (x.id && x.falta_xml && x.resultado !== 'rechazada') {
          const llave = llaveXml(c.get('org_id'), x.id);
          await c.env.ARCHIVOS.put(llave, d.xml, { httpMetadata: { contentType: 'application/xml' } });
          porGuardar.push({ id: x.id, xml_llave: llave });
        }
      }
      if (porGuardar.length) await stub(c).fiscal('ponerArchivos', [porGuardar]);
    }

    const cuenta = (que: string) => resultados.filter((x) => x.resultado === que).length;
    return ok(c, {
      resumen: { recibidas: docs.length, nuevas: cuenta('nueva'), actualizadas: cuenta('actualizada'), repetidas: cuenta('repetida'), rechazadas: cuenta('rechazada') },
      resultados: resultados.map(({ falta_xml: _f, ...x }) => x),
    });
  });

  /* ─────────────── una factura ─────────────── */

  rutas.get('/:o/fiscal/cfdi/:id', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const r = await stub(c).fiscal('detalle', [c.req.param('id')!]);
    if (!r) return err(c, 'no_encontrado', 404);
    return ok(c, r);
  });

  rutas.get('/:o/fiscal/cfdi/:id/xml', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const f = (await stub(c).fiscal('detalle', [c.req.param('id')!])) as Record<string, unknown> | null;
    if (!f) return err(c, 'no_encontrado', 404);
    if (!f.xml_llave) return err(c, 'sin_archivo', 404, { motivo: 'esta factura se capturó a mano: no tiene XML' });
    const obj = await c.env.ARCHIVOS.get(String(f.xml_llave));
    if (!obj) return err(c, 'sin_archivo', 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/xml; charset=UTF-8',
        'Content-Disposition': `attachment; filename="${String(f.uuid)}.xml"`,
        'Cache-Control': 'private, no-store',
      },
    });
  });

  rutas.post('/:o/fiscal/cfdi/:id/desligar', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<{ movimiento_id?: unknown }>().catch(() => ({}) as never);
    if (typeof b.movimiento_id !== 'string' || !b.movimiento_id) return err(c, 'datos_invalidos', 400, { falta: 'movimiento_id' });
    const r = await stub(c).fiscal('desligar', [{ cfdi_id: c.req.param('id')!, movimiento_id: b.movimiento_id }]);
    if (esFalla(r)) return err(c, r.error, 404, r.detalle);
    return ok(c, r);
  });

  rutas.post('/:o/fiscal/cfdi/:id/trato', async (c) => {
    if (!(await administra(c))) return err(c, 'sin_permiso', 403, { motivo: 'cómo se deduce una factura lo decide quien dirige o quien lleva la contabilidad' });
    const b = await c.req.json<{ trato?: unknown }>().catch(() => ({}) as never);
    const r = await stub(c).fiscal('tratar', [c.req.param('id')!, b.trato]);
    if (esFalla(r)) return err(c, r.error, r.error === 'cfdi_desconocido' ? 404 : 400, r.detalle);
    return ok(c, r);
  });

  /* ─────────────── la liga con el dinero ─────────────── */

  rutas.get('/:o/fiscal/sugerencias', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const q = c.req.query();
    const filas = await stub(c).fiscal('sugerencias', [{ cfdi_id: q.cfdi_id || undefined, limite: q.limite ? Number(q.limite) : undefined }]);
    return ok(c, { filas });
  });

  /* ─────────────── el SAT ───────────────
   * Sin cuerpo, revisa las que más falta hace: las que nunca se han
   * revisado y luego las más viejas de revisar. Con `ids`, ésas. Si el SAT
   * no contesta NO se anota nada —«no pude preguntar» no es «no existe»— y
   * la respuesta lo dice en `sin_respuesta`. */
  rutas.post('/:o/fiscal/verificar', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<{ ids?: unknown; limite?: unknown }>().catch(() => ({}) as never);
    const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === 'string').slice(0, TOPE_VERIFICAR) : undefined;
    const limite = Math.min(TOPE_VERIFICAR, typeof b.limite === 'number' && b.limite > 0 ? Math.trunc(b.limite) : TOPE_VERIFICAR);
    const filas = (await stub(c).fiscal('porVerificar', [{ ids, limite }])) as Record<string, unknown>[];
    const resultados: Record<string, unknown>[] = [];
    let sin_respuesta = 0;
    for (const f of filas.slice(0, TOPE_VERIFICAR)) {
      const r = await consultarSat({
        rfc_emisor: String(f.rfc_emisor), rfc_receptor: String(f.rfc_receptor),
        total_original: String(f.total_original), uuid: String(f.uuid), sello8: (f.sello8 as string | null) ?? null,
      });
      if ('error' in r) {
        sin_respuesta++;
        resultados.push({ id: f.id, uuid: f.uuid, sat: null, motivo: r.detalle });
        // Dos seguidas sin respuesta: el SAT no está, no se insiste con las demás.
        if (sin_respuesta >= 2) break;
        continue;
      }
      const a = await stub(c).fiscal('anotarSat', [String(f.id), { estado: r.estado }]);
      resultados.push({ id: f.id, uuid: f.uuid, sat: r, cancelada_aqui: !esFalla(a) && !!a.cambio });
    }
    return ok(c, {
      revisadas: resultados.filter((x) => x.sat).length,
      sin_respuesta,
      canceladas: resultados.filter((x) => x.cancelada_aqui).length,
      resultados,
    });
  });

  /* ─────────────── el estado de cuenta y los impuestos ─────────────── */

  rutas.get('/:o/fiscal/estado-de-cuenta', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const q = c.req.query();
    let rango: { desde: string; hasta: string };
    if (q.mes && /^\d{4}-\d{2}$/.test(q.mes)) rango = mes(q.mes);
    else if (q.desde || q.hasta) rango = { desde: q.desde || '0000-01-01', hasta: q.hasta || '9999-12-31' };
    else { const a = anioDe(c); rango = { desde: `${a}-01-01`, hasta: `${a}-12-31` }; }
    return ok(c, await stub(c).fiscal('estadoDeCuenta', [rango.desde, rango.hasta]));
  });

  rutas.get('/:o/fiscal/impuestos', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const r = await stub(c).fiscal('impuestos', [anioDe(c)]);
    if (esFalla(r)) return err(c, r.error, 400, r.detalle);
    return ok(c, { ...r, hoy: hoyMx() });
  });

  /* ─────────────── lo que da el contador ─────────────── */

  rutas.get('/:o/fiscal/config', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    return ok(c, await stub(c).fiscal('config'));
  });

  rutas.put('/:o/fiscal/config', async (c) => {
    if (!(await administra(c))) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = await stub(c).fiscal('guardarConfig', [b, actor(c)]);
    if (esFalla(r)) return err(c, r.error, 400, r.detalle);
    return ok(c, r);
  });

  rutas.get('/:o/fiscal/ejercicios/:anio', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const anio = Number(c.req.param('anio'));
    if (!Number.isInteger(anio) || anio < 2017 || anio > 2100) return err(c, 'anio_invalido', 400, { anio: c.req.param('anio') });
    return ok(c, await stub(c).fiscal('ejercicio', [anio]));
  });

  rutas.put('/:o/fiscal/ejercicios/:anio', async (c) => {
    if (!(await administra(c))) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = await stub(c).fiscal('guardarEjercicio', [Number(c.req.param('anio')), b, actor(c)]);
    if (esFalla(r)) return err(c, r.error, 400, r.detalle);
    return ok(c, r);
  });

  rutas.get('/:o/fiscal/pagos', async (c) => {
    if (!puedeLeer(c)) return err(c, 'sin_permiso', 403);
    const anio = c.req.query('anio');
    return ok(c, { filas: await stub(c).fiscal('pagos', anio ? [Number(anio)] : []) });
  });

  rutas.post('/:o/fiscal/pagos', async (c) => {
    if (!(await administra(c))) return err(c, 'sin_permiso', 403);
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
    const r = await stub(c).fiscal('registrarPago', [b, actor(c)]);
    if (esFalla(r)) return err(c, r.error, r.error === 'movimiento_desconocido' ? 404 : 400, r.detalle);
    return ok(c, r, 201);
  });

  rutas.delete('/:o/fiscal/pagos/:id', async (c) => {
    if (!(await administra(c))) return err(c, 'sin_permiso', 403);
    const r = await stub(c).fiscal('borrarPago', [c.req.param('id')!]);
    if (esFalla(r)) return err(c, r.error, 404, r.detalle);
    return ok(c, r);
  });

  montarFiscalSat(rutas, { puedeLeer, administra, actor });
  montarFiscalPac(rutas, { puedeLeer, administra, actor });
}

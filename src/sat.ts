/* bill101 — preguntarle al SAT si una factura sigue vigente. Contrato 0.85.0.
 *
 * Mike, 8-oct: «importar y ACTUALIZAR las facturas recibidas». Una factura
 * que un proveedor canceló después de mandarla sigue pareciendo buena en su
 * XML: el único que sabe es el SAT. Su servicio de consulta es público —no
 * pide firma ni contraseña—, sólo los cuatro datos que cualquier factura
 * trae impresos en su código QR: RFC de quien emite, RFC de quien recibe,
 * total y folio fiscal.
 *
 * Aquí está la pregunta y la lectura de la respuesta, separadas del `fetch`
 * para poder medirlas sin red. Lo que NO se puede medir en una prueba —que
 * el SAT conteste desde donde corre el Worker— se mide en el humo, contra
 * staging, desde el corredor.
 */

export const URL_SAT = 'https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc';
const ACCION = 'http://tempuri.org/IConsultaCFDIService/Consulta';

export interface PreguntaSat { rfc_emisor: string; rfc_receptor: string; total_original: string; uuid: string; sello8?: string | null }

export interface RespuestaSat {
  estado: 'vigente' | 'cancelado' | 'no_encontrado';
  /** Lo que contestó, tal cual, para poder enseñarlo. */
  codigo: string;
  es_cancelable: string | null;
  estatus_cancelacion: string | null;
}

const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** La «expresión impresa»: lo mismo que lleva el código QR de la factura. */
export function expresionImpresa(p: PreguntaSat): string {
  const partes = [`re=${p.rfc_emisor}`, `rr=${p.rfc_receptor}`, `tt=${p.total_original}`, `id=${p.uuid}`];
  if (p.sello8) partes.push(`fe=${p.sello8}`);
  return `?${partes.join('&')}`;
}

export function sobreDeConsulta(p: PreguntaSat): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">' +
    '<soapenv:Header/><soapenv:Body><tem:Consulta><tem:expresionImpresa>' +
    escapar(expresionImpresa(p)) +
    '</tem:expresionImpresa></tem:Consulta></soapenv:Body></soapenv:Envelope>'
  );
}

/** Lee la respuesta. `null` si no es una respuesta del servicio: una página
 *  de error, un cuerpo vacío. Eso NO es «no encontrada»: es que no se pudo
 *  preguntar, y quien llama no debe anotar nada. */
export function leerRespuestaSat(xml: string): RespuestaSat | null {
  const campo = (nombre: string): string | null => {
    const m = new RegExp(`<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`).exec(xml);
    return m ? m[1].trim() : null;
  };
  const codigo = campo('CodigoEstatus');
  const estadoCrudo = campo('Estado');
  if (codigo === null && estadoCrudo === null) return null;
  const e = (estadoCrudo ?? '').toLowerCase();
  const estado: RespuestaSat['estado'] = e.startsWith('vigente') ? 'vigente' : e.startsWith('cancelado') ? 'cancelado' : 'no_encontrado';
  return { estado, codigo: codigo ?? '', es_cancelable: campo('EsCancelable') || null, estatus_cancelacion: campo('EstatusCancelacion') || null };
}

export type FallaSat = { error: 'sat_no_responde'; detalle: { estado?: number; motivo?: string } };

/** Pregunta por una factura. Con tope de tiempo: el servicio del SAT a veces
 *  tarda, y una pantalla no se queda esperándolo. */
export async function consultarSat(p: PreguntaSat, traer: typeof fetch = fetch, topeMs = 8000): Promise<RespuestaSat | FallaSat> {
  try {
    const r = await traer(URL_SAT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: ACCION },
      body: sobreDeConsulta(p),
      signal: AbortSignal.timeout(topeMs),
    });
    const cuerpo = await r.text();
    const leida = leerRespuestaSat(cuerpo);
    if (!leida) return { error: 'sat_no_responde', detalle: { estado: r.status, motivo: 'la respuesta no es del servicio de consulta' } };
    return leida;
  } catch (e) {
    return { error: 'sat_no_responde', detalle: { motivo: e instanceof Error ? e.name : 'error' } };
  }
}

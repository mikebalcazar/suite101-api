/* Facturas de mentira con forma de verdad, para las pruebas de bill101.
 *
 * Arma el XML de un CFDI 4.0 como lo entrega un PAC: los mismos nodos, los
 * mismos atributos, los mismos espacios de nombres. Los RFC son los que el
 * SAT publica para pruebas —no son de nadie—, y los sellos son relleno: aquí
 * no se comprueba el sello, eso se le pregunta al SAT.
 *
 * No es una prueba (no termina en .spec.ts): es de dónde sacan sus facturas
 * `cfdi-xml.spec.ts` y `bill.spec.ts`.
 */

export const RFC_EMPRESA = 'EKU9003173C9';   // «ESCUELA KEMPER URGATE», persona moral de pruebas del SAT
export const RFC_CLIENTE = 'URE180429TM6';   // «UNIVERSIDAD ROBOTICA ESPAÑOLA»
export const RFC_PROVEEDOR = 'JES900109Q90'; // «JIMENEZ ESTRADA SALAS»
export const RFC_AJENO = 'CACX7605101P8';    // una persona física de pruebas

export interface Parte { rfc: string; nombre?: string }

export interface DatosCfdi {
  uuid: string;
  tipo?: 'I' | 'E' | 'P' | 'N' | 'T';
  version?: string;
  emisor: Parte;
  receptor: Parte;
  fecha: string;             // AAAA-MM-DD
  serie?: string;
  folio?: string;
  /** En pesos, como texto o número: 1000 o '1000.00'. */
  subtotal?: number | string;
  descuento?: number | string;
  /** IVA trasladado del comprobante. Si no se da, 16 % del subtotal menos descuento. */
  iva?: number | string | null;
  ieps?: number | string;
  iva_retenido?: number | string;
  isr_retenido?: number | string;
  total?: number | string;
  metodo?: 'PUE' | 'PPD';
  forma?: string;
  moneda?: string;
  tipo_cambio?: string;
  conceptos?: { descripcion: string; cantidad?: string; valor: number | string; iva?: number | string }[];
  /** Para un complemento de pago. */
  pagos?: { fecha: string; monto: number | string; doctos: { uuid: string; pagado: number | string; parcialidad?: number; iva?: number | string }[] }[];
  /** Para un recibo de nómina. */
  nomina?: { percepciones: number | string; deducciones: number | string };
  relacionados?: { tipo: string; uuids: string[] };
  /** Texto que se mete tal cual dentro de <cfdi:Addenda>. */
  adenda?: string;
  sin_timbre?: boolean;
}

const pesos = (v: number | string): string => (typeof v === 'number' ? v.toFixed(2) : v);
const num = (v: number | string | undefined | null): number => (v === undefined || v === null ? 0 : Number(v));
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function xmlCfdi(d: DatosCfdi): string {
  const tipo = d.tipo ?? 'I';
  const esPago = tipo === 'P';
  const subtotal = esPago ? 0 : num(d.subtotal ?? 0);
  const descuento = num(d.descuento);
  const base = subtotal - descuento;
  const iva = esPago || tipo === 'N' ? 0 : d.iva === null ? 0 : d.iva === undefined ? Math.round(base * 16) / 100 : num(d.iva);
  const ieps = num(d.ieps);
  const ivaRet = num(d.iva_retenido), isrRet = num(d.isr_retenido);
  const total = d.total !== undefined ? num(d.total) : esPago ? 0 : base + iva + ieps - ivaRet - isrRet;
  const moneda = d.moneda ?? (esPago ? 'XXX' : 'MXN');

  const attrs: string[] = [
    'xmlns:cfdi="http://www.sat.gob.mx/cfd/4"',
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    `Version="${d.version ?? '4.0'}"`,
  ];
  if (d.serie) attrs.push(`Serie="${d.serie}"`);
  if (d.folio) attrs.push(`Folio="${d.folio}"`);
  attrs.push(`Fecha="${d.fecha}T10:15:30"`);
  attrs.push('Sello="RELLENOrellenoRELLENOrelleno0123456789ABCDEFGHxyz+/AbCdEf12=="', 'NoCertificado="30001000000500003416"');
  if (!esPago && tipo !== 'N') attrs.push(`FormaPago="${d.forma ?? '03'}"`);
  attrs.push(`SubTotal="${esPago ? '0' : pesos(d.subtotal ?? 0)}"`);
  if (descuento) attrs.push(`Descuento="${pesos(d.descuento!)}"`);
  attrs.push(`Moneda="${moneda}"`);
  if (moneda !== 'MXN' && moneda !== 'XXX') attrs.push(`TipoCambio="${d.tipo_cambio ?? '1'}"`);
  attrs.push(`Total="${esPago ? '0' : total.toFixed(2)}"`, `TipoDeComprobante="${tipo}"`, 'Exportacion="01"');
  if (!esPago) attrs.push(`MetodoPago="${d.metodo ?? 'PUE'}"`);
  attrs.push('LugarExpedicion="64000"');

  const p: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', `<cfdi:Comprobante ${attrs.join(' ')}>`];
  if (d.relacionados) {
    p.push(`<cfdi:CfdiRelacionados TipoRelacion="${d.relacionados.tipo}">${d.relacionados.uuids.map((u) => `<cfdi:CfdiRelacionado UUID="${u}"/>`).join('')}</cfdi:CfdiRelacionados>`);
  }
  p.push(`<cfdi:Emisor Rfc="${d.emisor.rfc}" Nombre="${esc(d.emisor.nombre ?? 'EMISOR DE PRUEBA')}" RegimenFiscal="601"/>`);
  p.push(`<cfdi:Receptor Rfc="${d.receptor.rfc}" Nombre="${esc(d.receptor.nombre ?? 'RECEPTOR DE PRUEBA')}" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601" UsoCFDI="${esPago ? 'CP01' : 'G03'}"/>`);

  const conceptos = d.conceptos ?? [{ descripcion: esPago ? 'Pago' : 'Mueble sobre medida', valor: esPago ? 0 : subtotal, iva: iva }];
  p.push('<cfdi:Conceptos>');
  for (const k of conceptos) {
    const cant = k.cantidad ?? '1';
    const importe = Number(cant) * num(k.valor);
    const ivaK = num(k.iva);
    p.push(
      `<cfdi:Concepto ClaveProdServ="${esPago ? '84111506' : '56101700'}" Cantidad="${cant}" ClaveUnidad="${esPago ? 'ACT' : 'H87'}" Unidad="Pieza" Descripcion="${esc(k.descripcion)}" ValorUnitario="${pesos(k.valor)}" Importe="${importe.toFixed(2)}" ObjetoImp="${ivaK ? '02' : '01'}">` +
        (ivaK ? `<cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="${importe.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${ivaK.toFixed(2)}"/></cfdi:Traslados></cfdi:Impuestos>` : '') +
        '</cfdi:Concepto>',
    );
  }
  p.push('</cfdi:Conceptos>');

  if (iva || ieps || ivaRet || isrRet) {
    const at: string[] = [];
    if (ivaRet || isrRet) at.push(`TotalImpuestosRetenidos="${(ivaRet + isrRet).toFixed(2)}"`);
    if (iva || ieps) at.push(`TotalImpuestosTrasladados="${(iva + ieps).toFixed(2)}"`);
    p.push(`<cfdi:Impuestos ${at.join(' ')}>`);
    if (ivaRet || isrRet) {
      p.push('<cfdi:Retenciones>');
      if (isrRet) p.push(`<cfdi:Retencion Impuesto="001" Importe="${isrRet.toFixed(2)}"/>`);
      if (ivaRet) p.push(`<cfdi:Retencion Impuesto="002" Importe="${ivaRet.toFixed(2)}"/>`);
      p.push('</cfdi:Retenciones>');
    }
    if (iva || ieps) {
      p.push('<cfdi:Traslados>');
      if (iva) p.push(`<cfdi:Traslado Base="${base.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/>`);
      if (ieps) p.push(`<cfdi:Traslado Base="${base.toFixed(2)}" Impuesto="003" TipoFactor="Tasa" TasaOCuota="0.080000" Importe="${ieps.toFixed(2)}"/>`);
      p.push('</cfdi:Traslados>');
    }
    p.push('</cfdi:Impuestos>');
  }

  p.push('<cfdi:Complemento>');
  if (d.pagos) {
    p.push('<pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="2.0">');
    p.push(`<pago20:Totales MontoTotalPagos="${d.pagos.reduce((s, x) => s + num(x.monto), 0).toFixed(2)}"/>`);
    for (const pg of d.pagos) {
      p.push(`<pago20:Pago FechaPago="${pg.fecha}T12:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="${pesos(pg.monto)}">`);
      for (const dr of pg.doctos) {
        p.push(
          `<pago20:DoctoRelacionado IdDocumento="${dr.uuid}" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="${dr.parcialidad ?? 1}" ImpSaldoAnt="${pesos(dr.pagado)}" ImpPagado="${pesos(dr.pagado)}" ImpSaldoInsoluto="0.00" ObjetoImpDR="02">` +
            (dr.iva !== undefined
              ? `<pago20:ImpuestosDR><pago20:TrasladosDR><pago20:TrasladoDR BaseDR="0.00" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="${pesos(dr.iva)}"/></pago20:TrasladosDR></pago20:ImpuestosDR>`
              : '') +
            '</pago20:DoctoRelacionado>',
        );
      }
      p.push('</pago20:Pago>');
    }
    p.push('</pago20:Pagos>');
  }
  if (d.nomina) {
    p.push(`<nomina12:Nomina xmlns:nomina12="http://www.sat.gob.mx/nomina12" Version="1.2" TipoNomina="O" FechaPago="${d.fecha}" TotalPercepciones="${pesos(d.nomina.percepciones)}" TotalDeducciones="${pesos(d.nomina.deducciones)}"/>`);
  }
  if (!d.sin_timbre) {
    p.push(`<tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${d.uuid}" FechaTimbrado="${d.fecha}T10:16:02" RfcProvCertif="SPR190613I52" SelloCFD="RELLENO==" NoCertificadoSAT="30001000000500003456" SelloSAT="RELLENO=="/>`);
  }
  p.push('</cfdi:Complemento>');
  if (d.adenda) p.push(`<cfdi:Addenda>${d.adenda}</cfdi:Addenda>`);
  p.push('</cfdi:Comprobante>');
  return p.join('\n');
}

/** Un UUID con forma de folio fiscal, distinto para cada número. */
export const uuidDe = (n: number): string => `${String(n).padStart(8, '0')}-AAAA-4BBB-8CCC-${String(n).padStart(12, '0')}`.toUpperCase();

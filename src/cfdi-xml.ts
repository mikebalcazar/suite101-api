/* bill101 — leer el XML de una factura (CFDI 3.3 y 4.0). Contrato 0.85.0.
 *
 * Es la única puerta por la que una factura entra a la base sin que alguien
 * la teclee: la que se sube a mano, la que venga del SAT y la que se timbre
 * pasan todas por aquí. Por eso no depende de nada —ni de Hono, ni del
 * Durable Object, ni de un lector de XML de afuera— y devuelve fallas, no
 * excepciones: el que llama decide qué hacer con una factura que no se pudo
 * leer.
 *
 * TRES COSAS QUE ESTE ARCHIVO DA POR SENTADAS
 *
 *   1. El dinero sale en CENTAVOS, ENTERO y EN PESOS. Un CFDI trae decimales
 *      como texto («1160.00»): se convierten con aritmética de enteros, sin
 *      pasar por un flotante. Si la factura viene en otra moneda se
 *      multiplica por su `TipoCambio`, que es como la ve el SAT.
 *   2. El IVA es el del nodo de impuestos DEL COMPROBANTE, no la suma de los
 *      de cada concepto: es el que el emisor declaró y el que cuadra con el
 *      total. Se separa del IEPS y de las retenciones, porque para el pago
 *      del mes son cosas distintas.
 *   3. Aquí NO se comprueba el sello. Que el XML esté bien formado no quiere
 *      decir que el SAT lo reconozca: eso se le pregunta al SAT (src/sat.ts)
 *      y se anota en `estado_sat`.
 *
 * El lector de XML es propio y chico a propósito. Un CFDI son etiquetas con
 * atributos y nada más: no hay texto entre etiquetas que importe. No se
 * procesa DTD ni se expanden entidades definidas por el documento, que es
 * por donde entra el abuso clásico de un XML.
 */

export type TipoComprobante = 'I' | 'E' | 'P' | 'N' | 'T';

export interface ConceptoLeido {
  clave_prod_serv: string | null;
  clave_unidad: string | null;
  unidad: string | null;
  /** Como texto: una cantidad puede traer seis decimales y no es dinero. */
  cantidad: string;
  descripcion: string;
  valor_unitario: number;
  importe: number;
  descuento: number;
  iva: number;
}

/** Un renglón de un complemento de pago: cuánto se pagó de qué factura. */
export interface PagoLeido {
  fecha: string;
  uuid_docto: string;
  parcialidad: number | null;
  pagado: number;
  /** El IVA de ese pago, cuando el complemento lo desglosa (Pagos 2.0). */
  iva: number | null;
}

export interface CfdiLeido {
  version: string;
  uuid: string;
  tipo_comprobante: TipoComprobante;
  serie: string | null;
  folio: string | null;
  /** AAAA-MM-DD. La fecha fiscal es la de emisión, no la del timbre. */
  fecha: string;
  fecha_timbrado: string | null;
  emisor: { rfc: string; nombre: string | null; regimen: string | null };
  receptor: { rfc: string; nombre: string | null; uso: string | null; regimen: string | null; cp: string | null };
  moneda: string;
  tipo_cambio: string;
  metodo_pago: string | null;
  forma_pago: string | null;
  /** Ya con el descuento restado: es la base, lo que cuenta para ISR. */
  subtotal: number;
  descuento: number;
  iva: number;
  ieps: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
  /** El total tal cual viene escrito, en su moneda: así lo pide el SAT para
   *  decir si la factura sigue vigente. */
  total_original: string;
  /** Los últimos ocho caracteres del sello, que también pide el SAT. */
  sello8: string | null;
  conceptos: ConceptoLeido[];
  pagos: PagoLeido[];
  /** Los UUID de otras facturas con las que ésta dice estar relacionada. */
  relacionados: { tipo_relacion: string; uuid: string }[];
}

export type FallaXml = { error: string; detalle?: unknown };

/* ─────────────── el lector de XML ─────────────── */

interface Nodo { nombre: string; local: string; attrs: Record<string, string>; hijos: Nodo[] }

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function sinEntidades(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (todo, que: string) => {
    if (que[0] === '#') {
      const n = que[1] === 'x' || que[1] === 'X' ? parseInt(que.slice(2), 16) : parseInt(que.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENTIDADES[que] ?? todo;
  });
}

/** El tope de un XML. Una factura de verdad pesa unos cuantos KB; una con
 *  cientos de conceptos, decenas. Dos megas es no leer basura. */
export const TOPE_XML = 2_000_000;
export const TOPE_CONCEPTOS = 500;

/** Quita de un texto todo lo que va de `abre` a `cierra`. Con `indexOf` y de
 *  una pasada: la expresión regular equivalente se vuelve cuadrática cuando
 *  el que abre se repite y nunca cierra, y con dos megas de «<!--» eso son
 *  minutos de procesador. Si uno abre y no cierra, el XML está roto: `null`. */
function sinBloques(s: string, abre: string, cierra: string): string | null {
  let desde = s.indexOf(abre);
  if (desde < 0) return s;
  let salida = '', cursor = 0;
  while (desde >= 0) {
    const fin = s.indexOf(cierra, desde + abre.length);
    if (fin < 0) return null;
    salida += s.slice(cursor, desde);
    cursor = fin + cierra.length;
    desde = s.indexOf(abre, cursor);
  }
  return salida + s.slice(cursor);
}

function leerXml(xml: string): Nodo | null {
  // La marca de orden de bytes con que algunos PAC empiezan el archivo.
  let limpio: string | null = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  for (const [abre, cierra] of [['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>'], ['<!DOCTYPE', '>'], ['<!doctype', '>']] as const) {
    limpio = sinBloques(limpio, abre, cierra);
    if (limpio === null) return null;
  }
  // Con `u`: una adenda puede traer etiquetas con acentos o eñes.
  const etiqueta = /<(\/?)([\p{L}_][\p{L}\p{N}_:.-]*)((?:\s+[\p{L}\p{N}_:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/gu;
  const atributo = /([\p{L}\p{N}_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  const pila: Nodo[] = [];
  let raiz: Nodo | null = null;
  for (const m of limpio.matchAll(etiqueta)) {
    const [, cierra, nombre, crudos, sola] = m;
    if (cierra) {
      if (!pila.length || pila[pila.length - 1].nombre !== nombre) return null; // mal anidado
      pila.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of crudos.matchAll(atributo)) attrs[a[1]] = sinEntidades(a[2] ?? a[3] ?? '');
    const nodo: Nodo = { nombre, local: nombre.includes(':') ? nombre.slice(nombre.indexOf(':') + 1) : nombre, attrs, hijos: [] };
    if (pila.length) pila[pila.length - 1].hijos.push(nodo);
    else if (!raiz) raiz = nodo;
    else return null; // dos raíces
    if (!sola) pila.push(nodo);
  }
  return pila.length ? null : raiz;
}

const hijo = (n: Nodo | undefined | null, local: string): Nodo | undefined => n?.hijos.find((h) => h.local === local);
const hijos = (n: Nodo | undefined | null, local: string): Nodo[] => n?.hijos.filter((h) => h.local === local) ?? [];
const texto = (v: string | undefined, tope = 300): string | null => {
  const s = (v ?? '').trim();
  return s ? s.slice(0, tope) : null;
};

/* ─────────────── el dinero ─────────────── */

/** «1160.00» → 1160000000n: millonésimas, que es la precisión que un CFDI
 *  permite (seis decimales). `null` si no es un número. */
function aMillonesimas(v: string | undefined): bigint | null {
  const s = (v ?? '').trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(6, '0').slice(0, 6);
  const n = BigInt(m[2]) * 1_000_000n + BigInt(frac);
  return m[1] ? -n : n;
}

/** Un importe del XML a centavos de peso, redondeando al centavo más cercano
 *  (el medio centavo sube). Con otro tipo de cambio que no sea 1, primero se
 *  multiplica. Lo que no se puede leer vale 0: un atributo que falta es
 *  «no hay», no un error. */
export function aCentavos(importe: string | undefined, tipoCambio = '1'): number {
  const a = aMillonesimas(importe);
  if (a === null) return 0;
  const tc = aMillonesimas(tipoCambio) ?? 1_000_000n;
  // a (1e-6) × tc (1e-6) = 1e-12 pesos; a centavos son 1e-10.
  const producto = a * (tc > 0n ? tc : 1_000_000n);
  const signo = producto < 0n ? -1n : 1n;
  const abs = producto * signo;
  const centavos = (abs + 5_000_000_000n) / 10_000_000_000n;
  return Number(signo * centavos);
}

/* ─────────────── la factura ─────────────── */

const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const TIPOS: readonly string[] = ['I', 'E', 'P', 'N', 'T'];

/** Suma los importes de un impuesto en una lista de nodos. */
function sumar(nodos: Nodo[], campoImpuesto: string, impuesto: string, campoImporte: string, tc: string): number {
  let s = 0;
  for (const n of nodos) if (n.attrs[campoImpuesto] === impuesto) s += aCentavos(n.attrs[campoImporte], tc);
  return s;
}

export function leerCfdi(xml: string): CfdiLeido | FallaXml {
  if (typeof xml !== 'string' || !xml.trim()) return { error: 'xml_vacio' };
  if (xml.length > TOPE_XML) return { error: 'xml_muy_grande', detalle: { tope: TOPE_XML, recibido: xml.length } };
  const raiz = leerXml(xml);
  if (!raiz) return { error: 'xml_ilegible' };
  if (raiz.local !== 'Comprobante') return { error: 'no_es_cfdi', detalle: { raiz: raiz.nombre } };

  const c = raiz.attrs;
  const version = c.Version ?? c.version ?? '';
  if (version !== '4.0' && version !== '3.3') return { error: 'version_no_soportada', detalle: { version: version || null, acepta: ['4.0', '3.3'] } };

  const complemento = hijos(raiz, 'Complemento').flatMap((x) => x.hijos);
  const timbre = complemento.find((x) => x.local === 'TimbreFiscalDigital');
  const uuid = (timbre?.attrs.UUID ?? '').trim().toUpperCase();
  if (!timbre || !uuid) return { error: 'sin_timbre', detalle: { motivo: 'un XML sin timbre todavía no es una factura' } };
  if (!UUID.test(uuid)) return { error: 'uuid_invalido', detalle: { uuid } };

  const tipo = (c.TipoDeComprobante ?? '').trim().toUpperCase();
  if (!TIPOS.includes(tipo)) return { error: 'tipo_de_comprobante_invalido', detalle: { tipo: tipo || null } };

  const fechaHora = (c.Fecha ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(fechaHora)) return { error: 'fecha_invalida', detalle: { fecha: fechaHora || null } };

  const em = hijo(raiz, 'Emisor'), re = hijo(raiz, 'Receptor');
  const rfcEmisor = (em?.attrs.Rfc ?? '').trim().toUpperCase();
  const rfcReceptor = (re?.attrs.Rfc ?? '').trim().toUpperCase();
  if (!rfcEmisor || !rfcReceptor) return { error: 'sin_rfc', detalle: { emisor: rfcEmisor || null, receptor: rfcReceptor || null } };

  const moneda = (c.Moneda ?? 'MXN').trim().toUpperCase() || 'MXN';
  // «XXX» es la moneda de un complemento de pago: no hay importes que convertir.
  const tc = moneda === 'MXN' || moneda === 'XXX' ? '1' : (c.TipoCambio ?? '1').trim() || '1';
  if (aMillonesimas(tc) === null) return { error: 'tipo_de_cambio_invalido', detalle: { tipo_cambio: tc } };
  if (aMillonesimas(c.Total) === null) return { error: 'total_invalido', detalle: { total: c.Total ?? null } };

  const descuento = aCentavos(c.Descuento, tc);
  const nomina = complemento.find((x) => x.local === 'Nomina');
  /* En un recibo de nómina el «descuento» son las deducciones del trabajador
   * (su ISR, su IMSS): siguen siendo sueldo que la empresa pagó. Lo que la
   * empresa gastó son las percepciones. */
  const subtotal = nomina
    ? aCentavos(nomina.attrs.TotalPercepciones ?? c.SubTotal, tc)
    : aCentavos(c.SubTotal, tc) - descuento;

  const imp = hijo(raiz, 'Impuestos');
  const traslados = hijos(hijo(imp, 'Traslados'), 'Traslado');
  const retenciones = hijos(hijo(imp, 'Retenciones'), 'Retencion');
  let iva = sumar(traslados, 'Impuesto', '002', 'Importe', tc);
  const ieps = sumar(traslados, 'Impuesto', '003', 'Importe', tc);
  // Un comprobante que sólo trae el total de trasladados, sin el desglose.
  if (!traslados.length && imp?.attrs.TotalImpuestosTrasladados) iva = aCentavos(imp.attrs.TotalImpuestosTrasladados, tc);

  // Se guardan hasta TOPE_CONCEPTOS renglones: son para leer la factura, no
  // para sumarla (los importes salen del comprobante), y un XML de dos megas
  // puede traer veinte mil.
  const conceptos: ConceptoLeido[] = hijos(hijo(raiz, 'Conceptos'), 'Concepto').slice(0, TOPE_CONCEPTOS).map((k) => {
    const tk = hijos(hijo(hijo(k, 'Impuestos'), 'Traslados'), 'Traslado');
    return {
      clave_prod_serv: texto(k.attrs.ClaveProdServ, 20),
      clave_unidad: texto(k.attrs.ClaveUnidad, 20),
      unidad: texto(k.attrs.Unidad, 40),
      cantidad: (k.attrs.Cantidad ?? '1').trim() || '1',
      descripcion: (k.attrs.Descripcion ?? '').trim().slice(0, 1000),
      valor_unitario: aCentavos(k.attrs.ValorUnitario, tc),
      importe: aCentavos(k.attrs.Importe, tc),
      descuento: aCentavos(k.attrs.Descuento, tc),
      iva: sumar(tk, 'Impuesto', '002', 'Importe', tc),
    };
  });

  /* El complemento de pago. Cada `Pago` dice qué día se pagó, y cada
   * `DoctoRelacionado`, de qué factura y cuánto. Con eso una factura «a
   * crédito» (PPD) sabe en qué mes cuenta su IVA. */
  const pagos: PagoLeido[] = [];
  for (const bloque of complemento.filter((x) => x.local === 'Pagos')) {
    for (const p of hijos(bloque, 'Pago')) {
      const fecha = (p.attrs.FechaPago ?? '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      const monedaP = (p.attrs.MonedaP ?? 'MXN').trim().toUpperCase();
      const tcP = monedaP === 'MXN' ? '1' : (p.attrs.TipoCambioP ?? '1').trim() || '1';
      for (const d of hijos(p, 'DoctoRelacionado')) {
        const docto = (d.attrs.IdDocumento ?? '').trim().toUpperCase();
        if (!UUID.test(docto)) continue;
        const monedaDR = (d.attrs.MonedaDR ?? monedaP).trim().toUpperCase();
        /* `ImpPagado` viene en la moneda de la factura. En pesos es lo que
         * es; en otra, se lleva a la moneda del pago con la equivalencia y de
         * ahí a pesos con el tipo de cambio del pago. */
        const aPesos = (v: string | undefined): number => {
          if (monedaDR === 'MXN') return aCentavos(v);
          const eq = Number(d.attrs.EquivalenciaDR ?? d.attrs.TipoCambioDR ?? '1') || 1;
          return Math.round((aCentavos(v) / eq) * (Number(tcP) || 1));
        };
        const trasladosDR = hijos(hijo(hijo(d, 'ImpuestosDR'), 'TrasladosDR'), 'TrasladoDR');
        const ivaDR = trasladosDR.filter((t) => t.attrs.ImpuestoDR === '002');
        pagos.push({
          fecha,
          uuid_docto: docto,
          parcialidad: /^\d+$/.test(d.attrs.NumParcialidad ?? '') ? Number(d.attrs.NumParcialidad) : null,
          pagado: aPesos(d.attrs.ImpPagado),
          iva: ivaDR.length ? ivaDR.reduce((s, t) => s + aPesos(t.attrs.ImporteDR), 0) : null,
        });
      }
    }
  }

  const relacionados: { tipo_relacion: string; uuid: string }[] = [];
  for (const grupo of hijos(raiz, 'CfdiRelacionados')) {
    for (const r of hijos(grupo, 'CfdiRelacionado')) {
      const u = (r.attrs.UUID ?? '').trim().toUpperCase();
      if (UUID.test(u)) relacionados.push({ tipo_relacion: (grupo.attrs.TipoRelacion ?? '').trim(), uuid: u });
    }
  }

  const sello = (c.Sello ?? '').trim();
  return {
    version,
    uuid,
    tipo_comprobante: tipo as TipoComprobante,
    serie: texto(c.Serie, 25),
    folio: texto(c.Folio, 40),
    fecha: fechaHora.slice(0, 10),
    fecha_timbrado: texto(timbre.attrs.FechaTimbrado, 25),
    emisor: { rfc: rfcEmisor, nombre: texto(em?.attrs.Nombre), regimen: texto(em?.attrs.RegimenFiscal, 5) },
    receptor: {
      rfc: rfcReceptor, nombre: texto(re?.attrs.Nombre), uso: texto(re?.attrs.UsoCFDI, 5),
      regimen: texto(re?.attrs.RegimenFiscalReceptor, 5), cp: texto(re?.attrs.DomicilioFiscalReceptor, 10),
    },
    moneda,
    tipo_cambio: tc,
    metodo_pago: texto(c.MetodoPago, 5),
    forma_pago: texto(c.FormaPago, 5),
    subtotal,
    descuento,
    iva,
    ieps,
    iva_retenido: sumar(retenciones, 'Impuesto', '002', 'Importe', tc),
    isr_retenido: sumar(retenciones, 'Impuesto', '001', 'Importe', tc),
    total: aCentavos(c.Total, tc),
    total_original: (c.Total ?? '').trim(),
    sello8: sello ? sello.slice(-8) : null,
    conceptos,
    pagos,
    relacionados,
  };
}

export const esFallaXml = (r: CfdiLeido | FallaXml): r is FallaXml => 'error' in r;

/* ─────────────── lo que la representación impresa necesita además ─────────────── */

/** 0.89.0 · Lo que `leerCfdi` no guarda porque no sirve para contar
 *  impuestos pero sí para imprimir la factura: sellos, certificados, lugar
 *  de expedición, condiciones, exportación, y por renglón la tasa y el
 *  objeto de impuesto. Con el timbre se arma la cadena original del
 *  complemento y el QR del SAT. */
export interface ExtrasImpresa {
  fecha_hora: string;
  lugar_expedicion: string | null;
  condiciones: string | null;
  exportacion: string | null;
  sello: string | null;
  no_certificado: string | null;
  no_certificado_sat: string | null;
  sello_sat: string | null;
  rfc_prov_certif: string | null;
  fecha_timbrado: string | null;
  /** Por renglón, en el mismo orden que `conceptos` de leerCfdi. */
  renglones: { objeto_imp: string | null; tasa_iva: string | null }[];
}

export function extrasImpresa(xml: string): ExtrasImpresa | null {
  const raiz = typeof xml === 'string' && xml.length <= TOPE_XML ? leerXml(xml) : null;
  if (!raiz || raiz.local !== 'Comprobante') return null;
  const c = raiz.attrs;
  const t = (v: string | undefined, tope = 4000): string | null => (v === undefined ? null : v.trim().slice(0, tope) || null);
  const timbre = hijos(raiz, 'Complemento').flatMap((x) => x.hijos).find((x) => x.local === 'TimbreFiscalDigital');
  const renglones = hijos(hijo(raiz, 'Conceptos'), 'Concepto').slice(0, TOPE_CONCEPTOS).map((k) => {
    const iva = hijos(hijo(hijo(k, 'Impuestos'), 'Traslados'), 'Traslado').find((x) => x.attrs.Impuesto === '002');
    return { objeto_imp: t(k.attrs.ObjetoImp, 2), tasa_iva: t(iva?.attrs.TasaOCuota, 10) };
  });
  return {
    fecha_hora: (c.Fecha ?? '').trim(),
    lugar_expedicion: t(c.LugarExpedicion, 10),
    condiciones: t(c.CondicionesDePago, 1000),
    exportacion: t(c.Exportacion, 2),
    sello: t(c.Sello),
    no_certificado: t(c.NoCertificado, 20),
    no_certificado_sat: t(timbre?.attrs.NoCertificadoSAT, 20),
    sello_sat: t(timbre?.attrs.SelloSAT),
    rfc_prov_certif: t(timbre?.attrs.RfcProvCertif, 13),
    fecha_timbrado: t(timbre?.attrs.FechaTimbrado, 25),
    renglones,
  };
}

/* bill101 — el PDF de la factura (0.89.0).
 *
 * Mike, 9-oct-2026, con botones: «bill101, diseño propio» — logo de la
 * empresa, bloque de datos bancarios, colores; la vista previa es el mismo
 * PDF antes de timbrar, con marca de agua. Antes el PDF lo armaba Facturama
 * y no cabían los datos bancarios más que como texto.
 *
 * Lo que una representación impresa de un CFDI 4.0 tiene que llevar (Anexo
 * 20 y regla 2.7.1.7 de la RMF): serie y folio, fecha y lugar de expedición,
 * RFC, nombre y régimen del emisor; RFC, nombre, régimen, CP y uso del
 * receptor; los conceptos con clave, cantidad, unidad, descripción, valor
 * unitario e importe; subtotal, impuestos y total; moneda, forma y método
 * de pago; el folio fiscal, el número de certificado del emisor y del SAT,
 * la fecha de timbrado, los dos sellos, la cadena original del complemento
 * y el QR de verificación. Todo eso va aquí; lo demás (logo, datos
 * bancarios, leyenda) es cortesía.
 *
 * Se arma con pdf-lib (puro JS, corre en el Worker). Lo que no quepa en
 * WinAnsi (un emoji, una comilla rara) se cambia por «?» en vez de tronar.
 *
 * El diseño (Mike, 10-oct-2026, con botones, tras tres rondas de cinco
 * alternativas: «5b3»): una columna negra a la izquierda con el logo de
 * FORESPOT en blanco, el emisor, los datos bancarios, el timbre y el QR, y
 * un pie lima con el logo de taller101 en tinta («marca de FORESPOT»); el
 * cuerpo en blanco con la tabla de conceptos de cabecera lima y el total en
 * caja negra con cifra lima. Letras de los manuales: Raleway para el texto y
 * Fira Sans para toda cifra (Mike lo pidió explícito: «deben ser Fira los
 * números»). Los logos salen de los manuales de imagen (vectores del PDF de
 * FORESPOT y del SVG maestro de taller101) y viajan dentro del Worker
 * (src/marca/, regla Data en wrangler.toml); FORESPOT es la razón social que
 * factura y taller101 su marca, por eso van fijos y no dependen del logo que
 * la empresa suba en Ajustes (ese, si existe, sustituye al de FORESPOT en la
 * columna, sobre un recuadro blanco para que cualquier logo se vea).
 */
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, PDFImage, PDFPage, degrees, rgb, type RGB } from 'pdf-lib';
import qrcode from 'qrcode-generator';
import fira400 from './marca/fira-400.ttf';
import fira600 from './marca/fira-600.ttf';
import logoEmisorBlanco from './marca/forespot-blanco.png';
import raleway400 from './marca/raleway-400.ttf';
import raleway600 from './marca/raleway-600.ttf';
import raleway700 from './marca/raleway-700.ttf';
import logoMarcaTinta from './marca/taller101-tinta.png';
import type { CfdiLeido, ExtrasImpresa } from './cfdi-xml';
import type { Borrador } from './pac';
import { cuentas as cuentasDe, RFC_PUBLICO, receptorPublico } from './pac';

/* ─────────────── catálogos que el PDF dice con palabras ─────────────── */

export const REGIMEN_NOMBRE: Record<string, string> = {
  '601': 'General de Ley Personas Morales', '603': 'Personas Morales con Fines no Lucrativos', '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento', '607': 'Régimen de Enajenación o Adquisición de Bienes', '608': 'Demás ingresos', '610': 'Residentes en el Extranjero sin Establecimiento Permanente en México',
  '611': 'Ingresos por Dividendos (socios y accionistas)', '612': 'Personas Físicas con Actividades Empresariales y Profesionales', '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios', '616': 'Sin obligaciones fiscales', '620': 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
  '621': 'Incorporación Fiscal', '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', '623': 'Opcional para Grupos de Sociedades', '624': 'Coordinados',
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', '626': 'Régimen Simplificado de Confianza',
};
export const USO_NOMBRE: Record<string, string> = {
  G01: 'Adquisición de mercancías', G02: 'Devoluciones, descuentos o bonificaciones', G03: 'Gastos en general', I01: 'Construcciones', I02: 'Mobiliario y equipo de oficina por inversiones',
  I03: 'Equipo de transporte', I04: 'Equipo de cómputo y accesorios', I05: 'Dados, troqueles, moldes, matrices y herramental', I06: 'Comunicaciones telefónicas', I07: 'Comunicaciones satelitales',
  I08: 'Otra maquinaria y equipo', D01: 'Honorarios médicos, dentales y gastos hospitalarios', D02: 'Gastos médicos por incapacidad o discapacidad', D03: 'Gastos funerales', D04: 'Donativos',
  D05: 'Intereses reales efectivamente pagados por créditos hipotecarios', D06: 'Aportaciones voluntarias al SAR', D07: 'Primas por seguros de gastos médicos', D08: 'Gastos de transportación escolar obligatoria',
  D09: 'Depósitos en cuentas para el ahorro, primas de pensiones', D10: 'Pagos por servicios educativos (colegiaturas)', S01: 'Sin efectos fiscales', CP01: 'Pagos', CN01: 'Nómina',
};
export const FORMA_PAGO_NOMBRE: Record<string, string> = {
  '01': 'Efectivo', '02': 'Cheque nominativo', '03': 'Transferencia electrónica de fondos', '04': 'Tarjeta de crédito', '05': 'Monedero electrónico', '06': 'Dinero electrónico', '08': 'Vales de despensa',
  '12': 'Dación en pago', '13': 'Pago por subrogación', '14': 'Pago por consignación', '15': 'Condonación', '17': 'Compensación', '23': 'Novación', '24': 'Confusión', '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad', '27': 'A satisfacción del acreedor', '28': 'Tarjeta de débito', '29': 'Tarjeta de servicios', '30': 'Aplicación de anticipos', '31': 'Intermediario pagos', '99': 'Por definir',
};
export const METODO_PAGO_NOMBRE: Record<string, string> = { PUE: 'Pago en una sola exhibición', PPD: 'Pago en parcialidades o diferido' };
const OBJETO_IMP_NOMBRE: Record<string, string> = { '01': 'No objeto de impuesto', '02': 'Sí objeto de impuesto', '03': 'Sí objeto, no obligado al desglose', '04': 'Sí objeto, no causa impuesto' };
const EXPORTACION_NOMBRE: Record<string, string> = { '01': 'No aplica', '02': 'Definitiva', '03': 'Temporal', '04': 'Definitiva con clave distinta a A1' };

/* ─────────────── lo que se imprime ─────────────── */

export interface RenglonImpresa {
  clave_prod_serv: string;
  clave_unidad: string;
  unidad: string | null;
  cantidad: string;
  descripcion: string;
  /** Centavos. */
  valor_unitario: number;
  importe: number;
  descuento: number;
  iva: number;
  /** «0.160000», «0.000000» o null (no objeto). */
  tasa_iva: string | null;
  objeto_imp: string;
}

export interface Impresa {
  serie: string | null;
  folio: string | null;
  /** AAAA-MM-DDTHH:mm:ss, hora del lugar de expedición. */
  fecha_hora: string;
  lugar_expedicion: string | null;
  emisor: { rfc: string; nombre: string; regimen: string | null };
  receptor: { rfc: string; nombre: string; regimen: string | null; cp: string | null; uso: string | null };
  moneda: string;
  metodo_pago: string | null;
  forma_pago: string | null;
  condiciones: string | null;
  observaciones: string | null;
  exportacion: string | null;
  renglones: RenglonImpresa[];
  subtotal: number;
  descuento: number;
  iva: number;
  total: number;
  /** Lo del timbre; null en una vista previa. */
  timbre: { uuid: string; fecha_timbrado: string | null; no_certificado: string | null; no_certificado_sat: string | null; sello: string | null; sello_sat: string | null; rfc_prov_certif: string | null; total_original: string } | null;
}

export interface Empresa {
  nombre: string;
  rfc: string | null;
  regimen: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  sitio_web: string | null;
  /** PNG o JPG; otra cosa no entra al PDF. */
  logo: { bytes: Uint8Array; tipo: string } | null;
}

export interface PdfConfig { banco: string | null; clabe: string | null; cuenta: string | null; beneficiario: string | null; leyenda: string | null }

/** De un XML ya leído (una factura timbrada). */
export function impresaDeXml(leida: CfdiLeido, extras: ExtrasImpresa | null): Impresa {
  return {
    serie: leida.serie, folio: leida.folio,
    fecha_hora: extras?.fecha_hora || `${leida.fecha}T00:00:00`,
    lugar_expedicion: extras?.lugar_expedicion ?? null,
    emisor: { rfc: leida.emisor.rfc, nombre: leida.emisor.nombre ?? '', regimen: leida.emisor.regimen },
    receptor: { rfc: leida.receptor.rfc, nombre: leida.receptor.nombre ?? '', regimen: leida.receptor.regimen, cp: leida.receptor.cp, uso: leida.receptor.uso },
    moneda: leida.moneda, metodo_pago: leida.metodo_pago, forma_pago: leida.forma_pago,
    condiciones: extras?.condiciones ?? null, observaciones: null, exportacion: extras?.exportacion ?? null,
    renglones: leida.conceptos.map((k, i) => ({
      clave_prod_serv: k.clave_prod_serv ?? '', clave_unidad: k.clave_unidad ?? '', unidad: k.unidad, cantidad: k.cantidad, descripcion: k.descripcion,
      valor_unitario: k.valor_unitario, importe: k.importe, descuento: k.descuento, iva: k.iva,
      tasa_iva: extras?.renglones[i]?.tasa_iva ?? null, objeto_imp: extras?.renglones[i]?.objeto_imp ?? (k.iva || extras?.renglones[i]?.tasa_iva ? '02' : '01'),
    })),
    // `subtotal` de leerCfdi ya trae el descuento restado; aquí se imprime como el SAT: bruto, descuento, total.
    subtotal: leida.subtotal + leida.descuento, descuento: leida.descuento, iva: leida.iva, total: leida.total,
    timbre: {
      uuid: leida.uuid, fecha_timbrado: leida.fecha_timbrado, no_certificado: extras?.no_certificado ?? null, no_certificado_sat: extras?.no_certificado_sat ?? null,
      sello: extras?.sello ?? null, sello_sat: extras?.sello_sat ?? null, rfc_prov_certif: extras?.rfc_prov_certif ?? null, total_original: leida.total_original,
    },
  };
}

/** De un borrador (la vista previa): mismas cuentas que se le mandan a Facturama. */
export function impresaDeBorrador(b: Borrador, a: { serie: string; folio: number | null; fecha: string; lugar_expedicion: string; emisor: Impresa['emisor'] }): Impresa {
  b = receptorPublico(b, a.lugar_expedicion);
  const c = cuentasDe(b.renglones);
  return {
    serie: a.serie, folio: a.folio === null ? null : String(a.folio), fecha_hora: a.fecha, lugar_expedicion: a.lugar_expedicion,
    emisor: a.emisor,
    receptor: { rfc: b.receptor.rfc, nombre: b.receptor.razon_social, regimen: b.receptor.regimen_fiscal, cp: b.receptor.cp_fiscal, uso: b.receptor.uso_cfdi },
    moneda: 'MXN', metodo_pago: 'PUE', forma_pago: b.forma_pago, condiciones: b.condiciones ?? null, observaciones: b.observaciones ?? null, exportacion: '01',
    renglones: b.renglones.map((r, i) => {
      const k = c.renglones[i];
      return {
        clave_prod_serv: r.clave_prod_serv, clave_unidad: r.clave_unidad, unidad: r.unidad ?? null, cantidad: String(r.cantidad), descripcion: r.descripcion,
        valor_unitario: r.precio_unitario, importe: k.importe, descuento: k.descuento, iva: k.iva,
        tasa_iva: r.iva === null ? null : (r.iva / 100).toFixed(6), objeto_imp: r.iva === null ? '01' : '02',
      };
    }),
    subtotal: c.subtotal, descuento: c.descuento, iva: c.iva, total: c.total,
    timbre: null,
  };
}

/* ─────────────── el total con letra ─────────────── */

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function hastaMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  let s = CENTENAS[c];
  if (r) {
    if (r < 30) s += (s ? ' ' : '') + UNIDADES[r];
    else { const d = Math.floor(r / 10), u = r % 10; s += (s ? ' ' : '') + DECENAS[d] + (u ? ` Y ${UNIDADES[u]}` : ''); }
  }
  return s;
}

function enteroEnLetras(n: number): string {
  if (n === 0) return 'CERO';
  const partes: string[] = [];
  const millones = Math.floor(n / 1_000_000), miles = Math.floor((n % 1_000_000) / 1000), resto = n % 1000;
  if (millones) partes.push(`${millones === 1 ? 'UN MILLON' : `${enteroEnLetras(millones)} MILLONES`}${miles || resto ? '' : ' DE'}`);
  if (miles) partes.push(`${hastaMil(miles)} MIL`);
  if (resto) partes.push(hastaMil(resto));
  return partes.join(' ');
}

/** «UN MIL CIENTO SESENTA PESOS 00/100 M.N.», como lo pone el SAT. */
export function totalEnLetras(centavos: number, moneda = 'MXN'): string {
  const n = Math.max(0, Math.round(centavos));
  const enteros = Math.floor(n / 100), cent = n % 100;
  const nombre = moneda === 'USD' ? (enteros === 1 ? 'DOLAR' : 'DOLARES') : enteros === 1 ? 'PESO' : 'PESOS';
  return `${enteroEnLetras(enteros)} ${nombre} ${String(cent).padStart(2, '0')}/100 ${moneda === 'USD' ? 'USD' : 'M.N.'}`;
}

/* ─────────────── el QR y la cadena original ─────────────── */

/** La liga que el SAT verifica (Anexo 20): folio fiscal, RFC de los dos, el
 *  total tal cual con seis decimales y los últimos ocho del sello. */
export function ligaSat(t: { uuid: string; rfc_emisor: string; rfc_receptor: string; total_original: string; sello: string | null }): string {
  const tt = (Number(t.total_original) || 0).toFixed(6);
  const fe = (t.sello ?? '').slice(-8);
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${t.uuid}&re=${t.rfc_emisor}&rr=${t.rfc_receptor}&tt=${tt}&fe=${fe}`;
}

/** Cadena original del complemento de certificación digital (TFD 1.1). */
export function cadenaOriginal(t: NonNullable<Impresa['timbre']>): string {
  return `||1.1|${t.uuid}|${t.fecha_timbrado ?? ''}|${t.rfc_prov_certif ?? ''}|${t.sello ?? ''}|${t.no_certificado_sat ?? ''}||`;
}

/* ─────────────── dibujar ─────────────── */

const ANCHO = 612, ALTO = 792;
/** La columna negra: ancho, margen interior; el cuerpo empieza en X0 y termina en XR. */
const COL = 168, MC = 24, X0 = COL + 28, XR = ANCHO - 36, PIE_COL = 72, PIE_CUERPO = 44;
const NEGRO = rgb(0.137, 0.122, 0.125), LIMA = rgb(0.839, 0.878, 0.243), BLANCO = rgb(1, 1, 1), GRIS_CLARO = rgb(0.725, 0.725, 0.725);
const TINTA = rgb(0.071, 0.153, 0.2), GRIS = rgb(0.357, 0.42, 0.463), LINEA = rgb(0.875, 0.902, 0.918), NUBE = rgb(0.957, 0.969, 0.976), AZUL = rgb(0, 0.5, 0.757);

const pesosTxt = (centavos: number): string => {
  const neg = centavos < 0; const n = Math.abs(Math.round(centavos));
  const ent = Math.floor(n / 100).toLocaleString('en-US'); return `${neg ? '-' : ''}$${ent}.${String(n % 100).padStart(2, '0')}`;
};
const cantidadTxt = (c: string): string => { const n = Number(c); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 6 }) : c; };
const fechaTxt = (iso: string): string => iso.replace('T', ' ').slice(0, 19);

/** Las letras cubren el latín extendido; lo que no está ahí se cambia por «?». */
function limpio(s: unknown): string {
  return String(s ?? '').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff–—‘’“”•…€×]/g, '?').replace(/[\x09\x0a\x0d]+/g, ' ');
}

/** Toda cifra va en Fira: un importe, un folio, una fecha, un RFC, un UUID, una CLABE. */
const CIFRA = /\$?\d[\d.,:%/]*|(?=[A-Z-]*\d)[A-Z0-9-]{10,}/g;

type Peso = 'normal' | 'semi' | 'negra';
interface Letras { texto: Record<Peso, PDFFont>; cifra: Record<Peso, PDFFont> }

class Lienzo {
  doc!: PDFDocument;
  L!: Letras;
  pagina!: PDFPage;
  y = ALTO - 50;
  paginas = 0;
  constructor(private marca: string | null) {}

  async abrir(): Promise<void> {
    this.doc = await PDFDocument.create();
    this.doc.registerFontkit(fontkit);
    const f = (b: ArrayBuffer) => this.doc.embedFont(b, { subset: true });
    this.L = {
      texto: { normal: await f(raleway400), semi: await f(raleway600), negra: await f(raleway700) },
      cifra: { normal: await f(fira400), semi: await f(fira600), negra: await f(fira600) },
    };
  }

  /** Los tramos de un texto: lo que es cifra va en Fira, lo demás en Raleway. */
  tramos(t: string, peso: Peso): Array<[string, PDFFont]> {
    const out: Array<[string, PDFFont]> = []; let i = 0;
    for (const m of t.matchAll(CIFRA)) {
      const at = m.index ?? 0;
      if (at > i) out.push([t.slice(i, at), this.L.texto[peso]]);
      out.push([m[0], this.L.cifra[peso]]); i = at + m[0].length;
    }
    if (i < t.length) out.push([t.slice(i), this.L.texto[peso]]);
    return out;
  }
  ancho(t: string, tam: number, peso: Peso = 'normal'): number { return this.tramos(t, peso).reduce((a, [s, f]) => a + f.widthOfTextAtSize(s, tam), 0); }

  texto(s: string, x: number, y: number, o: { tam?: number; peso?: Peso; color?: RGB; ancho?: number; derecha?: boolean } = {}): number {
    const tam = o.tam ?? 7.5, peso = o.peso ?? 'normal';
    let t = limpio(s);
    if (o.ancho) while (t.length > 1 && this.ancho(t, tam, peso) > o.ancho) t = t.slice(0, -1);
    const w = this.ancho(t, tam, peso);
    let tx = x + (o.derecha ? (o.ancho ?? 0) - w : 0);
    for (const [seg, f] of this.tramos(t, peso)) { this.pagina.drawText(seg, { x: tx, y, size: tam, font: f, color: o.color ?? TINTA }); tx += f.widthOfTextAtSize(seg, tam); }
    return w;
  }

  /** Parte un texto en renglones que quepan en `ancho`. */
  partir(s: string, ancho: number, tam = 7.5, peso: Peso = 'normal'): string[] {
    const out: string[] = [];
    for (const parrafo of limpio(s).split(/\n/)) {
      let linea = '';
      for (const palabra of parrafo.split(' ')) {
        let p = palabra;
        // Una palabra más ancha que el renglón (un sello) se corta a lo bruto.
        while (this.ancho(p, tam, peso) > ancho) {
          let k = p.length; while (k > 1 && this.ancho(p.slice(0, k), tam, peso) > ancho) k--;
          if (linea) { out.push(linea); linea = ''; }
          out.push(p.slice(0, k)); p = p.slice(k);
        }
        const prueba = linea ? `${linea} ${p}` : p;
        if (this.ancho(prueba, tam, peso) <= ancho) linea = prueba;
        else { if (linea) out.push(linea); linea = p; }
      }
      out.push(linea);
    }
    return out.length ? out : [''];
  }

  caja(x: number, y: number, w: number, h: number, color: RGB): void { this.pagina.drawRectangle({ x, y, width: w, height: h, color }); }
  linea(x1: number, y: number, x2: number, color = LINEA, grosor = 0.6): void { this.pagina.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: grosor, color }); }
  imagen(im: PDFImage, x: number, y: number, alto: number, anchoMax?: number): { w: number; h: number } {
    let esc = alto / im.height; if (anchoMax && im.width * esc > anchoMax) esc = anchoMax / im.width;
    const w = im.width * esc, h = im.height * esc;
    this.pagina.drawImage(im, { x, y, width: w, height: h }); return { w, h };
  }
  qr(texto: string, x: number, y: number, tam: number, color = NEGRO): void {
    const q = qrcode(0, 'M'); q.addData(texto); q.make();
    const n = q.getModuleCount(), celda = tam / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) this.pagina.drawRectangle({ x: x + c * celda, y: y + tam - (r + 1) * celda, width: celda + 0.2, height: celda + 0.2, color });
  }
  marcaDeAgua(): void {
    if (this.marca) this.pagina.drawText(this.marca, { x: 250, y: 230, size: 64, font: this.L.texto.negra, color: rgb(0.92, 0.92, 0.92), rotate: degrees(35) });
  }
}

/** Los datos que van en la columna negra de cada página. */
interface Columna { f: Impresa; e: Empresa; k: PdfConfig; logoEmisor: PDFImage; logoMarca: PDFImage; logoEmpresa: PDFImage | null }

function columna(L: Lienzo, c: Columna): void {
  const { f, e, k } = c;
  const cw = COL - 2 * MC;
  L.caja(0, 0, COL, ALTO, NEGRO); L.caja(COL, 0, 2, ALTO, LIMA);
  // El logo: el de la empresa (sobre blanco, para que cualquiera se vea) o el de FORESPOT en blanco.
  let y = ALTO - 36;
  if (c.logoEmpresa) {
    const alto = Math.min(80, cw / (c.logoEmpresa.width / c.logoEmpresa.height));
    L.caja(MC - 6, y - alto - 6, cw + 12, alto + 12, BLANCO);
    L.imagen(c.logoEmpresa, MC, y - alto, alto, cw); y -= alto + 34;
  } else {
    const { h } = L.imagen(c.logoEmisor, MC, y - 96, 96, cw); y -= h + 28;
  }
  const seccion = (t: string) => { L.texto(t, MC, y, { tam: 6.5, peso: 'negra', color: LIMA }); L.caja(MC, y - 3, 18, 1.2, LIMA); y -= 13; };
  const renglon = (t: string, o: { peso?: Peso; tam?: number; color?: RGB } = {}) => {
    for (const l of L.partir(t, cw, o.tam ?? 6.5, o.peso)) { L.texto(l, MC, y, { tam: o.tam ?? 6.5, peso: o.peso, color: o.color ?? BLANCO }); y -= 8.5; }
  };
  seccion('EMISOR');
  renglon(e.nombre || f.emisor.nombre, { peso: 'semi' });
  renglon(`RFC ${f.emisor.rfc}`);
  if (f.emisor.regimen) renglon(`${f.emisor.regimen} · ${REGIMEN_NOMBRE[f.emisor.regimen] ?? ''}`, { color: GRIS_CLARO });
  if (e.direccion) renglon(e.direccion, { color: GRIS_CLARO });
  const contacto = [e.telefono, e.correo, e.sitio_web].filter(Boolean).join(' · ');
  if (contacto) renglon(contacto, { color: GRIS_CLARO });
  y -= 8;
  if (k.clabe || k.cuenta || k.banco) {
    seccion('DATOS BANCARIOS');
    if (k.banco) renglon(k.banco);
    if (k.clabe) renglon(`CLABE ${k.clabe.replace(/(\d{3})(\d{3})(\d{11})(\d)/, '$1 $2 $3 $4')}`, { peso: 'semi' });
    if (k.cuenta) renglon(`Cuenta ${k.cuenta}`);
    if (k.beneficiario) renglon(k.beneficiario, { color: GRIS_CLARO });
    y -= 8;
  }
  if (f.timbre) {
    seccion('TIMBRE FISCAL');
    renglon('Folio fiscal', { color: GRIS_CLARO });
    renglon(f.timbre.uuid, { peso: 'semi', tam: 6 });
    if (f.timbre.fecha_timbrado) renglon(`Timbrado ${fechaTxt(f.timbre.fecha_timbrado)}`, { color: GRIS_CLARO });
    if (f.timbre.no_certificado) renglon(`CSD ${f.timbre.no_certificado}`, { color: GRIS_CLARO });
    if (f.timbre.no_certificado_sat) renglon(`CSD SAT ${f.timbre.no_certificado_sat}`, { color: GRIS_CLARO });
    if (f.timbre.rfc_prov_certif) renglon(`PAC ${f.timbre.rfc_prov_certif}`, { color: GRIS_CLARO });
    y -= 6;
    const qrTam = 86;
    if (y - qrTam - 8 > PIE_COL + 10) {
      L.caja(MC - 4, y - qrTam - 8, qrTam + 8, qrTam + 8, BLANCO);
      L.qr(ligaSat({ uuid: f.timbre.uuid, rfc_emisor: f.emisor.rfc, rfc_receptor: f.receptor.rfc, total_original: f.timbre.total_original, sello: f.timbre.sello }), MC, y - qrTam - 4, qrTam);
    }
  }
  // El pie lima con la marca.
  L.caja(0, 0, COL, PIE_COL, LIMA);
  L.imagen(c.logoMarca, MC, 40, 18);
  L.texto('marca de FORESPOT', MC, 30, { tam: 5.5, color: NEGRO });
}

export async function armarPdf(d: { impresa: Impresa; empresa: Empresa; config: PdfConfig; vista_previa?: boolean }): Promise<Uint8Array> {
  const { impresa: f, empresa: e, config: k } = d;
  const L = new Lienzo(d.vista_previa ? 'VISTA PREVIA' : null);
  await L.abrir();
  const anchoC = XR - X0;

  let logoEmpresa: PDFImage | null = null;
  if (e.logo) {
    try {
      logoEmpresa = /png/i.test(e.logo.tipo) ? await L.doc.embedPng(e.logo.bytes) : /jpe?g/i.test(e.logo.tipo) ? await L.doc.embedJpg(e.logo.bytes) : null;
    } catch { logoEmpresa = null; }
  }
  const col: Columna = { f, e, k, logoEmisor: await L.doc.embedPng(logoEmisorBlanco), logoMarca: await L.doc.embedPng(logoMarcaTinta), logoEmpresa };

  const folio = `${f.serie ?? ''}${f.serie && f.folio ? ' ' : ''}${f.folio ?? ''}`;
  const nuevaPagina = () => {
    L.pagina = L.doc.addPage([ANCHO, ALTO]); L.paginas += 1;
    columna(L, col); L.marcaDeAgua();
    L.y = ALTO - 50;
  };
  const asegurar = (alto: number) => { if (L.y - alto < PIE_CUERPO) { nuevaPagina(); cabecera(); } };

  /* ── Cabecera del cuerpo: FACTURA, folio, fecha; receptor; cómo se paga ── */
  nuevaPagina();
  L.texto(d.vista_previa ? 'VISTA PREVIA' : 'FACTURA', X0, L.y, { tam: 22, peso: 'negra', color: NEGRO });
  L.texto(folio || (d.vista_previa ? 'sin folio' : ''), XR - 200, L.y + 2, { tam: 16, peso: 'negra', color: NEGRO, ancho: 200, derecha: true });
  L.y -= 14;
  L.texto(`Emitida ${fechaTxt(f.fecha_hora)}   ·   Lugar de expedición C.P. ${f.lugar_expedicion ?? '—'}   ·   Tipo I · Ingreso`, X0, L.y, { tam: 7, color: GRIS, ancho: anchoC });
  L.y -= 24;
  L.texto('RECEPTOR', X0, L.y, { tam: 6.5, peso: 'semi', color: GRIS }); L.y -= 12;
  L.texto(f.receptor.nombre, X0, L.y, { tam: 9, peso: 'negra', ancho: anchoC }); L.y -= 11;
  L.texto(`RFC ${f.receptor.rfc}   ·   C.P. ${f.receptor.cp ?? '—'}   ·   ${f.receptor.regimen ?? '—'} · ${REGIMEN_NOMBRE[f.receptor.regimen ?? ''] ?? ''}`, X0, L.y, { tam: 7, ancho: anchoC }); L.y -= 10;
  L.texto(`Uso CFDI ${f.receptor.uso ?? '—'} · ${USO_NOMBRE[f.receptor.uso ?? ''] ?? ''}`, X0, L.y, { tam: 7, color: GRIS, ancho: anchoC }); L.y -= 18;
  L.caja(X0, L.y - 16, anchoC, 16, NUBE);
  L.texto(`${f.metodo_pago ?? '—'} · ${METODO_PAGO_NOMBRE[f.metodo_pago ?? ''] ?? ''}   ·   ${f.forma_pago ?? '—'} · ${FORMA_PAGO_NOMBRE[f.forma_pago ?? ''] ?? ''}   ·   ${f.moneda}   ·   Exportación ${f.exportacion ?? '01'} · ${EXPORTACION_NOMBRE[f.exportacion ?? '01'] ?? ''}`, X0 + 6, L.y - 11, { tam: 6.5, ancho: anchoC - 12 });
  L.y -= 26;

  /* ── Conceptos: cabecera lima, Fira en las cifras ── */
  const cols = [
    { t: 'Clave SAT', w: 40 }, { t: 'Unidad', w: 50 }, { t: 'Descripción', w: 0 }, { t: 'Cant.', w: 30, der: true },
    { t: 'P. unitario', w: 52, der: true }, { t: 'Importe', w: 52, der: true }, { t: 'IVA', w: 42, der: true },
  ];
  cols[2].w = anchoC - 8 - cols.reduce((s, c) => s + c.w, 0) - (cols.length - 1) * 4;
  const cabecera = () => {
    L.caja(X0, L.y - 14, anchoC, 14, LIMA);
    let x = X0 + 4;
    for (const c of cols) { L.texto(c.t, x, L.y - 10, { tam: 6.5, peso: 'semi', color: NEGRO, ancho: c.w, derecha: c.der }); x += c.w + 4; }
    L.y -= 14;
  };
  cabecera();
  for (const r of f.renglones) {
    const desc = L.partir(r.descripcion, cols[2].w - 2, 7);
    const extra = [r.descuento ? `Descuento ${pesosTxt(r.descuento)}` : null, r.tasa_iva !== null ? `Objeto ${r.objeto_imp} · IVA ${(Number(r.tasa_iva) * 100).toFixed(0)} %` : OBJETO_IMP_NOMBRE[r.objeto_imp] ?? null].filter(Boolean).join(' · ');
    const alto = desc.length * 9.5 + (extra ? 8 : 0) + 8;
    if (L.y - alto < PIE_CUERPO) { nuevaPagina(); cabecera(); }
    const y0 = L.y;
    let x = X0 + 4;
    const celdas = [r.clave_prod_serv, [r.clave_unidad, r.unidad].filter(Boolean).join(' · '), '', cantidadTxt(r.cantidad), pesosTxt(r.valor_unitario), pesosTxt(r.importe), r.tasa_iva === null ? '—' : pesosTxt(r.iva)];
    celdas.forEach((v, i) => {
      if (i === 2) desc.forEach((l, j) => L.texto(l, x, y0 - 11 - j * 9.5, { tam: 7 }));
      else L.texto(v, x, y0 - 11, { tam: 7, ancho: cols[i].w, derecha: cols[i].der, color: i < 2 ? GRIS : TINTA });
      x += cols[i].w + 4;
    });
    if (extra) L.texto(extra, X0 + 4, y0 - 11 - desc.length * 9.5, { tam: 5.5, color: GRIS });
    L.y = y0 - alto;
    L.linea(X0, L.y, XR);
  }

  /* ── Totales (caja negra, cifra lima) y el total con letra ── */
  asegurar(70);
  L.y -= 16;
  const yTot = L.y;
  const fila = (etq: string, val: string) => { L.texto(etq, XR - 170, L.y, { tam: 7.5, color: GRIS, ancho: 84, derecha: true }); L.texto(val, XR - 80, L.y, { tam: 7.5, ancho: 76, derecha: true }); L.y -= 12; };
  fila('Subtotal', pesosTxt(f.subtotal));
  if (f.descuento) fila('Descuento', `-${pesosTxt(f.descuento)}`);
  fila('IVA 16 %', pesosTxt(f.iva));
  L.caja(XR - 170, L.y - 6, 170, 18, NEGRO);
  L.texto('Total', XR - 170, L.y, { tam: 9, peso: 'negra', color: LIMA, ancho: 84, derecha: true });
  L.texto(pesosTxt(f.total), XR - 80, L.y, { tam: 9.5, peso: 'negra', color: LIMA, ancho: 76, derecha: true });
  const yDespTot = L.y - 8;
  L.y = yTot;
  const anchoIzq = XR - 180 - X0;
  for (const l of L.partir(totalEnLetras(f.total, f.moneda), anchoIzq, 7, 'semi')) { L.texto(l, X0, L.y, { tam: 7, peso: 'semi' }); L.y -= 9.5; }
  if (f.condiciones) { L.y -= 2; for (const l of L.partir(`Condiciones: ${f.condiciones}`, anchoIzq, 7)) { L.texto(l, X0, L.y, { tam: 7, color: GRIS }); L.y -= 9.5; } }
  L.y = Math.min(L.y, yDespTot) - 12;

  /* ── Observaciones y leyenda ── */
  if (f.observaciones || k.leyenda) {
    asegurar(40);
    if (f.observaciones) { L.texto('OBSERVACIONES', X0, L.y, { tam: 6.5, peso: 'semi', color: GRIS }); L.y -= 11; for (const l of L.partir(f.observaciones, anchoC, 7)) { L.texto(l, X0, L.y, { tam: 7 }); L.y -= 9.5; } L.y -= 4; }
    if (k.leyenda) { for (const l of L.partir(k.leyenda, anchoC, 6.5)) { L.texto(l, X0, L.y, { tam: 6.5, color: GRIS }); L.y -= 9; } L.y -= 4; }
    L.y -= 6;
  }

  /* ── Sellos y cadena original (el QR va en la columna) ── */
  if (f.timbre) {
    asegurar(120);
    const bloque = (titulo: string, cuerpo: string) => {
      L.texto(titulo, X0, L.y, { tam: 5.5, peso: 'semi', color: GRIS }); L.y -= 9;
      for (const l of L.partir(cuerpo || '—', anchoC, 5.2)) { asegurar(8); L.texto(l, X0, L.y, { tam: 5.2 }); L.y -= 6.5; }
      L.y -= 4;
    };
    bloque('SELLO DIGITAL DEL CFDI', f.timbre.sello ?? '');
    bloque('SELLO DIGITAL DEL SAT', f.timbre.sello_sat ?? '');
    bloque('CADENA ORIGINAL DEL COMPLEMENTO DE CERTIFICACIÓN DIGITAL DEL SAT', cadenaOriginal(f.timbre));
  } else {
    asegurar(20);
    L.texto('Vista previa: esta factura todavía no está timbrada ante el SAT. Sin folio fiscal no tiene valor.', X0, L.y, { tam: 7, peso: 'semi', color: AZUL, ancho: anchoC });
  }

  /* ── pie del cuerpo: representación impresa · página n de m ── */
  const paginas = L.doc.getPages();
  paginas.forEach((p, i) => {
    L.pagina = p;
    L.texto(`${f.timbre ? 'Este documento es una representación impresa de un CFDI versión 4.0' : folio || 'Vista previa'}   ·   Página ${i + 1} de ${paginas.length}`, X0, 28, { tam: 6, color: GRIS, ancho: anchoC, derecha: true });
  });

  return L.doc.save();
}

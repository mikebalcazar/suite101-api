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
 * Se arma con pdf-lib (puro JS, corre en el Worker) y Helvetica, que trae
 * los acentos del español (WinAnsi). Lo que no quepa en WinAnsi (un emoji,
 * una comilla rara) se cambia por «?» en vez de tronar.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb, type RGB } from 'pdf-lib';
import qrcode from 'qrcode-generator';
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

const ANCHO = 612, ALTO = 792, MARGEN = 40;
const TINTA = rgb(0.13, 0.13, 0.13), GRIS = rgb(0.45, 0.45, 0.45), LINEA = rgb(0.85, 0.85, 0.85), FONDO = rgb(0.96, 0.96, 0.96), AZUL = rgb(0, 0.5, 0.757);

const pesosTxt = (centavos: number): string => {
  const neg = centavos < 0; const n = Math.abs(Math.round(centavos));
  const ent = Math.floor(n / 100).toLocaleString('en-US'); return `${neg ? '-' : ''}$${ent}.${String(n % 100).padStart(2, '0')}`;
};
const cantidadTxt = (c: string): string => { const n = Number(c); return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 6 }) : c; };
const fechaTxt = (iso: string): string => iso.replace('T', ' ').slice(0, 19);

/** Helvetica es WinAnsi: lo que no está ahí se cambia por «?». */
function limpio(s: unknown): string {
  return String(s ?? '').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff–—‘’“”•…€]/g, '?').replace(/[\x09\x0a\x0d]+/g, ' ');
}

class Lienzo {
  doc!: PDFDocument;
  fuente!: PDFFont;
  negra!: PDFFont;
  pagina!: PDFPage;
  y = ALTO - MARGEN;
  paginas = 0;
  constructor(private marca: string | null) {}

  async abrir(): Promise<void> {
    this.doc = await PDFDocument.create();
    this.fuente = await this.doc.embedFont(StandardFonts.Helvetica);
    this.negra = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.nuevaPagina();
  }

  nuevaPagina(): void {
    this.pagina = this.doc.addPage([ANCHO, ALTO]);
    this.paginas += 1;
    this.y = ALTO - MARGEN;
    if (this.marca) {
      this.pagina.drawText(this.marca, { x: 90, y: 250, size: 72, font: this.negra, color: rgb(0.93, 0.93, 0.93), rotate: degrees(35) });
    }
  }

  texto(s: string, x: number, y: number, o: { tam?: number; negra?: boolean; color?: RGB; ancho?: number; derecha?: boolean } = {}): void {
    const f = o.negra ? this.negra : this.fuente, tam = o.tam ?? 8;
    let t = limpio(s);
    if (o.ancho) while (t.length > 1 && f.widthOfTextAtSize(t, tam) > o.ancho) t = t.slice(0, -1);
    const dx = o.derecha ? (o.ancho ?? 0) - f.widthOfTextAtSize(t, tam) : 0;
    this.pagina.drawText(t, { x: x + dx, y, size: tam, font: f, color: o.color ?? TINTA });
  }

  /** Parte un texto en renglones que quepan en `ancho`. */
  partir(s: string, ancho: number, tam = 8, negra = false): string[] {
    const f = negra ? this.negra : this.fuente;
    const out: string[] = [];
    for (const parrafo of limpio(s).split(/\n/)) {
      let linea = '';
      for (const palabra of parrafo.split(' ')) {
        let p = palabra;
        // Una palabra más ancha que el renglón (un sello) se corta a lo bruto.
        while (f.widthOfTextAtSize(p, tam) > ancho) {
          let k = p.length; while (k > 1 && f.widthOfTextAtSize(p.slice(0, k), tam) > ancho) k--;
          if (linea) { out.push(linea); linea = ''; }
          out.push(p.slice(0, k)); p = p.slice(k);
        }
        const prueba = linea ? `${linea} ${p}` : p;
        if (f.widthOfTextAtSize(prueba, tam) <= ancho) linea = prueba;
        else { if (linea) out.push(linea); linea = p; }
      }
      out.push(linea);
    }
    return out.length ? out : [''];
  }

  parrafo(s: string, x: number, ancho: number, o: { tam?: number; negra?: boolean; color?: RGB; interlinea?: number } = {}): number {
    const tam = o.tam ?? 8, paso = o.interlinea ?? tam * 1.25;
    const lineas = this.partir(s, ancho, tam, o.negra);
    for (const l of lineas) { this.asegurar(paso); this.texto(l, x, this.y - tam, { tam, negra: o.negra, color: o.color }); this.y -= paso; }
    return lineas.length;
  }

  asegurar(alto: number): void { if (this.y - alto < MARGEN + 20) this.nuevaPagina(); }
  linea(y: number, color = LINEA): void { this.pagina.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.6, color }); }
  caja(x: number, y: number, w: number, h: number, color = FONDO): void { this.pagina.drawRectangle({ x, y, width: w, height: h, color }); }
}

export async function armarPdf(d: { impresa: Impresa; empresa: Empresa; config: PdfConfig; vista_previa?: boolean }): Promise<Uint8Array> {
  const { impresa: f, empresa: e, config: k } = d;
  const L = new Lienzo(d.vista_previa ? 'VISTA PREVIA' : null);
  await L.abrir();
  const ancho = ANCHO - 2 * MARGEN;

  /* ── Cabecera: logo + empresa a la izquierda, «FACTURA» y folio a la derecha ── */
  let xTexto = MARGEN;
  let logo: PDFImage | null = null;
  if (e.logo) {
    try {
      logo = /png/i.test(e.logo.tipo) ? await L.doc.embedPng(e.logo.bytes) : /jpe?g/i.test(e.logo.tipo) ? await L.doc.embedJpg(e.logo.bytes) : null;
    } catch { logo = null; }
  }
  if (logo) {
    const esc = Math.min(150 / logo.width, 56 / logo.height);
    const w = logo.width * esc, h = logo.height * esc;
    L.pagina.drawImage(logo, { x: MARGEN, y: L.y - h, width: w, height: h });
    xTexto = MARGEN + w + 12;
  }
  const anchoEmp = ANCHO - MARGEN - 190 - xTexto;
  let yEmp = L.y - 11;
  L.texto(e.nombre, xTexto, yEmp, { tam: 11, negra: true, ancho: anchoEmp }); yEmp -= 13;
  if (e.rfc) { L.texto(`RFC ${e.rfc}`, xTexto, yEmp, { tam: 8, ancho: anchoEmp }); yEmp -= 10; }
  if (f.emisor.regimen) { L.texto(`${f.emisor.regimen} · ${REGIMEN_NOMBRE[f.emisor.regimen] ?? ''}`, xTexto, yEmp, { tam: 7.5, color: GRIS, ancho: anchoEmp }); yEmp -= 10; }
  for (const l of [e.direccion, [e.telefono, e.correo, e.sitio_web].filter(Boolean).join(' · ')].filter((x): x is string => !!x)) {
    L.texto(l, xTexto, yEmp, { tam: 7.5, color: GRIS, ancho: anchoEmp }); yEmp -= 10;
  }

  const xDer = ANCHO - MARGEN - 180;
  L.caja(xDer, L.y - 64, 180, 64);
  L.texto(d.vista_previa ? 'VISTA PREVIA' : 'FACTURA', xDer + 10, L.y - 16, { tam: 12, negra: true, color: AZUL });
  const folio = `${f.serie ?? ''}${f.serie && f.folio ? '-' : ''}${f.folio ?? ''}`;
  L.texto(folio || (d.vista_previa ? 'sin folio' : ''), xDer + 170 - L.negra.widthOfTextAtSize(limpio(folio || (d.vista_previa ? 'sin folio' : '')), 12), L.y - 16, { tam: 12, negra: true });
  L.texto(`Fecha: ${fechaTxt(f.fecha_hora)}`, xDer + 10, L.y - 31, { tam: 7.5 });
  L.texto(`Lugar de expedición: ${f.lugar_expedicion ?? '—'}`, xDer + 10, L.y - 42, { tam: 7.5 });
  L.texto(`Tipo: I · Ingreso · ${f.moneda}`, xDer + 10, L.y - 53, { tam: 7.5 });
  L.y = Math.min(yEmp, L.y - 64) - 10;

  /* ── Timbre (folio fiscal) ── */
  if (f.timbre) {
    L.caja(MARGEN, L.y - 34, ancho, 34);
    L.texto('Folio fiscal (UUID)', MARGEN + 8, L.y - 11, { tam: 6.5, color: GRIS });
    L.texto(f.timbre.uuid, MARGEN + 8, L.y - 24, { tam: 9, negra: true });
    L.texto('No. certificado emisor', MARGEN + 250, L.y - 11, { tam: 6.5, color: GRIS });
    L.texto(f.timbre.no_certificado ?? '—', MARGEN + 250, L.y - 24, { tam: 8 });
    L.texto('No. certificado SAT', MARGEN + 370, L.y - 11, { tam: 6.5, color: GRIS });
    L.texto(f.timbre.no_certificado_sat ?? '—', MARGEN + 370, L.y - 24, { tam: 8 });
    L.texto('Fecha de timbrado', MARGEN + 470, L.y - 11, { tam: 6.5, color: GRIS });
    L.texto(f.timbre.fecha_timbrado ? fechaTxt(f.timbre.fecha_timbrado) : '—', MARGEN + 470, L.y - 24, { tam: 7.5 });
    L.y -= 44;
  }

  /* ── Receptor ── */
  L.texto('RECEPTOR', MARGEN, L.y - 8, { tam: 7, negra: true, color: AZUL });
  L.y -= 12;
  L.linea(L.y);
  L.y -= 4;
  const colR = (ancho - 10) / 2;
  const yR = L.y;
  L.texto(f.receptor.nombre, MARGEN, yR - 10, { tam: 9.5, negra: true, ancho: colR });
  L.texto(`RFC ${f.receptor.rfc}`, MARGEN, yR - 21, { tam: 8 });
  L.texto(`Régimen: ${f.receptor.regimen ?? '—'} · ${REGIMEN_NOMBRE[f.receptor.regimen ?? ''] ?? ''}`, MARGEN, yR - 31, { tam: 7.5, color: GRIS, ancho: colR });
  L.texto(`Domicilio fiscal (CP): ${f.receptor.cp ?? '—'}`, MARGEN + colR + 10, yR - 10, { tam: 8 });
  L.texto(`Uso del CFDI: ${f.receptor.uso ?? '—'} · ${USO_NOMBRE[f.receptor.uso ?? ''] ?? ''}`, MARGEN + colR + 10, yR - 21, { tam: 7.5, color: GRIS, ancho: colR });
  L.texto(`Exportación: ${f.exportacion ?? '01'} · ${EXPORTACION_NOMBRE[f.exportacion ?? '01'] ?? ''}`, MARGEN + colR + 10, yR - 31, { tam: 7.5, color: GRIS, ancho: colR });
  L.y = yR - 42;

  /* ── Conceptos ── */
  const cols = [
    { t: 'Clave SAT', w: 52 }, { t: 'Cant.', w: 38, der: true }, { t: 'Unidad', w: 50 }, { t: 'Descripción', w: 0 },
    { t: 'P. unitario', w: 62, der: true }, { t: 'Desc.', w: 48, der: true }, { t: 'IVA', w: 52, der: true }, { t: 'Importe', w: 66, der: true },
  ];
  const fijo = cols.reduce((s, c) => s + c.w, 0) + (cols.length - 1) * 6;
  cols[3].w = ancho - fijo;
  const cabecera = () => {
    L.asegurar(30);
    L.caja(MARGEN, L.y - 14, ancho, 14, rgb(0.92, 0.95, 0.98));
    let x = MARGEN + 3;
    for (const c of cols) { L.texto(c.t, x, L.y - 10, { tam: 7, negra: true, ancho: c.w, derecha: c.der }); x += c.w + 6; }
    L.y -= 16;
  };
  cabecera();
  for (const r of f.renglones) {
    const desc = L.partir(r.descripcion, cols[3].w - 2, 7.5);
    const alto = Math.max(1, desc.length) * 9.5 + 6;
    if (L.y - alto < MARGEN + 20) { L.nuevaPagina(); cabecera(); }
    const y0 = L.y;
    let x = MARGEN + 3;
    const celdas = [r.clave_prod_serv, cantidadTxt(r.cantidad), [r.clave_unidad, r.unidad].filter(Boolean).join(' '), '', pesosTxt(r.valor_unitario), r.descuento ? pesosTxt(r.descuento) : '—', r.tasa_iva === null ? 'No objeto' : pesosTxt(r.iva), pesosTxt(r.importe)];
    celdas.forEach((v, i) => {
      if (i === 3) desc.forEach((l, j) => L.texto(l, x, y0 - 9 - j * 9.5, { tam: 7.5 }));
      else L.texto(v, x, y0 - 9, { tam: 7.5, ancho: cols[i].w, derecha: cols[i].der });
      x += cols[i].w + 6;
    });
    if (r.tasa_iva !== null) L.texto(`Objeto ${r.objeto_imp} · IVA ${(Number(r.tasa_iva) * 100).toFixed(0)} %`, MARGEN + 3, y0 - 9 - desc.length * 9.5, { tam: 6, color: GRIS });
    L.y = y0 - alto - (r.tasa_iva !== null ? 6 : 0);
    L.linea(L.y + 2);
  }

  /* ── Totales + con letra ── */
  L.asegurar(90);
  const xT = ANCHO - MARGEN - 190;
  const fila = (etq: string, val: string, negra = false) => { L.texto(etq, xT, L.y - 10, { tam: 8, negra }); L.texto(val, xT + 90, L.y - 10, { tam: 8, negra, ancho: 100, derecha: true }); L.y -= 12; };
  const yTot = L.y;
  fila('Subtotal', pesosTxt(f.subtotal));
  if (f.descuento) fila('Descuento', `-${pesosTxt(f.descuento)}`);
  fila('IVA trasladado', pesosTxt(f.iva));
  L.caja(xT - 6, L.y - 15, 200, 16, rgb(0.92, 0.95, 0.98));
  fila('TOTAL', pesosTxt(f.total), true);
  const yDespTot = L.y;
  L.y = yTot;
  const anchoIzq = xT - 16 - MARGEN;
  L.parrafo(`Importe con letra: ${totalEnLetras(f.total, f.moneda)}`, MARGEN, anchoIzq, { tam: 7.5, negra: true });
  L.y -= 2;
  L.parrafo(`Forma de pago: ${f.forma_pago ?? '—'} · ${FORMA_PAGO_NOMBRE[f.forma_pago ?? ''] ?? ''}`, MARGEN, anchoIzq, { tam: 7.5 });
  L.parrafo(`Método de pago: ${f.metodo_pago ?? '—'} · ${METODO_PAGO_NOMBRE[f.metodo_pago ?? ''] ?? ''}`, MARGEN, anchoIzq, { tam: 7.5 });
  L.parrafo(`Moneda: ${f.moneda}${f.condiciones ? ` · Condiciones: ${f.condiciones}` : ''}`, MARGEN, anchoIzq, { tam: 7.5 });
  L.y = Math.min(L.y, yDespTot) - 10;

  /* ── Datos bancarios y observaciones ── */
  const hayBanco = !!(k.clabe || k.cuenta || k.banco);
  if (hayBanco || f.observaciones || k.leyenda) {
    L.asegurar(60);
    const colB = hayBanco ? (ancho - 10) / 2 : ancho;
    const y0 = L.y;
    if (hayBanco) {
      L.caja(MARGEN, y0 - 54, colB, 54);
      L.texto('PARA PAGAR', MARGEN + 8, y0 - 11, { tam: 7, negra: true, color: AZUL });
      let yb = y0 - 23;
      for (const l of [k.beneficiario ? `Beneficiario: ${k.beneficiario}` : null, k.banco ? `Banco: ${k.banco}` : null, k.clabe ? `CLABE: ${k.clabe.replace(/(\d{3})(\d{3})(\d{11})(\d)/, '$1 $2 $3 $4')}` : null, k.cuenta ? `Cuenta: ${k.cuenta}` : null].filter((x): x is string => !!x).slice(0, 4)) {
        L.texto(l, MARGEN + 8, yb, { tam: 7.5, ancho: colB - 16 }); yb -= 9.5;
      }
    }
    const xO = hayBanco ? MARGEN + colB + 10 : MARGEN;
    L.y = y0;
    if (f.observaciones) { L.texto('OBSERVACIONES', xO, L.y - 11, { tam: 7, negra: true, color: AZUL }); L.y -= 16; L.parrafo(f.observaciones, xO, colB, { tam: 7.5 }); }
    if (k.leyenda) { L.y -= 2; L.parrafo(k.leyenda, xO, colB, { tam: 7, color: GRIS }); }
    L.y = Math.min(L.y, y0 - (hayBanco ? 54 : 0)) - 10;
  }

  /* ── Sellos, cadena original y QR ── */
  if (f.timbre) {
    L.asegurar(150);
    const qrTam = 96;
    const xQr = ANCHO - MARGEN - qrTam;
    const qr = qrcode(0, 'M');
    qr.addData(ligaSat({ uuid: f.timbre.uuid, rfc_emisor: f.emisor.rfc, rfc_receptor: f.receptor.rfc, total_original: f.timbre.total_original, sello: f.timbre.sello }));
    qr.make();
    const n = qr.getModuleCount(), celda = qrTam / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) L.pagina.drawRectangle({ x: xQr + c * celda, y: L.y - (r + 1) * celda, width: celda + 0.2, height: celda + 0.2, color: TINTA });
    const anchoS = xQr - 10 - MARGEN;
    const yS = L.y;
    const bloque = (titulo: string, cuerpo: string) => {
      L.texto(titulo, MARGEN, L.y - 8, { tam: 6, negra: true, color: GRIS }); L.y -= 10;
      L.parrafo(cuerpo || '—', MARGEN, anchoS, { tam: 5.5, interlinea: 6.5 }); L.y -= 3;
    };
    bloque('Sello digital del CFDI', f.timbre.sello ?? '');
    bloque('Sello digital del SAT', f.timbre.sello_sat ?? '');
    bloque('Cadena original del complemento de certificación digital del SAT', cadenaOriginal(f.timbre));
    L.y = Math.min(L.y, yS - qrTam) - 6;
    if (f.timbre.rfc_prov_certif) L.texto(`RFC del proveedor de certificación: ${f.timbre.rfc_prov_certif}`, MARGEN, L.y - 6, { tam: 6, color: GRIS });
    L.y -= 10;
    L.texto('Este documento es una representación impresa de un CFDI.', MARGEN, L.y - 6, { tam: 6.5, color: GRIS });
  } else {
    L.asegurar(30);
    L.texto('Vista previa: esta factura todavía no está timbrada ante el SAT. Sin folio fiscal no tiene valor.', MARGEN, L.y - 8, { tam: 7.5, negra: true, color: AZUL });
  }

  /* ── pie: página n de m ── */
  const paginas = L.doc.getPages();
  paginas.forEach((p, i) => p.drawText(limpio(`${folio || 'Factura'} · página ${i + 1} de ${paginas.length}`), { x: MARGEN, y: 22, size: 6.5, font: L.fuente, color: GRIS }));

  return L.doc.save();
}

/* Un .xlsx de verdad, sin dependencias.
 *
 * Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
 * excel (…). Creo que esto es lo mismo que el cliente podría descargar desde
 * peek101».
 *
 * POR QUÉ VIVE EN LA API Y NO EN LA PANTALLA
 *
 * Por lo mismo que los totales: el archivo lo bajan DOS aplicaciones
 * —dash101 y peek101—, y dos copias del mismo armador es la manera segura de
 * que un día el Excel de la empresa y el del cliente no digan lo mismo.
 * Además peek101 es JavaScript plano servido tal cual, sin empaquetador: una
 * copia allá sería una copia de verdad, no un import.
 *
 * Nació del lado de dash101 y se mudó aquí el mismo día, antes de publicarse:
 * en cuanto hubo que dárselo también al cliente, quedó claro de quién era.
 *
 * POR QUÉ ESTÁ ESCRITO A MANO Y NO ES UNA LIBRERÍA
 *
 * Las de armar Excel pesan entre 400 KB y 900 KB, y esta aplicación viaja en
 * un Worker donde cada kilobyte se paga en el arranque. Lo que necesitamos
 * es la esquina más chica del formato: unas cuantas hojas de texto y números,
 * sin fórmulas, sin estilos, sin gráficas. Eso son doscientas líneas.
 *
 * POR QUÉ NO UN CSV, QUE SERÍA UNA TARDE MENOS
 *
 * Porque el documento son DOS TABLAS —los ítems y los pagos— más los totales,
 * y un CSV es una sola. Pegarlas en un archivo con renglones en blanco en
 * medio es lo que hace que Excel adivine mal los tipos y que las fechas se
 * vuelvan números. Un .xlsx con dos hojas se abre y ya está.
 *
 * CÓMO ES POR DENTRO
 *
 * Un .xlsx es un ZIP con XML adentro. Aquí se arma con compresión CERO
 * (método «stored»): el ZIP guarda los bytes tal cual, así que no hace falta
 * deflate y el archivo se puede revisar byte por byte en una prueba. Un
 * estado de cuenta son decenas de kilobytes; ahorrarle veinte no vale una
 * dependencia ni un camino que no se pueda medir.
 *
 * Los textos van como `inlineStr` en vez de tabla de cadenas compartidas:
 * ocupa un poco más y quita una pieza entera —y su índice, que es justo
 * donde se cometen los errores de este formato—.
 */

/** Una celda: texto, número o vacío. Las fechas van como texto ya formateado
 *  a propósito: una fecha «de verdad» en Excel es un número con un formato
 *  encima, y en cuanto el formato no viaja bien alguien lee 46 000 donde
 *  decía 2026. */
export type Celda = string | number | null;

export interface Hoja {
  /** Como sale en la pestaña de abajo. Excel no acepta / \ ? * [ ] : ni más
   *  de 31 caracteres, así que se recorta y se limpia aquí. */
  nombre: string;
  filas: Celda[][];
}

const XML = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    /* Los caracteres de control rompen el XML de Excel en silencio: el
     * archivo abre «dañado» y no dice por qué. */
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** A, B, … Z, AA, AB … Es la única cuenta del formato que hay que hacer
 *  bien: una columna mal nombrada corre todos los datos un lugar. */
export function columna(n: number): string {
  let s = '';
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
}

const nombreDeHoja = (s: string, i: number) =>
  (s.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || `Hoja${i + 1}`);

function hojaXml(hoja: Hoja): string {
  const filas = hoja.filas.map((fila, f) => {
    const celdas = fila.map((v, c) => {
      if (v === null || v === '') return '';
      const ref = `${columna(c)}${f + 1}`;
      return typeof v === 'number' && Number.isFinite(v)
        ? `<c r="${ref}"><v>${v}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${XML(String(v))}</t></is></c>`;
    }).join('');
    return `<row r="${f + 1}">${celdas}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${filas}</sheetData></worksheet>`;
}

/* ─────────────── el ZIP, en su forma más simple ─────────────── */

const tabla = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tabla[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entrada { nombre: string; datos: Uint8Array }

function zip(entradas: Entrada[]): Uint8Array {
  const cod = new TextEncoder();
  const trozos: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;

  const u16 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const u32 = (v: number) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
  const junta = (partes: Uint8Array[]) => {
    const total = partes.reduce((t, p) => t + p.length, 0);
    const r = new Uint8Array(total);
    let i = 0;
    for (const p of partes) { r.set(p, i); i += p.length; }
    return r;
  };

  for (const e of entradas) {
    const nombre = cod.encode(e.nombre);
    const suma = crc32(e.datos);
    /* Fecha y hora en cero: el formato las guarda en MS-DOS y no aportan
     * nada aquí. Excel no las mira y el sistema de archivos pone la suya. */
    const local = junta([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(suma), u32(e.datos.length), u32(e.datos.length),
      u16(nombre.length), u16(0), nombre,
    ]);
    trozos.push(local, e.datos);
    central.push(junta([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(suma), u32(e.datos.length), u32(e.datos.length),
      u16(nombre.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(desplazamiento), nombre,
    ]));
    desplazamiento += local.length + e.datos.length;
  }

  const dir = junta(central);
  return junta([
    ...trozos, dir,
    junta([
      u32(0x06054b50), u16(0), u16(0), u16(entradas.length), u16(entradas.length),
      u32(dir.length), u32(desplazamiento), u16(0),
    ]),
  ]);
}

/** El libro entero, en bytes. Quien lo sirva le pone las cabeceras. */
export function xlsx(hojas: Hoja[]): Uint8Array {
  const cod = new TextEncoder();
  const nombres = hojas.map((h, i) => nombreDeHoja(h.nombre, i));

  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + `</Types>`;

  const raizRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`
    + ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`
    + nombres.map((n, i) => `<sheet name="${XML(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + `</sheets></workbook>`;

  const libroRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `</Relationships>`;

  const partes: Entrada[] = [
    { nombre: '[Content_Types].xml', datos: cod.encode(tipos) },
    { nombre: '_rels/.rels', datos: cod.encode(raizRels) },
    { nombre: 'xl/workbook.xml', datos: cod.encode(libro) },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: cod.encode(libroRels) },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: cod.encode(hojaXml(h)) })),
  ];

  return zip(partes);
}

/** El tipo que lleva la respuesta, en un solo lugar para que las dos rutas
 *  que lo sirvan no se inventen uno distinto. */
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';


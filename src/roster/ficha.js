// Ficha de trabajador en PDF — Portal Taller 101
//
// El PDF se arma a mano, byte por byte. No es lucimiento: un Worker de
// Cloudflare no tiene dónde meter una librería de PDF pesada, y lo que la ficha
// necesita —texto, líneas, un recuadro y la foto— cabe en un archivo como este.
//
// La foto se pega tal cual si es JPEG: el formato PDF sabe leer JPEG sin
// convertir nada (filtro DCTDecode). Lo que suba el trabajador con la cámara es
// siempre JPEG; si alguien sube su foto en PNG o PDF, la ficha sale sin foto y
// lo dice, en vez de fingir que no pasó nada.

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 48;
const AZUL = [0 / 255, 128 / 255, 193 / 255];   // #0080C1, el azul de la marca
const TINTA = [0.13, 0.14, 0.15];
const TENUE = [0.45, 0.47, 0.49];
const LINEA = [0.85, 0.86, 0.87];

const enc = new TextEncoder();

/* ── texto: PDF escribe en WinAnsi, que sí trae los acentos del español ── */

const WINANSI_EXTRA = {
  '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135,
  'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145,
  '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152,
  '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159,
};

function aWinAnsi(txt) {
  const fuera = [];
  for (const ch of String(txt ?? '')) {
    const cp = ch.codePointAt(0);
    if (cp === 10 || cp === 13) { fuera.push(32); continue; }
    if (cp >= 32 && cp <= 126) { fuera.push(cp); continue; }
    if (WINANSI_EXTRA[ch] !== undefined) { fuera.push(WINANSI_EXTRA[ch]); continue; }
    if (cp >= 160 && cp <= 255) { fuera.push(cp); continue; }
    fuera.push(63); // '?'
  }
  return fuera;
}

// Un string de PDF: los bytes raros se escapan en octal para que ningún visor
// se confunda con un paréntesis suelto dentro de un nombre.
function cadena(txt) {
  let s = '(';
  for (const b of aWinAnsi(txt)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
    else if (b < 32 || b > 126) s += '\\' + b.toString(8).padStart(3, '0');
    else s += String.fromCharCode(b);
  }
  return s + ')';
}

/* ── ancho del texto, para poder cortar lo que no cabe ──
   Medidas de Helvetica en milésimas de em. No hace falta la tabla completa:
   con las letras que se usan en nombres y datos alcanza, y lo demás se estima. */

const ANCHOS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
  S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584,
};

const ACENTOS = { á:'a', é:'e', í:'i', ó:'o', ú:'u', ü:'u', ñ:'n', Á:'A', É:'E', Í:'I', Ó:'O', Ú:'U', Ü:'U', Ñ:'N', '°':'o', '·':'.' };

function ancho(txt, tam, negrita = false) {
  let m = 0;
  for (const ch of String(txt ?? '')) {
    const base = ANCHOS[ch] ?? ANCHOS[ACENTOS[ch]] ?? 556;
    m += negrita ? base * 1.06 : base;
  }
  return (m / 1000) * tam;
}

function recorta(txt, tam, limite, negrita = false) {
  const t = String(txt ?? '');
  if (ancho(t, tam, negrita) <= limite) return t;
  let corte = t;
  while (corte.length > 1 && ancho(corte + '…', tam, negrita) > limite) corte = corte.slice(0, -1);
  return corte + '…';
}

/* ── medidas de un JPEG, para no deformar la foto ── */

function medidasJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marca = bytes[i + 1];
    if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue; }
    const largo = (bytes[i + 2] << 8) | bytes[i + 3];
    const esSOF = marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc;
    if (esSOF) {
      return {
        alto: (bytes[i + 5] << 8) | bytes[i + 6],
        ancho: (bytes[i + 7] << 8) | bytes[i + 8],
        componentes: bytes[i + 9],
      };
    }
    i += 2 + largo;
  }
  return null;
}

/* ── armador del archivo ── */

class Documento {
  constructor() {
    this.partes = [];
    this.largo = 0;
    this.objetos = [];   // posición de cada objeto en el archivo
  }
  crudo(txt) { const b = enc.encode(txt); this.partes.push(b); this.largo += b.length; }
  bytes(b) { this.partes.push(b); this.largo += b.length; }
  abre(num) { this.objetos[num] = this.largo; this.crudo(`${num} 0 obj\n`); }
  cierra() { this.crudo('endobj\n'); }
  junta() {
    const todo = new Uint8Array(this.largo);
    let i = 0;
    for (const p of this.partes) { todo.set(p, i); i += p.length; }
    return todo;
  }
}

/* ── dibujo de una ficha ── */

const g = (n) => (Math.round(n * 100) / 100).toString();

class Hoja {
  constructor() { this.ops = []; }
  texto(x, y, txt, { tam = 10, negrita = false, color = TINTA } = {}) {
    if (txt === '' || txt === null || txt === undefined) return;
    this.ops.push(
      `BT /${negrita ? 'FB' : 'FR'} ${g(tam)} Tf ${g(color[0])} ${g(color[1])} ${g(color[2])} rg ` +
      `1 0 0 1 ${g(x)} ${g(y)} Tm ${cadena(txt)} Tj ET`
    );
  }
  linea(x1, y1, x2, y2, color = LINEA, grosor = 0.7) {
    this.ops.push(`${g(color[0])} ${g(color[1])} ${g(color[2])} RG ${g(grosor)} w ${g(x1)} ${g(y1)} m ${g(x2)} ${g(y2)} l S`);
  }
  caja(x, y, an, al, color = LINEA) {
    this.ops.push(`${g(color[0])} ${g(color[1])} ${g(color[2])} RG 0.7 w ${g(x)} ${g(y)} ${g(an)} ${g(al)} re S`);
  }
  relleno(x, y, an, al, color) {
    this.ops.push(`${g(color[0])} ${g(color[1])} ${g(color[2])} rg ${g(x)} ${g(y)} ${g(an)} ${g(al)} re f`);
  }
  imagen(nombre, x, y, an, al) {
    this.ops.push(`q ${g(an)} 0 0 ${g(al)} ${g(x)} ${g(y)} cm /${nombre} Do Q`);
  }
  get contenido() { return this.ops.join('\n'); }
}

// Qué se puede meter en la ficha. El panel pinta una palomita por renglón de
// esta lista y manda los ids que quedaron prendidos: casi nunca hace falta
// entregar todo, muchas veces basta el nombre y el NSS. El nombre, el folio y
// el sello del expediente van siempre: sin ellos la hoja no identifica a nadie.
export const CAMPOS_FICHA = [
  { id: 'foto',       nombre: 'Fotografía' },
  { id: 'puesto',     nombre: 'Puesto' },
  { id: 'curp',       nombre: 'CURP' },
  { id: 'nss',        nombre: 'NSS' },
  { id: 'rfc',        nombre: 'RFC' },
  { id: 'celular',    nombre: 'Celular' },
  { id: 'email',      nombre: 'Correo' },
  { id: 'emergencia', nombre: 'Contacto de emergencia' },
  { id: 'banco',      nombre: 'Banco, CLABE y beneficiario', delicado: true },
];

// Sin decir nada, la ficha va completa menos los datos bancarios: esos solo si
// se piden a propósito, para que una ficha que se manda por WhatsApp no lleve
// la cuenta de nadie sin querer.
export const CAMPOS_POR_DEFECTO = CAMPOS_FICHA.filter((c) => !c.delicado).map((c) => c.id);

const NADA = '—';
const dato = (v) => { const t = String(v ?? '').trim(); return t || NADA; };

function nombreCompleto(t) {
  return [t.apellido_paterno, t.apellido_materno, t.nombre].map((x) => String(x || '').trim()).filter(Boolean).join(' ') || 'Sin nombre';
}

// Dibuja una ficha completa y devuelve la hoja lista.
function dibujaFicha(t, opciones) {
  const { empresa, campos, foto, fecha } = opciones;
  const quiere = (id) => campos.has(id);
  const conBanco = quiere('banco');
  const h = new Hoja();
  const izq = MARGEN;
  const der = A4.ancho - MARGEN;
  const anchoUtil = der - izq;

  // Encabezado
  h.relleno(0, A4.alto - 96, A4.ancho, 96, [0.976, 0.98, 0.984]);
  h.relleno(0, A4.alto - 100, A4.ancho, 4, AZUL);
  h.texto(izq, A4.alto - 46, empresa.toUpperCase(), { tam: 17, negrita: true, color: AZUL });
  h.texto(izq, A4.alto - 64, 'Ficha de trabajador', { tam: 11.5, color: TENUE });
  const folio = t.folio ? `Folio ${t.folio}` : '';
  if (folio) h.texto(der - ancho(folio, 10, true), A4.alto - 46, folio, { tam: 10, negrita: true, color: TENUE });
  const sello = t.estado === 'completo' ? 'Expediente completo' : 'Expediente con pendientes';
  h.texto(der - ancho(sello, 9), A4.alto - 64, sello, { tam: 9, color: TENUE });

  // Nombre y foto
  let y = A4.alto - 140;
  const conFoto = quiere('foto');
  const cajaFoto = { an: 108, al: 132 };
  const xFoto = der - cajaFoto.an;
  // Sin fotografía, el nombre se lleva todo el ancho de la hoja.
  const anchoNombre = conFoto ? anchoUtil - cajaFoto.an - 20 : anchoUtil;

  h.texto(izq, y, recorta(nombreCompleto(t), 20, anchoNombre, true), { tam: 20, negrita: true });
  y -= 18;
  if (quiere('puesto') && String(t.puesto || '').trim()) {
    h.texto(izq, y, recorta(t.puesto, 11, anchoNombre), { tam: 11, color: TENUE });
    y -= 16;
  }

  const yFoto = A4.alto - 140 - cajaFoto.al + 14;
  if (!conFoto) {
    // nada que dibujar: la hoja sigue desde donde quedó el nombre
  } else if (foto && foto.medidas) {
    // Se encaja dentro del recuadro sin deformar
    const escala = Math.min(cajaFoto.an / foto.medidas.ancho, cajaFoto.al / foto.medidas.alto);
    const an = foto.medidas.ancho * escala;
    const al = foto.medidas.alto * escala;
    h.imagen(foto.nombre, xFoto + (cajaFoto.an - an) / 2, yFoto + (cajaFoto.al - al) / 2, an, al);
  } else {
    h.caja(xFoto, yFoto, cajaFoto.an, cajaFoto.al);
    const aviso = foto === null ? 'Sin foto' : 'Foto no legible aquí';
    h.texto(xFoto + (cajaFoto.an - ancho(aviso, 9)) / 2, yFoto + cajaFoto.al / 2, aviso, { tam: 9, color: TENUE });
  }

  y = (conFoto ? Math.min(y, yFoto) : y) - 26;

  // Secciones de datos, en dos columnas
  const colAncho = (anchoUtil - 24) / 2;
  const col2 = izq + colAncho + 24;

  const seccion = (titulo) => {
    y -= 12;                        // aire antes de cada bloque, para que se lea de un vistazo
    h.texto(izq, y, titulo.toUpperCase(), { tam: 8.5, negrita: true, color: AZUL });
    y -= 7;
    h.linea(izq, y, der, y, [0.78, 0.80, 0.82], 0.8);
    y -= 19;
  };

  const par = (a, b) => {
    const alto = 34;
    const pinta = (campo, x) => {
      if (!campo) return;
      h.texto(x, y, campo[0].toUpperCase(), { tam: 7.5, color: TENUE });
      h.texto(x, y - 13, recorta(dato(campo[1]), 11, colAncho, campo[2]), { tam: 11, negrita: !!campo[2] });
    };
    pinta(a, izq);
    pinta(b, col2);
    y -= alto;
  };

  // Cada bloque se dibuja solo si quedó algo que poner en él: pidiendo nada más
  // el NSS sale una hoja con el nombre y el NSS, no una llena de encabezados
  // vacíos. Los renglones se acomodan de dos en dos, como estaban.
  const bloque = (titulo, ...renglones) => {
    const hay = renglones.filter(Boolean);
    if (!hay.length) return;
    seccion(titulo);
    for (let i = 0; i < hay.length; i += 2) par(hay[i], hay[i + 1] || null);
  };

  bloque('Identificación',
    quiere('curp') && ['CURP', t.curp, true],
    quiere('nss') && ['NSS', t.nss, true],
    quiere('rfc') && ['RFC', t.rfc, true]);

  bloque('Contacto',
    quiere('celular') && ['Celular', t.celular, true],
    quiere('email') && ['Correo', t.email]);

  if (conBanco) {
    bloque('Datos bancarios',
      ['Banco', t.banco],
      ['CLABE', t.clabe, true],
      ['Beneficiario', t.beneficiario]);
  }

  if (quiere('emergencia')) {
    bloque('Contacto de emergencia',
      ['Nombre', t.emerg_nombre],
      ['Parentesco', t.emerg_parentesco],
      ['Teléfono', t.emerg_telefono, true],
      String(t.emerg_email || '').trim() ? ['Correo', t.emerg_email] : null);
  }

  // Pie
  const pieY = 46;
  h.linea(izq, pieY + 22, der, pieY + 22);
  h.texto(izq, pieY + 8, `${empresa} · Ficha generada el ${fecha}`, { tam: 8, color: TENUE });
  const nota = conBanco
    ? 'Contiene datos personales y bancarios. Trátala conforme al aviso de privacidad.'
    : 'Contiene datos personales. Trátala conforme al aviso de privacidad.';
  h.texto(der - ancho(nota, 8), pieY + 8, nota, { tam: 8, color: TENUE });

  return h;
}

/* ── el PDF completo ── */

export function armaFichas(trabajadores, opciones = {}) {
  const empresa = opciones.empresa || 'la empresa';
  const fecha = opciones.fecha || new Date().toISOString().slice(0, 10);
  // Sin lista de campos, la ficha sale como salía siempre.
  const campos = new Set(opciones.campos || CAMPOS_POR_DEFECTO);

  const doc = new Documento();
  doc.crudo('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // 1 catálogo, 2 páginas, 3 y 4 tipografías; de ahí en adelante, por hoja.
  const IDS = { catalogo: 1, paginas: 2, regular: 3, negrita: 4 };
  let siguiente = 5;

  // La fotografía se pega como un objeto del PDF. Los demás documentos no van
  // aquí: se entregan aparte, en el ZIP, cada uno en su archivo.
  const apartaImagen = (bytes) => {
    const medidas = medidasJpeg(bytes);
    if (!medidas) return null;
    const recurso = { nombre: `Im${siguiente}`, id: siguiente++, bytes, medidas };
    return recurso;
  };

  const hojas = [];
  for (const t of trabajadores) {
    const foto = t.__foto || null;
    const recurso = foto && foto.bytes ? apartaImagen(foto.bytes) : null;
    const contenido = dibujaFicha(t, {
      empresa, campos, fecha,
      foto: recurso ? { nombre: recurso.nombre, medidas: recurso.medidas } : (foto ? undefined : null),
    }).contenido;
    hojas.push({ pagina: siguiente++, flujo: siguiente++, contenido, recursos: recurso ? [recurso] : [] });

  }

  doc.abre(IDS.catalogo);
  doc.crudo(`<< /Type /Catalog /Pages ${IDS.paginas} 0 R >>\n`);
  doc.cierra();

  doc.abre(IDS.paginas);
  doc.crudo(`<< /Type /Pages /Count ${hojas.length} /Kids [${hojas.map((h) => `${h.pagina} 0 R`).join(' ')}] >>\n`);
  doc.cierra();

  doc.abre(IDS.regular);
  doc.crudo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n');
  doc.cierra();

  doc.abre(IDS.negrita);
  doc.crudo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n');
  doc.cierra();

  for (const h of hojas) {
    const xobj = h.recursos.length
      ? ` /XObject << ${h.recursos.map((r) => `/${r.nombre} ${r.id} 0 R`).join(' ')} >>`
      : '';
    doc.abre(h.pagina);
    doc.crudo(
      `<< /Type /Page /Parent ${IDS.paginas} 0 R /MediaBox [0 0 ${g(A4.ancho)} ${g(A4.alto)}] ` +
      `/Resources << /Font << /FR ${IDS.regular} 0 R /FB ${IDS.negrita} 0 R >>${xobj} >> ` +
      `/Contents ${h.flujo} 0 R >>\n`
    );
    doc.cierra();

    const cuerpo = enc.encode(h.contenido);
    doc.abre(h.flujo);
    doc.crudo(`<< /Length ${cuerpo.length} >>\nstream\n`);
    doc.bytes(cuerpo);
    doc.crudo('\nendstream\n');
    doc.cierra();

    for (const { medidas, bytes, id } of h.recursos) {
      const espacio = medidas.componentes === 1 ? '/DeviceGray' : medidas.componentes === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      doc.abre(id);
      doc.crudo(
        `<< /Type /XObject /Subtype /Image /Width ${medidas.ancho} /Height ${medidas.alto} ` +
        `/ColorSpace ${espacio} /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`
      );
      doc.bytes(bytes);
      doc.crudo('\nendstream\n');
      doc.cierra();
    }
  }

  // Tabla de referencias
  const total = siguiente;
  const inicioXref = doc.largo;
  doc.crudo(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) {
    const pos = doc.objetos[i] ?? 0;
    doc.crudo(`${String(pos).padStart(10, '0')} 00000 n \n`);
  }
  doc.crudo(`trailer\n<< /Size ${total} /Root ${IDS.catalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);

  return doc.junta();
}

export function nombreArchivoFichas(trabajadores, fecha, extension = 'pdf', empresa = 'Fichas') {
  if (trabajadores.length === 1) {
    const limpio = nombreCompleto(trabajadores[0]).replace(/[\\/:*?"<>|]/g, '').trim();
    return `Ficha ${limpio}.${extension}`;
  }
  return `Fichas ${empresa} ${fecha} (${trabajadores.length}).${extension}`;
}

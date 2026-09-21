/* El .xlsx que armamos a mano · Mike, 21-sep: «un excel».
 *
 * Vive en la API y no en dash101 porque el archivo lo bajan DOS
 * aplicaciones —dash101 y peek101— y el armador es uno solo.
 *
 * Un archivo de Excel mal armado no avisa: abre con «el archivo está
 * dañado» y no dice dónde. Por eso esto se mide por dentro —se abre el ZIP
 * y se revisa la tabla, la suma de comprobación y el XML— y no comprobando
 * que la descarga «no truena».
 *
 * LO QUE DE VERDAD APORTA:
 *
 *   · el CRC32, contra el valor canónico del estándar. Es la pieza que
 *     Excel usa para decidir si el archivo está íntegro, y la única aquí
 *     que se puede equivocar en silencio;
 *   · que el ZIP esté BIEN ARMADO: los desplazamientos del directorio
 *     central tienen que apuntar exactamente al inicio de cada entrada, o
 *     el archivo abre vacío;
 *   · las letras de columna más allá de la Z. Una columna mal nombrada corre
 *     todos los datos un lugar, y el error aparece en la columna 27;
 *   · que los números viajen como NÚMEROS y los textos como texto. Si un
 *     importe llega como cadena, la suma de Excel da cero y quien lo abra
 *     va a creer que no le deben nada;
 *   · que un «&» o un «<» en el nombre de un ítem no rompan el XML. Los
 *     nombres de obra los teclea gente, y ahí hay de todo.
 */

import { describe, expect, it } from "vitest";
import { columna, crc32, xlsx } from '../src/xlsx';

/** Abre el ZIP leyendo el directorio central, como haría Excel. */
function abrir(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // El fin del directorio central: su firma, buscada desde atrás.
  let fin = bytes.length - 22;
  while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin--;
  expect(fin, "el archivo trae su fin de directorio central").toBeGreaterThanOrEqual(0);

  const cuantos = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const partes: Record<string, string> = {};
  const texto = new TextDecoder();

  for (let i = 0; i < cuantos; i++) {
    expect(v.getUint32(p, true), "cada renglón del directorio trae su firma").toBe(0x02014b50);
    const suma = v.getUint32(p + 16, true);
    const tam = v.getUint32(p + 24, true);
    const largoNombre = v.getUint16(p + 28, true);
    const donde = v.getUint32(p + 42, true);
    const nombre = texto.decode(bytes.subarray(p + 46, p + 46 + largoNombre));

    // Y ahora por el lado del archivo: la entrada local tiene que estar justo ahí.
    expect(v.getUint32(donde, true), `${nombre} empieza donde dice el directorio`).toBe(0x04034b50);
    const nombreLocal = v.getUint16(donde + 26, true);
    const extraLocal = v.getUint16(donde + 28, true);
    const inicio = donde + 30 + nombreLocal + extraLocal;
    const datos = bytes.subarray(inicio, inicio + tam);
    expect(crc32(datos), `${nombre} cuadra con su suma de comprobación`).toBe(suma);

    partes[nombre] = texto.decode(datos);
    p += 46 + largoNombre + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return partes;
}

describe("las piezas", () => {
  it("el CRC32 da el valor canónico del estándar", () => {
    // «123456789» → 0xCBF43926. Es la prueba con la que se comprueba
    // cualquier implementación de CRC-32; si ésta falla, todo lo demás
    // parece bien y Excel dice que el archivo está dañado.
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0)), "y el vacío es cero").toBe(0);
  });

  it("las columnas siguen contando después de la Z", () => {
    expect(columna(0)).toBe("A");
    expect(columna(25)).toBe("Z");
    expect(columna(26)).toBe("AA");
    expect(columna(27)).toBe("AB");
    expect(columna(51)).toBe("AZ");
    expect(columna(52)).toBe("BA");
    expect(columna(701)).toBe("ZZ");
    expect(columna(702)).toBe("AAA");
  });
});

describe("el libro", () => {
  it("trae las cuatro piezas del formato y una hoja por pestaña", () => {
    const partes = abrir(xlsx([
      { nombre: "Ítems", filas: [["Concepto"], ["Puerta"]] },
      { nombre: "Pagos", filas: [["Fecha"], ["2026-03-01"]] },
    ]));
    for (const p of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
                     "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
      expect(Object.keys(partes), `falta ${p}`).toContain(p);
    }
    expect(partes["xl/workbook.xml"]).toContain('name="Ítems"');
    expect(partes["xl/workbook.xml"]).toContain('name="Pagos"');
  });

  it("los números van como números y los textos como texto", () => {
    const partes = abrir(xlsx([{ nombre: "H", filas: [["Puerta", 2850, 25]] }]));
    const hoja = partes["xl/worksheets/sheet1.xml"];
    expect(hoja, "el importe es un número, no una cadena").toContain('<c r="B1"><v>2850</v></c>');
    expect(hoja).toContain('<c r="C1"><v>25</v></c>');
    expect(hoja).toContain('t="inlineStr"');
    expect(hoja).toContain("<t xml:space=\"preserve\">Puerta</t>");
  });

  it("un «&» y un «<» en el nombre no rompen el archivo", () => {
    const partes = abrir(xlsx([{ nombre: "H", filas: [["Puerta A & B <chica>"]] }]));
    const hoja = partes["xl/worksheets/sheet1.xml"];
    expect(hoja).toContain("Puerta A &amp; B &lt;chica&gt;");
    expect(hoja).not.toContain("B <chica>");
  });

  it("una celda vacía no escribe celda, y eso no corre las de al lado", () => {
    const partes = abrir(xlsx([{ nombre: "H", filas: [["A", null, "C"]] }]));
    const hoja = partes["xl/worksheets/sheet1.xml"];
    expect(hoja).not.toContain('r="B1"');
    expect(hoja, "la tercera sigue siendo la C").toContain('r="C1"');
  });

  it("el nombre de la pestaña se limpia de lo que Excel no acepta", () => {
    const partes = abrir(xlsx([{ nombre: "Obra/2026 [HOLCIM]: pagos y más de treinta y un caracteres", filas: [["x"]] }]));
    const nombre = /name="([^"]*)"/.exec(partes["xl/workbook.xml"])![1];
    expect(nombre.length).toBeLessThanOrEqual(31);
    expect(nombre).not.toMatch(/[\\/?*[\]:]/);
  });

  it("aguanta una obra grande sin despeinarse", () => {
    /* 500 renglones es una obra como la de Mike. Lo que se mide no es la
     * velocidad: es que el directorio central siga cuadrando cuando los
     * desplazamientos ya no caben en dos dígitos. */
    const filas = Array.from({ length: 500 }, (_, i) => [`Pieza ${i}`, i * 100, i]);
    const partes = abrir(xlsx([{ nombre: "Ítems", filas }]));
    expect(partes["xl/worksheets/sheet1.xml"]).toContain('r="A500"');
  });
});

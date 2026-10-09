/* Leer el XML de una factura · contrato 0.85.0 (bill101).
 *
 * `src/cfdi-xml.ts` es por donde entra toda factura que nadie tecleó. Si lee
 * mal un importe, ese error llega derecho al IVA del mes sin que nada truene.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que el dinero salga AL CENTAVO y sin pasar por un flotante, también
 *     cuando la factura viene en dólares;
 *   · que el IVA sea el que declara el comprobante y no la suma de los
 *     conceptos, y que no se revuelva con el IEPS ni con las retenciones;
 *   · que el complemento de pago diga qué factura se pagó, qué día y cuánto;
 *   · que lo que NO es una factura —un XML cualquiera, uno sin timbre, uno
 *     de 2012— se rechace con un motivo que se pueda leer, en vez de entrar
 *     en ceros;
 *   · que un XML hecho para abusar (entidades propias, etiquetas cruzadas)
 *     no pase.
 */

import { describe, expect, it } from 'vitest';
import { aCentavos, esFallaXml, leerCfdi, type CfdiLeido } from '../src/cfdi-xml';
import { RFC_CLIENTE, RFC_EMPRESA, RFC_PROVEEDOR, uuidDe, xmlCfdi } from './cfdi-de-prueba';

const leer = (xml: string): CfdiLeido => {
  const r = leerCfdi(xml);
  if (esFallaXml(r)) throw new Error(`no se leyó: ${JSON.stringify(r)}`);
  return r;
};
const falla = (xml: string): string => {
  const r = leerCfdi(xml);
  return esFallaXml(r) ? r.error : 'se_leyo';
};

describe('el dinero de un XML', () => {
  it('va a centavos sin perder ninguno', () => {
    expect(aCentavos('1160.00')).toBe(116000);
    expect(aCentavos('0.10')).toBe(10);
    expect(aCentavos('1234567.89')).toBe(123456789);
    expect(aCentavos('19.999999')).toBe(2000);
    // 0.1 + 0.2 en flotante da 0.30000000000000004; aquí no hay flotante.
    expect(aCentavos('0.1') + aCentavos('0.2')).toBe(30);
  });

  it('el medio centavo sube, y lo de menos se queda', () => {
    expect(aCentavos('0.005')).toBe(1);
    expect(aCentavos('10.004')).toBe(1000);
    expect(aCentavos('10.005')).toBe(1001);
    expect(aCentavos('-10.005')).toBe(-1001);
  });

  it('con tipo de cambio, primero se multiplica', () => {
    expect(aCentavos('100.00', '18.5432')).toBe(185432);
    expect(aCentavos('1.00', '17.123456')).toBe(1712);
    expect(aCentavos('333.33', '19.999999')).toBe(666660);
  });

  it('lo que no es un número vale cero, no truena', () => {
    expect(aCentavos(undefined)).toBe(0);
    expect(aCentavos('')).toBe(0);
    expect(aCentavos('mil')).toBe(0);
  });
});

describe('una factura normal (ingreso, 4.0)', () => {
  const f = leer(xmlCfdi({
    uuid: uuidDe(1), emisor: { rfc: RFC_EMPRESA, nombre: 'ESCUELA KEMPER URGATE' }, receptor: { rfc: RFC_CLIENTE, nombre: 'UNIVERSIDAD ROBOTICA ESPAÑOLA' },
    fecha: '2026-03-10', serie: 'A', folio: '120', subtotal: '100000.00', metodo: 'PPD', forma: '99',
    conceptos: [
      { descripcion: 'Cocina integral', cantidad: '2', valor: '40000.00', iva: '12800.00' },
      { descripcion: 'Instalación', valor: '20000.00', iva: '3200.00' },
    ],
  }));

  it('trae quién, cuándo y cuánto', () => {
    expect(f.uuid).toBe(uuidDe(1));
    expect(f.version).toBe('4.0');
    expect(f.tipo_comprobante).toBe('I');
    expect(f.fecha).toBe('2026-03-10');
    expect(f.serie).toBe('A');
    expect(f.folio).toBe('120');
    expect(f.emisor).toEqual({ rfc: RFC_EMPRESA, nombre: 'ESCUELA KEMPER URGATE', regimen: '601' });
    expect(f.receptor.rfc).toBe(RFC_CLIENTE);
    expect(f.receptor.nombre).toBe('UNIVERSIDAD ROBOTICA ESPAÑOLA');
    expect(f.receptor.uso).toBe('G03');
    expect(f.metodo_pago).toBe('PPD');
    expect(f.forma_pago).toBe('99');
    expect(f.moneda).toBe('MXN');
  });

  it('con el dinero en centavos', () => {
    expect(f.subtotal).toBe(100_000_00);
    expect(f.iva).toBe(16_000_00);
    expect(f.total).toBe(116_000_00);
    expect(f.total_original, 'como venía escrito: así lo pide el SAT').toBe('116000.00');
    expect(f.iva_retenido).toBe(0);
    expect(f.isr_retenido).toBe(0);
  });

  it('y sus renglones', () => {
    expect(f.conceptos).toHaveLength(2);
    expect(f.conceptos[0]).toMatchObject({ descripcion: 'Cocina integral', cantidad: '2', valor_unitario: 40_000_00, importe: 80_000_00, iva: 12_800_00 });
    expect(f.conceptos[1]).toMatchObject({ descripcion: 'Instalación', importe: 20_000_00, iva: 3_200_00 });
  });

  it('el sello no se comprueba, pero sus últimos ocho se guardan para el SAT', () => {
    expect(f.sello8).toHaveLength(8);
    expect(f.sello8).toBe('CdEf12==');
  });
});

describe('los impuestos de una factura', () => {
  it('el IVA es el del comprobante, no la suma de los conceptos', () => {
    // Los conceptos dicen 15,999.99 en total; el comprobante declara 16,000.00.
    const f = leer(xmlCfdi({
      uuid: uuidDe(2), emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01',
      subtotal: '100000.00', iva: '16000.00',
      conceptos: [{ descripcion: 'a', valor: '50000.00', iva: '7999.99' }, { descripcion: 'b', valor: '50000.00', iva: '8000.00' }],
    }));
    expect(f.conceptos.reduce((s, k) => s + k.iva, 0)).toBe(15_999_99);
    expect(f.iva).toBe(16_000_00);
  });

  it('el descuento se resta de la base', () => {
    const f = leer(xmlCfdi({ uuid: uuidDe(3), emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01', subtotal: '1000.00', descuento: '100.00' }));
    expect(f.descuento).toBe(100_00);
    expect(f.subtotal, 'la base ya trae el descuento restado').toBe(900_00);
    expect(f.iva).toBe(144_00);
    expect(f.total).toBe(1_044_00);
  });

  it('las retenciones salen separadas: la de IVA y la de ISR son cosas distintas', () => {
    const f = leer(xmlCfdi({
      uuid: uuidDe(4), emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01',
      subtotal: '10000.00', iva_retenido: '1066.67', isr_retenido: '1000.00',
    }));
    expect(f.iva).toBe(1_600_00);
    expect(f.iva_retenido).toBe(1_066_67);
    expect(f.isr_retenido).toBe(1_000_00);
    expect(f.total).toBe(10_000_00 + 1_600_00 - 1_066_67 - 1_000_00);
  });

  it('el IEPS no se cuenta como IVA', () => {
    const f = leer(xmlCfdi({ uuid: uuidDe(5), emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01', subtotal: '1000.00', ieps: '80.00' }));
    expect(f.iva).toBe(160_00);
    expect(f.ieps).toBe(80_00);
  });

  it('una factura sin IVA (tasa 0 o exenta) trae IVA cero', () => {
    const f = leer(xmlCfdi({ uuid: uuidDe(6), emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01', subtotal: '500.00', iva: null }));
    expect(f.iva).toBe(0);
    expect(f.total).toBe(500_00);
  });

  it('en dólares se guarda en pesos, con su tipo de cambio', () => {
    const f = leer(xmlCfdi({
      uuid: uuidDe(7), emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01',
      subtotal: '1000.00', moneda: 'USD', tipo_cambio: '18.5432',
    }));
    expect(f.moneda).toBe('USD');
    expect(f.tipo_cambio).toBe('18.5432');
    expect(f.subtotal).toBe(18_543_20);
    expect(f.iva).toBe(2_966_91);    // 160.00 × 18.5432 = 2966.912
    expect(f.total).toBe(21_510_11); // 1160.00 × 18.5432 = 21510.112
    expect(f.total_original, 'el total en dólares, tal cual: con ése pregunta el SAT').toBe('1160.00');
  });
});

describe('los otros tipos de comprobante', () => {
  it('una nota de crédito es de tipo E y dice a qué factura se refiere', () => {
    const f = leer(xmlCfdi({
      uuid: uuidDe(10), tipo: 'E', emisor: { rfc: RFC_EMPRESA }, receptor: { rfc: RFC_CLIENTE }, fecha: '2026-03-12',
      subtotal: '10000.00', relacionados: { tipo: '01', uuids: [uuidDe(1)] },
    }));
    expect(f.tipo_comprobante).toBe('E');
    expect(f.subtotal).toBe(10_000_00);
    expect(f.relacionados).toEqual([{ tipo_relacion: '01', uuid: uuidDe(1) }]);
  });

  it('un complemento de pago dice qué factura se pagó, qué día y cuánto', () => {
    const f = leer(xmlCfdi({
      uuid: uuidDe(11), tipo: 'P', emisor: { rfc: RFC_EMPRESA }, receptor: { rfc: RFC_CLIENTE }, fecha: '2026-04-02',
      pagos: [
        { fecha: '2026-03-28', monto: '58000.00', doctos: [{ uuid: uuidDe(1), pagado: '58000.00', parcialidad: 1, iva: '8000.00' }] },
        { fecha: '2026-04-01', monto: '70000.00', doctos: [{ uuid: uuidDe(1), pagado: '58000.00', parcialidad: 2 }, { uuid: uuidDe(2), pagado: '12000.00' }] },
      ],
    }));
    expect(f.tipo_comprobante).toBe('P');
    expect(f.total, 'un complemento de pago no es dinero: su total es cero').toBe(0);
    expect(f.subtotal).toBe(0);
    expect(f.pagos).toEqual([
      { fecha: '2026-03-28', uuid_docto: uuidDe(1), parcialidad: 1, pagado: 58_000_00, iva: 8_000_00 },
      { fecha: '2026-04-01', uuid_docto: uuidDe(1), parcialidad: 2, pagado: 58_000_00, iva: null },
      { fecha: '2026-04-01', uuid_docto: uuidDe(2), parcialidad: 1, pagado: 12_000_00, iva: null },
    ]);
  });

  it('en un recibo de nómina, lo que la empresa gastó son las percepciones', () => {
    const f = leer(xmlCfdi({
      uuid: uuidDe(12), tipo: 'N', emisor: { rfc: RFC_EMPRESA }, receptor: { rfc: 'CACX7605101P8' }, fecha: '2026-01-31',
      subtotal: '40000.00', descuento: '6500.00', total: '33500.00', nomina: { percepciones: '40000.00', deducciones: '6500.00' },
    }));
    expect(f.tipo_comprobante).toBe('N');
    expect(f.subtotal, 'no se le resta lo que se le descontó al trabajador').toBe(40_000_00);
    expect(f.total).toBe(33_500_00);
    expect(f.iva).toBe(0);
  });

  it('la versión 3.3 también se lee', () => {
    const f = leer(xmlCfdi({ uuid: uuidDe(13), version: '3.3', emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2021-06-01', subtotal: '100.00' }));
    expect(f.version).toBe('3.3');
    expect(f.total).toBe(116_00);
  });
});

describe('lo que no es una factura no entra', () => {
  const buena = { uuid: uuidDe(20), emisor: { rfc: RFC_PROVEEDOR }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01', subtotal: '100.00' };

  it('vacío, texto cualquiera y XML que no es CFDI', () => {
    expect(falla('')).toBe('xml_vacio');
    expect(falla('   ')).toBe('xml_vacio');
    expect(falla('esto no es un xml')).toBe('xml_ilegible');
    expect(falla('<html><body>Factura</body></html>')).toBe('no_es_cfdi');
  });

  it('un XML sin timbre todavía no es una factura', () => {
    expect(falla(xmlCfdi({ ...buena, sin_timbre: true }))).toBe('sin_timbre');
  });

  it('un folio fiscal que no tiene forma de folio fiscal', () => {
    expect(falla(xmlCfdi({ ...buena, uuid: 'no-es-un-uuid' }))).toBe('uuid_invalido');
  });

  it('una versión que ya no existe (3.2) se dice, no se adivina', () => {
    expect(falla(xmlCfdi({ ...buena, version: '3.2' }))).toBe('version_no_soportada');
  });

  it('etiquetas cruzadas o sin cerrar', () => {
    expect(falla('<cfdi:Comprobante Version="4.0"><cfdi:Emisor></cfdi:Comprobante>')).toBe('xml_ilegible');
    expect(falla('<cfdi:Comprobante Version="4.0"><cfdi:Emisor/>')).toBe('xml_ilegible');
  });

  it('un XML enorme se rechaza antes de leerlo', () => {
    expect(falla(`<!--${'x'.repeat(2_000_001)}-->`)).toBe('xml_muy_grande');
  });

  it('un comentario o un DOCTYPE que abre y nunca cierra se rechaza, y rápido', () => {
    // Con una expresión regular esto era cuadrático: minutos con dos megas.
    const t0 = Date.now();
    expect(falla('<!--'.repeat(400_000))).toBe('xml_ilegible');
    expect(falla('<!DOCTYPE'.repeat(200_000))).toBe('xml_ilegible');
    expect(falla('<?'.repeat(900_000))).toBe('xml_ilegible');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('sin total, o con un total que no es número', () => {
    expect(falla(xmlCfdi(buena).replace(/ Total="[^"]*"/, ' Total="mucho"'))).toBe('total_invalido');
  });
});

describe('lo raro que sí trae un XML de verdad', () => {
  const base = { uuid: uuidDe(30), emisor: { rfc: RFC_PROVEEDOR, nombre: 'MADERAS & TABLEROS "EL ROBLE"' }, receptor: { rfc: RFC_EMPRESA }, fecha: '2026-02-01', subtotal: '100.00' };

  it('los nombres con & y comillas llegan como son', () => {
    expect(leer(xmlCfdi(base)).emisor.nombre).toBe('MADERAS & TABLEROS "EL ROBLE"');
  });

  it('la marca de orden de bytes, los comentarios y los espacios no estorban', () => {
    const xml = `﻿${xmlCfdi(base).replace('<cfdi:Emisor', '<!-- hecho por un PAC -->\n   <cfdi:Emisor')}`;
    expect(leer(xml).uuid).toBe(uuidDe(30));
  });

  it('una adenda con etiquetas propias, acentos y texto adentro no rompe la lectura', () => {
    const f = leer(xmlCfdi({ ...base, adenda: '<Año valor="2026"><Línea núm="1">Entregar en obra <b>antes</b> del viernes</Línea></Año><![CDATA[ <no> es </xml> ]]>' }));
    expect(f.total).toBe(116_00);
  });

  it('los RFC salen en mayúsculas aunque vengan en minúsculas', () => {
    const f = leer(xmlCfdi({ ...base, emisor: { rfc: RFC_PROVEEDOR.toLowerCase() } }));
    expect(f.emisor.rfc).toBe(RFC_PROVEEDOR);
  });

  it('una entidad definida por el propio documento NO se expande', () => {
    // El abuso clásico: una entidad que vale mucho, repetida. Aquí no se
    // procesa el DOCTYPE, así que se queda como el texto que es.
    const xml = xmlCfdi({ ...base, emisor: { rfc: RFC_PROVEEDOR, nombre: 'X' } })
      .replace('<cfdi:Comprobante', '<!DOCTYPE c [<!ENTITY bomba "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">]>\n<cfdi:Comprobante')
      .replace('Nombre="X"', 'Nombre="&bomba;&bomba;"');
    expect(leer(xml).emisor.nombre).toBe('&bomba;&bomba;');
  });
});

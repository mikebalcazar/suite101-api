/* bill101 — el PDF propio (0.89.0): lo que se puede comprobar sin mirar el
 * dibujo: el total con letra como lo pone el SAT, la liga del QR, la cadena
 * original del timbre, y que de un XML y de un borrador salga un PDF con
 * lo que una representación impresa tiene que llevar.
 */
import { describe, expect, it } from 'vitest';
import { armarPdf, cadenaOriginal, impresaDeBorrador, impresaDeXml, ligaSat, totalEnLetras } from '../src/pdf-cfdi';
import { extrasImpresa, leerCfdi } from '../src/cfdi-xml';
import { xmlCfdi, RFC_CLIENTE, RFC_EMPRESA } from './cfdi-de-prueba';

const P = (pesos: number) => Math.round(pesos * 100);

describe('el total con letra', () => {
  it('como lo escribe el SAT', () => {
    expect(totalEnLetras(P(1_160))).toBe('UN MIL CIENTO SESENTA PESOS 00/100 M.N.');
    expect(totalEnLetras(P(1))).toBe('UN PESO 00/100 M.N.');
    expect(totalEnLetras(P(0.5))).toBe('CERO PESOS 50/100 M.N.');
    expect(totalEnLetras(P(21_000.5))).toBe('VEINTIUN MIL PESOS 50/100 M.N.');
    expect(totalEnLetras(P(100))).toBe('CIEN PESOS 00/100 M.N.');
    expect(totalEnLetras(P(101_732))).toBe('CIENTO UN MIL SETECIENTOS TREINTA Y DOS PESOS 00/100 M.N.');
    expect(totalEnLetras(P(1_000_000))).toBe('UN MILLON DE PESOS 00/100 M.N.');
    expect(totalEnLetras(P(2_500_000.99))).toBe('DOS MILLONES QUINIENTOS MIL PESOS 99/100 M.N.');
    expect(totalEnLetras(P(15.25), 'USD')).toBe('QUINCE DOLARES 25/100 USD');
  });
});

describe('el timbre', () => {
  const t = { uuid: 'AAAAAAAA-0000-4000-8000-000000000001', fecha_timbrado: '2026-10-09T10:16:02', no_certificado: '3000', no_certificado_sat: '30001000000500003456', sello: 'abcdefghijklmnopqrstuvwxyz0123456789==', sello_sat: 'SAT==', rfc_prov_certif: 'SPR190613I52', total_original: '1160.00' };
  it('la liga del QR como la pide el Anexo 20', () => {
    expect(ligaSat({ uuid: t.uuid, rfc_emisor: RFC_EMPRESA, rfc_receptor: RFC_CLIENTE, total_original: t.total_original, sello: t.sello }))
      .toBe(`https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${t.uuid}&re=${RFC_EMPRESA}&rr=${RFC_CLIENTE}&tt=1160.000000&fe=456789==`);
  });
  it('la cadena original del complemento (TFD 1.1)', () => {
    expect(cadenaOriginal(t)).toBe(`||1.1|${t.uuid}|2026-10-09T10:16:02|SPR190613I52|${t.sello}|30001000000500003456||`);
  });
});

describe('de un XML y de un borrador sale un PDF', () => {
  const empresa = { nombre: 'Taller de prueba', rfc: RFC_EMPRESA, regimen: '601', direccion: 'Calle 1, Monterrey', telefono: null, correo: null, sitio_web: null, logo: null };
  const config = { banco: 'BBVA', clabe: '012180001234567890', cuenta: null, beneficiario: 'Taller de prueba S.A. de C.V.', leyenda: 'Gracias.' };

  it('del XML timbrado: con folio fiscal, sellos y QR', async () => {
    const xml = xmlCfdi({ uuid: 'AAAAAAAA-0000-4000-8000-000000000002', serie: 'A', folio: '7', emisor: { rfc: RFC_EMPRESA, nombre: 'TALLER DE PRUEBA' }, receptor: { rfc: RFC_CLIENTE, nombre: 'UNIVERSIDAD ROBOTICA' }, fecha: '2026-10-09', subtotal: '1000.00', conceptos: [{ descripcion: 'Mesa de encino con acentos: ñ á é', valor: 1000, iva: 160 }] } as any);
    const leida = leerCfdi(xml);
    if ('error' in leida) throw new Error(leida.error);
    const ex = extrasImpresa(xml)!;
    expect(ex).toMatchObject({ lugar_expedicion: '64000', no_certificado: '30001000000500003416', sello: expect.stringContaining('RELLENO'), fecha_timbrado: expect.stringMatching(/^2026-10-09T/) });
    const imp = impresaDeXml(leida, ex);
    expect(imp).toMatchObject({ serie: 'A', folio: '7', subtotal: P(1000), iva: P(160), total: P(1160), timbre: { uuid: 'AAAAAAAA-0000-4000-8000-000000000002', no_certificado: '30001000000500003416' } });
    expect(imp.renglones[0]).toMatchObject({ descripcion: 'Mesa de encino con acentos: ñ á é', importe: P(1000), iva: P(160), tasa_iva: '0.160000', objeto_imp: '02' });
    const pdf = await armarPdf({ impresa: imp, empresa, config });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(6000);
  });

  it('del borrador: vista previa, sin timbre, con las mismas cuentas que van a Facturama', async () => {
    const b = { receptor: { rfc: 'XAXX010101000', razon_social: '', regimen_fiscal: '', cp_fiscal: '', uso_cfdi: 'G03' }, forma_pago: '03', renglones: [
      { descripcion: 'Cocina', clave_prod_serv: '56101500', clave_unidad: 'E48', unidad: 'Unidad de servicio', cantidad: 1, precio_unitario: P(85_000), descuento: P(5_000), iva: 16 },
      { descripcion: 'Flete', clave_prod_serv: '78101800', clave_unidad: 'E48', unidad: null, cantidad: 1, precio_unitario: P(1_500), descuento: 0, iva: null },
    ] };
    const imp = impresaDeBorrador(b, { serie: 'A', folio: 8, fecha: '2026-10-09T11:02:00', lugar_expedicion: '10900', emisor: { rfc: RFC_EMPRESA, nombre: 'Taller de prueba', regimen: '601' } });
    expect(imp.timbre).toBeNull();
    expect(imp.receptor).toMatchObject({ rfc: 'XAXX010101000', nombre: 'PUBLICO EN GENERAL', regimen: '616', uso: 'S01', cp: '10900' });
    expect(imp).toMatchObject({ subtotal: P(86_500), descuento: P(5_000), iva: P(12_800), total: P(94_300) });
    expect(imp.renglones[1]).toMatchObject({ tasa_iva: null, objeto_imp: '01', iva: 0 });
    const pdf = await armarPdf({ impresa: imp, empresa, config, vista_previa: true });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    // Un renglón con cien renglones de descripción y un emoji no truena: se parte y se limpia.
    const largo = { ...b, renglones: Array.from({ length: 60 }, (_, i) => ({ ...b.renglones[0], descripcion: `Renglón ${i} 🙂 ${'palabra '.repeat(40)}` })) };
    const imp2 = impresaDeBorrador(largo, { serie: 'A', folio: null, fecha: '2026-10-09T11:02:00', lugar_expedicion: '10900', emisor: { rfc: RFC_EMPRESA, nombre: 'Taller', regimen: null } });
    const pdf2 = await armarPdf({ impresa: imp2, empresa: { ...empresa, logo: { bytes: new Uint8Array([1, 2, 3]), tipo: 'image/png' } }, config, vista_previa: true });
    expect(pdf2.length, 'varias páginas').toBeGreaterThan(pdf.length * 3);
  });
});

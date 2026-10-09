/* bill101 fase D — la FIEL y los sobres para el SAT, sin red y sin base.
 *
 * LA PRUEBA QUE IMPORTA. Los cinco sobres de `pruebas/datos/sat/` son los de
 * ejemplo de la biblioteca de referencia (phpcfdi/sat-ws-descarga-masiva,
 * commit 91521b4, licencia MIT), hechos con la FIEL de prueba que publica el
 * SAT. Aquí se arma cada uno con el código de bill101 y la misma FIEL y se
 * exige que salga IGUAL, firma incluida. La firma RSA es determinista: si
 * una letra de lo firmado, la huella o la llave fueran distintas, la firma
 * no coincidiría. Es lo más cerca que se puede estar del SAT sin una FIEL de
 * verdad, que por regla no pasa por un chat ni por una prueba.
 */
import { describe, expect, it } from 'vitest';
import { abrirFiel, cifrarLlave, descifrarLlave, esFallaFiel, firmante, leerCertificado, type FielAbierta } from '../src/fiel';
import {
  leerAutenticar, leerDescargar, leerFalla, leerLista, leerSolicitar, leerVerificar,
  sobreAutenticar, sobreDescargar, sobreSolicitar, sobreSolicitud, sobreVerificar, type Firma,
} from '../src/sat-masiva';
import { FIEL_CER_B64, FIEL_CLAVE, FIEL_KEY_B64, FIEL_RFC, SELLO_CER_B64, SELLO_KEY_B64 } from './fiel-de-prueba';
import refAutenticar from './datos/sat/autenticar.xml?raw';
import refRecibidas from './datos/sat/solicitar-recibidas.xml?raw';
import refEmitidas from './datos/sat/solicitar-emitidas.xml?raw';
import refVerificar from './datos/sat/verificar.xml?raw';
import refDescargar from './datos/sat/descargar.xml?raw';
import refLista from './datos/sat/metadata.txt?raw';

const bytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const HOY = new Date('2026-10-08T12:00:00Z');

/** Quita lo que no es contenido: la declaración, el sangrado, y la
 *  diferencia entre `<a></a>` y `<a/>`, que para XML son lo mismo. */
const plano = (xml: string): string =>
  xml.replace(/<\?xml[^>]*\?>/, '').replace(/>\s+/g, '>').replace(/\s+</g, '<').replace(/<([\w:]+)([^<>]*?)><\/\1>/g, '<$1$2/>').trim();

async function fiel(): Promise<FielAbierta> {
  const f = await abrirFiel(bytes(FIEL_CER_B64), bytes(FIEL_KEY_B64), FIEL_CLAVE, HOY);
  if (esFallaFiel(f)) throw new Error(JSON.stringify(f));
  return f;
}
async function firma(): Promise<Firma> {
  const f = await fiel();
  return { fiel: f, firmar: await firmante(f.pkcs8) };
}

describe('la FIEL', () => {
  it('se abre con su contraseña y dice de quién es', async () => {
    const f = await fiel();
    expect(f.rfc).toBe(FIEL_RFC);
    expect(f.nombre).toBe('ESCUELA KEMPER URGATE SA DE CV');
    expect(f.serie).toBe('30001000000500003415');
    expect(f.serie_decimal).toBe('292233162870206001759766198462772978647764840757');
    expect(f.vence).toBe('2027-05-17T04:37:14.000Z');
    expect(f.pkcs8.length).toBeGreaterThan(1000);
  });

  it('con otra contraseña no abre, y no dice más que eso', async () => {
    const r = await abrirFiel(bytes(FIEL_CER_B64), bytes(FIEL_KEY_B64), 'otra', HOY);
    expect(r).toMatchObject({ error: 'fiel_clave_incorrecta' });
    expect(JSON.stringify(r)).not.toContain('otra');
    expect(await abrirFiel(bytes(FIEL_CER_B64), bytes(FIEL_KEY_B64), '', HOY)).toMatchObject({ error: 'fiel_clave_incorrecta' });
  });

  it('un sello (CSD) no es una FIEL', async () => {
    expect(await abrirFiel(bytes(SELLO_CER_B64), bytes(SELLO_KEY_B64), FIEL_CLAVE, HOY)).toMatchObject({ error: 'fiel_es_sello' });
  });

  it('la llave de otro certificado no casa', async () => {
    // El certificado de la FIEL con la llave del sello: los dos abren, no son pareja.
    expect(await abrirFiel(bytes(FIEL_CER_B64), bytes(SELLO_KEY_B64), FIEL_CLAVE, HOY)).toMatchObject({ error: 'fiel_no_casan' });
  });

  it('vencida no entra', async () => {
    expect(leerCertificado(bytes(FIEL_CER_B64), new Date('2027-05-18T00:00:00Z'))).toMatchObject({ error: 'fiel_vencida' });
    expect(leerCertificado(bytes(FIEL_CER_B64), new Date('2020-01-01T00:00:00Z'))).toMatchObject({ error: 'fiel_aun_no_vale' });
  });

  it('lo que no es un certificado o una llave se dice', async () => {
    expect(leerCertificado(new TextEncoder().encode('hola'))).toMatchObject({ error: 'fiel_cer_ilegible' });
    expect(leerCertificado(new Uint8Array(0))).toMatchObject({ error: 'fiel_cer_ilegible' });
    expect(leerCertificado(new Uint8Array(20_000))).toMatchObject({ error: 'fiel_cer_ilegible' });
    expect(await abrirFiel(bytes(FIEL_CER_B64), new TextEncoder().encode('hola'), FIEL_CLAVE, HOY)).toMatchObject({ error: 'fiel_clave_incorrecta' });
    expect(await abrirFiel(bytes(FIEL_CER_B64), new Uint8Array(0), FIEL_CLAVE, HOY)).toMatchObject({ error: 'fiel_key_ilegible' });
  });

  it('la llave cifrada sólo abre con el mismo secreto, la misma empresa y el mismo RFC', async () => {
    const f = await fiel();
    const c = await cifrarLlave(f.pkcs8, 'secreto-uno', 'org_a', f.rfc);
    expect(c.dato).not.toContain(Buffer.from(f.pkcs8).toString('base64').slice(0, 40));
    expect(Buffer.from((await descifrarLlave(c, 'secreto-uno', 'org_a', f.rfc))!).equals(Buffer.from(f.pkcs8))).toBe(true);
    expect(await descifrarLlave(c, 'secreto-dos', 'org_a', f.rfc)).toBeNull();
    expect(await descifrarLlave(c, 'secreto-uno', 'org_b', f.rfc)).toBeNull();
    expect(await descifrarLlave(c, 'secreto-uno', 'org_a', 'XAXX010101000')).toBeNull();
    // Un bit cambiado en lo guardado: no abre (no devuelve basura).
    const roto = Buffer.from(c.dato, 'base64'); roto[10] ^= 1;
    expect(await descifrarLlave({ iv: c.iv, dato: roto.toString('base64') }, 'secreto-uno', 'org_a', f.rfc)).toBeNull();
    // Dos cifrados de lo mismo no se parecen.
    expect((await cifrarLlave(f.pkcs8, 'secreto-uno', 'org_a', f.rfc)).dato).not.toBe(c.dato);
  });
});

describe('los sobres, contra los de la biblioteca de referencia', () => {
  it('autenticar', async () => {
    const x = await sobreAutenticar(await firma(), new Date('2019-08-01T03:38:19.000Z'), new Date('2019-08-01T03:43:19.000Z'), 'uuid-cf6c80fb-00ae-44c0-af56-54ec65decbaa-1');
    expect(plano(x)).toBe(plano(refAutenticar));
  });

  it('solicitar recibidas (con todos los filtros del ejemplo)', async () => {
    const x = await sobreSolicitud(await firma(), 'SolicitaDescargaRecibidos', {
      RfcSolicitante: FIEL_RFC, TipoSolicitud: 'CFDI', FechaInicial: '2019-01-01T00:00:00', FechaFinal: '2019-01-01T00:04:00',
      RfcEmisor: 'AAA010101AAA', TipoComprobante: 'N', EstadoComprobante: 'Vigente', RfcACuentaTerceros: 'XXX01010199A',
      Complemento: 'nomina12', RfcReceptor: FIEL_RFC,
    });
    expect(plano(x)).toBe(plano(refRecibidas));
  });

  it('solicitar emitidas: lo que bill101 pide de verdad sale igual al ejemplo', async () => {
    const x = await sobreSolicitar(await firma(), { lado: 'emitidas', clase: 'metadata', desde: '2019-01-01T00:00:00', hasta: '2019-01-01T00:04:00' });
    expect(plano(x)).toBe(plano(refEmitidas));
  });

  it('verificar', async () => {
    expect(plano(await sobreVerificar(await firma(), '3f30a4e1-af73-4085-8991-e4d97eef16bd'))).toBe(plano(refVerificar));
  });

  it('descargar', async () => {
    expect(plano(await sobreDescargar(await firma(), '4e80345d-917f-40bb-a98f-4a73939343c5_01'))).toBe(plano(refDescargar));
  });

  it('lo recibido como XML se pide «Vigente» y con RfcReceptor; la lista, «Todos»', async () => {
    const f = await firma();
    const xml = await sobreSolicitar(f, { lado: 'recibidas', clase: 'cfdi', desde: '2026-01-01T00:00:00', hasta: '2026-02-01T00:00:00' });
    expect(xml).toContain(`<des:solicitud EstadoComprobante="Vigente" FechaFinal="2026-02-01T00:00:00" FechaInicial="2026-01-01T00:00:00" RfcReceptor="${FIEL_RFC}" RfcSolicitante="${FIEL_RFC}" TipoSolicitud="CFDI">`);
    expect(xml).not.toContain('RfcEmisor');
    const lista = await sobreSolicitar(f, { lado: 'recibidas', clase: 'metadata', desde: '2026-01-01T00:00:00', hasta: '2026-02-01T00:00:00' });
    expect(lista).toContain('EstadoComprobante="Todos"');
    expect(lista).toContain('TipoSolicitud="Metadata"');
  });

  it('la llave privada no viaja en ningún sobre', async () => {
    const f = await fiel();
    const pedazo = Buffer.from(f.pkcs8).toString('base64').slice(100, 160);
    const fm = { fiel: f, firmar: await firmante(f.pkcs8) };
    for (const x of [await sobreAutenticar(fm, HOY, HOY), await sobreVerificar(fm, 'x'), await sobreDescargar(fm, 'y')]) {
      expect(x).not.toContain(pedazo);
      expect(x).not.toContain(FIEL_CLAVE);
    }
  });
});

describe('leer lo que contesta el SAT', () => {
  it('el permiso', () => {
    expect(leerAutenticar('<s:Envelope><s:Body><AutenticaResponse xmlns="x"><AutenticaResult>eyJ.abc%26wrap</AutenticaResult></AutenticaResponse></s:Body></s:Envelope>')).toBe('eyJ.abc%26wrap');
    expect(leerAutenticar('<html>503</html>')).toBeNull();
  });

  it('una falla del servicio', () => {
    const f = leerFalla('<s:Envelope><s:Body><s:Fault><faultcode xmlns:a="x">a:InvalidSecurity</faultcode><faultstring xml:lang="en-US">An error occurred when verifying security for the message.</faultstring></s:Fault></s:Body></s:Envelope>');
    expect(f).toEqual({ codigo: 'a:InvalidSecurity', mensaje: 'An error occurred when verifying security for the message.' });
    expect(leerFalla('<s:Envelope><s:Body><ok/></s:Body></s:Envelope>')).toBeNull();
  });

  it('la solicitud', () => {
    expect(leerSolicitar('<s:Body><SolicitaDescargaRecibidosResponse xmlns="x"><SolicitaDescargaRecibidosResult IdSolicitud="d49af78d-1c80-4221-a48d-345ace91626b" CodEstatus="5000" Mensaje="Solicitud Aceptada" /></SolicitaDescargaRecibidosResponse></s:Body>'))
      .toEqual({ id_solicitud: 'd49af78d-1c80-4221-a48d-345ace91626b', codigo: 5000, mensaje: 'Solicitud Aceptada' });
    expect(leerSolicitar('<s:Body><SolicitaDescargaEmitidosResponse><SolicitaDescargaEmitidosResult CodEstatus="5002" Mensaje="Se han agotado las solicitudes de por vida"/></SolicitaDescargaEmitidosResponse></s:Body>'))
      .toEqual({ id_solicitud: null, codigo: 5002, mensaje: 'Se han agotado las solicitudes de por vida' });
    expect(leerSolicitar('<html/>')).toBeNull();
  });

  it('la verificación, con y sin paquetes', () => {
    const dos = leerVerificar('<VerificaSolicitudDescargaResponse><VerificaSolicitudDescargaResult CodEstatus="5000" EstadoSolicitud="3" CodigoEstadoSolicitud="5000" NumeroCFDIs="12345" Mensaje="Solicitud Aceptada"><IdsPaquetes>4e80_01</IdsPaquetes><IdsPaquetes>4e80_02</IdsPaquetes></VerificaSolicitudDescargaResult></VerificaSolicitudDescargaResponse>');
    expect(dos).toEqual({ codigo: 5000, mensaje: 'Solicitud Aceptada', estado: 3, codigo_solicitud: 5000, cuantas: 12345, paquetes: ['4e80_01', '4e80_02'] });
    const cero = leerVerificar('<VerificaSolicitudDescargaResult CodEstatus="5000" EstadoSolicitud="5" CodigoEstadoSolicitud="5004" NumeroCFDIs="0" Mensaje="No se encontró la información"/>');
    expect(cero).toMatchObject({ estado: 5, codigo_solicitud: 5004, cuantas: 0, paquetes: [] });
  });

  it('la descarga', () => {
    const r = leerDescargar('<s:Envelope><s:Header><h:respuesta CodEstatus="5000" Mensaje="Solicitud Aceptada" xmlns:h="x"/></s:Header><s:Body><RespuestaDescargaMasivaTercerosSalida xmlns="x"><Paquete>UEsFBgAAAAA=</Paquete></RespuestaDescargaMasivaTercerosSalida></s:Body></s:Envelope>');
    expect(r?.codigo).toBe(5000);
    expect([...r!.paquete!.slice(0, 2)]).toEqual([0x50, 0x4b]);
    const vacio = leerDescargar('<s:Envelope><s:Header><h:respuesta CodEstatus="5008" Mensaje="Máximo de descargas permitidas" xmlns:h="x"/></s:Header><s:Body><RespuestaDescargaMasivaTercerosSalida xmlns="x"><Paquete /></RespuestaDescargaMasivaTercerosSalida></s:Body></s:Envelope>');
    expect(vacio).toEqual({ codigo: 5008, mensaje: 'Máximo de descargas permitidas', paquete: null });
    expect(leerDescargar('<html/>')).toBeNull();
  });
});

describe('la lista (metadata)', () => {
  it('el ejemplo de la biblioteca', () => {
    const f = leerLista(refLista);
    expect(f).toHaveLength(2);
    expect(f[0]).toEqual({ uuid: 'E7215E3B-2DC5-4A40-AB10-C902FF9258DF', rfc_emisor: 'XAXX010101000', rfc_receptor: 'XAXX010101001', fecha: '2018-01-11 07:10:23', monto: '1124.11', efecto: 'I', vigente: true, cancelada_el: null });
  });

  const T = 'Uuid~RfcEmisor~NombreEmisor~RfcReceptor~NombreReceptor~RfcPac~FechaEmision~FechaCertificacionSat~Monto~EfectoComprobante~Estatus~FechaCancelacion';
  const U = (n: number) => `AAAAAAAA-AAAA-4AAA-8AAA-${String(n).padStart(12, '0')}`;

  it('una cancelada trae su fecha', () => {
    const [f] = leerLista(`${T}\r\n${U(1).toLowerCase()}~AAA010101AAA~UNO~EKU9003173C9~ESCUELA~PAC010101AAA~2026-03-14 10:36:24~2026-03-14 10:36:52~1160.00~I~0~2026-04-02 09:00:00\r\n`);
    expect(f).toMatchObject({ uuid: U(1), vigente: false, cancelada_el: '2026-04-02 09:00:00', efecto: 'I', monto: '1160.00' });
  });

  it('un nombre partido en dos renglones, y otro con «~» adentro', () => {
    const txt = [
      T,
      `${U(1)}~AAA010101AAA~RAZON`, `PARTIDA~EKU9003173C9~ESCUELA~PAC010101AAA~2026-03-14 10:36:24~2026-03-14 10:36:52~100.00~I~1~`,
      `${U(2)}~AAA010101AAA~CON ~ TILDE~EKU9003173C9~ESCUELA~PAC010101AAA~2026-03-15 10:00:00~2026-03-15 10:00:10~200.00~E~0~2026-03-16 08:00:00`,
      `${U(3)}~AAA010101AAA~BIEN~EKU9003173C9~ESCUELA~PAC010101AAA~2026-03-16 10:00:00~2026-03-16 10:00:10~300.00~P~1~`,
      '',
    ].join('\n');
    const f = leerLista(txt);
    expect(f.map((x) => x.uuid)).toEqual([U(1), U(2), U(3)]);
    expect(f[0]).toMatchObject({ vigente: true, monto: '100.00', fecha: '2026-03-14 10:36:24' });
    expect(f[1]).toMatchObject({ vigente: false, monto: '200.00', efecto: 'E', cancelada_el: '2026-03-16 08:00:00' });
    expect(f[2]).toMatchObject({ vigente: true, efecto: 'P' });
  });

  it('lo que no es una lista del SAT da cero renglones', () => {
    expect(leerLista('')).toEqual([]);
    expect(leerLista('hola\nmundo')).toEqual([]);
    expect(leerLista(`${T}\nno-es-uuid~a~b~c~d~e~f~g~h~i~1~`)).toEqual([]);
  });
});

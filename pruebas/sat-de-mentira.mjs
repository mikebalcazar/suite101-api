/* Un SAT de mentira para probar la Descarga Masiva sin el SAT.
 *
 * No contesta «sí» a todo: hace lo que hace el de verdad con lo que se le
 * manda, hasta donde se sabe cómo lo hace.
 *
 *   · COMPRUEBA LA FIRMA de cada sobre, con el certificado que viene en él:
 *     la huella de lo firmado y la firma RSA-SHA1 del `SignedInfo`. Un sobre
 *     mal firmado recibe una falla, como allá.
 *   · Pide el permiso (token) en las tres ventanillas que lo piden, y sólo
 *     acepta uno que él mismo dio.
 *   · Aplica las reglas que se le conocen: la fecha inicial menor que la
 *     final; lo recibido como XML sólo «Vigente»; el mismo periodo como XML
 *     no más de dos veces (5002); un paquete no más de dos bajadas (5008).
 *   · No contesta las facturas al pedir: da un número, dice «en proceso» las
 *     vueltas que se le indiquen, y luego entrega paquetes.
 *
 * QUÉ ENTREGA lo decide quien lo usa, con `alSolicitar(pedido)`, que devuelve
 * { codigo, mensaje, vueltas, paquetes: [Uint8Array…], estado, codigo_solicitud, cuantas }.
 *
 * Es JavaScript a secas (ni fetch ni servidor): `responder(url, cabeceras,
 * cuerpo)` da `{ status, body }`. La prueba de la API lo envuelve en un
 * `fetch`; la de la pantalla de bill101, en un servidor (allá hay una copia
 * de este archivo: si se cambia uno, se cambia el otro).
 */
import { X509Certificate } from 'node:crypto';
import { Buffer } from 'node:buffer';

const NS_DES = 'http://DescargaMasivaTerceros.sat.gob.mx';
const NS_FIRMA = 'http://www.w3.org/2000/09/xmldsig#';
const NS_U = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const RSA = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' };

const entre = (xml, abre, cierra) => {
  const i = xml.indexOf(abre);
  if (i < 0) return null;
  const j = xml.indexOf(cierra, i + abre.length);
  return j < 0 ? null : xml.slice(i + abre.length, j);
};
const attrs = (texto) => Object.fromEntries([...texto.matchAll(/([\w:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const sha1 = async (s) => Buffer.from(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))).toString('base64');

/** Comprueba la firma de un sobre. Devuelve el RFC del certificado, o por qué no. */
export async function revisarFirma(xml) {
  const firma = entre(xml, `<Signature xmlns="${NS_FIRMA}">`, '</Signature>');
  if (firma === null) return { error: 'sin firma' };
  const info = entre(firma, '<SignedInfo>', '</SignedInfo>');
  const valor = entre(firma, '<SignatureValue>', '</SignatureValue>');
  const huella = entre(firma, '<DigestValue>', '</DigestValue>');
  const cerB64 = entre(xml, '<X509Certificate>', '</X509Certificate>') ?? (/<o:BinarySecurityToken[^>]*>([^<]+)</.exec(xml) || [])[1];
  if (!info || !valor || !huella || !cerB64) return { error: 'firma incompleta' };
  let cer;
  try { cer = new X509Certificate(Buffer.from(cerB64, 'base64')); } catch { return { error: 'certificado ilegible' }; }
  const llave = await crypto.subtle.importKey('spki', cer.publicKey.export({ type: 'spki', format: 'der' }), RSA, false, ['verify']);
  const firmado = new TextEncoder().encode(`<SignedInfo xmlns="${NS_FIRMA}">${info}</SignedInfo>`);
  if (!(await crypto.subtle.verify(RSA.name, llave, Buffer.from(valor, 'base64'), firmado))) return { error: 'la firma no es de ese certificado' };

  // La huella: de la estampa de tiempo (autenticar) o del cuerpo sin su firma.
  let loFirmado;
  if (xml.includes('<u:Timestamp')) {
    const estampa = entre(xml, '<u:Timestamp u:Id="_0">', '</u:Timestamp>');
    loFirmado = `<u:Timestamp xmlns:u="${NS_U}" u:Id="_0">${estampa}</u:Timestamp>`;
  } else {
    const cuerpo = entre(xml, '<s:Body>', '</s:Body>') ?? '';
    const sinFirma = cuerpo.replace(/<Signature xmlns="[^"]*">[\s\S]*<\/Signature>/, '');
    loFirmado = sinFirma.replace(/^<des:(\w+)>/, `<des:$1 xmlns:des="${NS_DES}">`);
  }
  if ((await sha1(loFirmado)) !== huella) return { error: 'la huella no es la de lo que se mandó' };
  const rfc = (/x500UniqueIdentifier=([A-ZÑ&0-9]+)/.exec(cer.subject) || [])[1] ?? '';
  return { rfc };
}

const falla = (codigo, texto) => ({
  status: 500,
  body: `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode xmlns:a="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">a:${codigo}</faultcode><faultstring xml:lang="en-US">${texto}</faultstring></s:Fault></s:Body></s:Envelope>`,
});
const sobre = (cuerpo, cabeza = '') => ({
  status: 200,
  body: `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">${cabeza}<s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">${cuerpo}</s:Body></s:Envelope>`,
});
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function crearSat(opc = {}) {
  const st = {
    /** Todo lo que llegó, en orden: { paso, ...datos }. */
    llamadas: [],
    permisos: new Set(),
    solicitudes: new Map(),
    periodos: new Map(),
    bajadas: new Map(),
    /** Para simular que no está: 'caido' → 503 sin sobre; 'mudo' → lanza. */
    modo: 'bien',
    alSolicitar: opc.alSolicitar ?? (() => ({})),
    n: 0,
  };

  async function responder(url, cabeceras, cuerpo) {
    const ruta = new URL(url).pathname;
    const h = Object.fromEntries(Object.entries(cabeceras || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (st.modo === 'mudo') throw new Error('sin red');
    if (st.modo === 'caido') return { status: 503, body: '<html><body>Service Unavailable</body></html>' };

    const f = await revisarFirma(cuerpo);
    if (f.error) { st.llamadas.push({ paso: 'firma_mala', ruta, motivo: f.error }); return falla('InvalidSecurity', 'An error occurred when verifying security for the message.'); }

    if (ruta === '/Autenticacion/Autenticacion.svc') {
      const creado = entre(cuerpo, '<u:Created>', '</u:Created>'), vence = entre(cuerpo, '<u:Expires>', '</u:Expires>');
      st.llamadas.push({ paso: 'autenticar', rfc: f.rfc, creado, vence });
      if (st.modo === 'fiel_rechazada') return falla('InvalidSecurityToken', 'Certificado revocado o caduco');
      const permiso = `permiso-${++st.n}`;
      st.permisos.add(permiso);
      return sobre(`<AutenticaResponse xmlns="http://DescargaMasivaTerceros.gob.mx"><AutenticaResult>${permiso}</AutenticaResult></AutenticaResponse>`);
    }

    const permiso = (/^WRAP access_token="([^"]+)"$/.exec(h.authorization || '') || [])[1];
    if (!permiso || !st.permisos.has(permiso)) { st.llamadas.push({ paso: 'sin_permiso', ruta }); return falla('InvalidSecurity', 'Token invalido'); }

    if (ruta === '/SolicitaDescargaService.svc') {
      const m = /<des:(SolicitaDescargaEmitidos|SolicitaDescargaRecibidos)><des:solicitud ([^>]*)>/.exec(cuerpo);
      if (!m) return falla('Sender', 'XML mal formado');
      const a = attrs(m[2]);
      const lado = m[1] === 'SolicitaDescargaEmitidos' ? 'emitidas' : 'recibidas';
      const p = { lado, clase: a.TipoSolicitud === 'CFDI' ? 'cfdi' : 'metadata', desde: a.FechaInicial, hasta: a.FechaFinal, estado: a.EstadoComprobante, rfc: a.RfcSolicitante, attrs: a, accion: h.soapaction };
      st.llamadas.push({ paso: 'solicitar', ...p });
      const nodo = `${m[1]}Result`;
      const resp = (codigo, mensaje, id = '') => sobre(`<${m[1]}Response xmlns="${NS_DES}"><${nodo}${id ? ` IdSolicitud="${id}"` : ''} CodEstatus="${codigo}" Mensaje="${x(mensaje)}"/></${m[1]}Response>`);
      if (a.RfcSolicitante !== f.rfc) return resp(303, 'Sello no corresponde con RfcSolicitante');
      if ((lado === 'emitidas' ? a.RfcEmisor : a.RfcReceptor) !== f.rfc) return resp(301, 'XML mal formado');
      if (!(a.FechaInicial < a.FechaFinal)) return resp(301, 'XML Mal Formado: la fecha inicial debe ser menor a la final');
      if (lado === 'recibidas' && p.clase === 'cfdi' && a.EstadoComprobante !== 'Vigente') return resp(301, 'No se permite la descarga de xml que se encuentren cancelados');
      if (p.clase === 'cfdi') {
        const k = `${lado}|${a.FechaInicial}|${a.FechaFinal}`;
        st.periodos.set(k, (st.periodos.get(k) || 0) + 1);
        if (st.periodos.get(k) > 2) return resp(5002, 'Se han agotado las solicitudes de por vida');
      }
      const r = (await st.alSolicitar(p, st)) || {};
      if (r.codigo && r.codigo !== 5000) return resp(r.codigo, r.mensaje || 'rechazada');
      const id = `sol-${String(++st.n).padStart(4, '0')}`;
      st.solicitudes.set(id, { ...p, id, vueltas: r.vueltas ?? 1, paquetes: r.paquetes ?? [], estado_final: r.estado ?? 3, codigo_solicitud: r.codigo_solicitud ?? 5000, cuantas: r.cuantas ?? 0, mensaje: r.mensaje });
      return resp(5000, 'Solicitud Aceptada', id);
    }

    if (ruta === '/VerificaSolicitudDescargaService.svc') {
      const a = attrs((/<des:solicitud ([^>]*)>/.exec(cuerpo) || [])[1] || '');
      const s = st.solicitudes.get(a.IdSolicitud);
      st.llamadas.push({ paso: 'verificar', id: a.IdSolicitud, accion: h.soapaction });
      const resp = (at, dentro = '') => sobre(`<VerificaSolicitudDescargaResponse xmlns="${NS_DES}"><VerificaSolicitudDescargaResult ${at}>${dentro}</VerificaSolicitudDescargaResult></VerificaSolicitudDescargaResponse>`);
      if (!s) return resp('CodEstatus="5004" EstadoSolicitud="0" CodigoEstadoSolicitud="0" NumeroCFDIs="0" Mensaje="No se encontró la solicitud"');
      if (s.vueltas > 0) { s.vueltas--; return resp('CodEstatus="5000" EstadoSolicitud="2" CodigoEstadoSolicitud="5000" NumeroCFDIs="0" Mensaje="Solicitud Aceptada"'); }
      const paquetes = s.estado_final === 3 ? s.paquetes.map((_, i) => `<IdsPaquetes>${s.id}_${String(i + 1).padStart(2, '0')}</IdsPaquetes>`).join('') : '';
      return resp(`CodEstatus="5000" EstadoSolicitud="${s.estado_final}" CodigoEstadoSolicitud="${s.codigo_solicitud}" NumeroCFDIs="${s.cuantas}" Mensaje="${x(s.mensaje || 'Solicitud Aceptada')}"`, paquetes);
    }

    if (ruta === '/DescargaMasivaService.svc') {
      const a = attrs((/<des:peticionDescarga ([^>]*)>/.exec(cuerpo) || [])[1] || '');
      const [id, n] = String(a.IdPaquete || '').split('_');
      const s = st.solicitudes.get(id);
      const bytes = s && s.paquetes[Number(n) - 1];
      st.llamadas.push({ paso: 'descargar', paquete: a.IdPaquete, accion: h.soapaction });
      const resp = (codigo, mensaje, b64 = '') => sobre(
        `<RespuestaDescargaMasivaTercerosSalida xmlns="${NS_DES}">${b64 ? `<Paquete>${b64}</Paquete>` : '<Paquete />'}</RespuestaDescargaMasivaTercerosSalida>`,
        `<s:Header><h:respuesta CodEstatus="${codigo}" Mensaje="${x(mensaje)}" xmlns:h="${NS_DES}" xmlns="${NS_DES}"/></s:Header>`,
      );
      if (!bytes) return resp(5004, 'No se encontró la solicitud');
      st.bajadas.set(a.IdPaquete, (st.bajadas.get(a.IdPaquete) || 0) + 1);
      if (st.bajadas.get(a.IdPaquete) > 2) return resp(5008, 'Máximo de descargas permitidas');
      return resp(5000, 'Solicitud Aceptada', Buffer.from(bytes).toString('base64'));
    }
    return { status: 404, body: 'no existe' };
  }

  return { responder, st };
}

/** El renglón de una factura en la lista (metadata) del SAT. */
export const renglonLista = (d) =>
  [d.uuid, d.rfc_emisor, d.nombre_emisor || 'EMISOR', d.rfc_receptor, d.nombre_receptor || 'RECEPTOR', 'PAC010101AAA',
    `${d.fecha} 10:00:00`, `${d.fecha} 10:00:30`, d.monto ?? '0.00', d.efecto || 'I', d.vigente === false ? '0' : '1', d.cancelada_el || ''].join('~');
export const TITULOS_LISTA = 'Uuid~RfcEmisor~NombreEmisor~RfcReceptor~NombreReceptor~RfcPac~FechaEmision~FechaCertificacionSat~Monto~EfectoComprobante~Estatus~FechaCancelacion';

/* bill101 fase D — el servicio de Descarga Masiva del SAT (versión 1.5,
 * la que rige desde el 30-may-2025). Contrato 0.87.0.
 *
 * Son cuatro ventanillas, y en todas hay que enseñar la FIEL:
 *
 *   1. AUTENTICAR   se firma una estampa de tiempo; el SAT da un permiso
 *                   (token) que dura unos cinco minutos.
 *   2. SOLICITAR    «quiero lo emitido / lo recibido de tal fecha a tal
 *                   fecha». Contesta un número de solicitud, no las facturas.
 *   3. VERIFICAR    «¿ya está la solicitud X?». Tarda de minutos a horas;
 *                   cuando está, dice en cuántos paquetes viene.
 *   4. DESCARGAR    paquete por paquete: un .zip con los XML (o con un .txt
 *                   si se pidió sólo la lista —«metadata»—).
 *
 * DE DÓNDE SALE ESTO. El SAT no publica más que tres PDF. La forma exacta de
 * cada sobre está tomada de la biblioteca libre `phpcfdi/sat-ws-descarga-masiva`
 * (la que usa media industria), leída el 8-oct-2026 en su commit 91521b4, y
 * las pruebas (pruebas/sat-masiva.spec.ts) comparan lo que arma este archivo,
 * letra por letra y FIRMA INCLUIDA, contra los sobres de ejemplo de esa
 * biblioteca, con la misma FIEL de prueba que publica el SAT. Si el SAT
 * cambia el servicio, es aquí donde se toca.
 *
 * REGLAS DEL SAT que este archivo no puede hacer cumplir pero quien lo usa
 * sí (src/sat-db.ts):
 *   · el mismo periodo, pedido como XML, se puede solicitar DOS veces en la
 *     vida (código 5002). Un segundo de diferencia ya es otro periodo;
 *   · lo recibido, como XML, sólo se puede pedir «Vigente»: los cancelados
 *     recibidos no se bajan, sólo se listan (metadata);
 *   · la fecha inicial tiene que ser MENOR que la final.
 *
 * Aquí no hay base ni reloj: armar, firmar, mandar, leer. El `fetch` entra
 * por parámetro para poder medirlo todo sin red.
 */

import { Buffer } from 'node:buffer';
import { sha1b64, type DatosFiel, type Firmante } from './fiel';

export const SAT_SOLICITUD = 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx';
export const SAT_DESCARGA = 'https://cfdidescargamasiva.clouda.sat.gob.mx';

const RUTA = {
  autenticar: '/Autenticacion/Autenticacion.svc',
  solicitar: '/SolicitaDescargaService.svc',
  verificar: '/VerificaSolicitudDescargaService.svc',
  descargar: '/DescargaMasivaService.svc',
} as const;

const ACCION = {
  autenticar: 'http://DescargaMasivaTerceros.gob.mx/IAutenticacion/Autentica',
  emitidas: 'http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescargaEmitidos',
  recibidas: 'http://DescargaMasivaTerceros.sat.gob.mx/ISolicitaDescargaService/SolicitaDescargaRecibidos',
  verificar: 'http://DescargaMasivaTerceros.sat.gob.mx/IVerificaSolicitudDescargaService/VerificaSolicitudDescarga',
  descargar: 'http://DescargaMasivaTerceros.sat.gob.mx/IDescargaMasivaTercerosService/Descargar',
} as const;

const NS_DES = 'http://DescargaMasivaTerceros.sat.gob.mx';
const NS_FIRMA = 'http://www.w3.org/2000/09/xmldsig#';
const NS_U = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const NS_O = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const X509 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3';

/** Quien firma: lo público de la FIEL y la función que firma con su llave. */
export interface Firma { fiel: Pick<DatosFiel, 'rfc' | 'serie_decimal' | 'emisor' | 'cer_b64'>; firmar: Firmante }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ─────────────── la firma XML ─────────────── */

function infoFirmada(huella: string, uri: string, conNs: boolean): string {
  return (
    `<SignedInfo${conNs ? ` xmlns="${NS_FIRMA}"` : ''}>` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="${uri}"><Transforms><Transform Algorithm="${C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${huella}</DigestValue></Reference></SignedInfo>`
  );
}

/** Firma `loFirmado` (ya en su forma canónica) y devuelve el nodo
 *  `<Signature>`. Lo que se firma no es el texto sino su `SignedInfo`, que
 *  lleva dentro la huella del texto: así es la firma XML. */
async function firmaXml(f: Firma, loFirmado: string, uri = '', llave = ''): Promise<string> {
  const huella = await sha1b64(loFirmado);
  const valor = await f.firmar(infoFirmada(huella, uri, true));
  const quien = llave ||
    `<KeyInfo><X509Data><X509IssuerSerial><X509IssuerName>${esc(f.fiel.emisor)}</X509IssuerName>` +
    `<X509SerialNumber>${f.fiel.serie_decimal}</X509SerialNumber></X509IssuerSerial>` +
    `<X509Certificate>${f.fiel.cer_b64}</X509Certificate></X509Data></KeyInfo>`;
  return `<Signature xmlns="${NS_FIRMA}">${infoFirmada(huella, uri, false)}<SignatureValue>${valor}</SignatureValue>${quien}</Signature>`;
}

/* ─────────────── los cuatro sobres ─────────────── */

/** El SAT quiere la hora en UTC, con milésimas en ceros. */
const horaSat = (d: Date): string => `${d.toISOString().slice(0, 19)}.000Z`;

export function idDeFicha(): string {
  const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `uuid-${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}-1`;
}

export async function sobreAutenticar(f: Firma, creado: Date, vence: Date, ficha: string = idDeFicha()): Promise<string> {
  const estampa = (ns: boolean) =>
    `<u:Timestamp${ns ? ` xmlns:u="${NS_U}"` : ''} u:Id="_0"><u:Created>${horaSat(creado)}</u:Created><u:Expires>${horaSat(vence)}</u:Expires></u:Timestamp>`;
  const llave = `<KeyInfo><o:SecurityTokenReference><o:Reference URI="#${ficha}" ValueType="${X509}"/></o:SecurityTokenReference></KeyInfo>`;
  const firma = await firmaXml(f, estampa(true), '#_0', llave);
  return (
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:u="${NS_U}"><s:Header>` +
    `<o:Security xmlns:o="${NS_O}" s:mustUnderstand="1">${estampa(false)}` +
    `<o:BinarySecurityToken u:Id="${ficha}" ValueType="${X509}" EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${f.fiel.cer_b64}</o:BinarySecurityToken>` +
    `${firma}</o:Security></s:Header><s:Body><Autentica xmlns="http://DescargaMasivaTerceros.gob.mx"/></s:Body></s:Envelope>`
  );
}

const sobre = (cuerpo: string): string =>
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:des="${NS_DES}" xmlns:xd="${NS_FIRMA}"><s:Header/><s:Body>${cuerpo}</s:Body></s:Envelope>`;

export type Lado = 'emitidas' | 'recibidas';
/** `cfdi`: los XML. `metadata`: sólo la lista, con su estado. */
export type Clase = 'cfdi' | 'metadata';

export interface Pedido {
  lado: Lado;
  clase: Clase;
  /** `2026-01-01T00:00:00`, hora del centro de México, sin zona. */
  desde: string;
  hasta: string;
  /** Por omisión: `vigente` para los XML (lo recibido no admite otra cosa)
   *  y `todos` para la lista, que es donde se ven las cancelaciones. */
  estado?: 'vigente' | 'cancelado' | 'todos';
}

const ESTADO = { vigente: 'Vigente', cancelado: 'Cancelado', todos: 'Todos' } as const;

/** La solicitud con los atributos que se le den. `sobreSolicitar` es la
 *  que se usa; ésta existe aparte para poder medirla contra los sobres de
 *  ejemplo de la biblioteca de referencia, que traen filtros que bill101 no
 *  usa (complemento, a cuenta de terceros). */
export async function sobreSolicitud(f: Firma, nodo: 'SolicitaDescargaEmitidos' | 'SolicitaDescargaRecibidos', attrs: Record<string, string>): Promise<string> {
  // En orden alfabético y sin vacíos: es parte de la forma canónica de lo que se firma.
  const texto = Object.keys(attrs).filter((k) => attrs[k] !== '').sort().map((k) => `${k}="${esc(attrs[k])}"`).join(' ');
  const firma = await firmaXml(f, `<des:${nodo} xmlns:des="${NS_DES}"><des:solicitud ${texto}></des:solicitud></des:${nodo}>`);
  return sobre(`<des:${nodo}><des:solicitud ${texto}>${firma}</des:solicitud></des:${nodo}>`);
}

export async function sobreSolicitar(f: Firma, p: Pedido): Promise<string> {
  const rfc = f.fiel.rfc.toUpperCase();
  const attrs: Record<string, string> = {
    RfcSolicitante: rfc,
    TipoSolicitud: p.clase === 'cfdi' ? 'CFDI' : 'Metadata',
    FechaInicial: p.desde,
    FechaFinal: p.hasta,
    EstadoComprobante: ESTADO[p.estado ?? (p.clase === 'cfdi' ? 'vigente' : 'todos')],
  };
  if (p.lado === 'emitidas') attrs.RfcEmisor = rfc;
  else attrs.RfcReceptor = rfc;
  return sobreSolicitud(f, p.lado === 'emitidas' ? 'SolicitaDescargaEmitidos' : 'SolicitaDescargaRecibidos', attrs);
}

export async function sobreVerificar(f: Firma, idSolicitud: string): Promise<string> {
  const a = `IdSolicitud="${esc(idSolicitud)}" RfcSolicitante="${esc(f.fiel.rfc)}"`;
  const firma = await firmaXml(f, `<des:VerificaSolicitudDescarga xmlns:des="${NS_DES}"><des:solicitud ${a}></des:solicitud></des:VerificaSolicitudDescarga>`);
  return sobre(`<des:VerificaSolicitudDescarga><des:solicitud ${a}>${firma}</des:solicitud></des:VerificaSolicitudDescarga>`);
}

export async function sobreDescargar(f: Firma, idPaquete: string): Promise<string> {
  const a = `IdPaquete="${esc(idPaquete)}" RfcSolicitante="${esc(f.fiel.rfc)}"`;
  const firma = await firmaXml(f, `<des:PeticionDescargaMasivaTercerosEntrada xmlns:des="${NS_DES}"><des:peticionDescarga ${a}></des:peticionDescarga></des:PeticionDescargaMasivaTercerosEntrada>`);
  return sobre(`<des:PeticionDescargaMasivaTercerosEntrada><des:peticionDescarga ${a}>${firma}</des:peticionDescarga></des:PeticionDescargaMasivaTercerosEntrada>`);
}

/* ─────────────── leer lo que contesta ─────────────── */

const desEsc = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Los atributos del primer elemento con ese nombre, sin importar prefijo ni
 *  mayúsculas en el nombre del atributo. `null` si el elemento no está. */
function atributos(xml: string, elemento: string): Record<string, string> | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${elemento}(\\s[^>]*)?/?>`).exec(xml);
  if (!m) return null;
  const r: Record<string, string> = {};
  for (const a of (m[1] ?? '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) r[a[1].toLowerCase()] = desEsc(a[2]);
  return r;
}

function contenido(xml: string, elemento: string): string | null {
  const m = new RegExp(`<(?:[\\w.-]+:)?${elemento}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${elemento}>`).exec(xml);
  return m ? desEsc(m[1].trim()) : null;
}

/** Un error del propio servicio (SOAP Fault): la firma no pasó, el permiso
 *  venció, el sobre está mal. */
export function leerFalla(xml: string): { codigo: string; mensaje: string } | null {
  if (!/<(?:[\w.-]+:)?Fault[\s>]/.test(xml)) return null;
  return { codigo: contenido(xml, 'faultcode') ?? '', mensaje: contenido(xml, 'faultstring') ?? '' };
}

export const leerAutenticar = (xml: string): string | null => contenido(xml, 'AutenticaResult') || null;

export interface RespSolicitar { id_solicitud: string | null; codigo: number; mensaje: string }
export function leerSolicitar(xml: string): RespSolicitar | null {
  const a = atributos(xml, 'SolicitaDescarga(?:Emitidos|Recibidos|Folio)?Result');
  if (!a) return null;
  return { id_solicitud: a.idsolicitud || null, codigo: Number(a.codestatus || 0), mensaje: a.mensaje ?? '' };
}

export interface RespVerificar {
  /** Del servicio: 5000 es que la pregunta se pudo hacer. */
  codigo: number;
  mensaje: string;
  /** 1 aceptada · 2 en proceso · 3 terminada · 4 error · 5 rechazada · 6 vencida. */
  estado: number;
  /** De la solicitud: 5000 bien · 5002 agotada · 5003 tope · 5004 sin datos · 5005 duplicada. */
  codigo_solicitud: number;
  cuantas: number;
  paquetes: string[];
}
export function leerVerificar(xml: string): RespVerificar | null {
  const a = atributos(xml, 'VerificaSolicitudDescargaResult');
  if (!a) return null;
  const paquetes = [...xml.matchAll(/<(?:[\w.-]+:)?IdsPaquetes(?:\s[^>]*)?>([^<]*)<\//g)].map((m) => m[1].trim()).filter(Boolean);
  return {
    codigo: Number(a.codestatus || 0), mensaje: a.mensaje ?? '', estado: Number(a.estadosolicitud || 0),
    codigo_solicitud: Number(a.codigoestadosolicitud || 0), cuantas: Number(a.numerocfdis || 0), paquetes,
  };
}

export interface RespDescargar { codigo: number; mensaje: string; paquete: Uint8Array | null }
export function leerDescargar(xml: string): RespDescargar | null {
  const a = atributos(xml, 'respuesta');
  // El paquete puede pesar decenas de megas en base64: se corta a mano, sin
  // expresión regular sobre todo el texto.
  const i = xml.search(/<(?:[\w.-]+:)?Paquete(?:\s[^>]*)?>/);
  if (!a && i < 0) return null;
  let paquete: Uint8Array | null = null;
  if (i >= 0) {
    const abre = xml.indexOf('>', i) + 1;
    const cierra = xml.indexOf('<', abre);
    const b = cierra > abre ? xml.slice(abre, cierra).trim() : '';
    if (b) paquete = new Uint8Array(Buffer.from(b, 'base64'));
  }
  return { codigo: Number(a?.codestatus || 0), mensaje: a?.mensaje ?? '', paquete };
}

/* ─────────────── hablar con el SAT ─────────────── */

export type FallaSatMasiva = {
  /** `sat_no_responde`: no hubo respuesta que leer (red, tiempo, página de
   *  error). `sat_rechaza`: contestó, y dijo que no (firma, permiso). */
  error: 'sat_no_responde' | 'sat_rechaza';
  detalle: { paso: string; http?: number; codigo?: string; mensaje?: string };
};
export const esFallaSat = (r: unknown): r is FallaSatMasiva =>
  !!r && typeof r === 'object' && ((r as { error?: unknown }).error === 'sat_no_responde' || (r as { error?: unknown }).error === 'sat_rechaza');

export interface Ventanilla {
  traer: typeof fetch;
  /** Para las pruebas: un SAT de mentira en otra dirección. Las dos bases
   *  del SAT se vuelven ésta. NUNCA en producción (lo cuida quien llama). */
  base?: string;
  topeMs?: number;
}

async function llamar(v: Ventanilla, paso: keyof typeof RUTA, accion: string, cuerpo: string, permiso?: string): Promise<string | FallaSatMasiva> {
  const base = v.base ?? (paso === 'descargar' ? SAT_DESCARGA : SAT_SOLICITUD);
  const headers: Record<string, string> = { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: accion };
  if (permiso) headers.Authorization = `WRAP access_token="${permiso}"`;
  let r: Response;
  let texto: string;
  try {
    r = await v.traer(base + RUTA[paso], { method: 'POST', headers, body: cuerpo, signal: AbortSignal.timeout(v.topeMs ?? (paso === 'descargar' ? 60_000 : 20_000)) });
    texto = await r.text();
  } catch (e) {
    return { error: 'sat_no_responde', detalle: { paso, mensaje: e instanceof Error ? e.name : 'error' } };
  }
  const falla = leerFalla(texto);
  if (falla) return { error: 'sat_rechaza', detalle: { paso, http: r.status, codigo: falla.codigo.slice(0, 120), mensaje: falla.mensaje.slice(0, 300) } };
  if (!r.ok) return { error: 'sat_no_responde', detalle: { paso, http: r.status } };
  return texto;
}

const sinLeer = (paso: string): FallaSatMasiva => ({ error: 'sat_no_responde', detalle: { paso, mensaje: 'la respuesta no es del servicio' } });

/** El permiso, y hasta cuándo sirve (se pide por cinco minutos; se da por
 *  vencido a los cuatro). */
export async function autenticar(v: Ventanilla, f: Firma, ahora: Date = new Date()): Promise<{ permiso: string; vence: number } | FallaSatMasiva> {
  const t = new Date(Math.floor(ahora.getTime() / 1000) * 1000);
  const r = await llamar(v, 'autenticar', ACCION.autenticar, await sobreAutenticar(f, t, new Date(t.getTime() + 300_000)));
  if (typeof r !== 'string') return r;
  const permiso = leerAutenticar(r);
  if (!permiso) return sinLeer('autenticar');
  return { permiso, vence: t.getTime() + 240_000 };
}

export async function solicitar(v: Ventanilla, f: Firma, permiso: string, p: Pedido): Promise<RespSolicitar | FallaSatMasiva> {
  const r = await llamar(v, 'solicitar', ACCION[p.lado], await sobreSolicitar(f, p), permiso);
  if (typeof r !== 'string') return r;
  return leerSolicitar(r) ?? sinLeer('solicitar');
}

export async function verificar(v: Ventanilla, f: Firma, permiso: string, idSolicitud: string): Promise<RespVerificar | FallaSatMasiva> {
  const r = await llamar(v, 'verificar', ACCION.verificar, await sobreVerificar(f, idSolicitud), permiso);
  if (typeof r !== 'string') return r;
  return leerVerificar(r) ?? sinLeer('verificar');
}

export async function descargar(v: Ventanilla, f: Firma, permiso: string, idPaquete: string): Promise<RespDescargar | FallaSatMasiva> {
  const r = await llamar(v, 'descargar', ACCION.descargar, await sobreDescargar(f, idPaquete), permiso);
  if (typeof r !== 'string') return r;
  return leerDescargar(r) ?? sinLeer('descargar');
}

/* ─────────────── la lista («metadata») ─────────────── */

export interface RenglonLista {
  uuid: string;
  rfc_emisor: string;
  rfc_receptor: string;
  /** `2026-03-14 10:36:24`, como lo da el SAT. */
  fecha: string;
  monto: string;
  /** I, E, P, N, T. */
  efecto: string;
  vigente: boolean;
  cancelada_el: string | null;
}

/** Lee el .txt de un paquete de metadata: un renglón por factura, campos
 *  separados por «~», el primero son los títulos.
 *
 *  Dos mañas del archivo, las dos vistas en el campo: un nombre que trae un
 *  salto de línea parte el renglón en dos, y uno que trae «~» lo deja con un
 *  campo de más. Lo primero se arregla pegando renglones hasta completar los
 *  campos; lo segundo, contando los últimos campos desde el final —el nombre
 *  estorba en medio, no en las orillas—. */
export function leerLista(txt: string): RenglonLista[] {
  const lineas = txt.replace(/^﻿/, '').split(/\r?\n/);
  const titulos = (lineas.shift() ?? '').split('~').map((t) => t.trim().toLowerCase());
  const n = titulos.length;
  const lugar = (t: string) => titulos.indexOf(t);
  const iUuid = lugar('uuid'), iEmisor = lugar('rfcemisor');
  if (iUuid < 0 || lugar('estatus') < 0 || n < 6) return [];
  const desdeElFin = (t: string): number => n - lugar(t); // cuántos antes del final
  const filas: RenglonLista[] = [];
  let pendiente = '';
  for (const l of lineas) {
    if (!l.trim() && !pendiente) continue;
    const linea = pendiente ? `${pendiente} ${l}` : l;
    const c = linea.split('~');
    if (c.length < n) { pendiente = linea; continue; }
    pendiente = '';
    const fin = (t: string): string => (lugar(t) < 0 ? '' : (c[c.length - desdeElFin(t)] ?? '').trim());
    const uuid = (c[iUuid] ?? '').trim().toUpperCase();
    if (!/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/.test(uuid)) continue;
    const cancel = fin('fechacancelacion');
    filas.push({
      uuid,
      rfc_emisor: (c[iEmisor] ?? '').trim().toUpperCase(),
      rfc_receptor: c.length === n ? (c[lugar('rfcreceptor')] ?? '').trim().toUpperCase() : '',
      fecha: fin('fechaemision'), monto: fin('monto'), efecto: fin('efectocomprobante').toUpperCase(),
      vigente: fin('estatus') === '1',
      cancelada_el: cancel || null,
    });
  }
  return filas;
}

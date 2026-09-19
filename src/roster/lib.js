// roster101 — utilidades del motor: firmas HMAC, cookies, nombres limpios.
// Es el lib.js del Worker de roster101, sin la parte de PBKDF2: la
// contraseña se fue a la suite el 16-sep y aquí ya no se deriva ninguna clave.

export const ahora = () => new Date().toISOString();

export function uuid() {
  return crypto.randomUUID();
}

const enc = new TextEncoder();

async function claveHmac(secreto) {
  return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function firmar(payload, secreto) {
  const cuerpo = b64url(enc.encode(JSON.stringify(payload)));
  const k = await claveHmac(secreto);
  const sig = b64url(await crypto.subtle.sign('HMAC', k, enc.encode(cuerpo)));
  return `${cuerpo}.${sig}`;
}

export async function verificar(token, secreto) {
  if (!token || !token.includes('.')) return null;
  const [cuerpo, sig] = token.split('.');
  const k = await claveHmac(secreto);
  const ok = await crypto.subtle.verify('HMAC', k, deB64url(sig), enc.encode(cuerpo));
  if (!ok) return null;
  let datos;
  try { datos = JSON.parse(new TextDecoder().decode(deB64url(cuerpo))); } catch { return null; }
  if (!datos.exp || datos.exp < Math.floor(Date.now() / 1000)) return null;
  return datos;
}

export async function sha256(txt) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(txt)));
}

// Comparación en tiempo constante para contraseñas cortas
export function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function cookie(nombre, valor, segundos) {
  const partes = [
    `${nombre}=${valor}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${segundos}`,
  ];
  return partes.join('; ');
}

export function leerCookie(req, nombre) {
  const raw = req.header('Cookie') || '';
  for (const parte of raw.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

export function normalizaEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Quita acentos y caracteres inválidos para nombres de carpeta/archivo
// El nombre del cliente que está usando la plataforma. roster101 es el programa;
// la empresa que lo renta se configura en wrangler.toml y es la que tiene que
// salir en los correos, en los archivos y en los documentos que firma la gente.
export const empresaDe = (env) => env.EMPRESA || env.RAZON_SOCIAL || 'la empresa';

export function limpiaNombre(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function csvCampo(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

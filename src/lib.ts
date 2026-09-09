/* Utilidades de suite101-api. Mismo espíritu que src/lib.js de roster101:
 * nada de dependencias, todo con WebCrypto, que es lo que hay en un Worker. */

const enc = new TextEncoder();

export const ahora = (): string => new Date().toISOString();

/* ─────────────── ULID ───────────────
 * Ordena por tiempo y no colisiona. Se usa para los ids que genera la API.
 * En la importación (fase 2) se conservan los ids de Firestore, así que la
 * columna es TEXT y no valida formato: aquí solo se generan los nuevos. */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let ultimoMs = 0;
let ultimoAzar: number[] = [];

export function ulid(ms = Date.now()): string {
  let t = '';
  let n = ms;
  for (let i = 0; i < 10; i++) {
    t = CROCKFORD[n % 32] + t;
    n = Math.floor(n / 32);
  }
  if (ms === ultimoMs && ultimoAzar.length) {
    // mismo milisegundo: se incrementa el azar en vez de tirar otro, para que
    // dos ids del mismo lote sigan ordenando en el orden en que se crearon
    for (let i = ultimoAzar.length - 1; i >= 0; i--) {
      if (ultimoAzar[i] < 31) {
        ultimoAzar[i]++;
        break;
      }
      ultimoAzar[i] = 0;
    }
  } else {
    ultimoMs = ms;
    ultimoAzar = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b % 32);
  }
  return t + ultimoAzar.map((v) => CROCKFORD[v]).join('');
}

/* ─────────────── base64url ─────────────── */

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(str: string): Uint8Array {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ─────────────── firma HMAC de la cookie de sesión ─────────────── */

async function claveHmac(secreto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** La cookie vale `id.firma`. El id no dice nada por sí solo: la sesión vive en D1. */
export async function firmarId(id: string, secreto: string): Promise<string> {
  const k = await claveHmac(secreto);
  return `${id}.${b64url(await crypto.subtle.sign('HMAC', k, enc.encode(id)))}`;
}

export async function abrirCookie(valor: string | null, secreto: string): Promise<string | null> {
  if (!valor || !valor.includes('.')) return null;
  const corte = valor.lastIndexOf('.');
  const id = valor.slice(0, corte);
  const firma = valor.slice(corte + 1);
  const k = await claveHmac(secreto);
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', k, deB64url(firma) as unknown as BufferSource, enc.encode(id));
  } catch {
    return null;
  }
  return ok ? id : null;
}

export async function sha256(txt: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(txt)));
}

/** Comparación en tiempo constante. Para códigos y hashes cortos. */
export function igualSeguro(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ─────────────── PIN guardado ───────────────
 * Un PIN no se guarda: se guarda lo que sale de estirarlo con PBKDF2 y su sal.
 * Si alguien se lleva la base, no se lleva los PIN. */

export const VUELTAS = 120000;

export function salNueva(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function derivar(clave: string, sal: string, vueltas = VUELTAS): Promise<string> {
  const material = await crypto.subtle.importKey('raw', enc.encode(String(clave)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: deB64url(sal) as unknown as BufferSource, iterations: vueltas, hash: 'SHA-256' },
    material,
    256,
  );
  return b64url(new Uint8Array(bits));
}

/** `hash` guardado como `sal$vueltas$derivado`, en una sola columna. */
export async function guardarPin(pin: string): Promise<string> {
  const sal = salNueva();
  return `${sal}$${VUELTAS}$${await derivar(pin, sal, VUELTAS)}`;
}

export async function pinCoincide(pin: string, guardado: string | null): Promise<boolean> {
  if (!guardado) return false;
  const [sal, vueltas, hash] = guardado.split('$');
  if (!sal || !hash) return false;
  return igualSeguro(await derivar(pin, sal, Number(vueltas) || VUELTAS), hash);
}

/** 111111 y 123456 no son PIN. Tampoco 000000 ni las escaleras. */
export function pinAceptable(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false;
  if (/^(\d)\1{5}$/.test(pin)) return false;
  if ('01234567890'.includes(pin) || '09876543210'.includes(pin)) return false;
  return true;
}

/* ─────────────── cookies ───────────────
 * SameSite=None porque las apps viven en orígenes distintos del de la API
 * (dash101 en Netlify, las demás en Cloudflare). Sin esto el navegador no
 * manda la cookie y todo sale 401 sin explicación. */

export function cookie(nombre: string, valor: string, segundos: number): string {
  return [`${nombre}=${valor}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=None', `Max-Age=${segundos}`].join('; ');
}

export function leerCookie(cabecera: string | null | undefined, nombre: string): string | null {
  for (const parte of String(cabecera || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

/* ─────────────── texto ─────────────── */

export function normalizaCorreo(e: unknown): string {
  return String(e || '').trim().toLowerCase();
}

export function correoValido(e: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e);
}

export function normalizar(txt: unknown): string {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Suma segundos a una fecha y la devuelve en ISO 8601 UTC. */
export function enSegundos(segundos: number, desde = Date.now()): string {
  return new Date(desde + segundos * 1000).toISOString();
}

export const vencida = (iso: string | null | undefined): boolean => !iso || iso < ahora();

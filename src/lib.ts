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

/* 100,000 y no más: es el tope de vueltas que el runtime de Workers acepta en
 * PBKDF2. Con 120,000 —lo que decía este archivo— `deriveBits` truena y la
 * ruta contesta 500. Nunca se vio en las pruebas porque workerd local no
 * aplica ese límite: solo salió cuando la prueba de humo fijó un PIN contra el
 * Worker publicado. Ningún PIN quedó guardado con el valor viejo, porque con
 * el valor viejo no se podía guardar ninguno. */
export const VUELTAS = 100000;

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

/* ─────────────── la contraseña (contrato 0.7.0) ───────────────
 * Se guarda igual que el PIN —PBKDF2 con su sal, en una sola columna— porque
 * es el mismo problema. Lo que cambia son las reglas de qué se acepta, y esas
 * vienen de roster101 0.11.0, donde ya estaban escritas y probadas: si el
 * panel de expedientes se muda a la suite, no puede bajar de nivel.
 */

export const CLAVE_MINIMO = 10;

/** Las que cualquiera prueba primero. Sin acentos: se comparan normalizadas. */
const OBVIAS = [
  'password', 'contrasena', 'taller101', 'suite101', 'qwerty', 'admin', 'iloveyou',
  'bienvenido', 'mexico', 'forespot', 'letmein', 'welcome', 'abc123', 'master',
];

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** ¿Son dígitos en escalera, hacia arriba o hacia abajo?
 *
 *  La resta va en círculo (módulo 10) a propósito: con una resta normal,
 *  `1234567890` NO salía escalera, porque del 9 al 0 la diferencia es -9. Es
 *  justo la contraseña que más se teclea de corrido, y pasaba. Medido el
 *  16-sep con la prueba de la contraseña; el mismo hueco está en la versión
 *  que roster101 0.11.0 usa hoy para su panel. */
function esSecuencia(digitos: string): boolean {
  if (digitos.length < 2) return false;
  let sube = true, baja = true;
  for (let i = 1; i < digitos.length; i++) {
    const d = (Number(digitos[i]) - Number(digitos[i - 1]) + 10) % 10;
    if (d !== 1) sube = false;
    if (d !== 9) baja = false;
  }
  return sube || baja;
}

/** `null` si la contraseña sirve; si no, la frase que se le enseña a la
 *  persona. Se le pasa el correo porque la trampa más común es usar el
 *  usuario del propio correo. */
export function revisaClave(clave: string, correo = ''): string | null {
  const c = String(clave || '');
  if (c.length < CLAVE_MINIMO) return `La contraseña necesita al menos ${CLAVE_MINIMO} caracteres.`;
  if (c.trim() !== c) return 'La contraseña no puede empezar ni terminar con espacio: se pierde al copiarla.';
  if (new Set(c).size < 4) return 'Esa contraseña es demasiado sencilla: usa al menos cuatro caracteres distintos.';

  const plana = sinAcentos(c);
  const usuario = sinAcentos(String(correo || '').split('@')[0]);
  if (usuario.length >= 3 && plana.includes(usuario)) {
    return 'La contraseña no puede llevar el usuario de tu correo: es lo primero que cualquiera probaría.';
  }
  for (const obvia of OBVIAS) {
    if (plana.includes(obvia)) return 'Esa contraseña es de las que cualquiera prueba primero. Escoge otra.';
  }
  if (/^\d+$/.test(plana) && esSecuencia(plana)) return 'Esa contraseña es una secuencia de números. Escoge otra.';
  return null;
}

/** Igual que `guardarPin`: mismo PBKDF2, otra columna. */
export const guardarClave = guardarPin;
export const claveCoincide = pinCoincide;

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

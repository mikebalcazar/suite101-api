/* Licencias por suscripción (contrato 0.13.0): las llaves, el token y la
 * clave. Las rutas viven en rutas/licencias.ts; aquí sólo lo que firma y lo
 * que decide si una suscripción está vigente.
 *
 * El token es `v1.<carga>.<firma>`: la carga es JSON en base64url y la firma
 * es Ed25519 sobre esos mismos bytes. La app trae la llave PÚBLICA (la sirve
 * GET /licencias/llave) y con ella no se puede fabricar un permiso; la privada
 * la genera este Worker la primera vez y la guarda en `config`, igual que el
 * secreto de sesión (maestro.ts): así funciona desde el primer despliegue sin
 * pedirle nada a nadie, y ningún chat la ve. */

import type { Env } from './entorno';
import { ahora, b64url, deB64url, ulid } from './lib';
import type { Suscripcion, TokenLicencia } from '../schema/tipos';

/** Hasta dónde llega un token como máximo, aunque el pago vaya más lejos. La
 *  app late a diario y renueva; si Mike suspende, el corte llega a más tardar
 *  en 30 días sin latido (y la app tiene su propio margen sin internet). */
export const HORIZONTE_SEGUNDOS = 30 * 24 * 3600;

const ALG = { name: 'Ed25519' } as const;
const LLAVE_CONFIG = 'licencias_llave';

type LlavesJwk = { privada: JsonWebKey; publica: JsonWebKey; kid: string };
let cacheLlaves: LlavesJwk | null = null;

/** Las llaves, de `config` o recién hechas. Dos Workers que arranquen a la vez
 *  podrían generar dos pares: el `INSERT OR IGNORE` deja ganar al primero y el
 *  segundo vuelve a leer, así que sólo hay una llave viva. */
async function llavesDe(env: Env): Promise<LlavesJwk> {
  if (cacheLlaves) return cacheLlaves;
  const fila = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = ?`).bind(LLAVE_CONFIG).first<{ valor: string }>();
  if (fila?.valor) {
    cacheLlaves = JSON.parse(fila.valor) as LlavesJwk;
    return cacheLlaves;
  }
  const par = (await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  const privada = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  const publica = (await crypto.subtle.exportKey('jwk', par.publicKey)) as JsonWebKey;
  const huella = await crypto.subtle.digest('SHA-256', deB64url(String(publica.x)));
  const kid = b64url(huella).slice(0, 8);
  await env.MASTER.prepare(`INSERT OR IGNORE INTO config (llave, valor) VALUES (?, ?)`)
    .bind(LLAVE_CONFIG, JSON.stringify({ privada, publica, kid }))
    .run();
  const puesta = await env.MASTER.prepare(`SELECT valor FROM config WHERE llave = ?`).bind(LLAVE_CONFIG).first<{ valor: string }>();
  cacheLlaves = JSON.parse(puesta!.valor) as LlavesJwk;
  return cacheLlaves;
}

/** Lo que se le da a cualquiera: la llave pública, tal cual la trae draw101. */
export async function llavePublica(env: Env): Promise<{ alg: 'Ed25519'; kid: string; publica: string }> {
  const l = await llavesDe(env);
  return { alg: 'Ed25519', kid: l.kid, publica: String(l.publica.x) };
}

export async function firmarToken(env: Env, carga: Omit<TokenLicencia, 'v' | 'kid'>): Promise<string> {
  const l = await llavesDe(env);
  const completa: TokenLicencia = { v: 1, kid: l.kid, ...carga };
  const bytes = new TextEncoder().encode(JSON.stringify(completa));
  const privada = await crypto.subtle.importKey('jwk', l.privada, ALG, false, ['sign']);
  const firma = await crypto.subtle.sign(ALG, privada, bytes);
  return `v1.${b64url(bytes)}.${b64url(firma)}`;
}

/** Abre un token: la carga si la firma es de esta API, o null. No mira fechas
 *  ni estado: eso lo decide la ruta con la suscripción a la vista. */
export async function abrirToken(env: Env, token: unknown): Promise<TokenLicencia | null> {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return null;
  try {
    const l = await llavesDe(env);
    const bytes = deB64url(partes[1]);
    const firma = deB64url(partes[2]);
    const publica = await crypto.subtle.importKey('jwk', l.publica, ALG, false, ['verify']);
    const vale = await crypto.subtle.verify(ALG, publica, firma, bytes);
    if (!vale) return null;
    const carga = JSON.parse(new TextDecoder().decode(bytes)) as TokenLicencia;
    return carga && carga.v === 1 && typeof carga.licencia === 'string' && typeof carga.maquina === 'string' ? carga : null;
  } catch {
    return null;
  }
}

/* ─────────────── la clave ─────────────── */

/** T101-XXXX-XXXX-XXXX. Sin 0/O ni 1/I, que por teléfono se confunden; 12
 *  letras de 32 son ~60 bits: no se adivina a fuerza bruta. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function claveNueva(): string {
  const r = crypto.getRandomValues(new Uint8Array(12));
  const letras = [...r].map((b) => ALFABETO[b % ALFABETO.length]);
  return `T101-${letras.slice(0, 4).join('')}-${letras.slice(4, 8).join('')}-${letras.slice(8, 12).join('')}`;
}
export const CLAVE_FORMA = /^T101-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
export const normalizaClave = (v: unknown): string => String(v ?? '').trim().toUpperCase();

/* ─────────────── vigencia ─────────────── */

export const hoy = (): string => ahora().slice(0, 10);
export const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Si la suscripción deja entrar hoy, y si no, por qué. `sin_pago` cubre el
 *  «no hay periodo de prueba» que Mike escogió: sin fecha y sin cortesía, no
 *  entra. */
export function vigencia(s: Suscripcion): { vigente: true } | { vigente: false; motivo: 'suspendida' | 'sin_pago' } {
  if (s.estado !== 'activa') return { vigente: false, motivo: 'suspendida' };
  if (s.cortesia) return { vigente: true };
  if (s.paga_hasta && s.paga_hasta >= hoy()) return { vigente: true };
  return { vigente: false, motivo: 'sin_pago' };
}

/** Hasta cuándo vale el token que se emite ahora: el fin del último día pagado,
 *  y nunca más allá del horizonte. Una cortesía sólo tiene horizonte. */
export function hastaDe(s: Suscripcion, desdeMs = Date.now()): string {
  const horizonte = desdeMs + HORIZONTE_SEGUNDOS * 1000;
  if (s.cortesia || !s.paga_hasta) return new Date(horizonte).toISOString();
  const finDia = Date.parse(`${s.paga_hasta}T23:59:59.000Z`);
  return new Date(Math.min(horizonte, finDia)).toISOString();
}

export function cargaDe(s: Suscripcion, huella: string, desdeMs = Date.now()): Omit<TokenLicencia, 'v' | 'kid'> {
  return {
    programa: s.programa,
    licencia: s.id,
    cliente: s.cliente,
    plan: s.plan,
    lugares: s.lugares,
    maquina: huella,
    emitido: new Date(desdeMs).toISOString(),
    hasta: hastaDe(s, desdeMs),
  };
}

export const idNuevo = (): string => ulid();

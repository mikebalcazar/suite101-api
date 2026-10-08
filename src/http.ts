/* Toda respuesta de la API tiene la misma forma: {ok:true,data} o
 * {ok:false,error}. El `error` es corto y en snake_case para que una app pueda
 * prender por él sin leer texto. */

import type { Context } from 'hono';
import type { App } from '../schema/tipos';
import type { Env } from './entorno';
import type { DominioResuelto } from './dominios';
import type { TokenLicencia } from '../schema/tipos';
import type { Miembro } from './maestro';

export interface Sesion {
  id: string;
  usuario_id: string;
  correo: string;
  superadmin: boolean;
  /** Con qué se abrió: 'codigo' | 'pin' | 'clave' | 'google' (contrato 0.7.0). */
  como: string;
}

export interface Quien {
  /** `inversionista` (0.82.0): alguien de afuera que le presta a la empresa.
   *  Sólo existe para investor101 y sólo abre /orgs/:o/inversion/*. */
  clase: 'miembro' | 'personal' | 'cliente' | 'inversionista';
  usuario_id: string;
  rol?: Miembro['rol'];
  ref_id?: string;
  ve_dinero: boolean;
  /** owner, admin y socio ven costos y egresos. staff no. */
  ve_costos: boolean;
  /** 0.47.0 · En supply101, un miembro cuya lista de apps no trae `supply`
   *  entra de todos modos, pero sólo para pedir REEMBOLSOS: «tu usuario no
   *  está autorizado para compras» (Mike, 28-sep). Se decide en la puerta
   *  de /orgs y lo aplica POST /ordenes. */
  sin_compras?: boolean;
}

/** `carga` es del enrutador de /nube: la app instalada no trae cookie de
 *  sesión, trae su token de licencia, y la puerta de /nube lo abre y lo deja
 *  aquí. Opcional porque en el resto de la API no existe. */
export type Vars = { sesion: Sesion; app: App; quien: Quien; org_id: string; carga?: TokenLicencia;
  /** 2-oct · la empresa a la que pertenece el dominio por el que entró la
   *  petición (cabecera X-Dominio-Empresa, que pone la puerta de las
   *  empresas). Opcional: por api.taller101.com no existe. */
  dominio?: DominioResuelto;
};
export type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/* Se arma la Response a mano en vez de con c.json(): el tipado de Hono para el
 * codigo de estado obliga a un literal, y pasarle una variable hace que
 * TypeScript se meta en una instanciacion de tipos sin fondo (TS2589). Aqui no
 * hace falta nada de eso: la forma de la respuesta es siempre la misma. */

const JSONH = { 'Content-Type': 'application/json; charset=UTF-8' };

export const ok = (_c: Ctx, data: unknown, estado = 200, cabeceras?: Record<string, string>): Response =>
  new Response(JSON.stringify({ ok: true, data }), { status: estado, headers: { ...JSONH, ...cabeceras } });

export const err = (_c: Ctx, error: string, estado = 400, detalle?: unknown): Response =>
  new Response(JSON.stringify(detalle === undefined ? { ok: false, error } : { ok: false, error, detalle }), {
    status: estado,
    headers: JSONH,
  });

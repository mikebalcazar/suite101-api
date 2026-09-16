/* Toda respuesta de la API tiene la misma forma: {ok:true,data} o
 * {ok:false,error}. El `error` es corto y en snake_case para que una app pueda
 * prender por él sin leer texto. */

import type { Context } from 'hono';
import type { App } from '../schema/tipos';
import type { Env } from './entorno';
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
  clase: 'miembro' | 'personal' | 'cliente';
  usuario_id: string;
  rol?: Miembro['rol'];
  negocios: string[];
  ref_id?: string;
  ve_dinero: boolean;
  /** owner, admin y socio ven costos y egresos. staff no. */
  ve_costos: boolean;
}

export type Vars = { sesion: Sesion; app: App; quien: Quien; org_id: string };
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

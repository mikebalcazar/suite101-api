/* Las plataformas de una empresa, con su dirección (10-oct-2026).
 *
 * Mike: «cuando se abre una empresa nueva, al correo que se envía la
 * invitación de inicio, debe llegarle una lista con las URLs de las
 * plataformas a las que tiene acceso, con su URL de empresa».
 *
 * Una por app prendida, más la puerta de la suite y el panel del director.
 * Si la empresa tiene dominio propio (DOMINIOS.md), la dirección es la suya
 * (`quell.acme.com`, sin el «101»; la plataforma `suite101.acme.com`) y se da
 * también la general (`quell101.taller101.com`) por si su DNS todavía no está
 * listo: el correo sale en el alta y los CNAME los pone después la gente de
 * sistemas de la empresa. La descarga de nest101 sale de la puerta de la suite
 * de la empresa (suite101.acme.com/descargar/nest101).
 *
 * Los nombres y las líneas son los de la puerta de la suite
 * (`src/paginas/suite.html`): la gente las conoce por esos nombres, no por
 * el interno (`cotizador101` es quote101; `investor101`, patron101). */

import type { Org } from '../schema/tipos';
import { LLAVE_APP, type App } from '../schema/tipos';
import { APPS_DOMINIO, PREFIJO, type AppDominio } from './dominios';

export interface Plataforma {
  nombre: string;
  lema: string;
  /** La dirección para entrar: la de la empresa si tiene dominio. */
  url: string;
  /** La general en taller101.com, sólo si `url` es la del dominio propio. */
  general: string | null;
}

const BASE = 'taller101.com';

/** Lo que sale en la lista, en el orden de la puerta de la suite. `sub` es el
 *  nombre del sitio; `ruta`, lo que va después (el panel de roster101). */
const CATALOGO: Array<{ app: App; nombre: string; lema: string; sub: string; ruta?: string }> = [
  { app: 'dash101', nombre: 'dash101', lema: 'El dinero del taller', sub: 'dash101' },
  { app: 'quell101', nombre: 'quell101', lema: 'La obra sobre el plano', sub: 'quell101' },
  { app: 'cotizador101', nombre: 'quote101', lema: 'Cotizaciones', sub: 'quote101' },
  { app: 'cost101', nombre: 'cost101', lema: 'Costos por partida', sub: 'cost101' },
  { app: 'investor101', nombre: 'patron101', lema: 'Inversionistas', sub: 'patron101' },
  { app: 'bill101', nombre: 'bill101', lema: 'Facturas e impuestos estimados', sub: 'bill101' },
  { app: 'supply101', nombre: 'supply101', lema: 'Compras y reembolsos', sub: 'supply101' },
  { app: 'roster101', nombre: 'roster101', lema: 'Expedientes del personal', sub: 'roster101', ruta: '/admin' },
  { app: 'peek101', nombre: 'peek101', lema: 'Lo que ve tu cliente', sub: 'peek101' },
  { app: 'nest101', nombre: 'nest101', lema: 'Programa para Windows (se descarga)', sub: 'suite101', ruta: '/descargar/nest101' },
];

/** La dirección de un sitio: en el dominio de la empresa si ese sitio tiene
 *  puerta ahí, y si no la general. */
function direccion(sub: string, ruta: string, dominio: string | null): { url: string; general: string | null } {
  const general = `https://${sub}.${BASE}${ruta}`;
  if (dominio && (APPS_DOMINIO as readonly string[]).includes(sub)) return { url: `https://${PREFIJO[sub as AppDominio]}.${dominio}${ruta}`, general };
  return { url: general, general: null };
}

/** Las plataformas de la empresa: la puerta de la suite, el panel del
 *  director y una por cada app prendida. `urlPanel` es el panel general del
 *  director (env URL_PANEL_DIRECTOR), que se respeta cuando no hay dominio. */
export function plataformasDe(o: Pick<Org, 'apps' | 'dominio'>, urlPanel = `https://workshop101.${BASE}`): Plataforma[] {
  const dominio = o.dominio || null;
  const lista: Plataforma[] = [];
  lista.push({ nombre: 'suite101', lema: 'La puerta: todas tus apps en un lugar', ...direccion('suite101', '', dominio) });
  const panel = direccion('workshop101', '', dominio);
  lista.push({ nombre: 'workshop101', lema: 'Tu equipo y sus accesos', url: dominio ? panel.url : urlPanel, general: dominio ? panel.general : null });
  for (const p of CATALOGO) {
    if (o.apps?.[LLAVE_APP[p.app]] !== true) continue;
    lista.push({ nombre: p.nombre, lema: p.lema, ...direccion(p.sub, p.ruta || '', dominio) });
  }
  return lista;
}

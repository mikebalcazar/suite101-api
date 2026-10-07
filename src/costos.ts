/* cost101 — la cuenta del precio unitario (7-oct-2026).
 *
 * Es la MISMA cuenta que hace la pantalla de cost101 mientras se teclea, y
 * vive aquí porque el precio que leen las demás apps no puede depender de
 * que alguien tenga cost101 abierto: cuando cambia un costo base, la API
 * recalcula todos los productos que lo usan.
 *
 * Por componente, para UNA unidad del producto:
 *   material    cant × (1 + desp%/100) × precio
 *   oficio      horas × precio por hora                       (mano de obra)
 *   cuadrilla   costo de la jornada / rendimiento por jornada (mano de obra)
 *   equipo      horas × precio por hora
 *   subpartida  cant × COSTO DIRECTO de la otra (sin sus indirectos ni su
 *               utilidad: si no, se cobrarían dos veces)
 *
 *   herr = MO × herr%
 *   CD   = mat + MO + equipo + herr + sub
 *   ind  = CD × ind%
 *   util = (CD + ind) × util%
 *   PU   = CD + ind + util          (los costos base traen IVA → PU con IVA)
 *
 * Se trabaja en pesos con decimales, como la pantalla, y se redondea al
 * centavo sólo al final: redondear cada renglón haría que la pantalla y la
 * base difirieran por centavos.
 */

export const IVA = 0.16;
export const TIPOS_COSTO = ['material', 'mo', 'equipo'] as const;
export type TipoCosto = (typeof TIPOS_COSTO)[number];
export const ESTADOS_PRODUCTO = ['borrador', 'aprobado'] as const;
export const PROFUNDIDAD_MAXIMA = 5;

export interface Componente { k?: string; tipo: 'insumo' | 'cuadrilla' | 'partida'; ref: string; cant: number; desp?: number }
export interface Apu { herr: number; ind: number; util: number; comps: Componente[] }
export interface CostoBase { id: string; tipo: string; precio: number; nombre?: string }
export interface Cuadrilla { id: string; horas: number; miembros: Array<{ ref: string; cant: number }>; nombre?: string }
export interface ProductoApu { id: string; apu: Apu | null; nombre?: string }

/** Todo en centavos enteros. `pu` trae IVA; `precio` es `pu` sin IVA, que es
 *  lo que va a `productos.precio`. */
export interface Desglose { mat: number; mo: number; eq: number; herr: number; sub: number; cd: number; ind: number; util: number; pu: number; iva: number; precio: number }

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export interface Fuentes {
  costos: Map<string, CostoBase>;
  cuadrillas: Map<string, Cuadrilla>;
  productos: Map<string, ProductoApu>;
}

/** El costo de una jornada de la cuadrilla, en pesos. */
export function jornada(q: Cuadrilla, f: Fuentes): number {
  let porHora = 0;
  for (const m of q.miembros ?? []) {
    const o = f.costos.get(m.ref);
    if (o) porHora += (o.precio / 100) * num(m.cant);
  }
  return porHora * num(q.horas || 8);
}

interface Crudo { mat: number; mo: number; eq: number; herr: number; sub: number; cd: number; ind: number; util: number; pu: number }

function crudo(apu: Apu, f: Fuentes, nivel: number): Crudo {
  let mat = 0, mo = 0, eq = 0, sub = 0;
  for (const c of apu.comps ?? []) {
    if (c.tipo === 'insumo') {
      const o = f.costos.get(c.ref);
      if (!o) continue;
      const precio = o.precio / 100;
      if (o.tipo === 'material') mat += num(c.cant) * (1 + num(c.desp) / 100) * precio;
      else if (o.tipo === 'mo') mo += num(c.cant) * precio;
      else eq += num(c.cant) * precio;
    } else if (c.tipo === 'cuadrilla') {
      const q = f.cuadrillas.get(c.ref);
      if (!q) continue;
      const r = num(c.cant);
      mo += r > 0 ? jornada(q, f) / r : 0;
    } else {
      const p = f.productos.get(c.ref);
      if (!p?.apu || nivel >= PROFUNDIDAD_MAXIMA - 1) continue;
      sub += num(c.cant) * crudo(p.apu, f, nivel + 1).cd;
    }
  }
  const herr = mo * num(apu.herr) / 100;
  const cd = mat + mo + eq + herr + sub;
  const ind = cd * num(apu.ind) / 100;
  const util = (cd + ind) * num(apu.util) / 100;
  return { mat, mo, eq, herr, sub, cd, ind, util, pu: cd + ind + util };
}

const centavos = (pesos: number): number => Math.round(pesos * 100 + Number.EPSILON);

export function calcular(apu: Apu, f: Fuentes): Desglose {
  const c = crudo(apu, f, 0);
  const pu = centavos(c.pu);
  const precio = centavos(c.pu / (1 + IVA));
  return {
    mat: centavos(c.mat), mo: centavos(c.mo), eq: centavos(c.eq), herr: centavos(c.herr), sub: centavos(c.sub),
    cd: centavos(c.cd), ind: centavos(c.ind), util: centavos(c.util), pu, iva: pu - precio, precio,
  };
}

/** ¿El producto `p` usa a `id` como subpartida, directo o a través de otras? */
export function usaA(p: ProductoApu, id: string, f: Fuentes, nivel = 0): boolean {
  if (!p.apu || nivel > PROFUNDIDAD_MAXIMA) return false;
  return p.apu.comps.some((c) => c.tipo === 'partida' && (c.ref === id || usaA(f.productos.get(c.ref) ?? { id: '', apu: null }, id, f, nivel + 1)));
}

/** Deja la receta limpia o dice qué no cuadra. No consulta la base: que cada
 *  `ref` exista lo revisa quien la tiene enfrente (OrgDB.revisarApu). */
export function limpiarApu(v: unknown): { ok: true; apu: Apu } | { ok: false; errores: Record<string, string> } {
  const errores: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, errores: { apu: 'La receta es un objeto con comps, herr, ind y util.' } };
  const o = v as Record<string, unknown>;
  const pctDe = (k: string, omision: number): number => {
    if (o[k] === undefined || o[k] === null || o[k] === '') return omision;
    const n = Number(o[k]);
    if (!Number.isFinite(n) || n < 0 || n > 500) { errores[k] = 'Es un porcentaje entre 0 y 500.'; return omision; }
    return n;
  };
  const apu: Apu = { herr: pctDe('herr', 3), ind: pctDe('ind', 12), util: pctDe('util', 10), comps: [] };
  const lista = Array.isArray(o.comps) ? o.comps : [];
  if (lista.length > 200) errores.comps = 'Son demasiados componentes (máximo 200).';
  lista.slice(0, 200).forEach((c, i) => {
    const x = (c ?? {}) as Record<string, unknown>;
    const tipo = String(x.tipo ?? '');
    const ref = String(x.ref ?? '').trim();
    const cant = Number(x.cant);
    const desp = x.desp === undefined || x.desp === null || x.desp === '' ? 0 : Number(x.desp);
    if (!['insumo', 'cuadrilla', 'partida'].includes(tipo)) { errores[`comps.${i}.tipo`] = 'insumo, cuadrilla o partida.'; return; }
    if (!ref) { errores[`comps.${i}.ref`] = 'Falta a qué apunta.'; return; }
    if (!Number.isFinite(cant) || cant < 0) { errores[`comps.${i}.cant`] = 'La cantidad es un número, cero o más.'; return; }
    if (!Number.isFinite(desp) || desp < 0 || desp > 1000) { errores[`comps.${i}.desp`] = 'El desperdicio es un porcentaje, cero o más.'; return; }
    apu.comps.push({ k: String(x.k ?? `c${i}`), tipo: tipo as Componente['tipo'], ref, cant, desp });
  });
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, apu };
}

/** Los miembros de una cuadrilla, limpios. */
export function limpiarMiembros(v: unknown): { ok: true; miembros: Cuadrilla['miembros'] } | { ok: false; errores: Record<string, string> } {
  if (!Array.isArray(v)) return { ok: false, errores: { miembros: 'Es una lista de { ref, cant }.' } };
  const errores: Record<string, string> = {};
  const miembros: Cuadrilla['miembros'] = [];
  v.slice(0, 50).forEach((m, i) => {
    const x = (m ?? {}) as Record<string, unknown>;
    const ref = String(x.ref ?? '').trim();
    const cant = Number(x.cant);
    if (!ref) { errores[`miembros.${i}.ref`] = 'Falta el oficio.'; return; }
    if (!Number.isFinite(cant) || cant < 0 || cant > 1000) { errores[`miembros.${i}.cant`] = 'La cantidad es un número, cero o más.'; return; }
    miembros.push({ ref, cant });
  });
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, miembros };
}

/** La fecha de hoy en México (AAAA-MM-DD). El historial de precios es por
 *  día y el día es el del taller, no el de UTC: a las 7 de la tarde en México
 *  en UTC ya es mañana. */
export function hoyMx(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p.slice(0, 10);
}

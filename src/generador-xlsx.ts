/* El generador de una partida de cost101, en Excel.
 *
 * Mike, 11-oct-2026: «necesito poder exportar el generador del producto del
 * catálogo en cost101 en formato PDF y excel». El PDF lo arma la pantalla
 * (una hoja para imprimir); el Excel sale de aquí, con el mismo armador sin
 * dependencias que el estado de cuenta (src/xlsx.ts), y con las cuentas de
 * src/costos.ts: lo que dice el archivo es lo que vale la partida en la base,
 * no una copia de la cuenta de la pantalla.
 *
 * Una hoja, «Generador»: los datos de la partida, sus componentes por
 * sección —materiales, artículos comprados, mano de obra (oficios y
 * cuadrillas), herramienta menor, equipo y subpartidas— con cantidad,
 * desperdicio, precio unitario e importe, y abajo el resumen: costo directo,
 * indirectos, utilidad y el precio unitario con IVA. Todo en pesos con
 * centavos, como número: se puede sumar en Excel.
 */

import { calcular, jornada, type Apu, type Fuentes } from './costos';
import type { Celda, Hoja } from './xlsx';

type Fila = Record<string, any>;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pesos = (centavos: number): number => Math.round(centavos) / 100;
const redondo = (x: number): number => Math.round(x * 100 + Number.EPSILON) / 100;

/** Las fuentes de la cuenta a partir de los renglones de la base. */
export function fuentesDe(costos: Fila[], cuadrillas: Fila[], productos: Fila[]): Fuentes {
  return {
    costos: new Map(costos.map((c) => [String(c.id), { id: String(c.id), tipo: String(c.tipo), precio: num(c.precio), nombre: c.nombre }])),
    cuadrillas: new Map(cuadrillas.map((q) => [String(q.id), { id: String(q.id), horas: num(q.horas) || 8, miembros: q.miembros ?? [], nombre: q.nombre }])),
    productos: new Map(productos.map((p) => [String(p.id), { id: String(p.id), apu: (p.apu as Apu | null) ?? null, nombre: p.nombre }])),
  };
}

const SECCIONES: Array<[string, string]> = [
  ['mat', 'Materiales'], ['art', 'Artículos comprados'], ['mo', 'Mano de obra'], ['eq', 'Equipo'], ['sub', 'Subpartidas'],
];

export function libroDelGenerador(producto: Fila, costos: Fila[], cuadrillas: Fila[], productos: Fila[]): Hoja[] {
  const f = fuentesDe(costos, cuadrillas, productos);
  const apu = (producto.apu as Apu | null) ?? { herr: 0, ind: 0, util: 0, comps: [] };
  const porId = { costo: new Map(costos.map((c) => [String(c.id), c])), cuad: new Map(cuadrillas.map((q) => [String(q.id), q])), prod: new Map(productos.map((p) => [String(p.id), p])) };
  const u = String(producto.unidad || 'u');

  /* Cada componente con su sección, como lo pinta el generador. */
  const renglones: Record<string, Celda[][]> = { mat: [], art: [], mo: [], eq: [], sub: [] };
  for (const c of apu.comps ?? []) {
    const cant = num(c.cant);
    if (c.tipo === 'insumo') {
      const o = porId.costo.get(c.ref);
      if (!o) continue;
      const precio = pesos(num(o.precio));
      const tipo = String(o.tipo);
      const desp = tipo === 'material' ? num(c.desp) : 0;
      const sec = tipo === 'material' ? 'mat' : tipo === 'comprado' ? 'art' : tipo === 'mo' ? 'mo' : 'eq';
      renglones[sec].push([o.clave ?? '', o.nombre ?? '', `${o.unidad ?? ''} / ${u}`, cant, tipo === 'material' ? desp : null, precio, redondo(cant * (1 + desp / 100) * precio)]);
    } else if (c.tipo === 'cuadrilla') {
      const q = porId.cuad.get(c.ref);
      if (!q) continue;
      const j = jornada({ id: String(q.id), horas: num(q.horas) || 8, miembros: q.miembros ?? [] }, f); // en pesos
      renglones.mo.push([q.clave ?? '', `Cuadrilla · ${q.nombre ?? ''}`, `${u} / jornada`, cant, null, redondo(j), cant > 0 ? redondo(j / cant) : 0]);
    } else {
      const p = porId.prod.get(c.ref);
      if (!p?.apu) continue;
      const cd = calcular(p.apu as Apu, f).cd / 100;
      renglones.sub.push([p.codigo ?? '', p.nombre ?? '', `${p.unidad ?? ''} / ${u}`, cant, null, cd, redondo(cant * cd)]);
    }
  }

  const d = calcular(apu, f);
  const filas: Celda[][] = [
    ['Generador de partida', `${producto.codigo ?? ''} · ${producto.nombre ?? ''}`],
    ['Descripción', String(producto.descripcion ?? '')],
    ['Unidad', u],
    ['Categoría', String(producto.categoria ?? '')],
    ['Estado', producto.estado === 'aprobado' ? 'Aprobada' : 'Borrador'],
    [],
    ['Sección', 'Clave', 'Concepto', 'Unidad', 'Cantidad', 'Desperdicio %', 'Precio unitario', 'Importe'],
  ];
  for (const [k, titulo] of SECCIONES) {
    for (const r of renglones[k]) filas.push([titulo, ...r]);
    if (k === 'mo' && (renglones.mo.length || num(apu.herr))) filas.push([titulo, '', `Herramienta menor (${num(apu.herr)} % de la mano de obra)`, '', null, null, null, pesos(d.herr)]);
  }
  filas.push(
    [],
    ['Resumen', 'Importe'],
    ['Materiales', pesos(d.mat)],
    ['Artículos comprados', pesos(d.art)],
    ['Mano de obra', pesos(d.mo)],
    ['Herramienta menor', pesos(d.herr)],
    ['Equipo', pesos(d.eq)],
    ['Subpartidas', pesos(d.sub)],
    ['Costo directo', pesos(d.cd)],
    [`Indirectos (${num(apu.ind)} %)`, pesos(d.ind)],
    [`Utilidad (${num(apu.util)} %)`, pesos(d.util)],
    [`Precio unitario por ${u}, IVA incluido`, pesos(d.pu)],
    ['IVA incluido', pesos(d.iva)],
    ['Precio sin IVA', pesos(d.precio)],
    [],
    ['Los precios base traen IVA; por eso el precio unitario lo incluye.'],
  );
  return [{ nombre: 'Generador', filas }];
}

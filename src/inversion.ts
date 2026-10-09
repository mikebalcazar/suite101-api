/* investor101 — la cuenta de un préstamo (contrato 0.82.0).
 *
 * UN SOLO LUGAR. La tabla de pagos que ve el inversionista, la que ve quien
 * dirige, la que dash101 pone en su flujo y la que se imprime en el pagaré
 * salen de aquí. Es un módulo puro: no lee la base ni el reloj.
 *
 * Mike, 8-oct-2026: «Ej. prestan 50k a taller y se le van a pagar cada mes
 * (durante 10 meses) 5k más los intereses acordados». Y con botones, a la
 * pregunta de cómo se calcula el interés: «Libre por préstamo».
 *
 * LAS REGLAS, que son decisiones y no detalles:
 *
 *   · Dinero en centavos, entero. La tasa en PUNTOS BASE (250 = 2.50 %): una
 *     tasa en REAL arrastra el mismo error de coma flotante que la regla de
 *     los centavos vino a quitar.
 *   · `mensual`: la tasa es por mes. Un mes entero —del 8 al 8— es un mes, sea
 *     de 28 o de 31 días; los días que sobran se prorratean entre 30. Tres
 *     semanas son 21/30 de la tasa.
 *   · `anual`: días reales entre 365.
 *   · `fija`: la tasa es por TODO el plazo y sobre el capital original, sin
 *     importar cuántos días sean. Se reparte pareja entre los pagos.
 *   · `unico`: capital e interés en una sola fecha.
 *   · `parcialidades`: el capital en partes iguales; el interés de cada pago
 *     es sobre el saldo que seguía debiéndose en ese periodo (salvo `fija`).
 *     Los centavos que no se reparten parejo van al último pago.
 *   · El interés se redondea al centavo, la mitad hacia arriba, en cada pago.
 *
 * La cuenta va en BigInt: saldo × puntos base × días se sale del entero
 * seguro de JavaScript con préstamos que no son de fantasía.
 */

import {
  ESQUEMAS_PAGO, FRECUENCIAS_PAGO, TIPOS_TASA,
  type CondicionesPrestamo, type EsquemaPago, type FrecuenciaPago, type RenglonDePago, type TipoTasa,
} from '../schema/tipos';

/** Lo más que dura un préstamo. Mike: «pueden ser semanas o meses, pero no
 *  más». Dos años en meses es el tope; más que eso ya no es un puente de
 *  flujo y se captura mal por error antes que a propósito. */
export const PLAZO_MAXIMO_MESES = 24;
export const PAGOS_MAXIMOS = 104; // dos años de pagos semanales

const DIA_MS = 86_400_000;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Es un día de verdad? '2026-02-30' no lo es. */
export function esDia(v: unknown): v is string {
  if (typeof v !== 'string' || !RE_DIA.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

const aUTC = (dia: string): number => {
  const [a, m, d] = dia.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
const deUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const sumarDias = (dia: string, n: number): string => deUTC(aUTC(dia) + n * DIA_MS);
export const diasEntre = (desde: string, hasta: string): number => Math.round((aUTC(hasta) - aUTC(desde)) / DIA_MS);

/** Suma meses conservando el día; el 31 en un mes corto es su último día. */
export function sumarMeses(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Meses enteros y días sueltos entre dos fechas. Del 8-oct al 29-oct: 0 y
 *  21. Del 8-oct al 8-dic: 2 y 0. Del 31-ene al 28-feb: 1 y 0 (el mes corto
 *  ya se cumplió). */
export function mesesYDias(desde: string, hasta: string): { meses: number; dias: number } {
  if (hasta <= desde) return { meses: 0, dias: 0 };
  let meses = 0;
  while (sumarMeses(desde, meses + 1) <= hasta) meses += 1;
  return { meses, dias: diasEntre(sumarMeses(desde, meses), hasta) };
}

/** numerador / denominador, al entero más cercano, la mitad hacia arriba. */
const dividir = (num: bigint, den: bigint): number => Number((num * 2n + den) / (den * 2n));

/** El interés de un saldo entre dos fechas. `fija` no pasa por aquí. */
export function interesDelPeriodo(saldo: number, tipo: Exclude<TipoTasa, 'fija'>, tasa_pb: number, desde: string, hasta: string): number {
  if (saldo <= 0 || tasa_pb <= 0 || hasta <= desde) return 0;
  const s = BigInt(saldo);
  const t = BigInt(tasa_pb);
  if (tipo === 'mensual') {
    const { meses, dias } = mesesYDias(desde, hasta);
    return dividir(s * t * BigInt(meses * 30 + dias), 10_000n * 30n);
  }
  return dividir(s * t * BigInt(diasEntre(desde, hasta)), 10_000n * 365n);
}

/** Las fechas de pago de un préstamo. */
export function fechasDePago(c: {
  esquema: EsquemaPago; frecuencia?: FrecuenciaPago | null; num_pagos?: number | null;
  fecha_inicio: string; fecha_primer_pago?: string | null; fecha_vencimiento?: string | null;
}): string[] {
  if (c.esquema === 'unico') return [String(c.fecha_vencimiento)];
  const f = c.frecuencia as FrecuenciaPago;
  const paso = (base: string, k: number): string =>
    f === 'semanal' ? sumarDias(base, 7 * k) : f === 'quincenal' ? sumarDias(base, 15 * k) : sumarMeses(base, k);
  const primero = c.fecha_primer_pago || paso(c.fecha_inicio, 1);
  return Array.from({ length: Number(c.num_pagos) }, (_, k) => paso(primero, k));
}

export type Errores = Record<string, string>;

/** Con palabras por campo, como el resto de la API. Vacío = todo bien. */
export function revisarCondiciones(c: Partial<CondicionesPrestamo>): Errores {
  const e: Errores = {};
  if (!Number.isInteger(c.monto) || Number(c.monto) <= 0) e.monto = 'El monto va en centavos, entero y mayor que cero.';
  if (!(TIPOS_TASA as readonly unknown[]).includes(c.tipo_tasa)) e.tipo_tasa = `El tipo de tasa es uno de: ${TIPOS_TASA.join(', ')}.`;
  if (!Number.isInteger(c.tasa_pb) || Number(c.tasa_pb) < 0 || Number(c.tasa_pb) > 1_000_000) e.tasa_pb = 'La tasa va en puntos base (250 = 2.50 %), entera y no negativa.';
  if (!(ESQUEMAS_PAGO as readonly unknown[]).includes(c.esquema)) e.esquema = `El esquema es uno de: ${ESQUEMAS_PAGO.join(', ')}.`;
  if (!esDia(c.fecha_inicio)) e.fecha_inicio = 'La fecha de inicio no es un día (AAAA-MM-DD).';
  if (Object.keys(e).length) return e;

  if (c.esquema === 'unico') {
    if (!esDia(c.fecha_vencimiento)) e.fecha_vencimiento = 'Falta el día en que se paga (AAAA-MM-DD).';
    else if (c.fecha_vencimiento <= c.fecha_inicio!) e.fecha_vencimiento = 'El día de pago tiene que ser después del inicio.';
  } else {
    if (!(FRECUENCIAS_PAGO as readonly unknown[]).includes(c.frecuencia)) e.frecuencia = `Cada cuánto se paga: ${FRECUENCIAS_PAGO.join(', ')}.`;
    if (!Number.isInteger(c.num_pagos) || Number(c.num_pagos) < 1 || Number(c.num_pagos) > PAGOS_MAXIMOS) e.num_pagos = `El número de pagos va de 1 a ${PAGOS_MAXIMOS}.`;
    if (c.fecha_primer_pago != null && c.fecha_primer_pago !== '') {
      if (!esDia(c.fecha_primer_pago)) e.fecha_primer_pago = 'El primer pago no es un día (AAAA-MM-DD).';
      else if (c.fecha_primer_pago <= c.fecha_inicio!) e.fecha_primer_pago = 'El primer pago tiene que ser después del inicio.';
    }
  }
  if (Object.keys(e).length) return e;

  const fechas = fechasDePago(c as CondicionesPrestamo);
  const ultima = fechas[fechas.length - 1];
  if (ultima > sumarMeses(c.fecha_inicio!, PLAZO_MAXIMO_MESES)) {
    e[c.esquema === 'unico' ? 'fecha_vencimiento' : 'num_pagos'] = `El plazo no pasa de ${PLAZO_MAXIMO_MESES} meses.`;
  }
  return e;
}

/** La tabla de pagos de unas condiciones ya revisadas. */
export function tablaDePagos(c: CondicionesPrestamo): RenglonDePago[] {
  const fechas = fechasDePago(c);
  const n = fechas.length;
  const parejo = Math.floor(c.monto / n);
  const fijoTotal = c.tipo_tasa === 'fija' ? dividir(BigInt(c.monto) * BigInt(c.tasa_pb), 10_000n) : 0;
  const fijoParejo = Math.floor(fijoTotal / n);

  const salida: RenglonDePago[] = [];
  let saldo = c.monto;
  let desde = c.fecha_inicio;
  for (let i = 0; i < n; i++) {
    const ultimo = i === n - 1;
    const capital = ultimo ? saldo : parejo;
    const interes = c.tipo_tasa === 'fija'
      ? (ultimo ? fijoTotal - fijoParejo * (n - 1) : fijoParejo)
      : interesDelPeriodo(saldo, c.tipo_tasa, c.tasa_pb, desde, fechas[i]);
    saldo -= capital;
    salida.push({ numero: i + 1, fecha: fechas[i], capital, interes, total: capital + interes, saldo });
    desde = fechas[i];
  }
  return salida;
}

export interface TotalesDeTabla { capital: number; interes: number; total: number; pagos: number; primera: string | null; ultima: string | null }

export function totalesDe(tabla: Array<{ fecha: string; capital: number; interes: number }>): TotalesDeTabla {
  const capital = tabla.reduce((s, r) => s + r.capital, 0);
  const interes = tabla.reduce((s, r) => s + r.interes, 0);
  const fechas = tabla.map((r) => r.fecha).sort();
  return { capital, interes, total: capital + interes, pagos: tabla.length, primera: fechas[0] ?? null, ultima: fechas[fechas.length - 1] ?? null };
}

/* ─────────────── el aviso de riesgos (0.84.0) ───────────────
 *
 * Mike, 8-oct-2026: «Necesito agregar un disclaimer de los riesgos de la
 * inversión, sobre todo riesgos de no pago del cliente».
 *
 * Es el texto BASE: cada empresa lo puede cambiar en Ajustes (lo natural es
 * que lo ajuste su abogado) y vaciarlo lo regresa a éste. No nombra a la
 * empresa —dice «la empresa»— para que el mismo texto sirva guardado en una
 * oferta, impreso en un pagaré y leído en la pantalla sin plantillas.
 *
 * El primer punto es el que Mike pidió: el dinero con el que se paga sale de
 * lo que la empresa le cobra a SUS clientes. Los demás son lo que cualquiera
 * que presta tiene derecho a leer antes de decir que sí. */
export const RIESGOS_BASE = [
  'Prestarle dinero a la empresa tiene riesgo. Antes de entrar, toma en cuenta:',
  '1. Depende de que los clientes de la empresa le paguen. El dinero con el que se te paga sale de lo que la empresa cobra por sus proyectos. Si un cliente se atrasa o no paga, tu pago puede atrasarse, reprogramarse o no cubrirse completo.',
  '2. Puedes perder dinero. El rendimiento es lo que se acordó, no una ganancia asegurada. En el peor caso puedes no recuperar una parte o todo lo que prestaste.',
  '3. No es un depósito ni una inversión regulada. Es un préstamo entre particulares. No lo protege el IPAB ni lo supervisa ninguna autoridad financiera.',
  '4. No hay más garantía que el pagaré. No hay aval, prenda ni hipoteca, salvo que se acuerde por escrito.',
  '5. No se puede retirar antes. El dinero regresa en las fechas de la tabla de pagos, no cuando lo necesites.',
  '6. Presta sólo lo que no vayas a necesitar durante el plazo.',
  '7. Los intereses que recibas pueden causar impuestos. Consúltalo con tu contador.',
].join('\n');

/** Lo más largo que puede ser el aviso de una empresa. */
export const RIESGOS_MAX = 6000;

/** «2.5 % mensual», «24 % anual», «5 % por el plazo». Para correos y avisos. */
export function tasaEnPalabras(tipo: TipoTasa, tasa_pb: number): string {
  const n = (tasa_pb / 100).toFixed(2).replace(/\.?0+$/, '');
  return `${n} % ${tipo === 'mensual' ? 'mensual' : tipo === 'anual' ? 'anual' : 'por todo el plazo'}`;
}

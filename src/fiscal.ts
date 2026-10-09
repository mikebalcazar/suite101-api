/* bill101 — la cuenta de los impuestos. Contrato 0.85.0.
 *
 * Mike, 8-oct-2026: «un estado de cuenta de movimientos exclusivamente
 * fiscales (…) para llevar un control fiscal de los impuestos y
 * estimaciones. Esta ventana debe calcular los pagos de impuestos que deben
 * hacerse mensuales y anuales». Con botones: IVA mensual, ISR provisional
 * mensual e ISR anual estimado, para una PERSONA MORAL DEL RÉGIMEN GENERAL.
 *
 * Este archivo es la cuenta y nada más: recibe facturas ya leídas y devuelve
 * números. No toca la base, no sabe de rutas. Es la única cuenta —la
 * pantalla no suma nada— y `pruebas/fiscal.spec.ts` la mide contra casos
 * hechos a mano.
 *
 * LO QUE ES Y LO QUE NO. Es una ESTIMACIÓN con lo que está facturado: sirve
 * para saber cuánto apartar y para llegar con el contador sabiendo de qué
 * tamaño es el pago. No es la declaración. Lo que la factura no dice —la
 * depreciación, la nómina que no se timbró, la PTU, el ajuste por
 * inflación— entra por los «ajustes del contador» del ejercicio, a mano.
 *
 * LAS TRES REGLAS, dichas una vez:
 *
 *   IVA (mensual, por FLUJO). Se debe el IVA que se COBRÓ y se acredita el
 *   que se PAGÓ. Una factura de contado (PUE) cuenta el día que se emitió.
 *   Una a crédito (PPD) cuenta cuando se paga, y por la parte que se pagó:
 *   lo dice su complemento de pago, o si no lo hay, el movimiento de dinero
 *   que se le ligó. Una PPD sin pago registrado todavía no cuenta —y se dice
 *   aparte cuánto IVA anda así—. Si un mes sale a favor, se arrastra.
 *
 *   ISR PROVISIONAL (mensual, por lo FACTURADO). Ingresos del año hasta ese
 *   mes × coeficiente de utilidad × tasa, menos lo que ya se pagó de
 *   provisionales y menos lo que le retuvieron a la empresa. El coeficiente
 *   sale de la declaración anual anterior y lo da el contador: sin él no hay
 *   cuenta, y se dice que falta en vez de inventar uno.
 *
 *   ISR ANUAL (estimado). Ingresos facturados menos deducciones facturadas,
 *   por la tasa, menos provisionales pagados.
 *
 * Las notas de crédito (comprobante de egreso) RESTAN del lado en que
 * están: la que emite la empresa baja sus ingresos, la que recibe baja sus
 * compras. Es como el SAT arma la declaración precargada, y es lo que evita
 * contar dos veces un anticipo que luego se aplica.
 *
 * Todo en centavos, entero. La tasa de ISR va en puntos base (3000 = 30 %) y
 * el coeficiente en diezmilésimas (523 = 0.0523), que son los cuatro
 * decimales con que se declara.
 */

export type Trato = 'normal' | 'inversion' | 'no_deducible';
export const TRATOS: readonly Trato[] = ['normal', 'inversion', 'no_deducible'];

export interface PagoDeFactura { fecha: string; monto: number; iva?: number | null }

export interface FacturaFiscal {
  id: string;
  /** De qué lado está para la empresa: la que emitió o la que recibió. */
  lado: 'ingreso' | 'egreso';
  /** I factura, E nota de crédito, P complemento de pago, N nómina, T traslado. */
  tc: 'I' | 'E' | 'P' | 'N' | 'T';
  fecha: string;
  metodo: string | null;
  subtotal: number;
  iva: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
  /** Sólo importa en las recibidas. `inversion`: un activo —su IVA sí se
   *  acredita, pero no es gasto del año, se deprecia—. `no_deducible`: ni
   *  una cosa ni la otra. */
  trato: Trato;
  /** Con qué se pagó, para las que son a crédito. */
  pagos: PagoDeFactura[];
}

export interface Ejercicio {
  anio: number;
  /** En diezmilésimas. `null`: todavía no lo dan. */
  coeficiente: number | null;
  /** En puntos base. */
  tasa_isr: number;
  /** Pérdidas fiscales de años anteriores que todavía se pueden restar. */
  perdidas: number;
  /** Saldo a favor de IVA con el que arranca el año. */
  iva_a_favor_inicial: number;
  /** Deducciones que no están en ninguna factura (depreciación, nómina sin
   *  timbrar, PTU…). Las da el contador. */
  ajuste_deducciones: number;
  /** Ingresos acumulables que no están facturados. */
  ajuste_ingresos: number;
}

export interface PagoDeImpuesto { impuesto: 'iva' | 'isr_provisional' | 'isr_anual'; periodo: string; monto: number }

export const TASA_ISR_PM = 3000;
export const ejercicioVacio = (anio: number): Ejercicio => ({
  anio, coeficiente: null, tasa_isr: TASA_ISR_PM, perdidas: 0, iva_a_favor_inicial: 0, ajuste_deducciones: 0, ajuste_ingresos: 0,
});

const dos = (n: number) => String(n).padStart(2, '0');
export const mesesDe = (anio: number): string[] => Array.from({ length: 12 }, (_, i) => `${anio}-${dos(i + 1)}`);

/** El día en que vence la declaración de un mes: el 17 del siguiente. Es la
 *  fecha general; el SAT da días de más según el RFC y recorre los inhábiles,
 *  y eso no se calcula aquí: es la fecha para no pasarse. */
export function venceMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-17` : `${a}-${dos(m + 1)}-17`;
}
/** La anual de una persona moral se presenta a más tardar el 31 de marzo. */
export const venceAnual = (anio: number): string => `${anio + 1}-03-31`;

/** Reparto con redondeo que no pierde centavos: parte de `total` que le toca
 *  a `num` de `den`. */
const parte = (total: number, num: number, den: number): number => (den === 0 ? 0 : Math.round((total * num) / den));

export interface PorcionIva { fecha: string; iva: number; iva_retenido: number }

/** En qué fechas, y por cuánto, cuenta el IVA de una factura.
 *
 *  De contado: entera, el día de la factura. A crédito: una porción por cada
 *  pago, proporcional a lo pagado; la suma nunca pasa del IVA de la factura,
 *  aunque los pagos registrados se pasen del total. Se reparte por acumulado
 *  y no pago por pago, para que tres parcialidades iguales no pierdan un
 *  centavo por redondeo. */
export function porcionesDeIva(f: FacturaFiscal): PorcionIva[] {
  if (f.tc !== 'I' && f.tc !== 'E') return [];
  const signo = f.tc === 'E' ? -1 : 1;
  if (f.tc === 'E' || (f.metodo ?? '').toUpperCase() !== 'PPD') {
    return [{ fecha: f.fecha, iva: signo * f.iva, iva_retenido: signo * f.iva_retenido }];
  }
  if (f.total <= 0) return [];
  const pagos = [...f.pagos].filter((p) => p.monto > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const salida: PorcionIva[] = [];
  let pagado = 0, ivaAntes = 0, retAntes = 0;
  for (const p of pagos) {
    pagado = Math.min(f.total, pagado + p.monto);
    const ivaHasta = parte(f.iva, pagado, f.total);
    const retHasta = parte(f.iva_retenido, pagado, f.total);
    if (ivaHasta !== ivaAntes || retHasta !== retAntes) {
      salida.push({ fecha: p.fecha, iva: ivaHasta - ivaAntes, iva_retenido: retHasta - retAntes });
    }
    ivaAntes = ivaHasta;
    retAntes = retHasta;
  }
  return salida;
}

export interface IvaDelMes {
  mes: string;
  vence: string;
  /** IVA que la empresa cobró. */
  trasladado: number;
  /** IVA que la empresa pagó y puede acreditar. */
  acreditable: number;
  /** IVA que los clientes le retuvieron a la empresa: ya está pagado. */
  retenido_a_la_empresa: number;
  /** IVA que la empresa le retuvo a sus proveedores. NO está en la cuenta:
   *  se entera aparte. Se enseña para que no se olvide. */
  retenido_a_terceros: number;
  /** trasladado − acreditable − retenido a la empresa. Negativo: a favor. */
  resultado: number;
  favor_anterior: number;
  a_pagar: number;
  /** Lo que queda a favor para el mes siguiente. */
  a_favor: number;
}

export interface IvaDelAnio {
  meses: IvaDelMes[];
  /** IVA de facturas a crédito que todavía no tienen pago registrado: no
   *  está en ningún mes. Cuando se cobre o se pague, entra. */
  por_cobrar: number;
  por_pagar: number;
}

export function ivaDelAnio(facturas: FacturaFiscal[], anio: number, favorInicial = 0): IvaDelAnio {
  const meses = mesesDe(anio);
  const cubo = new Map(meses.map((m) => [m, { tras: 0, acre: 0, retEmp: 0, retTer: 0 }]));
  let por_cobrar = 0, por_pagar = 0;

  for (const f of facturas) {
    if (f.tc !== 'I' && f.tc !== 'E') continue;
    if (f.lado === 'egreso' && f.trato === 'no_deducible') continue;
    const porciones = porcionesDeIva(f);
    for (const p of porciones) {
      const c = cubo.get(p.fecha.slice(0, 7));
      if (!c) continue; // de otro año
      if (f.lado === 'ingreso') { c.tras += p.iva; c.retEmp += p.iva_retenido; }
      else { c.acre += p.iva - p.iva_retenido; c.retTer += p.iva_retenido; }
    }
    // Lo que una PPD todavía no ha contado en ninguna fecha.
    if (f.tc === 'I' && (f.metodo ?? '').toUpperCase() === 'PPD') {
      const contado = porciones.reduce((s, p) => s + p.iva, 0);
      if (f.lado === 'ingreso') por_cobrar += f.iva - contado;
      else por_pagar += f.iva - contado;
    }
  }

  let favor = Math.max(0, Math.round(favorInicial));
  const salida: IvaDelMes[] = meses.map((mes) => {
    const c = cubo.get(mes)!;
    const resultado = c.tras - c.acre - c.retEmp;
    const favor_anterior = favor;
    const neto = resultado - favor_anterior;
    const a_pagar = Math.max(0, neto);
    favor = Math.max(0, -neto);
    return {
      mes, vence: venceMes(mes), trasladado: c.tras, acreditable: c.acre,
      retenido_a_la_empresa: c.retEmp, retenido_a_terceros: c.retTer,
      resultado, favor_anterior, a_pagar, a_favor: favor,
    };
  });
  return { meses: salida, por_cobrar, por_pagar };
}

/** Lo que cuenta como ingreso de una factura emitida: la factura suma, la
 *  nota de crédito resta, lo demás (pagos, nómina, traslados) no es ingreso. */
const ingresoDe = (f: FacturaFiscal): number => (f.lado !== 'ingreso' ? 0 : f.tc === 'I' ? f.subtotal : f.tc === 'E' ? -f.subtotal : 0);

export interface IsrDelMes {
  mes: string;
  vence: string;
  ingresos_del_mes: number;
  ingresos_acumulados: number;
  /** `null` cuando no hay coeficiente: lo de abajo queda en cero y
   *  `falta_coeficiente` lo dice. */
  coeficiente: number | null;
  falta_coeficiente: boolean;
  utilidad_estimada: number;
  perdidas: number;
  base: number;
  isr_acumulado: number;
  /** ISR que le retuvieron a la empresa en sus facturas, acumulado. */
  retenciones: number;
  /** Provisionales de meses anteriores que están REGISTRADOS como pagados. */
  pagos_anteriores: number;
  /** Lo que falta por pagar al cierre de este mes, con lo registrado. */
  a_pagar: number;
  /** Lo que le toca a este mes solo, si los anteriores se pagaron como
   *  salían. Es el número a mirar cuando no se han registrado pagos. */
  del_mes: number;
}

export function isrProvisional(facturas: FacturaFiscal[], ej: Ejercicio, pagos: PagoDeImpuesto[]): IsrDelMes[] {
  const meses = mesesDe(ej.anio);
  const porMes = new Map(meses.map((m) => [m, { ing: 0, ret: 0 }]));
  for (const f of facturas) {
    const c = porMes.get(f.fecha.slice(0, 7));
    if (!c || f.lado !== 'ingreso') continue;
    c.ing += ingresoDe(f);
    if (f.tc === 'I') c.ret += f.isr_retenido;
    else if (f.tc === 'E') c.ret -= f.isr_retenido;
  }
  const pagados = pagos.filter((p) => p.impuesto === 'isr_provisional' && p.periodo.startsWith(`${ej.anio}-`));
  const falta = ej.coeficiente === null;
  let acum = 0, retAcum = 0, netoAntes = 0;
  return meses.map((mes) => {
    const c = porMes.get(mes)!;
    acum += c.ing;
    retAcum += c.ret;
    const nominales = Math.max(0, acum);
    const utilidad = falta ? 0 : Math.round((nominales * (ej.coeficiente as number)) / 10000);
    const base = Math.max(0, utilidad - Math.max(0, ej.perdidas));
    const isr = Math.round((base * ej.tasa_isr) / 10000);
    const neto = Math.max(0, isr - Math.max(0, retAcum));
    const pagos_anteriores = pagados.filter((p) => p.periodo < mes).reduce((s, p) => s + p.monto, 0);
    const fila: IsrDelMes = {
      mes, vence: venceMes(mes), ingresos_del_mes: c.ing, ingresos_acumulados: acum,
      coeficiente: ej.coeficiente, falta_coeficiente: falta,
      utilidad_estimada: utilidad, perdidas: Math.max(0, ej.perdidas), base, isr_acumulado: isr,
      retenciones: retAcum, pagos_anteriores,
      a_pagar: Math.max(0, neto - pagos_anteriores),
      del_mes: Math.max(0, neto - netoAntes),
    };
    netoAntes = Math.max(netoAntes, neto);
    return fila;
  });
}

export interface IsrAnual {
  anio: number;
  vence: string;
  /** Facturas emitidas. */
  ingresos_facturados: number;
  notas_de_credito_emitidas: number;
  ajuste_ingresos: number;
  ingresos: number;
  /** Facturas recibidas que son gasto del año. */
  compras: number;
  notas_de_credito_recibidas: number;
  /** Recibos de nómina timbrados por la empresa. */
  nomina: number;
  ajuste_deducciones: number;
  deducciones: number;
  utilidad: number;
  perdidas: number;
  base: number;
  tasa_isr: number;
  isr: number;
  provisionales_pagados: number;
  retenciones: number;
  a_pagar: number;
  a_favor: number;
  /** Recibidas que NO entraron a las deducciones, y por qué. */
  fuera: { inversion: { facturas: number; subtotal: number }; no_deducible: { facturas: number; subtotal: number } };
}

export function isrAnual(facturas: FacturaFiscal[], ej: Ejercicio, pagos: PagoDeImpuesto[]): IsrAnual {
  const delAnio = facturas.filter((f) => f.fecha.startsWith(`${ej.anio}-`));
  let facturado = 0, ncEmitidas = 0, compras = 0, ncRecibidas = 0, nomina = 0, ret = 0;
  const fuera = { inversion: { facturas: 0, subtotal: 0 }, no_deducible: { facturas: 0, subtotal: 0 } };
  for (const f of delAnio) {
    if (f.lado === 'ingreso') {
      if (f.tc === 'I') { facturado += f.subtotal; ret += f.isr_retenido; }
      else if (f.tc === 'E') { ncEmitidas += f.subtotal; ret -= f.isr_retenido; }
      continue;
    }
    if (f.tc === 'N') { nomina += f.subtotal; continue; }
    if (f.tc !== 'I' && f.tc !== 'E') continue;
    if (f.trato !== 'normal') {
      const signo = f.tc === 'E' ? -1 : 1;
      fuera[f.trato].facturas += 1;
      fuera[f.trato].subtotal += signo * f.subtotal;
      continue;
    }
    if (f.tc === 'I') compras += f.subtotal;
    else ncRecibidas += f.subtotal;
  }
  const ingresos = facturado - ncEmitidas + ej.ajuste_ingresos;
  const deducciones = compras - ncRecibidas + nomina + ej.ajuste_deducciones;
  const utilidad = ingresos - deducciones;
  const perdidas = Math.max(0, ej.perdidas);
  const base = Math.max(0, utilidad - perdidas);
  const isr = Math.round((base * ej.tasa_isr) / 10000);
  const provisionales_pagados = pagos
    .filter((p) => p.impuesto === 'isr_provisional' && p.periodo.startsWith(`${ej.anio}-`))
    .reduce((s, p) => s + p.monto, 0);
  const retenciones = Math.max(0, ret);
  const neto = isr - provisionales_pagados - retenciones;
  return {
    anio: ej.anio, vence: venceAnual(ej.anio),
    ingresos_facturados: facturado, notas_de_credito_emitidas: ncEmitidas, ajuste_ingresos: ej.ajuste_ingresos, ingresos,
    compras, notas_de_credito_recibidas: ncRecibidas, nomina, ajuste_deducciones: ej.ajuste_deducciones, deducciones,
    utilidad, perdidas, base, tasa_isr: ej.tasa_isr, isr,
    provisionales_pagados, retenciones,
    a_pagar: Math.max(0, neto), a_favor: Math.max(0, -neto),
    fuera,
  };
}

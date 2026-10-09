/* La cuenta de los impuestos · contrato 0.85.0 (bill101).
 *
 * `src/fiscal.ts` es la única cuenta: la pantalla no suma nada. Aquí se mide
 * contra un caso HECHO A MANO, con números redondos para que cualquiera lo
 * pueda rehacer con una calculadora. Si esta prueba y el contador no dan lo
 * mismo con las mismas facturas, el que está mal es este archivo.
 *
 * EL CASO. Una empresa, año 2026, coeficiente de utilidad 0.0800, ISR 30 %.
 *
 *   EMITE
 *   A  15-ene  factura de contado      100,000 + 16,000 IVA
 *   B  20-ene  factura a crédito (PPD) 300,000 + 48,000 IVA = 348,000
 *              la cobra en dos: 116,000 el 10-feb y 232,000 el 5-mar
 *   E  12-mar  nota de crédito          10,000 +  1,600 IVA
 *   N  31-ene  nómina timbrada          40,000
 *
 *   RECIBE
 *   C  10-ene  compra de contado        50,000 +  8,000 IVA
 *   D   3-feb  compra de contado       200,000 + 32,000 IVA
 *   F  20-mar  flete, le retiene IVA    20,000 +  3,200 IVA − 800 retenido
 *   G  25-mar  una máquina (inversión)  80,000 + 12,800 IVA
 *   H  30-ene  un gasto no deducible     5,000 +    800 IVA
 *
 * LO QUE TIENE QUE SALIR, y por qué, está junto a cada `expect`.
 */

import { describe, expect, it } from 'vitest';
import {
  ejercicioVacio, isrAnual, isrProvisional, ivaDelAnio, porcionesDeIva, venceAnual, venceMes,
  type Ejercicio, type FacturaFiscal, type PagoDeImpuesto,
} from '../src/fiscal';

const P = (pesos: number) => Math.round(pesos * 100);

function f(id: string, lado: 'ingreso' | 'egreso', fecha: string, subtotal: number, extra: Partial<FacturaFiscal> = {}): FacturaFiscal {
  const iva = extra.iva ?? Math.round(subtotal * 0.16);
  const iva_retenido = extra.iva_retenido ?? 0;
  return {
    id, lado, tc: 'I', fecha, metodo: 'PUE', subtotal, iva, iva_retenido, isr_retenido: 0,
    total: subtotal + iva - iva_retenido, trato: 'normal', pagos: [], ...extra,
  };
}

const CASO: FacturaFiscal[] = [
  f('A', 'ingreso', '2026-01-15', P(100_000)),
  f('B', 'ingreso', '2026-01-20', P(300_000), { metodo: 'PPD', pagos: [{ fecha: '2026-02-10', monto: P(116_000) }, { fecha: '2026-03-05', monto: P(232_000) }] }),
  f('E', 'ingreso', '2026-03-12', P(10_000), { tc: 'E' }),
  f('N', 'egreso', '2026-01-31', P(40_000), { tc: 'N', iva: 0 }),
  f('C', 'egreso', '2026-01-10', P(50_000)),
  f('D', 'egreso', '2026-02-03', P(200_000)),
  f('F', 'egreso', '2026-03-20', P(20_000), { iva_retenido: P(800) }),
  f('G', 'egreso', '2026-03-25', P(80_000), { trato: 'inversion' }),
  f('H', 'egreso', '2026-01-30', P(5_000), { trato: 'no_deducible' }),
];
const EJ: Ejercicio = { ...ejercicioVacio(2026), coeficiente: 800, ajuste_deducciones: P(15_000) };

describe('el IVA del mes va por flujo', () => {
  const { meses, por_cobrar, por_pagar } = ivaDelAnio(CASO, 2026);
  const [ene, feb, mar, abr] = meses;

  it('enero: se debe el IVA de la factura de contado; la de crédito todavía no', () => {
    expect(ene.trasladado, 'sólo A: B no se ha cobrado').toBe(P(16_000));
    expect(ene.acreditable, 'sólo C: H no es deducible').toBe(P(8_000));
    expect(ene.resultado).toBe(P(8_000));
    expect(ene.a_pagar).toBe(P(8_000));
    expect(ene.a_favor).toBe(0);
    expect(ene.vence).toBe('2026-02-17');
  });

  it('febrero: entra el tercio de B que se cobró, y sale a favor', () => {
    expect(feb.trasladado, '116,000 de 348,000 es un tercio: 16,000 de IVA').toBe(P(16_000));
    expect(feb.acreditable).toBe(P(32_000));
    expect(feb.resultado).toBe(P(-16_000));
    expect(feb.a_pagar).toBe(0);
    expect(feb.a_favor).toBe(P(16_000));
  });

  it('marzo: el resto de B, menos la nota de crédito, menos el saldo a favor', () => {
    expect(mar.trasladado, '32,000 de B menos 1,600 de la nota de crédito').toBe(P(30_400));
    expect(mar.acreditable, 'F: 3,200 menos 800 retenidos; G: 12,800 (la inversión sí acredita IVA)').toBe(P(15_200));
    expect(mar.retenido_a_terceros, 'lo que se le retuvo al fletero se entera aparte').toBe(P(800));
    expect(mar.resultado).toBe(P(15_200));
    expect(mar.favor_anterior).toBe(P(16_000));
    expect(mar.a_pagar).toBe(0);
    expect(mar.a_favor).toBe(P(800));
  });

  it('el saldo a favor se sigue arrastrando en los meses sin movimiento', () => {
    expect(abr.resultado).toBe(0);
    expect(abr.favor_anterior).toBe(P(800));
    expect(abr.a_favor).toBe(P(800));
    expect(meses[11].a_favor).toBe(P(800));
  });

  it('todo el IVA de B terminó contado, y nada quedó pendiente', () => {
    expect(feb.trasladado + (mar.trasladado + P(1_600))).toBe(P(48_000));
    expect(por_cobrar).toBe(0);
    expect(por_pagar).toBe(0);
  });

  it('con saldo a favor del año anterior, enero paga menos', () => {
    const r = ivaDelAnio(CASO, 2026, P(5_000));
    expect(r.meses[0].favor_anterior).toBe(P(5_000));
    expect(r.meses[0].a_pagar).toBe(P(3_000));
  });

  it('una factura a crédito SIN pago registrado no cuenta en ningún mes, y se dice cuánto IVA anda así', () => {
    const r = ivaDelAnio([f('X', 'ingreso', '2026-05-02', P(10_000), { metodo: 'PPD' }), f('Y', 'egreso', '2026-05-03', P(1_000), { metodo: 'PPD' })], 2026);
    expect(r.meses.every((m) => m.trasladado === 0 && m.acreditable === 0)).toBe(true);
    expect(r.por_cobrar).toBe(P(1_600));
    expect(r.por_pagar).toBe(P(160));
  });

  it('una a crédito de diciembre que se cobra en enero cuenta en enero del año siguiente', () => {
    const vieja = f('V', 'ingreso', '2025-12-18', P(10_000), { metodo: 'PPD', pagos: [{ fecha: '2026-01-09', monto: P(11_600) }] });
    expect(ivaDelAnio([vieja], 2025).meses[11].trasladado).toBe(0);
    expect(ivaDelAnio([vieja], 2026).meses[0].trasladado).toBe(P(1_600));
  });
});

describe('repartir el IVA de una factura a crédito no pierde centavos', () => {
  it('tres pagos iguales de una factura cuyo IVA no se divide entre tres', () => {
    // 100.00 de IVA en tres partes: 33.33 + 33.34 + 33.33, nunca 99.99.
    const x = f('X', 'ingreso', '2026-01-01', 62_500, { iva: 10_000, metodo: 'PPD', pagos: [
      { fecha: '2026-01-10', monto: 24_167 }, { fecha: '2026-02-10', monto: 24_167 }, { fecha: '2026-03-10', monto: 24_166 },
    ] });
    const p = porcionesDeIva(x);
    expect(p.map((q) => q.iva)).toEqual([3_333, 3_334, 3_333]);
    expect(p.reduce((s, q) => s + q.iva, 0)).toBe(10_000);
  });

  it('si los pagos registrados se pasan del total, el IVA no pasa del de la factura', () => {
    const x = f('X', 'ingreso', '2026-01-01', P(1_000), { metodo: 'PPD', pagos: [{ fecha: '2026-01-10', monto: P(1_160) }, { fecha: '2026-02-10', monto: P(1_160) }] });
    const p = porcionesDeIva(x);
    expect(p).toEqual([{ fecha: '2026-01-10', iva: P(160), iva_retenido: 0 }]);
  });

  it('un complemento de pago y un recibo de nómina no traen IVA que repartir', () => {
    expect(porcionesDeIva(f('P', 'ingreso', '2026-01-01', 0, { tc: 'P' }))).toEqual([]);
    expect(porcionesDeIva(f('N', 'egreso', '2026-01-01', P(100), { tc: 'N' }))).toEqual([]);
  });
});

describe('el ISR provisional va por lo facturado', () => {
  it('enero: las dos facturas cuentan aunque una no se haya cobrado', () => {
    const [ene] = isrProvisional(CASO, EJ, []);
    expect(ene.ingresos_del_mes, 'A + B: el ISR no espera al cobro').toBe(P(400_000));
    expect(ene.utilidad_estimada, '400,000 × 0.08').toBe(P(32_000));
    expect(ene.isr_acumulado, '32,000 × 30 %').toBe(P(9_600));
    expect(ene.a_pagar).toBe(P(9_600));
    expect(ene.del_mes).toBe(P(9_600));
    expect(ene.vence).toBe('2026-02-17');
  });

  it('febrero sin facturas: no se debe nada nuevo', () => {
    const [, feb] = isrProvisional(CASO, EJ, []);
    expect(feb.ingresos_del_mes).toBe(0);
    expect(feb.ingresos_acumulados).toBe(P(400_000));
    expect(feb.del_mes).toBe(0);
    expect(feb.a_pagar, 'sin pagos registrados, sigue debiendo lo de enero').toBe(P(9_600));
  });

  it('marzo: la nota de crédito baja los ingresos del año', () => {
    const [, , mar] = isrProvisional(CASO, EJ, []);
    expect(mar.ingresos_del_mes).toBe(P(-10_000));
    expect(mar.ingresos_acumulados).toBe(P(390_000));
    expect(mar.isr_acumulado, '390,000 × 0.08 × 30 %').toBe(P(9_360));
    expect(mar.del_mes).toBe(0);
  });

  it('con el pago de enero registrado, febrero y marzo salen en cero', () => {
    const pagos: PagoDeImpuesto[] = [{ impuesto: 'isr_provisional', periodo: '2026-01', monto: P(9_600) }];
    const [ene, feb, mar] = isrProvisional(CASO, EJ, pagos);
    expect(ene.pagos_anteriores, 'el pago de enero no es «anterior» a enero').toBe(0);
    expect(ene.a_pagar).toBe(P(9_600));
    expect(feb.pagos_anteriores).toBe(P(9_600));
    expect(feb.a_pagar).toBe(0);
    expect(mar.a_pagar, 'pagó 9,600 y ahora el acumulado es 9,360: no debe').toBe(0);
  });

  it('un pago de IVA o de otro año no se resta del ISR', () => {
    const pagos: PagoDeImpuesto[] = [{ impuesto: 'iva', periodo: '2026-01', monto: P(9_600) }, { impuesto: 'isr_provisional', periodo: '2025-12', monto: P(9_600) }];
    expect(isrProvisional(CASO, EJ, pagos)[1].a_pagar).toBe(P(9_600));
  });

  it('sin coeficiente no se inventa uno: sale en cero y lo dice', () => {
    const [ene] = isrProvisional(CASO, ejercicioVacio(2026), []);
    expect(ene.falta_coeficiente).toBe(true);
    expect(ene.coeficiente).toBeNull();
    expect(ene.ingresos_acumulados, 'los ingresos sí se enseñan').toBe(P(400_000));
    expect(ene.a_pagar).toBe(0);
  });

  it('las pérdidas de años anteriores bajan la base, nunca debajo de cero', () => {
    const [ene] = isrProvisional(CASO, { ...EJ, perdidas: P(12_000) }, []);
    expect(ene.base, '32,000 − 12,000').toBe(P(20_000));
    expect(ene.isr_acumulado).toBe(P(6_000));
    const [todo] = isrProvisional(CASO, { ...EJ, perdidas: P(999_999) }, []);
    expect(todo.base).toBe(0);
    expect(todo.a_pagar).toBe(0);
  });

  it('lo que le retuvieron de ISR a la empresa ya está pagado', () => {
    const conRet = [f('R', 'ingreso', '2026-01-15', P(100_000), { isr_retenido: P(1_000) })];
    const [ene] = isrProvisional(conRet, EJ, []);
    expect(ene.isr_acumulado, '100,000 × 0.08 × 30 %').toBe(P(2_400));
    expect(ene.retenciones).toBe(P(1_000));
    expect(ene.a_pagar).toBe(P(1_400));
  });
});

describe('el ISR anual estimado', () => {
  const a = isrAnual(CASO, EJ, [{ impuesto: 'isr_provisional', periodo: '2026-01', monto: P(9_600) }]);

  it('ingresos: lo facturado menos las notas de crédito', () => {
    expect(a.ingresos_facturados).toBe(P(400_000));
    expect(a.notas_de_credito_emitidas).toBe(P(10_000));
    expect(a.ingresos).toBe(P(390_000));
  });

  it('deducciones: compras + nómina + lo que dio el contador; la inversión y lo no deducible quedan fuera, y se dice', () => {
    expect(a.compras, 'C + D + F').toBe(P(270_000));
    expect(a.nomina).toBe(P(40_000));
    expect(a.ajuste_deducciones).toBe(P(15_000));
    expect(a.deducciones).toBe(P(325_000));
    expect(a.fuera.inversion).toEqual({ facturas: 1, subtotal: P(80_000) });
    expect(a.fuera.no_deducible).toEqual({ facturas: 1, subtotal: P(5_000) });
  });

  it('y la cuenta: utilidad × tasa − provisionales', () => {
    expect(a.utilidad, '390,000 − 325,000').toBe(P(65_000));
    expect(a.isr, '65,000 × 30 %').toBe(P(19_500));
    expect(a.provisionales_pagados).toBe(P(9_600));
    expect(a.a_pagar).toBe(P(9_900));
    expect(a.a_favor).toBe(0);
    expect(a.vence).toBe('2027-03-31');
  });

  it('si los provisionales fueron más que el impuesto, sale a favor', () => {
    const r = isrAnual(CASO, EJ, [{ impuesto: 'isr_provisional', periodo: '2026-01', monto: P(30_000) }]);
    expect(r.a_pagar).toBe(0);
    expect(r.a_favor).toBe(P(10_500));
  });

  it('un año con pérdida no debe ISR', () => {
    const r = isrAnual(CASO, { ...EJ, ajuste_deducciones: P(500_000) }, []);
    expect(r.utilidad).toBeLessThan(0);
    expect(r.base).toBe(0);
    expect(r.isr).toBe(0);
  });

  it('las facturas de otro año no entran', () => {
    const r = isrAnual([...CASO, f('Z', 'ingreso', '2025-12-31', P(1_000_000))], EJ, []);
    expect(r.ingresos_facturados).toBe(P(400_000));
  });
});

describe('las fechas de vencimiento', () => {
  it('el mes vence el 17 del siguiente, y diciembre en enero del otro año', () => {
    expect(venceMes('2026-01')).toBe('2026-02-17');
    expect(venceMes('2026-12')).toBe('2027-01-17');
    expect(venceAnual(2026)).toBe('2027-03-31');
  });
});

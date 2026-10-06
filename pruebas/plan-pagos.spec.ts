/* El plan de pagos de un proyecto · contrato 0.72.0
 *
 * Mike, 6-oct, con botones: «plan de pagos por proyecto». En cada proyecto
 * se capturan parcialidades con fecha y monto; el flujo proyectado de
 * dash101 las pone en su fecha y descuenta lo ya cobrado.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que la parcialidad se rechace CON PALABRAS cuando no cuadra: un
 *     proyecto que no existe, una fecha que no es un día, un monto en cero
 *     o con centavos partidos. Sin esto, el flujo pondría cobros en el 31
 *     de febrero y nadie sabría por qué no cuadra;
 *   · que la lista salga POR FECHA, que es el orden en que el flujo las
 *     consume para descontar lo cobrado;
 *   · que sólo dash101 la escriba, y que no toque `cobrado`: es lo que se
 *     ESPERA, no lo que entró;
 *   · que borrar el proyecto se lleve su plan (ON DELETE CASCADE), para no
 *     dejar cobros fantasma en el flujo.
 */

import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const CORREO = 'mike@forespot.com';
const ORG = 'plan-de-pagos';
const galletas: Record<string, string> = {};

async function pedir(ruta: string, op: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (op.app !== '') cabeceras['X-App'] = op.app ?? 'dash101';
  if (galletas.mike) cabeceras.Cookie = galletas.mike;
  let body = op.body;
  if (op.json !== undefined) { body = JSON.stringify(op.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...op, body, headers: { ...cabeceras, ...(op.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas.mike = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ...cuerpo } as { estado: number; [k: string]: any };
}
const o = (ruta: string, op: Parameters<typeof pedir>[1] = {}) => pedir(`/orgs/${ORG}${ruta}`, op);

let cliente = '', proyecto = '', otro = '';

beforeAll(async () => {
  const c = await pedir('/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  expect(c.estado).toBe(200);
  const e = await pedir('/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado).toBe(200);
  const alta = await pedir('/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Plan de pagos' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  cliente = (await o('/clientes', { method: 'POST', json: { nombre: 'HOLCIM' } })).data.id;
  proyecto = (await o('/proyectos', { method: 'POST', json: { cliente_id: cliente, nombre: 'Cocina' } })).data.id;
  otro = (await o('/proyectos', { method: 'POST', json: { cliente_id: cliente, nombre: 'Clóset' } })).data.id;
}, 60_000);

describe('el plan de pagos del proyecto (0.72.0)', () => {
  it('una parcialidad que no cuadra se rechaza con palabras por campo', async () => {
    /* Centavos partidos los para la puerta del dinero de siempre, antes de
     * llegar aquí: 'dinero_no_entero', como en cualquier tabla. */
    const partidos = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: proyecto, fecha: '2026-11-15', monto: 10.5 } });
    expect(partidos.estado).toBe(400);
    expect(partidos.error).toBe('dinero_no_entero');
    const r = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: 'no-existe', fecha: '2026-02-31', monto: -5, concepto: 'x'.repeat(81) } });
    expect(r.estado).toBe(400);
    expect(r.error).toBe('datos_invalidos');
    expect(Object.keys(r.detalle.errores).sort()).toEqual(['concepto', 'fecha', 'monto', 'proyecto_id']);
    expect(r.detalle.errores.fecha).toMatch(/día de verdad/);
    const cero = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: proyecto, fecha: '2026-11-15', monto: 0 } });
    expect(cero.estado).toBe(400);
    expect(cero.detalle.errores).toEqual({ monto: 'El monto son centavos enteros, mayor que cero.' });
    const sinFecha = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: proyecto, monto: 100 } });
    expect(sinFecha.estado, 'la fecha es requerida').toBe(400);
  });

  it('se captura, sale por fecha, y el concepto llega recortado', async () => {
    const entrega = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: proyecto, fecha: '2026-12-15', monto: 300_000_00, concepto: '  Entrega  ' } });
    expect(entrega.estado, JSON.stringify(entrega)).toBe(201);
    expect(entrega.data.concepto).toBe('Entrega');
    const anticipo = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: proyecto, fecha: '2026-10-20', monto: 400_000_00, concepto: 'Anticipo' } });
    expect(anticipo.estado).toBe(201);
    const avance = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: proyecto, fecha: '2026-11-15', monto: 300_000_00, concepto: 'Avance' } });
    expect(avance.estado).toBe(201);
    const ajeno = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: otro, fecha: '2026-10-01', monto: 1_00, concepto: 'Del clóset' } });
    expect(ajeno.estado).toBe(201);

    const lista = await o(`/plan_pagos?proyecto_id=${proyecto}`);
    expect(lista.estado).toBe(200);
    expect(lista.data.filas.map((f: any) => f.concepto), 'por fecha, y sólo las de este proyecto').toEqual(['Anticipo', 'Avance', 'Entrega']);
    expect(lista.data.filas.reduce((s: number, f: any) => s + f.monto, 0)).toBe(1_000_000_00);
  });

  it('se corrige por PATCH con las mismas reglas, y queda la hora del cambio', async () => {
    const [anticipo] = (await o(`/plan_pagos?proyecto_id=${proyecto}`)).data.filas;
    const mal = await o(`/plan_pagos/${anticipo.id}`, { method: 'PATCH', json: { fecha: '2026-13-01' } });
    expect(mal.estado).toBe(400);
    expect(mal.detalle.errores).toEqual({ fecha: 'La fecha va como AAAA-MM-DD y tiene que ser un día de verdad.' });
    const bien = await o(`/plan_pagos/${anticipo.id}`, { method: 'PATCH', json: { fecha: '2026-10-25', monto: 450_000_00 } });
    expect(bien.estado, JSON.stringify(bien)).toBe(200);
    expect(bien.data).toMatchObject({ fecha: '2026-10-25', monto: 450_000_00, concepto: 'Anticipo' });
    expect(bien.data.actualizado_at).toBeTruthy();
  });

  it('no toca lo cobrado del proyecto: es lo que se espera, no lo que entró', async () => {
    const p = (await o(`/proyectos/${proyecto}`)).data;
    expect(Number(p.cobrado)).toBe(0);
  });

  it('otra app no la escribe; y un cliente del portal tampoco la lee', async () => {
    const r = await o('/plan_pagos', { method: 'POST', json: { proyecto_id: proyecto, fecha: '2026-12-20', monto: 1_00 }, app: 'quell101' });
    expect(r.estado).toBe(403);
  });

  it('borrar el proyecto se lleva su plan', async () => {
    const antes = (await o(`/plan_pagos?proyecto_id=${otro}`)).data.filas;
    expect(antes).toHaveLength(1);
    const b = await o(`/proyectos/${otro}`, { method: 'DELETE' });
    expect(b.estado, JSON.stringify(b)).toBe(200);
    expect((await o(`/plan_pagos?proyecto_id=${otro}`)).data.filas).toEqual([]);
    expect((await o(`/plan_pagos/${antes[0].id}`)).estado).toBe(404);
  });
});

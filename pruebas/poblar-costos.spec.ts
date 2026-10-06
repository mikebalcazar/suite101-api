/* La 0036: poblar los costos default de lo que ya estaba (6-oct-2026).
 *
 * Mike: «necesito que pobles por mí todos los ítems que tenemos en alcance,
 * que no tengan precio, con los costos predeterminados». Se arma una empresa
 * como estaba ANTES de la 0036 —con fases de antes de la 0035 en cero, fases
 * nacidas hoy con el costo del TOTAL del ítem (el defecto: una puerta de un
 * ítem × 2 cargaba el costo de las dos), un costo capturado a mano, un ítem
 * fuera de alcance y una pieza que nunca abrió su cronograma— y se mide qué
 * deja la migración. */

import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

describe('la 0036 puebla los costos default de lo que ya estaba', () => {
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const entorno = env as unknown as { ORG: DurableObjectNamespace };
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0036')) as unknown as DurableObjectStub;
  const HASTA = MIGRACIONES.length - 1; // todo menos la 0036
  const T = '2026-10-01T00:00:00.000Z';

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      // Al día y luego sin la 0036: así quedan también las que corren en código.
      db.migrar();
      db.sql.exec(`DELETE FROM _migraciones WHERE version > ?`, HASTA);
      db.sql.exec(`DROP TABLE pendientes_arranque`);
      const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
      x(`INSERT INTO clientes (id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl1','Depto','depto','dash101',?)`, T);
      x(`INSERT INTO proyectos (id, cliente_id, nombre, estado, creado_at) VALUES ('p1','cl1','Bosques','activo',?)`, T);
      const item = (id: string, tipo: string, monto: number, cantidad: number, estado: string) =>
        x(`INSERT INTO items (id, proyecto_id, cliente_id, nombre, tipo, monto, cantidad, estado, creado_at, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          id, 'p1', 'cl1', id, tipo, monto, cantidad, estado, T, 'prueba');
      item('iA', 'puerta', 200000, 2, 'vendido');   // dos puertas de $1,000: $350 de material y $350 de mano de obra cada una
      item('iB', 'mueble', 100000, 1, 'vendido');
      item('iC', 'mueble', 50000, 1, 'cotizado');   // fuera de alcance
      item('iD', 'acabado', 200000, 2, 'vendido');  // nunca abrió su cronograma
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, created_at) VALUES ('o1','Bosques (obra)','Depto','p1',?)`, T);
      x(`INSERT INTO quell_plans (id, project_id, name, image_key, width, height, created_at) VALUES ('pl1','o1','Planta','k1',1000,800,?)`, T);
      const pieza = (id: string, code: string, type: string, item_id: string, dadas: number) =>
        x(`INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, x, y, item_id, fases_dadas, created_at) VALUES (?,?,?,?,?,?,0.5,0.5,?,?,?)`,
          id, 'pl1', 'o1', code, type, id, item_id, dadas, T);
      pieza('eA1', 'PT-01', 'Puerta', 'iA', 1);
      pieza('eA2', 'PT-02', 'Puerta', 'iA', 1);
      pieza('eB', 'MB-01', 'Mueble', 'iB', 1);
      pieza('eC', 'MB-02', 'Mueble', 'iC', 1);
      pieza('eD1', 'AC-01', 'Acabado', 'iD', 0);
      const fase = (id: string, el: string, etapa: string, costo: number, seccion = '', pos = 0) =>
        x(`INSERT INTO quell_tareas (id, project_id, element_id, seccion, orden, etapa, pos, dias, costo, creado_at, actualizado_at) VALUES (?,?,?,?,0,?,?,5,?,?,?)`,
          id, 'o1', el, seccion, etapa, pos, costo, T, T);
      // eA1: de antes de la 0035, todo en cero.
      fase('a1m', 'eA1', 'material', 0, '', 0); fase('a1f', 'eA1', 'fabricacion', 0, '', 10); fase('a1i', 'eA1', 'instalacion', 0, '', 20);
      // eA2: nacida hoy con el costo del TOTAL del ítem (35 % de $2,000).
      fase('a2m', 'eA2', 'material', 70000, '', 0); fase('a2f', 'eA2', 'fabricacion', 70000, '', 10); fase('a2i', 'eA2', 'instalacion', 0, '', 20);
      // eB: el material capturado a mano; dos procesos de fabricación en cero.
      fase('bm', 'eB', 'material', 12345, '', 0); fase('bf1', 'eB', 'fabricacion', 0, 'Cubierta', 10); fase('bf2', 'eB', 'fabricacion', 0, 'Puertas', 10);
      // eC: fuera de alcance, en cero.
      fase('cm', 'eC', 'material', 0, '', 0); fase('cf', 'eC', 'fabricacion', 0, '', 10);
      return true;
    });
  });

  it('la base vieja no trae la 0036 ni costos', async () => {
    const antes = await dentro(elDO(), (db: any) => ({
      version: db.version(),
      partidas: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM partidas`).one().n),
    }));
    expect(antes.version).toBe(HASTA);
    expect(antes.partidas).toBe(0);
  });

  it('migrar y correr el pendiente: cada fase con su costo por PIEZA, lo capturado intacto, lo de fuera en cero', async () => {
    const r = await dentro(elDO(), async (db: any) => {
      db.migrar();
      await db.correrPendientes();
      const costo = (id: string) => Number(db.sql.exec(`SELECT costo FROM quell_tareas WHERE id = ?`, id).one().costo);
      return {
        version: db.version(),
        a1: ['a1m', 'a1f', 'a1i'].map(costo),
        a2: ['a2m', 'a2f', 'a2i'].map(costo),
        b: ['bm', 'bf1', 'bf2'].map(costo),
        c: ['cm', 'cf'].map(costo),
        d: db.sql.exec(`SELECT etapa, costo FROM quell_tareas WHERE element_id = 'eD1' ORDER BY pos`).toArray().map((t: any) => [t.etapa, Number(t.costo)]),
        partidas: db.sql.exec(`SELECT tarea_id, monto_acordado, obra_id, fecha_esperada FROM partidas ORDER BY tarea_id`).toArray(),
        compromiso: Number(db.sql.exec(`SELECT compromiso FROM proyectos WHERE id = 'p1'`).one().compromiso),
        pendiente: db.sql.exec(`SELECT hecho_at, resultado FROM pendientes_arranque WHERE clave = 'poblar_costos_default'`).one(),
      };
    });
    expect(r.version).toBe(VERSION_ORG_DB);
    expect(r.a1, 'de antes de la 0035: material y mano de obra de UNA puerta; instalación sin porcentaje').toEqual([35000, 35000, 0]);
    expect(r.a2, 'el costo del total se corrige al de una pieza').toEqual([35000, 35000, 0]);
    expect(r.b, 'el material capturado se respeta; sólo el primer proceso de fabricación recibe el 30 %').toEqual([12345, 30000, 0]);
    expect(r.c, 'fuera de alcance no se toca').toEqual([0, 0]);
    expect(r.d, 'la pieza que nunca abrió su cronograma nace con fases y costo de UNA pieza (40/20 de $1,000)').toEqual([['material', 40000], ['fabricacion', 20000], ['instalacion', 0]]);
    const conCosto = r.partidas.map((p: any) => [p.tarea_id, Number(p.monto_acordado)]);
    expect(conCosto.filter(([t]: any) => ['a1m', 'a1f', 'a2m', 'a2f', 'bm', 'bf1'].includes(t))).toEqual([
      ['a1f', 35000], ['a1m', 35000], ['a2f', 35000], ['a2m', 35000], ['bf1', 30000], ['bm', 12345],
    ]);
    expect(r.partidas.length, 'seis más las dos de la pieza nueva').toBe(8);
    expect(r.partidas.every((p: any) => p.obra_id === 'o1' && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_esperada))).toBe(true);
    expect(r.compromiso, 'el compromiso del proyecto es la suma').toBe(35000 * 4 + 12345 + 30000 + 40000 + 20000);
    expect(r.pendiente.hecho_at).toBeTruthy();
    expect(JSON.parse(r.pendiente.resultado)).toEqual({ obras: 1, fases_nuevas: 3, fases_con_costo: 3, fases_corregidas: 2 });
  });

  it('no vuelve a correr, y correrlo a mano no cambia nada', async () => {
    const r = await dentro(elDO(), async (db: any) => {
      const antes = db.sql.exec(`SELECT id, costo FROM quell_tareas ORDER BY id`).toArray();
      await db.correrPendientes();
      const { poblarCostosDefault } = await import('../src/quell/motor.js');
      const { baseSobreSql } = await import('../src/org-db');
      const otra = await poblarCostosDefault({ DB: baseSobreSql(db.sql) });
      return { antes, despues: db.sql.exec(`SELECT id, costo FROM quell_tareas ORDER BY id`).toArray(), otra };
    });
    expect(r.despues).toEqual(r.antes);
    expect(r.otra).toEqual({ obras: 0, fases_nuevas: 0, fases_con_costo: 0, fases_corregidas: 0 });
  });
});

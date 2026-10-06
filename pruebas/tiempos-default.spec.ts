/* La 0037: los tiempos default en lo que ya estaba (6-oct-2026).
 *
 * Mike: «ponla también todos los ítems que hay ahorita en alcance con los
 * defaults de tiempos»; escogió con botones «sólo donde falten». Se arma una
 * empresa de antes de la 0037 —fases que siguen en 1 día (con lo que nace una
 * fase agregada a mano), días capturados, una fase de más, una pieza en
 * alcance sin fases, una pieza sin ítem, y lo de fuera de alcance— y se mide
 * qué deja. */

import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

describe('la 0037 pone los tiempos default donde faltan', () => {
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const entorno = env as unknown as { ORG: DurableObjectNamespace };
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0037')) as unknown as DurableObjectStub;
  // Todo lo de antes de la 0037 (se busca por lo que hace, no por número).
  const HASTA = MIGRACIONES.findIndex((m) => m.includes("'tiempos_default'"));
  const T = '2026-10-01T00:00:00.000Z';

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.migrar();
      await db.correrPendientes(); // la 0036, sobre la base vacía
      db.sql.exec(`DELETE FROM _migraciones WHERE version > ?`, HASTA);
      db.sql.exec(`DELETE FROM pendientes_arranque WHERE clave = 'tiempos_default'`);
      const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
      x(`INSERT INTO clientes (id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl1','Depto','depto','dash101',?)`, T);
      x(`INSERT INTO proyectos (id, cliente_id, nombre, estado, creado_at) VALUES ('p1','cl1','Bosques','activo',?)`, T);
      const item = (id: string, tipo: string, monto: number, cantidad: number, estado: string) =>
        x(`INSERT INTO items (id, proyecto_id, cliente_id, nombre, tipo, monto, cantidad, estado, creado_at, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          id, 'p1', 'cl1', id, tipo, monto, cantidad, estado, T, 'prueba');
      item('iA', 'puerta', 200000, 2, 'vendido');
      item('iC', 'mueble', 50000, 2, 'cotizado'); // fuera de alcance
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, created_at) VALUES ('o1','Bosques (obra)','Depto','p1',?)`, T);
      x(`INSERT INTO quell_plans (id, project_id, name, image_key, width, height, created_at) VALUES ('pl1','o1','Planta','k1',1000,800,?)`, T);
      const pieza = (id: string, code: string, type: string, item_id: string | null) =>
        x(`INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, x, y, item_id, fases_dadas, created_at) VALUES (?,?,?,?,?,?,0.5,0.5,?,1,?)`,
          id, 'pl1', 'o1', code, type, id, item_id, T);
      pieza('eA1', 'PT-01', 'Puerta', 'iA');
      pieza('eA2', 'PT-02', 'Puerta', 'iA');      // en alcance y sin fases
      pieza('eS', 'MW-09', 'Mueble', null);       // sin ítem: quell la enseña en alcance
      pieza('eC1', 'MW-01', 'Mueble', 'iC');
      pieza('eC2', 'MW-02', 'Mueble', 'iC');      // fuera de alcance y sin fases
      pieza('eR', 'RQ-01', 'Requerimiento', null);
      const fase = (id: string, el: string, etapa: string, dias: number, pos: number) =>
        x(`INSERT INTO quell_tareas (id, project_id, element_id, seccion, orden, etapa, pos, dias, costo, creado_at, actualizado_at) VALUES (?,?,?,'',0,?,?,?,0,?,?)`,
          id, 'o1', el, etapa, pos, dias, T, T);
      fase('a1m', 'eA1', 'material', 1, 0); fase('a1f', 'eA1', 'fabricacion', 7, 10); fase('a1i', 'eA1', 'instalacion', 1, 20); fase('a1o', 'eA1', 'otra', 1, 30);
      fase('sm', 'eS', 'material', 1, 0);
      fase('c1m', 'eC1', 'material', 1, 0);
      return true;
    });
  });

  it('migrar y correr el pendiente: tiempos default sólo donde faltan, y sólo en alcance', async () => {
    const r = await dentro(elDO(), async (db: any) => {
      db.migrar();
      await db.correrPendientes();
      const dias = (id: string) => Number(db.sql.exec(`SELECT dias FROM quell_tareas WHERE id = ?`, id).one().dias);
      const de = (el: string) => db.sql.exec(`SELECT etapa, dias, costo FROM quell_tareas WHERE element_id = ? ORDER BY pos`, el).toArray()
        .map((t: any) => [t.etapa, Number(t.dias), Number(t.costo)]);
      return {
        version: db.version(),
        a1: ['a1m', 'a1f', 'a1i', 'a1o'].map(dias),
        a2: de('eA2'), s: ['sm'].map(dias), c1: ['c1m'].map(dias), c2: de('eC2'), r: de('eR'),
        partidas: db.sql.exec(`SELECT monto_acordado FROM partidas ORDER BY monto_acordado`).toArray().map((p: any) => Number(p.monto_acordado)),
        pendiente: db.sql.exec(`SELECT hecho_at, resultado FROM pendientes_arranque WHERE clave = 'tiempos_default'`).one(),
      };
    });
    expect(r.version).toBe(VERSION_ORG_DB);
    expect(r.a1, 'los que seguían en 1 día toman el default; los 7 capturados y la fase de más se quedan').toEqual([10, 7, 12, 1]);
    expect(r.a2, 'la pieza en alcance sin fases recibe las tres, con el costo de UNA puerta').toEqual([
      ['material', 10, 35000], ['fabricacion', 24, 35000], ['instalacion', 12, 0],
    ]);
    expect(r.s, 'una pieza sin ítem se ve en alcance en quell101: también').toEqual([10]);
    expect(r.c1, 'fuera de alcance no se toca').toEqual([1]);
    expect(r.c2, 'fuera de alcance no recibe fases').toEqual([]);
    expect(r.r, 'un requerimiento no recibe fases').toEqual([]);
    expect(r.partidas, 'los dos compromisos de la puerta nueva').toEqual([35000, 35000]);
    expect(r.pendiente.hecho_at).toBeTruthy();
    expect(JSON.parse(r.pendiente.resultado)).toEqual({ obras: 1, piezas_con_fases: 1, fases_con_dias: 3 });
  });

  it('no vuelve a correr, y correrlo a mano no cambia nada', async () => {
    const r = await dentro(elDO(), async (db: any) => {
      const antes = db.sql.exec(`SELECT id, dias, costo FROM quell_tareas ORDER BY id`).toArray();
      await db.correrPendientes();
      const { ponerTiemposDefault } = await import('../src/quell/motor.js');
      const { baseSobreSql } = await import('../src/org-db');
      const otra = await ponerTiemposDefault({ DB: baseSobreSql(db.sql) });
      return { antes, despues: db.sql.exec(`SELECT id, dias, costo FROM quell_tareas ORDER BY id`).toArray(), otra };
    });
    expect(r.despues).toEqual(r.antes);
    expect(r.otra).toEqual({ obras: 0, piezas_con_fases: 0, fases_con_dias: 0 });
  });
});

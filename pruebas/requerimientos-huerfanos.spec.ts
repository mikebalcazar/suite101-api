/* La migración 0030: los requerimientos del plano que se quedaron sin ítem.
 *
 * Mike, 2-oct-2026: «los requerimientos levantados en quell son ítems no
 * aprobados (…) tienen que aparecer en la lista de quote de ítems
 * pendientes. Ahorita hay unos requerimientos del Depto Bosques de Santa Fe
 * que no aparecen en ítems pendientes en quote».
 *
 * Un requerimiento nace como ítem cotizado sólo si la obra ya estaba ligada
 * cuando se levantó (0.49.0). Los de antes de ligar —o de antes del 29-sep—
 * son pines sin ítem, y sin ítem quote101 no tiene nada que enseñar. La
 * 0030 corre en código y los levanta en las obras ya ligadas; esto mide que
 * una base con ese hueco salga de `migrar()` con el ítem, la liga del pin y
 * el renglón en el borrador de quote101.
 *
 * Se arma como la prueba de la 0027: dentro del Durable Object, con las 26
 * primeras aplicadas tal cual (la 0027 corre en código y todavía espera
 * `negocio_id`), se siembra lo mínimo —un negocio, un cliente, un proyecto,
 * una obra LIGADA, su plano y un pin de tipo requerimiento sin ítem— y se
 * deja que `migrar()` haga lo suyo (0027, 0028, 0029 y 0030).
 */

import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

describe('la migración 0030 sobre una obra ligada con un requerimiento sin ítem', () => {
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const entorno = env as unknown as { ORG: DurableObjectNamespace };
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0030')) as unknown as DurableObjectStub;
  const HASTA = 26;
  const T = '2026-09-01T00:00:00.000Z';

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.sql.exec(`CREATE TABLE IF NOT EXISTS _migraciones (version INTEGER PRIMARY KEY, aplicada_at TEXT NOT NULL)`);
      for (let i = 0; i < HASTA; i++) {
        db.sql.exec(MIGRACIONES[i]);
        db.sql.exec(`INSERT INTO _migraciones (version, aplicada_at) VALUES (?, ?)`, i + 1, T);
      }
      const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
      x(`INSERT INTO negocios (id, nombre, rfc, moneda, dia_conciliacion, creado_at) VALUES ('n-a','Alfa','AAA010101AAA','MXN',2,?)`, T);
      x(`INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl1','n-a','Depto','depto','dash101',?)`, T);
      x(`INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, creado_at) VALUES ('p1','n-a','cl1','Bosques','activo',?)`, T);
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, created_at) VALUES ('o1','Bosques (obra)','Depto','p1',?)`, T);
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, created_at) VALUES ('o2','Suelta','Nadie',NULL,?)`, T);
      x(`INSERT INTO quell_plans (id, project_id, name, image_key, width, height, created_at) VALUES ('pl1','o1','Planta','k1',1000,800,?)`, T);
      x(`INSERT INTO quell_plans (id, project_id, name, image_key, width, height, created_at) VALUES ('pl2','o2','Planta','k2',1000,800,?)`, T);
      // El huérfano: requerimiento sin ítem en la obra ligada.
      x(`INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, x, y, created_at) VALUES ('e-rq','pl1','o1','RQ-01','Requerimiento','Barra nueva',0.5,0.5,?)`, T);
      // Una pieza normal sin ítem: NO es requerimiento, no se toca.
      x(`INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, x, y, created_at) VALUES ('e-mw','pl1','o1','MW-01','Mueble','Cocina',0.4,0.4,?)`, T);
      // Un requerimiento en una obra SIN ligar: se queda igual, se repara al ligar.
      x(`INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, x, y, created_at) VALUES ('e-suelto','pl2','o2','RQ-01','Requerimiento','Sin casa',0.5,0.5,?)`, T);
      return true;
    });
  });

  it('la base vieja tiene el requerimiento sin ítem', async () => {
    const antes = await dentro(elDO(), (db: any) => ({
      version: db.version(),
      items: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM items`).one().n),
      sinItem: db.sql.exec(`SELECT id FROM quell_elements WHERE item_id IS NULL ORDER BY id`).toArray().map((e: any) => e.id),
    }));
    expect(antes.version).toBe(HASTA);
    expect(antes.items).toBe(0);
    expect(antes.sinItem).toEqual(['e-mw', 'e-rq', 'e-suelto']);
  });

  it('migrar() aplica la 0030: el requerimiento ya es ítem cotizado, ligado y en el borrador', async () => {
    const despues = await dentro(elDO(), (db: any) => {
      db.migrar();
      return {
        version: db.version(),
        items: db.sql.exec(`SELECT id, proyecto_id, cliente_id, nombre, tipo, estado, monto, clave, creado_por FROM items`).toArray(),
        piezas: db.sql.exec(`SELECT id, item_id FROM quell_elements ORDER BY id`).toArray(),
        cotizaciones: db.sql.exec(`SELECT estado, datos FROM cotizaciones`).toArray().map((c: any) => ({ estado: c.estado, datos: JSON.parse(c.datos) })),
      };
    });
    expect(despues.version).toBe(VERSION_ORG_DB);
    expect(despues.items.length, 'uno solo: el requerimiento de la obra ligada').toBe(1);
    const it = despues.items[0];
    expect(it).toMatchObject({ proyecto_id: 'p1', cliente_id: 'cl1', nombre: 'Barra nueva', tipo: 'requerimiento', estado: 'cotizado', monto: 0, clave: 'RQ-01', creado_por: 'migracion-0030' });
    expect(despues.piezas).toEqual([
      { id: 'e-mw', item_id: null },
      { id: 'e-rq', item_id: it.id },
      { id: 'e-suelto', item_id: null },
    ]);
    expect(despues.cotizaciones.length).toBe(1);
    expect(despues.cotizaciones[0].estado).toBe('borrador');
    expect(despues.cotizaciones[0].datos).toMatchObject({ nombre: 'Requerimientos', proyecto_id: 'p1', de_requerimientos: true });
    expect(despues.cotizaciones[0].datos.versiones[0].muebles.map((m: any) => m.item_id)).toEqual([it.id]);
  });

  it('volver a migrar no hace nada: es idempotente', async () => {
    const otraVez = await dentro(elDO(), (db: any) => {
      db.levantarRequerimientosHuerfanos();
      return {
        items: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM items`).one().n),
        renglones: JSON.parse(db.sql.exec(`SELECT datos FROM cotizaciones`).one().datos).versiones[0].muebles.length,
      };
    });
    expect(otraVez).toEqual({ items: 1, renglones: 1 });
  });
});

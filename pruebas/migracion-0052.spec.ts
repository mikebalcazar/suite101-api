/* La migración 0052 sobre una base que ya timbró (15-oct-2026).
 *
 * La 0052 agrega `cfdi.pruebas` y `emisiones.pruebas` y marca lo ya timbrado
 * según la cuenta de Facturama que haya: si es sandbox, todo lo timbrado
 * hasta hoy fue de pruebas (nunca hubo cuenta de verdad); si es de verdad o
 * no hay, no se adivina nada. Se mide DENTRO del Durable Object, con el
 * SQLite de verdad, en dos empresas: una con cuenta sandbox (el caso de
 * forespot el 15-oct) y una con cuenta de verdad. Lo que ya estaba queda
 * idéntico en sus columnas de antes; correrla dos veces no truena ni cambia
 * nada. */

import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
const entorno = env as unknown as { ORG: DurableObjectNamespace };
const elDO = (n: string) => entorno.ORG.get(entorno.ORG.idFromName(`migracion-0052-${n}`)) as unknown as DurableObjectStub;

/** La 0052 se busca por su contenido, no por un número escrito a mano. */
const HASTA = MIGRACIONES.findIndex((m) => m.includes('ALTER TABLE cfdi ADD COLUMN pruebas'));
const T = '2026-10-15T12:00:00.000Z';

const COLS_CFDI = 'id, uuid, rfc, tipo, subtotal, iva, total, fecha, estado, origen, pac_id, creado_por, creado_at';
const COLS_EM = 'id, serie, folio, estado, borrador, pac_id, uuid, cfdi_id, error, creada_por, creada_at';
const foto = (db: any) => JSON.stringify({
  cfdi: db.sql.exec(`SELECT ${COLS_CFDI} FROM cfdi ORDER BY id`).toArray(),
  emisiones: db.sql.exec(`SELECT ${COLS_EM} FROM emisiones ORDER BY id`).toArray(),
});
const columnas = (db: any, t: string): string[] => db.sql.exec(`SELECT name FROM pragma_table_info('${t}')`).toArray().map((c: any) => String(c.name));

/** Una empresa en la 0051 con dos timbradas, una subida a mano y una del SAT, y su cuenta de Facturama. */
async function sembrar(n: string, sandbox: boolean | null): Promise<void> {
  await dentro(elDO(n), async (db: any) => {
    await db.ctx.storage.deleteAll();
    db.migrar(HASTA);
    const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
    const cfdi = (id: string, origen: string, pac_id: string | null) =>
      x(`INSERT INTO cfdi (id, uuid, rfc, tipo, subtotal, iva, total, fecha, estado, origen, pac_id, creado_por, creado_at) VALUES (?,?,?,'ingreso',10000,1600,11600,'2026-10-15','vigente',?,?,'u-mike',?)`,
        id, `UUID-${id}`, 'XAXX010101000', origen, pac_id, T);
    cfdi('c1', 'timbrado', 'fac-1');
    cfdi('c2', 'timbrado', 'fac-2');
    cfdi('c3', 'xml', null);
    cfdi('c4', 'sat', null);
    x(`INSERT INTO emisiones (id, serie, folio, estado, borrador, pac_id, uuid, cfdi_id, creada_por, creada_at) VALUES ('e1','A',1,'timbrada','{}','fac-1','UUID-c1','c1','u-mike',?)`, T);
    x(`INSERT INTO emisiones (id, serie, folio, estado, borrador, error, creada_por, creada_at) VALUES ('e2','A',2,'fallida','{}','305','u-mike',?)`, T);
    if (sandbox !== null) {
      x(`INSERT INTO pac_config (id, proveedor, org_id, usuario, clave_iv, clave_dato, sandbox, serie, folio_siguiente, puesta_por, puesta_at) VALUES ('pac','facturama',?,'mike','iv','dato',?,'A',3,'u-mike',?)`, `migracion-0052-${n}`, sandbox ? 1 : 0, T);
    }
    return true;
  });
}

describe('la migración 0052 sobre una base que ya timbró', () => {
  const antes: Record<string, string> = {};

  beforeAll(async () => {
    await sembrar('sandbox', true);
    await sembrar('verdad', false);
    await sembrar('sin-cuenta', null);
    for (const n of ['sandbox', 'verdad', 'sin-cuenta']) antes[n] = await dentro(elDO(n), (db: any) => foto(db));
  });

  it('la base vieja está en la 0051: sin la columna', async () => {
    const r = await dentro(elDO('sandbox'), (db: any) => ({ version: db.version(), cols: columnas(db, 'cfdi'), colsEm: columnas(db, 'emisiones') }));
    expect(HASTA).toBe(51);
    expect(r.version).toBe(HASTA);
    expect(r.cols).not.toContain('pruebas');
    expect(r.colsEm).not.toContain('pruebas');
  });

  it('con cuenta sandbox: lo timbrado queda de pruebas; lo subido a mano y lo del SAT, sin marca', async () => {
    const r = await dentro(elDO('sandbox'), (db: any) => {
      db.migrar();
      return {
        version: db.version(),
        foto: foto(db),
        cfdi: db.sql.exec(`SELECT id, pruebas FROM cfdi ORDER BY id`).toArray(),
        emisiones: db.sql.exec(`SELECT id, pruebas FROM emisiones ORDER BY id`).toArray(),
        fk: db.sql.exec(`PRAGMA foreign_key_check`).toArray(),
        repetida: (() => { try { db.cfdiDePruebas(); return 'entró'; } catch (e) { return String((e as Error).message); } })(),
        despues: db.sql.exec(`SELECT id, pruebas FROM cfdi ORDER BY id`).toArray(),
      };
    });
    expect(r.version).toBe(VERSION_ORG_DB);
    expect(r.foto, 'ni una factura ni una emisión cambia en lo que ya tenía').toBe(antes.sandbox);
    expect(r.cfdi).toEqual([{ id: 'c1', pruebas: 1 }, { id: 'c2', pruebas: 1 }, { id: 'c3', pruebas: null }, { id: 'c4', pruebas: null }]);
    expect(r.emisiones, 'cada folio apartado con esa cuenta, incluido el fallido').toEqual([{ id: 'e1', pruebas: 1 }, { id: 'e2', pruebas: 1 }]);
    expect(r.fk).toEqual([]);
    expect(r.repetida, 'correrla otra vez no truena').toBe('entró');
    expect(r.despues, 'ni cambia nada').toEqual(r.cfdi);
  });

  it('con cuenta de verdad, o sin cuenta: nada se marca; no se adivina', async () => {
    for (const n of ['verdad', 'sin-cuenta']) {
      const r = await dentro(elDO(n), (db: any) => {
        db.migrar();
        return {
          version: db.version(),
          foto: foto(db),
          marcadas: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM cfdi WHERE pruebas IS NOT NULL`).one().n),
          marcadasEm: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM emisiones WHERE pruebas IS NOT NULL`).one().n),
          cols: columnas(db, 'cfdi'),
        };
      });
      expect(r.version, n).toBe(VERSION_ORG_DB);
      expect(r.foto, n).toBe(antes[n]);
      expect(r.marcadas, `${n}: ninguna marcada`).toBe(0);
      expect(r.marcadasEm, n).toBe(0);
      expect(r.cols, n).toContain('pruebas');
    }
  });

  it('el motor ya no borra lo que no es de pruebas, y sí lo que es', async () => {
    const r = await dentro(elDO('sandbox'), (db: any) => ({
      verdad: db.pac('borrarPrueba', ['c3', { usuario_id: 'u-mike' }]),
      prueba: db.pac('borrarPrueba', ['c1', { usuario_id: 'u-mike' }]),
      quedan: db.sql.exec(`SELECT id FROM cfdi ORDER BY id`).toArray().map((f: any) => f.id),
      emision: db.sql.exec(`SELECT estado, cfdi_id, error FROM emisiones WHERE id = 'e1'`).one(),
    }));
    expect(r.verdad).toMatchObject({ error: 'no_es_de_pruebas' });
    expect(r.prueba).toMatchObject({ cfdi_id: 'c1', uuid: 'UUID-c1', llaves: [] });
    expect(r.quedan).toEqual(['c2', 'c3', 'c4']);
    expect(r.emision).toMatchObject({ estado: 'timbrada', cfdi_id: null });
    expect(String(r.emision.error)).toMatch(/factura de pruebas borrada/);
  });
});

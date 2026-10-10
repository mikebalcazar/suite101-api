/* La migración 0050 sobre una base que ya tiene órdenes y reembolsos (0.92.0).
 *
 * La 0050 agrega la tabla `reembolso_cuentas` y tres columnas a `ordenes`
 * (`reembolso_clabe`, `reembolso_banco`, `reembolso_beneficiario`). Corre en
 * código, como la 0049, para poder repetirse sin tronar. Se mide DENTRO del
 * Durable Object, con el SQLite de verdad: una base en la 0049 con órdenes de
 * los dos tipos, se migra, y se compara la base, no lo que la migración dice
 * que hizo: filas idénticas en las columnas que ya existían, las nuevas en
 * nulo, `PRAGMA foreign_key_check` vacío, y que correrla dos veces no truena.
 * Y lo que lee el motor después: un reembolso viejo sale con `clabe: null`
 * en `reembolso_a` (la pantalla lo dice); uno nuevo, con su cuenta copiada. */

import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
const entorno = env as unknown as { ORG: DurableObjectNamespace };
const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0050')) as unknown as DurableObjectStub;

/** La 0050 se busca por su contenido, no por un número escrito a mano. */
const HASTA = MIGRACIONES.findIndex((m) => m.includes('CREATE TABLE IF NOT EXISTS reembolso_cuentas'));
const T = '2026-10-09T12:00:00.000Z';

const orden = (x: (q: string, ...a: unknown[]) => unknown, id: string, folio: string, estado: string, extra: Record<string, unknown> = {}) => {
  const fila: Record<string, unknown> = {
    id, folio, solicitante_usuario_id: 'u-ana', solicitante_id: 'pe-ana', solicitante_correo: 'ana@ejemplo.mx',
    solicitante_nombre: 'Ana', proveedor_id: null, proveedor_nombre: 'Maderas', proyecto_id: null, partida_id: null,
    concepto: `Concepto ${id}`, monto: 116000, moneda: 'MXN', con_factura: 1, subtotal: 100000, iva: 16000, tasa_iva: 1600,
    fecha_maxima_pago: '2026-10-10', urgente: 0, estado, nota_contador: null, movimiento_id: null,
    creado_at: T, actualizado_at: null, pagada_at: null, pagada_por: null, tipo: 'compra', ...extra,
  };
  const cols = Object.keys(fila);
  x(`INSERT INTO ordenes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => fila[c]));
};

const COLS_VIEJAS = 'id, folio, solicitante_usuario_id, solicitante_id, solicitante_correo, solicitante_nombre, proveedor_id, proveedor_nombre, proyecto_id, partida_id, concepto, monto, moneda, con_factura, subtotal, iva, tasa_iva, fecha_maxima_pago, urgente, estado, nota_contador, movimiento_id, creado_at, actualizado_at, pagada_at, pagada_por, tipo';
const foto = (db: any) => JSON.stringify({
  ordenes: db.sql.exec(`SELECT ${COLS_VIEJAS} FROM ordenes ORDER BY id`).toArray(),
  eventos: db.sql.exec(`SELECT * FROM orden_eventos ORDER BY id`).toArray(),
  folios: db.sql.exec(`SELECT * FROM folios ORDER BY serie`).toArray(),
});
const columnas = (db: any, t: string): string[] => db.sql.exec(`SELECT name FROM pragma_table_info('${t}')`).toArray().map((c: any) => String(c.name));
const intenta = (db: any, q: string, ...a: unknown[]): string => {
  try { db.sql.exec(q, ...a); return 'entró'; } catch (e) { return String((e as Error).message); }
};

describe('la migración 0050 sobre una base con compras y reembolsos', () => {
  let antes = '';
  let antesCols: string[] = [];

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.migrar(HASTA);
      const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
      x(`INSERT INTO personal (id, nombre, nombre_norm, usuario_id, creado_en_app, creado_at) VALUES ('pe-ana','Ana','ana','u-ana','dash101',?)`, T);
      orden(x, 'o1', 'OC-000001', 'en_buzon');
      orden(x, 'o2', 'RE-000001', 'en_buzon', { tipo: 'reembolso', proveedor_nombre: null, monto: 85000, subtotal: 85000, iva: 0, con_factura: 0, tasa_iva: 0, fecha_maxima_pago: null });
      orden(x, 'o3', 'RE-000002', 'pagada', { tipo: 'reembolso', proveedor_nombre: 'OXXO', monto: 12000, subtotal: 12000, iva: 0, con_factura: 0, tasa_iva: 0, pagada_at: T, pagada_por: 'u-beto' });
      x(`UPDATE folios SET siguiente = 2 WHERE serie = 'OC'`);
      x(`UPDATE folios SET siguiente = 3 WHERE serie = 'RE'`);
      x(`INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, quien_nombre, nota, ts) VALUES ('e1','o2','creada','u-ana','ana@ejemplo.mx','Concepto o2 · reembolso a Ana',?)`, T);
      return true;
    });
    const r = await dentro(elDO(), (db: any) => ({ foto: foto(db), cols: columnas(db, 'ordenes') }));
    antes = r.foto;
    antesCols = r.cols;
  });

  it('la base vieja está en la 0049: sin reembolso_cuentas y sin las columnas', async () => {
    const r = await dentro(elDO(), (db: any) => ({
      version: db.version(),
      tabla: db.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reembolso_cuentas'`).toArray().length,
    }));
    expect(HASTA).toBe(49);
    expect(r.version).toBe(HASTA);
    expect(r.tabla).toBe(0);
    expect(antesCols).not.toContain('reembolso_clabe');
  });

  it('migrar() aplica la 0050: las filas de antes idénticas, las columnas nuevas en nulo, las llaves cuadran', async () => {
    const r = await dentro(elDO(), (db: any) => {
      db.migrar();
      return {
        version: db.version(),
        foto: foto(db),
        cols: columnas(db, 'ordenes'),
        colsCuentas: columnas(db, 'reembolso_cuentas'),
        nulas: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM ordenes WHERE reembolso_clabe IS NULL AND reembolso_banco IS NULL AND reembolso_beneficiario IS NULL`).one().n),
        total: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM ordenes`).one().n),
        fk: db.sql.exec(`PRAGMA foreign_key_check`).toArray(),
        repetida: (() => { try { db.cuentaDeReembolso(); return 'entró'; } catch (e) { return String((e as Error).message); } })(),
      };
    });
    expect(r.version).toBe(VERSION_ORG_DB);
    expect(r.foto, 'ni una orden, ni un evento, ni un folio cambia').toBe(antes);
    expect(r.cols).toEqual([...antesCols, 'reembolso_clabe', 'reembolso_banco', 'reembolso_beneficiario']);
    expect(r.colsCuentas).toEqual(['usuario_id', 'clabe', 'banco', 'beneficiario', 'actualizado_at']);
    expect(r.nulas, 'lo de antes no tiene cuenta: nulo, no inventado').toBe(r.total);
    expect(r.fk).toEqual([]);
    expect(r.repetida, 'correrla otra vez no truena').toBe('entró');
  });

  it('el motor lee la base migrada: el reembolso viejo sin cuenta, el nuevo con la suya copiada', async () => {
    const r = await dentro(elDO(), (db: any) => {
      const viejo = db.verOrden('o2');
      const compra = db.verOrden('o1');
      const sinCuenta = db.crearOrden({ solicitante_usuario_id: 'u-ana', solicitante_id: 'pe-ana', solicitante_correo: 'ana@ejemplo.mx', solicitante_nombre: 'Ana', tipo: 'reembolso', concepto: 'Casetas', monto: 30000 });
      const guardada = db.guardarCuentaDeReembolso({ usuario_id: 'u-ana', clabe: '012180015621788594', banco: 'BBVA', beneficiario: ' ' });
      const nuevo = db.crearOrden({ solicitante_usuario_id: 'u-ana', solicitante_id: 'pe-ana', solicitante_correo: 'ana@ejemplo.mx', solicitante_nombre: 'Ana', tipo: 'reembolso', concepto: 'Casetas', monto: 30000 });
      return {
        viejo: viejo.reembolso_a, compra: compra.reembolso_a, sinCuenta,
        guardada, nuevo: db.verOrden(nuevo.id).reembolso_a,
        unaPorUsuario: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM reembolso_cuentas`).one().n),
        mias: db.misOrdenes('u-ana').length,
      };
    });
    expect(r.viejo).toEqual({ nombre: 'Ana', correo: 'ana@ejemplo.mx', clabe: null, banco: null, beneficiario: null });
    expect(r.compra).toBeNull();
    expect(r.sinCuenta.error, 'sin cuenta guardada, el reembolso no entra').toBe('falta_cuenta_reembolso');
    expect(r.guardada.beneficiario, 'un beneficiario en blanco es nulo').toBeNull();
    expect(r.nuevo, 'la cuenta guardada sin beneficiario se copia a nombre de quien pide').toEqual({ nombre: 'Ana', correo: 'ana@ejemplo.mx', clabe: '012180015621788594', banco: 'BBVA', beneficiario: 'Ana' });
    expect(r.unaPorUsuario).toBe(1);
    expect(r.mias).toBe(4);
  });

  it('una CLABE vacía no entra a la tabla: la columna es NOT NULL', async () => {
    const r = await dentro(elDO(), (db: any) => intenta(db, `INSERT INTO reembolso_cuentas (usuario_id, clabe, actualizado_at) VALUES ('u-x', NULL, ?)`, T));
    expect(r).toMatch(/NOT NULL/i);
  });
});

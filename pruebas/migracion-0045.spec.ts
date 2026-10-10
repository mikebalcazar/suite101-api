/* La migración 0045 sobre una base que ya tiene órdenes (0.86.0).
 *
 * La 0045 rehace `ordenes` y `orden_eventos` para que su CHECK admita
 * `cancelada`. Es la operación más delicada que hay en SQLite —tirar una
 * tabla con dinero y volverla a crear—, y en el Durable Object con un riesgo
 * más: las llaves foráneas siempre están prendidas, y `orden_eventos` apunta
 * a `ordenes`. Si un paso deja un evento sin su orden, workerd truena o
 * resetea el objeto (ver `quitarNegocios`).
 *
 * Por eso se mide DENTRO del Durable Object, con el SQLite de verdad: se
 * arma una base en la 0044 —con las migraciones en código incluidas, que es
 * como la tiene hoy una empresa—, se siembran órdenes de los cuatro estados
 * de antes, de los dos tipos, con proyecto, partida, egreso y archivo, y
 * eventos de todas las clases, incluidos los del permiso (orden nula). Se
 * migra y se compara la base, no lo que la migración dice que hizo: fila por
 * fila, los índices, `PRAGMA foreign_key_check`, y que el CHECK nuevo
 * admite `cancelada` y sigue rechazando lo inventado. */

import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
const entorno = env as unknown as { ORG: DurableObjectNamespace };
const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0045')) as unknown as DurableObjectStub;

/** La 0045 es la que rehace las órdenes: se busca por su contenido, no por
 *  un número escrito a mano. HASTA = cuántas van antes de ella. */
const HASTA = MIGRACIONES.findIndex((m) => m.includes('CREATE TABLE ordenes_nueva'));
const T = '2026-10-01T12:00:00.000Z';

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

const evento = (x: (q: string, ...a: unknown[]) => unknown, id: string, orden_id: string | null, que: string, nota: string | null = null, sobre: string | null = null) =>
  x(`INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, quien_nombre, sobre_personal_id, nota, ts) VALUES (?,?,?,?,?,?,?,?)`,
    id, orden_id, que, 'u-ana', 'ana@ejemplo.mx', sobre, nota, T);

/** Todo lo que se compara antes y después, en texto: si cambia un centavo,
 *  una fecha o un id, la cadena cambia. */
const foto = (db: any) => JSON.stringify({
  ordenes: db.sql.exec(`SELECT * FROM ordenes ORDER BY id`).toArray(),
  eventos: db.sql.exec(`SELECT * FROM orden_eventos ORDER BY id`).toArray(),
  archivos: db.sql.exec(`SELECT * FROM archivos ORDER BY id`).toArray(),
  movimientos: db.sql.exec(`SELECT * FROM movimientos ORDER BY id`).toArray(),
  partidas: db.sql.exec(`SELECT * FROM partidas ORDER BY id`).toArray(),
  folios: db.sql.exec(`SELECT * FROM folios ORDER BY serie`).toArray(),
});
const columnas = (db: any, t: string): string[] => db.sql.exec(`SELECT name FROM pragma_table_info('${t}')`).toArray().map((c: any) => String(c.name));
const indices = (db: any, t: string): Array<{ name: string; sql: string }> =>
  db.sql.exec(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name`, t).toArray();
const intenta = (db: any, q: string, ...a: unknown[]): string => {
  try { db.sql.exec(q, ...a); return 'entró'; } catch (e) { return String((e as Error).message); }
};

describe('la migración 0045 sobre una base con órdenes y eventos', () => {
  let antes = '';
  let antesCols: Record<string, string[]> = {};
  let antesIndices: Record<string, Array<{ name: string; sql: string }>> = {};

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.migrar(HASTA);
      const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
      x(`INSERT INTO personal (id, nombre, nombre_norm, usuario_id, creado_en_app, creado_at) VALUES ('pe-ana','Ana','ana','u-ana','dash101',?)`, T);
      x(`INSERT INTO personal (id, nombre, nombre_norm, usuario_id, es_contador, creado_en_app, creado_at) VALUES ('pe-beto','Beto','beto','u-beto',1,'dash101',?)`, T);
      x(`INSERT INTO cuentas (id, nombre, tipo, saldo_inicial, creado_at) VALUES ('cu1','Banco','banco',0,?)`, T);
      x(`INSERT INTO clientes (id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl1','HOLCIM','holcim','dash101',?)`, T);
      x(`INSERT INTO proyectos (id, cliente_id, nombre, estado, creado_at) VALUES ('p1','cl1','Planta','activo',?)`, T);
      x(`INSERT INTO partidas (id, proyecto_id, proveedor_nombre, concepto, monto_acordado, creado_at) VALUES ('pa1','p1','Maderas','Madera',116000,?)`, T);
      x(`INSERT INTO movimientos (id, tipo, monto, fecha, cuenta_id, proyecto_id, partida_id, categoria, creado_por, creado_at) VALUES ('m1','egreso',116000,'2026-10-02','cu1','p1','pa1','orden_de_compra','u-beto',?)`, T);

      orden(x, 'o1', 'OC-000001', 'en_buzon', { urgente: 1 });
      orden(x, 'o2', 'OC-000002', 'devuelta', { nota_contador: 'Falta la cotización', actualizado_at: T });
      orden(x, 'o3', 'OC-000003', 'pagada', { proyecto_id: 'p1', partida_id: 'pa1', movimiento_id: 'm1', pagada_at: T, pagada_por: 'u-beto', actualizado_at: T });
      orden(x, 'o4', 'OC-000004', 'rechazada', { nota_contador: 'Hay en bodega', con_factura: 0, subtotal: 116000, iva: 0, tasa_iva: 0 });
      orden(x, 'o5', 'RE-000001', 'en_buzon', { tipo: 'reembolso', proveedor_nombre: null, monto: 85000, subtotal: 85000, iva: 0, con_factura: 0, tasa_iva: 0, fecha_maxima_pago: null });
      x(`UPDATE folios SET siguiente = 5 WHERE serie = 'OC'`);
      x(`UPDATE folios SET siguiente = 2 WHERE serie = 'RE'`);

      evento(x, 'e01', 'o1', 'creada', 'Concepto o1 · Maderas');
      evento(x, 'e02', 'o2', 'creada');
      evento(x, 'e03', 'o2', 'devuelta', 'Falta la cotización');
      evento(x, 'e04', 'o3', 'creada');
      evento(x, 'e05', 'o3', 'devuelta', 'Otra tasa');
      evento(x, 'e06', 'o3', 'corregida', 'corregida y de vuelta al buzón');
      evento(x, 'e07', 'o3', 'pagada');
      evento(x, 'e08', 'o4', 'creada');
      evento(x, 'e09', 'o4', 'rechazada', 'Hay en bodega');
      evento(x, 'e10', 'o5', 'creada');
      // Los del permiso: sin orden.
      evento(x, 'e11', null, 'contador', 'Beto ya puede pagar órdenes', 'pe-beto');
      evento(x, 'e12', null, 'nominas', 'Beto ya puede ver y pagar la raya', 'pe-beto');

      x(`INSERT INTO archivos (id, r2_key, nombre, mime, bytes, de_tabla, de_id, subido_por, creado_at) VALUES ('a1','k/a1','cotizacion.jpg','image/jpeg',10,'ordenes','o1','u-ana',?)`, T);
      return true;
    });
    const r = await dentro(elDO(), (db: any) => ({
      foto: foto(db),
      cols: { ordenes: columnas(db, 'ordenes'), orden_eventos: columnas(db, 'orden_eventos') },
      indices: { ordenes: indices(db, 'ordenes'), orden_eventos: indices(db, 'orden_eventos') },
    }));
    antes = r.foto;
    antesCols = r.cols;
    antesIndices = r.indices;
  });

  it('la base vieja está en la 0044, con sus órdenes, y su CHECK no conoce «cancelada»', async () => {
    const r = await dentro(elDO(), (db: any) => ({
      version: db.version(),
      ordenes: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM ordenes`).one().n),
      eventos: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM orden_eventos`).one().n),
      insertar: intenta(db, `INSERT INTO ordenes (id, folio, solicitante_usuario_id, concepto, monto, estado, creado_at) VALUES ('ox','OC-X','u','x',1,'cancelada',?)`, T),
      evento: intenta(db, `INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, ts) VALUES ('ex','o1','cancelada','u',?)`, T),
    }));
    expect(HASTA).toBe(44);
    expect(r.version).toBe(HASTA);
    expect([r.ordenes, r.eventos]).toEqual([5, 12]);
    expect(r.insertar, 'la orden vieja no admite cancelada').toMatch(/CHECK/i);
    expect(r.evento, 'el evento viejo tampoco').toMatch(/CHECK/i);
    expect(antesCols.ordenes).not.toContain('negocio_id');
    expect(antesCols.ordenes).toContain('tipo');
  });

  it('migrar() aplica la 0045: ni una fila, ni un id, ni un centavo cambia, y las llaves cuadran', async () => {
    const r = await dentro(elDO(), (db: any) => {
      /* La foto y las columnas se toman JUSTO después de la 0045: las que
       * vienen detrás (la 0050 le agrega columnas a `ordenes`) se miden en
       * su propia prueba. Luego se migra hasta el final, que es como la
       * tiene una empresa, y el resto se compara ahí. */
      db.migrar(HASTA + 1);
      const foto45 = foto(db);
      const cols45 = { ordenes: columnas(db, 'ordenes'), orden_eventos: columnas(db, 'orden_eventos') };
      db.migrar();
      return {
        version: db.version(),
        foto: foto45,
        cols: cols45,
        indices: { ordenes: indices(db, 'ordenes'), orden_eventos: indices(db, 'orden_eventos') },
        tablas: db.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table'`).toArray().map((t: any) => String(t.name)),
        fk: db.sql.exec(`PRAGMA foreign_key_check`).toArray(),
        fkPrendidas: db.sql.exec(`PRAGMA foreign_keys`).toArray(),
        llavesEventos: db.sql.exec(`SELECT "table", "from", "to" FROM pragma_foreign_key_list('orden_eventos')`).toArray(),
        llavesOrdenes: db.sql.exec(`SELECT "table", "from" FROM pragma_foreign_key_list('ordenes') ORDER BY "from"`).toArray(),
      };
    });
    expect(r.version).toBe(VERSION_ORG_DB);
    expect(r.foto, 'las órdenes, los eventos, los archivos, el egreso, la partida y los folios, idénticos').toBe(antes);
    expect(r.cols, 'las mismas columnas, en el mismo orden').toEqual(antesCols);
    // Los índices: los mismos nombres y las mismas columnas; el único del folio, único.
    expect(r.indices.ordenes.map((i) => i.name)).toEqual(['ordenes_buzon', 'ordenes_folio', 'ordenes_proyecto', 'ordenes_solicitante', 'ordenes_tipo']);
    expect(r.indices.ordenes.map((i) => i.name)).toEqual(antesIndices.ordenes.map((i) => i.name));
    expect(r.indices.ordenes.find((i) => i.name === 'ordenes_folio')?.sql).toMatch(/CREATE UNIQUE INDEX .*ordenes\(folio\)/);
    expect(r.indices.ordenes.find((i) => i.name === 'ordenes_tipo')?.sql).toMatch(/ordenes\(tipo, estado\)/);
    expect(r.indices.orden_eventos.map((i) => i.name)).toEqual(['orden_eventos_orden']);
    expect(r.tablas.filter((t: string) => /_nueva$|_respaldo$/.test(t)), 'ninguna tabla de trabajo se quedó').toEqual([]);
    expect(r.fk).toEqual([]);
    expect(r.fkPrendidas).toEqual([{ foreign_keys: 1 }]);
    expect(r.llavesEventos, 'el evento apunta a la orden NUEVA').toEqual([{ table: 'ordenes', from: 'orden_id', to: 'id' }]);
    expect(r.llavesOrdenes.map((l: any) => `${l.from}→${l.table}`)).toEqual(['movimiento_id→movimientos', 'partida_id→partidas', 'proyecto_id→proyectos', 'solicitante_id→personal']);
  });

  it('el CHECK nuevo admite «cancelada» en los dos lados y sigue rechazando lo inventado', async () => {
    const r = await dentro(elDO(), (db: any) => ({
      orden: intenta(db, `UPDATE ordenes SET estado = 'cancelada' WHERE id = 'o1'`),
      evento: intenta(db, `INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, ts) VALUES ('e13','o1','cancelada','u-ana',?)`, T),
      inventado: intenta(db, `UPDATE ordenes SET estado = 'perdida' WHERE id = 'o2'`),
      eventoInventado: intenta(db, `INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, ts) VALUES ('e14','o2','borrada','u-ana',?)`, T),
      huerfano: intenta(db, `INSERT INTO orden_eventos (id, orden_id, que, quien_usuario_id, ts) VALUES ('e15','o-no-existe','creada','u-ana',?)`, T),
      folioRepetido: intenta(db, `INSERT INTO ordenes (id, folio, solicitante_usuario_id, concepto, monto, creado_at) VALUES ('o9','OC-000001','u','x',1,?)`, T),
      estado: db.sql.exec(`SELECT estado FROM ordenes WHERE id = 'o1'`).one().estado,
    }));
    expect(r.orden).toBe('entró');
    expect(r.evento).toBe('entró');
    expect(r.estado).toBe('cancelada');
    expect(r.inventado).toMatch(/CHECK/i);
    expect(r.eventoInventado).toMatch(/CHECK/i);
    expect(r.huerfano, 'la llave del evento a su orden sigue viva').toMatch(/FOREIGN KEY/i);
    expect(r.folioRepetido, 'el folio sigue siendo único').toMatch(/UNIQUE/i);
  });

  it('una orden ya no se puede borrar con eventos colgados: la llave sigue cuidando', async () => {
    const r = await dentro(elDO(), (db: any) => intenta(db, `DELETE FROM ordenes WHERE id = 'o2'`));
    expect(r).toMatch(/FOREIGN KEY/i);
  });

  it('y el motor lee la base migrada: el buzón, lo mío y la historia', async () => {
    const r = await dentro(elDO(), (db: any) => ({
      buzon: db.buzon('2026-10-05').filas.map((f: any) => f.id),
      mias: db.misOrdenes('u-ana').map((f: any) => `${f.id}:${f.estado}`).sort(),
      historia: db.verOrden('o3').eventos.map((e: any) => e.que),
      resumen: db.pendientesDeOrdenes(),
    }));
    // o1 se canceló en la prueba de arriba: ya no está en el buzón.
    expect(r.buzon).toEqual(['o5']);
    expect(r.mias).toEqual(['o1:cancelada', 'o2:devuelta', 'o3:pagada', 'o4:rechazada', 'o5:en_buzon']);
    expect(r.historia).toEqual(['creada', 'devuelta', 'corregida', 'pagada']);
    expect(r.resumen).toEqual({ compras: { total: 0, cuantas: 0 }, reembolsos: { total: 85000, cuantas: 1 } });
  });
});

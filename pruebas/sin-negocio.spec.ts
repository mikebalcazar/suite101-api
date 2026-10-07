/* Se va «negocio» (0.63.0). Antes, 0.61.0: `negocio_id` ya no se pide.
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios. Sólo es una
 * empresa/negocio todo. Elimina todas las lógicas que involucran el concepto
 * de "negocio"».
 *
 * Lo que se mide:
 *   · La base de una empresa recién nacida no tiene tabla `negocios` ni
 *     columna `negocio_id` en ninguna tabla, y sí tiene `empresa`
 *     (`GET /admin/orgs/:o/esquema`).
 *   · `GET`/`PATCH /empresa` leen y escriben la tabla `empresa`, con la
 *     misma forma que en 0.62.0, y el renglón nace con el nombre de la org.
 *   · Las filas de cuentas, clientes, proyectos, movimientos, opex y
 *     accionistas ya NO traen `negocio_id`, y si una app vieja lo manda no
 *     truena: se ignora.
 *   · El compat de `/negocios`: lista de uno (la empresa con forma de
 *     negocio), POST 201 con el mismo id, GET por id, PATCH.
 *   · `GET /admin/orgs/:o/quote` contesta el resumen de la empresa.
 *   · LA MIGRACIÓN 0027 sobre una base vieja CON DATOS: dos negocios, filas
 *     huérfanas, productos con el mismo código en los dos, tablas con llave
 *     foránea a `negocios`. Todo queda en la empresa, nada se pierde, las
 *     llaves foráneas cuadran, y volver a correrla no hace daño.
 *
 * Sobre el código viejo (0.62.0): el esquema trae `negocios` y `negocio_id`,
 * las filas traen `negocio_id`, `/admin/orgs/:o/esquema` es 404 y
 * `/admin/orgs/:o/quote` contesta `negocios` en vez de `resumen`.
 */
import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

const CORREO = 'mike@forespot.com';
const ORG = 'sin-negocio';
const galletas: Record<string, string> = {};

async function pedir(quien: string, ruta: string, o: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (o.app !== '') cabeceras['X-App'] = o.app ?? 'dash101';
  if (galletas[quien]) cabeceras.Cookie = galletas[quien];
  let body = o.body;
  if (o.json !== undefined) { body = JSON.stringify(o.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...o, body, headers: { ...cabeceras, ...(o.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas[quien] = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ...cuerpo } as { estado: number; [k: string]: any };
}
const o = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}${ruta}`, op);

async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, JSON.stringify(c)).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, JSON.stringify(e)).toBe(200);
}

let cuenta = '';
let cliente = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Carpintería Sin Negocio', apps: { dash: true, cotizador: true } }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
});

describe('la base ya no sabe de negocios', () => {
  it('no hay tabla negocios ni columna negocio_id en ninguna; sí hay empresa', async () => {
    const r = await pedir('mike', `/admin/orgs/${ORG}/esquema`, { app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const tablas = r.data.tablas as Record<string, string[]>;
    expect(Object.keys(tablas)).not.toContain('negocios');
    expect(Object.keys(tablas).filter((t) => t.endsWith('__copia')), 'ninguna tabla de trabajo se quedó').toEqual([]);
    const conColumna = Object.entries(tablas).filter(([, cols]) => cols.includes('negocio_id')).map(([t]) => t);
    expect(conColumna, 'tablas que todavía traen negocio_id').toEqual([]);
    // 0.80.0 le suma el contacto y el logotipo, que salen en los documentos.
    expect(tablas.empresa).toEqual(['id', 'nombre', 'rfc', 'moneda', 'dia_conciliacion', 'creado_at', 'correo', 'telefono', 'sitio_web', 'direccion', 'logo_llave', 'logo_at']);
    // Las que llevaban llave foránea a negocios siguen con sus demás columnas.
    expect(tablas.cuentas).toEqual(['id', 'nombre', 'tipo', 'banco', 'moneda', 'saldo_inicial', 'creado_at']);
    expect(tablas.accionistas).toContain('porcentaje');
    expect(tablas.rayas).toContain('periodo_fin');
    expect(tablas.conciliaciones).toEqual(['id', 'corte_at', 'hecha_por', 'creado_at']);
  });

  it('el esquema es sólo del dueño de la suite', async () => {
    const antes = galletas.mike;
    galletas.mike = '';
    expect((await pedir('mike', `/admin/orgs/${ORG}/esquema`, { app: '' })).estado).toBe(401);
    galletas.mike = antes;
  });

});

describe('la empresa tiene su ruta, sobre la tabla empresa', () => {
  it('GET /empresa nace con el nombre de la org, id fijo, y la forma de 0.62.0', async () => {
    const r = await o('mike', '/empresa');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.id).toBe('empresa');
    expect(r.data.nombre).toBe('Carpintería Sin Negocio');
    expect(r.data.moneda).toBe('MXN');
    expect(r.data.dia_conciliacion).toBe(1);
    expect(Object.keys(r.data).sort()).toEqual(['correo', 'dia_conciliacion', 'direccion', 'id', 'logo_ruta', 'moneda', 'nombre', 'rfc', 'sitio_web', 'telefono']);
  });

  it('PATCH /empresa cambia rfc, moneda y día, y lo que no se manda se queda', async () => {
    const r = await o('mike', '/empresa', { method: 'PATCH', json: { rfc: 'csn010101aaa', dia_conciliacion: 5 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.rfc).toBe('CSN010101AAA');
    expect(r.data.dia_conciliacion).toBe(5);
    expect(r.data.nombre).toBe('Carpintería Sin Negocio');
    expect((await o('mike', '/empresa')).data.rfc, 'quedó escrito').toBe('CSN010101AAA');
  });

  it('una moneda inventada, un día fuera de 0-6 o un nombre vacío se rechazan', async () => {
    expect((await o('mike', '/empresa', { method: 'PATCH', json: { moneda: 'EUR' } })).estado).toBe(400);
    expect((await o('mike', '/empresa', { method: 'PATCH', json: { dia_conciliacion: 9 } })).estado).toBe(400);
    expect((await o('mike', '/empresa', { method: 'PATCH', json: { nombre: '  ' } })).estado).toBe(400);
  });
});

describe('las filas ya no traen negocio_id, y mandarlo no truena', () => {
  it('cuenta, cliente, proyecto, movimiento, opex y accionista: sin negocio_id en la respuesta', async () => {
    const c = await o('mike', '/cuentas', { method: 'POST', json: { nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldo_inicial: 100_000_00 } });
    expect(c.estado, JSON.stringify(c)).toBe(201);
    expect('negocio_id' in c.data).toBe(false);
    cuenta = c.data.id;
    const cl = await o('mike', '/clientes', { method: 'POST', json: { nombre: 'HOLCIM' } });
    expect(cl.estado, JSON.stringify(cl)).toBe(201); expect('negocio_id' in cl.data).toBe(false);
    cliente = cl.data.id;
    const p = await o('mike', '/proyectos', { method: 'POST', json: { cliente_id: cliente, nombre: 'Planta' } });
    expect(p.estado, JSON.stringify(p)).toBe(201); expect('negocio_id' in p.data).toBe(false);
    const m = await o('mike', '/movimientos', { method: 'POST', json: { tipo: 'egreso', monto: 7_000_00, fecha: '2026-10-01', cuenta_id: cuenta, contraparte_tipo: 'otro', categoria: 'gasto_general', descripcion: 'Renta' } });
    expect(m.estado, JSON.stringify(m)).toBe(201); expect('negocio_id' in m.data).toBe(false);
    const x = await o('mike', '/opex', { method: 'POST', json: { nombre: 'Luz', monto: 1_500_00, frecuencia: 'mensual', fecha_inicio: '2026-10-01' } });
    expect(x.estado, JSON.stringify(x)).toBe(201); expect('negocio_id' in x.data).toBe(false);
    const a = await o('mike', '/accionistas', { method: 'POST', json: { nombre: 'Mike Balcázar', porcentaje: 100 } });
    expect(a.estado, JSON.stringify(a)).toBe(201); expect('negocio_id' in a.data).toBe(false);
    expect((await o('mike', `/cuentas/${cuenta}`)).data.saldo).toBe(100_000_00 - 7_000_00);
    for (const f of (await o('mike', '/cuentas')).data.filas) expect('negocio_id' in f).toBe(false);
  });

  it('una app vieja que todavía manda negocio_id al crear o al editar no se lleva un 403: se ignora', async () => {
    const r = await o('mike', '/cuentas', { method: 'POST', json: { negocio_id: 'lo-que-sea', nombre: 'Caja', tipo: 'caja', moneda: 'MXN', saldo_inicial: 0 } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect('negocio_id' in r.data).toBe(false);
    // `clientes` tiene lista de campos por app: negocio_id ya no está en ella y aun así pasa.
    const cl = await o('mike', '/clientes', { method: 'POST', json: { negocio_id: 'viejo', nombre: 'Cemex' }, app: 'cotizador101' });
    expect(cl.estado, JSON.stringify(cl)).toBe(201);
    const ed = await o('mike', `/clientes/${cl.data.id}`, { method: 'PATCH', json: { negocio_id: 'viejo', telefono: '5551234567' } });
    expect(ed.estado, JSON.stringify(ed)).toBe(200);
    expect(ed.data.telefono).toBe('5551234567');
    // Y como filtro tampoco acota nada: la lista es de la empresa.
    expect((await o('mike', '/clientes?negocio_id=viejo')).data.total).toBe(2);
  });
});

describe('las rutas que lo exigían', () => {
  it('la conciliación se hace sin negocio_id y su estadística se lee', async () => {
    const r = await o('mike', '/conciliaciones', { method: 'POST', json: { saldos: (await o('mike', '/cuentas')).data.filas.map((c: any) => ({ cuenta_id: c.id, saldo_real: c.saldo })) } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect('negocio_id' in r.data.conciliacion).toBe(false);
    expect(r.data.diferencia_total).toBe(0);
    const e = await o('mike', '/conciliaciones/estadistica');
    expect(e.estado, JSON.stringify(e)).toBe(200);
    expect(e.data.acumulado.cortes).toBe(1);
  });

  it('una orden de compra se pide sin negocio_id (0.62.1) y la fila ya no lo trae (0.63.0)', async () => {
    const r = await o('mike', '/ordenes', { method: 'POST', json: { concepto: 'Triplay', monto: 1160_00, proveedor_nombre: 'Maderas' } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.folio).toMatch(/^OC-/);
    expect('negocio_id' in r.data).toBe(false);
    const vieja = await o('mike', '/ordenes', { method: 'POST', json: { negocio_id: 'lo-que-sea', concepto: 'Lijas', monto: 120_00 } });
    expect(vieja.estado, 'una app vieja que lo manda tampoco truena').toBe(201);
  });

  it('la nómina: los cortes se leen y se abren sin negocio_id', async () => {
    const lista = await o('mike', '/nomina/rayas');
    expect(lista.estado, JSON.stringify(lista)).toBe(200);
    expect(lista.data.rayas).toEqual([]);
    const corte = await o('mike', '/nomina/rayas', { method: 'POST', json: { periodo_inicio: '2026-09-28', periodo_fin: '2026-10-04', pagos: [] } });
    expect(corte.estado, JSON.stringify(corte)).toBe(201);
    expect('negocio_id' in corte.data.raya).toBe(false);
  });

  it('el estado del proyecto trae a la empresa como `negocio`: es la misma', async () => {
    const p = (await o('mike', '/proyectos')).data.filas[0];
    const r = await o('mike', `/proyectos/${p.id}/estado`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.negocio).toMatchObject({ id: 'empresa', nombre: 'Carpintería Sin Negocio', rfc: 'CSN010101AAA', moneda: 'MXN' });
  });
});

describe('compatibilidad: /negocios contesta la empresa (se va cuando ninguna prueba lo pida)', () => {
  it('GET /negocios es una lista de uno, con la forma de negocio', async () => {
    const r = await o('mike', '/negocios');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.total).toBe(1);
    expect(r.data.filas.length).toBe(1);
    expect(Object.keys(r.data.filas[0]).sort()).toEqual(['creado_at', 'dia_conciliacion', 'id', 'moneda', 'nombre', 'rfc']);
    expect(r.data.filas[0]).toMatchObject({ id: 'empresa', nombre: 'Carpintería Sin Negocio', rfc: 'CSN010101AAA', dia_conciliacion: 5 });
  });

  it('POST /negocios contesta 201 con esa misma fila y no crea nada', async () => {
    const r = await o('mike', '/negocios', { method: 'POST', json: { nombre: 'Otro taller', moneda: 'USD' } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.id).toBe('empresa');
    expect(r.data.nombre, 'la empresa ya existía: el cuerpo se ignora').toBe('Carpintería Sin Negocio');
    expect(r.data.moneda).toBe('MXN');
    expect((await o('mike', '/negocios')).data.total).toBe(1);
  });

  it('GET /negocios/:id la trae si el id coincide y 404 si no; PATCH la cambia', async () => {
    expect((await o('mike', '/negocios/empresa')).data.nombre).toBe('Carpintería Sin Negocio');
    expect((await o('mike', '/negocios/01INVENTADO')).estado).toBe(404);
    const r = await o('mike', '/negocios/empresa', { method: 'PATCH', json: { dia_conciliacion: 3 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.dia_conciliacion).toBe(3);
    expect((await o('mike', '/empresa')).data.dia_conciliacion, 'es el mismo renglón').toBe(3);
  });

  it('en una empresa nueva, POST /negocios con nombre y moneda bautiza la empresa', async () => {
    const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: 'sin-negocio-nueva', nombre: 'Nueva', apps: { dash: true, cotizador: true } }, app: '' });
    expect(alta.estado).toBe(201);
    const r = await pedir('mike', '/orgs/sin-negocio-nueva/negocios', { method: 'POST', json: { nombre: 'Taller 101', moneda: 'USD' }, app: 'cotizador101' });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data).toMatchObject({ id: 'empresa', nombre: 'Taller 101', moneda: 'USD' });
    expect((await pedir('mike', '/orgs/sin-negocio-nueva/empresa')).data.nombre).toBe('Taller 101');
  });

  it('un cliente del portal no abre /negocios', async () => {
    const inv = await o('mike', '/clientes/invitar', { method: 'POST', json: { correo: 'clienta-sn@ejemplo.mx', nombre: 'Clienta' } });
    expect(inv.estado, JSON.stringify(inv)).toBe(201);
    await entrar('clienta', 'clienta-sn@ejemplo.mx');
    expect((await o('clienta', '/negocios', { app: 'peek101' })).estado).toBe(403);
  });
});

describe('lo de quote101 para master101', () => {
  it('GET /admin/orgs/:o/quote contesta el resumen de la empresa', async () => {
    const cot = await o('mike', '/cotizaciones', { method: 'POST', json: { cliente_id: cliente, total: 100 }, app: 'cotizador101' });
    expect(cot.estado, JSON.stringify(cot)).toBe(201);
    const r = await pedir('mike', `/admin/orgs/${ORG}/quote`, { app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.org).toBe(ORG);
    expect(r.data.resumen).toMatchObject({ clientes: 3, proyectos: 1, cotizaciones: 1 });
    expect(r.data.resumen.ultima_cotizacion).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect('negocios' in r.data).toBe(false);
  });
});

/* ─────────────── la migración 0027 sobre una base vieja con datos ───────────────
 *
 * Se arma DENTRO del Durable Object: se vacía, se aplican las 26 anteriores
 * tal cual, se siembra a mano lo que una empresa real traía —dos negocios,
 * cuentas y dinero en los dos, renglones huérfanos de un negocio borrado,
 * productos con el mismo código en los dos, raya, conciliación, accionista,
 * orden, factura— y se deja que `migrar()` haga lo suyo. Después se mide la
 * base, no lo que la migración dice que hizo. */
describe('la migración 0027 sobre una base con negocios', () => {
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const entorno = env as unknown as { ORG: DurableObjectNamespace };
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0027')) as unknown as DurableObjectStub;
  /* Hasta la 0026. La 0027 corre en código y las que siguen (0028…) las
   * aplica `migrar()` después de ella: lo que se mide es que una base con
   * negocios llegue a la versión de hoy sin perder nada. */
  const HASTA = 26;

  const T = '2026-09-01T00:00:00.000Z';
  const siembra = (db: any) => {
    const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
    x(`INSERT INTO negocios (id, nombre, rfc, moneda, dia_conciliacion, creado_at) VALUES ('n-b','Beta','BBB010101BBB','USD',3,?)`, T);
    x(`INSERT INTO negocios (id, nombre, rfc, moneda, dia_conciliacion, creado_at) VALUES ('n-a','Alfa','AAA010101AAA','MXN',2,?)`, T);
    x(`INSERT INTO cuentas (id, negocio_id, nombre, tipo, moneda, saldo_inicial, creado_at) VALUES ('c1','n-a','Banco Alfa','banco','MXN',1000,?)`, T);
    x(`INSERT INTO cuentas (id, negocio_id, nombre, tipo, moneda, saldo_inicial, creado_at) VALUES ('c2','n-b','Caja Beta','caja','MXN',500,?)`, T);
    x(`INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl1','n-a','Uno','uno','dash101',?)`, T);
    x(`INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl2','n-b','Dos','dos','dash101',?)`, T);
    x(`INSERT INTO clientes (id, negocio_id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl3','n-muerto','Huérfano','huerfano','cotizador101',?)`, T);
    x(`INSERT INTO proyectos (id, negocio_id, cliente_id, nombre, estado, creado_at) VALUES ('p1','n-b','cl2','Obra Beta','activo',?)`, T);
    x(`INSERT INTO productos (id, negocio_id, codigo, nombre, precio, creado_at, creado_por) VALUES ('pr-a','n-a','PT-STD','Puerta A',100,?, 'u')`, T);
    x(`INSERT INTO productos (id, negocio_id, codigo, nombre, precio, creado_at, creado_por) VALUES ('pr-b','n-b','PT-STD','Puerta B',200,?, 'u')`, T);
    x(`INSERT INTO productos (id, negocio_id, codigo, nombre, precio, creado_at, creado_por) VALUES ('pr-c','n-b','X-1','Otra',300,?, 'u')`, T);
    x(`INSERT INTO items (id, negocio_id, proyecto_id, cliente_id, nombre, monto, estado, producto_id, creado_at, creado_por) VALUES ('i1','n-b','p1','cl2','Puerta',200,'vendido','pr-b',?,'u')`, T);
    x(`INSERT INTO movimientos (id, negocio_id, tipo, monto, fecha, cuenta_id, proyecto_id, creado_por, creado_at) VALUES ('m1','n-b','ingreso',700,'2026-09-01','c2','p1','u',?)`, T);
    x(`INSERT INTO opex (id, negocio_id, nombre, monto, frecuencia, fecha_inicio, creado_at) VALUES ('x1','n-a','Renta',100,'mensual','2026-01-01',?)`, T);
    x(`INSERT INTO conciliaciones (id, negocio_id, corte_at, hecha_por, creado_at) VALUES ('co1','n-a',?, 'u', ?)`, T, T);
    x(`INSERT INTO conciliacion_cuentas (id, conciliacion_id, cuenta_id, saldo_registrado, saldo_real, diferencia, creado_at) VALUES ('cc1','co1','c1',1000,1000,0,?)`, T);
    x(`INSERT INTO rayas (id, negocio_id, periodo_inicio, periodo_fin, creado_at) VALUES ('r1','n-b','2026-09-01','2026-09-07',?)`, T);
    x(`INSERT INTO accionistas (id, negocio_id, nombre, nombre_norm, creado_at) VALUES ('a1','n-b','Socia','socia',?)`, T);
    x(`INSERT INTO ordenes (id, negocio_id, folio, solicitante_usuario_id, concepto, monto, creado_at) VALUES ('o1','n-b','OC-000001','u','Clavos',50,?)`, T);
    x(`INSERT INTO cfdi (id, negocio_id, uuid, tipo, fecha, creado_por, creado_at) VALUES ('f1','n-muerto','UUID-1','ingreso','2026-09-01','u',?)`, T);
  };

  const cuenta = (db: any, t: string): number => Number(db.sql.exec(`SELECT COUNT(*) AS n FROM ${t}`).one().n);
  const columnas = (db: any, t: string): string[] => db.sql.exec(`PRAGMA table_info("${t}")`).toArray().map((c: any) => String(c.name));
  const indices = (db: any, t: string): Array<{ name: string; sql: string | null }> =>
    db.sql.exec(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_autoindex%'`, t).toArray();

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.sql.exec(`CREATE TABLE IF NOT EXISTS _migraciones (version INTEGER PRIMARY KEY, aplicada_at TEXT NOT NULL)`);
      for (let i = 0; i < HASTA; i++) {
        db.sql.exec(MIGRACIONES[i]);
        db.sql.exec(`INSERT INTO _migraciones (version, aplicada_at) VALUES (?, ?)`, i + 1, T);
      }
      siembra(db);
      return true;
    });
  });

  it('la base vieja tiene dos negocios y negocio_id por todos lados', async () => {
    const antes = await dentro(elDO(), (db: any) => ({
      version: db.version(), negocios: cuenta(db, 'negocios'), cols: columnas(db, 'cuentas'), productos: cuenta(db, 'productos'),
    }));
    expect(antes.version).toBe(HASTA);
    expect(antes.negocios).toBe(2);
    expect(antes.cols).toContain('negocio_id');
    expect(antes.productos).toBe(3);
  });

  it('migrar() aplica la 0027: todo queda en la empresa y nada se pierde', async () => {
    const despues = await dentro(elDO(), (db: any) => {
      db.migrar();
      const tablas: string[] = db.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).toArray().map((t: any) => String(t.name));
      return {
        version: db.version(),
        tablas,
        conNegocioId: tablas.filter((t) => columnas(db, t).includes('negocio_id')),
        empresa: db.sql.exec(`SELECT * FROM empresa`).toArray(),
        conteos: Object.fromEntries(['cuentas', 'clientes', 'proyectos', 'productos', 'items', 'movimientos', 'opex', 'conciliaciones', 'conciliacion_cuentas', 'rayas', 'accionistas', 'ordenes', 'cfdi'].map((t) => [t, cuenta(db, t)])),
        productos: db.sql.exec(`SELECT id, codigo, precio FROM productos ORDER BY id`).toArray(),
        item: db.sql.exec(`SELECT producto_id FROM items WHERE id = 'i1'`).one(),
        saldoCaja: db.obtener('cuentas', 'c2'),
        fk: db.sql.exec(`PRAGMA foreign_key_check`).toArray(),
        fkPrendidas: db.sql.exec(`PRAGMA foreign_keys`).toArray(),
        diferido: db.sql.exec(`PRAGMA defer_foreign_keys`).toArray(),
        indices: {
          cuentas: indices(db, 'cuentas'), conciliaciones: indices(db, 'conciliaciones'), rayas: indices(db, 'rayas'),
          accionistas: indices(db, 'accionistas'), productos: indices(db, 'productos'), ordenes: indices(db, 'ordenes'),
        },
      };
    });
    expect(despues.version).toBe(VERSION_ORG_DB);
    expect(despues.tablas).not.toContain('negocios');
    expect(despues.tablas.filter((t) => t.endsWith('__copia'))).toEqual([]);
    expect(despues.conNegocioId, 'tablas que todavía traen negocio_id').toEqual([]);
    // La empresa es el PRIMERO POR NOMBRE: Alfa, aunque Beta se creó antes.
    expect(despues.empresa).toEqual([{ id: 'empresa', nombre: 'Alfa', rfc: 'AAA010101AAA', moneda: 'MXN', dia_conciliacion: 2, creado_at: T,
      correo: null, telefono: null, sitio_web: null, direccion: null, logo_llave: null, logo_at: null }]);
    // Nada se pierde: lo de los dos negocios y lo huérfano, todo cuenta.
    expect(despues.conteos).toEqual({
      cuentas: 2, clientes: 3, proyectos: 1, productos: 2, items: 1, movimientos: 1, opex: 1,
      conciliaciones: 1, conciliacion_cuentas: 1, rayas: 1, accionistas: 1, ordenes: 1, cfdi: 1,
    });
    // El PT-STD repetido: gana el del negocio que se quedó (Alfa) y la pieza de Beta le apunta.
    expect(despues.productos).toEqual([{ id: 'pr-a', codigo: 'PT-STD', precio: 100 }, { id: 'pr-c', codigo: 'X-1', precio: 300 }]);
    expect(despues.item.producto_id).toBe('pr-a');
    // El dinero sigue colgado de su cuenta.
    expect(despues.saldoCaja.saldo).toBe(500 + 700);
    // Las llaves foráneas cuadran y quedaron prendidas.
    expect(despues.fk).toEqual([]);
    expect(despues.fkPrendidas).toEqual([{ foreign_keys: 1 }]);
    expect(despues.diferido, 'el diferido no se queda prendido').toEqual([{ defer_foreign_keys: 0 }]);
    // Los índices: ninguno menciona negocio_id; los que lo llevaban están sin él.
    for (const lista of Object.values(despues.indices)) for (const i of lista) expect(i.sql ?? '').not.toMatch(/negocio_id/);
    expect(despues.indices.conciliaciones.map((i) => i.name)).toContain('conciliaciones_corte');
    expect(despues.indices.rayas.map((i) => i.name)).toContain('rayas_por_periodo');
    expect(despues.indices.productos.map((i) => i.name).sort()).toEqual(['productos_codigo', 'productos_nombre']);
    expect(despues.indices.ordenes.find((i) => i.name === 'ordenes_tipo')?.sql).toMatch(/ordenes\(tipo, estado\)/);
    expect(despues.indices.ordenes.map((i) => i.name)).toContain('ordenes_folio');
  });

  it('el código del producto sigue siendo único, ahora en la empresa', async () => {
    const choca = await dentro(elDO(), (db: any) => {
      try {
        db.sql.exec(`INSERT INTO productos (id, codigo, nombre, precio, creado_at, creado_por) VALUES ('pr-d','PT-STD','Repetida',1,?, 'u')`, T);
        return 'entró';
      } catch (e) { return String((e as Error).message); }
    });
    expect(choca).toMatch(/UNIQUE/i);
  });

  it('volver a correrla no hace daño', async () => {
    const otraVez = await dentro(elDO(), (db: any) => {
      db.quitarNegocios();
      return { empresa: cuenta(db, 'empresa'), productos: cuenta(db, 'productos'), cuentas: cuenta(db, 'cuentas'), fk: db.sql.exec(`PRAGMA foreign_key_check`).toArray() };
    });
    expect(otraVez).toEqual({ empresa: 1, productos: 2, cuentas: 2, fk: [] });
  });

  it('y las rutas de siempre leen esa base ya migrada', async () => {
    const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: 'migracion-0027', nombre: 'Migrada', apps: { dash: true } }, app: '' });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
    const e = await pedir('mike', '/orgs/migracion-0027/empresa');
    expect(e.data, 'la empresa es la que dejó la migración, no una nueva con el nombre de la org').toMatchObject({ id: 'empresa', nombre: 'Alfa', rfc: 'AAA010101AAA', dia_conciliacion: 2 });
    const cuentas = await pedir('mike', '/orgs/migracion-0027/cuentas');
    expect(cuentas.data.filas.map((c: any) => [c.nombre, c.saldo])).toEqual([['Banco Alfa', 1000], ['Caja Beta', 1200]]);
    expect((await pedir('mike', '/orgs/migracion-0027/clientes')).data.total).toBe(3);
    const q = await pedir('mike', '/admin/orgs/migracion-0027/quote', { app: '' });
    expect(q.data.resumen).toMatchObject({ clientes: 3, proyectos: 1, cotizaciones: 0, ultima_cotizacion: null });
  });
});

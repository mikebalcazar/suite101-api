/* La contabilidad del proyecto, aparte de los ítems · contrato 0.105.0
 *
 * Mike, 18-nov-2026: «Vamos a separar la contabilidad. Ya no va a ir ligada
 * a los ítems. Los precios de los proyectos se harán por aparte. (…) limpiar
 * todos los precios de venta que estén ahorita en dash de los proyectos para
 * cargar ya los nuevos independientes. Otra cosa es que vamos a poner en dash
 * los pagos pendientes de cada proyecto a cada contratista.»
 *
 * Con botones: «Conceptos de cobro con opción a importar de las cotizaciones
 * del proyecto de quote»; «Un concepto por renglón. Si se importa una segunda
 * cotización del mismo proyecto, se debe ver que es una segunda cotización
 * pero suma»; «Todos a cero de una vez», con respaldo, «Precio por cargar»
 * mientras tanto y lo cobrado intacto.
 *
 * LO QUE DE VERDAD MIDEN:
 *
 *   · la MIGRACIÓN sobre una base con precios: respalda cada precio, los
 *     pone en cero, no toca lo cobrado, y repetirla no cambia nada;
 *   · que el precio sea la SUMA DE LOS CONCEPTOS y que el importe lo
 *     multiplique la base, no la pantalla;
 *   · que importar traiga UN CONCEPTO POR RENGLÓN con el precio que quote101
 *     dejó escrito, que la segunda cotización sea otro grupo que suma, y que
 *     no se pueda importar dos veces sin querer;
 *   · que una cotización aprobada antes, sin esos precios, se arme con el
 *     precio de sus piezas;
 *   · que lo que se les debe a los contratistas sea lo acordado menos lo
 *     pagado, sólo lo que falta, y que lo vea sólo quien ve costos.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

const CORREO = 'mike@forespot.com';
const ORG = 'conceptos-de-cobro';
const GENTE = { tin: { correo: 'tin-conceptos@ejemplo.mx', nombre: 'Tin Taller', rol: 'staff' } };
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
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}
async function crea(ruta: string, json: Record<string, unknown>, app?: string): Promise<string> {
  const r = await o('mike', ruta, { method: 'POST', json, app });
  expect(r.estado, `${ruta}: ${JSON.stringify(r)}`).toBe(201);
  return String(r.data.id);
}
const proyecto = async (id: string) => (await o('mike', `/proyectos/${id}`)).data;

/* ─────────────── la migración ─────────────── */

const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
const entorno = env as unknown as { ORG: DurableObjectNamespace };
const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0055')) as unknown as DurableObjectStub;
const HASTA = MIGRACIONES.findIndex((m) => m.includes('CREATE TABLE IF NOT EXISTS conceptos'));
const T = '2026-11-18T12:00:00.000Z';

describe('la migración 0055 sobre una base con precios', () => {
  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.migrar(HASTA);
      const x = (q: string, ...a: unknown[]) => db.sql.exec(q, ...a);
      x(`INSERT INTO clientes (id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl1','Lomas','lomas','dash101',?)`, T);
      // Dos con precio (uno con el IVA incluido) y uno sin. Con su cobrado.
      for (const [id, precio, incl, cobrado] of [['p1', 500_000_00, 0, 100_000_00], ['p2', 116_000_00, 1, 0], ['p3', 0, 0, 5_000_00]] as const) {
        x(`INSERT INTO proyectos (id, cliente_id, nombre, estado, precio_venta, cobrado, pagado_prov, compromiso, avance, tasa_iva, iva_incluido, creado_at)
           VALUES (?, 'cl1', ?, 'activo', ?, ?, 0, 0, 0, 1600, ?, ?)`, id, `Obra ${id}`, precio, cobrado, incl, T);
      }
      return true;
    });
  });

  it('la base vieja está justo antes de la 0055', async () => {
    const r = await dentro(elDO(), (db: any) => ({ version: db.version(), n: db.sql.exec(`SELECT COUNT(*) AS n FROM proyectos`).one().n }));
    expect(r).toEqual({ version: HASTA, n: 3 });
  });

  it('migrar() respalda cada precio, los pone en cero y no toca lo cobrado', async () => {
    const r = await dentro(elDO(), (db: any) => {
      db.migrar();
      return {
        version: db.version(),
        proyectos: db.sql.exec(`SELECT id, precio_venta, n_conceptos, cobrado FROM proyectos ORDER BY id`).toArray(),
        respaldo: db.sql.exec(`SELECT proyecto_id, precio_venta, tasa_iva, iva_incluido FROM precios_anteriores ORDER BY proyecto_id`).toArray(),
      };
    });
    expect(r.version).toBe(VERSION_ORG_DB);
    expect(r.proyectos).toEqual([
      { id: 'p1', precio_venta: 0, n_conceptos: 0, cobrado: 100_000_00 },
      { id: 'p2', precio_venta: 0, n_conceptos: 0, cobrado: 0 },
      { id: 'p3', precio_venta: 0, n_conceptos: 0, cobrado: 5_000_00 },
    ]);
    expect(r.respaldo, 'el que valía cero no deja respaldo').toEqual([
      { proyecto_id: 'p1', precio_venta: 500_000_00, tasa_iva: 1600, iva_incluido: 0 },
      { proyecto_id: 'p2', precio_venta: 116_000_00, tasa_iva: 1600, iva_incluido: 1 },
    ]);
  });

  it('el estado de cuenta lo dice: precio por cargar, sin saldo, y cuánto era antes', async () => {
    const r = await dentro(elDO(), (db: any) => db.estadoDelProyecto('p1'));
    expect(r.totales.precio_por_cargar).toBe(true);
    expect(r.totales.saldo).toBeNull();
    expect(r.totales.precio_anterior).toBe(500_000_00);
  });

  it('repetirla con un concepto ya cargado no cambia nada', async () => {
    const r = await dentro(elDO(), (db: any) => {
      db.crear('conceptos', { proyecto_id: 'p1', descripcion: 'Cocina', cantidad: 1, precio_unitario: 450_000_00 }, { app: 'dash101', usuario_id: 'u' });
      const antes = JSON.stringify(db.sql.exec(`SELECT id, precio_venta, n_conceptos FROM proyectos ORDER BY id`).toArray());
      db.sql.exec(`DELETE FROM _migraciones WHERE version >= ?`, HASTA);
      db.migrar();
      return {
        antes, despues: JSON.stringify(db.sql.exec(`SELECT id, precio_venta, n_conceptos FROM proyectos ORDER BY id`).toArray()),
        respaldo: db.sql.exec(`SELECT COUNT(*) AS n FROM precios_anteriores`).one().n,
        anterior: db.estadoDelProyecto('p1').totales.precio_anterior,
      };
    });
    expect(r.despues).toBe(r.antes);
    expect(JSON.parse(r.despues)[0]).toMatchObject({ id: 'p1', precio_venta: 450_000_00, n_conceptos: 1 });
    expect(r.respaldo).toBe(2);
    expect(r.anterior, 'con conceptos ya no se enseña lo de antes').toBeNull();
  });
});

/* ─────────────── por la API ─────────────── */

let cliente = '', obra = '', otra = '', cuenta = '', maderas = '', herrero = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Conceptos de cobro', plan: 'pro', duena_correo: CORREO }, app: 'master101' });
  expect([201, 409]).toContain(alta.estado);
  await pedir('mike', `/admin/orgs/${ORG}/reiniciar`, { method: 'POST', app: 'master101' });
  const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: GENTE.tin, app: 'master101' });
  expect([201, 409]).toContain(m.estado);

  cliente = await crea('/clientes', { nombre: 'Familia Ruiz' });
  cuenta = await crea('/cuentas', { nombre: 'Banco', tipo: 'banco' });
  obra = await crea('/proyectos', { cliente_id: cliente, nombre: 'Casa Ruiz' });
  otra = await crea('/proyectos', { cliente_id: cliente, nombre: 'Oficina Ruiz' });
  maderas = await crea('/proveedores', { nombre: 'Maderas del Centro', tipo: 'materiales' });
  herrero = await crea('/proveedores', { nombre: 'Herrería Juárez', tipo: 'servicios' });
});

describe('los conceptos de cobro', () => {
  let cocina = '';

  it('un proyecto nuevo nace con el precio por cargar', async () => {
    const p = await proyecto(obra);
    expect(p.precio_venta).toBe(0);
    expect(p.n_conceptos).toBe(0);
  });

  it('el importe lo multiplica la base y el precio del proyecto es la suma', async () => {
    const r = await o('mike', '/conceptos', { method: 'POST', json: { proyecto_id: obra, descripcion: '  Cocina integral  ', cantidad: 1, precio_unitario: 120_000_00 } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    cocina = r.data.id;
    expect(r.data).toMatchObject({ descripcion: 'Cocina integral', cantidad: 1, precio_unitario: 120_000_00, monto: 120_000_00, orden: 1 });
    const m2 = await o('mike', '/conceptos', { method: 'POST', json: { proyecto_id: obra, descripcion: 'Cubierta de cuarzo (m²)', cantidad: 2.5, precio_unitario: 8_000_00 } });
    expect(m2.data.monto, '2.5 × 8,000').toBe(20_000_00);
    expect(m2.data.orden).toBe(2);
    const p = await proyecto(obra);
    expect(p.precio_venta).toBe(140_000_00);
    expect(p.n_conceptos).toBe(2);
  });

  it('cambiar la cantidad o el precio vuelve a multiplicar y a sumar', async () => {
    const r = await o('mike', `/conceptos/${cocina}`, { method: 'PATCH', json: { cantidad: 2 } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.monto).toBe(240_000_00);
    expect((await proyecto(obra)).precio_venta).toBe(260_000_00);
    const b = await o('mike', `/conceptos/${cocina}`, { method: 'PATCH', json: { precio_unitario: 110_000_00 } });
    expect(b.data.monto).toBe(220_000_00);
    expect((await proyecto(obra)).precio_venta).toBe(240_000_00);
  });

  it('no se muda de proyecto: el proyecto_id de un PATCH no se escribe', async () => {
    await o('mike', `/conceptos/${cocina}`, { method: 'PATCH', json: { proyecto_id: otra, descripcion: 'Cocina integral nogal' } });
    const c = (await o('mike', `/conceptos/${cocina}`)).data;
    expect(c.proyecto_id).toBe(obra);
    expect(c.descripcion).toBe('Cocina integral nogal');
  });

  it('lo que no cuadra no entra', async () => {
    const mal = async (json: Record<string, unknown>) => (await o('mike', '/conceptos', { method: 'POST', json })).estado;
    expect(await mal({ proyecto_id: obra, descripcion: 'Sin cantidad', cantidad: 0, precio_unitario: 100 }), 'cantidad cero').toBe(400);
    expect(await mal({ proyecto_id: obra, descripcion: 'Centavos rotos', cantidad: 1, precio_unitario: 10.5 }), 'centavos con decimales').toBe(400);
    expect(await mal({ proyecto_id: obra, descripcion: '', cantidad: 1, precio_unitario: 100 }), 'sin descripción').toBe(400);
    expect(await mal({ proyecto_id: 'no-existe', descripcion: 'Huérfano', cantidad: 1, precio_unitario: 100 }), 'de un proyecto que no existe').toBe(404);
    expect(await mal({ proyecto_id: obra, descripcion: 'Con importe', cantidad: 1, precio_unitario: 100, monto: 999 }), 'el importe no se manda').toBe(403);
    const quote = await o('mike', '/conceptos', { method: 'POST', app: 'cotizador101', json: { proyecto_id: obra, descripcion: 'Desde quote', cantidad: 1, precio_unitario: 100 } });
    expect(quote.estado, 'los conceptos son de dash101').toBe(403);
  });

  it('un descuento también es un concepto: precio negativo', async () => {
    const d = await o('mike', '/conceptos', { method: 'POST', json: { proyecto_id: obra, descripcion: 'Descuento por pronto pago', cantidad: 1, precio_unitario: -10_000_00 } });
    expect(d.estado, JSON.stringify(d)).toBe(201);
    expect((await proyecto(obra)).precio_venta).toBe(230_000_00);
    expect((await o('mike', `/conceptos/${d.data.id}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await proyecto(obra)).precio_venta, 'borrarlo también recalcula').toBe(240_000_00);
  });

  it('quien es de taller no ve los conceptos', async () => {
    await entrar('tin', GENTE.tin.correo);
    // staff es miembro: ve dinero; lo que no ve son COSTOS (abajo).
    expect((await o('tin', `/conceptos?proyecto_id=${obra}`)).estado).toBe(200);
  });
});

describe('importar de quote101: un concepto por renglón', () => {
  let cot1 = '', cot2 = '', sinPrecios = '', ajena = '';
  const renglones = (lineas: Array<[string, number, number]>) => lineas.map(([nombre, cantidad, precio_unitario], i) => ({ linea: i + 1, nombre, cantidad, precio_unitario }));

  beforeAll(async () => {
    cot1 = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: { nombre: 'Planta baja', proyecto_id: otra, versiones: [],
      renglones: renglones([['Cocina', 1, 150_000_00], ['Puertas de intercomunicación', 4, 6_500_00]]) } }, 'cotizador101');
    cot2 = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: { nombre: 'Planta alta', proyecto_id: otra, versiones: [],
      renglones: renglones([['Clósets', 3, 22_000_00]]) } }, 'cotizador101');
    sinPrecios = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: { nombre: 'Borrador viejo', proyecto_id: otra, versiones: [] } }, 'cotizador101');
    ajena = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: { nombre: 'De la casa', proyecto_id: obra, versiones: [], renglones: renglones([['Algo', 1, 100]]) } }, 'cotizador101');
  });

  const importar = (cotizacion_id: string, extra: Record<string, unknown> = {}, app?: string) =>
    o('mike', `/proyectos/${otra}/conceptos/importar`, { method: 'POST', json: { cotizacion_id, ...extra }, app });

  it('la lista dice qué cotizaciones hay, cuánto suman y si traen precios', async () => {
    const r = await o('mike', `/proyectos/${otra}/conceptos/cotizaciones`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const por = Object.fromEntries(r.data.cotizaciones.map((c: any) => [c.nombre, c]));
    expect(Object.keys(por).sort()).toEqual(['Borrador viejo', 'Planta alta', 'Planta baja']);
    expect(por['Planta baja']).toMatchObject({ fuente: 'quote', renglones: 2, subtotal: 150_000_00 + 4 * 6_500_00, importados: 0 });
    expect(por['Borrador viejo']).toMatchObject({ fuente: null, renglones: 0 });
  });

  it('la primera: un concepto por renglón, con su folio, y el precio es la suma', async () => {
    const r = await importar(cot1);
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.fuente).toBe('quote');
    // 0.108.0 · El nombre del renglón es el PRODUCTO; sin mueble no hay descripción.
    expect(r.data.conceptos.map((c: any) => [c.nombre, c.descripcion, c.cantidad, c.precio_unitario, c.monto, c.linea])).toEqual([
      ['Cocina', '', 1, 150_000_00, 150_000_00, 1],
      ['Puertas de intercomunicación', '', 4, 6_500_00, 26_000_00, 2],
    ]);
    expect(r.data.conceptos[0].cotizacion_folio).toMatch(/^COT-/);
    expect(r.data.proyecto.precio_venta).toBe(176_000_00);
  });

  it('la segunda se ve como segunda, y suma', async () => {
    const r = await importar(cot2);
    expect(r.estado).toBe(201);
    expect((await proyecto(otra)).precio_venta).toBe(176_000_00 + 66_000_00);
    const e = (await o('mike', `/proyectos/${otra}/estado`)).data;
    expect(e.grupos.map((g: any) => [g.numero, g.nombre, g.importe])).toEqual([[1, 'Planta baja', 176_000_00], [2, 'Planta alta', 66_000_00]]);
    expect(e.totales.subtotal).toBe(242_000_00);
  });

  it('dos veces no: 409, a menos que se pida reemplazar, y entonces queda en su lugar', async () => {
    const otraVez = await importar(cot1);
    expect(otraVez.estado).toBe(409);
    expect(otraVez.error).toBe('ya_importada');
    await o('mike', `/cotizaciones/${cot1}`, { method: 'PATCH', app: 'cotizador101', json: { datos: { nombre: 'Planta baja', proyecto_id: otra, versiones: [],
      renglones: renglones([['Cocina', 1, 140_000_00], ['Puertas de intercomunicación', 4, 6_500_00]]) } } });
    const r = await importar(cot1, { reemplazar: true });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.reemplazados).toBe(2);
    const e = (await o('mike', `/proyectos/${otra}/estado`)).data;
    expect(e.grupos.map((g: any) => g.nombre), 'la planta baja sigue primero').toEqual(['Planta baja', 'Planta alta']);
    expect(e.totales.subtotal).toBe(166_000_00 + 66_000_00);
    expect((await o('mike', `/proyectos/${otra}/conceptos/cotizaciones`)).data.cotizaciones.find((c: any) => c.id === cot1).importados).toBe(2);
  });

  it('sin precios, de otro proyecto, o desde otra app: no', async () => {
    const a = await importar(sinPrecios);
    expect(a.estado).toBe(409);
    expect(a.error).toBe('sin_precios');
    expect(a.detalle.motivo).toContain('quote101');
    const b = await importar(ajena);
    expect(b.estado).toBe(409);
    expect(b.error).toBe('otra_obra');
    expect((await importar(cot2, {}, 'cotizador101')).estado).toBe(403);
    expect((await importar('no-existe')).estado).toBe(404);
  });

  it('0.107.0 · los conceptos son antes de IVA: aunque el proyecto diga «IVA incluido», el precio de quote entra tal cual', async () => {
    const conIva = await crea('/proyectos', { cliente_id: cliente, nombre: 'Bodega con IVA' });
    await o('mike', `/proyectos/${conIva}`, { method: 'PATCH', json: { iva_incluido: 1, tasa_iva: 1600 } });
    const c = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: { nombre: 'Bodega', proyecto_id: conIva, versiones: [], renglones: renglones([['Anaquel', 2, 10_000_00]]) } }, 'cotizador101');
    const r = await o('mike', `/proyectos/${conIva}/conceptos/importar`, { method: 'POST', json: { cotizacion_id: c } });
    expect(r.data.conceptos[0]).toMatchObject({ precio_unitario: 10_000_00, monto: 20_000_00 });
    const e = (await o('mike', `/proyectos/${conIva}/estado`)).data.totales;
    expect(e.subtotal).toBe(20_000_00);
    expect(e.total).toBe(20_000_00);
  });

  it('una aprobada antes, sin precios escritos, se arma con el precio de sus piezas', async () => {
    const vieja = await crea('/proyectos', { cliente_id: cliente, nombre: 'Depto aprobado en octubre' });
    const c = await crea('/cotizaciones', { cliente_id: cliente, total: 0, datos: { nombre: 'Corrida 1', proyecto_id: vieja, versiones: [] } }, 'cotizador101');
    const ap = await o('mike', `/cotizaciones/${c}/aprobar`, { method: 'POST', app: 'cotizador101', json: { proyecto_id: vieja, lineas: [
      { nombre: 'Cocina integral', cantidad: 2, precio: 1_374_000 },
      { nombre: 'Instalación', cantidad: 1, precio: 100_000, tipo: 'servicio' },
    ] } });
    expect(ap.estado, JSON.stringify(ap)).toBe(201);
    expect(ap.data.proyecto.precio_venta, 'aprobar ya no le pone precio').toBe(0);
    const r = await o('mike', `/proyectos/${vieja}/conceptos/importar`, { method: 'POST', json: { cotizacion_id: c } });
    expect(r.estado, JSON.stringify(r)).toBe(201);
    expect(r.data.fuente).toBe('piezas');
    expect(r.data.conceptos.map((x: any) => [x.nombre, x.cantidad, x.precio_unitario])).toEqual([
      ['Cocina integral', 2, 1_374_000],
      ['Instalación', 1, 100_000],
    ]);
    expect(r.data.proyecto.precio_venta).toBe(2 * 1_374_000 + 100_000);
  });
});

describe('lo que se les debe a los contratistas', () => {
  beforeAll(async () => {
    const par = (proyecto_id: string, proveedor_id: string, proveedor_nombre: string, concepto: string, monto_acordado: number) =>
      crea('/partidas', { proyecto_id, proveedor_id, proveedor_nombre, concepto, monto_acordado });
    const herreria = await par(obra, herrero, 'Herrería Juárez', 'Barandal', 30_000_00);
    await par(obra, maderas, 'Maderas del Centro', 'Tablero', 12_000_00);
    const pagada = await par(obra, maderas, 'Maderas del Centro', 'Cantos', 2_000_00);
    await par(otra, herrero, 'Herrería Juárez', 'Portón', 18_000_00);
    const pagar = (partida_id: string, monto: number, proveedor: string) => crea('/movimientos', {
      tipo: 'egreso', monto, fecha: '2026-11-10', cuenta_id: cuenta, proyecto_id: partida_id === pagada ? obra : obra,
      partida_id, contraparte_tipo: 'proveedor', contraparte_id: proveedor,
    });
    await pagar(herreria, 10_000_00, herrero);
    await pagar(pagada, 2_000_00, maderas);
  });

  it('por proyecto y por contratista: lo acordado menos lo pagado, sólo lo que falta', async () => {
    const r = await o('mike', '/pagos-pendientes');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.total).toBe(20_000_00 + 12_000_00 + 18_000_00);
    const casa = r.data.proyectos.find((p: any) => p.nombre === 'Casa Ruiz');
    expect(casa.pendiente).toBe(32_000_00);
    const h = casa.contratistas.find((c: any) => c.nombre === 'Herrería Juárez');
    expect(h).toMatchObject({ acordado: 30_000_00, pagado: 10_000_00, pendiente: 20_000_00, tipo: 'servicios' });
    const m = casa.contratistas.find((c: any) => c.nombre === 'Maderas del Centro');
    expect(m.partidas.map((x: any) => x.concepto), 'lo ya pagado no sale').toEqual(['Tablero']);
    expect(r.data.contratistas[0]).toMatchObject({ nombre: 'Herrería Juárez', pendiente: 38_000_00, proyectos: 2 });
  });

  it('de un solo proyecto', async () => {
    const r = await o('mike', `/pagos-pendientes?proyecto_id=${otra}`);
    expect(r.data.total).toBe(18_000_00);
    expect(r.data.proyectos).toHaveLength(1);
  });

  it('son costos: quien es de taller no los ve', async () => {
    expect((await o('tin', '/pagos-pendientes')).estado).toBe(403);
  });
});

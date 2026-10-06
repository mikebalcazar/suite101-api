/* La obra de quell101 nace con cliente y proyecto en la suite · 0.77.0
 *
 * Mike, 6-oct-2026: «Cree un nuevo proyecto en Quell, con un cliente nuevo.
 * Pero no me aparece ni el cliente ni el proyecto ni en quote ni en dash.»
 *
 * Y el mismo día: «Cuando se crea un requerimiento nuevo, agregar un campo de
 * descripción en la ventana de Nuevo requerimiento, donde se escribe lo que
 * aparecerá como descripción en quote. (…) En caso de que no se llene en
 * quell, se puede llenar en quote.»
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que «+ Proyecto» en quell deje el cliente y el proyecto donde dash101 y
 *     quote101 los leen (`/clientes`, `/proyectos`), ligados a la obra;
 *   · que el mismo nombre de cliente, escrito con otras mayúsculas o
 *     acentos, sea el MISMO cliente y no un duplicado: uno solo en las tres
 *     apps es una regla que Mike puso el 21-sep;
 *   · que sin `suite: true` la obra nazca suelta como antes (dash101 la liga
 *     a un proyecto que ya existe);
 *   · que la descripción del requerimiento llegue al ítem y al renglón del
 *     borrador de quote101, y que vacía no estorbe;
 *   · que la 0039 dé de alta las obras sueltas que ya existían (decisión de
 *     Mike: «darlos de alta todos»), sin duplicar clientes y sin tocar las
 *     que no traen cliente escrito.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MIGRACIONES, VERSION_ORG_DB } from '../src/org-db';

const CORREO = 'mike@forespot.com';
const ORG = 'obra-suite';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
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
const q = (quien: string, ruta: string, op: Parameters<typeof pedir>[2] = {}) =>
  pedir(quien, `/orgs/${ORG}/quell${ruta}`, { app: 'quell101', ...op });

const filas = (r: any) => (Array.isArray(r.data) ? r.data : r.data?.filas ?? []) as any[];

beforeAll(async () => {
  const c = await pedir('mike', '/auth/codigo', { method: 'POST', json: { correo: CORREO }, app: '' });
  await pedir('mike', '/auth/entrar', { method: 'POST', json: { correo: CORREO, codigo: c.data.codigo_prueba }, app: '' });
  await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Obra en la suite', apps: { dash: true, quell: true, cotizador: true } }, app: '' });
  await q('mike', '/me');
}, 60000);

describe('«+ Proyecto» en quell101 da de alta cliente y proyecto (0.77.0)', () => {
  let clienteOrtega = '';

  it('con un cliente nuevo: nacen el cliente y el proyecto, ligados a la obra, y dash101 los ve', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Casa Lomas 214', client: 'Fam. Ortega', suite: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.proyecto_id, 'contesta el proyecto que nació').toBeTruthy();
    expect(r.cliente_nuevo).toBe(true);
    clienteOrtega = r.cliente_id;

    const proyecto = await o('mike', `/proyectos/${r.proyecto_id}`);
    expect(proyecto.data).toMatchObject({ nombre: 'Casa Lomas 214', cliente_id: r.cliente_id, estado: 'activo' });
    const clientes = filas(await o('mike', '/clientes'));
    expect(clientes.map((x) => x.nombre)).toContain('Fam. Ortega');
    const obras = (await o('mike', '/obras')).data.obras as any[];
    expect(obras.find((x) => x.id === r.id)?.proyecto_id, 'la obra queda ligada a su proyecto').toBe(r.proyecto_id);
    // quote101 lee los mismos proyectos y clientes, con su propia llave de app.
    const enQuote = filas(await o('mike', '/proyectos', { app: 'cotizador101' }));
    expect(enQuote.some((p) => p.id === r.proyecto_id), 'quote101 lo ve').toBe(true);
  });

  it('el mismo nombre con otras mayúsculas o acentos es el mismo cliente: no se duplica', async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Depto Ortega', client: '  fam. ORTEGÁ ', suite: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.cliente_nuevo).toBe(false);
    expect(r.cliente_id).toBe(clienteOrtega);
    expect(filas(await o('mike', '/clientes')).filter((x) => x.id === clienteOrtega).length).toBe(1);
    // La tarjeta de quell dice el nombre como quedó en la suite.
    const lista = (await q('mike', '/projects')).projects as any[];
    expect(lista.find((p) => p.id === r.id)?.client).toBe('Fam. Ortega');
  });

  it('escogiendo un cliente que ya existe, por su id', async () => {
    const otro = (await o('mike', '/clientes', { method: 'POST', json: { nombre: 'Corporativo Luna' } })).data.id as string;
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Oficinas Luna', cliente_id: otro, suite: true } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r).toMatchObject({ cliente_id: otro, cliente_nuevo: false });
    expect((await o('mike', `/proyectos/${r.proyecto_id}`)).data.cliente_id).toBe(otro);
  });

  it('sin `suite: true`, o sin cliente, la obra nace suelta como antes', async () => {
    const vieja = await q('mike', '/projects', { method: 'POST', json: { name: 'Obra para ligar', client: 'Alguien' } });
    expect(vieja.proyecto_id).toBeNull();
    const sinCliente = await q('mike', '/projects', { method: 'POST', json: { name: 'Sin cliente', client: '', suite: true } });
    expect(sinCliente.proyecto_id).toBeNull();
    const sueltas = ((await o('mike', '/obras?sueltas=1')).data.obras as any[]).map((x) => x.id);
    expect(sueltas).toEqual(expect.arrayContaining([vieja.id, sinCliente.id]));
  });

  it('los clientes de la suite, para escogerlos en quell: sólo quien dirige', async () => {
    const r = await q('mike', '/clientes-suite');
    expect(r.estado).toBe(200);
    expect(r.clientes.map((x: any) => x.nombre)).toEqual(expect.arrayContaining(['Fam. Ortega', 'Corporativo Luna']));
  });
});

describe('la descripción del requerimiento viaja a quote101 (0.77.0)', () => {
  let obra = '', plano = '', proyecto = '';

  beforeAll(async () => {
    const r = await q('mike', '/projects', { method: 'POST', json: { name: 'Casa con requerimientos', client: 'Familia Requena', suite: true } });
    obra = r.id; proyecto = r.proyecto_id;
    const fd = new FormData();
    fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
    fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
    plano = (await q('mike', `/projects/${obra}/plans`, { method: 'POST', body: fd })).id;
  });

  const levantar = (name: string, descripcion?: string) => q('mike', `/plans/${plano}/elements`, {
    method: 'POST', json: { op_id: crypto.randomUUID(), name, type: 'Requerimiento', x: 0.5, y: 0.5, ...(descripcion === undefined ? {} : { descripcion }) },
  });

  it('escrita en quell: va al ítem y al renglón del borrador de quote101', async () => {
    const r = await levantar('Librero de piso a techo', 'Librero de MDF laqueado blanco, 2.40 × 3.10 m, con iluminación LED.');
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.item_id, 'la obra tiene proyecto: el requerimiento nace como ítem').toBeTruthy();
    const item = (await o('mike', `/items/${r.item_id}`)).data;
    expect(item).toMatchObject({ proyecto_id: proyecto, descripcion: 'Librero de MDF laqueado blanco, 2.40 × 3.10 m, con iluminación LED.' });
    const cot = (await o('mike', `/cotizaciones/${r.cotizacion_id}`, { app: 'cotizador101' })).data;
    const renglon = cot.datos.versiones[0].muebles.find((m: any) => m.item_id === r.item_id);
    expect(renglon.descripcion, 'quote101 enseña la descripción del renglón').toBe('Librero de MDF laqueado blanco, 2.40 × 3.10 m, con iluminación LED.');
    expect(renglon.nombre).toBe('Librero de piso a techo');
  });

  it('vacía: el renglón de quote101 queda en blanco para llenarlo allá', async () => {
    const r = await levantar('Repisa flotante', '   ');
    const cot = (await o('mike', `/cotizaciones/${r.cotizacion_id}`, { app: 'cotizador101' })).data;
    expect(cot.datos.versiones[0].muebles.find((m: any) => m.item_id === r.item_id).descripcion).toBe('');
  });

  it('en una obra que se liga después, la descripción se guarda en la pieza y llega al ligar', async () => {
    const suelta = (await q('mike', '/projects', { method: 'POST', json: { name: 'Obra que se liga luego', client: 'Familia Requena' } })).id;
    const fd = new FormData();
    fd.append('name', 'Planta'); fd.append('file_name', 'p.pdf'); fd.append('width', '1000'); fd.append('height', '800');
    fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
    const pl = (await q('mike', `/projects/${suelta}/plans`, { method: 'POST', body: fd })).id;
    const r = await q('mike', `/plans/${pl}/elements`, { method: 'POST', json: { op_id: crypto.randomUUID(), name: 'Barra', type: 'Requerimiento', x: 0.5, y: 0.5, descripcion: 'Barra de granito' } });
    expect(r.item_id, 'sin proyecto todavía no hay ítem').toBeNull();
    const cliente = filas(await o('mike', '/clientes')).find((x) => x.nombre === 'Familia Requena').id;
    const nuevo = (await o('mike', '/proyectos', { method: 'POST', json: { cliente_id: cliente, nombre: 'Obra que se liga luego' } })).data.id;
    expect((await o('mike', `/obras/${suelta}/ligar`, { method: 'POST', json: { proyecto_id: nuevo } })).estado).toBe(200);
    const item = (await q('mike', `/elements/${r.id}`)).element.item_id;
    expect((await o('mike', `/items/${item}`)).data.descripcion).toBe('Barra de granito');
  });
});

describe('la 0039 da de alta las obras sueltas que ya existían', () => {
  const dentro = runInDurableObject as unknown as <T>(s: unknown, f: (o: any) => T | Promise<T>) => Promise<T>;
  const entorno = env as unknown as { ORG: DurableObjectNamespace };
  const elDO = () => entorno.ORG.get(entorno.ORG.idFromName('migracion-0039')) as unknown as DurableObjectStub;
  const HASTA = MIGRACIONES.findIndex((m) => m.includes('OrgDB v39'));
  const T = '2026-10-01T00:00:00.000Z';

  beforeAll(async () => {
    await dentro(elDO(), async (db: any) => {
      await db.ctx.storage.deleteAll();
      db.migrar();
      await db.correrPendientes();
      db.sql.exec(`DELETE FROM _migraciones WHERE version > ?`, HASTA);
      const x = (s: string, ...a: unknown[]) => db.sql.exec(s, ...a);
      x(`INSERT INTO clientes (id, nombre, nombre_norm, creado_en_app, creado_at) VALUES ('cl1','Depto Bosques','depto bosques','dash101',?)`, T);
      x(`INSERT INTO proyectos (id, cliente_id, nombre, estado, creado_at) VALUES ('p1','cl1','Ya ligado','activo',?)`, T);
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, status, created_at) VALUES ('o-ligada','Ya ligado (obra)','Depto Bosques','p1','activo',?)`, T);
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, status, created_at) VALUES ('o-nueva','Casa Nueva','Cliente Nuevo SA',NULL,'activo',?)`, T);
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, status, created_at) VALUES ('o-mismo','Otra de Bosques','DEPTO BOSQUES',NULL,'activo',?)`, T);
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, status, created_at) VALUES ('o-archivada','Terminada','Cliente Viejo',NULL,'cerrado',?)`, T);
      x(`INSERT INTO quell_projects (id, name, client, proyecto_id, status, created_at) VALUES ('o-sin','Sin cliente','',NULL,'activo',?)`, T);
      return true;
    });
  });

  it('cada obra suelta con cliente escrito queda con su cliente y su proyecto; las demás no se tocan', async () => {
    const r = await dentro(elDO(), (db: any) => {
      db.migrar();
      const obra = (id: string) => db.sql.exec(`SELECT o.proyecto_id, o.client, p.nombre, p.estado, p.cliente_id FROM quell_projects o LEFT JOIN proyectos p ON p.id = o.proyecto_id WHERE o.id = ?`, id).one();
      return {
        version: db.version(),
        ligada: obra('o-ligada'), nueva: obra('o-nueva'), mismo: obra('o-mismo'), archivada: obra('o-archivada'), sin: obra('o-sin'),
        clientes: db.sql.exec(`SELECT nombre FROM clientes ORDER BY nombre`).toArray().map((c: any) => c.nombre),
        proyectos: Number(db.sql.exec(`SELECT COUNT(*) AS n FROM proyectos`).one().n),
      };
    });
    expect(r.version).toBe(VERSION_ORG_DB);
    expect(r.ligada.proyecto_id, 'la que ya estaba ligada sigue igual').toBe('p1');
    expect(r.nueva).toMatchObject({ nombre: 'Casa Nueva', estado: 'activo' });
    expect(r.mismo.cliente_id, 'el mismo nombre es el mismo cliente').toBe('cl1');
    expect(r.mismo.client).toBe('Depto Bosques');
    expect(r.archivada).toMatchObject({ nombre: 'Terminada', estado: 'cerrado' });
    expect(r.sin.proyecto_id, 'sin cliente escrito se queda suelta').toBeNull();
    expect(r.clientes).toEqual(['Cliente Nuevo SA', 'Cliente Viejo', 'Depto Bosques']);
    expect(r.proyectos).toBe(4);
  });
});

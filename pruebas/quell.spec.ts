/* quell101 dentro de la suite (contrato 0.16.0).
 *
 * El banco de obra que vivía en bitacora-obra/pruebas/obra.mjs, ahora contra
 * el motor corriendo DENTRO del Durable Object, con la puerta de la suite de
 * verdad delante: sesiones, empresa, app prendida, miembros y cliente. Lo que
 * se prueba es lo mismo que antes (A · el código, D · contratistas, B · la
 * cara de cliente) y, además, que la puerta de la suite mande: quien no tiene
 * quell101 en su lista no entra, y un cliente entra sólo con su acceso.
 *
 * Al final, la mudanza: una D1 sembrada como la de producción (mismo esquema,
 * volcado de sqlite_master) se trae en seco y luego de verdad, con sus
 * archivos, y se comprueba que el motor la vea. */

import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/entorno';
import esquemaViejo from './quell-d1.sql';

const CORREO = 'mike@forespot.com';
const ORG = 'obra';
const GENTE = {
  goyo: { correo: 'goyo@ejemplo.mx', name: 'Goyo', company: 'Carpintería Goyo' },
  berna: { correo: 'berna@ejemplo.mx', name: 'Berna', company: 'Vidrios Berna' },
  tema: { correo: 'tema@ejemplo.mx', name: 'Tema', company: 'Herrería Tema' },
  fuera: { correo: 'fuera@ejemplo.mx', name: 'Fuera', company: '' },
  sindash: { correo: 'solo-dash@ejemplo.mx', name: 'Sólo dash', company: '' },
};
const CLIENTE = { correo: 'cliente-obra@ejemplo.mx', name: 'Cliente Inventado' };
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const galletas: Record<string, string> = {};
const ids: Record<string, string> = {}; // quell_users.id por apodo

async function pedir(quien: string, ruta: string, opciones: RequestInit & { app?: string; json?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (opciones.app !== '') cabeceras['X-App'] = opciones.app ?? 'quell101';
  if (galletas[quien]) cabeceras.Cookie = galletas[quien];
  let body = opciones.body;
  if (opciones.json !== undefined) { body = JSON.stringify(opciones.json); cabeceras['Content-Type'] = 'application/json'; }
  const r = await SELF.fetch(`https://api.local${ruta}`, { ...opciones, body, headers: { ...cabeceras, ...(opciones.headers as object) } });
  const puesta = r.headers.get('Set-Cookie');
  if (puesta) galletas[quien] = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo: any = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { texto }; }
  return { estado: r.status, ...cuerpo } as { estado: number; [k: string]: any };
}
/** Las rutas de quell: `/orgs/obra/quell/…`, y la respuesta viene sin envolver ({ok, …} pegado). */
const q = (quien: string, ruta: string, opciones: Parameters<typeof pedir>[2] = {}) => pedir(quien, `/orgs/${ORG}/quell${ruta}`, opciones);
function forma(campos: Record<string, string | Blob>) {
  const fd = new FormData();
  fd.append('op_id', crypto.randomUUID());
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return fd;
}
async function entrar(quien: string, correo: string) {
  galletas[quien] = '';
  const c = await pedir(quien, '/auth/codigo', { method: 'POST', json: { correo }, app: '' });
  expect(c.estado, `código para ${correo}: ${JSON.stringify(c)}`).toBe(200);
  const e = await pedir(quien, '/auth/entrar', { method: 'POST', json: { correo, codigo: c.data.codigo_prueba }, app: '' });
  expect(e.estado, `entrar ${correo}: ${JSON.stringify(e)}`).toBe(200);
}

let m1 = '', m2 = '', m3 = '', pa = '', pb = '';
let obraA = '', obraB = '';

beforeAll(async () => {
  await entrar('mike', CORREO);
  const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: ORG, nombre: 'Obra de pruebas' }, app: '' });
  expect(alta.estado, JSON.stringify(alta)).toBe(201);
  for (const [apodo, g] of Object.entries(GENTE)) {
    const m = await pedir('mike', `/admin/orgs/${ORG}/miembros`, { method: 'POST', json: { correo: g.correo, rol: 'staff', nombre: g.name, apps: apodo === 'sindash' ? ['dash'] : ['quell'] }, app: '' });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    await entrar(apodo, g.correo);
  }
}, 60000);

describe('la puerta de la suite manda', () => {
  it('el dueño de la suite entra a quell101 y nace como dueño de la bitácora la primera vez', async () => {
    const yo = await q('mike', '/me');
    expect(yo.estado, JSON.stringify(yo)).toBe(200);
    expect(yo.user.role).toBe('admin');
    expect(yo.user.email).toBe(CORREO);
    // Y no se duplica en la segunda.
    const otra = await q('mike', '/me');
    expect(otra.user.id).toBe(yo.user.id);
  });
  it('un miembro sin quell101 en su lista no pasa la puerta (403 app_no_permitida)', async () => {
    const r = await q('sindash', '/me');
    expect(r.estado).toBe(403);
    expect(r.error).toBe('app_no_permitida');
  });
  it('un miembro con quell101 pero sin renglón en obra ve 401: dar de alta es decidir un rol', async () => {
    const r = await q('goyo', '/me');
    expect(r.estado).toBe(401);
  });
  it('sin sesión, 401; con otra app en X-App, la puerta de quell no abre igual', async () => {
    expect((await q('nadie', '/me')).estado).toBe(401);
    const r = await q('mike', '/me', { app: 'peek101' });
    expect(r.estado).toBe(200); // la ruta es de la empresa; la app que la pide sólo decide permisos de tabla
  });
  it('el dueño da de alta a su gente y les abre las obras', async () => {
    for (const apodo of ['goyo', 'berna', 'tema', 'fuera'] as const) {
      const g = GENTE[apodo];
      const r = await q('mike', '/users', { method: 'POST', json: { email: g.correo, name: g.name, role: 'con', company: g.company } });
      expect(r.estado, JSON.stringify(r)).toBe(200);
      ids[apodo] = r.id;
    }
    ids.mike = (await q('mike', '/me')).user.id;
    const a = await q('mike', '/projects', { method: 'POST', json: { name: 'Obra de prueba A', client: 'Cliente inventado' } });
    const b = await q('mike', '/projects', { method: 'POST', json: { name: 'Obra de prueba B', client: 'Otro cliente inventado' } });
    obraA = a.id; obraB = b.id;
    expect(obraA && obraB).toBeTruthy();
    for (const apodo of ['goyo', 'berna', 'tema'] as const) {
      const r = await q('mike', `/projects/${obraA}/members`, { method: 'POST', json: { user_id: ids[apodo], rol: 'con' } });
      expect(r.estado, JSON.stringify(r)).toBe(200);
    }
    expect((await q('goyo', '/me')).user.role).toBe('con');
  });
  it('los planos se suben al bucket de la suite bajo la empresa, y se sirven sólo a quien entró', async () => {
    for (const [obra, nombre] of [[obraA, 'Planta baja'], [obraB, 'Planta']] as const) {
      const fd = new FormData();
      fd.append('name', nombre); fd.append('file_name', 'plano.pdf'); fd.append('width', '1000'); fd.append('height', '800');
      fd.append('image', new File([PNG], 'plan.png', { type: 'image/png' }));
      const r = await q('mike', `/projects/${obra}/plans`, { method: 'POST', body: fd });
      expect(r.estado, JSON.stringify(r)).toBe(200);
      expect(r.image_key).toMatch(new RegExp(`^orgs/${ORG}/quell/plans/`));
      if (obra === obraA) pa = r.id; else pb = r.id;
    }
    const proyecto = await q('goyo', `/projects/${obraA}`);
    const llave = proyecto.plans[0].image_key as string;
    const bytes = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/files/${llave}`, { headers: { Cookie: galletas.goyo, 'X-App': 'quell101' } });
    expect(bytes.status).toBe(200);
    expect((await bytes.arrayBuffer()).byteLength).toBe(PNG.byteLength);
    const sinSesion = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/files/${llave}`, { headers: { 'X-App': 'quell101' } });
    expect(sinSesion.status).toBe(401);
    const otraEmpresa = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/files/orgs/otra/quell/plans/x.png`, { headers: { Cookie: galletas.goyo, 'X-App': 'quell101' } });
    expect(otraEmpresa.status).toBe(403);
  });
});

describe('A · el código del ítem, contra el SQLite de la empresa', () => {
  const alta = (plano: string, cuerpo: Record<string, unknown>) => q('mike', `/plans/${plano}/elements`, { method: 'POST', json: { op_id: crypto.randomUUID(), ...cuerpo } });
  it('propone por obra, no rellena huecos, y la base rechaza el repetido diciendo cuál', async () => {
    const a = await alta(pa, { name: 'Isla', type: 'Mueble', x: 0.1, y: 0.1 });
    expect(a.estado, JSON.stringify(a)).toBe(200);
    expect(a.code).toBe('MW-01');
    m1 = a.id;
    const b = await alta(pa, { name: 'Barra', type: 'Mueble', x: 0.2, y: 0.2 });
    expect(b.code).toBe('MW-02');
    m2 = b.id;
    expect((await alta(pa, { name: 'Puerta principal', type: 'Puerta', x: 0.3, y: 0.3 })).code).toBe('PT-01');
    expect((await alta(pb, { name: 'Mueble en otra obra', type: 'Mueble', x: 0.5, y: 0.5 })).code).toBe('MW-01');
    const choque = await alta(pa, { name: 'Repetido a mano', type: 'Mueble', code: 'MW-01', x: 0.4, y: 0.4 });
    expect(choque.estado).toBe(409);
    expect(choque.error).toMatch(/MW-01/);
    expect((await alta(pb, { name: 'Mismo código, otra obra', type: 'Mueble', code: 'MW-02', x: 0.4, y: 0.4 })).estado).toBe(200);
    const fx = await alta(pa, { name: 'Barniz', type: 'Acabado', x: 0.6, y: 0.6 });
    expect(fx.code).toBe('FX-01');
    m3 = fx.id;
    const proyecto = await q('mike', `/projects/${obraA}`);
    expect(proyecto.elements.every((e: any) => e.project_id === obraA)).toBe(true);
  });
  it('reubicar cambia sólo la posición, deja constancia y no se repite con mala señal', async () => {
    const op = crypto.randomUUID();
    const mov = await q('mike', `/elements/${m1}`, { method: 'PATCH', json: { x: 0.77, y: 0.88, reubicar: true, op_id: op } });
    expect(mov.estado).toBe(200);
    const d = await q('mike', `/elements/${m1}`);
    expect(d.element.x).toBe(0.77);
    expect(d.log.length).toBe(1);
    expect(d.log[0].text).toMatch(/Reubicado/);
    const otraVez = await q('mike', `/elements/${m1}`, { method: 'PATCH', json: { x: 0.77, y: 0.88, reubicar: true, op_id: op } });
    expect(otraVez.repetida).toBe(true);
    expect((await q('mike', `/elements/${m1}`)).log.length).toBe(1);
    expect((await q('goyo', `/elements/${m1}`, { method: 'PATCH', json: { x: 0.1, y: 0.1, reubicar: true, op_id: crypto.randomUUID() } })).estado).toBe(403);
  });
});

describe('D · contratistas por ítem', () => {
  it('quien dirige pone contratistas; no se duplica; sólo contratistas de la obra', async () => {
    const puesta = await q('mike', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo, ids.berna], op_id: crypto.randomUUID() } });
    expect(puesta.estado, JSON.stringify(puesta)).toBe(200);
    expect(puesta.contratistas.length).toBe(2);
    const dosVeces = await q('mike', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo, ids.berna, ids.goyo], op_id: crypto.randomUUID() } });
    expect(dosVeces.contratistas.length).toBe(2);
    expect((await q('mike', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.mike], op_id: crypto.randomUUID() } })).estado).toBe(400);
    const fuera = await q('mike', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo, ids.fuera], op_id: crypto.randomUUID() } });
    expect(fuera.estado).toBe(400);
    expect(fuera.error).toMatch(/acceso a la obra/);
    expect((await q('goyo', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo], op_id: crypto.randomUUID() } })).estado).toBe(403);
  });
  it('el contratista ve todo el plano, los suyos completos y los ajenos recortados por el servidor', async () => {
    for (const eid of [m1, m2]) expect((await q('mike', `/elements/${eid}/fase`, { method: 'POST', json: { fase: 'punchlist', op_id: crypto.randomUUID() } })).estado).toBe(200);
    const kb = await q('mike', `/elements/${m1}/punch`, { method: 'POST', body: forma({ title: 'Vidrio del frente', assignee_id: ids.berna }) });
    expect(kb.estado, JSON.stringify(kb)).toBe(200);
    const kt = await q('mike', `/elements/${m2}/punch`, { method: 'POST', body: forma({ title: 'Herraje flojo', assignee_id: ids.tema }) });
    expect(kt.estado).toBe(200);
    expect((await q('mike', `/elements/${m2}/log`, { method: 'POST', body: forma({ text: 'Trato interno sobre M2', kind: 'acuerdo' }) })).estado).toBe(200);

    const obra = await q('goyo', `/projects/${obraA}`);
    expect(obra.estado).toBe(200);
    const idsObra = obra.elements.map((e: any) => e.id);
    expect(idsObra).toEqual(expect.arrayContaining([m1, m2, m3]));
    expect(obra.mios).toEqual([m1]);
    const ajeno = obra.elements.find((e: any) => e.id === m2);
    expect(ajeno.ajeno).toBe(true);
    expect('resp' in ajeno).toBe(false);
    expect('fase' in ajeno).toBe(false);
    expect(ajeno.n_total).toBe(0);
    const suyo = obra.elements.find((e: any) => e.id === m1);
    expect(suyo.n_total).toBe(1);
    expect(suyo.fase).toBe('punchlist');
    expect(obra.members).toEqual([]);

    const m2Goyo = await q('goyo', `/elements/${m2}`);
    expect(m2Goyo.recorte).toBe(true);
    expect(m2Goyo.punch.length).toBe(0);
    expect(m2Goyo.log.length).toBe(0);
    expect(m2Goyo.element.code).toBe('MW-02');
    const m1Goyo = await q('goyo', `/elements/${m1}`);
    expect(m1Goyo.recorte).not.toBe(true);
    expect(m1Goyo.punch.some((k: any) => k.id === kb.id)).toBe(true);
    // Tema: un pendiente a su nombre lo hace dueño del ítem aunque no esté en la lista.
    const m2Tema = await q('tema', `/elements/${m2}`);
    expect(m2Tema.recorte).not.toBe(true);
    expect(m2Tema.punch.some((k: any) => k.id === kt.id)).toBe(true);
    expect((await q('tema', `/projects/${obraA}`)).mios).toEqual([m2]);
    expect((await q('tema', `/elements/${m1}`)).recorte).toBe(true);
    const m1Mike = await q('mike', `/elements/${m1}`);
    expect(m1Mike.contratistas.map((c: any) => c.name).sort()).toEqual(['Berna', 'Goyo']);
  });
  it('desactivar a alguien no se lleva el ítem; borrar un ítem se lleva sus asignaciones', async () => {
    expect((await q('mike', `/users/${ids.fuera}`, { method: 'PATCH', json: { active: false } })).estado).toBe(200);
    expect((await q('fuera', '/me')).estado).toBe(401);
    const antes = await q('mike', `/elements/${m3}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo], op_id: crypto.randomUUID() } });
    expect(antes.contratistas.length).toBe(1);
    expect((await q('mike', `/elements/${m3}`, { method: 'DELETE' })).estado).toBe(200);
    expect((await q('mike', `/elements/${m3}`)).estado).toBe(403); // ya no hay obra que lo tenga
    const obra = await q('mike', `/projects/${obraA}`);
    expect(obra.elements.some((e: any) => e.id === m3)).toBe(false);
  });
});

describe('B · la cara de cliente, con la invitación pasando por la suite', () => {
  let punto = '', interna = '';
  it('la dueña invita: la suite deja al cliente, la bitácora lo apunta en la obra; un contratista no invita', async () => {
    expect((await q('goyo', '/clientes/invitar', { method: 'POST', json: { email: CLIENTE.correo, name: CLIENTE.name, project_ids: [obraA] } })).estado).toBe(403);
    expect((await q('mike', '/clientes/invitar', { method: 'POST', json: { email: CLIENTE.correo, name: CLIENTE.name, project_ids: [] } })).estado).toBe(400);
    // Alguien del taller no se vuelve cliente: lo para la bitácora si ya tiene
    // renglón aquí (Goyo), y lo para la suite si es miembro sin renglón (Sólo dash).
    const miembro = await q('mike', '/clientes/invitar', { method: 'POST', json: { email: GENTE.goyo.correo, name: 'Goyo', project_ids: [obraA] } });
    expect(miembro.estado, JSON.stringify(miembro)).toBe(409);
    expect(miembro.error).toMatch(/alguien del taller/);
    const socio = await q('mike', '/clientes/invitar', { method: 'POST', json: { email: GENTE.sindash.correo, name: 'Sólo dash', project_ids: [obraA] } });
    expect(socio.estado, JSON.stringify(socio)).toBe(409);
    expect(socio.error).toMatch(/alguien de la empresa/);
    expect((await q('mike', '/clientes')).clientes.length).toBe(0);
    const inv = await q('mike', '/clientes/invitar', { method: 'POST', json: { email: CLIENTE.correo.toUpperCase(), name: CLIENTE.name, project_ids: [obraA] } });
    expect(inv.estado, JSON.stringify(inv)).toBe(200);
    expect(inv.nuevo).toBe(true);
    expect(inv.suite.nuevo_usuario).toBe(true);
    ids.cliente = inv.id;
    // En la suite: cliente de la empresa con portal, y en la lista de invitados de quell.
    const clientes = await pedir('mike', `/orgs/${ORG}/clientes`, { app: 'dash101' });
    expect(clientes.data.filas.some((f: any) => f.correo === CLIENTE.correo && f.portal_activo === true)).toBe(true);
    const lista = await q('mike', '/clientes');
    expect(lista.clientes.length).toBe(1);
    expect(lista.clientes[0].obras).toBe('Obra de prueba A');
    const otraVez = await q('mike', '/clientes/invitar', { method: 'POST', json: { email: CLIENTE.correo, name: 'Renombrado', project_ids: [obraA, obraB] } });
    expect(otraVez.nuevo).toBe(false);
    expect((await q('mike', '/clientes')).clientes.length).toBe(1);
  });
  it('el cliente entra con su acceso de cliente y ve lo suyo recortado; siete rutas le contestan 403', async () => {
    await entrar('cliente', CLIENTE.correo);
    const yo = await q('cliente', '/me');
    expect(yo.estado, JSON.stringify(yo)).toBe(200);
    expect(yo.user.role).toBe('cli');
    // Y sigue abriendo /peek con la misma cuenta.
    expect((await pedir('cliente', `/orgs/${ORG}/peek`, { app: 'peek101' })).estado).toBe(200);
    // Pero una tabla suelta de la suite, no.
    expect((await pedir('cliente', `/orgs/${ORG}/items`, { app: 'quell101' })).estado).toBe(403);
    const obras = await q('cliente', '/projects');
    expect(obras.projects.map((p: any) => p.id).sort()).toEqual([obraA, obraB].sort());
    for (const [ruta, method, json] of [[`/projects/${obraA}/punch`, 'GET'], [`/projects/${obraA}/report`, 'GET'], ['/projects', 'POST', { name: 'x' }], [`/elements/${m2}`, 'PATCH', { name: 'x', op_id: crypto.randomUUID() }], ['/users', 'GET'], ['/clientes', 'GET'], [`/projects/${obraA}/avisar-cliente`, 'POST', {}]] as const) {
      const r = await q('cliente', ruta, { method, json });
      expect(r.estado, `${method} ${ruta}`).toBe(403);
    }
    interna = (await q('goyo', `/projects/${obraA}/dudas`, { method: 'POST', body: forma({ texto: 'Duda interna: ¿el herraje va cromado?' }) })).id;
    const p = await q('mike', `/projects/${obraA}/dudas`, { method: 'POST', body: forma({ texto: '¿De qué color va el mueble de TV?', element_id: m2, para: 'cliente' }) });
    expect(p.para).toBe('cliente');
    punto = p.id;
    expect((await q('goyo', `/projects/${obraA}/dudas`, { method: 'POST', body: forma({ texto: 'x', para: 'cliente' }) })).para).toBe('taller');

    const obra = await q('cliente', `/projects/${obraA}`);
    const e2 = obra.elements.find((e: any) => e.id === m2);
    expect(e2.ajeno).toBe(true);
    expect('resp' in e2).toBe(false);
    expect(e2.definir).toBe(1);
    expect(obra.mios).toEqual([m2]);
    expect(obra.members).toEqual([]);
    expect(obra.dudas_abiertas).toBe(1);
    expect('created_by' in obra.project).toBe(false);
    const dudas = await q('cliente', `/projects/${obraA}/dudas`);
    expect(dudas.dudas.map((d: any) => d.id)).toEqual([punto]);
    const item = await q('cliente', `/elements/${m2}`);
    expect(item.cliente).toBe(true);
    expect(item.dudas.length).toBe(1);
    expect(item.punch.length).toBe(0);
    expect(item.log.length).toBe(0);
  });
  it('el cierre automático en los dos sentidos, reabrir del taller, y el aviso por correo', async () => {
    const resp = await q('cliente', `/dudas/${punto}/respuestas`, { method: 'POST', body: forma({ texto: 'Nogal, como la cocina.' }) });
    expect(resp.estado, JSON.stringify(resp)).toBe(200);
    expect(resp.cerrada).toBe(true);
    expect((await q('cliente', `/dudas/${interna}/respuestas`, { method: 'POST', body: forma({ texto: 'me colé' }) })).estado).toBe(403);
    expect((await q('cliente', `/dudas/${punto}/estado`, { method: 'POST', json: { estado: 'abierta', op_id: crypto.randomUUID() } })).estado).toBe(403);
    expect((await q('mike', `/dudas/${punto}/estado`, { method: 'POST', json: { estado: 'abierta', op_id: crypto.randomUUID() } })).estado).toBe(200);
    expect((await q('mike', `/dudas/${punto}/respuestas`, { method: 'POST', body: forma({ texto: '¿Nogal claro u oscuro?' }) })).cerrada).toBe(false);
    const suyo = await q('cliente', `/projects/${obraA}/dudas`, { method: 'POST', body: forma({ texto: '¿La isla lleva contacto?', element_id: m1 }) });
    expect(suyo.para).toBe('cliente');
    expect((await q('goyo', `/projects/${obraA}/dudas`)).dudas.some((d: any) => d.para === 'cliente')).toBe(false);
    const todas = await q('mike', `/projects/${obraA}/dudas`);
    expect(todas.dudas.filter((d: any) => d.para === 'cliente').length).toBe(2);
    expect((await q('mike', `/dudas/${suyo.id}/respuestas`, { method: 'POST', body: forma({ texto: 'Sí, dos contactos.' }) })).cerrada).toBe(true);
    expect((await q('goyo', `/projects/${obraA}/avisar-cliente`, { method: 'POST', json: {} })).estado).toBe(403);
    const aviso = await q('mike', `/projects/${obraA}/avisar-cliente`, { method: 'POST', json: { op_id: crypto.randomUUID() } });
    expect(aviso.estado, JSON.stringify(aviso)).toBe(200);
    expect(aviso.puntos).toBe(1);
    expect(aviso.enviados).toBe(1); // sin Resend aquí: se intenta y se cuenta, no sale
    expect((await q('mike', `/projects/${obraB}/avisar-cliente`, { method: 'POST', json: {} })).estado).toBe(400);
  });
});

describe('borrar una obra y contar lo de quell101', () => {
  it('master101 ve cuántas filas de quell101 tiene la empresa', async () => {
    const r = await pedir('mike', `/admin/orgs/${ORG}/quell`, { app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.filas.quell_projects).toBe(2);
    expect(r.data.filas.quell_etapas).toBe(5);
    expect((await pedir('goyo', `/admin/orgs/${ORG}/quell`, { app: '' })).estado).toBe(403);
  });
  it('borrar una obra es del dueño y se lleva planos, ítems y archivos', async () => {
    expect((await q('goyo', `/projects/${obraB}`, { method: 'DELETE' })).estado).toBe(403);
    const antes = await q('mike', `/projects/${obraB}`);
    const llave = antes.plans[0].image_key as string;
    expect(await (env as unknown as Env).ARCHIVOS.head(llave)).not.toBeNull();
    const r = await q('mike', `/projects/${obraB}`, { method: 'DELETE' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.archivos).toBe(1);
    expect(await (env as unknown as Env).ARCHIVOS.head(llave)).toBeNull();
    expect((await q('mike', `/projects/${obraB}`)).estado).toBe(404);
    const conteos = await pedir('mike', `/admin/orgs/${ORG}/quell`, { app: '' });
    expect(conteos.data.filas.quell_projects).toBe(1);
    expect(conteos.data.filas.quell_plans).toBe(1);
  });
});

describe('la mudanza desde la D1 vieja (POST /admin/mudar-quell)', () => {
  const MUD = 'mudanza';
  const e = env as unknown as Env;
  beforeAll(async () => {
    // Una D1 igual a la de producción, sembrada con una obra chica.
    const d1 = e.QUELL_D1!;
    const sinNotas = esquemaViejo.split('\n').filter((l: string) => !l.trim().startsWith('--')).join('\n');
    for (const st of sinNotas.split(';').map((x: string) => x.trim()).filter(Boolean)) await d1.prepare(st).run();
    const filas = [
      `INSERT INTO users (id, email, name, role, company, active, created_at) VALUES ('u-mike', '${CORREO}', 'mike', 'admin', '', 1, '2026-09-04T00:00:00.000Z')`,
      `INSERT INTO users (id, email, name, role, company, active, created_at, pin_hash) VALUES ('u-viejo', 'viejo@ejemplo.mx', 'Viejo sin cuenta', 'con', 'Taller viejo', 1, '2026-09-04T00:00:00.000Z', 'x')`,
      `INSERT INTO projects (id, name, client, status, created_by, created_at) VALUES ('p-vieja', 'Obra vieja', 'Cliente viejo', 'activo', 'u-mike', '2026-09-05T00:00:00.000Z')`,
      `INSERT INTO project_members (project_id, user_id, rol) VALUES ('p-vieja', 'u-viejo', 'con')`,
      `INSERT INTO plans (id, project_id, name, file_name, image_key, source_key, width, height, sort, created_at) VALUES ('pl-1', 'p-vieja', 'Planta', 'planta.pdf', 'plans/p-vieja/pl-1.png', 'plans/p-vieja/pl-1-src.pdf', 1000, 800, 1, '2026-09-05T00:00:00.000Z')`,
      `INSERT INTO elements (id, plan_id, project_id, code, type, name, resp, x, y, fase, created_by, created_at) VALUES ('e-1', 'pl-1', 'p-vieja', 'MW-07', 'Mueble', 'Mueble TV', 'taller101', 0.5, 0.5, 'punchlist', 'u-mike', '2026-09-06T00:00:00.000Z')`,
      `INSERT INTO elements (id, plan_id, project_id, code, type, name, resp, x, y, fase, created_by, created_at) VALUES ('e-2', 'pl-1', NULL, 'PT-03', 'Puerta', 'Puerta', 'Berna', 0.2, 0.2, 'produccion', 'u-mike', '2026-09-06T00:00:00.000Z')`,
      `INSERT INTO log_entries (id, element_id, user_id, kind, text, created_at) VALUES ('l-1', 'e-1', 'u-mike', 'trabajo', 'Se entregó', '2026-09-07T00:00:00.000Z')`,
      `INSERT INTO punch_items (id, element_id, title, status, assignee_id, created_by, created_at) VALUES ('k-1', 'e-1', 'Rayón', 'pend', 'u-viejo', 'u-mike', '2026-09-08T00:00:00.000Z')`,
      `INSERT INTO photos (id, owner_type, owner_id, r2_key, file_name, size, user_id, created_at) VALUES ('f-1', 'log', 'l-1', 'photos/log/l-1/f-1.jpg', 'foto.jpg', ${PNG.byteLength}, 'u-mike', '2026-09-07T00:00:00.000Z')`,
      `INSERT INTO operaciones (id, cuando) VALUES ('op-1', '2026-09-07T00:00:00.000Z')`,
      `INSERT INTO element_etapas (element_id, etapa, hecha_en, hecha_por) VALUES ('e-1', 'entrega', '2026-09-07T00:00:00.000Z', 'u-mike')`,
      `INSERT INTO dudas (id, project_id, element_id, user_id, texto, estado, para, created_at) VALUES ('d-1', 'p-vieja', 'e-1', 'u-viejo', '¿Va cromado?', 'abierta', 'taller', '2026-09-08T00:00:00.000Z')`,
      `INSERT INTO duda_respuestas (id, duda_id, user_id, texto, created_at) VALUES ('r-1', 'd-1', 'u-mike', 'Sí', '2026-09-08T01:00:00.000Z')`,
      `INSERT INTO element_contratistas (element_id, user_id, asignado_por, asignado_at) VALUES ('e-1', 'u-viejo', 'u-mike', '2026-09-08T00:00:00.000Z')`,
    ];
    for (const f of filas) await d1.prepare(f).run();
    for (const llave of ['plans/p-vieja/pl-1.png', 'plans/p-vieja/pl-1-src.pdf', 'photos/log/l-1/f-1.jpg']) await e.QUELL_R2!.put(llave, PNG, { httpMetadata: { contentType: 'image/png' } });
    const alta = await pedir('mike', '/admin/orgs', { method: 'POST', json: { id: MUD, nombre: 'Empresa mudada' }, app: '' });
    expect(alta.estado, JSON.stringify(alta)).toBe(201);
  }, 60000);

  it('sólo el superadmin, y sólo a una empresa que existe', async () => {
    expect((await pedir('goyo', '/admin/mudar-quell', { method: 'POST', json: { org: MUD }, app: '' })).estado).toBe(403);
    expect((await pedir('mike', '/admin/mudar-quell', { method: 'POST', json: { org: 'no-existe' }, app: '' })).estado).toBe(404);
  });
  it('en seco cuenta todo, casa a la gente con su cuenta y no escribe nada', async () => {
    const r = await pedir('mike', '/admin/mudar-quell', { method: 'POST', json: { org: MUD }, app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.modo).toBe('seco');
    expect(r.data.leidas.quell_elements).toBe(2);
    expect(r.data.despues.quell_elements).toBe(2);
    expect(r.data.despues.quell_etapas).toBe(5); // las cinco de siempre, sin duplicar con la semilla de la 0006
    expect(r.data.personas_con_cuenta).toBe(1);
    expect(r.data.personas_sin_cuenta).toEqual(['viejo@ejemplo.mx']);
    expect(r.data.items_sin_obra).toBe(0); // e-2 la heredó del plano
    expect(r.data.archivos.total).toBe(3);
    // Deshecho: la empresa sigue vacía.
    const obras = await pedir('mike', `/orgs/${MUD}/quell/projects`);
    expect(obras.projects).toEqual([]);
    expect((await e.ARCHIVOS.head(`orgs/${MUD}/quell/plans/p-vieja/pl-1.png`))).toBeNull();
  });
  it('de verdad: filas y archivos llegan, con la misma llave y la misma fecha; el motor los ve; repetirla no duplica', async () => {
    const r = await pedir('mike', '/admin/mudar-quell', { method: 'POST', json: { org: MUD, modo: 'escribir' }, app: '' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.data.archivos.copiados).toBe(3);
    expect(r.data.archivos.fallos).toEqual([]);
    expect(r.data.despues.quell_elements).toBe(2);
    const obras = await pedir('mike', `/orgs/${MUD}/quell/projects`);
    expect(obras.projects.map((p: any) => p.id)).toEqual(['p-vieja']);
    const obra = await pedir('mike', `/orgs/${MUD}/quell/projects/p-vieja`);
    expect(obra.plans[0].image_key).toBe(`orgs/${MUD}/quell/plans/p-vieja/pl-1.png`);
    expect(obra.elements.map((x: any) => x.code).sort()).toEqual(['MW-07', 'PT-03']);
    expect(obra.elements.find((x: any) => x.id === 'e-2').project_id).toBe('p-vieja');
    const item = await pedir('mike', `/orgs/${MUD}/quell/elements/e-1`);
    expect(item.log[0].created_at).toBe('2026-09-07T00:00:00.000Z');
    expect(item.log[0].photos[0].r2_key).toBe(`orgs/${MUD}/quell/photos/log/l-1/f-1.jpg`);
    expect(item.punch[0].assignee_name).toBe('Viejo sin cuenta');
    expect(item.contratistas.map((c: any) => c.name)).toEqual(['Viejo sin cuenta']);
    expect(item.hechas.map((h: any) => h.etapa)).toEqual(['entrega']);
    const bytes = await SELF.fetch(`https://api.local/orgs/${MUD}/quell/files/orgs/${MUD}/quell/plans/p-vieja/pl-1.png`, { headers: { Cookie: galletas.mike, 'X-App': 'quell101' } });
    expect(bytes.status).toBe(200);
    // La cerradura del código sigue puesta sobre lo mudado.
    const choque = await pedir('mike', `/orgs/${MUD}/quell/plans/pl-1/elements`, { method: 'POST', json: { name: 'Otro', type: 'Mueble', code: 'MW-07', x: 0.1, y: 0.1, op_id: crypto.randomUUID() } });
    expect(choque.estado).toBe(409);
    const siguiente = await pedir('mike', `/orgs/${MUD}/quell/plans/pl-1/elements`, { method: 'POST', json: { name: 'Otro', type: 'Mueble', x: 0.1, y: 0.1, op_id: crypto.randomUUID() } });
    expect(siguiente.code).toBe('MW-08');
    const otraVez = await pedir('mike', '/admin/mudar-quell', { method: 'POST', json: { org: MUD, modo: 'escribir' }, app: '' });
    expect(otraVez.data.archivos.ya_estaban).toBe(3);
    expect(otraVez.data.despues.quell_elements).toBe(3); // los dos viejos (mismas llaves) y el nuevo
    expect(otraVez.data.despues.quell_users).toBe(2);
  });
});

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

/* La fecha de entrega, en la obra · contrato 0.40.0
 *
 * Mike, 21-sep: «hay que agregar un campo en el ítem de fecha de entrega y un
 * contador de cuántos días quedan para la entrega».
 *
 * LO QUE DE VERDAD APORTA:
 *
 *   · que la fecha sea UNA SOLA. Se escribe desde la obra y se lee en
 *     `items.fecha_entrega`, que es la misma que ve dash101 y la que el
 *     portal ya le enseña al cliente. Si un día se guardara una copia en el
 *     elemento, esta prueba se pondría roja, y ése es su trabajo;
 *   · que una pieza SIN ítem ligado lo diga en vez de tragarse la fecha;
 *   · que la cuenta de días no se corra por la zona horaria. Es la misma
 *     trampa que nos costó el «un día menos» de los movimientos: una fecha
 *     sin hora no tiene zona;
 *   · que la pueda fijar el supervisor y no cualquiera.
 */
describe('la fecha de entrega del ítem, desde la obra', () => {
  let item = '', suelta = '';

  beforeAll(async () => {
    const negocio = (await pedir('mike', `/orgs/${ORG}/negocios`, { method: 'POST', json: { nombre: 'Taller de la obra' }, app: 'dash101' })).data.id;
    const cliente = (await pedir('mike', `/orgs/${ORG}/clientes`, { method: 'POST', json: { negocio_id: negocio, nombre: 'Quien recibe' }, app: 'dash101' })).data.id;
    const proyecto = (await pedir('mike', `/orgs/${ORG}/proyectos`, { method: 'POST', json: { negocio_id: negocio, cliente_id: cliente, nombre: 'Obra con fechas' }, app: 'dash101' })).data.id;
    item = (await pedir('mike', `/orgs/${ORG}/items`, { method: 'POST', json: {
      negocio_id: negocio, cliente_id: cliente, proyecto_id: proyecto,
      nombre: 'Gradas', monto: 50_000_00, cantidad: 1, estado: 'vendido', tipo: 'mueble',
    }, app: 'dash101' })).data.id;

    await pedir('mike', `/orgs/${ORG}/obras/${obraA}/ligar`, { method: 'POST', json: { proyecto_id: proyecto }, app: 'dash101' });
    const l = await pedir('mike', `/orgs/${ORG}/obras/${obraA}/items`, { method: 'POST', json: { ligar: [{ element_id: m1, item_id: item }] }, app: 'dash101' });
    expect(l.estado, JSON.stringify(l)).toBe(200);
    suelta = m2; // ésta se queda sin ítem a propósito
  });

  it('se fija desde la obra y queda en el ítem, que es donde vive', async () => {
    const r = await q('mike', `/elements/${m1}/entrega`, { method: 'POST', json: { fecha: '2026-10-15', op_id: crypto.randomUUID() } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.fecha_entrega).toBe('2026-10-15');

    /* Leída por donde la lee dash101: la MISMA fila, no una copia. */
    const desdeDash = await pedir('mike', `/orgs/${ORG}/items/${item}`, { app: 'dash101' });
    expect(desdeDash.data.fecha_entrega).toBe('2026-10-15');
  });

  it('y el detalle del ítem en la obra la trae, con la cuenta ya hecha', async () => {
    const d = await q('mike', `/elements/${m1}`);
    expect(d.element.item_fecha_entrega).toBe('2026-10-15');
    /* La cuenta viaja RESUELTA para que la pantalla no la repita: una cuenta
     * copiada en el navegador hereda el reloj del aparato, y un celular con
     * la fecha mal puesta diría que faltan tres días cuando ya venció. */
    const { faltaParaEntrega } = await import('../schema/tipos');
    expect(d.element.item_entrega_falta).toEqual(faltaParaEntrega('2026-10-15'));
    expect(d.element.item_entrega_falta.dice).toMatch(/Faltan|Falta|hoy|Venció|Vencida/);
  });

  it('sin fecha, la cuenta viene en null y no en cero', async () => {
    /* Cero querría decir «se entrega hoy». Sin fecha no se sabe nada, y esa
     * diferencia es la que hace que la pantalla ponga un botón en vez de una
     * alarma. */
    const d = await q('mike', `/elements/${suelta}`);
    expect(d.element.item_entrega_falta).toBe(null);
  });

  it('vaciarla se puede: «todavía no se sabe» es una respuesta', async () => {
    expect((await q('mike', `/elements/${m1}/entrega`, { method: 'POST', json: { fecha: '', op_id: crypto.randomUUID() } })).fecha_entrega).toBe(null);
    expect((await pedir('mike', `/orgs/${ORG}/items/${item}`, { app: 'dash101' })).data.fecha_entrega).toBe(null);
    await q('mike', `/elements/${m1}/entrega`, { method: 'POST', json: { fecha: '2026-10-15', op_id: crypto.randomUUID() } });
  });

  it('una pieza sin ítem ligado lo dice, no se traga la fecha', async () => {
    const r = await q('mike', `/elements/${suelta}/entrega`, { method: 'POST', json: { fecha: '2026-10-15', op_id: crypto.randomUUID() } });
    expect(r.estado).toBe(409);
    expect(String(r.error)).toMatch(/ligada a un ítem/);
  });

  it('una fecha con mala forma se rechaza', async () => {
    expect((await q('mike', `/elements/${m1}/entrega`, { method: 'POST', json: { fecha: '15/10/2026', op_id: crypto.randomUUID() } })).estado).toBe(400);
  });

  it('la fija el supervisor, no el contratista', async () => {
    expect((await q('goyo', `/elements/${m1}/entrega`, { method: 'POST', json: { fecha: '2026-11-01', op_id: crypto.randomUUID() } })).estado).toBe(403);
  });

  it('mandarla dos veces con el mismo op_id no la escribe dos veces', async () => {
    const op = crypto.randomUUID();
    await q('mike', `/elements/${m1}/entrega`, { method: 'POST', json: { fecha: '2026-12-01', op_id: op } });
    const otra = await q('mike', `/elements/${m1}/entrega`, { method: 'POST', json: { fecha: '2026-01-01', op_id: op } });
    expect(otra.repetida).toBe(true);
    expect((await pedir('mike', `/orgs/${ORG}/items/${item}`, { app: 'dash101' })).data.fecha_entrega).toBe('2026-12-01');
  });
});

/* La cuenta de días, que vive en el contrato y no en cada pantalla. */
describe('cuántos días faltan', () => {
  it('cuenta por día y no se corre por la zona horaria', async () => {
    const { diasParaEntrega } = await import('../schema/tipos');
    expect(diasParaEntrega('2026-10-15', '2026-10-15')).toBe(0);
    expect(diasParaEntrega('2026-10-15', '2026-10-14')).toBe(1);
    expect(diasParaEntrega('2026-10-15', '2026-10-18')).toBe(-3);
    /* Cruzando fin de mes y año, que es donde una resta a mano se equivoca. */
    expect(diasParaEntrega('2026-11-01', '2026-10-31')).toBe(1);
    expect(diasParaEntrega('2027-01-01', '2026-12-31')).toBe(1);
    /* Y cruzando el cambio de horario de CDMX: si la cuenta usara horas
     * locales, aquí saldría 0 o 2 en vez de 1. */
    expect(diasParaEntrega('2026-10-26', '2026-10-25')).toBe(1);
    expect(diasParaEntrega(null)).toBe(null);
    expect(diasParaEntrega('mañana')).toBe(null);
  });

  it('y lo dice en palabras iguales para las tres apps', async () => {
    const { faltaParaEntrega } = await import('../schema/tipos');
    expect(faltaParaEntrega('2026-10-15', '2026-10-15')!.dice).toBe('Se entrega hoy');
    expect(faltaParaEntrega('2026-10-15', '2026-10-14')!.dice).toBe('Falta 1 día');
    expect(faltaParaEntrega('2026-10-15', '2026-10-10')!.dice).toBe('Faltan 5 días');
    expect(faltaParaEntrega('2026-10-15', '2026-10-16')!.dice).toBe('Venció ayer');
    expect(faltaParaEntrega('2026-10-15', '2026-10-20')!.dice).toBe('Vencida hace 5 días');
    expect(faltaParaEntrega('2026-10-15', '2026-10-20')!.tarde).toBe(true);
    expect(faltaParaEntrega('2026-10-15', '2026-10-14')!.tarde).toBe(false);
    expect(faltaParaEntrega(null)).toBe(null);
  });
});

/* La documentación del ítem · contrato 0.41.0
 *
 * Mike, 21-sep: «un apartado por ítem de documentación. Subir PDF de planos y
 * de anotaciones adicionales. Quiero que ese PDF pueda tener anotaciones
 * (poder anotar desde el cel o la compu cosas encima). Y después poder
 * actualizar ese PDF a una versión nueva, sin borrar la anterior, pero
 * archivarla (…). Y una opción para ver versiones anteriores por si hay
 * dudas». Y: «hay un archivo base que es el plano o imagen sobre la que están
 * las anotaciones del ítem (…) los demás archivos son de soporte. Sólo en el
 * principal se hacen anotaciones».
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que la versión anterior NO SE BORRE. Es la mitad del encargo y lo
 *     único aquí que no se puede deshacer si se hace mal;
 *   · que lo archivado DEJE DE ESTAR A LA VISTA pero siga pidiéndose. Las
 *     dos cosas: si sólo se escondiera, «ver versiones anteriores» no
 *     existiría; si sólo se guardara, la pantalla se llenaría de repetidos;
 *   · que las MARCAS SE QUEDEN CON SU VERSIÓN. Una nota clavada en un punto
 *     de la revisión vieja puede apuntar a nada en la nueva; que la
 *     archivada conserve las suyas es el registro de lo que se dijo ese día;
 *   · que COPIARLAS sea una decisión de quien sube y no del esquema;
 *   · que SÓLO SE ANOTE EL PRINCIPAL, que es textual de Mike, y que no se
 *     anote una versión archivada: se consulta, no se escribe;
 *   · que el contratista NO suba ni anote documentación del ítem.
 */
describe('la documentación del ítem', () => {
  let principal = '', soporte = '', v2 = '';
  const pdf = (nombre: string) => new File([PNG], nombre, { type: 'application/pdf' });

  const subir = (quien: string, eid: string, campos: Record<string, string | Blob>) =>
    q(quien, `/elements/${eid}/docs`, { method: 'POST', body: forma(campos) });

  it('se sube el plano principal del ítem', async () => {
    const r = await subir('mike', m1, { archivo: pdf('plano-gradas.pdf'), rol: 'principal', nombre: 'Plano de las gradas', paginas: '3' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    principal = r.doc.id;
    expect(r.doc.rol).toBe('principal');
    expect(r.doc.version).toBe(1);
    expect(r.doc.paginas).toBe(3);
    expect(r.doc.familia_id, 'la primera versión estrena su familia').toBe(principal);
  });

  it('y los de soporte, que son los que acompañan', async () => {
    const r = await subir('mike', m1, { archivo: pdf('herrajes.pdf'), rol: 'soporte', nombre: 'Ficha de herrajes' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    soporte = r.doc.id;
    const d = await q('mike', `/elements/${m1}/docs`);
    expect(d.principal.id).toBe(principal);
    expect(d.soporte.map((x: any) => x.id)).toEqual([soporte]);
  });

  it('un segundo principal NO se cuela: se dice que use versión nueva', async () => {
    const r = await subir('mike', m1, { archivo: pdf('otro.pdf'), rol: 'principal' });
    expect(r.estado).toBe(409);
    expect(String(r.error)).toMatch(/versión nueva/);
  });

  it('se anota encima: una nota anclada y un trazo', async () => {
    const nota = await q('mike', `/docs/${principal}/marcas`, { method: 'POST', json: {
      tipo: 'nota', pagina: 1, x: 0.3, y: 0.42, texto: 'Falta la medida de la huella', op_id: crypto.randomUUID(),
    } });
    expect(nota.estado, JSON.stringify(nota)).toBe(200);
    const trazo = await q('mike', `/docs/${principal}/marcas`, { method: 'POST', json: {
      tipo: 'trazo', pagina: 1, trazo: [[0.1, 0.1], [0.2, 0.15], [0.3, 0.1]], color: '#D33A2F', op_id: crypto.randomUUID(),
    } });
    expect(trazo.estado, JSON.stringify(trazo)).toBe(200);
    expect(trazo.marcas).toHaveLength(2);
    const t = trazo.marcas.find((x: any) => x.tipo === 'trazo');
    expect(t.trazo, 'el trazo viaja como lista de puntos, ya convertido').toEqual([[0.1, 0.1], [0.2, 0.15], [0.3, 0.1]]);
    expect(t.quien, 'y se sabe quién lo hizo').toBeTruthy();
  });

  it('las coordenadas se recortan: nada se pinta fuera del papel', async () => {
    const r = await q('mike', `/docs/${principal}/marcas`, { method: 'POST', json: {
      tipo: 'nota', x: 1.8, y: -3, texto: 'Fuera de la hoja', op_id: crypto.randomUUID(),
    } });
    const puesta = r.marcas.find((x: any) => x.texto === 'Fuera de la hoja');
    expect(puesta.x).toBe(1);
    expect(puesta.y).toBe(0);
  });

  it('una nota sin texto y un trazo de un punto no son marcas', async () => {
    expect((await q('mike', `/docs/${principal}/marcas`, { method: 'POST', json: { tipo: 'nota', x: 0.1, y: 0.1, texto: '  ', op_id: crypto.randomUUID() } })).estado).toBe(400);
    expect((await q('mike', `/docs/${principal}/marcas`, { method: 'POST', json: { tipo: 'trazo', trazo: [[0.1, 0.1]], op_id: crypto.randomUUID() } })).estado).toBe(400);
  });

  it('sólo se anota el PRINCIPAL; el de soporte no', async () => {
    const r = await q('mike', `/docs/${soporte}/marcas`, { method: 'POST', json: { tipo: 'nota', x: 0.5, y: 0.5, texto: 'No va aquí', op_id: crypto.randomUUID() } });
    expect(r.estado).toBe(409);
    expect(String(r.error)).toMatch(/principal/);
  });

  it('la versión nueva ARCHIVA la anterior y no la borra', async () => {
    const r = await q('mike', `/docs/${principal}/version`, { method: 'POST', body: forma({ archivo: pdf('plano-gradas-r2.pdf'), nombre: 'Plano de las gradas · rev. B' }) });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    v2 = r.doc.id;
    expect(r.doc.version).toBe(2);
    expect(r.doc.familia_id, 'sigue siendo la misma familia').toBe(principal);
    expect(r.copiadas, 'sin pedirlo, las marcas NO se copian').toBe(0);

    /* A la vista queda sólo la nueva. */
    const d = await q('mike', `/elements/${m1}/docs`);
    expect(d.principal.id).toBe(v2);
    expect(d.marcas, 'la versión nueva empieza limpia').toHaveLength(0);
  });

  it('y la anterior se puede consultar, con lo que se marcó sobre ella', async () => {
    const vs = await q('mike', `/docs/${v2}/versiones`);
    expect(vs.estado, JSON.stringify(vs)).toBe(200);
    expect(vs.versiones.map((x: any) => x.version)).toEqual([2, 1]);
    const vieja = vs.versiones.find((x: any) => x.version === 1);
    expect(vieja.archivado_at, 'la vieja quedó archivada').toBeTruthy();
    expect(vieja.n_marcas, 'y conserva sus marcas').toBe(3);

    const marcas = await q('mike', `/docs/${principal}/marcas`);
    expect(marcas.marcas).toHaveLength(3);
  });

  it('una versión archivada se consulta, no se anota', async () => {
    const r = await q('mike', `/docs/${principal}/marcas`, { method: 'POST', json: { tipo: 'nota', x: 0.2, y: 0.2, texto: 'Tarde', op_id: crypto.randomUUID() } });
    expect(r.estado).toBe(409);
    expect(String(r.error)).toMatch(/archivada/);
  });

  it('copiar las marcas al subir es una decisión de quien sube', async () => {
    await q('mike', `/docs/${v2}/marcas`, { method: 'POST', json: { tipo: 'nota', x: 0.6, y: 0.6, texto: 'Revisar el barandal', op_id: crypto.randomUUID() } });
    const r = await q('mike', `/docs/${v2}/version`, { method: 'POST', body: forma({ archivo: pdf('rev-c.pdf'), copiar_marcas: '1' }) });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.copiadas).toBe(1);
    const d = await q('mike', `/elements/${m1}/docs`);
    expect(d.principal.version).toBe(3);
    expect(d.marcas.map((x: any) => x.texto)).toEqual(['Revisar el barandal']);
  });

  it('borrar una marca la esconde, y la lista queda al día', async () => {
    const d = await q('mike', `/elements/${m1}/docs`);
    const mk = d.marcas[0];
    const r = await q('mike', `/marcas/${mk.id}/borrar`, { method: 'POST', json: { op_id: crypto.randomUUID() } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.marcas).toHaveLength(0);
  });

  it('el principal no se archiva a mano: se reemplaza', async () => {
    const d = await q('mike', `/elements/${m1}/docs`);
    const r = await q('mike', `/docs/${d.principal.id}/archivar`, { method: 'POST', json: { op_id: crypto.randomUUID() } });
    expect(r.estado).toBe(409);
    expect(String(r.error)).toMatch(/versión nueva/);
  });

  it('un archivo de soporte sí se quita de la vista', async () => {
    const r = await q('mike', `/docs/${soporte}/archivar`, { method: 'POST', json: { op_id: crypto.randomUUID() } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect((await q('mike', `/elements/${m1}/docs`)).soporte).toHaveLength(0);
  });

  it('el contratista no sube ni anota documentación', async () => {
    expect((await subir('goyo', m1, { archivo: pdf('mio.pdf'), rol: 'soporte' })).estado).toBe(403);
    const d = await q('mike', `/elements/${m1}/docs`);
    expect((await q('goyo', `/docs/${d.principal.id}/marcas`, { method: 'POST', json: { tipo: 'nota', x: 0.1, y: 0.1, texto: 'x', op_id: crypto.randomUUID() } })).estado).toBe(403);
  });

  it('pero sí la puede LEER: es el plano de lo que va a fabricar', async () => {
    const d = await q('goyo', `/elements/${m1}/docs`);
    expect(d.estado, JSON.stringify(d)).toBe(200);
    expect(d.principal).toBeTruthy();
  });

  it('un documento de otra empresa no se abre', async () => {
    /* Quien no pertenece a la empresa ni siquiera llega a esta ruta: la
     * puerta de la suite lo para antes con un 401 porque no tiene sesión
     * aquí. Si algún día entrara con sesión pero sin la obra, el motor
     * contestaría 403. Las dos son «no pasas»; lo que no puede pasar
     * nunca es un 200 con el plano de otro. */
    const r = await q('fuera', `/docs/${principal}/versiones`);
    expect([401, 403], JSON.stringify(r)).toContain(r.estado);
  });
});

/* EL REQUERIMIENTO: UN TIPO QUE TODAVÍA NO ENTRA EN PRODUCCIÓN
 *
 * Mike, 22-sep-2026: «necesito el botón de agregar requerimiento (que es el
 * ítem que apenas se va a aprobar y a cotizar) dentro de quell», y luego,
 * aclarando: «el requerimiento es un tipo de ítem pero que aún está en
 * revisión. Sí aparece en mapa, sí aparece en ítems, pero está pendiente de
 * cotizarse y autorizarse para entrar en producción».
 *
 * Los tipos quedaron en mueble, puerta, acabado y servicio, más éste.
 *
 * QUÉ CUIDAN ESTAS PRUEBAS
 *
 * Las dos mitades de la frase de Mike, que tiran para lados contrarios:
 *
 *   · «sí aparece en mapa, sí aparece en ítems» — un requerimiento NO se
 *     esconde. Es la diferencia con un `no_aprobado`, que en quell sólo sale
 *     si pides la vista de fuera de alcance (regla del 20-sep). Si alguien
 *     lo escondiera «por consistencia», Mike dejaría de ver lo que levantó.
 *
 *   · «pendiente de … para entrar en producción» — y ahí sí se frena. La
 *     regla vive en `marcaEtapa`, que es el cuello por donde pasan los DOS
 *     caminos que mueven un ítem: `/etapa` y `/fase`. Se prueban los dos por
 *     separado a propósito: taparlos en la pantalla habría dejado la puerta
 *     abierta desde la app de Android empacada, que trae su propia copia.
 *
 * Lo que se protege no es una etiqueta: marcar «comprado» o «fletado» en
 * algo que nadie cotizó ni autorizó es empezar a gastar en una pieza que el
 * cliente todavía puede rechazar.
 */
describe('el requerimiento, que está en revisión', () => {
  let rq = '';
  const alta = (cuerpo: Record<string, unknown>) =>
    q('mike', `/plans/${pa}/elements`, { method: 'POST', json: { op_id: crypto.randomUUID(), ...cuerpo } });

  it('se levanta desde la obra y estrena su propio prefijo', async () => {
    const r = await alta({ name: 'Clóset que pidió el cliente', type: 'Requerimiento', x: 0.44, y: 0.44 });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.code, 'RQ- para que en el plano se vea qué está pedido y qué vendido').toBe('RQ-01');
    rq = r.id;
    const otro = await alta({ name: 'Otro más', type: 'Requerimiento', x: 0.45, y: 0.45 });
    expect(otro.code).toBe('RQ-02');
  });

  it('un servicio también tiene el suyo', async () => {
    const r = await alta({ name: 'Instalación en sitio', type: 'Servicio', x: 0.46, y: 0.46 });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.code).toBe('SV-01');
  });

  it('SÍ sale en el plano y en la lista, como cualquier otro', async () => {
    /* Ésta es la mitad que se pierde si alguien lo trata como un
     * `no_aprobado`: aquéllos se esconden salvo en la vista de fuera de
     * alcance. Un requerimiento no. */
    const obra = await q('mike', `/projects/${obraA}`);
    expect(obra.estado).toBe(200);
    const suyo = obra.elements.find((e: any) => e.id === rq);
    expect(suyo, 'el requerimiento viaja con los demás elementos del plano').toBeTruthy();
    expect(suyo.type).toBe('Requerimiento');
    expect(suyo.alcance ?? 'dentro', 'y no se esconde detrás del filtro de alcance').toBe('dentro');
  });

  it('pero NO se le puede marcar una etapa: está pendiente de cotizarse y autorizarse', async () => {
    const etapas = await q('mike', `/elements/${rq}`);
    expect(etapas.estado).toBe(200);
    const primera = (etapas.etapas || [])[0];
    expect(primera, 'la obra tiene etapas configuradas').toBeTruthy();
    const r = await q('mike', `/elements/${rq}/etapas`, { method: 'POST', json: { clave: primera.clave, hecha: true, op_id: crypto.randomUUID() } });
    expect(r.estado, JSON.stringify(r)).toBe(400);
    expect(r.error).toMatch(/requerimiento/i);
    expect(r.error, 'y el mensaje dice qué hacer, no sólo que no').toMatch(/cámbiale el tipo/i);
  });

  it('ni entregarse, que es el otro camino a producción', async () => {
    const r = await q('mike', `/elements/${rq}/fase`, { method: 'POST', json: { fase: 'punchlist', op_id: crypto.randomUUID() } });
    expect(r.estado, JSON.stringify(r)).toBe(400);
    expect(r.error).toMatch(/requerimiento/i);
  });

  it('en cuanto se aprueba y se le cambia el tipo, entra a producción sin volver a capturarlo', async () => {
    /* El requerimiento no se borra ni se recaptura: se le cambia el tipo a
     * lo que de verdad es, y con eso conserva su pin, su bitácora y sus
     * fotos. Ésa es toda la ventaja de que sea un tipo y no otra tabla. */
    const cambio = await q('mike', `/elements/${rq}`, { method: 'PATCH', json: { type: 'Mueble' } });
    expect(cambio.estado, JSON.stringify(cambio)).toBe(200);
    const d = await q('mike', `/elements/${rq}`);
    expect(d.element.type).toBe('Mueble');
    const primera = (d.etapas || [])[0];
    const r = await q('mike', `/elements/${rq}/etapas`, { method: 'POST', json: { clave: primera.clave, hecha: true, op_id: crypto.randomUUID() } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
  });

  it('y la regla no se cuela por cómo se escriba el tipo', async () => {
    /* `type` es texto libre en la columna: basta que otra pantalla guarde
     * «requerimiento» en minúscula para que una comparación con `===` deje
     * de frenar. Por eso se compara con `esRequerimiento`, que normaliza. */
    const r = await alta({ name: 'En minúscula', type: 'requerimiento', x: 0.47, y: 0.47 });
    expect(r.estado).toBe(200);
    const d = await q('mike', `/elements/${r.id}`);
    const primera = (d.etapas || [])[0];
    const marca = await q('mike', `/elements/${r.id}/etapas`, { method: 'POST', json: { clave: primera.clave, hecha: true, op_id: crypto.randomUUID() } });
    expect(marca.estado, JSON.stringify(marca)).toBe(400);
  });
});

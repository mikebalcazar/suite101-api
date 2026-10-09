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
import { correoDePuntos, sitioPeek } from '../src/quell/motor.js';
import { finDe, laborablesEntre, programar, siguienteLaborable, sumarLaborables } from '../src/quell/cronograma.js';

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
    expect((await q('goyo', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo], op_id: crypto.randomUUID() } })).estado).toBe(403);
  });
  it('0.54.1 · un contratista que no está en la obra entra a la obra al asignarlo desde el ítem', async () => {
    // Antes de 0.54.1 esto era 400 «Primero dale acceso a la obra». Mike
    // (30-sep, Holcim) escogió que el ítem lo haga en un solo paso.
    const antes = await q('mike', `/projects/${obraA}`);
    expect(antes.members.some((x: any) => x.id === ids.fuera)).toBe(false);
    const fuera = await q('mike', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo, ids.berna, ids.fuera], op_id: crypto.randomUUID() } });
    expect(fuera.estado, JSON.stringify(fuera)).toBe(200);
    expect(fuera.contratistas.map((c: any) => c.name).sort()).toEqual(['Berna', 'Fuera', 'Goyo']);
    expect(fuera.entraron_a_la_obra.map((x: any) => x.name)).toEqual(['Fuera']);
    const despues = await q('mike', `/projects/${obraA}`);
    const enObra = despues.members.find((x: any) => x.id === ids.fuera);
    expect(enObra && enObra.rol_obra).toBe('con');
    // Volverlo a mandar no lo vuelve a meter (ni le manda otro correo).
    const otraVez = await q('mike', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo, ids.berna, ids.fuera], op_id: crypto.randomUUID() } });
    expect(otraVez.entraron_a_la_obra).toEqual([]);
    // Y se deja como estaba para lo que sigue: Goyo y Berna nada más.
    const limpia = await q('mike', `/elements/${m1}/contratistas`, { method: 'PUT', json: { user_ids: [ids.goyo, ids.berna], op_id: crypto.randomUUID() } });
    expect(limpia.contratistas.length).toBe(2);
    await q('mike', `/projects/${obraA}/members/${ids.fuera}`, { method: 'DELETE' });
    expect((await q('mike', `/projects/${obraA}`)).members.some((x: any) => x.id === ids.fuera)).toBe(false);
  });
  it('0.54.1 · GET /contratistas: los de la empresa, para quien dirige', async () => {
    const lista = await q('mike', '/contratistas');
    expect(lista.estado, JSON.stringify(lista)).toBe(200);
    const nombres = lista.contratistas.map((c: any) => c.name);
    expect(nombres).toEqual(expect.arrayContaining(['Goyo', 'Berna', 'Fuera']));
    expect(nombres).not.toContain('Mike');
    expect(lista.contratistas[0]).not.toHaveProperty('email');
    expect((await q('goyo', '/contratistas')).estado).toBe(403);
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
  it('0.90.2 · el pendiente se reasigna o se deja sin asignar después de creado', async () => {
    // Mike, 9-oct: «una vez creado el ítem de punchlist no puedo editar a quien se le asigna».
    const k = (await q('mike', `/elements/${m2}`)).punch.find((x: any) => x.title === 'Herraje flojo');
    expect(k?.assignee_id).toBe(ids.tema);
    const patch = (quien: string, cuerpo: any) => q(quien, `/punch/${k.id}`, { method: 'PATCH', json: { ...cuerpo, op_id: crypto.randomUUID() } });
    expect((await patch('mike', { assignee_id: ids.berna })).estado).toBe(200);
    const aBerna = (await q('mike', `/elements/${m2}`)).punch.find((x: any) => x.id === k.id);
    expect(aBerna.assignee_id, 'pasó a Berna').toBe(ids.berna);
    expect((await q('tema', `/elements/${m2}`)).recorte, 'Tema ya no lo ve completo').toBe(true);
    expect((await q('berna', `/elements/${m2}`)).punch.some((x: any) => x.id === k.id), 'Berna sí').toBe(true);
    // Otro campo sin assignee_id no lo toca.
    expect((await patch('mike', { title: 'Herraje flojo (puerta 2)' })).estado).toBe(200);
    expect((await q('mike', `/elements/${m2}`)).punch.find((x: any) => x.id === k.id).assignee_id).toBe(ids.berna);
    // Vacío, a propósito: sin asignar.
    expect((await patch('mike', { assignee_id: '' })).estado).toBe(200);
    expect((await q('mike', `/elements/${m2}`)).punch.find((x: any) => x.id === k.id).assignee_id ?? null).toBe(null);
    // Alguien que no está en la obra, no; el contratista no reasigna.
    expect((await patch('mike', { assignee_id: ids.fuera })).estado).toBe(400);
    expect((await patch('goyo', { assignee_id: ids.goyo })).estado).toBe(403);
    // Como estaba, para lo que sigue.
    expect((await patch('mike', { assignee_id: ids.tema, title: 'Herraje flojo' })).estado).toBe(200);
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
    // 0.65.0: el correo ya es de un cliente: la bitácora pregunta antes (409 con quién es)…
    const pregunta = await q('mike', '/clientes/invitar', { method: 'POST', json: { email: CLIENTE.correo, name: 'Renombrado', project_ids: [obraA, obraB] } });
    expect(pregunta.estado, JSON.stringify(pregunta)).toBe(409);
    expect(pregunta.error).toBe('correo_en_uso');
    expect(pregunta.cliente.correo).toBe(CLIENTE.correo);
    expect((await q('mike', '/clientes')).clientes.length).toBe(1);
    // …y con `usar_existente` lo usa.
    const otraVez = await q('mike', '/clientes/invitar', { method: 'POST', json: { email: CLIENTE.correo, name: 'Renombrado', project_ids: [obraA, obraB], usar_existente: true } });
    expect(otraVez.estado, JSON.stringify(otraVez)).toBe(200);
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
    /* Mike, 1-oct-2026: el correo trae el texto de cada punto, con su pieza,
     * y abajo «Responder» con la liga a los puntos de la obra. */
    /* 5-oct: el portal del cliente es peek101. La liga va a la obra en peek
     * (`#/obra/OBRA`), y la dirección de peek se deduce de la de quell. */
    expect(aviso.liga).toMatch(new RegExp(`^https://peek101[^/]*/#/obra/${obraA}$`));
    expect(sitioPeek('https://quell101.taller101.com')).toBe('https://peek101.taller101.com');
    expect(sitioPeek('https://quell101.acme.com.mx')).toBe('https://peek101.acme.com.mx');
    expect(sitioPeek('https://bitacora-obra-staging.mike-929.workers.dev')).toBe('https://peek101-staging.mike-929.workers.dev');
    expect(sitioPeek('')).toBe('https://peek101.taller101.com');
    expect(aviso.dudas).toEqual([{ texto: '¿De qué color va el mueble de TV?', pieza: expect.stringMatching(/^[A-Z]+-\d+ · /) }]);
    const correo = correoDePuntos({ sitio: 'https://peek101.taller101.com', quien: { name: 'Cliente' }, obra: { id: obraA, name: 'Obra <A>' }, dudas: aviso.dudas });
    expect(correo.asunto).toBe('1 punto por definir en Obra <A>');
    expect(correo.html).toContain('¿De qué color va el mueble de TV?');
    expect(correo.html).toContain(aviso.dudas[0].pieza);
    expect(correo.html).toContain(`<a href="https://peek101.taller101.com/#/obra/${obraA}"`);
    expect(correo.html).toMatch(/>Responder<\/a>/);
    expect(correo.html, 'el nombre de la obra va escapado').toContain('Obra &lt;A&gt;');
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

  /* 0.90.0 · Mike, 9-oct: «desde quell quiero poder marcar que el diseño ya
   * está definido y poder adjuntar un plano (pdf) o imagen del diseño
   * definido». Con botones: el archivo va APARTE, sin tocar el principal. */
  let diseno1 = '';
  it('el diseño definido se fecha y se adjunta en un paso, aparte del principal', async () => {
    const antes = await q('mike', `/elements/${m1}/docs`);
    const r = await subir('mike', m1, { archivo: pdf('diseno-gradas.pdf'), diseno: '1', diseno_definido: '2026-10-09', nombre: 'Diseño de las gradas', paginas: '2' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    diseno1 = r.doc.id;
    expect(r.doc.rol, 'es de soporte, no el principal').toBe('soporte');
    expect(r.doc.diseno).toBe(1);
    expect(r.diseno_definido).toBe('2026-10-09');
    const d = await q('mike', `/elements/${m1}/docs`);
    expect(d.principal.id, 'el principal no se toca').toBe(antes.principal.id);
    expect(d.soporte.find((x: any) => x.id === diseno1)?.diseno).toBe(1);
    const el = await q('mike', `/elements/${m1}`);
    expect(el.element.diseno_definido, 'y la pieza queda fechada (candado del cronograma)').toBe('2026-10-09');
    expect(el.element.diseno_doc?.id, 'el detalle trae el archivo del diseño').toBe(diseno1);
    expect(el.element.diseno_doc?.r2_key, 'con su llave, para abrirlo').toBeTruthy();
  });

  it('otro diseño es versión nueva del anterior: el viejo se archiva, no se borra', async () => {
    const r = await subir('mike', m1, { archivo: pdf('diseno-gradas-b.pdf'), diseno: '1', diseno_definido: '2026-10-12' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.archivada).toBe(diseno1);
    expect(r.doc.version).toBe(2);
    expect(r.doc.familia_id).toBe(diseno1);
    const d = await q('mike', `/elements/${m1}/docs`);
    expect(d.soporte.filter((x: any) => x.diseno === 1).map((x: any) => x.id), 'uno vivo').toEqual([r.doc.id]);
    const vs = await q('mike', `/docs/${r.doc.id}/versiones`);
    expect(vs.versiones.map((v: any) => v.id)).toEqual([r.doc.id, diseno1]);
    expect((await q('mike', `/elements/${m1}`)).element.diseno_definido).toBe('2026-10-12');
  });

  it('una fecha mala no pasa, y el contratista no marca el diseño', async () => {
    expect((await subir('mike', m1, { archivo: pdf('x.pdf'), diseno: '1', diseno_definido: '9/10/26' })).estado).toBe(400);
    expect((await subir('goyo', m1, { archivo: pdf('x.pdf'), diseno: '1' })).estado).toBe(403);
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

  it('0.56.0 · un subítem: nace como requerimiento colgado de la pieza, y su ítem cuelga del ítem de la pieza', async () => {
    /* Mike, 30-sep: «trabajos o servicios que se le hacen complementarios a
     * un ítem (…) deben de nacer como requerimientos nuevos, pero ligados
     * al ítem al que se le aplica». m1 ya es un ítem vendido (se ligó en
     * «la obra y el proyecto»), así que el requerimiento nuevo debe colgar
     * de ese ítem, no sólo de la pieza. */
    const padre = await q('mike', `/elements/${m1}`);
    expect(padre.estado).toBe(200);
    expect(padre.element.item_id, 'm1 es un ítem vendido').toBeTruthy();
    const r = await alta({ name: 'Cajón extra que pidió el cliente', type: 'Requerimiento', x: 0.47, y: 0.47, padre_id: m1 });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.padre_id).toBe(m1);
    expect(r.code).toBe('RQ-03');
    expect(r.item_id, 'la obra está ligada: el requerimiento también es ítem').toBeTruthy();
    const item = await pedir('mike', `/orgs/${ORG}/items/${r.item_id}`, { app: 'dash101' });
    expect(item.estado).toBe(200);
    expect(item.data.padre_id, 'el ítem del subítem cuelga del ítem de la pieza padre').toBe(padre.element.item_id);
    expect(item.data.tipo).toBe('requerimiento');
    // Los subítems se pueden pedir por padre desde dash101, y viajan con los elementos de la obra.
    const hijos = await pedir('mike', `/orgs/${ORG}/items?padre_id=${padre.element.item_id}`, { app: 'dash101' });
    expect(hijos.data.filas.map((x: any) => x.id)).toEqual([r.item_id]);
    const obra = await q('mike', `/projects/${obraA}`);
    const pieza = obra.elements.find((e: any) => e.id === r.id);
    expect(pieza.padre_id).toBe(m1);
    // Un padre que no es de esta obra (o no existe) no vale.
    const ajena = await alta({ name: 'Colado', type: 'Requerimiento', x: 0.1, y: 0.1, padre_id: 'pieza-de-otra-obra' });
    expect(ajena.estado, JSON.stringify(ajena)).toBe(400);
    expect(ajena.error).toMatch(/padre/);
  });

  it('un servicio también tiene el suyo', async () => {
    const r = await alta({ name: 'Instalación en sitio', type: 'Servicio', x: 0.46, y: 0.46 });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.code).toBe('SV-01');
  });

  it('viaja con los demás elementos del plano, marcado FUERA del alcance', async () => {
    /* 0.64.1 · Mike, 2-oct: «se genera como requerimiento (fuera de
     * alcance)». La API no lo esconde —viaja con todo lo demás— pero lo
     * marca fuera, para que la vista de fuera de alcance de la obra lo
     * enseñe. Esconderlo o no es de la pantalla, que al levantarlo pasa el
     * filtro a «Todos». */
    const obra = await q('mike', `/projects/${obraA}`);
    expect(obra.estado).toBe(200);
    const suyo = obra.elements.find((e: any) => e.id === rq);
    expect(suyo, 'el requerimiento viaja con los demás elementos del plano').toBeTruthy();
    expect(suyo.type).toBe('Requerimiento');
    expect(suyo.alcance, 'y la API lo marca fuera del alcance').toBe('fuera');
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

/* peek101 junta lo del cliente · contrato 0.66.0
 *
 * Mike, 4-oct-2026: «para el cliente es muy tedioso irse metiendo a diferentes
 * plataformas para ver diferente información. Juntemos dentro de Peek la info
 * de su estado de cuenta y la info que le aparece en quell (…) al cliente sí
 * le debe aparecer el precio de cada ítem cuando lo selecciona en quell (…) en
 * su pantalla de inicio de Peek debe estar hasta arriba la lista de las dudas
 * que tiene que responder».
 *
 * LO QUE DE VERDAD APORTA:
 *
 *   · que /peek diga de cada proyecto cuál es su obra en quell, de cada ítem
 *     qué pieza del plano le cuelga y cuántos planos tiene, y arriba los
 *     puntos que el taller le pidió definir —y NO los que él mismo preguntó—;
 *   · que el cliente vea el precio de SU pieza en quell y pueda leer su
 *     documentación, pero siga sin poder subir ni anotar;
 *   · que un cliente de la suite al que nadie invitó desde quell entre a la
 *     obra ligada a su proyecto, y a ninguna otra: el mismo cliente en las
 *     tres apps es también la misma puerta;
 *   · que el estado de cuenta general lo abra el propio cliente, y sólo el suyo.
 */
describe('peek101 junta lo del cliente (0.66.0)', () => {
  let clienteId = '', proyecto = '', item = '', punto = '', miDuda = '';
  let cliente2 = '', proyecto2 = '', obraC = '';
  const OTRO = { correo: 'solo-suite@ejemplo.mx', nombre: 'Sólo en la suite' };

  beforeAll(async () => {
    const lista = await pedir('mike', `/orgs/${ORG}/clientes`, { app: 'dash101' });
    clienteId = lista.data.filas.find((f: any) => f.correo === CLIENTE.correo).id;
    /* La obra A ya quedó ligada arriba («Obra con fechas», con la pieza m1
     * colgada del ítem «Gradas» de $50,000). Ese proyecto se le pasa al
     * cliente invitado: así es SU proyecto, su obra y su pieza. */
    proyecto = (await q('mike', `/projects/${obraA}`)).project.proyecto_id;
    expect(proyecto, 'la obra A viene ligada de las pruebas de la fecha de entrega').toBeTruthy();
    const pasa = await pedir('mike', `/orgs/${ORG}/proyectos/${proyecto}`, { app: 'dash101', method: 'PATCH', json: { cliente_id: clienteId } });
    expect(pasa.estado, JSON.stringify(pasa)).toBe(200);
    item = (await q('mike', `/elements/${m1}`)).element.item_id;
    expect(item).toBeTruthy();
    const mueve = await pedir('mike', `/orgs/${ORG}/items/${item}`, { app: 'dash101', method: 'PATCH', json: { cliente_id: clienteId } });
    expect(mueve.estado, JSON.stringify(mueve)).toBe(200);
    // Un punto del taller para el cliente, sobre esa pieza, y una pregunta del propio cliente.
    punto = (await q('mike', `/projects/${obraA}/dudas`, { method: 'POST', body: forma({ texto: '¿El mueble de TV lleva zoclo?', element_id: m1, para: 'cliente' }) })).id;
    miDuda = (await q('cliente', `/projects/${obraA}/dudas`, { method: 'POST', body: forma({ texto: '¿Cuándo lo instalan?', element_id: m1 }) })).id;
    expect(punto && miDuda).toBeTruthy();
  }, 60000);

  it('/peek trae la obra del proyecto, la pieza de cada ítem con sus planos, y los puntos por definir', async () => {
    const r = await pedir('cliente', `/orgs/${ORG}/peek`, { app: 'peek101' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const p = r.data.proyectos.find((x: any) => x.id === proyecto);
    expect(p.obra).toEqual({ id: obraA, nombre: 'Obra de prueba A', estado: expect.any(String) });
    const i = p.items.find((x: any) => x.id === item);
    expect(i.piezas).toHaveLength(1);
    // Cuántos planos vivos tiene la pieza: los mismos que ve el taller (el de soporte se archivó arriba).
    const vivos = await q('mike', `/elements/${m1}/docs`);
    const cuantos = (vivos.principal ? 1 : 0) + vivos.soporte.length;
    expect(cuantos).toBeGreaterThan(0);
    expect(i.piezas[0]).toMatchObject({ id: m1, obra_id: obraA, docs: cuantos });
    expect(i.piezas[0].codigo).toMatch(/^[A-Z]+-\d+$/);
    // Los pendientes: el del taller sí; la pregunta del cliente no es algo que él tenga que responder.
    const ids = r.data.pendientes.map((d: any) => d.id);
    expect(ids).toContain(punto);
    expect(ids).not.toContain(miDuda);
    const d = r.data.pendientes.find((x: any) => x.id === punto);
    expect(d).toMatchObject({ obra_id: obraA, obra: 'Obra de prueba A', element_id: m1, pieza: expect.any(String), texto: '¿El mueble de TV lleva zoclo?' });
    expect(d.codigo).toMatch(/^[A-Z]+-\d+$/);
    expect(d.quien).toBeTruthy();
    // La más vieja primero.
    const fechas = r.data.pendientes.map((x: any) => x.created_at);
    expect([...fechas].sort()).toEqual(fechas);
    // Y sigue sin traer nada de costos.
    expect(JSON.stringify(r.data)).not.toMatch(/pagado_prov|compromiso|partida/);
  });

  it('el cliente ve el precio de su pieza y lee su documentación; subir y anotar siguen siendo del taller', async () => {
    const e = await q('cliente', `/elements/${m1}`);
    expect(e.estado, JSON.stringify(e)).toBe(200);
    expect(e.cliente).toBe(true);
    expect(e.element.item_monto).toBe(50_000_00);
    expect(e.element.item_id).toBe(item);
    expect('item_etapa' in e.element).toBe(true);
    expect(e.punch).toEqual([]);
    expect(e.log).toEqual([]);
    expect('fase' in e.element).toBe(false);
    const docs = await q('cliente', `/elements/${m1}/docs`);
    expect(docs.estado, JSON.stringify(docs)).toBe(200);
    expect(docs.principal.rol).toBe('principal');
    expect(Array.isArray(docs.soporte)).toBe(true);
    expect(Array.isArray(docs.marcas)).toBe(true);
    expect((await q('cliente', `/docs/${docs.principal.id}/marcas`)).estado).toBe(200);
    expect((await q('cliente', `/docs/${docs.principal.id}/versiones`)).estado).toBe(200);
    expect((await q('cliente', `/elements/${m1}/docs`, { method: 'POST', body: forma({ archivo: new File([PNG], 'x.pdf', { type: 'application/pdf' }), rol: 'soporte' }) })).estado).toBe(403);
    expect((await q('cliente', `/docs/${docs.principal.id}/marcas`, { method: 'POST', json: { tipo: 'nota', pagina: 1, x: 0.5, y: 0.5, texto: 'me colé', op_id: crypto.randomUUID() } })).estado).toBe(403);
    // El contratista sigue sin ver el precio: el cambio es para el cliente, no para la obra.
    const g = await q('goyo', `/elements/${m1}`);
    expect(g.estado).toBe(200);
    expect('item_monto' in g.element).toBe(false);
  });

  it('un cliente de la suite al que nadie invitó desde quell entra a la obra ligada a su proyecto, y a ninguna otra', async () => {
    const inv = await pedir('mike', `/orgs/${ORG}/clientes/invitar`, { app: 'dash101', method: 'POST', json: { correo: OTRO.correo, nombre: OTRO.nombre } });
    expect(inv.estado, JSON.stringify(inv)).toBe(201);
    cliente2 = inv.data.cliente_id;
    proyecto2 = (await pedir('mike', `/orgs/${ORG}/proyectos`, { app: 'dash101', method: 'POST', json: { cliente_id: cliente2, nombre: 'Departamento' } })).data.id;
    obraC = (await q('mike', '/projects', { method: 'POST', json: { name: 'Obra de prueba C', client: OTRO.nombre } })).id;
    expect((await pedir('mike', `/orgs/${ORG}/obras/${obraC}/ligar`, { app: 'dash101', method: 'POST', json: { proyecto_id: proyecto2 } })).estado).toBe(200);
    expect((await q('mike', '/clientes')).clientes.some((c: any) => c.email === OTRO.correo), 'nadie lo invitó desde quell').toBe(false);

    await entrar('cli2', OTRO.correo);
    const yo = await q('cli2', '/me');
    expect(yo.estado, JSON.stringify(yo)).toBe(200);
    expect(yo.user.role).toBe('cli');
    const obras = await q('cli2', '/projects');
    expect(obras.projects.map((p: any) => p.id)).toEqual([obraC]);
    expect((await q('cli2', `/projects/${obraC}`)).estado).toBe(200);
    expect((await q('cli2', `/projects/${obraA}`)).estado).toBe(403);
    expect((await q('cli2', `/elements/${m1}`)).estado).toBe(403);
    // Y el primer cliente ahora ve la obra A dos veces no: una sola, aunque esté apuntado Y ligado.
    const delPrimero = await q('cliente', '/projects');
    expect(delPrimero.projects.filter((p: any) => p.id === obraA)).toHaveLength(1);
    expect(delPrimero.projects.some((p: any) => p.id === obraC)).toBe(false);
  });

  it('el estado de cuenta general lo abre el propio cliente, y sólo el suyo', async () => {
    const mio = await pedir('cliente', `/orgs/${ORG}/clientes/${clienteId}/estado-de-cuenta`, { app: 'peek101' });
    expect(mio.estado, JSON.stringify(mio)).toBe(200);
    expect(mio.data.proyectos.some((p: any) => p.id === proyecto)).toBe(true);
    expect((await pedir('cliente', `/orgs/${ORG}/clientes/${cliente2}/estado-de-cuenta`, { app: 'peek101' })).estado).toBe(403);
    const xlsx = await SELF.fetch(`https://api.local/orgs/${ORG}/clientes/${clienteId}/estado.xlsx`, { headers: { Cookie: galletas.cliente, 'X-App': 'peek101' } });
    expect(xlsx.status).toBe(200);
    const b = new Uint8Array(await xlsx.arrayBuffer());
    expect(b[0] === 0x50 && b[1] === 0x4b, 'baja un .xlsx de verdad').toBe(true);
    const ajeno = await SELF.fetch(`https://api.local/orgs/${ORG}/clientes/${cliente2}/estado.xlsx`, { headers: { Cookie: galletas.cliente, 'X-App': 'peek101' } });
    expect(ajeno.status).toBe(403);
  });
});

/* 0.66.2 · El navegador manda `Origin` en todo POST, aunque sea al mismo
 * origen. La entrada le ponía las cabeceras CORS a la respuesta que venía tal
 * cual del objeto de la empresa —inmutables— y tiraba 500 con la duda ya
 * escrita. Lo vio el corredor de peek101 el 5-oct-2026; con curl, sin Origin,
 * no se veía. Esta prueba manda la misma petición que el navegador. */
describe('la pregunta del cliente llega con Origin (0.66.2)', () => {
  it('un POST al motor con Origin contesta 200, con las cabeceras CORS, y la duda queda una sola vez', async () => {
    const texto = `¿Pregunta con Origin ${Date.now()}?`;
    const r = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/projects/${obraA}/dudas`, {
      method: 'POST', body: forma({ texto }),
      headers: { 'X-App': 'peek101', Cookie: galletas.cliente, Origin: 'https://peek101.taller101.com' },
    });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://peek101.taller101.com');
    const c = (await r.json()) as any;
    expect(c.ok).toBe(true);
    const lista = await q('cliente', `/projects/${obraA}/dudas`);
    expect(lista.dudas.filter((d: any) => d.texto === texto)).toHaveLength(1);
  });
});

/* 0.67.1 · quote101 llega con el ítem y necesita la pieza del plano para
 * abrir su detalle a la derecha (Mike, 5-oct). */
describe('del ítem a su pieza del plano (0.67.1)', () => {
  it('quote101 pide la pieza de un ítem con su propio X-App y recibe lo justo para abrir el detalle', async () => {
    const item = (await q('mike', `/elements/${m1}`)).element.item_id;
    expect(item, 'm1 es un ítem vendido').toBeTruthy();
    const r = await pedir('mike', `/orgs/${ORG}/quell/items/${item}/pieza`, { app: 'cotizador101' });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.pieza).toMatchObject({ element_id: m1, project_id: obraA, project_name: 'Obra de prueba A' });
    expect(r.pieza.code).toMatch(/^[A-Z]+-\d+$/);
    expect(typeof r.pieza.plan_name).toBe('string');
    // Y de ahí, el detalle completo con el mismo X-App: la bitácora, los pendientes, los archivos.
    const d = await pedir('mike', `/orgs/${ORG}/quell/elements/${r.pieza.element_id}`, { app: 'cotizador101' });
    expect(d.estado).toBe(200);
    expect(d.element.id).toBe(m1);
    expect(Array.isArray(d.log) && Array.isArray(d.punch)).toBe(true);
    const docs = await pedir('mike', `/orgs/${ORG}/quell/elements/${r.pieza.element_id}/docs`, { app: 'cotizador101' });
    expect(docs.estado).toBe(200);
  });

  it('un ítem que no está en ningún plano contesta 404, y un cliente no abre esta puerta', async () => {
    const nada = await pedir('mike', `/orgs/${ORG}/quell/items/no-existe/pieza`, { app: 'cotizador101' });
    expect(nada.estado).toBe(404);
    const item = (await q('mike', `/elements/${m1}`)).element.item_id;
    const cli = await pedir('cliente', `/orgs/${ORG}/quell/items/${item}/pieza`, { app: 'peek101' });
    expect(cli.estado).toBe(403);
  });
});

/* 0.68.0 · El cronograma de la obra (Mike, 5-oct-2026). Primero las cuentas
 * puras —el calendario de lunes a sábado y las cadenas— y luego las rutas. */
describe('el cronograma: las cuentas (0.68.0)', () => {
  it('cuenta de lunes a sábado: el domingo no existe', () => {
    // 2026-10-04 es domingo; 2026-10-05, lunes; 2026-10-10, sábado.
    expect(siguienteLaborable('2026-10-04')).toBe('2026-10-05');
    expect(siguienteLaborable('2026-10-10')).toBe('2026-10-10');
    expect(sumarLaborables('2026-10-10', 1), 'el día después del sábado es el lunes').toBe('2026-10-12');
    // «5 días» que arrancan jueves 8 terminan el miércoles 14: jue, vie, sáb, lun, mar… no: jue 8, vie 9, sáb 10, lun 12, mar 13.
    expect(finDe('2026-10-08', 5)).toBe('2026-10-13');
    expect(finDe('2026-10-08', 1), 'un día termina el mismo día').toBe('2026-10-08');
    expect(laborablesEntre('2026-10-05', '2026-10-17'), 'dos semanas de lunes a sábado').toBe(12);
  });

  it('encadena las etapas de una sección en orden fijo y lo demás sólo cuando se pide', () => {
    const t = (id: string, element_id: string, seccion: string, etapa: string, dias: number, extra: Record<string, unknown> = {}) => ({ id, element_id, seccion, orden: 0, etapa, dias, depende_de: null, inicio_fijo: null, ...extra });
    const r = programar([
      t('h-fab', 'e1', 'Herrería', 'fabricacion', 3),
      t('h-ins', 'e1', 'Herrería', 'instalacion', 1),
      t('h-mat', 'e1', 'Herrería', 'material', 2),
      t('g-fab', 'e1', 'Gabinetes', 'fabricacion', 4),
      t('g-ins', 'e1', 'Gabinetes', 'instalacion', 2, { depende_de: 'h-ins' }),
      t('otra', 'e2', '', 'fabricacion', 6, { inicio_fijo: '2026-10-14' }),
    ], '2026-10-05');
    const por = Object.fromEntries(r.tareas.map((x) => [x.id, x]));
    // La herrería: material lun 5–mar 6, fabricación mié 7–vie 9, instalación sáb 10.
    expect([por['h-mat'].inicio, por['h-mat'].fin]).toEqual(['2026-10-05', '2026-10-06']);
    expect([por['h-fab'].inicio, por['h-fab'].fin]).toEqual(['2026-10-07', '2026-10-09']);
    expect([por['h-ins'].inicio, por['h-ins'].fin]).toEqual(['2026-10-10', '2026-10-10']);
    // Los gabinetes se fabrican desde el arranque (en paralelo), pero su instalación espera a la de la herrería.
    expect(por['g-fab'].inicio).toBe('2026-10-05');
    expect(por['g-ins'].inicio, 'arranca el lunes después del sábado en que terminó la herrería').toBe('2026-10-12');
    expect(por['g-ins'].fin).toBe('2026-10-13');
    expect(por['g-ins'].previas).toEqual(['g-fab', 'h-ins']);
    // Una fecha fija es un piso, no un techo.
    expect(por['otra'].inicio).toBe('2026-10-14');
    expect(r.fin).toBe('2026-10-20');
    expect(r.dias_laborables).toBe(14);
    expect(() => programar([t('a', 'e', '', 'fabricacion', 1, { depende_de: 'b' }), t('b', 'e', 'otra', 'fabricacion', 1, { depende_de: 'a' })], '2026-10-05')).toThrow('ciclo');
  });
});

describe('el cronograma: las rutas (0.68.0)', () => {
  let maderas = '', herrero = '', cronograma: any = null;

  it('el proveedor tiene tipo: materiales o servicios, y nada más', async () => {
    const malo = await pedir('mike', `/orgs/${ORG}/proveedores`, { app: 'dash101', method: 'POST', json: { nombre: 'Raro', tipo: 'otro' } });
    expect(malo.estado).toBe(400);
    expect(malo.detalle?.errores?.tipo ?? malo.detalle?.tipo ?? JSON.stringify(malo)).toMatch(/materiales|servicios/);
    const m = await pedir('mike', `/orgs/${ORG}/proveedores`, { app: 'dash101', method: 'POST', json: { nombre: 'Maderas del cronograma' } });
    expect(m.estado, JSON.stringify(m)).toBe(201);
    expect(m.data.tipo, 'sin decirlo, es de materiales').toBe('materiales');
    maderas = m.data.id;
    const h = await pedir('mike', `/orgs/${ORG}/proveedores`, { app: 'supply101', method: 'POST', json: { nombre: 'Herrería Pérez', tipo: 'servicios' } });
    expect(h.estado, JSON.stringify(h)).toBe(201);
    expect(h.data.tipo).toBe('servicios');
    herrero = h.data.id;
    const lista = await pedir('mike', `/orgs/${ORG}/proveedores?tipo=servicios`, { app: 'dash101' });
    expect(lista.data.filas.map((f: any) => f.id)).toContain(herrero);
    expect(lista.data.filas.map((f: any) => f.id)).not.toContain(maderas);
  });

  /* 0.70.0 · Los dos candados (Mike, 6-oct): anticipo y diseño definido. Se
   * dejan puestos ANTES de las pruebas de fechas de abajo, con fechas
   * anteriores al arranque de la obra, para que esas sigan contando desde
   * el 5 de octubre. */
  it('los candados: el anticipo se reparte de un pago entre ítems, el diseño se fecha en la pieza, y la pieza arranca en la fecha más tardía (0.70.0)', async () => {
    const itemM1 = (await q('mike', `/elements/${m1}`)).element.item_id as string;
    expect(itemM1, 'm1 quedó ligado a un ítem en las pruebas de la entrega').toBeTruthy();
    const it1 = (await pedir('mike', `/orgs/${ORG}/items/${itemM1}`, { app: 'dash101' })).data;
    const item2 = (await pedir('mike', `/orgs/${ORG}/items`, { method: 'POST', json: { cliente_id: it1.cliente_id, proyecto_id: it1.proyecto_id, nombre: 'Barra', monto: 40_000_00, cantidad: 1, estado: 'vendido', tipo: 'mueble' }, app: 'dash101' })).data.id;
    const liga = await pedir('mike', `/orgs/${ORG}/obras/${obraA}/items`, { method: 'POST', json: { ligar: [{ element_id: m2, item_id: item2 }] }, app: 'dash101' });
    expect(liga.estado, JSON.stringify(liga)).toBe(200);
    const cuenta = (await pedir('mike', `/orgs/${ORG}/cuentas`, { method: 'POST', json: { nombre: 'Caja del cronograma', tipo: 'caja' }, app: 'dash101' })).data.id;
    const pago = await pedir('mike', `/orgs/${ORG}/movimientos`, { method: 'POST', json: { tipo: 'ingreso', monto: 100_000_00, fecha: '2026-10-01', cuenta_id: cuenta, proyecto_id: it1.proyecto_id, contraparte_tipo: 'cliente', contraparte_id: it1.cliente_id, descripcion: 'Anticipo' }, app: 'dash101' });
    expect(pago.estado, JSON.stringify(pago)).toBe(201);
    // Se reparte: 30 mil a m1, 20 mil a m2. `proyecto_id` lo pone la API.
    const a1 = await pedir('mike', `/orgs/${ORG}/movimiento_items`, { method: 'POST', json: { movimiento_id: pago.data.id, item_id: itemM1, monto: 30_000_00 }, app: 'dash101' });
    expect(a1.estado, JSON.stringify(a1)).toBe(201);
    expect(a1.data.proyecto_id).toBe(it1.proyecto_id);
    const a2 = await pedir('mike', `/orgs/${ORG}/movimiento_items`, { method: 'POST', json: { movimiento_id: pago.data.id, item_id: item2, monto: 20_000_00 }, app: 'dash101' });
    expect(a2.estado, JSON.stringify(a2)).toBe(201);
    // Lo que no cuadra: más de lo que trae el pago; un egreso; un ítem de otro proyecto.
    const pasa = await pedir('mike', `/orgs/${ORG}/movimiento_items`, { method: 'POST', json: { movimiento_id: pago.data.id, item_id: itemM1, monto: 60_000_00 }, app: 'dash101' });
    expect(pasa.estado).toBe(400); expect(pasa.detalle?.errores?.monto).toMatch(/no alcanza/);
    const egreso = (await pedir('mike', `/orgs/${ORG}/movimientos`, { method: 'POST', json: { tipo: 'egreso', monto: 5_000_00, fecha: '2026-10-01', cuenta_id: cuenta, proyecto_id: it1.proyecto_id, contraparte_tipo: 'proveedor' }, app: 'dash101' })).data.id;
    const deEgreso = await pedir('mike', `/orgs/${ORG}/movimiento_items`, { method: 'POST', json: { movimiento_id: egreso, item_id: itemM1, monto: 1_00 }, app: 'dash101' });
    expect(deEgreso.estado).toBe(400); expect(deEgreso.detalle?.errores?.movimiento_id).toMatch(/ingreso/);
    const otroProy = (await pedir('mike', `/orgs/${ORG}/proyectos`, { method: 'POST', json: { cliente_id: it1.cliente_id, nombre: 'Otro proyecto' }, app: 'dash101' })).data.id;
    const ajeno = (await pedir('mike', `/orgs/${ORG}/items`, { method: 'POST', json: { cliente_id: it1.cliente_id, proyecto_id: otroProy, nombre: 'Ajeno', monto: 1_00, estado: 'vendido', tipo: 'mueble' }, app: 'dash101' })).data.id;
    const deOtro = await pedir('mike', `/orgs/${ORG}/movimiento_items`, { method: 'POST', json: { movimiento_id: pago.data.id, item_id: ajeno, monto: 1_00 }, app: 'dash101' });
    expect(deOtro.estado).toBe(400); expect(deOtro.detalle?.errores?.item_id).toMatch(/proyecto/);
    // Corregir un reparto no se cuenta dos veces: subir el de m1 a 50 mil (50 + 20 ≤ 100).
    const sube = await pedir('mike', `/orgs/${ORG}/movimiento_items/${a1.data.id}`, { method: 'PATCH', json: { monto: 50_000_00 }, app: 'dash101' });
    expect(sube.estado, JSON.stringify(sube)).toBe(200);
    // Se lista por proyecto, sin JOIN.
    const lista = await pedir('mike', `/orgs/${ORG}/movimiento_items?proyecto_id=${it1.proyecto_id}`, { app: 'dash101' });
    expect(lista.data.filas.map((f: any) => [f.item_id, f.monto]).sort()).toEqual([[itemM1, 50_000_00], [item2, 20_000_00]].sort());
    // El diseño: una fecha en la pieza, editable; mal escrita se rechaza.
    const mal = await q('mike', `/elements/${m1}`, { method: 'PATCH', json: { diseno_definido: '2026-13-40', op_id: crypto.randomUUID() } });
    expect(mal.estado).toBe(400); expect(mal.error).toMatch(/AAAA-MM-DD/);
    for (const e of [m1, m2]) expect((await q('mike', `/elements/${e}`, { method: 'PATCH', json: { diseno_definido: '2026-10-02', op_id: crypto.randomUUID() } })).estado).toBe(200);
    // La pieza lo cuenta: anticipo del 1-oct, diseño del 2-oct → arranca el 2-oct.
    const r = await q('mike', `/projects/${obraA}/cronograma`);
    const p1 = r.items.find((i: any) => i.element_id === m1);
    expect(p1.candados).toEqual({ anticipo: '2026-10-01', anticipo_monto: 50_000_00, diseno: '2026-10-02', ligado: true, listo: true, arranque: '2026-10-02' });
    expect(r.items.find((i: any) => i.element_id === m2).candados.listo).toBe(true);
    // Y el detalle de la pieza trae el anticipo; a quien no ve dinero, sin el monto.
    const det = (await q('mike', `/elements/${m1}`)).element;
    expect([det.diseno_definido, det.anticipo_fecha, det.anticipo_monto]).toEqual(['2026-10-02', '2026-10-01', 50_000_00]);
    const paraGoyo = (await q('goyo', `/elements/${m1}`)).element;
    expect(paraGoyo.anticipo_fecha).toBe('2026-10-01');
    expect(paraGoyo.anticipo_monto, 'el dinero no se le enseña al contratista').toBeUndefined();
  });

  it('una obra sin cronograma trae sus piezas (sin requerimientos), los proveedores con tipo, y cada pieza NACE con sus tres fases default (0.73.0)', async () => {
    const r = await q('mike', `/projects/${obraA}/cronograma`);
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.calendario).toBe('lunes-sabado');
    /* 0.73.0 · Mike, 6-oct: «el cronograma se debe llenar en automático».
     * Hasta 0.72.0 aquí venía `[]`; ahora cada pieza trae material 10,
     * fabricación 24 e instalación 12 días, y el costo por tipo sobre el
     * precio del ítem ligado (Isla/m1 es Mueble: 30 % y 30 %). */
    const deM1 = r.tareas.filter((t: any) => t.element_id === m1);
    expect(deM1.map((t: any) => [t.etapa, t.dias])).toEqual([['material', 10], ['fabricacion', 24], ['instalacion', 12]]);
    const precioM1 = Number((await pedir('mike', `/orgs/${ORG}/items/${(await q('mike', `/elements/${m1}`)).element.item_id}`, { app: 'dash101' })).data.monto);
    expect(deM1.map((t: any) => t.costo)).toEqual([Math.round(precioM1 * 0.3), Math.round(precioM1 * 0.3), 0]);
    expect(r.items.find((i: any) => i.element_id === m1).costo).toBe(2 * Math.round(precioM1 * 0.3));
    expect(r.contratistas.map((u: any) => u.nombre)).toContain(GENTE.goyo.name);
    expect(r.items.map((i: any) => i.element_id)).toContain(m1);
    expect(r.items.every((i: any) => i.type !== 'Requerimiento')).toBe(true);
    expect(r.proveedores.find((p: any) => p.id === herrero)?.tipo).toBe('servicios');
    expect(r.inicio_guardado).toBeNull();
    expect(r.dias_objetivo).toBeNull();
  });

  it('se guarda entero: secciones con sus etapas, proveedores, una cadena, y vuelve con fechas de lunes a sábado', async () => {
    const r = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: {
      inicio: '2026-10-05', dias_objetivo: 10,
      tareas: [
        { id: 'nuevo-0', element_id: m1, seccion: 'Herrería', orden: 0, etapa: 'material', dias: 2, proveedor_id: maderas },
        { id: 'nuevo-1', element_id: m1, seccion: 'Herrería', orden: 0, etapa: 'fabricacion', dias: 3, proveedor_id: herrero },
        { id: 'nuevo-2', element_id: m1, seccion: 'Herrería', orden: 0, etapa: 'instalacion', dias: 1, proveedor_id: herrero },
        { id: 'nuevo-3', element_id: m1, seccion: 'Gabinetes', orden: 1, etapa: 'fabricacion', dias: 4 },
        { id: 'nuevo-4', element_id: m1, seccion: 'Gabinetes', orden: 1, etapa: 'instalacion', dias: 2, depende_de: 'nuevo-2' },
        { element_id: m2, seccion: '', orden: 0, etapa: 'fabricacion', dias: 6, inicio_fijo: '2026-10-14', notas: 'cuando llegue la chapa' },
      ],
    } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.inicio).toBe('2026-10-05');
    expect(r.dias_objetivo).toBe(10);
    expect(r.tareas).toHaveLength(6);
    expect(r.tareas.every((t: any) => typeof t.id === 'string' && !t.id.startsWith('nuevo-')), 'los ids provisionales estrenan').toBe(true);
    const gIns = r.tareas.find((t: any) => t.seccion === 'Gabinetes' && t.etapa === 'instalacion');
    const hIns = r.tareas.find((t: any) => t.seccion === 'Herrería' && t.etapa === 'instalacion');
    expect(gIns.depende_de, 'la cadena apunta al id real').toBe(hIns.id);
    expect([hIns.inicio, hIns.fin]).toEqual(['2026-10-10', '2026-10-10']);
    expect([gIns.inicio, gIns.fin]).toEqual(['2026-10-12', '2026-10-13']);
    expect(gIns.proveedor_nombre).toBeNull();
    expect(r.tareas.find((t: any) => t.etapa === 'material').proveedor_nombre).toBe('Maderas del cronograma');
    expect(r.fin).toBe('2026-10-20');
    expect(r.dias_laborables).toBe(14);
    expect(r.excede, '14 días contra un objetivo de 10').toBe(true);
    const pieza = r.items.find((i: any) => i.element_id === m1);
    expect(pieza.tareas).toHaveLength(5);
    expect([pieza.inicio, pieza.fin, pieza.dias]).toEqual(['2026-10-05', '2026-10-13', 8]);
    cronograma = r;
    // Y se vuelve a leer igual.
    const otra = await q('mike', `/projects/${obraA}/cronograma`);
    expect(otra.tareas.map((t: any) => t.id).sort()).toEqual(r.tareas.map((t: any) => t.id).sort());
    expect(otra.inicio_guardado).toBe('2026-10-05');
  });

  it('lo que no cuadra se rechaza con palabras: etapa repetida, pieza ajena, ciclo, días en cero', async () => {
    const base = { inicio: '2026-10-05', dias_objetivo: 10 };
    const repetida = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { ...base, tareas: [
      { element_id: m1, seccion: '', etapa: 'fabricacion', dias: 1 }, { element_id: m1, seccion: '', etapa: 'fabricacion', dias: 2 }] } });
    expect(repetida.estado).toBe(400); expect(repetida.error).toMatch(/repite la etapa/);
    const otra = await q('mike', '/projects', { method: 'POST', json: { name: 'Obra sin cronograma', client: 'Nadie' } });
    const ajena = await q('mike', `/projects/${otra.id}/cronograma`, { method: 'PUT', json: { ...base, tareas: [{ element_id: m1, seccion: '', etapa: 'fabricacion', dias: 1 }] } });
    expect(ajena.estado).toBe(400); expect(ajena.error).toMatch(/no es de esta obra/);
    const ciclo = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { ...base, tareas: [
      { id: 'nuevo-a', element_id: m1, seccion: 'A', etapa: 'fabricacion', dias: 1, depende_de: 'nuevo-b' }, { id: 'nuevo-b', element_id: m2, seccion: '', etapa: 'fabricacion', dias: 1, depende_de: 'nuevo-a' }] } });
    expect(ciclo.estado).toBe(400); expect(ciclo.error).toMatch(/muerden la cola/);
    const cero = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { ...base, tareas: [{ element_id: m1, seccion: '', etapa: 'fabricacion', dias: 0 }] } });
    expect(cero.estado).toBe(400); expect(cero.error).toMatch(/de 1 en adelante/);
    // Nada de eso tocó lo guardado.
    expect((await q('mike', `/projects/${obraA}/cronograma`)).tareas).toHaveLength(6);
  });

  it('se exporta a Excel y a Microsoft Project con las mismas fechas', async () => {
    const x = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/projects/${obraA}/cronograma.xlsx`, { headers: { Cookie: galletas.mike, 'X-App': 'quell101' } });
    expect(x.status).toBe(200);
    expect(x.headers.get('content-type')).toContain('spreadsheetml');
    expect(x.headers.get('content-disposition')).toMatch(/cronograma-Obra-de-prueba-A\.xlsx/);
    const bytes = new Uint8Array(await x.arrayBuffer());
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);   // «PK»: es un zip
    const texto = new TextDecoder().decode(bytes);
    expect(texto).toContain('Herrería'); expect(texto).toContain('Maderas del cronograma'); expect(texto).toContain('2026-10-13');
    expect(texto).toContain('Entrega de material');
    const p = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/projects/${obraA}/cronograma.xml`, { headers: { Cookie: galletas.mike, 'X-App': 'quell101' } });
    expect(p.status).toBe(200);
    expect(p.headers.get('content-type')).toContain('application/xml');
    const xml = await p.text();
    expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
    expect(xml).toContain('<Name>Lunes a sábado</Name>');
    expect(xml).toContain('<DayType>1</DayType><DayWorking>0</DayWorking>');
    expect((xml.match(/<Task>/g) || []).length, '6 etapas + 2 piezas + 2 secciones').toBe(10);
    expect(xml).toContain('<Start>2026-10-12T08:00:00</Start><Finish>2026-10-13T17:00:00</Finish><Duration>PT16H0M0S</Duration>');
    expect(xml).toContain('<PredecessorLink><PredecessorUID>');
    expect(xml).toContain('<Name>Instalación · Herrería Pérez</Name>');
  });

  it('quien no dirige la obra no lo arma ni lo ve: contratista 403, cliente 403', async () => {
    expect((await q('goyo', `/projects/${obraA}/cronograma`)).estado).toBe(403);
    expect((await q('cliente', `/projects/${obraA}/cronograma`)).estado).toBe(403);
    expect((await q('goyo', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: [] } })).estado).toBe(403);
  });
});

describe('el cronograma: fases adicionales con nombre y orden (0.69.0)', () => {
  it('un proceso lleva las fases que haga falta, cada una con su nombre, en el orden de `pos`; se exportan con ese nombre', async () => {
    const pintor = await pedir('mike', `/orgs/${ORG}/proveedores`, { app: 'dash101', method: 'POST', json: { nombre: 'Pinturas Lara', tipo: 'servicios' } });
    const r = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: {
      inicio: '2026-10-05', dias_objetivo: 30,
      tareas: [
        { id: 'nuevo-m', element_id: m1, seccion: 'Herrería', etapa: 'material', pos: 0, dias: 1 },
        { id: 'nuevo-f', element_id: m1, seccion: 'Herrería', etapa: 'fabricacion', nombre: 'Herrería gruesa', pos: 10, dias: 2 },
        { id: 'nuevo-p', element_id: m1, seccion: 'Herrería', etapa: 'otra', nombre: 'Pintura', pos: 15, dias: 2, proveedor_id: pintor.data.id },
        { id: 'nuevo-u', element_id: m1, seccion: 'Herrería', etapa: 'otra', nombre: 'Pulido', pos: 16, dias: 1 },
        { id: 'nuevo-i', element_id: m1, seccion: 'Herrería', etapa: 'instalacion', pos: 20, dias: 1 },
      ],
    } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    expect(r.tareas).toHaveLength(5);
    const de = (nombre: string) => r.tareas.find((t: any) => t.nombre === nombre);
    const mat = r.tareas.find((t: any) => t.etapa === 'material');
    const ins = r.tareas.find((t: any) => t.etapa === 'instalacion');
    expect([mat.inicio, mat.fin]).toEqual(['2026-10-05', '2026-10-05']);
    expect([de('Herrería gruesa').inicio, de('Herrería gruesa').fin]).toEqual(['2026-10-06', '2026-10-07']);
    expect([de('Pintura').inicio, de('Pintura').fin], 'la pintura sigue a la fabricación').toEqual(['2026-10-08', '2026-10-09']);
    expect([de('Pulido').inicio, de('Pulido').fin], 'y el pulido a la pintura').toEqual(['2026-10-10', '2026-10-10']);
    expect([ins.inicio, ins.fin], 'la instalación espera al pulido (el domingo 11 no cuenta)').toEqual(['2026-10-12', '2026-10-12']);
    expect(ins.previas).toEqual([de('Pulido').id]);
    expect(de('Pintura').proveedor_nombre).toBe('Pinturas Lara');
    expect(r.tareas.map((t: any) => t.pos)).toEqual([0, 10, 15, 16, 20]);
    expect(mat.nombre).toBeNull();
    // Se vuelve a leer con nombre y pos.
    const otra = await q('mike', `/projects/${obraA}/cronograma`);
    expect(otra.tareas.map((t: any) => [t.etapa, t.nombre, t.pos])).toEqual([['material', null, 0], ['fabricacion', 'Herrería gruesa', 10], ['otra', 'Pintura', 15], ['otra', 'Pulido', 16], ['instalacion', null, 20]]);
    // Excel y Project llevan los nombres.
    const x = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/projects/${obraA}/cronograma.xlsx`, { headers: { Cookie: galletas.mike, 'X-App': 'quell101' } });
    const texto = new TextDecoder().decode(new Uint8Array(await x.arrayBuffer()));
    expect(texto).toContain('Pintura'); expect(texto).toContain('Herrería gruesa'); expect(texto).toContain('Pulido');
    const p = await SELF.fetch(`https://api.local/orgs/${ORG}/quell/projects/${obraA}/cronograma.xml`, { headers: { Cookie: galletas.mike, 'X-App': 'quell101' } });
    const xml = await p.text();
    expect(xml).toContain('<Name>Pintura · Pinturas Lara</Name>');
    expect(xml).toContain('<Name>Herrería gruesa</Name>');
    expect((xml.match(/<Task>/g) || []).length, '5 fases + 1 pieza + 1 sección').toBe(7);
  });

  it('las tres fases fijas siguen siendo una por proceso; «otra» se repite; una etapa inventada se rechaza', async () => {
    const dos = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: [
      { element_id: m1, seccion: '', etapa: 'instalacion', dias: 1 }, { element_id: m1, seccion: '', etapa: 'instalacion', dias: 1 }] } });
    expect(dos.estado).toBe(400); expect(dos.error).toMatch(/repite la etapa Instalación/);
    const rara = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: [{ element_id: m1, seccion: '', etapa: 'pintura', dias: 1 }] } });
    expect(rara.estado).toBe(400); expect(rara.error).toMatch(/u otra/);
    expect((await q('mike', `/projects/${obraA}/cronograma`)).tareas, 'nada de eso tocó lo guardado').toHaveLength(5);
  });
});

/* 0.70.0 · Sin los dos candados, la pieza corre desde hoy. */
describe('el cronograma que se llena solo, con responsable y costo por fase, y los compromisos que nacen (0.73.0)', () => {
  /* Mike, 6-oct: «cada ítem tiene fecha de entrega default de 6 semanas en
   * sitio y 2 semanas de instalación (…) material 10 días, fabricación 4
   * semanas, instalación 2 (…) responsable (proveedor o contratista) de cada
   * fase (…) el costo de cada fase, así de ahí se pobla la lista de
   * compromisos de gastos en el proyecto para la proyección del flujo». */
  let puerta = '', itemPuerta = '', proyecto = '', goyoId = '';
  const entrada = (t: any) => ({ id: t.id, element_id: t.element_id, seccion: t.seccion, orden: t.orden, etapa: t.etapa, nombre: t.nombre, pos: t.pos, dias: t.dias, proveedor_id: t.proveedor_id, contratista_id: t.contratista_id, costo: t.costo, depende_de: t.depende_de, inicio_fijo: t.inicio_fijo, notas: t.notas });

  it('una pieza nueva recibe sus fases UNA vez: 10/24/12 días y el costo por tipo (Puerta: 35 % y 35 % del precio)', async () => {
    const itemM1 = (await q('mike', `/elements/${m1}`)).element.item_id as string;
    const it1 = (await pedir('mike', `/orgs/${ORG}/items/${itemM1}`, { app: 'dash101' })).data;
    proyecto = it1.proyecto_id;
    itemPuerta = (await pedir('mike', `/orgs/${ORG}/items`, { method: 'POST', json: { cliente_id: it1.cliente_id, proyecto_id: proyecto, nombre: 'Puerta del patio', monto: 1_000_00, cantidad: 1, estado: 'vendido', tipo: 'puerta' }, app: 'dash101' })).data.id;
    const planos = (await q('mike', `/projects/${obraA}`)).plans;
    const nueva = await q('mike', `/plans/${planos[0].id}/elements`, { method: 'POST', json: { op_id: crypto.randomUUID(), name: 'Puerta del patio', type: 'Puerta', x: 0.6, y: 0.6 } });
    expect(nueva.estado, JSON.stringify(nueva)).toBe(200);
    puerta = nueva.id;
    expect((await pedir('mike', `/orgs/${ORG}/obras/${obraA}/items`, { method: 'POST', json: { ligar: [{ element_id: puerta, item_id: itemPuerta }] }, app: 'dash101' })).estado).toBe(200);
    const antes = Number((await pedir('mike', `/orgs/${ORG}/proyectos/${proyecto}`, { app: 'dash101' })).data.compromiso);

    const r = await q('mike', `/projects/${obraA}/cronograma`);
    const mias = r.tareas.filter((t: any) => t.element_id === puerta);
    expect(mias.map((t: any) => [t.etapa, t.dias, t.costo])).toEqual([['material', 10, 350_00], ['fabricacion', 24, 350_00], ['instalacion', 12, 0]]);
    expect(r.items.find((i: any) => i.element_id === puerta).costo).toBe(700_00);
    // Las dos fases con costo son dos compromisos del proyecto, con fecha: el material al arrancar, la mano de obra al terminar.
    const partidas = (await pedir('mike', `/orgs/${ORG}/partidas?proyecto_id=${proyecto}`, { app: 'dash101' })).data.filas.filter((p: any) => p.item_id === itemPuerta);
    expect(partidas.map((p: any) => [p.concepto, p.monto_acordado, p.obra_id]).sort()).toEqual([['PT-02 · Entrega de material', 350_00, obraA], ['PT-02 · Fabricación', 350_00, obraA]]);
    const mat = mias.find((t: any) => t.etapa === 'material'); const fab = mias.find((t: any) => t.etapa === 'fabricacion');
    expect(partidas.find((p: any) => p.tarea_id === mat.id).fecha_esperada).toBe(mat.inicio);
    expect(partidas.find((p: any) => p.tarea_id === fab.id).fecha_esperada).toBe(fab.fin);
    expect(partidas.every((p: any) => p.estado === 'pendiente' && p.monto_pagado === 0)).toBe(true);
    const despues = Number((await pedir('mike', `/orgs/${ORG}/proyectos/${proyecto}`, { app: 'dash101' })).data.compromiso);
    expect(despues - antes, 'el compromiso del proyecto creció con las dos fases').toBe(700_00);

    // Se quitan las tres a mano y NO vuelven: las fases default se dan una sola vez.
    const sinPuerta = r.tareas.filter((t: any) => t.element_id !== puerta).map(entrada);
    expect((await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: sinPuerta } })).estado).toBe(200);
    const otra = await q('mike', `/projects/${obraA}/cronograma`);
    expect(otra.tareas.some((t: any) => t.element_id === puerta), 'lo que se quita se queda quitado').toBe(false);
    expect((await pedir('mike', `/orgs/${ORG}/partidas?proyecto_id=${proyecto}`, { app: 'dash101' })).data.filas.some((p: any) => p.item_id === itemPuerta), 'y sus compromisos se fueron con ellas').toBe(false);
    expect(Number((await pedir('mike', `/orgs/${ORG}/proyectos/${proyecto}`, { app: 'dash101' })).data.compromiso)).toBe(antes);
  });

  it('el responsable es un proveedor O un contratista; el costo se captura; dash101 no toca la partida que nace de la fase (409 del_cronograma)', async () => {
    goyoId = (await q('goyo', '/me')).user.id;
    const r0 = await q('mike', `/projects/${obraA}/cronograma`);
    const base = r0.tareas.map(entrada);
    const dos = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: [...base, { element_id: puerta, seccion: '', etapa: 'instalacion', dias: 3, proveedor_id: base[0].proveedor_id || (r0.proveedores[0] || {}).id, contratista_id: goyoId, costo: 100 }] } });
    expect(dos.estado).toBe(400); expect(dos.error).toMatch(/proveedor o contratista, no los dos/);
    const ajeno = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: [...base, { element_id: puerta, seccion: '', etapa: 'instalacion', dias: 3, contratista_id: 'nadie', costo: 100 }] } });
    expect(ajeno.estado).toBe(400); expect(ajeno.error).toMatch(/contratista/);
    const negativo = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: [...base, { element_id: puerta, seccion: '', etapa: 'instalacion', dias: 3, costo: -1 }] } });
    expect(negativo.estado).toBe(400); expect(negativo.error).toMatch(/costo/);

    const r = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: [...base, { element_id: puerta, seccion: '', etapa: 'instalacion', dias: 3, contratista_id: goyoId, costo: 1_200_00, nombre: 'Colgar la puerta' }] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const ins = r.tareas.find((t: any) => t.element_id === puerta);
    expect([ins.contratista_id, ins.contratista_nombre, ins.proveedor_id, ins.costo]).toEqual([goyoId, GENTE.goyo.name, null, 1_200_00]);
    const partida = (await pedir('mike', `/orgs/${ORG}/partidas?proyecto_id=${proyecto}`, { app: 'dash101' })).data.filas.find((p: any) => p.tarea_id === ins.id);
    expect(partida, 'la fase con costo es un compromiso').toBeTruthy();
    expect([partida.proveedor_id, partida.proveedor_nombre, partida.concepto, partida.monto_acordado, partida.fecha_esperada]).toEqual([null, GENTE.goyo.name, 'PT-02 · Colgar la puerta', 1_200_00, ins.fin]);
    // dash101 no la edita ni la borra: se cambia en el cronograma.
    const toca = await pedir('mike', `/orgs/${ORG}/partidas/${partida.id}`, { method: 'PATCH', json: { monto_acordado: 1 }, app: 'dash101' });
    expect(toca.estado).toBe(409); expect(toca.error).toBe('del_cronograma');
    expect((await pedir('mike', `/orgs/${ORG}/partidas/${partida.id}`, { method: 'DELETE', app: 'dash101' })).estado).toBe(409);
    // Y con el costo en cero, el compromiso se va.
    const cero = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { tareas: r.tareas.map(entrada).map((t: any) => (t.element_id === puerta ? { ...t, costo: 0 } : t)) } });
    expect(cero.estado, JSON.stringify(cero)).toBe(200);
    expect((await pedir('mike', `/orgs/${ORG}/partidas/${partida.id}`, { app: 'dash101' })).estado).toBe(404);
    // El Excel lleva responsable y costo.
    const x = await pedir('mike', `/orgs/${ORG}/quell/projects/${obraA}/cronograma.xlsx`);
    expect(x.estado).toBe(200);
  });
});

describe('el cronograma: sin anticipo o sin diseño la pieza arranca hoy y se recorre sola (0.70.0)', () => {
  it('una pieza sin ítem de dash101 no puede tener anticipo: arranca hoy aunque la obra arranque antes; con diseño nada más, sigue igual', async () => {
    const planos = (await q('mike', `/projects/${obraA}`)).plans;
    const nueva = await q('mike', `/plans/${planos[0].id}/elements`, { method: 'POST', json: { op_id: crypto.randomUUID(), name: 'Sin candados', type: 'Mueble', x: 0.7, y: 0.7 } });
    expect(nueva.estado, JSON.stringify(nueva)).toBe(200);
    const hoy = new Date().toISOString().slice(0, 10);
    const r = await q('mike', `/projects/${obraA}/cronograma`, { method: 'PUT', json: { inicio: '2026-10-05', tareas: [
      { element_id: nueva.id, seccion: '', etapa: 'fabricacion', dias: 2 },
      { element_id: m1, seccion: '', etapa: 'fabricacion', dias: 2 },
    ] } });
    expect(r.estado, JSON.stringify(r)).toBe(200);
    const sin = r.items.find((i: any) => i.element_id === nueva.id);
    expect(sin.candados).toEqual({ anticipo: null, anticipo_monto: 0, diseno: null, ligado: false, listo: false, arranque: hoy });
    const t = r.tareas.find((x: any) => x.element_id === nueva.id);
    expect(t.inicio, 'corre desde hoy, no desde el 5 de octubre').toBe(siguienteLaborable(hoy));
    // La que sí tiene los dos sigue contando desde la obra (5-oct), porque sus candados son anteriores.
    expect(r.tareas.find((x: any) => x.element_id === m1).inicio).toBe('2026-10-05');
    // Con el diseño fechado y sin anticipo, sigue en hoy.
    await q('mike', `/elements/${nueva.id}`, { method: 'PATCH', json: { diseno_definido: '2026-10-01', op_id: crypto.randomUUID() } });
    const otra = await q('mike', `/projects/${obraA}/cronograma`);
    const k = otra.items.find((i: any) => i.element_id === nueva.id).candados;
    expect([k.diseno, k.listo, k.arranque]).toEqual(['2026-10-01', false, hoy]);
    // Y si se quita la fecha, queda en nulo.
    await q('mike', `/elements/${nueva.id}`, { method: 'PATCH', json: { diseno_definido: '', op_id: crypto.randomUUID() } });
    expect((await q('mike', `/elements/${nueva.id}`)).element.diseno_definido).toBeNull();
  });

  it('la etapa 2 «Anticipo pagado» del ítem también cuenta como anticipo', async () => {
    const itemM1 = (await q('mike', `/elements/${m1}`)).element.item_id as string;
    const it1 = (await pedir('mike', `/orgs/${ORG}/items/${itemM1}`, { app: 'dash101' })).data;
    const item3 = (await pedir('mike', `/orgs/${ORG}/items`, { method: 'POST', json: { cliente_id: it1.cliente_id, proyecto_id: it1.proyecto_id, nombre: 'Con etapa', monto: 1_000_00, cantidad: 1, estado: 'vendido', tipo: 'mueble' }, app: 'dash101' })).data.id;
    const planos = (await q('mike', `/projects/${obraA}`)).plans;
    const pieza = await q('mike', `/plans/${planos[0].id}/elements`, { method: 'POST', json: { op_id: crypto.randomUUID(), name: 'Con etapa', type: 'Mueble', x: 0.8, y: 0.8 } });
    await pedir('mike', `/orgs/${ORG}/obras/${obraA}/items`, { method: 'POST', json: { ligar: [{ element_id: pieza.id, item_id: item3 }] }, app: 'dash101' });
    for (const n of [1, 2]) expect((await pedir('mike', `/orgs/${ORG}/items/${item3}/etapa`, { method: 'POST', json: { etapa: n }, app: 'dash101' })).estado).toBe(200);
    const k = (await q('mike', `/projects/${obraA}/cronograma`)).items.find((i: any) => i.element_id === pieza.id).candados;
    expect(k.ligado).toBe(true);
    expect(k.anticipo, 'la fecha de la etapa').toBe(new Date().toISOString().slice(0, 10));
    expect(k.anticipo_monto).toBe(0);
  });
});

describe('el avance de obra por ítem, para la lista de dash101 (0.76.0)', () => {
  /* Mike, 6-oct, con la lista de quell101 enfrente: «en dash quiero que la
   * lista de ítems tenga el mismo estilo». Esa lista enseña por pieza las
   * etapas cumplidas; dash101 lista ítems, así que pide el avance de todos
   * los ítems de un proyecto de un jalón. */
  it('por ítem: piezas, etapas cumplidas, la menor, y el catálogo de etapas; se mueve al marcar una etapa', async () => {
    const itemM1 = (await q('mike', `/elements/${m1}`)).element.item_id as string;
    const proyecto = (await pedir('mike', `/orgs/${ORG}/items/${itemM1}`, { app: 'dash101' })).data.proyecto_id as string;
    const antes = await q('mike', `/avance-items?proyecto_id=${proyecto}`);
    expect(antes.estado, JSON.stringify(antes)).toBe(200);
    expect(antes.etapas.length).toBeGreaterThan(0);
    expect(antes.etapas.every((x: any) => typeof x.clave === 'string' && typeof x.nombre === 'string')).toBe(true);
    const a0 = antes.items[itemM1];
    expect(a0, 'el ítem de la pieza sale').toBeTruthy();
    expect(a0.piezas).toBeGreaterThanOrEqual(1);
    expect(a0.menor).toBeLessThanOrEqual(a0.hechas);
    const total = antes.etapas.length;
    // Se marca la siguiente etapa que le falte (o se desmarca la última si ya llevaba todas).
    const avanza = a0.menor < total;
    const clave = avanza ? antes.etapas[a0.menor].clave : antes.etapas[total - 1].clave;
    const marca = await q('mike', `/elements/${m1}/etapas`, { method: 'POST', json: { clave, hecha: avanza, op_id: crypto.randomUUID() } });
    expect(marca.estado, JSON.stringify(marca)).toBe(200);
    const a1 = (await q('mike', `/avance-items?proyecto_id=${proyecto}`)).items[itemM1];
    if (avanza) expect(a1.hechas, 'marcar una etapa sube el avance del ítem').toBeGreaterThan(a0.hechas);
    else expect(a1.hechas, 'desmarcar la última lo baja').toBeLessThan(a0.hechas);
  });

  it('es sólo para quien dirige, y pide el proyecto', async () => {
    expect((await q('goyo', `/avance-items?proyecto_id=x`)).estado).toBe(403);
    expect((await q('mike', `/avance-items`)).estado).toBe(400);
  });
});

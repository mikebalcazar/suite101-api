/* quell101 — el motor de la bitácora de obra, dentro de la suite.
 *
 * ESTE ARCHIVO ES EL QUE CORRÍA EN EL WORKER DE quell101 (bitacora-obra,
 * worker/index.js) hasta el 19-sep-2026, con tres cambios y nada más:
 *
 *   1. Las tablas llevan el prefijo `quell_` y viven en el SQLite de la
 *      empresa (el Durable Object OrgDB), no en una D1 propia. `env.DB` es un
 *      adaptador con la misma cara que D1 (prepare · bind · first · all · run ·
 *      batch) sobre el SqlStorage del objeto: las consultas son las mismas.
 *   2. Quién viene ya lo resolvió la puerta de la suite (`/orgs/:o/*` en
 *      src/rutas/orgs.ts): llega en `env.SESION` (clase, rol, correo). Aquí
 *      sólo se casa con su renglón de `quell_users`, que dice qué hace en obra.
 *   3. Los archivos van al bucket de la suite bajo `orgs/{org}/quell/…`, y el
 *      correo sale por el mismo remitente que el resto de la suite.
 *
 * Todo lo demás —el recorte del contratista, la cara de cliente, el código
 * único por obra, la fila sin señal— es el mismo código, con sus mismos
 * comentarios. Mike decidió el 19-sep que todo lo de una empresa viva en su
 * base de la suite; esto es cómo quell101 llegó sin cambiar de reglas.
 *
 * Es JavaScript a propósito: se movió tal cual, y `motor.d.ts` le pone la
 * firma que TypeScript necesita del lado del Durable Object.
 */

import { PREFIJOS, siguienteCodigo } from './codigos.js';

const JSON_H = { 'content-type': 'application/json; charset=utf-8' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...JSON_H, ...extra } });
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

/* ─────────────── quién es en obra ───────────────
 *
 * La suite ya dijo quién viene (sesión, empresa, clase: miembro o cliente).
 * Aquí se casa ese correo con su renglón de `quell_users`, que dice qué hace
 * en obra: dueño, supervisor, contratista o cliente.
 *
 * El cliente del taller no es miembro de la empresa en la suite: entra con su
 * acceso de cliente, el mismo con el que abre peek101. Los demás entran como
 * miembros; que la app esté prendida para su empresa y para su persona ya lo
 * revisó la puerta de la suite.
 *
 * Quien entra a la suite y no está dado de alta aquí no pasa: dar de alta es
 * decidir un rol, y eso lo hace una persona. Una sola excepción, y es lo que
 * hace que una empresa recién dada de alta pueda arrancar sola: el dueño o
 * el administrador de la empresa (y el dueño de la suite) entran la primera
 * vez como dueños de quell101, y desde ahí dan de alta a su gente. */
async function usuarioDe(env) {
  const s = env.SESION;
  if (!s || !s.correo) return null;
  const row = await env.DB.prepare(`SELECT * FROM quell_users WHERE email = ? AND active = 1`).bind(s.correo).first();
  if (row) {
    if (row.role === 'cli') return s.quien?.clase === 'cliente' ? row : null;
    return s.quien?.clase === 'miembro' ? row : null;
  }
  const manda = s.quien?.clase === 'miembro' && (s.superadmin === true || s.quien.rol === 'owner' || s.quien.rol === 'admin');
  if (!manda) return null;
  const id = uid();
  await env.DB.prepare(`INSERT INTO quell_users (id, email, name, role, company, usuario_id) VALUES (?,?,?,?,?,?)`)
    .bind(id, s.correo, s.nombre || s.correo.split('@')[0], 'admin', '', s.quien.usuario_id || null).run();
  return await env.DB.prepare(`SELECT * FROM quell_users WHERE id = ?`).bind(id).first();
}

// Tres roles y nada más:
//   admin ("dueño")  manda: todo lo del supervisor, más dar de alta gente.
//   int   supervisor crea y edita proyectos, planos, elementos y pendientes, y
//                    es el único que cierra un pendiente: quien lo pidió es
//                    quien dice si quedó bien.
//   con   contratista lee lo que trae su nombre, sube la evidencia de que lo
//                    arregló y lo marca terminado. No edita nada, ni ve lo que
//                    no le toca.
const isStaff = (u) => u && (u.role === 'admin' || u.role === 'int');
const esDueno = (u) => u && u.role === 'admin';
// Y un cuarto, desde 0012: el cliente del taller. Ve el plano de su obra y los
// puntos que el taller le pide definir; contesta y puede preguntar. Nada más.
const esCli = (u) => u && u.role === 'cli';

// Lo único que un cliente abre. Está escrito en positivo y se revisa antes de
// cualquier ruta: lo que no esté aquí le contesta 403 aunque una ruta nueva se
// olvide de preguntar. Es la misma idea que el recorte del contratista: el
// filtro vive en el servidor, no en la pantalla.
const rutaDeCliente = (m, seg) =>
  (seg[0] === 'me' && m === 'GET') ||
  (seg[0] === 'projects' && m === 'GET' && (!seg[1] || !seg[2] || seg[2] === 'dudas')) ||
  (seg[0] === 'projects' && m === 'POST' && seg[1] && seg[2] === 'dudas') ||
  (seg[0] === 'elements' && m === 'GET' && seg[1] && !seg[2]) ||
  (seg[0] === 'dudas' && m === 'POST' && seg[1] && seg[2] === 'respuestas');

// El correo de invitación. Dar de alta a alguien y no avisarle no es invitar:
// la persona no sabe que existe la aplicación, ni que su correo ya es su
// llave. Aquí se le dice a qué obra entró, qué va a poder hacer, y el único
// camino para entrar la primera vez: su correo, un código de seis dígitos, y
// el PIN que se pone ahí mismo.
//
// La dirección del sitio sale de la propia petición y no de una variable de
// configuración: el Worker ya sabe dónde vive, y una variable más es una
// variable que algún día va a quedar apuntando a otro lado.
async function invita(env, req, quien, obra, rol) {
  const sitio = env.SITIO;
  const app = env.APP_NAME || 'quell101';
  const puede = rol === 'tra'
    ? 'Vas a poder ver la obra completa —planos, ítems, bitácora y punchlist— y levantar dudas para el supervisor. No vas a poder editar nada.'
    : 'Vas a ver los pendientes que traigan tu nombre, subir la evidencia de que quedaron y levantar dudas para el supervisor.';
  const html = `
    <p>Hola${quien.name ? ' ' + quien.name : ''},</p>
    <p>Te dieron acceso a la obra <b>${obra.name}</b>${obra.client ? ` (${obra.client})` : ''} en <b>${app}</b>.</p>
    <p>${puede}</p>
    <p><b>Para entrar la primera vez:</b></p>
    <ol>
      <li>Abre <a href="${sitio}">${sitio}</a></li>
      <li>Escribe este correo: <b>${quien.email}</b></li>
      <li>Te llega un código de 6 dígitos y con él creas tu PIN.</li>
    </ol>
    <p>De ahí en adelante entras con tu correo y tu PIN, sin esperar ningún código.
       Es el mismo correo y el mismo PIN de las demás aplicaciones de la suite 101.</p>
    <p>Si al escribir tu correo te dice que no tiene acceso, es que todavía no te
       han dado de alta en la suite: avísale a quien administra tu empresa.</p>`;
  // Que no se caiga el alta por un correo que no salió: la persona ya quedó
  // agregada, y el correo se le puede volver a mandar.
  try { await sendMail(env, quien.email, `Te dieron acceso a ${obra.name} en ${app}`, html); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// El correo al cliente invitado. Entra por la misma puerta que todos —la de la
// suite—, con «Mándame un código» la primera vez, porque no tiene contraseña
// todavía: la pone ahí mismo.
async function invitaCliente(env, req, quien, obras) {
  const sitio = env.SITIO;
  const app = env.APP_NAME || 'quell101';
  const lista = obras.map((o) => `<li><b>${o.name}</b>${o.client ? ` (${o.client})` : ''}</li>`).join('');
  const html = `
    <p>Hola${quien.name ? ' ' + quien.name : ''},</p>
    <p>El taller te invitó a ver ${obras.length === 1 ? 'tu obra' : 'tus obras'} en <b>${app}</b>:</p>
    <ul>${lista}</ul>
    <p>Ahí vas a ver el plano con tus muebles y los puntos que el taller necesita
       que definas; contestas sobre cada uno, con foto si hace falta, y también
       puedes preguntar lo que quieras. Lo interno del taller no sale ahí.</p>
    <p><b>Para entrar la primera vez:</b></p>
    <ol>
      <li>Abre <a href="${sitio}">${sitio}</a></li>
      <li>Escribe este correo: <b>${quien.email}</b> y pica «Continuar».</li>
      <li>Como todavía no tienes contraseña, pica <b>«Mándame un código»</b>: te
          llega uno de 6 dígitos y con él pones tu contraseña.</li>
    </ol>
    <p>De ahí en adelante entras con tu correo y tu contraseña. Es la misma
       cuenta con la que ves tu estado de cuenta en peek101.</p>`;
  try { await sendMail(env, quien.email, `Te invitaron a ver tu obra en ${app}`, html); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// El aviso al cliente de que tiene puntos por definir. Un solo correo, cuando
// el taller aprieta el botón; nada automático por punto (decisión 8 de Mike).
async function avisaCliente(env, req, quien, obra, cuantos) {
  const sitio = env.SITIO;
  const app = env.APP_NAME || 'quell101';
  const html = `
    <p>Hola${quien.name ? ' ' + quien.name : ''},</p>
    <p>En tu obra <b>${obra.name}</b> hay <b>${cuantos} ${cuantos === 1 ? 'punto' : 'puntos'} por definir</b>.
       El taller necesita tu respuesta para seguir.</p>
    <p>Entra a <a href="${sitio}/#/p/${obra.id}">${sitio}</a> con tu correo y tu contraseña, abre la obra y
       contesta sobre cada punto. Si algo no se entiende, ahí mismo puedes preguntar.</p>`;
  try { await sendMail(env, quien.email, `${cuantos} ${cuantos === 1 ? 'punto' : 'puntos'} por definir en ${obra.name}`, html); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// La suite le abre la puerta al cliente: `POST /orgs/:o/clientes/invitar`
// (contrato 0.15.0) lo deja como cliente de la empresa —el mismo que ve
// peek101— sin PIN. Desde el 19-sep eso corre dentro de la misma API
// (src/clientes.ts) y llega aquí como una función en el entorno: se llama
// después de revisar que quien invita sea el dueño de la obra, y si la suite
// dice que no, aquí no se escribe nada.
async function invitaEnSuite(env, correo, nombre) {
  if (!env.INVITAR_EN_SUITE) return { ok: false, error: 'sin_suite' };
  const r = await env.INVITAR_EN_SUITE(correo, nombre);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, detalle: r.detalle };
}
const PORQUE_NO_INVITA = {
  es_miembro: 'Ese correo es de alguien de la empresa en la suite, no de un cliente.',
  en_uso: 'Ese correo ya entra como cliente o personal de otra empresa.',
  sin_suite: 'No hay enlace con la suite desde aquí.',
  sin_empresa: 'No se pudo saber de qué empresa es esta bitácora.',
  app_inactiva: 'quell101 no está prendida para esta empresa en la suite.',
  org_sin_pago: 'La suscripción de la empresa venció. Avísale a quien la administra.',
};

// Qué es esta persona en esta obra. Quien la dirige lo es en todas; a los demás
// se lo dice su membresía, obra por obra: la misma persona es contratista en
// una —donde solo le tocan sus pendientes— y trabajador en otra —donde anda
// todo el día y necesita ver el proyecto completo sin moverle nada—.
const ROLES_OBRA = ['con', 'tra'];
async function rolEnObra(env, user, pid) {
  if (isStaff(user)) return user.role;
  const r = await env.DB.prepare(`SELECT rol FROM quell_project_members WHERE project_id = ? AND user_id = ?`).bind(pid, user.id).first();
  return r ? r.rol : null;
}
// El contratista es el único que ve un pedazo de la obra en vez de la obra.
const soloLoSuyo = (rol) => rol === 'con';

// ¿Este pendiente trae su nombre?
async function leToca(env, user, punchId) {
  if (isStaff(user)) return true;
  const r = await env.DB.prepare(`SELECT 1 FROM quell_punch_items WHERE id = ? AND assignee_id = ?`).bind(punchId, user.id).first();
  return !!r;
}
// ¿Este ítem es suyo? Lo es si está en la lista de contratistas del ítem
// (element_contratistas, desde 0011) O si tiene al menos un pendiente con su
// nombre. La segunda regla conserva lo que ya funcionaba: hoy el contratista
// ve sus pendientes aunque nadie lo haya puesto en la lista del mueble.
async function esSuyo(env, user, elementId) {
  const r = await env.DB.prepare(
    `SELECT 1 AS si WHERE EXISTS (SELECT 1 FROM quell_element_contratistas ec WHERE ec.element_id = ? AND ec.user_id = ?)
                       OR EXISTS (SELECT 1 FROM quell_punch_items k WHERE k.element_id = ? AND k.assignee_id = ?)`,
  ).bind(elementId, user.id, elementId, user.id).first();
  return !!r;
}
// Lo único que un contratista ve de un ítem que no es suyo: para ubicarse en
// el plano. Ni fase, ni pendientes, ni bitácora, ni fotos (decisión 4). El
// recorte pasa aquí, antes de salir del Worker, no al pintar.
const soloUbicacion = (e) => ({ id: e.id, plan_id: e.plan_id, project_id: e.project_id ?? null, code: e.code, name: e.name, type: e.type, x: e.x, y: e.y, ajeno: true,
  n_pend: 0, n_proc: 0, n_total: 0, n_etapas: 0, n_log: 0 });

async function canAccessProject(env, user, projectId) {
  if (isStaff(user)) return true;
  const r = await env.DB.prepare(`SELECT 1 FROM quell_project_members WHERE project_id = ? AND user_id = ?`).bind(projectId, user.id).first();
  return !!r;
}
async function projectOfPlan(env, planId) {
  const r = await env.DB.prepare(`SELECT project_id FROM quell_plans WHERE id = ?`).bind(planId).first();
  return r ? r.project_id : null;
}
async function projectOfElement(env, elementId) {
  const r = await env.DB.prepare(`SELECT p.project_id FROM quell_elements e JOIN quell_plans p ON p.id = e.plan_id WHERE e.id = ?`).bind(elementId).first();
  return r ? r.project_id : null;
}
async function projectOfPunch(env, punchId) {
  const r = await env.DB.prepare(`SELECT p.project_id FROM quell_punch_items k JOIN quell_elements e ON e.id = k.element_id JOIN quell_plans p ON p.id = e.plan_id WHERE k.id = ?`).bind(punchId).first();
  return r ? r.project_id : null;
}

// ---------- etapas ----------
// El camino que recorre un ítem antes de entregarse. La lista vive en la base y
// no aquí porque todavía no está decidida: agregar una etapa es un INSERT.
async function catalogoEtapas(env) {
  const { results } = await env.DB.prepare(`SELECT clave, nombre, orden, abre_punchlist FROM quell_etapas WHERE activa = 1 ORDER BY orden`).all();
  return results;
}

// Marcar una etapa marca también todas las anteriores, y desmarcarla desmarca
// todas las que siguen. El avance de un ítem es un número —tres de cuatro— y
// eso sólo se sostiene si el camino no tiene huecos: nadie fleta lo que no ha
// comprado, y si resulta que no se había comprado, tampoco había salido.
async function marcaEtapa(env, user, eid, clave, hecha) {
  const etapas = await catalogoEtapas(env);
  const i = etapas.findIndex((x) => x.clave === clave);
  if (i < 0) return { error: 'etapa desconocida' };
  const tocadas = hecha ? etapas.slice(0, i + 1) : etapas.slice(i);
  const q = hecha
    ? etapas.slice(0, i + 1).map((x) =>
        env.DB.prepare(`INSERT OR IGNORE INTO quell_element_etapas (element_id, etapa, hecha_en, hecha_por) VALUES (?,?,?,?)`).bind(eid, x.clave, now(), user.id))
    : etapas.slice(i).map((x) =>
        env.DB.prepare(`DELETE FROM quell_element_etapas WHERE element_id = ? AND etapa = ?`).bind(eid, x.clave));
  if (q.length) await env.DB.batch(q);

  // La etapa que abre el punchlist es la bisagra del ítem: al cruzarla cambia
  // de fase, y queda escrito quién la cruzó y cuándo.
  const bisagra = tocadas.find((x) => x.abre_punchlist);
  if (bisagra) {
    if (hecha) await env.DB.prepare(`UPDATE quell_elements SET fase = 'punchlist', entregado_en = ?, entregado_por = ? WHERE id = ?`).bind(now(), user.id, eid).run();
    // Volver atrás no borra los pendientes que ya se levantaron: se quedan
    // guardados y vuelven a la vista en cuanto se entregue otra vez.
    else await env.DB.prepare(`UPDATE quell_elements SET fase = 'produccion', entregado_en = NULL, entregado_por = NULL WHERE id = ?`).bind(eid).run();
  }
  return { ok: true };
}

// Las etapas cumplidas de un puñado de ítems, en una sola consulta.
async function etapasDe(env, ids) {
  if (!ids.length) return {};
  const marcas = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT ee.element_id, ee.etapa, ee.hecha_en, u.name AS hecha_por_nombre
       FROM quell_element_etapas ee JOIN quell_etapas t ON t.clave = ee.etapa AND t.activa = 1
       LEFT JOIN quell_users u ON u.id = ee.hecha_por
      WHERE ee.element_id IN (${marcas}) ORDER BY t.orden`).bind(...ids).all();
  const out = {};
  for (const r of results) (out[r.element_id] = out[r.element_id] || []).push(r);
  return out;
}

// El correo sale por Resend con el remitente de quell101. Fuera de producción
// no sale (igual que en el resto de la suite): el correo de una prueba no lo
// lee nadie y rebota contra el dominio de verdad.
async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) return { dev: true };
  if (!env.CORREO_SALE) return { dev: true, apagado: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'quell101 <onboarding@resend.dev>', to: [to], subject, html }),
  });
  if (!r.ok) throw new Error('mail: ' + (await r.text()));
  return { ok: true };
}

// ---------- operaciones repetidas ----------
// Lo que se escribió sin señal llega con un identificador hecho en el
// dispositivo. Si la señal se cayó justo al terminar de subir, nadie supo si
// llegó, y al reintentar llega otra vez con el mismo identificador: se reconoce
// y no se repite. Sin esto, una foto subida con mala señal aparecería tres
// veces en la bitácora.
/* El código de un ítem es único dentro de su obra, y quien lo impide es un
 * índice de la base (migración 0010), no una revisión de este código: el
 * `MW-07` repetido de Sanje CC 37 entró porque no había ninguna cerradura, y
 * una ruta nueva que se olvide de preguntar vuelve a abrir la puerta.
 *
 * Lo que sí toca aquí es traducir el choque. Sin esto, el supervisor que teclea
 * un código que ya existe ve un «error interno» y no sabe qué hizo mal. */
const esCodigoRepetido = (e) => /UNIQUE constraint failed: quell_elements\.project_id, quell_elements\.code/i.test(String(e?.message || e));

async function conCodigoUnico(hacer, codigo) {
  try {
    return await hacer();
  } catch (e) {
    if (!esCodigoRepetido(e)) throw e;
    return err(`En esta obra ya hay un ítem con el código ${codigo}. Los códigos no se repiten dentro de una misma obra: escoge otro.`, 409);
  }
}

async function yaHecha(env, opId) {
  if (!opId) return false;
  const r = await env.DB.prepare(`SELECT 1 FROM quell_operaciones WHERE id = ?`).bind(opId).first();
  return !!r;
}
async function apunta(env, opId) {
  if (!opId) return;
  await env.DB.prepare(`INSERT OR IGNORE INTO quell_operaciones (id, cuando) VALUES (?,?)`).bind(opId, now()).run();
}

// ---------- photos ----------
async function savePhotos(env, user, ownerType, ownerId, files) {
  const out = [];
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    const id = uid();
    const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const key = `${env.PREFIJO_R2}photos/${ownerType}/${ownerId}/${id}.${ext}`;
    await env.FILES.put(key, f.stream(), { httpMetadata: { contentType: f.type || 'image/jpeg' } });
    await env.DB.prepare(
      `INSERT INTO quell_photos (id, owner_type, owner_id, r2_key, file_name, size, user_id) VALUES (?,?,?,?,?,?,?)`
    ).bind(id, ownerType, ownerId, key, f.name || '', f.size, user.id).run();
    out.push({ id, r2_key: key, file_name: f.name || '', size: f.size, user_id: user.id, created_at: now() });
  }
  return out;
}
async function photosFor(env, ownerType, ids) {
  if (!ids.length) return {};
  const q = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.name AS user_name FROM quell_photos p LEFT JOIN quell_users u ON u.id = p.user_id WHERE p.owner_type = ? AND p.owner_id IN (${q}) ORDER BY p.created_at`
  ).bind(ownerType, ...ids).all();
  const map = {};
  for (const p of results) (map[p.owner_id] ||= []).push(p);
  return map;
}

// Las respuestas y las fotos de un puñado de dudas, en dos consultas: son
// pocas y se leen juntas. Lo usan la lista de la obra y el ítem del cliente.
async function armaDudas(env, dudas) {
  const ids = dudas.map((d) => d.id);
  const porDuda = {};
  if (ids.length) {
    const { results } = await env.DB.prepare(
      `SELECT r.*, u.name AS quien, u.role AS quien_rol FROM quell_duda_respuestas r JOIN quell_users u ON u.id = r.user_id
        WHERE r.duda_id IN (${ids.map(() => '?').join(',')}) ORDER BY r.created_at`).bind(...ids).all();
    for (const r of results) (porDuda[r.duda_id] = porDuda[r.duda_id] || []).push(r);
  }
  dudas.forEach((d) => (d.respuestas = porDuda[d.id] || []));
  const fd = await photosFor(env, 'duda', ids);
  const fr = await photosFor(env, 'duda_resp', Object.values(porDuda).flat().map((r) => r.id));
  dudas.forEach((d) => {
    d.photos = fd[d.id] || [];
    d.respuestas.forEach((r) => (r.photos = fr[r.id] || []));
  });
  return dudas;
}

export async function atender(req, env, url, path) {
  const m = req.method;
  const seg = path.replace(/^\/quell\/?/, '').split('/').filter(Boolean); // después de /quell/

  const user = await usuarioDe(env);
  if (!user) return err('no autorizado', 401);
  if (esCli(user) && !rutaDeCliente(m, seg)) return err('Un cliente ve el plano de su obra y sus puntos por definir; nada más.', 403);

  if (seg[0] === 'me' && m === 'GET') return json({ user: pubUser(user) });

  /* El PIN se puso a la suite, y esta ruta se fue con la puerta vieja.
   *
   * Esto guardaba un PIN en `users.pin_hash` DE ESTA BASE. Desde la mudanza al
   * login de la suite, ese PIN ya no abría nada: la pantalla seguía diciendo
   * «PIN cambiado» y no cambiaba el PIN con el que se entra. Una pantalla que
   * dice que guardó algo y no guarda nada es peor que una pantalla que falta.
   *
   * El PIN de verdad es uno solo para todas las apps y vive en la suite. La
   * pantalla de la bitácora ahora le habla ahí (`POST /s101/auth/pin`), que es
   * lo mismo que ya hacía la pantalla de entrada.
   */

  // ----- users (admin) -----
  if (seg[0] === 'users') {
    if (user.role !== 'admin') return err('sólo administrador', 403);
    if (m === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, email, name, role, company, active, created_at FROM quell_users ORDER BY role, name`).all();
      return json({ users: results });
    }
    if (m === 'POST') {
      const b = await req.json();
      const e = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('correo inválido');
      const ya = await env.DB.prepare(`SELECT id FROM quell_users WHERE email = ?`).bind(e).first();
      if (ya) return err('Ese correo ya está dado de alta.', 409);
      const id = uid();
      await env.DB.prepare(`INSERT INTO quell_users (id, email, name, role, company) VALUES (?,?,?,?,?)`)
        .bind(id, e, b.name || e.split('@')[0], ['admin', 'int', 'con'].includes(b.role) ? b.role : 'con', b.company || '').run();
      return json({ ok: true, id });
    }
    if (m === 'PATCH' && seg[1]) {
      const b = await req.json();
      // Nadie se quita a sí mismo el mando ni se desactiva: si el dueño se
      // baja de rol por error, se queda sin quién dé de alta a nadie y hay que
      // entrar a la base a mano.
      if (seg[1] === user.id && ((b.role && b.role !== user.role) || b.active === false)) {
        return err('No puedes cambiarte el rol ni desactivarte a ti mismo. Que lo haga otro dueño.', 400);
      }
      if (b.role && !['admin', 'int', 'con'].includes(b.role)) return err('rol desconocido');
      await env.DB.prepare(`UPDATE quell_users SET name = COALESCE(?, name), role = COALESCE(?, role), company = COALESCE(?, company), active = COALESCE(?, active) WHERE id = ?`)
        .bind(b.name ?? null, b.role ?? null, b.company ?? null, b.active === undefined ? null : (b.active ? 1 : 0), seg[1]).run();
      return json({ ok: true });
    }
  }

  // ----- clientes (dueño) -----
  // Invitar a un cliente: correo, nombre como va a aparecer aquí, y a qué
  // obras. Va desde la pantalla de inicio, no desde «Usuarios y accesos»
  // (decisión de Mike, 18-sep). Tres cosas en orden: la suite lo deja entrar
  // como cliente (0.15.0), esta base lo apunta como `cli` en esas obras, y le
  // llega el correo. Si la suite dice que no, aquí no se escribe nada.
  if (seg[0] === 'clientes') {
    if (!esDueno(user)) return err('Invitar clientes es del dueño.', 403);
    if (!seg[1] && m === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT u.id, u.email, u.name, u.active, u.created_at,
                (SELECT GROUP_CONCAT(p.name, ' · ') FROM quell_project_members pm JOIN quell_projects p ON p.id = pm.project_id WHERE pm.user_id = u.id AND pm.rol = 'cli') AS obras
           FROM quell_users u WHERE u.role = 'cli' ORDER BY u.name`).all();
      return json({ clientes: results });
    }
    if (seg[1] === 'invitar' && m === 'POST') {
      const b = await req.json();
      const e = String(b.email || '').trim().toLowerCase();
      const nombre = String(b.name || '').trim().slice(0, 120);
      const pids = [...new Set((Array.isArray(b.project_ids) ? b.project_ids : []).map(String).filter(Boolean))];
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return err('correo inválido');
      if (!nombre) return err('Escribe cómo se va a llamar aquí.');
      if (!pids.length) return err('Elige al menos una obra.');
      const obras = [];
      for (const pid of pids) {
        const o = await env.DB.prepare(`SELECT id, name, client FROM quell_projects WHERE id = ?`).bind(pid).first();
        if (!o) return err('Una de las obras no existe.', 400);
        obras.push(o);
      }
      const ya = await env.DB.prepare(`SELECT * FROM quell_users WHERE email = ?`).bind(e).first();
      if (ya && ya.role !== 'cli') return err('Ese correo ya es de alguien del taller, no de un cliente.', 409);

      const suite = await invitaEnSuite(env, e, nombre);
      if (!suite.ok) return err(PORQUE_NO_INVITA[suite.error] || `La suite no dejó invitar (${suite.error}).`, suite.error === 'es_miembro' || suite.error === 'en_uso' ? 409 : 502);

      let id = ya ? ya.id : uid();
      if (!ya) {
        await env.DB.prepare(`INSERT INTO quell_users (id, email, name, role, company) VALUES (?,?,?,?,?)`).bind(id, e, nombre, 'cli', '').run();
      } else {
        await env.DB.prepare(`UPDATE quell_users SET name = ?, active = 1 WHERE id = ?`).bind(nombre, id).run();
      }
      await env.DB.batch(obras.map((o) =>
        env.DB.prepare(`INSERT INTO quell_project_members (project_id, user_id, rol) VALUES (?,?,'cli') ON CONFLICT (project_id, user_id) DO UPDATE SET rol = 'cli'`).bind(o.id, id)));
      const correo = await invitaCliente(env, req, { email: e, name: nombre }, obras);
      return json({ ok: true, id, nuevo: !ya, obras: obras.length, suite: suite.data, aviso: correo.ok ? null : correo.error });
    }
    return err('ruta no encontrada', 404);
  }

  // ----- projects -----
  if (seg[0] === 'projects') {
    if (!seg[1]) {
      if (m === 'GET') {
        // El cliente ve sus obras, y el número de cada tarjeta son los puntos
        // que el taller le pidió definir y siguen sin respuesta.
        if (esCli(user)) {
          const { results } = await env.DB.prepare(
            `SELECT p.id, p.name, p.client, p.status, pm.rol AS mi_rol,
               (SELECT COUNT(*) FROM quell_dudas d WHERE d.project_id = p.id AND d.para = 'cliente' AND d.estado = 'abierta') AS open_count
             FROM quell_projects p JOIN quell_project_members pm ON pm.project_id = p.id AND pm.user_id = ? AND pm.rol = 'cli' ORDER BY p.status, p.name`).bind(user.id).all();
          return json({ projects: results });
        }
        // Quien no dirige la obra ve nada más las obras donde está metido. Y el
        // número que trae cada tarjeta depende de qué sea ahí: al contratista
        // se le cuentan sus pendientes, no los de todos —si le aparece 40 y
        // suyos son 3, el tablero le miente—; al trabajador, que ve la obra
        // completa, se le cuentan todos.
        const sql = isStaff(user)
          ? `SELECT p.*, (SELECT COUNT(*) FROM quell_punch_items k JOIN quell_elements e ON e.id=k.element_id JOIN quell_plans pl ON pl.id=e.plan_id WHERE pl.project_id=p.id AND k.status!='ok') AS open_count FROM quell_projects p ORDER BY p.status, p.name`
          : `SELECT p.*, pm.rol AS mi_rol,
               (SELECT COUNT(*) FROM quell_punch_items k JOIN quell_elements e ON e.id=k.element_id JOIN quell_plans pl ON pl.id=e.plan_id
                 WHERE pl.project_id=p.id AND k.status!='ok' AND (pm.rol <> 'con' OR k.assignee_id=?)) AS open_count
             FROM quell_projects p JOIN quell_project_members pm ON pm.project_id=p.id AND pm.user_id=? ORDER BY p.status, p.name`;
        const stmt = isStaff(user) ? env.DB.prepare(sql) : env.DB.prepare(sql).bind(user.id, user.id);
        const { results } = await stmt.all();
        return json({ projects: results });
      }
      if (m === 'POST') {
        if (!isStaff(user)) return err('sin permiso', 403);
        const b = await req.json();
        if (!b.name) return err('nombre requerido');
        const id = uid();
        await env.DB.prepare(`INSERT INTO quell_projects (id, name, client, created_by) VALUES (?,?,?,?)`).bind(id, b.name, b.client || '', user.id).run();
        return json({ ok: true, id });
      }
    }
    const pid = seg[1];
    if (!(await canAccessProject(env, user, pid))) return err('sin acceso al proyecto', 403);

    if (!seg[2] && m === 'GET') {
      const project = await env.DB.prepare(`SELECT * FROM quell_projects WHERE id = ?`).bind(pid).first();
      if (!project) return err('no encontrado', 404);
      const { results: plans } = await env.DB.prepare(`SELECT * FROM quell_plans WHERE project_id = ? ORDER BY sort, created_at`).bind(pid).all();
      // El cliente: todos los ítems del plano, pero sólo para ubicarse (código,
      // nombre, tipo, posición), resaltados los que tienen puntos por definir
      // (decisiones 3 y 4). Ni fase, ni pendientes, ni bitácora, ni quién anda
      // en la obra. El recorte pasa aquí, no al pintar.
      if (esCli(user)) {
        const { results: crudos } = await env.DB.prepare(
          `SELECT e.id, e.plan_id, e.project_id, e.code, e.name, e.type, e.x, e.y,
             (SELECT COUNT(*) FROM quell_dudas d WHERE d.element_id = e.id AND d.para = 'cliente' AND d.estado = 'abierta') AS definir
           FROM quell_elements e JOIN quell_plans p ON p.id = e.plan_id WHERE p.project_id = ? ORDER BY e.code`).bind(pid).all();
        const elements = crudos.map((e) => ({ ...soloUbicacion(e), definir: e.definir }));
        const abiertas = await env.DB.prepare(`SELECT COUNT(*) AS n FROM quell_dudas WHERE project_id = ? AND para = 'cliente' AND estado = 'abierta'`).bind(pid).first();
        return json({ project: { id: project.id, name: project.name, client: project.client, status: project.status }, plans, elements, members: [],
                      mi_rol: 'cli', mios: elements.filter((e) => e.definir > 0).map((e) => e.id), dudas_abiertas: abiertas ? abiertas.n : 0, etapas: [] });
      }
      // Al contratista solo le salen en el plano los elementos donde tiene algo
      // asignado, y los números de cada pin cuentan lo suyo. Lo demás no es
      // asunto suyo y de paso no se pierde entre cien pines que no le tocan.
      const mio = soloLoSuyo(await rolEnObra(env, user, pid));
      // Desde 0011 el contratista ve TODOS los ítems del plano, con los suyos
      // resaltados (decisión 3). De los ajenos sólo lo necesario para
      // ubicarse; de los suyos, todo, con los pendientes de los demás
      // contratistas del mismo mueble (decisión 5).
      const { results: crudos } = mio
        ? await env.DB.prepare(
            `SELECT e.*,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='pend') AS n_pend,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='proc') AS n_proc,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id) AS n_total,
               (SELECT COUNT(*) FROM quell_element_etapas ee JOIN quell_etapas t ON t.clave=ee.etapa AND t.activa=1 WHERE ee.element_id=e.id) AS n_etapas,
               0 AS n_log,
               (EXISTS (SELECT 1 FROM quell_element_contratistas ec WHERE ec.element_id=e.id AND ec.user_id=?)
                OR EXISTS (SELECT 1 FROM quell_punch_items k WHERE k.element_id=e.id AND k.assignee_id=?)) AS suyo
             FROM quell_elements e JOIN quell_plans p ON p.id = e.plan_id
             WHERE p.project_id = ?
             ORDER BY e.code`
          ).bind(user.id, user.id, pid).all()
        : await env.DB.prepare(
            `SELECT e.*,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='pend') AS n_pend,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='proc') AS n_proc,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id) AS n_total,
               (SELECT COUNT(*) FROM quell_element_etapas ee JOIN quell_etapas t ON t.clave=ee.etapa AND t.activa=1 WHERE ee.element_id=e.id) AS n_etapas,
               (SELECT COUNT(*) FROM quell_log_entries l WHERE l.element_id=e.id) AS n_log
             FROM quell_elements e JOIN quell_plans p ON p.id = e.plan_id WHERE p.project_id = ? ORDER BY e.code`
          ).bind(pid).all();
      const mios = mio ? crudos.filter((e) => e.suyo).map((e) => e.id) : null;
      const elements = mio ? crudos.map((e) => (e.suyo ? { ...e, suyo: undefined } : soloUbicacion(e))) : crudos;
      // Quién más anda en la obra es cosa de quien la dirige.
      const { results: members } = mio
        ? { results: [] }
        : await env.DB.prepare(`SELECT u.id, u.name, u.email, u.role, u.company, pm.rol AS rol_obra FROM quell_project_members pm JOIN quell_users u ON u.id = pm.user_id WHERE pm.project_id = ?`).bind(pid).all();
      // Cuántas dudas están esperando respuesta: quien dirige ve las de todos,
      // quien pregunta ve las suyas. Va aquí y no en otra llamada porque es un
      // número que se pinta junto al resto de la pantalla.
      const qd = env.DB.prepare(`SELECT COUNT(*) AS n FROM quell_dudas WHERE project_id = ? AND estado = 'abierta' ${isStaff(user) ? '' : 'AND user_id = ?'}`);
      const abiertas = await (isStaff(user) ? qd.bind(pid) : qd.bind(pid, user.id)).first();
      return json({ project, plans, elements, members, mi_rol: await rolEnObra(env, user, pid), mios,
                    dudas_abiertas: abiertas ? abiertas.n : 0, etapas: await catalogoEtapas(env) });
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`UPDATE quell_projects SET name = COALESCE(?, name), client = COALESCE(?, client), status = COALESCE(?, status) WHERE id = ?`).bind(b.name ?? null, b.client ?? null, b.status ?? null, pid).run();
      return json({ ok: true });
    }
    // Borrar una obra es del dueño, y se lleva todo lo que cuelga de ella:
    // planos, ítems, bitácora, pendientes, dudas (llaves foráneas en cascada)
    // y sus archivos del bucket. No hay papelera: cerrar una obra (status
    // 'cerrado') es lo que se hace con una obra que terminó; esto es para la
    // que se creó por error o para limpiar una de prueba.
    if (!seg[2] && m === 'DELETE') {
      if (!esDueno(user)) return err('Borrar una obra es del dueño.', 403);
      // Las llaves del bucket, consulta por consulta (el SQLite del objeto no
      // acepta más de un puñado de UNION en una sola).
      const llaves = [];
      const suma = async (sql) => { const { results } = await env.DB.prepare(sql).bind(pid).all(); for (const f of results) if (f.k) llaves.push(f.k); };
      await suma(`SELECT image_key AS k FROM quell_plans WHERE project_id = ?`);
      await suma(`SELECT source_key AS k FROM quell_plans WHERE project_id = ? AND source_key IS NOT NULL`);
      await suma(`SELECT f.r2_key AS k FROM quell_photos f JOIN quell_log_entries l ON f.owner_type = 'log' AND f.owner_id = l.id JOIN quell_elements e ON e.id = l.element_id WHERE e.project_id = ?`);
      await suma(`SELECT f.r2_key AS k FROM quell_photos f JOIN quell_punch_items p ON f.owner_type = 'punch' AND f.owner_id = p.id JOIN quell_elements e ON e.id = p.element_id WHERE e.project_id = ?`);
      await suma(`SELECT f.r2_key AS k FROM quell_photos f JOIN quell_dudas d ON f.owner_type = 'duda' AND f.owner_id = d.id WHERE d.project_id = ?`);
      await suma(`SELECT f.r2_key AS k FROM quell_photos f JOIN quell_duda_respuestas r ON f.owner_type = 'duda_resp' AND f.owner_id = r.id JOIN quell_dudas d ON d.id = r.duda_id WHERE d.project_id = ?`);
      await env.DB.prepare(`DELETE FROM quell_projects WHERE id = ?`).bind(pid).run();
      for (const k of llaves) await env.FILES.delete(k).catch(() => {});
      return json({ ok: true, archivos: llaves.length });
    }
    if (seg[2] === 'members' && m === 'POST') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      const rol = ROLES_OBRA.includes(b.rol) ? b.rol : 'con';
      // Si ya estaba, esto es cambiarle el rol y no invitarlo: el correo sale
      // una sola vez, la primera. Si no, cada ajuste sería un correo más.
      const yaEstaba = await env.DB.prepare(`SELECT 1 FROM quell_project_members WHERE project_id = ? AND user_id = ?`).bind(pid, b.user_id).first();
      await env.DB.prepare(
        `INSERT INTO quell_project_members (project_id, user_id, rol) VALUES (?,?,?)
         ON CONFLICT (project_id, user_id) DO UPDATE SET rol = excluded.rol`).bind(pid, b.user_id, rol).run();
      let aviso = null;
      if (!yaEstaba) {
        const quien = await env.DB.prepare(`SELECT id, email, name FROM quell_users WHERE id = ?`).bind(b.user_id).first();
        const obra = await env.DB.prepare(`SELECT name, client FROM quell_projects WHERE id = ?`).bind(pid).first();
        if (quien && obra) { const r = await invita(env, req, quien, obra, rol); if (!r.ok) aviso = r.error; }
      }
      return json({ ok: true, rol, invitado: !yaEstaba, aviso });
    }
    if (seg[2] === 'members' && m === 'DELETE' && seg[3]) {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM quell_project_members WHERE project_id = ? AND user_id = ?`).bind(pid, seg[3]).run();
      return json({ ok: true });
    }
    if (seg[2] === 'plans' && m === 'POST') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const fd = await req.formData();
      const image = fd.get('image');
      if (!(image instanceof File)) return err('imagen del plano requerida');
      const id = uid();
      const imageKey = `${env.PREFIJO_R2}plans/${pid}/${id}.png`;
      await env.FILES.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type || 'image/png' } });
      let sourceKey = null;
      const source = fd.get('source');
      if (source instanceof File && source.size) {
        sourceKey = `${env.PREFIJO_R2}plans/${pid}/${id}-src.${(source.name.split('.').pop() || 'pdf').toLowerCase()}`;
        await env.FILES.put(sourceKey, source.stream(), { httpMetadata: { contentType: source.type || 'application/pdf' } });
      }
      const sort = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS s FROM quell_plans WHERE project_id = ?`).bind(pid).first();
      await env.DB.prepare(`INSERT INTO quell_plans (id, project_id, name, file_name, image_key, source_key, width, height, sort) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(id, pid, fd.get('name') || 'Plano', fd.get('file_name') || '', imageKey, sourceKey, +fd.get('width') || 0, +fd.get('height') || 0, sort.s).run();
      return json({ ok: true, id, image_key: imageKey });
    }
    // Avisarle al cliente que tiene puntos por definir: un correo por cliente
    // de la obra, cuando el taller aprieta el botón. Nada automático por punto.
    if (seg[2] === 'avisar-cliente' && m === 'POST') {
      if (!isStaff(user)) return err('Avisarle al cliente es de quien dirige la obra.', 403);
      const b = await req.json().catch(() => ({}));
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const obra = await env.DB.prepare(`SELECT id, name, client FROM quell_projects WHERE id = ?`).bind(pid).first();
      const cuantos = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM quell_dudas WHERE project_id = ? AND para = 'cliente' AND estado = 'abierta'`).bind(pid).first())?.n || 0;
      if (!cuantos) return err('No hay puntos abiertos para el cliente en esta obra.', 400);
      const { results: clientes } = await env.DB.prepare(
        `SELECT u.id, u.email, u.name FROM quell_project_members pm JOIN quell_users u ON u.id = pm.user_id WHERE pm.project_id = ? AND pm.rol = 'cli' AND u.active = 1`).bind(pid).all();
      if (!clientes.length) return err('Esta obra no tiene cliente invitado. Invítalo desde la pantalla de inicio.', 400);
      let enviados = 0; const avisos = [];
      for (const c of clientes) {
        const r = await avisaCliente(env, req, c, obra, cuantos);
        if (r.ok) enviados++; else avisos.push(`${c.email}: ${r.error}`);
      }
      await apunta(env, b.op_id);
      return json({ ok: true, puntos: cuantos, enviados, aviso: avisos.length ? avisos.join(' · ') : null });
    }

    // ----- dudas -----
    // La cola del supervisor: preguntas de obra, la más vieja primero, y se van
    // cerrando. Quien pregunta ve nada más las suyas; quien dirige, todas.
    //
    // El cliente ve SÓLO las marcadas para él, todas las de su obra: las que
    // el taller le pidió definir y las que él mismo abrió. Ni una interna (B.3).
    if (seg[2] === 'dudas' && m === 'GET') {
      const todas = isStaff(user);
      const cli = esCli(user);
      const q = env.DB.prepare(
        `SELECT d.*, u.name AS quien, u.company AS quien_empresa, u.role AS quien_rol, e.code AS element_code, e.name AS element_name, e.plan_id,
                r.name AS resuelta_por_nombre
           FROM quell_dudas d JOIN quell_users u ON u.id = d.user_id
           LEFT JOIN quell_elements e ON e.id = d.element_id
           LEFT JOIN quell_users r ON r.id = d.resuelta_por
          WHERE d.project_id = ? ${cli ? "AND d.para = 'cliente'" : todas ? '' : 'AND d.user_id = ?'}
          ORDER BY CASE d.estado WHEN 'abierta' THEN 0 ELSE 1 END, d.created_at`);
      const { results: dudas } = await (todas || cli ? q.bind(pid) : q.bind(pid, user.id)).all();
      await armaDudas(env, dudas);
      return json({ dudas });
    }
    // Preguntar puede cualquiera que esté en la obra, incluido quien la dirige.
    // A quién va: lo que abre el cliente es para el cliente; lo que abre quien
    // dirige es para el cliente sólo si lo marca; lo demás, del taller.
    if (seg[2] === 'dudas' && m === 'POST') {
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const texto = String(fd.get('texto') || '').trim();
      const files = fd.getAll('photos');
      if (!texto && !files.length) return err('Escribe la duda o manda una foto.');
      // Si la duda viene colgada de un ítem, que sea un ítem de esta obra: si no,
      // se podría preguntar sobre lo que hay en la obra de al lado.
      let eid = fd.get('element_id') || null;
      if (eid && (await projectOfElement(env, eid)) !== pid) eid = null;
      const para = esCli(user) ? 'cliente' : isStaff(user) && fd.get('para') === 'cliente' ? 'cliente' : 'taller';
      const id = uid();
      await env.DB.prepare(`INSERT INTO quell_dudas (id, project_id, element_id, user_id, texto, para) VALUES (?,?,?,?,?,?)`)
        .bind(id, pid, eid, user.id, texto, para).run();
      const photos = await savePhotos(env, user, 'duda', id, files);
      await apunta(env, op);
      return json({ ok: true, id, photos, para });
    }

    if (seg[2] === 'punch' && m === 'GET') {
      const open = url.searchParams.get('status') !== 'all';
      const solo = soloLoSuyo(await rolEnObra(env, user, pid)) ? 'AND k.assignee_id = ?' : '';
      const q = env.DB.prepare(
        `SELECT k.*, e.code AS element_code, e.name AS element_name, e.plan_id, pl.name AS plan_name
         FROM quell_punch_items k JOIN quell_elements e ON e.id = k.element_id JOIN quell_plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ${open ? "AND k.status != 'ok'" : ''} ${solo}
         ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`
      );
      const { results } = await (solo ? q.bind(pid, user.id) : q.bind(pid)).all();
      return json({ items: results });
    }
    // reporte: todo lo del proyecto (bitácora + punchlist + fotos) para armar el PDF en el cliente
    if (seg[2] === 'report' && m === 'GET') {
      // El reporte es la foto completa de la obra: bitácora, pendientes de
      // todos y fotos de todos. No es del contratista.
      if (!isStaff(user)) return err('El reporte lo saca el supervisor.', 403);
      const { results: logs } = await env.DB.prepare(
        `SELECT l.*, COALESCE(u.name, 'Suite 101') AS user_name, COALESCE(u.role, 'sys') AS user_role, e.code AS element_code, e.name AS element_name, e.type AS element_type, e.resp AS element_resp, e.x, e.y, e.plan_id, pl.name AS plan_name, pl.file_name AS plan_file, pl.image_key, pl.width AS plan_w, pl.height AS plan_h
         FROM quell_log_entries l LEFT JOIN quell_users u ON u.id = l.user_id JOIN quell_elements e ON e.id = l.element_id JOIN quell_plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ORDER BY l.created_at`
      ).bind(pid).all();
      const { results: punch } = await env.DB.prepare(
        `SELECT k.*, e.code AS element_code, e.name AS element_name, e.type AS element_type, e.x, e.y, e.plan_id, pl.name AS plan_name, pl.file_name AS plan_file, pl.image_key, pl.width AS plan_w, pl.height AS plan_h
         FROM quell_punch_items k JOIN quell_elements e ON e.id = k.element_id JOIN quell_plans pl ON pl.id = e.plan_id
         WHERE pl.project_id = ? ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`
      ).bind(pid).all();
      const lp = await photosFor(env, 'log', logs.map((l) => l.id));
      const kp = await photosFor(env, 'punch', punch.map((k) => k.id));
      logs.forEach((l) => (l.photos = lp[l.id] || []));
      punch.forEach((k) => (k.photos = kp[k.id] || []));
      return json({ logs, punch });
    }
  }

  // ----- plans -----
  if (seg[0] === 'plans' && seg[1]) {
    const pid = await projectOfPlan(env, seg[1]);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (seg[2] === 'elements' && m === 'POST') {
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      if (!isStaff(user)) return err('Los elementos los levanta el supervisor.', 403);
      if (!b.name) return err('nombre requerido');
      const id = b.op_id && /^[0-9a-f-]{36}$/i.test(b.op_id) ? b.op_id : uid();
      // La obra se guarda en el ítem, no se deduce pasando por el plano en cada
      // consulta. Y es lo que hace que la cerradura del código sirva: sin obra,
      // SQLite trata los nulos como distintos y el ítem nuevo se le escaparía.
      const tipo = b.type || 'Otro';
      let codigo = String(b.code || '').trim();
      // Si la pantalla no propuso código y el tipo lleva prefijo, se propone
      // aquí con la misma regla, por obra (una app vieja, o una operación de la
      // fila que salió sin él).
      if (!codigo && PREFIJOS[tipo]) {
        const { results: delaObra } = await env.DB.prepare(`SELECT code FROM quell_elements WHERE project_id = ?`).bind(pid).all();
        codigo = siguienteCodigo(delaObra, tipo);
      }
      /* De qué ítem vendido es esta pieza (migración 0011). Viene de la lista
       * de «ítems sin ubicar»: se escoge el ítem y se pica en el plano.
       *
       * Se comprueba aquí, en el servidor, que el ítem sea del proyecto
       * ligado a ESTA obra —si no, una pieza podría colgarse de la venta de
       * otra casa— y que todavía falten piezas por poner de él. Sin `item_id`
       * todo sigue igual: una obra puede tener piezas que nadie cotizó. */
      let itemId = null;
      if (b.item_id) {
        const fila = await env.DB.prepare(
          `SELECT i.id AS id, i.cantidad AS cantidad,
                  (SELECT COUNT(*) FROM quell_elements e WHERE e.item_id = i.id) AS ubicados
             FROM items i JOIN quell_projects o ON o.proyecto_id = i.proyecto_id
            WHERE i.id = ? AND o.id = ? AND i.estado = 'vendido'`).bind(b.item_id, pid).first();
        if (!fila) return err('ese ítem no es de esta obra', 400);
        if (Number(fila.ubicados) >= Number(fila.cantidad || 1)) return err('de ese ítem ya no falta ninguno por ubicar', 409);
        itemId = fila.id;
      }
      // Nace en producción: todavía no hay nada entregado que corregir.
      const alta = await conCodigoUnico(async () => {
        await env.DB.prepare(`INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, resp, x, y, created_by, item_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, seg[1], pid, codigo, tipo, b.name, b.resp || '', +b.x, +b.y, user.id, itemId).run();
        await apunta(env, b.op_id);
        return json({ ok: true, id, code: codigo, item_id: itemId });
      }, codigo);
      return alta;
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`UPDATE quell_plans SET name = COALESCE(?, name), sort = COALESCE(?, sort) WHERE id = ?`).bind(b.name ?? null, b.sort ?? null, seg[1]).run();
      return json({ ok: true });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM quell_plans WHERE id = ?`).bind(seg[1]).run();
      return json({ ok: true });
    }
  }

  // ----- elements -----
  if (seg[0] === 'elements' && seg[1]) {
    const eid = seg[1];
    const pid = await projectOfElement(env, eid);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!seg[2] && m === 'GET') {
      const mio = soloLoSuyo(await rolEnObra(env, user, pid));
      const element = await env.DB.prepare(`SELECT e.*, pl.name AS plan_name FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id WHERE e.id = ?`).bind(eid).first();
      if (!element) return err('no encontrado', 404);
      // El cliente: el ítem para ubicarse y sus puntos por definir, y nada más
      // (decisión 4). Ni fase, ni pendientes, ni bitácora, ni responsable.
      if (esCli(user)) {
        const { results: dudas } = await env.DB.prepare(
          `SELECT d.*, u.name AS quien, u.role AS quien_rol, r.name AS resuelta_por_nombre
             FROM quell_dudas d JOIN quell_users u ON u.id = d.user_id LEFT JOIN quell_users r ON r.id = d.resuelta_por
            WHERE d.element_id = ? AND d.para = 'cliente'
            ORDER BY CASE d.estado WHEN 'abierta' THEN 0 ELSE 1 END, d.created_at`).bind(eid).all();
        await armaDudas(env, dudas);
        return json({ element: { ...soloUbicacion(element), plan_name: element.plan_name }, recorte: true, cliente: true, dudas, log: [], punch: [], etapas: [], hechas: [] });
      }
      // Un ítem que no es suyo: sólo para ubicarse (decisión 4). El recorte se
      // hace aquí, y nada más sale: ni un pendiente, ni un renglón, ni una foto.
      if (mio && !(await esSuyo(env, user, eid))) {
        return json({ element: { ...soloUbicacion(element), plan_name: element.plan_name }, recorte: true, log: [], punch: [], etapas: [], hechas: [] });
      }
      // Un ítem suyo lo ve completo (decisión 5): los pendientes de todos los
      // contratistas del mueble, la bitácora, las fotos, la fase y las etapas.
      /* LEFT JOIN, y no JOIN: desde la migración 0013 una entrada puede no
         * tener persona —la escribió el sistema cuando cambió el precio en
         * dash101—. Con un JOIN normal esas entradas DESAPARECÍAN de la
         * bitácora sin que nada fallara, que es la peor forma de perderlas. */
      const { results: log } = await env.DB.prepare(`SELECT l.*, COALESCE(u.name, 'Suite 101') AS user_name, COALESCE(u.role, 'sys') AS user_role FROM quell_log_entries l LEFT JOIN quell_users u ON u.id = l.user_id WHERE l.element_id = ? ORDER BY l.created_at`).bind(eid).all();
      const qp = env.DB.prepare(`SELECT k.*, u.name AS created_by_name, a.name AS assignee_name, a.company AS assignee_company
         FROM quell_punch_items k LEFT JOIN quell_users u ON u.id = k.created_by LEFT JOIN quell_users a ON a.id = k.assignee_id
         WHERE k.element_id = ?
         ORDER BY CASE k.status WHEN 'pend' THEN 0 WHEN 'proc' THEN 1 ELSE 2 END, k.due_date`);
      const { results: punch } = await qp.bind(eid).all();
      const lp = await photosFor(env, 'log', log.map((l) => l.id));
      const kp = await photosFor(env, 'punch', punch.map((k) => k.id));
      log.forEach((l) => (l.photos = lp[l.id] || []));
      punch.forEach((k) => (k.photos = kp[k.id] || []));
      const etapas = await catalogoEtapas(env);
      const { results: contratistas } = await env.DB.prepare(
        `SELECT u.id, u.name, u.company, ec.asignado_at FROM quell_element_contratistas ec JOIN quell_users u ON u.id = ec.user_id WHERE ec.element_id = ? ORDER BY u.name`,
      ).bind(eid).all();
      return json({ element, log, punch, etapas, hechas: (await etapasDe(env, [eid]))[eid] || [], contratistas });
    }
    // Los contratistas de un ítem. Los pone quien dirige la obra, como en
    // «Quién entra a cada obra». Se manda la lista completa: lo que no venga,
    // se quita. Asignar dos veces al mismo no duplica (llave compuesta).
    if (seg[2] === 'contratistas' && m === 'PUT') {
      if (!isStaff(user)) return err('Los contratistas de un ítem los pone quien dirige la obra.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const ids = [...new Set((Array.isArray(b.user_ids) ? b.user_ids : []).map(String).filter(Boolean))];
      for (const uidC of ids) {
        const q = await env.DB.prepare(
          `SELECT u.id, u.role, u.active, (SELECT 1 FROM quell_project_members pm WHERE pm.project_id = ? AND pm.user_id = u.id) AS en_obra FROM quell_users u WHERE u.id = ?`,
        ).bind(pid, uidC).first();
        if (!q || !q.active) return err('Ese contratista no existe o está dado de baja.', 400);
        if (q.role !== 'con') return err('Sólo se asignan contratistas (rol con).', 400);
        if (!q.en_obra) return err('Primero dale acceso a la obra en «Quién entra a cada obra»; luego lo asignas al ítem.', 400);
      }
      const ops = [env.DB.prepare(`DELETE FROM quell_element_contratistas WHERE element_id = ?${ids.length ? ` AND user_id NOT IN (${ids.map(() => '?').join(',')})` : ''}`).bind(eid, ...ids)];
      for (const uidC of ids) {
        ops.push(env.DB.prepare(`INSERT INTO quell_element_contratistas (element_id, user_id, asignado_por) VALUES (?,?,?) ON CONFLICT (element_id, user_id) DO NOTHING`).bind(eid, uidC, user.id));
      }
      await env.DB.batch(ops);
      await apunta(env, b.op_id);
      const { results: contratistas } = await env.DB.prepare(
        `SELECT u.id, u.name, u.company, ec.asignado_at FROM quell_element_contratistas ec JOIN quell_users u ON u.id = ec.user_id WHERE ec.element_id = ? ORDER BY u.name`,
      ).bind(eid).all();
      return json({ ok: true, contratistas });
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('El contratista no edita elementos.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const codigo = b.code === undefined || b.code === null ? null : String(b.code).trim();
      // Reubicar: sólo cambian x y y, que ya existen. Pasa por la fila (op_id)
      // para que funcione sin señal, y deja constancia en la bitácora del
      // ítem: quién lo movió y cuándo (encargo A.4).
      const reubica = b.reubicar === true && typeof b.x === 'number' && typeof b.y === 'number';
      return await conCodigoUnico(async () => {
        await env.DB.prepare(`UPDATE quell_elements SET code = COALESCE(?, code), type = COALESCE(?, type), name = COALESCE(?, name), resp = COALESCE(?, resp), x = COALESCE(?, x), y = COALESCE(?, y) WHERE id = ?`)
          .bind(codigo, b.type ?? null, b.name ?? null, b.resp ?? null, b.x ?? null, b.y ?? null, eid).run();
        if (reubica) {
          await env.DB.prepare(`INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES (?,?,?,?,?)`)
            .bind(uid(), eid, user.id, 'trabajo', 'Reubicado en el plano.').run();
        }
        await apunta(env, b.op_id);
        return json({ ok: true });
      }, codigo);
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM quell_elements WHERE id = ?`).bind(eid).run();
      return json({ ok: true });
    }
    // Palomear o despalomear una etapa del proceso del ítem.
    if (seg[2] === 'etapas' && m === 'POST') {
      if (!isStaff(user)) return err('El avance del ítem lo lleva el supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const r = await marcaEtapa(env, user, eid, String(b.clave || ''), !!b.hecha);
      if (r.error) return err(r.error, 400);
      await apunta(env, b.op_id);
      return json({ ok: true });
    }
    // Entregar el ítem, o devolverlo a producción si se entregó por error. Es
    // la etapa que abre el punchlist, así que pasa por el mismo camino que las
    // demás: entregar da por cumplidas las anteriores —lo entregado se compró,
    // se fletó y se instaló— y devolverlo a producción las deja como estaban.
    if (seg[2] === 'fase' && m === 'POST') {
      if (!isStaff(user)) return err('Entregar un ítem es del supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const fase = b.fase === 'punchlist' ? 'punchlist' : 'produccion';
      const bisagra = (await catalogoEtapas(env)).find((x) => x.abre_punchlist);
      if (!bisagra) return err('no hay etapa de entrega configurada', 500);
      const r = await marcaEtapa(env, user, eid, bisagra.clave, fase === 'punchlist');
      if (r.error) return err(r.error, 400);
      await apunta(env, b.op_id);
      return json({ ok: true, fase });
    }
    if (seg[2] === 'log' && m === 'POST') {
      if (!isStaff(user)) return err('El contratista sube su evidencia en el pendiente que le toca, no en la bitácora.', 403);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const text = String(fd.get('text') || '').trim();
      const files = fd.getAll('photos');
      if (!text && !files.length) return err('texto o foto requerido');
      const id = uid();
      const kind = ['trabajo', 'arreglo', 'acuerdo'].includes(fd.get('kind')) ? fd.get('kind') : 'trabajo';
      await env.DB.prepare(`INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES (?,?,?,?,?)`).bind(id, eid, user.id, kind, text).run();
      const photos = await savePhotos(env, user, 'log', id, files);
      await apunta(env, op);
      return json({ ok: true, id, photos });
    }
    if (seg[2] === 'punch' && m === 'POST') {
      if (!isStaff(user)) return err('Los pendientes los levanta el supervisor.', 403);
      const el = await env.DB.prepare(`SELECT fase FROM quell_elements WHERE id = ?`).bind(eid).first();
      if (el && el.fase !== 'punchlist') {
        return err('Este ítem sigue en producción. Entrégalo y entonces se le levantan pendientes.', 409, { falta_entregar: true });
      }
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const title = String(fd.get('title') || '').trim();
      if (!title) return err('título requerido');
      // A quién le toca. Tiene que ser alguien que ya esté en esta obra: si no,
      // el pendiente le aparecería a alguien que no puede ni abrir el proyecto.
      let asignado = String(fd.get('assignee_id') || '') || null;
      if (asignado) {
        const ok = await env.DB.prepare(`SELECT 1 FROM quell_project_members WHERE project_id = ? AND user_id = ?`).bind(pid, asignado).first();
        if (!ok) return err('Esa persona no está dada de alta en esta obra.', 400);
      }
      const id = uid();
      await env.DB.prepare(`INSERT INTO quell_punch_items (id, element_id, title, description, resp, due_date, created_by, assignee_id) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(id, eid, title, fd.get('description') || '', fd.get('resp') || '', fd.get('due_date') || null, user.id, asignado).run();
      const photos = await savePhotos(env, user, 'punch', id, fd.getAll('photos'));
      await apunta(env, op);
      return json({ ok: true, id, photos });
    }
  }

  // ----- dudas -----
  if (seg[0] === 'dudas' && seg[1]) {
    const d = await env.DB.prepare(`SELECT * FROM quell_dudas WHERE id = ?`).bind(seg[1]).first();
    if (!d || !(await canAccessProject(env, user, d.project_id))) return err('sin acceso', 403);
    // Contesta quien dirige la obra, y también quien preguntó: media respuesta
    // casi siempre necesita una aclaración de vuelta.
    if (seg[2] === 'respuestas' && m === 'POST') {
      // El cliente contesta sólo lo que es para él: una duda interna no es suya
      // ni aunque adivine el id.
      if (esCli(user) && d.para !== 'cliente') return err('sin acceso', 403);
      if (!isStaff(user) && !esCli(user) && d.user_id !== user.id) return err('Esta duda no es tuya.', 403);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const texto = String(fd.get('texto') || '').trim();
      const files = fd.getAll('photos');
      if (!texto && !files.length) return err('Escribe la respuesta o manda una foto.');
      const id = uid();
      await env.DB.prepare(`INSERT INTO quell_duda_respuestas (id, duda_id, user_id, texto) VALUES (?,?,?,?)`).bind(id, seg[1], user.id, texto).run();
      const photos = await savePhotos(env, user, 'duda_resp', id, files);
      // Un punto para el cliente se cierra solo con la respuesta del otro lado
      // (decisiones 1 y 5 de Mike): si lo abrió el taller, lo cierra el
      // cliente al contestar; si lo abrió el cliente, lo cierra el taller. El
      // taller puede reabrirlo (decisión 2) con la ruta de estado de siempre.
      let cerrada = false;
      if (d.para === 'cliente' && d.estado === 'abierta') {
        const abrio = await env.DB.prepare(`SELECT role FROM quell_users WHERE id = ?`).bind(d.user_id).first();
        const loAbrioElCliente = abrio?.role === 'cli';
        cerrada = (esCli(user) && !loAbrioElCliente) || (isStaff(user) && loAbrioElCliente);
        if (cerrada) await env.DB.prepare(`UPDATE quell_dudas SET estado = 'resuelta', resuelta_en = ?, resuelta_por = ? WHERE id = ?`).bind(now(), user.id, seg[1]).run();
      }
      await apunta(env, op);
      return json({ ok: true, id, photos, cerrada });
    }
    // Dar por resuelta es del supervisor: quien pregunta no decide que ya le
    // contestaron bien, igual que en el punchlist cierra quien lo levantó.
    if (seg[2] === 'estado' && m === 'POST') {
      if (!isStaff(user)) return err('Cerrar una duda es del supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      if (b.estado === 'abierta') {
        await env.DB.prepare(`UPDATE quell_dudas SET estado = 'abierta', resuelta_en = NULL, resuelta_por = NULL WHERE id = ?`).bind(seg[1]).run();
      } else {
        await env.DB.prepare(`UPDATE quell_dudas SET estado = 'resuelta', resuelta_en = ?, resuelta_por = ? WHERE id = ?`).bind(now(), user.id, seg[1]).run();
      }
      await apunta(env, b.op_id);
      return json({ ok: true });
    }
  }

  // ----- punch items -----
  if (seg[0] === 'punch' && seg[1]) {
    const kid = seg[1];
    const pid = await projectOfPunch(env, kid);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!seg[2] && m === 'PATCH') {
      // Editar el pendiente —título, fecha, a quién le toca— y darlo por
      // cerrado es del supervisor: quien pidió el arreglo es quien dice si
      // quedó bien. El contratista tiene su propia puerta, la de evidencia.
      if (!isStaff(user)) return err('Sube tu evidencia y márcalo terminado; cerrarlo lo hace el supervisor.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const st = ['pend', 'proc', 'ok'].includes(b.status) ? b.status : null;
      if (b.assignee_id !== undefined && b.assignee_id) {
        const ok = await env.DB.prepare(`SELECT 1 FROM quell_project_members WHERE project_id = ? AND user_id = ?`).bind(pid, b.assignee_id).first();
        if (!ok) return err('Esa persona no está dada de alta en esta obra.', 400);
      }
      await env.DB.prepare(
        `UPDATE quell_punch_items SET title = COALESCE(?, title), description = COALESCE(?, description), resp = COALESCE(?, resp), due_date = COALESCE(?, due_date),
          assignee_id = COALESCE(?, assignee_id),
          status = COALESCE(?, status), done_at = CASE WHEN ? = 'ok' THEN ? WHEN ? IS NOT NULL THEN NULL ELSE done_at END, done_by = CASE WHEN ? = 'ok' THEN ? ELSE done_by END WHERE id = ?`
      ).bind(b.title ?? null, b.description ?? null, b.resp ?? null, b.due_date ?? null, b.assignee_id ?? null, st, st, now(), st, st, user.id, kid).run();
      await apunta(env, b.op_id);
      return json({ ok: true });
    }
    if (seg[2] === 'photos' && m === 'POST') {
      if (!(await leToca(env, user, kid))) return err('Este pendiente no trae tu nombre.', 403);
      const fd = await req.formData();
      const photos = await savePhotos(env, user, 'punch', kid, fd.getAll('photos'));
      return json({ ok: true, photos });
    }
    // Evidencia: lo único que el contratista puede empujar. Sube las fotos de
    // que ya lo arregló, deja su nota, y el pendiente pasa a "en proceso" para
    // que el supervisor lo revise. Cerrarlo no lo cierra él.
    if (seg[2] === 'evidencia' && m === 'POST') {
      if (!(await leToca(env, user, kid))) return err('Este pendiente no trae tu nombre.', 403);
      const k = await env.DB.prepare(`SELECT * FROM quell_punch_items WHERE id = ?`).bind(kid).first();
      if (!k) return err('no encontrado', 404);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const nota = String(fd.get('nota') || '').trim();
      const fotos = fd.getAll('photos').filter((f) => f instanceof File && f.size);
      if (!nota && !fotos.length) return err('Sube al menos una foto o escribe qué hiciste.');
      const photos = await savePhotos(env, user, 'punch', kid, fotos);
      // Queda escrito en la bitácora del elemento: quién, cuándo y qué dijo.
      // Así el supervisor lo ve sin tener que abrir pendiente por pendiente.
      await env.DB.prepare(`INSERT INTO quell_log_entries (id, element_id, user_id, kind, text) VALUES (?,?,?,?,?)`)
        .bind(uid(), k.element_id, user.id, 'arreglo', `Terminado: ${k.title}${nota ? ` — ${nota}` : ''}`).run();
      if (k.status === 'pend') {
        await env.DB.prepare(`UPDATE quell_punch_items SET status = 'proc' WHERE id = ?`).bind(kid).run();
      }
      await apunta(env, op);
      return json({ ok: true, photos, status: k.status === 'ok' ? 'ok' : 'proc' });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM quell_punch_items WHERE id = ?`).bind(kid).run();
      return json({ ok: true });
    }
  }

  // ----- photos -----
  if (seg[0] === 'photos' && seg[1] && m === 'DELETE') {
    const p = await env.DB.prepare(`SELECT * FROM quell_photos WHERE id = ?`).bind(seg[1]).first();
    if (!p) return err('no encontrada', 404);
    if (!isStaff(user) && p.user_id !== user.id) return err('sin permiso', 403);
    await env.FILES.delete(p.r2_key);
    await env.DB.prepare(`DELETE FROM quell_photos WHERE id = ?`).bind(seg[1]).run();
    return json({ ok: true });
  }

  return err('ruta no encontrada', 404);
}

function pubUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, company: u.company };
}

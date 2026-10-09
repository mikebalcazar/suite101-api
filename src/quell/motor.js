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

import { PREFIJOS, REQUERIMIENTO, esRequerimiento, siguienteCodigo } from './codigos.js';
/* La cuenta de los días la hace el CONTRATO, no la pantalla ni este archivo.
 * Viaja resuelta en el detalle del ítem para que quell101 no la repita: una
 * cuenta copiada en el navegador también hereda el reloj del aparato, y un
 * celular con la fecha mal puesta diría que faltan tres días cuando ya
 * venció. */
import { faltaParaEntrega } from '../../schema/tipos';
import { ETAPAS, ETAPAS_VALIDAS, NOMBRE_ETAPA, fechaValida, hojasDelCronograma, laborablesEntre, programar, xmlDeProject, fasesDefault, fechaDePago, nombreDeFase, costoDefault, precioPorPieza, DIAS_DEFAULT } from './cronograma.js';
import { TIPO_XLSX, xlsx } from '../xlsx';

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
  /* 0.66.0 · El cliente de la suite entra aunque nadie lo haya invitado desde
   * aquí (Mike, 4-oct: «para el cliente es muy tedioso irse metiendo a
   * diferentes plataformas»): ya es cliente de la empresa y peek101 le abre
   * con la misma cuenta, así que aquí nace como `cli`. Qué obras ve lo decide
   * canAccessProject: las ligadas a sus proyectos y las donde lo apuntaron.
   * Un renglón que el taller DESACTIVÓ no revive solo: sigue fuera. */
  if (s.quien?.clase === 'cliente') {
    const dormido = await env.DB.prepare(`SELECT 1 FROM quell_users WHERE email = ?`).bind(s.correo).first();
    if (dormido) return null;
    const id = uid();
    await env.DB.prepare(`INSERT INTO quell_users (id, email, name, role, company, usuario_id) VALUES (?,?,?,?,?,?)`)
      .bind(id, s.correo, s.nombre || s.correo.split('@')[0], 'cli', '', s.quien.usuario_id || null).run();
    return await env.DB.prepare(`SELECT * FROM quell_users WHERE id = ?`).bind(id).first();
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
  // 0.66.0 · la documentación del ítem, de leer: el plano principal, los de
  // soporte, sus versiones y las marcas. Subir y anotar siguen siendo del taller.
  (seg[0] === 'elements' && m === 'GET' && seg[1] && seg[2] === 'docs') ||
  (seg[0] === 'docs' && m === 'GET' && seg[1] && (seg[2] === 'versiones' || seg[2] === 'marcas')) ||
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

/* EL PORTAL DEL CLIENTE ES peek101 (Mike, 5-oct-2026: «Quiero que el único
 * visor del cliente sea Peek y que ahí mismo pueda ver el plano general y
 * aparte contestar los puntos de dudas»). Los correos al cliente lo mandan
 * allá, no a esta bitácora. La dirección de peek101 se deduce de la de esta
 * app (`SITIO`, el origen desde el que se pidió): `quell101.X` → `peek101.X`,
 * sea X taller101.com o el dominio propio de una empresa; staging manda al
 * peek101 de staging; cualquier otra cosa, al de producción. Las rutas de
 * peek101 son `#/obra/OBRA` (el plano y los puntos) y `#/pieza/PIEZA`. */
export function sitioPeek(sitioQuell) {
  let h = '';
  try { h = new URL(sitioQuell).hostname.toLowerCase(); } catch { /* sin dirección */ }
  if (h.startsWith('quell101.')) return `https://peek101.${h.slice('quell101.'.length)}`;
  if (h.endsWith('.workers.dev') || h === 'localhost' || h === '127.0.0.1') return 'https://peek101-staging.mike-929.workers.dev';
  return 'https://peek101.taller101.com';
}

// El correo al cliente invitado. Entra por la misma puerta que todos —la de la
// suite—, con «Mándame un código» la primera vez, porque no tiene contraseña
// todavía: la pone ahí mismo. Desde el 5-oct lo manda a peek101, que es su
// único portal: ahí ve el estado de cuenta, el plano y los puntos por definir.
async function invitaCliente(env, req, quien, obras) {
  const sitio = sitioPeek(env.SITIO);
  const lista = obras.map((o) => `<li><b>${o.name}</b>${o.client ? ` (${o.client})` : ''}</li>`).join('');
  const html = `
    <p>Hola${quien.name ? ' ' + quien.name : ''},</p>
    <p>El taller te invitó a ver ${obras.length === 1 ? 'tu obra' : 'tus obras'} en tu portal <b>peek101</b>:</p>
    <ul>${lista}</ul>
    <p>Ahí vas a ver tu estado de cuenta, el plano con tus muebles y los puntos
       que el taller necesita que definas; contestas sobre cada uno, con foto si
       hace falta, y también puedes preguntar lo que quieras. Lo interno del
       taller no sale ahí.</p>
    <p><b>Para entrar la primera vez:</b></p>
    <ol>
      <li>Abre <a href="${sitio}">${sitio}</a></li>
      <li>Escribe este correo: <b>${quien.email}</b> y pica «Continuar».</li>
      <li>Como todavía no tienes contraseña, pica <b>«No tengo contraseña o la olvidé»</b>: te
          llega uno de 6 dígitos y con él pones tu contraseña.</li>
    </ol>
    <p>De ahí en adelante entras con tu correo y tu contraseña.</p>`;
  try { await sendMail(env, quien.email, 'Te invitaron a ver tu obra en peek101', html); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// El correo al cliente con sus puntos por definir, armado aparte para poder
// medirlo. Mike, 1-oct-2026: «quiero que en el correo venga el texto de la
// duda y abajo un link que diga "responder" y te mande a la url necesaria
// para responder. Obvio logueándote con tu cuenta de cliente». Cada punto va
// con su pieza (código y nombre) si la tiene, y la liga lleva a la obra en
// peek101: `#/obra/OBRA`, con el plano y los puntos por definir (5-oct: el
// portal del cliente es peek101). peek101 pide la cuenta al entrar y conserva
// la liga, así que después de entrar cae justo ahí. `sitio` ya es el de peek.
const escapaHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function correoDePuntos({ sitio, quien, obra, dudas }) {
  const cuantos = dudas.length;
  const liga = `${sitio}/#/obra/${obra.id}`;
  const lista = dudas.map((d) => `
      <li style="margin:0 0 10px 0">
        ${d.pieza ? `<div style="font-size:12px;color:#666">${escapaHtml(d.pieza)}</div>` : ''}
        <div>${escapaHtml(d.texto)}</div>
      </li>`).join('');
  const html = `
    <p>Hola${quien.name ? ' ' + escapaHtml(quien.name) : ''},</p>
    <p>En tu obra <b>${escapaHtml(obra.name)}</b> hay <b>${cuantos} ${cuantos === 1 ? 'punto' : 'puntos'} por definir</b>.
       El taller necesita tu respuesta para seguir.</p>
    <ol style="padding-left:20px">${lista}
    </ol>
    <p style="margin:20px 0">
      <a href="${liga}" style="display:inline-block;background:#1f1f1f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600">Responder</a>
    </p>
    <p style="font-size:12px;color:#666">Te pedirá tu correo y tu contraseña de cliente; al entrar caes directo en los puntos de esta obra.
       Si algo no se entiende, ahí mismo puedes preguntar.</p>`;
  return { asunto: `${cuantos} ${cuantos === 1 ? 'punto' : 'puntos'} por definir en ${obra.name}`, html, liga };
}

// El aviso al cliente de que tiene puntos por definir. Un solo correo, cuando
// el taller aprieta el botón; nada automático por punto (decisión 8 de Mike).
async function avisaCliente(env, req, quien, obra, dudas) {
  const { asunto, html } = correoDePuntos({ sitio: sitioPeek(env.SITIO), quien, obra, dudas });
  try { await sendMail(env, quien.email, asunto, html); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

// La suite le abre la puerta al cliente: `POST /orgs/:o/clientes/invitar`
// (contrato 0.15.0) lo deja como cliente de la empresa —el mismo que ve
// peek101— sin PIN. Desde el 19-sep eso corre dentro de la misma API
// (src/clientes.ts) y llega aquí como una función en el entorno: se llama
// después de revisar que quien invita sea el dueño de la obra, y si la suite
// dice que no, aquí no se escribe nada.
async function invitaEnSuite(env, correo, nombre, usarExistente = false) {
  if (!env.INVITAR_EN_SUITE) return { ok: false, error: 'sin_suite' };
  const r = await env.INVITAR_EN_SUITE(correo, nombre, usarExistente);
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
  n_pend: 0, n_proc: 0, n_total: 0, n_etapas: 0, n_log: 0, alcance: e.alcance ?? 'dentro' });

/* EN QUÉ PARTE DEL ALCANCE ESTÁ LA PIEZA, que es el del ítem del que cuelga.
 *
 * Mike, 2-oct-2026: «solo existirá "en alcance" o "fuera de alcance"», y el
 * mismo día, al revisar la obra: «cuando se genera uno en quell (…) se genera
 * como requerimiento (fuera de alcance) o como ítem (en alcance)». Y antes,
 * el 20-sep: «los no aprobados NO APARECEN en quell al menos que veas la
 * vista de ítems fuera de alcance».
 *
 * La regla misma vive en `schema/tipos.ts` (`alcanceDeItem`): vendido es
 * dentro, lo demás es fuera. Aquí se repite en tres líneas porque este motor
 * es JavaScript suelto y no importa el contrato; para que las dos copias no
 * se separen, `pruebas/alcance.spec.ts` las compara caso por caso.
 *
 * Una pieza SIN ítem va dentro: es trabajo de la obra que nadie cotizó, y
 * esconderla del plano por no tener renglón en dash sería borrarla de la
 * obra por una razón de contabilidad.
 *
 * HISTORIA: del 22-sep al 2-oct un requerimiento pendiente iba DENTRO («sí
 * aparece en mapa»). Mike lo cambió el 2-oct: el requerimiento ES lo que
 * está fuera del alcance mientras no se cotice y autorice, y la lista de
 * fuera de alcance de quell tiene que enseñarlo. Para que no se le pierda
 * al levantarlo, la pantalla pasa el filtro a «Todos» en cuanto lo clava. */
const ALCANCE_SQL = `CASE
    WHEN it.id IS NULL THEN 'dentro'
    WHEN it.estado = 'vendido' THEN 'dentro'
    ELSE 'fuera'
  END AS alcance`;

async function canAccessProject(env, user, projectId) {
  if (isStaff(user)) return true;
  const r = await env.DB.prepare(`SELECT 1 FROM quell_project_members WHERE project_id = ? AND user_id = ?`).bind(projectId, user.id).first();
  if (r) return true;
  // 0.66.0 · El cliente entra también a la obra ligada a SU proyecto de la
  // suite, sin que nadie lo apunte aquí: es el mismo cliente en las tres apps.
  if (esCli(user)) return !!(await obraDelCliente(env, projectId));
  return false;
}
/** El id del cliente en la suite (`clientes.id`) que trae la sesión, o null. */
const clienteDeLaSuite = (env) => (env.SESION?.quien?.clase === 'cliente' && env.SESION.quien.ref_id ? String(env.SESION.quien.ref_id) : null);
/** ¿Esta obra está ligada a un proyecto del cliente que viene en la sesión? */
async function obraDelCliente(env, projectId) {
  const ref = clienteDeLaSuite(env);
  if (!ref) return null;
  return env.DB.prepare(`SELECT 1 FROM quell_projects o JOIN proyectos p ON p.id = o.proyecto_id WHERE o.id = ? AND p.cliente_id = ?`).bind(projectId, ref).first();
}
/** 0, 90, 180 o 270; cualquier otra cosa es 0. */
function giroValido(v) {
  const n = Number(v) || 0;
  return [0, 90, 180, 270].includes(n) ? n : 0;
}
/** Las versiones anteriores del plano, como lista (la columna es JSON). */
function versionesDe(plan) {
  try { const v = JSON.parse(plan.versiones || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
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
  /* UN REQUERIMIENTO NO ENTRA EN PRODUCCIÓN (Mike, 22-sep-2026).
   *
   * «El requerimiento es un tipo de ítem pero que aún está en revisión. Sí
   * aparece en mapa, sí aparece en ítems, pero está pendiente de cotizarse y
   * autorizarse para entrar en producción.»
   *
   * La regla va AQUÍ y no en la pantalla porque éste es el cuello por donde
   * pasan los dos caminos que mueven un ítem —`/etapa` y `/fase`— y porque
   * quell101 es una de varias puertas: la app de Android empacada trae su
   * propia copia de la pantalla, y una regla que sólo viva allá se queda
   * vieja en los teléfonos que nadie actualizó.
   *
   * Y es una regla que protege dinero, no una cortesía: marcar «comprado» o
   * «fletado» en algo que nadie cotizó ni autorizó es empezar a gastar en
   * una pieza que quizá el cliente no aprueba. */
  const suyo = await env.DB.prepare(`SELECT type FROM quell_elements WHERE id = ?`).bind(eid).first();
  if (suyo && esRequerimiento(suyo.type)) {
    return { error: 'Esto todavía es un requerimiento: está pendiente de cotizarse y autorizarse. Cuando se apruebe, cámbiale el tipo a lo que de verdad es y entra a producción.' };
  }
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

/* ---------- la documentación del ítem (§121) ----------
 *
 * Mike, 21-sep: «un apartado por ítem de documentación (…) hay un archivo
 * base que es el plano o imagen sobre la que están las anotaciones del ítem,
 * sería como el principal, y los demás archivos son de soporte».
 */

/** Un número de 0 a 1, recortado. Las marcas se guardan RELATIVAS a la
 *  página y no en píxeles: la misma marca se ve en un celular y en una
 *  pantalla de escritorio, y una coordenada en píxeles se despega del dibujo
 *  en cuanto cambia el tamaño. Recortar aquí y no confiar en la pantalla:
 *  una marca en 1.4 se pinta fuera del papel y nadie la vuelve a encontrar. */
const ceroAUno = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** Lo que está A LA VISTA de un ítem: el principal y los de soporte. Lo
 *  archivado no sale de aquí —se pide por la familia— porque «que no esté a
 *  la vista» es justo lo que Mike pidió. */
async function docsVivos(env, elementId) {
  const { results } = await env.DB.prepare(
    `SELECT d.*, u.name AS subio FROM quell_element_docs d LEFT JOIN quell_users u ON u.id = d.subido_por
      WHERE d.element_id = ? AND d.archivado_at IS NULL
      ORDER BY CASE d.rol WHEN 'principal' THEN 0 ELSE 1 END, d.created_at`).bind(elementId).all();
  return {
    principal: results.find((d) => d.rol === 'principal') || null,
    soporte: results.filter((d) => d.rol !== 'principal'),
  };
}

/** Las marcas vivas de una versión, con quién las hizo. El trazo sale ya
 *  convertido en lista de puntos: guardarlo como texto es cosa de la base, y
 *  hacer que cada pantalla lo interprete es pedir que una lo haga distinto. */
async function marcasDe(env, docId) {
  const { results } = await env.DB.prepare(
    `SELECT mk.*, u.name AS quien FROM quell_doc_marcas mk LEFT JOIN quell_users u ON u.id = mk.user_id
      WHERE mk.doc_id = ? AND mk.borrado_at IS NULL ORDER BY mk.created_at`).bind(docId).all();
  return results.map((mk) => ({ ...mk, trazo: mk.trazo ? JSON.parse(mk.trazo) : null }));
}

/** Guardar el archivo en R2 y su renglón en la base.
 *
 *  El nombre del archivo NO se usa para armar la llave: un «plano final
 *  (2).pdf» con acentos y paréntesis en una llave de R2 es un problema el
 *  día que haya que buscarlo a mano. La llave lleva el id, que es único, y
 *  el nombre bonito se guarda en la columna, que es donde sirve. */
async function guardaDoc(env, { element_id, rol, archivo, nombre, paginas, familia_id, version, user, diseno = 0 }) {
  const id = uid();
  const ext = (String(archivo.name || '').split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const llave = `${env.PREFIJO_R2}docs/${element_id}/${id}${ext ? '.' + ext : ''}`;
  await env.FILES.put(llave, archivo.stream(), { httpMetadata: { contentType: archivo.type || 'application/octet-stream' } });
  await env.DB.prepare(
    `INSERT INTO quell_element_docs (id, element_id, familia_id, rol, nombre, r2_key, mime, bytes, paginas, version, subido_por, diseno)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, element_id, familia_id || id, rol,
          String(nombre || archivo.name || 'Documento').slice(0, 200),
          llave, archivo.type || null, archivo.size || 0,
          Math.max(1, Math.trunc(Number(paginas) || 1)), Number(version) || 1, user.id, diseno ? 1 : 0).run();
  return await env.DB.prepare(`SELECT * FROM quell_element_docs WHERE id = ?`).bind(id).first();
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

/* El cronograma de una obra, con las fechas ya contadas (0.68.0). Trae las
 * piezas de la obra (sin los requerimientos, que todavía no son trabajo) para
 * que la pantalla las enseñe aunque no tengan tareas, los proveedores con su
 * tipo para los menús, y cada tarea con su inicio y su fin. */
/* El anticipo de una pieza (0.70.0): lo que de los pagos le ha tocado a su
 * ítem (`movimiento_items`), con la fecha del pago más antiguo. Son dos
 * subconsultas sobre `e.item_id`; una pieza sin ítem queda en nulo. */
const ANTICIPO_SQL = `(SELECT MIN(m.fecha) FROM movimiento_items mi JOIN movimientos m ON m.id = mi.movimiento_id WHERE mi.item_id = e.item_id AND mi.monto > 0) AS anticipo_fecha,
            (SELECT COALESCE(SUM(mi.monto), 0) FROM movimiento_items mi WHERE mi.item_id = e.item_id) AS anticipo_monto`;
/** Los dos candados de una pieza y desde cuándo pueden correr sus fases. */
function candados(e, hoy) {
  const ligado = !!e.item_id;
  // El anticipo también cuenta si el ítem ya va en «Anticipo pagado» (etapa 2) o más allá.
  let anticipo = e.anticipo_fecha ? String(e.anticipo_fecha).slice(0, 10) : null;
  if (!anticipo && ligado && Number(e.item_etapa) >= 2) anticipo = String(e.item_etapa_at || hoy).slice(0, 10);
  const diseno = e.diseno_definido && fechaValida(e.diseno_definido) ? e.diseno_definido : null;
  const listo = !!(anticipo && diseno);
  const arranque = listo ? (anticipo > diseno ? anticipo : diseno) : hoy;
  return { anticipo, anticipo_monto: Number(e.anticipo_monto || 0), diseno, ligado, listo, arranque };
}

/* 0.73.0 · Una pieza sin fases las recibe solas, UNA vez (Mike, 6-oct: «el
 * cronograma se debe llenar en automático con esta info»): material 10 días,
 * fabricación 24, instalación 12, con el costo por tipo de ítem sobre el
 * precio del ítem ligado. `fases_dadas` recuerda que ya se dieron: lo que el
 * usuario quite después se queda quitado. Devuelve si cambió algo. */
async function completarFases(env, pid) {
  const { results: sinFases } = await env.DB.prepare(
    `SELECT e.id, e.type, it.monto, it.cantidad FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id LEFT JOIN items it ON it.id = e.item_id
      WHERE pl.project_id = ? AND e.type <> 'Requerimiento' AND COALESCE(e.fases_dadas, 0) = 0`).bind(pid).all();
  if (!sinFases.length) return false;
  const t0 = now();
  for (const e of sinFases) {
    const ya = await env.DB.prepare(`SELECT COUNT(*) AS n FROM quell_tareas WHERE element_id = ?`).bind(e.id).first();
    if (!Number(ya?.n || 0)) {
      for (const f of fasesDefault({ element_id: e.id, type: e.type, precio: precioPorPieza(e.monto, e.cantidad) })) {
        await env.DB.prepare(`INSERT INTO quell_tareas (id, project_id, element_id, seccion, orden, etapa, nombre, pos, dias, proveedor_id, contratista_id, costo, depende_de, inicio_fijo, notas, creado_at, actualizado_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(uid(), pid, e.id, '', 0, f.etapa, null, f.pos, f.dias, null, null, f.costo, null, null, null, t0, t0).run();
      }
    }
    await env.DB.prepare(`UPDATE quell_elements SET fases_dadas = 1 WHERE id = ?`).bind(e.id).run();
  }
  return true;
}

/* 0.73.0 · Los compromisos que nacen de las fases (Mike, 6-oct: «así de ahí
 * se pobla la lista de compromisos de gastos en el proyecto para la
 * proyección del flujo»). Cada fase con costo de una pieza LIGADA a un ítem
 * de dash101 es una partida de su proyecto: con el responsable, el concepto
 * «código · fase», el costo como monto acordado y la fecha en que se espera
 * pagarla (material al arrancar, lo demás al terminar). Se escribe por
 * `tarea_id`: la fase manda, la partida la sigue; sin fase (o sin costo) la
 * partida se va. Las partidas capturadas a mano en dash101 no se tocan. */
async function sincronizarPartidas(env, pid, c) {
  const { results: ligadas } = await env.DB.prepare(
    `SELECT e.id AS element_id, e.code, it.id AS item_id, it.proyecto_id FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id JOIN items it ON it.id = e.item_id
      WHERE pl.project_id = ? AND it.proyecto_id IS NOT NULL`).bind(pid).all();
  const porPieza = new Map(ligadas.map((l) => [l.element_id, l]));
  const { results: provs } = await env.DB.prepare(`SELECT id, nombre FROM proveedores`).all();
  const proveedores = new Map(provs.map((p) => [p.id, p.nombre]));
  const { results: cons } = await env.DB.prepare(`SELECT id, name FROM quell_users WHERE role = 'con'`).all();
  const contratistas = new Map(cons.map((u) => [u.id, u.name]));
  const { results: existentes } = await env.DB.prepare(`SELECT id, tarea_id, proyecto_id FROM partidas WHERE obra_id = ?`).bind(pid).all();
  const porTarea = new Map(existentes.map((p) => [p.tarea_id, p]));
  const tocados = new Set(existentes.map((p) => p.proyecto_id).filter(Boolean));
  const vivas = new Set();
  const t0 = now();
  for (const t of c.tareas) {
    const liga = porPieza.get(t.element_id);
    const costo = Number(t.costo || 0);
    if (!liga || costo <= 0) continue;
    vivas.add(t.id);
    const concepto = `${liga.code || ''} · ${nombreDeFase(t)}${t.seccion ? ' (' + t.seccion + ')' : ''}`.trim();
    const proveedor_id = t.proveedor_id || null;
    const proveedor_nombre = proveedor_id ? (proveedores.get(proveedor_id) || null) : (t.contratista_id ? contratistas.get(t.contratista_id) || null : null);
    const fecha = fechaDePago(t) || null;
    tocados.add(liga.proyecto_id);
    const previa = porTarea.get(t.id);
    if (previa) {
      await env.DB.prepare(`UPDATE partidas SET proyecto_id = ?, item_id = ?, proveedor_id = ?, proveedor_nombre = ?, concepto = ?, monto_acordado = ?, fecha_esperada = ?, actualizado_at = ? WHERE id = ?`)
        .bind(liga.proyecto_id, liga.item_id, proveedor_id, proveedor_nombre, concepto, costo, fecha, t0, previa.id).run();
    } else {
      await env.DB.prepare(`INSERT INTO partidas (id, proyecto_id, item_id, proveedor_id, proveedor_nombre, concepto, monto_acordado, monto_pagado, estado, tarea_id, obra_id, fecha_esperada, creado_at, actualizado_at) VALUES (?,?,?,?,?,?,?,0,'pendiente',?,?,?,?,?)`)
        .bind(uid(), liga.proyecto_id, liga.item_id, proveedor_id, proveedor_nombre, concepto, costo, t.id, pid, fecha, t0, t0).run();
    }
  }
  for (const p of existentes) {
    if (vivas.has(p.tarea_id)) continue;
    await env.DB.prepare(`UPDATE ordenes SET partida_id = NULL WHERE partida_id = ?`).bind(p.id).run();
    await env.DB.prepare(`UPDATE movimientos SET partida_id = NULL WHERE partida_id = ?`).bind(p.id).run();
    await env.DB.prepare(`DELETE FROM partidas WHERE id = ?`).bind(p.id).run();
  }
  if (env.RECALCULAR_PROYECTO) for (const proyecto of tocados) await env.RECALCULAR_PROYECTO(proyecto);
}

async function leerCronograma(env, pid, { completar = true } = {}) {
  const completadas = completar ? await completarFases(env, pid) : false;
  const project = await env.DB.prepare(`SELECT id, name, cronograma_inicio, cronograma_dias FROM quell_projects WHERE id = ?`).bind(pid).first();
  const { results: piezas } = await env.DB.prepare(
    `SELECT e.id, e.code, e.name, e.type, e.plan_id, e.padre_id, e.item_id, e.diseno_definido, pl.name AS plan_name,
            it.etapa AS item_etapa, it.etapa_at AS item_etapa_at, ${ANTICIPO_SQL}
       FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id LEFT JOIN items it ON it.id = e.item_id
      WHERE pl.project_id = ? AND e.type <> 'Requerimiento' ORDER BY e.code`).bind(pid).all();
  const { results: crudas } = await env.DB.prepare(
    `SELECT t.*, e.code, e.name, p.nombre AS proveedor_nombre, p.tipo AS proveedor_tipo, u.name AS contratista_nombre
       FROM quell_tareas t JOIN quell_elements e ON e.id = t.element_id LEFT JOIN proveedores p ON p.id = t.proveedor_id LEFT JOIN quell_users u ON u.id = t.contratista_id
      WHERE t.project_id = ? ORDER BY e.code, t.orden, t.seccion, t.pos`).bind(pid).all();
  const { results: proveedores } = await env.DB.prepare(`SELECT id, nombre, tipo FROM proveedores ORDER BY nombre_norm`).all();
  // 0.73.0 · Los contratistas de la obra, para «responsable» de una fase.
  const { results: contratistas } = await env.DB.prepare(`SELECT id, name AS nombre, company AS empresa FROM quell_users WHERE role = 'con' AND active = 1 ORDER BY name`).all();
  const inicio = project.cronograma_inicio || now().slice(0, 10);
  /* Los candados (0.70.0): cada pieza arranca cuando tiene anticipo Y diseño
   * definido, en la fecha más tardía de los dos; sin alguno, arranca HOY y
   * se recorre sola día con día. */
  const hoy = now().slice(0, 10);
  const candadosDe = new Map(piezas.map((e) => [e.id, candados(e, hoy)]));
  const c = programar(crudas, inicio, new Map([...candadosDe].map(([id, k]) => [id, k.arranque])));
  // Las tareas en el orden de las piezas, y cada pieza con cuántos días suma.
  const porPieza = new Map();
  for (const t of c.tareas) { if (!porPieza.has(t.element_id)) porPieza.set(t.element_id, []); porPieza.get(t.element_id).push(t); }
  const items = piezas.map((e) => {
    const ts = porPieza.get(e.id) || [];
    const ini = ts.length ? ts.reduce((m, t) => (m < t.inicio ? m : t.inicio), ts[0].inicio) : null;
    const fin = ts.length ? ts.reduce((m, t) => (m > t.fin ? m : t.fin), ts[0].fin) : null;
    return { element_id: e.id, code: e.code, name: e.name, type: e.type, plan_name: e.plan_name, padre_id: e.padre_id, inicio: ini, fin, dias: ini ? laborablesEntre(ini, fin) : 0, candados: candadosDe.get(e.id), costo: ts.reduce((s, t) => s + Number(t.costo || 0), 0), tareas: ts };
  });
  const objetivo = project.cronograma_dias ?? null;
  const salida = {
    id: pid, nombre: project.name, inicio: c.inicio, inicio_guardado: project.cronograma_inicio || null, dias_objetivo: objetivo, fin: c.fin, dias_laborables: c.dias_laborables,
    excede: objetivo != null && c.dias_laborables > objetivo, calendario: 'lunes-sabado', etapas: ETAPAS.map((k) => ({ clave: k, nombre: NOMBRE_ETAPA[k] })),
    costo: c.tareas.reduce((s, t) => s + Number(t.costo || 0), 0),
    items, tareas: c.tareas, proveedores, contratistas,
  };
  // Las fases que acaban de nacer ya tienen fechas: sus compromisos también.
  if (completadas) await sincronizarPartidas(env, pid, salida);
  return salida;
}
/* 0.74.0 · Poblar los costos default de lo que ya estaba (Mike, 6-oct:
 * «necesito que pobles por mí todos los ítems que tenemos en alcance, que no
 * tengan precio, con los costos predeterminados»). Corre UNA vez por empresa,
 * al arrancar después de la migración 0036 (org-db.ts, `correrPendientes`):
 *
 *   1. Toda obra recibe sus fases default donde falten, lo mismo que pasaría
 *      al abrir su cronograma (`completarFases`): así sus compromisos entran
 *      al flujo sin que nadie tenga que abrir cada obra.
 *   2. Cada pieza ligada a un ítem EN ALCANCE (vendido) con precio: por
 *      etapa —material y fabricación—, si ninguna fase de esa etapa tiene
 *      costo, la primera recibe el default por tipo sobre el precio de UNA
 *      pieza. Si alguna ya tiene costo, se respeta: lo capturado no se toca.
 *      La instalación no tiene porcentaje y se queda como esté.
 *   3. El defecto del mismo día: con cantidad > 1, una fase cuyo costo es
 *      exactamente el default calculado sobre el TOTAL del ítem se corrige
 *      al de una pieza.
 *   4. Las obras que cambiaron rehacen sus compromisos (partidas con fecha)
 *      y su proyecto se recalcula.
 *
 * Devuelve lo que hizo, para dejarlo anotado. */
export async function poblarCostosDefault(env) {
  const hecho = { obras: 0, fases_nuevas: 0, fases_con_costo: 0, fases_corregidas: 0 };
  const { results: obras } = await env.DB.prepare(`SELECT id FROM quell_projects ORDER BY id`).all();
  for (const o of obras) {
    const antes = Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM quell_tareas WHERE project_id = ?`).bind(o.id).first())?.n || 0);
    let cambio = await completarFases(env, o.id);
    if (cambio) hecho.fases_nuevas += Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM quell_tareas WHERE project_id = ?`).bind(o.id).first())?.n || 0) - antes;
    const { results: piezas } = await env.DB.prepare(
      `SELECT e.id, e.type, it.monto, it.cantidad FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id JOIN items it ON it.id = e.item_id
        WHERE pl.project_id = ? AND e.type <> 'Requerimiento' AND it.estado = 'vendido' AND it.monto > 0`).bind(o.id).all();
    for (const e of piezas) {
      const { results: fases } = await env.DB.prepare(
        `SELECT id, etapa, costo FROM quell_tareas WHERE element_id = ? ORDER BY orden, seccion, pos`).bind(e.id).all();
      const cantidad = Math.max(1, Math.trunc(Number(e.cantidad) || 1));
      const precio = precioPorPieza(e.monto, cantidad);
      for (const etapa of ['material', 'fabricacion']) {
        const deEtapa = fases.filter((f) => f.etapa === etapa);
        const bien = costoDefault(e.type, precio, etapa);
        if (!deEtapa.length || !bien) continue;
        const inflado = cantidad > 1 ? costoDefault(e.type, Number(e.monto), etapa) : 0;
        for (const f of deEtapa) {
          if (inflado && inflado !== bien && Number(f.costo) === inflado) {
            await env.DB.prepare(`UPDATE quell_tareas SET costo = ?, actualizado_at = ? WHERE id = ?`).bind(bien, now(), f.id).run();
            f.costo = bien; hecho.fases_corregidas++; cambio = true;
          }
        }
        if (deEtapa.every((f) => !Number(f.costo))) {
          await env.DB.prepare(`UPDATE quell_tareas SET costo = ?, actualizado_at = ? WHERE id = ?`).bind(bien, now(), deEtapa[0].id).run();
          deEtapa[0].costo = bien; hecho.fases_con_costo++; cambio = true;
        }
      }
    }
    if (cambio) {
      hecho.obras++;
      await sincronizarPartidas(env, o.id, await leerCronograma(env, o.id, { completar: false }));
    }
  }
  return hecho;
}

/* 0.75.0 · Los tiempos default en lo que ya estaba (Mike, 6-oct: «ponla
 * también todos los ítems que hay ahorita en alcance con los defaults de
 * tiempos»; escogió con botones «sólo donde falten»). Corre UNA vez por
 * empresa, al arrancar después de la migración 0037:
 *
 *   · Las piezas EN ALCANCE —la misma regla que enseña quell101: sin ítem, o
 *     con su ítem vendido— que no tienen ninguna fase reciben las tres
 *     default (10/24/12 días) con el costo por pieza.
 *   · Una fase de material, fabricación o instalación de esas piezas que
 *     sigue en 1 día —con lo que nace una fase agregada a mano: nadie le puso
 *     días— pasa a 10, 24 o 12.
 *   · Lo capturado se queda: otros días, las cadenas, las fechas fijas y las
 *     fases de más («otra») no se tocan. Fuera de alcance, tampoco.
 *   · Las obras que cambiaron rehacen sus compromisos (las fechas se mueven).
 *
 * Devuelve lo que hizo, para dejarlo anotado. */
export async function ponerTiemposDefault(env) {
  const hecho = { obras: 0, piezas_con_fases: 0, fases_con_dias: 0 };
  const { results: obras } = await env.DB.prepare(`SELECT id FROM quell_projects ORDER BY id`).all();
  for (const o of obras) {
    let cambio = false;
    const { results: piezas } = await env.DB.prepare(
      `SELECT e.id, e.type, it.monto, it.cantidad FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id LEFT JOIN items it ON it.id = e.item_id
        WHERE pl.project_id = ? AND e.type <> 'Requerimiento' AND (it.id IS NULL OR it.estado = 'vendido')`).bind(o.id).all();
    for (const e of piezas) {
      const { results: fases } = await env.DB.prepare(`SELECT id, etapa, dias FROM quell_tareas WHERE element_id = ?`).bind(e.id).all();
      const t0 = now();
      if (!fases.length) {
        for (const f of fasesDefault({ element_id: e.id, type: e.type, precio: precioPorPieza(e.monto, e.cantidad) })) {
          await env.DB.prepare(`INSERT INTO quell_tareas (id, project_id, element_id, seccion, orden, etapa, nombre, pos, dias, proveedor_id, contratista_id, costo, depende_de, inicio_fijo, notas, creado_at, actualizado_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(uid(), o.id, e.id, '', 0, f.etapa, null, f.pos, f.dias, null, null, f.costo, null, null, null, t0, t0).run();
        }
        await env.DB.prepare(`UPDATE quell_elements SET fases_dadas = 1 WHERE id = ?`).bind(e.id).run();
        hecho.piezas_con_fases++; cambio = true;
        continue;
      }
      for (const f of fases) {
        const bien = DIAS_DEFAULT[f.etapa];
        if (bien && Number(f.dias) === 1) {
          await env.DB.prepare(`UPDATE quell_tareas SET dias = ?, actualizado_at = ? WHERE id = ?`).bind(bien, t0, f.id).run();
          hecho.fases_con_dias++; cambio = true;
        }
      }
    }
    if (cambio) {
      hecho.obras++;
      await sincronizarPartidas(env, o.id, await leerCronograma(env, o.id, { completar: false }));
    }
  }
  return hecho;
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
  /* 0.54.1 · Los contratistas de la empresa, para el menú «+ asignar…» del
   * ítem. Lo ve quien dirige la obra (admin e int), no sólo el dueño como
   * /users: un supervisor asigna contratistas y necesita la lista completa,
   * no nada más los que ya están en la obra. Sólo los vivos, y sólo lo que
   * hace falta para escoger: id, nombre, empresa. */
  if (seg[0] === 'contratistas' && !seg[1] && m === 'GET') {
    if (!isStaff(user)) return err('Los contratistas los ve quien dirige la obra.', 403);
    const { results } = await env.DB.prepare(`SELECT id, name, company FROM quell_users WHERE role = 'con' AND active = 1 ORDER BY name`).all();
    return json({ contratistas: results });
  }
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

  /* 0.77.0 · Los clientes de la suite, para escoger en «+ Proyecto»: uno
   * solo en las tres apps. Sólo nombre: el taller ya los ve en dash101.
   * (`/clientes` de aquí abajo es otra cosa: las cuentas del portal.) */
  if (seg[0] === 'clientes-suite' && !seg[1] && m === 'GET') {
    if (!isStaff(user)) return err('sin acceso', 403);
    const { results } = await env.DB.prepare(`SELECT id, nombre FROM clientes ORDER BY nombre_norm`).all();
    return json({ ok: true, clientes: results });
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

      const suite = await invitaEnSuite(env, e, nombre, b.usar_existente === true);
      /* 0.65.0 · Ya hay un cliente con ese correo: se devuelve quién es para que
       * la pantalla pregunte «¿es ése?» y vuelva con `usar_existente`. */
      if (!suite.ok && suite.error === 'correo_en_uso') {
        return json({ ok: false, error: 'correo_en_uso', cliente: suite.detalle && suite.detalle.cliente || null,
          mensaje: 'Ya hay un cliente con ese correo.' }, 409);
      }
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
        // 0.66.0 · Las obras donde lo apuntaron Y las ligadas a sus proyectos
        // de la suite: la misma regla que canAccessProject.
        if (esCli(user)) {
          const { results } = await env.DB.prepare(
            `SELECT p.id, p.name, p.client, p.status, 'cli' AS mi_rol, p.proyecto_id,
               (SELECT COUNT(*) FROM quell_dudas d WHERE d.project_id = p.id AND d.para = 'cliente' AND d.estado = 'abierta') AS open_count
             FROM quell_projects p
             WHERE p.id IN (SELECT pm.project_id FROM quell_project_members pm WHERE pm.user_id = ? AND pm.rol = 'cli')
                OR (p.proyecto_id IS NOT NULL AND p.proyecto_id IN (SELECT id FROM proyectos WHERE cliente_id = ?))
             ORDER BY p.status, p.name`).bind(user.id, clienteDeLaSuite(env) || '').all();
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
        /* 0.77.0 · Mike, 6-oct: «Cree un nuevo proyecto en Quell, con un
         * cliente nuevo. Pero no me aparece ni el cliente ni el proyecto ni
         * en quote ni en dash.» La obra nace también con su cliente (el que
         * se escogió, el que ya existe con ese nombre, o uno nuevo) y su
         * proyecto en la suite, ligados. Lo pide la pantalla con `suite:
         * true`; sin eso la obra nace suelta como antes, para quien la va a
         * ligar a un proyecto que ya existe (dash101, «Nuevo proyecto»). */
        let suite = null;
        if (b.suite === true && typeof env.ALTA_EN_LA_SUITE === 'function' && (b.cliente_id || String(b.client || '').trim())) {
          suite = await env.ALTA_EN_LA_SUITE({ obra_id: id, cliente_id: b.cliente_id || null, cliente_nombre: b.client || null });
        }
        return json({ ok: true, id, proyecto_id: suite?.proyecto_id ?? null, cliente_id: suite?.cliente_id ?? null, cliente_nuevo: !!suite?.cliente_nuevo });
      }
    }
    const pid = seg[1];
    if (!(await canAccessProject(env, user, pid))) return err('sin acceso al proyecto', 403);

    /* ─────────────── el cronograma (0.68.0) ───────────────
     *
     * Mike, 5-oct: «necesito en quell poder configurar un cronograma (…)
     * asignar tiempo de fabricación total, y (…) definir tiempo de entrega
     * de material, fabricación e instalación, y a cada una asignarle un
     * proveedor o contratista (…) poder encadenar tareas (…) exportar (…)
     * Microsoft Project o Excel». Las cuentas viven en cronograma.js; aquí
     * se lee, se guarda entero (PUT reemplaza todas las tareas de la obra) y
     * se exporta. Sólo quien dirige la obra. */
    if (seg[2] === 'cronograma' || seg[2] === 'cronograma.xlsx' || seg[2] === 'cronograma.xml') {
      if (!isStaff(user)) return err('El cronograma lo arma quien dirige la obra.', 403);
      if (m === 'PUT' && seg[2] === 'cronograma') {
        const b = await req.json().catch(() => ({}));
        const project = await env.DB.prepare(`SELECT id, cronograma_inicio, cronograma_dias FROM quell_projects WHERE id = ?`).bind(pid).first();
        if (!project) return err('no encontrado', 404);
        const inicio = b.inicio === undefined ? project.cronograma_inicio : b.inicio;
        if (inicio !== null && inicio !== undefined && !fechaValida(inicio)) return err('La fecha de arranque va como AAAA-MM-DD.');
        const objetivo = b.dias_objetivo === undefined ? project.cronograma_dias : b.dias_objetivo;
        if (objetivo !== null && objetivo !== undefined && !(Number.isInteger(objetivo) && objetivo >= 0)) return err('El objetivo son días enteros.');
        const lista = Array.isArray(b.tareas) ? b.tareas : null;
        if (!lista) return err('Faltan las tareas (una lista, aunque sea vacía).');
        const { results: piezas } = await env.DB.prepare(`SELECT e.id FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id WHERE pl.project_id = ?`).bind(pid).all();
        const delProyecto = new Set(piezas.map((e) => e.id));
        const { results: provs } = await env.DB.prepare(`SELECT id FROM proveedores`).all();
        const proveedores = new Set(provs.map((p) => p.id));
        const { results: cons } = await env.DB.prepare(`SELECT id FROM quell_users WHERE role = 'con'`).all();
        const contratistas = new Set(cons.map((u) => u.id));
        // Los ids: se conservan los que vienen (la pantalla los reusa); los que no traen, o traen uno de «nuevo-», estrenan.
        const idDe = new Map();
        const limpias = [];
        for (const [i, t] of lista.entries()) {
          if (!t || typeof t !== 'object') return err(`La tarea ${i + 1} no se entiende.`);
          if (!delProyecto.has(t.element_id)) return err(`La tarea ${i + 1} apunta a una pieza que no es de esta obra.`);
          if (!ETAPAS_VALIDAS.includes(t.etapa)) return err(`La etapa de la tarea ${i + 1} es material, fabricacion, instalacion u otra.`);
          if (t.nombre != null && typeof t.nombre !== 'string') return err(`El nombre de la tarea ${i + 1} no se entiende.`);
          if (t.pos != null && !Number.isInteger(t.pos)) return err(`La posición de la tarea ${i + 1} es un entero.`);
          const dias = Number(t.dias);
          if (!Number.isInteger(dias) || dias < 1 || dias > 3650) return err(`Los días de la tarea ${i + 1} son un entero de 1 en adelante.`);
          if (t.proveedor_id && !proveedores.has(t.proveedor_id)) return err(`El proveedor de la tarea ${i + 1} no existe.`);
          if (t.contratista_id && !contratistas.has(t.contratista_id)) return err(`El contratista de la tarea ${i + 1} no es contratista de esta empresa.`);
          if (t.proveedor_id && t.contratista_id) return err(`La tarea ${i + 1} tiene un responsable: proveedor o contratista, no los dos.`);
          const costo = t.costo === undefined || t.costo === null ? 0 : Number(t.costo);
          if (!Number.isInteger(costo) || costo < 0) return err(`El costo de la tarea ${i + 1} son centavos enteros, cero o más.`);
          if (t.inicio_fijo && !fechaValida(t.inicio_fijo)) return err(`La fecha fija de la tarea ${i + 1} va como AAAA-MM-DD.`);
          const viejo = typeof t.id === 'string' && t.id ? t.id : `nuevo-${i}`;
          const id = viejo.startsWith('nuevo-') ? uid() : viejo;
          if (idDe.has(viejo)) return err(`La tarea ${i + 1} repite el id de otra.`);
          idDe.set(viejo, id);
          limpias.push({ id, element_id: t.element_id, seccion: String(t.seccion || '').trim().slice(0, 60), orden: Number.isInteger(t.orden) ? t.orden : 0, etapa: t.etapa, nombre: (t.nombre && String(t.nombre).trim().slice(0, 60)) || null, pos: Number.isInteger(t.pos) ? t.pos : ETAPAS.indexOf(t.etapa) * 10, dias, proveedor_id: t.proveedor_id || null, contratista_id: t.contratista_id || null, costo, depende_de: t.depende_de || null, inicio_fijo: t.inicio_fijo || null, notas: typeof t.notas === 'string' ? t.notas.slice(0, 500) : null });
        }
        // Dentro de una sección no se repite la etapa fija: es una por sección ('otra' sí se repite).
        const vistas = new Set();
        for (const t of limpias) {
          if (t.etapa === 'otra') continue;
          const k = `${t.element_id}\u0000${t.seccion}\u0000${t.etapa}`;
          if (vistas.has(k)) return err(`La sección «${t.seccion || 'de la pieza'}» repite la etapa ${NOMBRE_ETAPA[t.etapa]}.`);
          vistas.add(k);
        }
        for (const t of limpias) {
          if (!t.depende_de) continue;
          if (!idDe.has(t.depende_de)) return err('Una tarea depende de otra que no viene en la lista.');
          t.depende_de = idDe.get(t.depende_de);
          if (t.depende_de === t.id) return err('Una tarea no puede depender de sí misma.');
        }
        try { programar(limpias, inicio || now().slice(0, 10)); } catch (e) {
          if (e.message === 'ciclo') return err('Las cadenas se muerden la cola: una tarea termina dependiendo de sí misma.');
          throw e;
        }
        const t0 = now();
        await env.DB.prepare(`DELETE FROM quell_tareas WHERE project_id = ?`).bind(pid).run();
        for (const t of limpias) {
          await env.DB.prepare(`INSERT INTO quell_tareas (id, project_id, element_id, seccion, orden, etapa, nombre, pos, dias, proveedor_id, contratista_id, costo, depende_de, inicio_fijo, notas, creado_at, actualizado_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(t.id, pid, t.element_id, t.seccion, t.orden, t.etapa, t.nombre, t.pos, t.dias, t.proveedor_id, t.contratista_id, t.costo, t.depende_de, t.inicio_fijo, t.notas, t0, t0).run();
        }
        // Guardar es decidir: lo que no viene no vuelve solo (0.73.0).
        await env.DB.prepare(`UPDATE quell_elements SET fases_dadas = 1 WHERE id IN (SELECT e.id FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id WHERE pl.project_id = ?)`).bind(pid).run();
        await env.DB.prepare(`UPDATE quell_projects SET cronograma_inicio = ?, cronograma_dias = ? WHERE id = ?`).bind(inicio ?? null, objetivo ?? null, pid).run();
        const leido = await leerCronograma(env, pid, { completar: false });
        await sincronizarPartidas(env, pid, leido);
        return json({ ok: true, ...leido });
      }
      if (m !== 'GET') return err('no encontrado', 404);
      const c = await leerCronograma(env, pid);
      if (seg[2] === 'cronograma') return json({ ok: true, ...c });
      const limpio = String(c.nombre || 'obra').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'obra';
      if (seg[2] === 'cronograma.xlsx') {
        const libro = xlsx(hojasDelCronograma(c));
        return new Response(libro, { headers: { 'content-type': TIPO_XLSX, 'content-disposition': `attachment; filename="cronograma-${limpio}.xlsx"`, 'cache-control': 'no-store' } });
      }
      return new Response(xmlDeProject(c), { headers: { 'content-type': 'application/xml; charset=utf-8', 'content-disposition': `attachment; filename="cronograma-${limpio}.xml"`, 'cache-control': 'no-store' } });
    }

    if (!seg[2] && m === 'GET') {
      const project = await env.DB.prepare(`SELECT * FROM quell_projects WHERE id = ?`).bind(pid).first();
      if (!project) return err('no encontrado', 404);
      const { results: plans } = await env.DB.prepare(`SELECT * FROM quell_plans WHERE project_id = ? ORDER BY sort, created_at`).bind(pid).all();
      // 0029 · la lista de versiones viaja como lista, no como texto JSON.
      for (const p of plans) { p.versiones = versionesDe(p); p.rotation = Number(p.rotation) || 0; }
      // El cliente: todos los ítems del plano, pero sólo para ubicarse (código,
      // nombre, tipo, posición), resaltados los que tienen puntos por definir
      // (decisiones 3 y 4). Ni fase, ni pendientes, ni bitácora, ni quién anda
      // en la obra. El recorte pasa aquí, no al pintar.
      if (esCli(user)) {
        const { results: crudos } = await env.DB.prepare(
          `SELECT e.id, e.plan_id, e.project_id, e.code, e.name, e.type, e.x, e.y, ${ALCANCE_SQL},
             (SELECT COUNT(*) FROM quell_dudas d WHERE d.element_id = e.id AND d.para = 'cliente' AND d.estado = 'abierta') AS definir
           FROM quell_elements e JOIN quell_plans p ON p.id = e.plan_id
                LEFT JOIN items it ON it.id = e.item_id
           WHERE p.project_id = ? ORDER BY e.code`).bind(pid).all();
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
                OR EXISTS (SELECT 1 FROM quell_punch_items k WHERE k.element_id=e.id AND k.assignee_id=?)) AS suyo,
               ${ALCANCE_SQL}
             FROM quell_elements e JOIN quell_plans p ON p.id = e.plan_id
                  LEFT JOIN items it ON it.id = e.item_id
             WHERE p.project_id = ?
             ORDER BY e.code`
          ).bind(user.id, user.id, pid).all()
        : await env.DB.prepare(
            `SELECT e.*,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='pend') AS n_pend,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='proc') AS n_proc,
               (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id) AS n_total,
               (SELECT COUNT(*) FROM quell_element_etapas ee JOIN quell_etapas t ON t.clave=ee.etapa AND t.activa=1 WHERE ee.element_id=e.id) AS n_etapas,
               (SELECT COUNT(*) FROM quell_log_entries l WHERE l.element_id=e.id) AS n_log,
               ${ALCANCE_SQL}
             FROM quell_elements e JOIN quell_plans p ON p.id = e.plan_id
                  LEFT JOIN items it ON it.id = e.item_id
             WHERE p.project_id = ? ORDER BY e.code`
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
      /* La documentación de los ítems (0019), TODAS sus versiones: las
       * archivadas también ocupan lugar en R2, y borrar la obra sin ellas
       * deja pagando archivos que ya no reclama nadie. */
      await suma(`SELECT d.r2_key AS k FROM quell_element_docs d JOIN quell_elements e ON e.id = d.element_id WHERE e.project_id = ?`);
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
      /* 0029 · cuántos grados se giró el original al subirlo (Mike, 2-oct:
       * «a veces el PDF viene vertical»). La imagen ya viene girada; el PDF
       * no, y la capa nítida lo gira con este número. */
      const rotation = giroValido(fd.get('rotation'));
      await env.DB.prepare(`INSERT INTO quell_plans (id, project_id, name, file_name, image_key, source_key, width, height, sort, rotation) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, pid, fd.get('name') || 'Plano', fd.get('file_name') || '', imageKey, sourceKey, +fd.get('width') || 0, +fd.get('height') || 0, sort.s, rotation).run();
      return json({ ok: true, id, image_key: imageKey, rotation });
    }
    // Avisarle al cliente que tiene puntos por definir: un correo por cliente
    // de la obra, cuando el taller aprieta el botón. Nada automático por punto.
    if (seg[2] === 'avisar-cliente' && m === 'POST') {
      if (!isStaff(user)) return err('Avisarle al cliente es de quien dirige la obra.', 403);
      const b = await req.json().catch(() => ({}));
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const obra = await env.DB.prepare(`SELECT id, name, client FROM quell_projects WHERE id = ?`).bind(pid).first();
      // Los puntos abiertos, con su pieza, en el orden en que se abrieron:
      // son el cuerpo del correo (Mike, 1-oct: «que en el correo venga el
      // texto de la duda»).
      const { results: abiertas } = await env.DB.prepare(
        `SELECT d.texto, e.code, e.name AS pieza_nombre FROM quell_dudas d LEFT JOIN quell_elements e ON e.id = d.element_id
          WHERE d.project_id = ? AND d.para = 'cliente' AND d.estado = 'abierta' ORDER BY d.created_at ASC`).bind(pid).all();
      const dudas = abiertas.map((d) => ({ texto: d.texto, pieza: d.code ? `${d.code}${d.pieza_nombre ? ' · ' + d.pieza_nombre : ''}` : null }));
      const cuantos = dudas.length;
      if (!cuantos) return err('No hay puntos abiertos para el cliente en esta obra.', 400);
      const { results: clientes } = await env.DB.prepare(
        `SELECT u.id, u.email, u.name FROM quell_project_members pm JOIN quell_users u ON u.id = pm.user_id WHERE pm.project_id = ? AND pm.rol = 'cli' AND u.active = 1`).bind(pid).all();
      if (!clientes.length) return err('Esta obra no tiene cliente invitado. Invítalo desde la pantalla de inicio.', 400);
      let enviados = 0; const avisos = [];
      for (const c of clientes) {
        const r = await avisaCliente(env, req, c, obra, dudas);
        if (r.ok) enviados++; else avisos.push(`${c.email}: ${r.error}`);
      }
      await apunta(env, b.op_id);
      const { liga } = correoDePuntos({ sitio: sitioPeek(env.SITIO), quien: {}, obra, dudas });
      return json({ ok: true, puntos: cuantos, enviados, aviso: avisos.length ? avisos.join(' · ') : null, liga, dudas });
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
      /* 0024 · Subítem: la pieza nace colgada de otra pieza de la misma obra
       * (Mike, 30-sep: «trabajos o servicios complementarios a un ítem (…)
       * nacen como requerimientos nuevos, pero ligados al ítem»). Se revisa
       * que el padre exista y sea de ESTA obra; si el padre ya es un ítem, el
       * ítem del requerimiento cuelga de ése. */
      let padreId = null;
      let padreItemId = null;
      if (b.padre_id) {
        const padre = await env.DB.prepare(`SELECT id, item_id FROM quell_elements WHERE id = ? AND project_id = ?`).bind(String(b.padre_id), pid).first();
        if (!padre) return err('la pieza padre no es de esta obra', 400);
        padreId = padre.id;
        padreItemId = padre.item_id || null;
      }
      // Nace en producción: todavía no hay nada entregado que corregir.
      const alta = await conCodigoUnico(async () => {
        // 0.77.0: la descripción que se escribe al levantar la pieza (la que sale en quote101).
        const descripcion = String(b.descripcion ?? '').trim() || null;
        await env.DB.prepare(`INSERT INTO quell_elements (id, plan_id, project_id, code, type, name, resp, x, y, created_by, item_id, padre_id, descripcion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, seg[1], pid, codigo, tipo, b.name, b.resp || '', +b.x, +b.y, user.id, itemId, padreId, descripcion).run();
        await apunta(env, b.op_id);
        /* 0.49.0 · Mike, 29-sep: «los requerimientos generados me deberían
         * generar un borrador en quote dentro del proyecto». Si la obra está
         * ligada a un proyecto, el requerimiento nace también como ítem
         * cotizado y cae en el borrador de requerimientos de quote101; la
         * suite hace las dos cosas (org-db.ts). Sin liga, se queda como
         * pieza y se vuelve ítem al ligar, como siempre. */
        let cotizacionId = null;
        if (esRequerimiento(tipo) && !itemId && typeof env.LEVANTAR_REQUERIMIENTO === 'function') {
          const r = await env.LEVANTAR_REQUERIMIENTO({ element_id: id, obra_id: pid, code: codigo, name: b.name, padre_item_id: padreItemId, descripcion });
          itemId = r?.item_id || null;
          cotizacionId = r?.cotizacion_id || null;
        }
        return json({ ok: true, id, code: codigo, item_id: itemId, cotizacion_id: cotizacionId, padre_id: padreId });
      }, codigo);
      return alta;
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const b = await req.json();
      await env.DB.prepare(`UPDATE quell_plans SET name = COALESCE(?, name), sort = COALESCE(?, sort) WHERE id = ?`).bind(b.name ?? null, b.sort ?? null, seg[1]).run();
      return json({ ok: true });
    }
    /* 0029 · SUSTITUIR el plano por una versión nueva (Mike, 2-oct: «subir y
     * sustituir el que está para actualizar versiones»). Es el mismo plano
     * —mismo id, mismas piezas con sus x, y— con otra imagen y otro original.
     * Lo de antes no se borra: queda en `versiones` y los archivos siguen en
     * R2, por si hay que volver a mirar la hoja anterior. */
    if (seg[2] === 'sustituir' && m === 'POST') {
      if (!isStaff(user)) return err('sin permiso', 403);
      const plan = await env.DB.prepare(`SELECT * FROM quell_plans WHERE id = ?`).bind(seg[1]).first();
      if (!plan) return err('no encontrado', 404);
      const fd = await req.formData();
      const image = fd.get('image');
      if (!(image instanceof File)) return err('imagen del plano requerida');
      const versiones = versionesDe(plan);
      const n = versiones.length + 1;
      const imageKey = `${env.PREFIJO_R2}plans/${pid}/${plan.id}-v${n}.png`;
      await env.FILES.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type || 'image/png' } });
      let sourceKey = null;
      const source = fd.get('source');
      if (source instanceof File && source.size) {
        sourceKey = `${env.PREFIJO_R2}plans/${pid}/${plan.id}-v${n}-src.${(source.name.split('.').pop() || 'pdf').toLowerCase()}`;
        await env.FILES.put(sourceKey, source.stream(), { httpMetadata: { contentType: source.type || 'application/pdf' } });
      }
      versiones.push({
        image_key: plan.image_key, source_key: plan.source_key, file_name: plan.file_name,
        width: plan.width, height: plan.height, rotation: Number(plan.rotation) || 0,
        at: new Date().toISOString(), quien: user.name || user.email || null,
      });
      const rotation = giroValido(fd.get('rotation'));
      await env.DB.prepare(
        `UPDATE quell_plans SET image_key = ?, source_key = ?, file_name = ?, width = ?, height = ?, rotation = ?, versiones = ? WHERE id = ?`)
        .bind(imageKey, sourceKey, fd.get('file_name') || plan.file_name || '', +fd.get('width') || 0, +fd.get('height') || 0, rotation, JSON.stringify(versiones), plan.id).run();
      return json({ ok: true, id: plan.id, image_key: imageKey, rotation, version: n + 1 });
    }
    if (!seg[2] && m === 'DELETE') {
      if (!isStaff(user)) return err('sin permiso', 403);
      await env.DB.prepare(`DELETE FROM quell_plans WHERE id = ?`).bind(seg[1]).run();
      return json({ ok: true });
    }
  }

  /* ----- docs y marcas: se llega por el id del documento -----
   *
   * Van antes de `elements` porque comparten el mismo tramo de la dirección
   * y el permiso se resuelve por la obra del ítem al que cuelga el
   * documento, no por el documento en sí. */
  if (seg[0] === 'docs' && seg[1]) {
    const doc = await env.DB.prepare(`SELECT * FROM quell_element_docs WHERE id = ?`).bind(seg[1]).first();
    if (!doc) return err('no encontrado', 404);
    const pid = await projectOfElement(env, doc.element_id);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);

    if (seg[2] === 'versiones' && m === 'GET') {
      /* La familia entera, de la más nueva a la más vieja, con cuántas
       * marcas trae cada una: sin ese número, una versión archivada parece
       * un archivo repetido en vez del registro de lo que se marcó ese día. */
      const { results } = await env.DB.prepare(
        `SELECT d.*, u.name AS subio,
                (SELECT COUNT(*) FROM quell_doc_marcas mm WHERE mm.doc_id = d.id AND mm.borrado_at IS NULL) AS n_marcas
           FROM quell_element_docs d LEFT JOIN quell_users u ON u.id = d.subido_por
          WHERE d.familia_id = ? ORDER BY d.version DESC`).bind(doc.familia_id).all();
      return json({ ok: true, versiones: results });
    }
    if (seg[2] === 'marcas' && m === 'GET') {
      return json({ ok: true, marcas: await marcasDe(env, doc.id) });
    }
    if (seg[2] === 'version' && m === 'POST') {
      if (!isStaff(user)) return err('Subir una versión nueva es del supervisor.', 403);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const archivo = fd.get('archivo');
      if (!(archivo instanceof File) || !archivo.size) return err('falta el archivo');
      if (doc.archivado_at) return err('Ésa ya es una versión archivada. La versión nueva se sube sobre la que está a la vista.', 409);

      const ahora = new Date().toISOString();
      /* Primero se archiva y luego se inserta: el índice único deja UNA sola
       * viva por familia, así que al revés reventaría. Y es el orden que
       * queremos aunque no hubiera índice: entre los dos pasos es preferible
       * quedarse sin versión viva un instante que con dos. */
      await env.DB.prepare(`UPDATE quell_element_docs SET archivado_at = ? WHERE id = ?`).bind(ahora, doc.id).run();
      const nueva = await guardaDoc(env, {
        element_id: doc.element_id, rol: doc.rol, archivo,
        nombre: fd.get('nombre') || doc.nombre, paginas: fd.get('paginas'),
        familia_id: doc.familia_id, version: Number(doc.version) + 1, user, diseno: doc.diseno,
      });

      /* Copiar las marcas de la anterior es una DECISIÓN de quien sube, no
       * del esquema. Una nota clavada en un punto de la revisión vieja puede
       * apuntar a nada en la nueva —el dibujo cambió—, y por eso no se
       * copian solas; pero cuando el cambio es chico, volver a clavar
       * catorce notas a mano es lo que hace que nadie las use. */
      let copiadas = 0;
      if (String(fd.get('copiar_marcas') || '') === '1') {
        const viejas = await marcasDe(env, doc.id);
        for (const mk of viejas) {
          await env.DB.prepare(
            `INSERT INTO quell_doc_marcas (id, doc_id, tipo, pagina, x, y, trazo, color, texto, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .bind(uid(), nueva.id, mk.tipo, mk.pagina, mk.x, mk.y, mk.trazo, mk.color, mk.texto, user.id).run();
          copiadas++;
        }
      }
      await apunta(env, op);
      return json({ ok: true, doc: nueva, archivada: doc.id, copiadas });
    }
    if (seg[2] === 'archivar' && m === 'POST') {
      if (!isStaff(user)) return err('Archivar documentación es del supervisor.', 403);
      const b = await req.json().catch(() => ({}));
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      if (doc.rol === 'principal') {
        return err('El plano principal no se archiva a mano: se reemplaza subiendo una versión nueva, y así el ítem nunca se queda sin plano.', 409);
      }
      await env.DB.prepare(`UPDATE quell_element_docs SET archivado_at = ? WHERE id = ?`).bind(new Date().toISOString(), doc.id).run();
      await apunta(env, b.op_id);
      return json({ ok: true });
    }
    if (seg[2] === 'marcas' && m === 'POST') {
      if (!isStaff(user)) return err('Anotar el plano del ítem es del supervisor.', 403);
      if (doc.rol !== 'principal') return err('Sólo se anota sobre el plano principal; los demás son de soporte.', 409);
      if (doc.archivado_at) return err('Esa versión está archivada: se consulta, no se anota.', 409);
      const b = await req.json().catch(() => ({}));
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const tipo = b.tipo === 'trazo' ? 'trazo' : 'nota';
      const texto = String(b.texto ?? '').trim().slice(0, 2000);
      /* Un trazo sin puntos y una nota sin texto no son marcas: son un toque
       * que se fue. Se rechazan para que el plano no se llene de nada. */
      const puntos = Array.isArray(b.trazo) ? b.trazo.filter((p) => Array.isArray(p) && p.length === 2).map(([x, y]) => [ceroAUno(x), ceroAUno(y)]) : [];
      if (tipo === 'trazo' && puntos.length < 2) return err('un trazo necesita al menos dos puntos');
      if (tipo === 'nota' && !texto) return err('la nota necesita texto');
      const id = uid();
      await env.DB.prepare(
        `INSERT INTO quell_doc_marcas (id, doc_id, tipo, pagina, x, y, trazo, color, texto, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, doc.id, tipo, Math.max(1, Math.trunc(Number(b.pagina) || 1)),
              tipo === 'nota' ? ceroAUno(b.x) : null, tipo === 'nota' ? ceroAUno(b.y) : null,
              tipo === 'trazo' ? JSON.stringify(puntos) : null,
              b.color ? String(b.color).slice(0, 16) : null, texto, user.id).run();
      await apunta(env, b.op_id);
      return json({ ok: true, marcas: await marcasDe(env, doc.id) });
    }
    return err('no encontrado', 404);
  }
  if (seg[0] === 'marcas' && seg[1] && seg[2] === 'borrar' && m === 'POST') {
    const mk = await env.DB.prepare(
      `SELECT mk.*, d.element_id FROM quell_doc_marcas mk JOIN quell_element_docs d ON d.id = mk.doc_id WHERE mk.id = ?`).bind(seg[1]).first();
    if (!mk) return err('no encontrado', 404);
    const pid = await projectOfElement(env, mk.element_id);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!isStaff(user)) return err('Borrar una marca es del supervisor.', 403);
    const b = await req.json().catch(() => ({}));
    if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
    await env.DB.prepare(`UPDATE quell_doc_marcas SET borrado_at = ? WHERE id = ? AND borrado_at IS NULL`)
      .bind(new Date().toISOString(), mk.id).run();
    await apunta(env, b.op_id);
    return json({ ok: true, marcas: await marcasDe(env, mk.doc_id) });
  }

  /* 0.76.0 · El avance de obra de los ítems de un proyecto de dash101, de un
   * jalón (Mike, 6-oct: «en dash quiero que la lista de ítems tenga el mismo
   * estilo [que la de quell]»). La lista de quell enseña por pieza las etapas
   * cumplidas; dash101 lista ÍTEMS, y un ítem de cantidad 20 son 20 piezas.
   * Por ítem va: cuántas piezas tiene en algún plano, la suma de etapas
   * cumplidas (para el porcentaje), la MENOR (la etapa en la que va el
   * ítem es la de su pieza más atrasada), y sus pendientes de punchlist.
   * Sólo para quien dirige: es la lista del dinero, no la de la obra. */
  if (seg[0] === 'avance-items' && !seg[1] && m === 'GET') {
    if (!isStaff(user)) return err('sin acceso', 403);
    const proyecto = url.searchParams.get('proyecto_id');
    if (!proyecto) return err('Falta proyecto_id.', 400);
    const etapas = await catalogoEtapas(env);
    const { results } = await env.DB.prepare(
      `SELECT e.item_id, e.fase,
         (SELECT COUNT(*) FROM quell_element_etapas ee JOIN quell_etapas t ON t.clave=ee.etapa AND t.activa=1 WHERE ee.element_id=e.id) AS n_etapas,
         (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='pend') AS n_pend,
         (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id AND k.status='proc') AS n_proc,
         (SELECT COUNT(*) FROM quell_punch_items k WHERE k.element_id=e.id) AS n_total
       FROM quell_elements e JOIN items it ON it.id = e.item_id
       WHERE it.proyecto_id = ? AND e.type <> 'Requerimiento'`).bind(proyecto).all();
    const items = {};
    for (const r of results) {
      const n = Number(r.n_etapas) || 0;
      const a = items[r.item_id] || (items[r.item_id] = { piezas: 0, hechas: 0, menor: n, en_punchlist: 0, n_pend: 0, n_proc: 0, n_total: 0 });
      a.piezas += 1;
      a.hechas += n;
      a.menor = Math.min(a.menor, n);
      if (r.fase === 'punchlist') a.en_punchlist += 1;
      a.n_pend += Number(r.n_pend) || 0;
      a.n_proc += Number(r.n_proc) || 0;
      a.n_total += Number(r.n_total) || 0;
    }
    return json({ ok: true, etapas: etapas.map((x) => ({ clave: x.clave, nombre: x.nombre, abre_punchlist: !!x.abre_punchlist })), items });
  }

  // ----- elements -----
  /* 0.67.1 · De un ítem de la suite a su pieza del plano. quote101 (Mike,
   * 5-oct): «cuando estoy en quote viendo la lista de requerimientos nuevos,
   * quiero que si le doy click, a la derecha me abra la barra de quell de los
   * detalles del ítem». El cotizador tiene el ítem; la pieza la tiene esta
   * base. Sólo lo justo para ir a buscarla (`/elements/:id`); 404 si el ítem
   * no está en ningún plano, y el acceso a la obra se revisa como siempre. */
  if (seg[0] === 'items' && seg[1] && seg[2] === 'pieza' && m === 'GET') {
    const e = await env.DB.prepare(
      `SELECT e.id, e.project_id, e.plan_id, e.code, e.name, e.type, e.fase, e.padre_id, p.name AS project_name, pl.name AS plan_name
         FROM quell_elements e JOIN quell_projects p ON p.id = e.project_id JOIN quell_plans pl ON pl.id = e.plan_id
        WHERE e.item_id = ? ORDER BY e.id LIMIT 1`).bind(seg[1]).first();
    if (!e) return err('Este ítem no está en ningún plano.', 404);
    if (!(await canAccessProject(env, user, e.project_id))) return err('sin acceso', 403);
    return json({ ok: true, pieza: { element_id: e.id, project_id: e.project_id, project_name: e.project_name, plan_id: e.plan_id, plan_name: e.plan_name, code: e.code, name: e.name, type: e.type, fase: e.fase, padre_id: e.padre_id } });
  }

  if (seg[0] === 'elements' && seg[1]) {
    const eid = seg[1];
    const pid = await projectOfElement(env, eid);
    if (!pid || !(await canAccessProject(env, user, pid))) return err('sin acceso', 403);
    if (!seg[2] && m === 'GET') {
      const mio = soloLoSuyo(await rolEnObra(env, user, pid));
      /* El detalle trae además el alcance y la DESCRIPCIÓN del ítem. Mike,
       * 20-sep: «todos los ítems se deben identificar con código, nombre,
       * precio, descripción y tipo; así ayuda a organizar entre quell y dash
       * y quote». La descripción vivía sólo en dash; aquí viaja de ida, de
       * sólo lectura. El precio NO: enseñarlo en la obra se lo enseña también
       * al contratista, y eso lo decide Mike, no este archivo. */
      const element = await env.DB.prepare(
        `SELECT e.*, pl.name AS plan_name, ${ALCANCE_SQL}, it.descripcion AS item_descripcion,
                it.monto AS item_monto, it.cantidad AS item_cantidad, it.etapa AS item_etapa, it.etapa_at AS item_etapa_at,
                it.fecha_entrega AS item_fecha_entrega, ${ANTICIPO_SQL}
         FROM quell_elements e JOIN quell_plans pl ON pl.id = e.plan_id
              LEFT JOIN items it ON it.id = e.item_id
         WHERE e.id = ?`).bind(eid).first();
      /* EL PRECIO SE RECORTA AQUÍ, no en la pantalla.
       *
       * Mike lo decidió el 20-sep, con botones: en quell el precio del ítem
       * lo ven «sólo tú y la administración». Así que sale de la consulta
       * para el dueño, la administración y los socios, y para nadie más se
       * MANDA —un supervisor o un contratista no reciben el número, no es
       * que la pantalla se lo esconda—. Esconderlo al pintar deja el dato
       * viajando, y lo que viaja se lee. */
      /* 0.66.0 · Y el CLIENTE sí lo recibe (Mike, 4-oct: «al cliente sí le
       * debe aparecer el precio de cada ítem cuando lo selecciona en quell»):
       * es lo que él paga, y peek101 ya se lo enseña en su estado de cuenta. */
      if (element) {
        const rol = env.SESION?.quien?.rol;
        if (!(rol === 'owner' || rol === 'admin' || rol === 'socio' || esCli(user))) {
          delete element.item_monto;
          delete element.item_cantidad;
          delete element.anticipo_monto;   // 0.70.0: dinero, misma regla
        }
      }
      if (!element) return err('no encontrado', 404);
      /* Cuántos días faltan, ya contado (contrato 0.40.0). `null` cuando no
       * hay fecha: ahí la pantalla decide qué poner, y lo que pone es un
       * botón para fijarla. */
      element.item_entrega_falta = faltaParaEntrega(element.item_fecha_entrega);
      /* 0.90.0 · El archivo del diseño definido, si hay: para enseñarlo junto
       * a la fecha sin abrir la barra de archivos. */
      element.diseno_doc = await env.DB.prepare(
        `SELECT id, nombre, mime, paginas, version, r2_key, created_at FROM quell_element_docs
          WHERE element_id = ? AND diseno = 1 AND archivado_at IS NULL`).bind(eid).first() || null;
      /* La bitácora del alcance del ítem (0.64.0): cuándo entró, cuándo
       * salió, quién y por qué. Es del ítem, no de la pieza, y por eso viene
       * de `alcance_movimientos` y no de la bitácora de la obra. Sólo para la
       * empresa: al cliente no se le cuenta quién sacó qué. */
      element.item_alcance_movimientos = element.item_id && !esCli(user)
        ? (await env.DB.prepare(`SELECT id, accion, quien, app, motivo, at FROM alcance_movimientos WHERE item_id = ? ORDER BY at, id`).bind(element.item_id).all()).results
        : [];
      // El cliente: el ítem para ubicarse y sus puntos por definir, y nada más
      // (decisión 4). Ni fase, ni pendientes, ni bitácora, ni responsable.
      if (esCli(user)) {
        const { results: dudas } = await env.DB.prepare(
          `SELECT d.*, u.name AS quien, u.role AS quien_rol, r.name AS resuelta_por_nombre
             FROM quell_dudas d JOIN quell_users u ON u.id = d.user_id LEFT JOIN quell_users r ON r.id = d.resuelta_por
            WHERE d.element_id = ? AND d.para = 'cliente'
            ORDER BY CASE d.estado WHEN 'abierta' THEN 0 ELSE 1 END, d.created_at`).bind(eid).all();
        await armaDudas(env, dudas);
        /* 0.66.0 · Con lo del ítem que es suyo: precio, descripción, etapa y
         * entrega. Nada de la obra por dentro: ni fase, ni pendientes, ni quién. */
        const delItem = {
          item_id: element.item_id ?? null, item_monto: element.item_monto ?? null, item_descripcion: element.item_descripcion ?? null,
          item_etapa: element.item_etapa ?? null, item_fecha_entrega: element.item_fecha_entrega ?? null, item_entrega_falta: element.item_entrega_falta ?? null,
        };
        return json({ element: { ...soloUbicacion(element), plan_name: element.plan_name, ...delItem }, recorte: true, cliente: true, dudas, log: [], punch: [], etapas: [], hechas: [] });
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
      /* 0.54.1 · Mike, 30-sep, en la obra de Holcim: «en este ítem no me deja
       * agregar a un contratista». La regla era que primero se le daba acceso
       * a la obra en «Usuarios y accesos» y luego se asignaba al ítem; escogió
       * que el ítem lo haga en un solo paso. Un contratista de la empresa que
       * no está en la obra ENTRA a la obra aquí mismo (rol `con`, y le llega
       * el mismo correo que si lo hubieran agregado desde la pantalla de
       * accesos). Lo que sigue sin pasar: asignar a quien no es contratista o
       * está dado de baja. */
      const entran = [];
      for (const uidC of ids) {
        const q = await env.DB.prepare(
          `SELECT u.id, u.email, u.name, u.role, u.active, (SELECT 1 FROM quell_project_members pm WHERE pm.project_id = ? AND pm.user_id = u.id) AS en_obra FROM quell_users u WHERE u.id = ?`,
        ).bind(pid, uidC).first();
        if (!q || !q.active) return err('Ese contratista no existe o está dado de baja.', 400);
        if (q.role !== 'con') return err('Sólo se asignan contratistas (rol con).', 400);
        if (!q.en_obra) entran.push(q);
      }
      const ops = [env.DB.prepare(`DELETE FROM quell_element_contratistas WHERE element_id = ?${ids.length ? ` AND user_id NOT IN (${ids.map(() => '?').join(',')})` : ''}`).bind(eid, ...ids)];
      for (const q of entran) {
        ops.push(env.DB.prepare(`INSERT INTO quell_project_members (project_id, user_id, rol) VALUES (?,?,'con') ON CONFLICT (project_id, user_id) DO NOTHING`).bind(pid, q.id));
      }
      for (const uidC of ids) {
        ops.push(env.DB.prepare(`INSERT INTO quell_element_contratistas (element_id, user_id, asignado_por) VALUES (?,?,?) ON CONFLICT (element_id, user_id) DO NOTHING`).bind(eid, uidC, user.id));
      }
      await env.DB.batch(ops);
      await apunta(env, b.op_id);
      // El correo de «te dieron acceso a la obra» sale después de escribir,
      // como en POST members: la persona ya quedó adentro aunque no salga.
      const avisos = [];
      if (entran.length) {
        const obra = await env.DB.prepare(`SELECT name, client FROM quell_projects WHERE id = ?`).bind(pid).first();
        for (const q of entran) { const r = await invita(env, req, q, obra, 'con'); if (!r.ok) avisos.push(`${q.name}: ${r.error}`); }
      }
      const { results: contratistas } = await env.DB.prepare(
        `SELECT u.id, u.name, u.company, ec.asignado_at FROM quell_element_contratistas ec JOIN quell_users u ON u.id = ec.user_id WHERE ec.element_id = ? ORDER BY u.name`,
      ).bind(eid).all();
      return json({ ok: true, contratistas, entraron_a_la_obra: entran.map((q) => ({ id: q.id, name: q.name })), aviso: avisos.length ? avisos.join(' · ') : null });
    }
    if (!seg[2] && m === 'PATCH') {
      if (!isStaff(user)) return err('El contratista no edita elementos.', 403);
      const b = await req.json();
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const codigo = b.code === undefined || b.code === null ? null : String(b.code).trim();
      /* 0.70.0 · La fecha en que quedó definido el diseño (Mike, 6-oct: «poder
       * marcar en el ítem la fecha de definición de diseño, y si hay cambios,
       * poder editarla»). Vacía la quita. Mueve la pieza entera en el
       * cronograma, porque es uno de sus dos candados. */
      let diseno; // undefined = no se toca
      if (b.diseno_definido !== undefined) {
        if (b.diseno_definido === null || b.diseno_definido === '') diseno = null;
        else if (fechaValida(b.diseno_definido)) diseno = b.diseno_definido;
        else return err('La fecha de definición de diseño va como AAAA-MM-DD.');
      }
      // Reubicar: sólo cambian x y y, que ya existen. Pasa por la fila (op_id)
      // para que funcione sin señal, y deja constancia en la bitácora del
      // ítem: quién lo movió y cuándo (encargo A.4).
      const reubica = b.reubicar === true && typeof b.x === 'number' && typeof b.y === 'number';
      return await conCodigoUnico(async () => {
        await env.DB.prepare(`UPDATE quell_elements SET code = COALESCE(?, code), type = COALESCE(?, type), name = COALESCE(?, name), resp = COALESCE(?, resp), x = COALESCE(?, x), y = COALESCE(?, y) WHERE id = ?`)
          .bind(codigo, b.type ?? null, b.name ?? null, b.resp ?? null, b.x ?? null, b.y ?? null, eid).run();
        if (diseno !== undefined) await env.DB.prepare(`UPDATE quell_elements SET diseno_definido = ? WHERE id = ?`).bind(diseno, eid).run();
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
    /* La fecha de entrega, fijada desde la obra (contrato 0.40.0).
     *
     * Mike, 21-sep: «hay que agregar un campo en el ítem de fecha de entrega
     * y un contador de cuántos días quedan».
     *
     * Escribe `items.fecha_entrega`, que es la MISMA que ve dash101 y la que
     * el portal del cliente ya enseña. No se guarda una copia en el
     * elemento: dos fechas es la manera segura de que un día no coincidan, y
     * la que vería el cliente sería la equivocada.
     *
     * Una pieza SIN ítem ligado no tiene dónde guardarla, y eso se dice en
     * vez de inventarle un lugar. Vacío borra la fecha: «todavía no se sabe»
     * es una respuesta legítima y tiene que poderse volver a ella. */
    if (seg[2] === 'entrega' && m === 'POST') {
      if (!isStaff(user)) return err('La fecha de entrega la fija el supervisor.', 403);
      const el = await env.DB.prepare(`SELECT item_id FROM quell_elements WHERE id = ?`).bind(eid).first();
      if (!el?.item_id) return err('Esta pieza todavía no está ligada a un ítem, así que no tiene dónde guardar la fecha.', 409);
      const b = await req.json().catch(() => ({}));
      if (await yaHecha(env, b.op_id)) return json({ ok: true, repetida: true });
      const cruda = String(b.fecha ?? '').trim();
      if (cruda && !/^\d{4}-\d{2}-\d{2}$/.test(cruda)) return err('la fecha va como 2026-10-15');
      await env.DB.prepare(`UPDATE items SET fecha_entrega = ?, actualizado_at = ? WHERE id = ?`)
        .bind(cruda || null, new Date().toISOString(), el.item_id).run();
      await apunta(env, b.op_id);
      return json({ ok: true, fecha_entrega: cruda || null });
    }
    /* ─────────────── la documentación del ítem (§121) ───────────────
     *
     * Mike, 21-sep: «un apartado por ítem de documentación. Subir PDF de
     * planos y de anotaciones adicionales (…). Hay un archivo base que es el
     * plano o imagen sobre la que están las anotaciones del ítem, sería como
     * el principal, y los demás archivos son de soporte. Sólo en el
     * principal se hacen anotaciones».
     *
     * GET  /elements/:id/docs        lo vivo: el principal, los de soporte y
     *                                las marcas del principal
     * POST /elements/:id/docs        subir uno (rol: principal | soporte)
     * POST /docs/:id/version         subir la versión nueva; la anterior se
     *                                ARCHIVA, no se borra
     * GET  /docs/:id/versiones       la familia completa, de la nueva a la vieja
     * POST /docs/:id/archivar        quitar de la vista un archivo de soporte
     * POST /docs/:id/marcas          una nota anclada o un trazo
     * POST /marcas/:id/borrar        esconder una marca
     */
    if (seg[2] === 'docs' && m === 'GET') {
      const docs = await docsVivos(env, eid);
      const marcas = docs.principal ? await marcasDe(env, docs.principal.id) : [];
      return json({ ok: true, ...docs, marcas });
    }
    if (seg[2] === 'docs' && m === 'POST') {
      if (!isStaff(user)) return err('Subir documentación del ítem es del supervisor.', 403);
      const fd = await req.formData();
      const op = String(fd.get('op_id') || '');
      if (await yaHecha(env, op)) return json({ ok: true, repetida: true });
      const archivo = fd.get('archivo');
      if (!(archivo instanceof File) || !archivo.size) return err('falta el archivo');
      /* 0.90.0 · El archivo del DISEÑO DEFINIDO (Mike, 9-oct: «marcar que el
       * diseño ya está definido y poder adjuntar un plano (pdf) o imagen»).
       * Va aparte del principal —lo escogió con botones—: es de soporte con
       * la marca `diseno`. Uno vivo por pieza: si ya hay, éste es su versión
       * nueva y el anterior se archiva (se consulta en versiones). Con
       * `diseno_definido` (AAAA-MM-DD) se fecha la pieza en el mismo paso. */
      if (fd.get('diseno') === '1') {
        const fecha = String(fd.get('diseno_definido') || '');
        if (fecha && !fechaValida(fecha)) return err('La fecha del diseño no es válida (AAAA-MM-DD).', 400);
        const previo = await env.DB.prepare(
          `SELECT * FROM quell_element_docs WHERE element_id = ? AND diseno = 1 AND archivado_at IS NULL`).bind(eid).first();
        if (previo) await env.DB.prepare(`UPDATE quell_element_docs SET archivado_at = ? WHERE id = ?`).bind(new Date().toISOString(), previo.id).run();
        const doc = await guardaDoc(env, {
          element_id: eid, rol: 'soporte', archivo, nombre: fd.get('nombre'), paginas: fd.get('paginas'), user, diseno: 1,
          ...(previo ? { familia_id: previo.familia_id, version: Number(previo.version) + 1 } : {}),
        });
        if (fecha) await env.DB.prepare(`UPDATE quell_elements SET diseno_definido = ? WHERE id = ?`).bind(fecha, eid).run();
        await apunta(env, op);
        return json({ ok: true, doc, archivada: previo?.id || null, diseno_definido: fecha || null });
      }
      const rol = fd.get('rol') === 'principal' ? 'principal' : 'soporte';
      /* Un principal nuevo cuando ya hay uno vivo NO se cuela por el índice
       * único: se dice que use «versión nueva», que es lo que de verdad
       * quiere y lo que conserva la anterior. */
      if (rol === 'principal') {
        const ya = await env.DB.prepare(
          `SELECT id FROM quell_element_docs WHERE element_id = ? AND rol = 'principal' AND archivado_at IS NULL`).bind(eid).first();
        if (ya) return err('Este ítem ya tiene un plano principal. Súbelo como versión nueva para conservar el anterior, o mándalo como soporte.', 409);
      }
      const doc = await guardaDoc(env, { element_id: eid, rol, archivo, nombre: fd.get('nombre'), paginas: fd.get('paginas'), user });
      await apunta(env, op);
      return json({ ok: true, doc });
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
      /* 0.90.2 · Reasignar (Mike, 9-oct: «una vez creado el ítem de
       * punchlist no puedo editar a quien se le asigna»). `assignee_id`
       * vacío o null, mandado a propósito, lo deja SIN asignar; ausente, no
       * lo toca. Antes el COALESCE no dejaba quitarlo. */
      const quitaAsignado = b.assignee_id === '' || b.assignee_id === null;
      await env.DB.prepare(
        `UPDATE quell_punch_items SET title = COALESCE(?, title), description = COALESCE(?, description), resp = COALESCE(?, resp), due_date = COALESCE(?, due_date),
          assignee_id = CASE WHEN ? THEN NULL ELSE COALESCE(?, assignee_id) END,
          status = COALESCE(?, status), done_at = CASE WHEN ? = 'ok' THEN ? WHEN ? IS NOT NULL THEN NULL ELSE done_at END, done_by = CASE WHEN ? = 'ok' THEN ? ELSE done_by END WHERE id = ?`
      ).bind(b.title ?? null, b.description ?? null, b.resp ?? null, b.due_date ?? null, quitaAsignado ? 1 : 0, quitaAsignado ? null : (b.assignee_id ?? null), st, st, now(), st, st, user.id, kid).run();
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

/* Prueba de humo contra lo que ya está publicado en Cloudflare.
 *
 * El chat que escribe el código no alcanza *.workers.dev: el proxy de salida
 * se lo rechaza. El corredor de GitHub sí. Así que esto corre allá, y lo que
 * mide vuelve por el comentario del commit, que es lo único que el chat puede
 * leer (OPERAR.md §6).
 *
 * Las pruebas de vitest corren dentro de workerd; esto corre contra el Worker
 * de verdad, con su D1 de verdad y su Durable Object de verdad. Son cosas
 * distintas y las dos hacen falta: una prueba que pasa en local no dice que el
 * despliegue haya salido.
 *
 *   STAGING  el recorrido completo (crear org, entrar, ítem, etapa, WebSocket,
 *            permisos). Ahí ENTORNO no es "produccion", así que /auth/codigo
 *            devuelve el código y se puede entrar sin buzón de correo.
 *   PROD     que responda, y que NO devuelva el código. Eso último es una
 *            prueba en sí: si algún día lo devolviera, cualquiera entraría con
 *            el correo de otro.
 */

import WebSocket from 'ws';
import { readdirSync } from 'node:fs';

/** Cuántas migraciones tiene hoy el OrgDB, contadas del repositorio. Así el
 *  humo no se queda atrás cada vez que se agrega una. */
const MIGRACIONES_ORG = readdirSync(new URL('../migrations/org/', import.meta.url).pathname)
  .filter((f) => f.endsWith('.sql')).length;

const STAGING = process.env.STAGING;
const PROD = process.env.PROD;
const CORREO = process.env.CORREO_SUPERADMIN || 'mike@forespot.com';
const ORG = `humo-${process.env.GITHUB_RUN_ID || Date.now()}`.slice(0, 40);

let fallas = 0;
let revisadas = 0;
let galleta = '';

const linea = (t) => console.log(t);
function rev(ok, texto, extra = '') {
  revisadas++;
  if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}

async function pedir(base, ruta, { app, method = 'GET', body, token } = {}) {
  const t0 = Date.now();
  const cabeceras = { 'Content-Type': 'application/json' };
  if (app) cabeceras['X-App'] = app;
  // Con token se pide como una app empacada: sin cookie, con el token a mano.
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  else if (galleta) cabeceras.Cookie = galleta;
  const r = await fetch(`${base}${ruta}`, { method, headers: cabeceras, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const puesta = r.headers.get('set-cookie');
  if (puesta) galleta = puesta.split(';')[0];
  // Si no vuelve JSON hay que poder verlo: un Worker que se pasa de CPU
  // contesta una pagina de error de Cloudflare, y un `catch {}` que la tira
  // deja la falla sin explicacion.
  const texto = await r.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { no_json: texto.slice(0, 200) }; }
  return { estado: r.status, ms: Date.now() - t0, ...cuerpo };
}

/* ─────────────── producción: que responda y que se calle el código ─────────────── */

async function produccion() {
  linea('');
  linea(`== Producción == ${PROD}`);
  const s = await pedir(PROD, '/salud');
  rev(s.estado === 200, '/salud responde 200', `${s.ms} ms`);
  rev(s.data?.servicio === 'suite101-api', 'se identifica como suite101-api', `version ${s.data?.version} · contrato ${s.data?.contrato}`);
  rev(String(s.data?.d1).startsWith('si'), 'alcanza el D1 «master»', String(s.data?.d1));
  rev(s.data?.entorno === 'produccion', 'ENTORNO=produccion');

  const guardada = galleta;
  galleta = '';
  const c = await pedir(PROD, '/auth/codigo', { method: 'POST', body: { correo: 'nadie@ejemplo.mx' } });
  rev(c.data?.codigo_prueba === undefined, 'producción NUNCA devuelve el código en la respuesta');
  const sin = await pedir(PROD, `/orgs/${ORG}`, { app: 'dash101' });
  rev(sin.estado === 401 && sin.error === 'sin_sesion', 'sin cookie no se pasa de la puerta', `${sin.estado} ${sin.error}`);
  // Contrato 0.8.0: la puerta del token existe, pero no regala nada.
  // Licencias (0.13.0): en producción sólo se mira. La llave pública tiene que
  // estar servida, y una clave inventada tiene que rebotar sin escribir nada.
  const llave = await pedir(PROD, '/licencias/llave');
  rev(llave.estado === 200 && llave.data?.alg === 'Ed25519' && /^[A-Za-z0-9_-]{43}$/.test(llave.data?.publica || ''), 'la llave pública de licencias se sirve (Ed25519)', `kid ${llave.data?.kid}`);
  const claveFalsa = await pedir(PROD, '/licencias/activar', { method: 'POST', body: { clave: 'T101-AAAA-BBBB-CCCC', huella: 'humo-0123456789abcdef' } });
  rev(claveFalsa.estado === 404 && claveFalsa.error === 'clave_inexistente', 'una clave inventada no activa nada', `${claveFalsa.estado} ${claveFalsa.error}`);
  const panelSinSesion = await pedir(PROD, '/licencias');
  rev(panelSinSesion.estado === 401, 'el panel de licencias no se ve sin sesión', `${panelSinSesion.estado}`);

  // roster101 (0.17.0): la puerta de los expedientes está en pie. En producción
  // sólo se mira: sin sesión el panel contesta 401 y nadie pide un código
  // (eso escribe en la base de la empresa y manda un correo de verdad).
  const rosterSalud = await pedir(PROD, '/roster/forespot/api/salud', { app: 'roster101' });
  rev((rosterSalud.estado === 200 && rosterSalud.datos === 'suite') || (rosterSalud.estado === 403 && rosterSalud.error === 'app_inactiva'),
    'la puerta de roster101 de forespot está en pie (200 con datos en la suite, o 403 si roster101 está apagada)', `${rosterSalud.estado} ${rosterSalud.datos ?? rosterSalud.error ?? ''}`);
  const rosterPanel = await pedir(PROD, '/roster/forespot/api/admin/yo', { app: 'roster101' });
  rev(rosterPanel.estado === 401 || rosterPanel.estado === 403, 'y su panel no abre sin sesión', `${rosterPanel.estado}`);
  const rosterSinApp = await pedir(PROD, '/roster/forespot/api/salud');
  rev(rosterSinApp.estado === 400 && rosterSinApp.error === 'sin_app', 'sin X-App roster101 no se pasa', `${rosterSinApp.estado} ${rosterSinApp.error}`);

  const conBasura = await pedir(PROD, '/yo', { token: 'no-soy-un-token.niFirma' });
  rev(conBasura.estado === 401 && conBasura.error === 'sin_sesion', 'un token inventado tampoco pasa de la puerta', `${conBasura.estado} ${conBasura.error}`);

  // Google en producción: sólo se mira. Un volver_a ajeno es 403; el de una
  // app de la suite pasa la puerta del origen (501 mientras Mike no ponga las
  // llaves, 302 a accounts.google.com cuando las ponga; ambos valen aquí).
  const volverAjeno = await pedir(PROD, '/auth/google?volver_a=' + encodeURIComponent('https://malo.ejemplo.mx/'));
  rev(volverAjeno.estado === 403 && volverAjeno.error === 'origen_no_permitido', 'un volver_a ajeno a la suite se rechaza', `${volverAjeno.estado} ${volverAjeno.error}`);
  for (const app of ['master101', 'workshop101']) {
    const paso = await fetch(`${PROD}/auth/google?volver_a=${encodeURIComponent(`https://${app}.mike-929.workers.dev/`)}`, { redirect: 'manual' });
    rev(paso.status !== 403, `${app} está en ORIGENES: /auth/google no lo rechaza como ajeno`, `${paso.status}`);
  }
  const propio = await fetch(`${PROD}/auth/google?volver_a=${encodeURIComponent('https://master101.mike-929.workers.dev/')}`, { redirect: 'manual' });
  const aGoogle = propio.status === 302 && String(propio.headers.get('location')).startsWith('https://accounts.google.com/');
  rev(propio.status === 501 || aGoogle, 'master101 está en ORIGENES: /auth/google no lo rechaza', aGoogle ? 'Google prendido: 302 a accounts.google.com' : `${propio.status} (sin llaves de Google todavía)`);
  if (aGoogle) {
    const destino = new URL(propio.headers.get('location')).searchParams.get('redirect_uri');
    rev(destino === `${PROD}/auth/google/callback`, 'y Google devuelve a la API, no a la app', String(destino));
  }
  galleta = guardada;

  // CORS en el borde de verdad. Hasta ahora solo se habia probado con curl y
  // con Node, que no aplican la politica del navegador: la primera app que se
  // conectara iba a ser la que lo descubriera.
  const ORIGEN = 'https://dash101.mike-929.workers.dev';
  const pre = await fetch(`${PROD}/orgs/x/items`, {
    method: 'OPTIONS',
    headers: { Origin: ORIGEN, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'X-App,Content-Type' },
  });
  rev(pre.status === 204, 'el preflight contesta 204', String(pre.status));
  // Con credenciales no se puede contestar `*`: el navegador tira la respuesta.
  rev(pre.headers.get('access-control-allow-origin') === ORIGEN, 'devuelve el origen exacto, no un comodin', String(pre.headers.get('access-control-allow-origin')));
  rev(pre.headers.get('access-control-allow-credentials') === 'true', 'permite credenciales (la cookie de sesion)');
  rev(String(pre.headers.get('access-control-allow-headers')).includes('X-App'), 'deja pasar la cabecera X-App');
  rev(String(pre.headers.get('access-control-allow-headers')).includes('Authorization'), 'y la cabecera Authorization, que es como entra una app empacada');
  const ajeno = await fetch(`${PROD}/salud`, { headers: { Origin: 'https://sitio-de-nadie.example' } });
  rev(ajeno.headers.get('access-control-allow-origin') === null, 'un origen que no esta en la lista NO recibe permiso');
}

/* ─────────────── staging: el recorrido completo ─────────────── */

async function recorrido() {
  linea('');
  linea(`== Staging == ${STAGING}`);
  galleta = '';

  const s = await pedir(STAGING, '/salud');
  rev(s.estado === 200, '/salud responde 200', `${s.ms} ms`);

  // 3 · entra con código por correo y la sesión sobrevive
  const cod = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO } });
  rev(/^\d{6}$/.test(String(cod.data?.codigo_prueba)), 'llega un código de 6 dígitos');
  // Y NO se manda correo de verdad. Esta misma línea, corrida unas veinte
  // veces el 16-sep entre todos los repositorios, agotó los 100 envíos del día
  // de Resend: cada medición mandaba un correo que nadie iba a leer, y la
  // mitad rebotaba contra el dominio con el que le llega el código a la gente.
  // Fuera de producción el correo no sale (`src/auth/correo.ts`), y esto lo
  // comprueba desde afuera: el código viene en la respuesta, el envío dice que
  // no. Que en producción el código NUNCA venga en la respuesta se comprueba
  // más arriba, contra producción.
  rev(cod.data?.enviado === false, 'y NO se manda correo de verdad en staging', `enviado=${cod.data?.enviado}`);
  const ent = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.data?.codigo_prueba } });
  rev(ent.estado === 200, 'entra con el código', `${ent.ms} ms`);
  const yo = await pedir(STAGING, '/yo');
  rev(yo.estado === 200 && yo.data?.superadmin === true, 'la sesión sigue viva en la petición siguiente');

  // 2 · se crea una org y su DO nace solo
  const nueva = await pedir(STAGING, '/admin/orgs', { method: 'POST', body: { id: ORG, nombre: 'Humo' } });
  rev(nueva.estado === 201, `se crea la org ${ORG}`, `${nueva.ms} ms`);
  // Desde 0002 (partidas a tabla propia) el DO nace en la versión 2.
  // El número se lee de las migraciones del repo, no se escribe a mano: subir
  // una migración y olvidar este número dejó el humo en rojo el 16-sep, con la
  // 0004 (folios) ya publicada y funcionando. Lo que importa es que el DO
  // nazca al día, y «al día» lo define el repositorio.
  rev(nueva.data?.org_db_version === MIGRACIONES_ORG,
    `su Durable Object nació y corrió las ${MIGRACIONES_ORG} migraciones solo, sin redeploy`,
    `version ${nueva.data?.org_db_version}`);

  // Contrato 0.5.0: lo que master101 necesita.
  const supers = await pedir(STAGING, '/admin/superadmins');
  rev(supers.estado === 200 && (supers.data?.filas || []).some((x) => x.correo === CORREO), 'la lista de superadmins trae al que entró', `${supers.data?.total} superadmin(s)`);
  const apagaPeek = await pedir(STAGING, `/admin/orgs/${ORG}`, { method: 'PATCH', body: { apps: { dash: true, quell: true, peek: false, cotizador: true, roster: true, nest: true } } });
  rev(apagaPeek.estado === 200 && typeof apagaPeek.data?.personas === 'number', 'PATCH devuelve la empresa con sus conteos', `personas ${apagaPeek.data?.personas}`);
  const bit = await pedir(STAGING, `/admin/orgs/${ORG}/bitacora`);
  const renglones = bit.data?.filas || [];
  rev(renglones.some((r) => r.campo === 'apps.peek' && r.antes === 'true' && r.despues === 'false' && r.quien === CORREO), 'apagar peek dejó su renglón en la bitácora, con el correo de quien lo hizo', renglones.map((r) => r.campo).join(', '));
  rev(renglones.some((r) => r.campo === 'creada'), 'y la creación de la empresa también quedó apuntada');
  const conConteos = await pedir(STAGING, '/admin/orgs');
  const mia = (conConteos.data?.filas || []).find((o) => o.id === ORG);
  rev(mia && mia.personas === 0 && mia.ultima_entrada === null, 'GET /admin/orgs trae personas y ultima_entrada por empresa', JSON.stringify({ personas: mia?.personas, ultima_entrada: mia?.ultima_entrada }));

  // Contrato 0.6.0: lo que workshop101 necesita (el administrador de la empresa).
  const duena = await pedir(STAGING, `/admin/orgs/${ORG}/miembros`, { method: 'POST', body: { correo: `duena-${ORG}@ejemplo.mx`, nombre: 'Dueña', rol: 'owner' } });
  rev(duena.estado === 201, 'se nombra a la dueña de la empresa', `${duena.ms} ms`);
  const socia = await pedir(STAGING, `/admin/orgs/${ORG}/miembros`, { method: 'POST', body: { correo: `socia-${ORG}@ejemplo.mx`, rol: 'socio', apps: ['dash'] } });
  rev(socia.estado === 201 && JSON.stringify(socia.data?.apps) === '["dash"]', 'y a una socia con sólo dash101', JSON.stringify(socia.data?.apps));
  const gente = await pedir(STAGING, `/admin/orgs/${ORG}/miembros`);
  const fSocia = (gente.data?.filas || []).find((f) => f.usuario_id === socia.data?.usuario_id);
  rev(gente.estado === 200 && fSocia && fSocia.ultima_entrada === null, 'la lista trae ultima_entrada por persona (la socia: nunca)', JSON.stringify(fSocia?.ultima_entrada));
  const masApps = await pedir(STAGING, `/admin/orgs/${ORG}/miembros/${socia.data?.usuario_id}`, { method: 'PATCH', body: { apps: ['dash', 'quell'] } });
  rev(masApps.estado === 200 && JSON.stringify(masApps.data?.apps) === '["dash","quell"]', 'PATCH cambia las apps de la socia', JSON.stringify(masApps.data?.apps));
  const ultimo = await pedir(STAGING, `/admin/orgs/${ORG}/miembros/${duena.data?.usuario_id}`, { method: 'DELETE' });
  rev(ultimo.estado === 409 && ultimo.error === 'ultimo_owner', 'a la última dueña no se le da de baja', `${ultimo.estado} ${ultimo.error}`);
  const bit2 = await pedir(STAGING, `/admin/orgs/${ORG}/bitacora`);
  rev((bit2.data?.filas || []).some((r) => r.campo === 'miembro.apps' && r.quien === CORREO), 'el cambio de apps quedó en la bitácora de la empresa');

  // Contrato 0.14.0: el alta automática (plan y cobro por empresa, bienvenida).
  rev(mia?.cortesia === true && mia?.estado === 'activa', 'una empresa sin fecha de pago es de cortesía y está activa', `${mia?.cortesia} ${mia?.estado}`);
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const vencida = await pedir(STAGING, `/admin/orgs/${ORG}`, { method: 'PATCH', body: { cortesia: false, paga_hasta: ayer } });
  rev(vencida.estado === 200 && vencida.data?.estado === 'sin_pago', 'pagada hasta ayer, la empresa queda «sin pago»', `${vencida.estado} ${vencida.data?.estado}`);
  const sinPago = await pedir(STAGING, `/orgs/${ORG}`, { app: 'dash101' });
  rev(sinPago.estado === 402 && sinPago.error === 'org_sin_pago', 'y sus apps contestan 402 org_sin_pago', `${sinPago.estado} ${sinPago.error}`);
  const panel = await pedir(STAGING, `/orgs/${ORG}`, { app: 'workshop101' });
  rev(panel.estado === 200, 'pero el panel del director sigue abriendo', `${panel.estado}`);
  const pago = await pedir(STAGING, `/admin/orgs/${ORG}/pago`, { method: 'POST', body: { hasta: manana, referencia: 'humo' } });
  rev(pago.estado === 200 && pago.data?.estado === 'activa' && pago.data?.paga_hasta === manana, 'marcar el pago hasta mañana la reabre', `${pago.estado} ${pago.data?.estado}`);
  const abierta = await pedir(STAGING, `/orgs/${ORG}`, { app: 'dash101' });
  rev(abierta.estado === 200, 'y las apps vuelven a contestar 200', `${abierta.estado}`);
  const bienvenida = await pedir(STAGING, `/admin/orgs/${ORG}/bienvenida`, { method: 'POST', body: { correo: `duena-${ORG}@ejemplo.mx` } });
  rev(bienvenida.estado === 200 && bienvenida.data?.enviado === false, 'la bienvenida se intenta y en staging NO sale de verdad', `${bienvenida.estado} enviado=${bienvenida.data?.enviado} (${bienvenida.data?.motivo})`);

  // Contrato 0.15.0: invitar a un cliente desde una app con base propia (quell101).
  const negI = await pedir(STAGING, `/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: { nombre: 'Invitaciones' } });
  rev(negI.estado === 201, 'hay un negocio de dónde colgar clientes', `${negI.estado}`);
  const inv = await pedir(STAGING, `/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: { correo: `cliente-${ORG}@ejemplo.mx`, nombre: 'Cliente Invitado' } });
  rev(inv.estado === 201 && inv.data?.nuevo_usuario === true && inv.data?.nuevo_cliente === true, 'quell101 invita a un cliente: cliente nuevo, persona nueva, acceso de cliente', `${inv.estado} ${inv.error || ''}`);
  const inv2 = await pedir(STAGING, `/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: { correo: `cliente-${ORG}@ejemplo.mx`, nombre: 'Cliente Invitado' } });
  rev(inv2.estado === 201 && inv2.data?.cliente_id === inv.data?.cliente_id && inv2.data?.nuevo_cliente === false, 'invitarlo otra vez no duplica al cliente', `${inv2.estado}`);
  const mikeCli = await pedir(STAGING, `/orgs/${ORG}/clientes/invitar`, { app: 'quell101', method: 'POST', body: { correo: CORREO, nombre: 'Mike' } });
  rev(mikeCli.estado === 409 && mikeCli.error === 'es_miembro', 'el superadmin no se vuelve cliente', `${mikeCli.estado} ${mikeCli.error}`);
  const galletaAntes = galleta;
  galleta = '';
  const codInv = await pedir(STAGING, "/auth/codigo", { method: "POST", body: { correo: `cliente-${ORG}@ejemplo.mx` } });
  const entInv = await pedir(STAGING, "/auth/entrar", { method: "POST", body: { correo: `cliente-${ORG}@ejemplo.mx`, codigo: codInv.data?.codigo_prueba } });
  rev(entInv.estado === 200, "el cliente invitado entra con el código, sin PIN", `${entInv.estado}`);
  const yoC = await pedir(STAGING, '/yo');
  rev(yoC.data?.acceso?.tipo === 'cliente' && (yoC.data?.orgs || []).length === 0, 'y la suite lo ve como cliente, no como miembro', JSON.stringify(yoC.data?.acceso));
  // En la org del humo peek101 está apagada a propósito (se prueba más abajo),
  // así que /peek se pide con otra app: la ruta es del cliente, no de la app.
  const peekC = await pedir(STAGING, `/orgs/${ORG}/peek`, { app: 'dash101' });
  rev(peekC.estado === 200 && peekC.data?.cliente?.correo === `cliente-${ORG}@ejemplo.mx`, 'abre /peek con la misma cuenta', `${peekC.estado} ${peekC.error || ''}`);
  const tablaC = await pedir(STAGING, `/orgs/${ORG}/items`, { app: 'quell101' });
  rev(tablaC.estado === 403, 'y una tabla suelta con X-App quell101 le contesta 403', `${tablaC.estado}`);
  galleta = galletaAntes;

  // Contrato 0.16.0: quell101 vive en la base de la empresa. El dueño de la
  // suite entra a la bitácora de la empresa del humo, levanta una obra y un
  // ítem, y la borra; master101 cuenta lo que hay.
  const yoQuell = await pedir(STAGING, `/orgs/${ORG}/quell/me`, { app: 'quell101' });
  rev(yoQuell.estado === 200 && yoQuell.data === undefined && yoQuell.user?.role === 'admin', 'el dueño de la suite entra a quell101 de la empresa y nace como dueño de la bitácora', `${yoQuell.estado} ${yoQuell.user?.role}`);
  const obra = await pedir(STAGING, `/orgs/${ORG}/quell/projects`, { app: 'quell101', method: 'POST', body: { name: `Obra de humo ${ORG}`, client: 'Cliente de humo' } });
  rev(obra.estado === 200 && !!obra.id, 'levanta una obra', `${obra.estado}`);
  const conteo = await pedir(STAGING, `/admin/orgs/${ORG}/quell`);
  rev(conteo.estado === 200 && conteo.data?.filas?.quell_projects === 1 && conteo.data?.filas?.quell_etapas === 5, 'master101 cuenta 1 obra y las 5 etapas', JSON.stringify(conteo.data?.filas));
  const borrada = await pedir(STAGING, `/orgs/${ORG}/quell/projects/${obra.id}`, { app: 'quell101', method: 'DELETE' });
  rev(borrada.estado === 200, 'y la borra', `${borrada.estado}`);
  const sinCliente = await pedir(STAGING, `/orgs/${ORG}/quell/me`, { app: 'quell101', token: 'inventado' });
  rev(sinCliente.estado === 401, 'sin sesión la bitácora contesta 401', `${sinCliente.estado}`);

  // Contrato 0.17.0: roster101 vive en la base de la empresa. El dueño de la
  // suite abre el panel de expedientes de la empresa del humo; un trabajador
  // entra por SU puerta (correo y código, sin cuenta en la suite; staging
  // devuelve el código), ve su expediente vacío y sale; master101 cuenta.
  const cabeceraEmpresa = encodeURIComponent(JSON.stringify({ empresa: `Empresa de humo ${ORG}`, aviso_version: '2026-09-03', version: 'humo' }));
  const yoRoster = await pedir(STAGING, `/roster/${ORG}/api/admin/yo`, { app: 'roster101' });
  rev(yoRoster.estado === 200 && yoRoster.nivel === 'dueno' && yoRoster.de_la_suite === true, 'el dueño de la suite abre el panel de roster101 de la empresa como dueño', `${yoRoster.estado} ${yoRoster.nivel ?? yoRoster.error ?? ''}`);
  const configR = await fetch(`${STAGING}/roster/${ORG}/api/config`, { headers: { 'X-App': 'roster101', 'X-Roster': cabeceraEmpresa } }).then((r) => r.json()).catch(() => ({}));
  rev(configR.empresa === `Empresa de humo ${ORG}` && configR.aviso_version === '2026-09-03', 'los datos de la empresa llegan desde la cabecera de su Worker', JSON.stringify(configR));
  const galletaDelSuper = galleta;
  galleta = '';
  const correoT = `trabajador-${ORG}@ejemplo.mx`;
  const codT = await pedir(STAGING, `/roster/${ORG}/api/codigo`, { app: 'roster101', method: 'POST', body: { email: correoT } });
  rev(codT.estado === 200 && /^\d{6}$/.test(String(codT.codigo_prueba || '')), 'un trabajador pide su código por su propia puerta, sin cuenta en la suite (staging lo devuelve)', `${codT.estado} ${codT.error ?? ''}`);
  const entT = await pedir(STAGING, `/roster/${ORG}/api/entrar`, { app: 'roster101', method: 'POST', body: { email: correoT, codigo: codT.codigo_prueba } });
  rev(entT.estado === 200 && entT.nuevo === true && galleta.startsWith('t101_sesion='), 'entra, es nuevo, y su sesión es la cookie de siempre', `${entT.estado} ${galleta.slice(0, 12)}`);
  const yoT = await pedir(STAGING, `/roster/${ORG}/api/yo`, { app: 'roster101' });
  rev(yoT.estado === 200 && yoT.trabajador?.email === correoT && yoT.trabajador?.folio === 1 && yoT.aviso === null, 've su expediente vacío, folio 1, sin aviso aceptado', `${yoT.estado} ${yoT.trabajador?.folio}`);
  const panelT = await pedir(STAGING, `/roster/${ORG}/api/admin/yo`, { app: 'roster101' });
  rev(panelT.estado === 401, 'y con esa cookie el panel no abre', `${panelT.estado}`);
  await pedir(STAGING, `/roster/${ORG}/api/salir`, { app: 'roster101', method: 'POST' });
  galleta = galletaDelSuper;
  const conteoR = await pedir(STAGING, `/admin/orgs/${ORG}/roster`);
  rev(conteoR.estado === 200 && conteoR.data?.filas?.roster_trabajadores === 1 && conteoR.data?.filas?.roster_administradores === 0, 'master101 cuenta 1 expediente y 0 cuentas del panel', JSON.stringify(conteoR.data?.filas));

  // La puerta aplica la lista: la socia entra a dash101 y a quell101, no a peek101 (que además está apagada) ni a workshop101.
  const galletaSuper = galleta;
  const codS = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: `socia-${ORG}@ejemplo.mx` } });
  const entS = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: `socia-${ORG}@ejemplo.mx`, codigo: codS.data?.codigo_prueba } });
  rev(entS.estado === 200, 'la socia entra con su código', `${entS.ms} ms`);
  const sDash = await pedir(STAGING, `/orgs/${ORG}`, { app: 'dash101' });
  const sRoster = await pedir(STAGING, `/orgs/${ORG}`, { app: 'roster101' });
  const sPanel = await pedir(STAGING, `/orgs/${ORG}`, { app: 'workshop101' });
  rev(sDash.estado === 200, 'la socia entra a dash101 (está en su lista)', `${sDash.estado}`);
  rev(sRoster.estado === 403 && sRoster.error === 'app_no_permitida', 'y roster101 le contesta app_no_permitida', `${sRoster.estado} ${sRoster.error}`);
  const sPanelRoster = await pedir(STAGING, `/roster/${ORG}/api/admin/yo`, { app: 'roster101' });
  rev(sPanelRoster.estado === 401, 'ni el panel de expedientes la deja entrar (no trae roster en su lista)', `${sPanelRoster.estado}`);
  rev(sPanel.estado === 403 && sPanel.detalle?.motivo === 'solo_administra', 'workshop101 no la deja entrar: no administra', `${sPanel.estado} ${sPanel.detalle?.motivo ?? sPanel.error}`);
  rev((await pedir(STAGING, `/admin/orgs/${ORG}/miembros`)).estado === 403, 'ni puede ver la gente de la empresa');
  galleta = galletaSuper;
  const fuera = await pedir(STAGING, `/admin/orgs/${ORG}/miembros/${socia.data?.usuario_id}`, { method: 'DELETE' });
  rev(fuera.estado === 200, 'el superadmin da de baja a la socia');

  // Contrato 0.7.0: la contraseña de verdad, junto al código, el PIN y Google.
  const CORREO_CLAVE = `clave-${ORG}@ejemplo.mx`;
  const CLAVE = `muelle-tordo-${Math.random().toString(36).slice(2, 8)}`;
  await pedir(STAGING, `/admin/orgs/${ORG}/miembros`, { method: 'POST', body: { correo: CORREO_CLAVE, nombre: 'Con clave', rol: 'admin' } });
  const galletaSuper2 = galleta;
  const codC = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO_CLAVE } });
  await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLAVE, codigo: codC.data?.codigo_prueba } });
  const yoAntes = await pedir(STAGING, '/yo');
  rev(yoAntes.data?.entro_con === 'codigo' && yoAntes.data?.tiene_clave === false, '/yo dice con qué se entró y que todavía no hay contraseña', `${yoAntes.data?.entro_con} · tiene_clave ${yoAntes.data?.tiene_clave}`);
  const debil = await pedir(STAGING, '/auth/clave', { method: 'POST', body: { clave: '1234567890' } });
  rev(debil.estado === 400 && debil.error === 'clave_debil', 'una contraseña de escalera se rechaza y se dice por qué', String(debil.detalle?.porque ?? debil.error));
  const puesta = await pedir(STAGING, '/auth/clave', { method: 'POST', body: { clave: CLAVE } });
  rev(puesta.estado === 200 && puesta.data?.puesta === true, 'se pone la contraseña', `${puesta.ms} ms`);
  galleta = '';
  const mala = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLAVE, clave: `${CLAVE}-no` } });
  rev(mala.estado === 401 && mala.error === 'clave_invalida', 'la contraseña equivocada no entra', `${mala.estado} ${mala.error}`);
  const conClave = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLAVE, clave: CLAVE } });
  rev(conClave.estado === 200, 'y con la buena se entra', `${conClave.ms} ms`);
  const yoClave = await pedir(STAGING, '/yo');
  rev(yoClave.data?.entro_con === 'clave' && yoClave.data?.tiene_clave === true, '/yo dice que entró con la contraseña', String(yoClave.data?.entro_con));
  rev(!JSON.stringify(yoClave).includes('clave_hash') && !JSON.stringify(yoClave).includes(CLAVE), 'la API nunca devuelve la contraseña ni su huella');
  const sinActual = await pedir(STAGING, '/auth/clave', { method: 'POST', body: { clave: `${CLAVE}-otra` } });
  rev(sinActual.estado === 400 && sinActual.detalle?.motivo === 'ya_tienes_clave', 'cambiarla desde una sesión de contraseña pide la actual', `${sinActual.estado} ${sinActual.detalle?.motivo ?? sinActual.error}`);
  // Contrato 0.8.0: la puerta de las apps empacadas. El APK de Android de
  // quell101 y la de Windows no comparten origen con el sitio, así que la
  // cookie no les llega nunca y llevan el token a mano.
  galleta = '';
  const web = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLAVE, clave: CLAVE } });
  rev(web.estado === 200 && web.data?.token === undefined, 'al navegador no se le da token, sólo la cookie', String(web.data?.token));
  galleta = '';
  const conApp = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLAVE, clave: CLAVE, aparato: true } });
  const token = conApp.data?.token;
  rev(conApp.estado === 200 && typeof token === 'string' && token.length > 20, 'quien pide con aparato sí recibe token', `${conApp.ms} ms`);
  galleta = '';
  const yoApp = await pedir(STAGING, '/yo', { token });
  rev(yoApp.estado === 200 && yoApp.data?.usuario?.correo === CORREO_CLAVE, 'con el token y sin cookie, /yo contesta y es la misma persona', `${yoApp.estado} ${yoApp.data?.usuario?.correo ?? yoApp.error}`);
  rev(yoApp.data?.entro_con === 'clave', 'y dice con qué se entró', String(yoApp.data?.entro_con));
  const inventado = await pedir(STAGING, '/yo', { token: `${String(token).split('.')[0]}.firmaInventada` });
  rev(inventado.estado === 401, 'un token mal firmado no abre nada', String(inventado.estado));
  const salida = await pedir(STAGING, '/auth/salir', { token, method: 'POST' });
  rev(salida.estado === 200, 'la app cierra su sesión con el token');
  const muerto = await pedir(STAGING, '/yo', { token });
  rev(muerto.estado === 401, 'y el token ya no vale: es la misma sesión de D1', String(muerto.estado));

  galleta = galletaSuper2;

  /* Contrato 0.12.0: la sesión la decide QUIÉN entra, no con qué entró.
   *
   * Se mide aquí, desde fuera y contra lo publicado, porque es lo que cambia
   * de comportamiento en producción. Antes la duración la decidía el camino, y
   * el camino que de verdad usan los clientes de peek101 es el código al
   * correo: por ahí un cliente se llevaba 30 días. Las 12 horas sólo se
   * cumplían por el PIN, que es el camino secundario. */
  const MES = 30 * 24 * 3600;
  const MEDIO_DIA = 12 * 3600;
  rev(conClave.data?.vive_segundos === MES, 'un socio con contraseña se lleva 30 días', String(conClave.data?.vive_segundos));

  const negD = await pedir(STAGING, `/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: { nombre: 'Duración' } });
  const cliD = await pedir(STAGING, `/orgs/${ORG}/clientes`, { app: 'dash101', method: 'POST', body: { nombre: 'Clienta de la duración', negocio_id: negD.data?.id } });
  const CORREO_CLI = `clienta-${ORG}@ejemplo.mx`;
  const PIN_CLI = '736104';
  const CLAVE_CLI = `bruma-tejado-${Math.random().toString(36).slice(2, 8)}`;
  const accD = await pedir(STAGING, `/orgs/${ORG}/clientes/${cliD.data?.id}/acceso`, {
    app: 'dash101', method: 'POST', body: { correo: CORREO_CLI, pin: PIN_CLI },
  });
  rev(accD.estado === 201, 'se le da acceso de portal a una clienta', `${accD.estado} ${accD.error ?? ''}`);
  const galletaSuper3 = galleta;

  galleta = '';
  const cliPin = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLI, pin: PIN_CLI } });
  rev(cliPin.data?.vive_segundos === MEDIO_DIA, 'una clienta con PIN, 12 horas (esto ya era así)', String(cliPin.data?.vive_segundos));
  const puestaCli = await pedir(STAGING, '/auth/clave', { method: 'POST', body: { clave: CLAVE_CLI } });
  rev(puestaCli.estado === 200, 'una clienta puede ponerse contraseña con la sesión del PIN', `${puestaCli.estado} ${puestaCli.error ?? ''}`);

  galleta = '';
  const cliClave = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLI, clave: CLAVE_CLI } });
  rev(cliClave.data?.vive_segundos === MEDIO_DIA, 'y con contraseña siguen siendo 12 horas: no le regala un mes', String(cliClave.data?.vive_segundos));

  galleta = '';
  const codCli = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO_CLI } });
  const cliCod = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO_CLI, codigo: codCli.data?.codigo_prueba } });
  rev(cliCod.data?.vive_segundos === MEDIO_DIA, 'y por código también: ÉSTE era el hueco, daba un mes', String(cliCod.data?.vive_segundos));

  galleta = galletaSuper3;

  // Contrato 0.9.0: el folio de la cotización lo asigna la suite.
  const negF = await pedir(STAGING, `/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: { nombre: 'Folios' } });
  const cotizar = (extra = {}) => pedir(STAGING, `/orgs/${ORG}/cotizaciones`, {
    app: 'cotizador101', method: 'POST', body: { negocio_id: negF.data?.id, total: 15000000, moneda: 'MXN', ...extra },
  });
  const f1 = await cotizar();
  rev(f1.estado === 201 && f1.data?.folio === 'COT-000001', 'la primera cotización se lleva el folio COT-000001', `${f1.estado} ${f1.data?.folio ?? f1.error}`);
  const f2 = await cotizar();
  rev(f2.data?.folio === 'COT-000002', 'y la segunda el COT-000002: la cuenta la lleva la suite', String(f2.data?.folio));
  const impuesto = await cotizar({ folio: 'COT-999999' });
  rev(impuesto.data?.folio === 'COT-000003', 'una app NO puede imponer su folio: se le ignora', String(impuesto.data?.folio));
  const diez = await Promise.all(Array.from({ length: 10 }, () => cotizar()));
  const folios = diez.map((r) => r.data?.folio);
  rev(new Set(folios).size === 10, 'diez cotizaciones de golpe se llevan diez folios distintos', `${new Set(folios).size} distintos de 10`);
  rev(folios.every((f) => /^COT-\d{6}$/.test(String(f))), 'y todos con el formato COT- y seis dígitos');

  // Contrato 0.10.0: los ajustes de cada app. Lo que importa medir contra el
  // Worker de verdad no es guardar y leer —eso lo cubren las pruebas de
  // dentro—, es que el candado del `id` viaje con la cabecera X-App en el
  // camino real, proxy incluido: aquí la lista de precios de quote101 son
  // costos, y el día que Firebase se apague va a vivir en esta tabla.
  const aj = await pedir(STAGING, `/orgs/${ORG}/ajustes`, {
    app: 'cotizador101', method: 'POST', body: { clave: 'precios', valor: { mano_obra: 35000 } },
  });
  rev(aj.estado === 201 && aj.data?.id === 'cotizador101:precios', 'el ajuste se guarda con el id que arma la API', `${aj.estado} ${aj.data?.id ?? aj.error}`);
  const aj2 = await pedir(STAGING, `/orgs/${ORG}/ajustes`, {
    app: 'cotizador101', method: 'POST', body: { clave: 'precios', valor: { mano_obra: 40000 } },
  });
  rev(aj2.estado === 201 && aj2.data?.valor?.mano_obra === 40000, 'guardarlo otra vez lo pisa, no choca', `${aj2.estado} ${aj2.data?.valor?.mano_obra}`);
  const ajenoLista = await pedir(STAGING, `/orgs/${ORG}/ajustes?app=cotizador101`, { app: 'dash101' });
  rev((ajenoLista.data?.filas || []).length === 0, 'otra app NO ve los ajustes de quote101, ni pidiéndolos por nombre', `${(ajenoLista.data?.filas || []).length} filas`);
  const ajenoId = await pedir(STAGING, `/orgs/${ORG}/ajustes/cotizador101:precios`, { app: 'dash101' });
  rev(ajenoId.estado === 404, 'ni por id: 404, que es lo mismo que contesta para una fila que no existe', `${ajenoId.estado} ${ajenoId.error}`);
  const firmar = await pedir(STAGING, `/orgs/${ORG}/ajustes`, {
    app: 'dash101', method: 'POST', body: { clave: 'precios', valor: {}, app: 'cotizador101' },
  });
  rev(firmar.estado === 403, 'y no puede firmar un ajuste con el nombre de otra app', `${firmar.estado} ${firmar.error}`);

  // Contrato 0.11.0: consecutivos por serie. El de los recibos se calculaba en
  // el navegador; lo que se mide aquí es lo que sólo se ve con el Worker de
  // verdad: diez de golpe por el camino real, proxy incluido.
  const ver1 = await pedir(STAGING, `/orgs/${ORG}/folios/REC`, { app: 'cotizador101' });
  rev(ver1.data?.siguiente === 1, 'mirar el siguiente recibo no lo consume', `siguiente ${ver1.data?.siguiente}`);
  const diezRec = await Promise.all(Array.from({ length: 10 }, () =>
    pedir(STAGING, `/orgs/${ORG}/folios/REC`, { app: 'cotizador101', method: 'POST' })));
  const nums = diezRec.map((r) => r.data?.numero);
  rev(new Set(nums).size === 10, 'diez recibos de golpe se llevan diez números distintos', `${new Set(nums).size} distintos de 10`);
  const cotSerie = await pedir(STAGING, `/orgs/${ORG}/folios/COT`, { app: 'cotizador101', method: 'POST' });
  rev(cotSerie.estado === 403, 'la serie del folio de cotización no se aparta por ahí', `${cotSerie.estado} ${cotSerie.error}`);

  const neg = await pedir(STAGING, `/orgs/${ORG}/negocios`, { app: 'dash101', method: 'POST', body: { nombre: 'Taller' } });
  const cli = await pedir(STAGING, `/orgs/${ORG}/clientes`, { app: 'dash101', method: 'POST', body: { nombre: 'Áurea Pérez', negocio_id: neg.data?.id } });
  rev(cli.data?.nombre_norm === 'aurea perez', 'nombre_norm sale sin acentos', String(cli.data?.nombre_norm));

  const ex = await pedir(STAGING, `/orgs/${ORG}/items/exportar`, {
    app: 'cotizador101', method: 'POST',
    body: { cotizacion_id: 'COT-HUMO', negocio_id: neg.data?.id, cliente_id: cli.data?.id,
            lineas: [{ nombre: 'Cocina', monto: 15000000 }, { nombre: 'Clóset', monto: 5000000 }] },
  });
  rev(ex.estado === 201 && ex.data?.total === 2, 'cotizador101 exporta 2 ítems cotizados');
  rev(ex.data?.filas?.[0]?.monto === 15000000, '$150,000.00 se guardó como 15000000 centavos', String(ex.data?.filas?.[0]?.monto));
  const item = ex.data?.filas?.[0]?.id;
  const item2 = ex.data?.filas?.[1]?.id;

  const ven = await pedir(STAGING, `/orgs/${ORG}/items/vender`, { app: 'cotizador101', method: 'POST', body: { item_ids: [item, item2], nombre_proyecto: 'Casa Pérez' } });
  rev(ven.data?.proyecto?.precio_venta === 20000000, 'el precio del proyecto lo sumó la API', String(ven.data?.proyecto?.precio_venta));

  // 4 · se mueve la etapa y el WebSocket lo avisa a otra pantalla
  const avisos = [];
  const ws = new WebSocket(`${STAGING.replace(/^http/, 'ws')}/orgs/${ORG}/ws`, { headers: { Cookie: galleta, 'X-App': 'quell101' } });
  const abierto = await new Promise((listo) => {
    ws.on('open', () => listo(true));
    ws.on('error', () => listo(false));
    setTimeout(() => listo(false), 8000);
  });
  rev(abierto, 'el WebSocket del DO acepta la conexión');
  ws.on('message', (d) => { try { avisos.push(JSON.parse(String(d))); } catch { /* ignorado */ } });

  const et = await pedir(STAGING, `/orgs/${ORG}/items/${item}/etapa`, { app: 'quell101', method: 'POST', body: { etapa: 4, nota: 'embalado' } });
  rev(et.estado === 200 && et.data?.item?.etapa === 4, 'se mueve el ítem a la etapa 4', `${et.ms} ms`);
  rev(et.data?.item?.clave === 'M01', 'la clave nace en la etapa 4', String(et.data?.item?.clave));

  await new Promise((r) => setTimeout(r, 1500));
  const deEtapa = avisos.filter((a) => a.t === 'item.etapa');
  rev(deEtapa.length === 1 && deEtapa[0].etapa === 4, 'el aviso llegó a la otra pantalla por WebSocket', JSON.stringify(deEtapa[0] ?? null));
  try { ws.close(); } catch { /* ya estaba cerrada */ }

  const proy = await pedir(STAGING, `/orgs/${ORG}/proyectos/${ven.data?.proyecto?.id}`, { app: 'dash101' });
  const esperado = (4 + 0) / 2 / 7;
  rev(Math.abs(proy.data?.avance - esperado) < 1e-9, 'el avance del proyecto lo recalculó la API', `${proy.data?.avance} (esperado ${esperado})`);

  // 5 · permisos.ts dice que NO. Esta es la que más importa.
  const no1 = await pedir(STAGING, `/orgs/${ORG}/items/${item}`, { app: 'nest101', method: 'PATCH', body: { nombre: 'Otro' } });
  rev(no1.estado === 403 && no1.error === 'campo_no_permitido', 'nest101 NO escribe items.nombre', `${no1.estado} ${no1.error} · permitidos ${JSON.stringify(no1.detalle?.permitidos)}`);
  const si1 = await pedir(STAGING, `/orgs/${ORG}/items/${item}`, { app: 'nest101', method: 'PATCH', body: { refs: { nest: 'x.t101x' } } });
  rev(si1.estado === 200, 'nest101 SÍ escribe items.refs');
  const no2 = await pedir(STAGING, `/orgs/${ORG}/items/${item}`, { app: 'quell101', method: 'PATCH', body: { etapa: 7 } });
  rev(no2.estado === 403 && no2.error === 'campo_solo_por_etapa', 'la etapa no se escribe por PATCH, ni desde quell101', `${no2.estado} ${no2.error}`);
  const no3 = await pedir(STAGING, `/orgs/${ORG}/personal/x`, { app: 'cotizador101', method: 'PATCH', body: { puesto: 'x' } });
  rev(no3.estado === 403 && no3.error === 'sin_permiso', 'cotizador101 NO escribe en personal', `${no3.estado} ${no3.error}`);
  const no4 = await pedir(STAGING, `/orgs/${ORG}/items/${item2}`, { app: 'dash101', method: 'DELETE' });
  rev(no4.estado === 403 && no4.error === 'items_nunca_se_borran', 'un ítem no se borra: se cancela', `${no4.estado} ${no4.error}`);
  const no5 = await pedir(STAGING, `/orgs/${ORG}/items`, { app: 'dash101', method: 'POST', body: { nombre: 'Mesa', negocio_id: neg.data?.id, cliente_id: cli.data?.id, monto: 1500.5 } });
  rev(no5.estado === 400 && no5.error === 'dinero_no_entero', 'el dinero con decimales se rechaza antes de guardarse', `${no5.estado} ${no5.error}`);
  const no6 = await pedir(STAGING, `/orgs/${ORG}/items`, { app: 'inventada101' });
  rev(no6.estado === 400 && no6.error === 'app_desconocida', 'una app inventada no pasa de la puerta');
  const no7 = await pedir(STAGING, `/orgs/${ORG}/items`, {});
  rev(no7.estado === 400 && no7.error === 'sin_app', 'sin X-App tampoco');

  // R2 de ida y vuelta. Las rutas estaban escritas desde el primer dia y nadie
  // habia subido un archivo: el bucket solo existe aqui, no en las pruebas.
  const contenido = 'plano de la cocina — con acentos y ñ\n'.repeat(40);
  const forma = new FormData();
  forma.append('archivo', new Blob([contenido], { type: 'text/plain' }), 'plano.txt');
  forma.append('de_tabla', 'items');
  forma.append('de_id', item);
  const subida = await fetch(`${STAGING}/orgs/${ORG}/archivos`, {
    method: 'POST', headers: { Cookie: galleta, 'X-App': 'nest101' }, body: forma,
  });
  const alta = await subida.json().catch(() => ({}));
  rev(subida.status === 201, 'se sube un archivo a R2', `${subida.status} · ${alta?.data?.bytes} bytes`);
  rev(String(alta?.data?.r2_key || '').startsWith(`orgs/${ORG}/items/`), 'la llave lleva la org por delante', String(alta?.data?.r2_key));
  const baja = await fetch(`${STAGING}/orgs/${ORG}/archivos/${alta?.data?.id}`, { headers: { Cookie: galleta, 'X-App': 'nest101' } });
  const vuelto = await baja.text();
  rev(baja.status === 200 && vuelto === contenido, 'y vuelve byte por byte', `${vuelto.length} de ${contenido.length} caracteres`);
  const robo = await fetch(`${STAGING}/orgs/${ORG}/archivos/${alta?.data?.id}`, { headers: { 'X-App': 'nest101' } });
  rev(robo.status === 401, 'sin sesion no se baja', String(robo.status));

  // Un solo hilo por empresa (decision 2 del documento). Estaba afirmado, no
  // medido: diez ingresos al mismo tiempo sobre el mismo proyecto.
  const cuenta = await pedir(STAGING, `/orgs/${ORG}/cuentas`, { app: 'dash101', method: 'POST', body: { nombre: 'Banco', tipo: 'banco', negocio_id: neg.data?.id, saldo_inicial: 0 } });
  const CADA = 300000;
  const N = 10;
  const t1 = Date.now();
  const pagos = await Promise.all(Array.from({ length: N }, (_, i) =>
    pedir(STAGING, `/orgs/${ORG}/movimientos`, {
      app: 'dash101', method: 'POST',
      body: { negocio_id: neg.data?.id, tipo: 'ingreso', monto: CADA, fecha: '2026-09-09',
              cuenta_id: cuenta.data?.id, proyecto_id: ven.data?.proyecto?.id,
              contraparte_tipo: 'cliente', contraparte_id: cli.data?.id, descripcion: `pago ${i + 1}` },
    })));
  rev(pagos.every((p) => p.estado === 201), `${N} ingresos en paralelo, todos aceptados`, `${Date.now() - t1} ms`);
  rev(new Set(pagos.map((p) => p.data?.id)).size === N, 'diez ids distintos: el ULID no colisiona');
  const conPagos = await pedir(STAGING, `/orgs/${ORG}/proyectos/${ven.data?.proyecto?.id}`, { app: 'dash101' });
  rev(conPagos.data?.cobrado === N * CADA, 'el cobrado quedo exacto: no se perdio ninguna escritura', `${conPagos.data?.cobrado} de ${N * CADA}`);

  // Y la sesion se puede matar de verdad.
  const cerrada = galleta;
  await pedir(STAGING, '/auth/salir', { method: 'POST' });
  galleta = cerrada;
  const muerta = await pedir(STAGING, '/yo');
  rev(muerta.estado === 401, 'despues de /auth/salir la misma cookie ya no sirve', String(muerta.estado));
}

/* ─────────────── fase 2: la importación, contra el Worker de verdad ───────────────
 * Las pruebas de vitest ya la miden dentro de workerd. Esto la mide contra el
 * Durable Object publicado: la transacción del ensayo, los CHECK del esquema y
 * el recálculo de cachés corren en el runtime real, no en el de las pruebas.
 */

/** Licencias por suscripción (0.13.0), contra staging: Mike crea una
 *  cortesía, la app la activa, el token abre sólo con la llave pública, late,
 *  y al borrarla la clave deja de existir. Lo que en vitest corre en workerd,
 *  aquí corre contra el D1 de verdad. */
/** Entra como Mike, respetando el freno de códigos.
 *
 * La API frena los códigos por correo —45 segundos entre uno y otro— y el
 * recorrido entra varias veces con el MISMO correo. Cuando toca el freno,
 * `/auth/codigo` contesta 429 con `detalle.espera_segundos`, `codigo_prueba`
 * viene vacío, y `/auth/entrar` falla sin cookie: de ahí en adelante TODO
 * sale rojo con `undefined`, que fue lo que pasó en el despliegue de las
 * 05:11 del 20-sep. El bloque de licencias ya esperaba; el de importación
 * entraba a pelo. Ahora los dos usan esto.
 *
 * Devuelve si se logró entrar, para que el primer `rev` que falle lo diga en
 * vez de dejar veinte fallas sin explicación. */
async function entrarComoMike() {
  galleta = '';
  for (let i = 0; i < 4; i++) {
    const c = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO } });
    if (c.ok && c.data?.codigo_prueba) {
      const e = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: c.data.codigo_prueba } });
      if (e.ok) return true;
    }
    const espera = (c.detalle?.espera_segundos ?? 2) + 1;
    linea(`  …el freno de códigos pide ${espera} s; se espera`);
    await new Promise((r) => setTimeout(r, espera * 1000));
  }
  return false;
}

async function licencias() {
  linea('');
  linea(`== Licencias (0.13.0) == ${STAGING}`);
  const { createPublicKey, verify } = await import('node:crypto');
  const yo = await pedir(STAGING, '/yo');
  if (!(yo.ok && yo.data?.superadmin)) {
    // Si el recorrido dejó otra sesión, se entra otra vez como Mike; si el freno
    // de códigos está gastado, se espera lo que la API pida.
    await entrarComoMike();
  }
  const llave = await pedir(STAGING, '/licencias/llave');
  rev(llave.estado === 200 && llave.data?.alg === 'Ed25519', 'staging sirve la llave pública', `kid ${llave.data?.kid}`);

  const alta = await pedir(STAGING, '/licencias', { method: 'POST', body: { cliente: `Humo ${ORG}`, correo: `humo-${ORG}@ejemplo.mx`, programa: 'nest101', tipo: 'appstore', perpetua: true, notas: 'la borra el propio humo' } });
  rev(alta.estado === 201 && /^T101-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(alta.data?.clave || ''), 'Mike crea una perpetua y recibe una clave T101-…', `${alta.estado} ${alta.error ?? ''}`);
  if (alta.estado !== 201) return;
  rev(alta.data?.tipo === 'appstore' && alta.data?.perpetua === 1 && alta.data?.vigente === true,
    'el tipo y lo perpetuo viajan aparte, y sin fecha de pago entra igual (0.19.0)', `tipo ${alta.data?.tipo} · perpetua ${alta.data?.perpetua}`);

  const filtrada = await pedir(STAGING, `/licencias?tipo=appstore&correo=humo-${ORG}@ejemplo.mx`);
  rev(filtrada.estado === 200 && (filtrada.data?.filas || []).some((f) => f.id === alta.data.id) && (filtrada.data?.filas || []).every((f) => f.tipo === 'appstore'),
    'la lista filtra por tipo y por correo', `${filtrada.data?.filas?.length} fila(s)`);
  rev(typeof filtrada.data?.por_tipo?.cortesia === 'number',
    'y sigue contando cuántas hay de cada tipo, con el filtro puesto', JSON.stringify(filtrada.data?.por_tipo));
  const malTipo = await pedir(STAGING, '/licencias?tipo=strype');
  rev(malTipo.estado === 400, 'un tipo inventado es 400, no una lista vacía', `${malTipo.estado} ${malTipo.error ?? ''}`);
  const id = alta.data.id;
  const huella = `humo-${ORG}-0123456789abcdef`.replace(/[^A-Za-z0-9_-]/g, '-');

  galleta = ''; // la app no trae sesión
  const act = await pedir(STAGING, '/licencias/activar', { method: 'POST', body: { clave: alta.data.clave, huella, version: 'humo' } });
  rev(act.estado === 201 && typeof act.data?.token === 'string', 'la app activa sin sesión y recibe un token', `${act.estado} ${act.error ?? ''} · ${act.ms} ms`);
  let abre = false, carga = null;
  try {
    const [v, cuerpo, firma] = String(act.data?.token || '').split('.');
    const deB64 = (t) => Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const publica = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: llave.data.publica }, format: 'jwk' });
    abre = v === 'v1' && verify(null, deB64(cuerpo), publica, deB64(firma));
    carga = JSON.parse(deB64(cuerpo).toString('utf8'));
  } catch (e) { carga = { error: e.message }; }
  rev(abre === true && carga?.maquina === huella && carga?.licencia === id, 'el token abre con la llave pública, como lo hará draw101', `hasta ${carga?.hasta}`);
  const lat = await pedir(STAGING, '/licencias/latido', { method: 'POST', body: { token: act.data?.token, huella } });
  rev(lat.estado === 200 && typeof lat.data?.token === 'string', 'el latido devuelve un token nuevo', `${lat.estado} ${lat.error ?? ''}`);
  const otra = await pedir(STAGING, '/licencias/activar', { method: 'POST', body: { clave: alta.data.clave, huella: `${huella}-otra` } });
  rev(otra.estado === 409 && otra.error === 'sin_lugares', 'la segunda máquina no cabe en un lugar', `${otra.estado} ${otra.error}`);

  // De vuelta como Mike: el detalle cuenta lo que pasó, y se borra lo creado.
  const yo2 = await pedir(STAGING, '/yo');
  if (!(yo2.ok && yo2.data?.superadmin)) {
    galleta = '';
    const c = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO } });
    await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: c.data?.codigo_prueba } });
  }
  const det = await pedir(STAGING, `/licencias/${id}`);
  rev(det.estado === 200 && det.data?.activaciones?.length === 1 && (det.data?.bitacora || []).some((b) => b.accion === 'activar'), 'el detalle trae la activación y la bitácora', `${det.data?.activaciones?.length} activaciones · ${det.data?.bitacora?.length} renglones`);
  /* Activarse con la cuenta, sin clave (0.20.0). La sesión de Mike ya está
   * puesta aquí arriba; la licencia se encontró por su correo. */
  const conCuenta = await pedir(STAGING, '/licencias', { method: 'POST', body: { cliente: `Humo cuenta ${ORG}`, correo: CORREO, programa: 'draw101', perpetua: true, tipo: 'suite101', notas: 'la borra el propio humo' } });
  if (conCuenta.estado === 201) {
    const huella2 = `humo-cuenta-${ORG}-0123456789abcdef`.replace(/[^A-Za-z0-9_-]/g, '-');
    const mia = await pedir(STAGING, '/licencias/mia', { method: 'POST', body: { programa: 'draw101', huella: huella2, version: 'humo' } });
    rev(mia.estado === 201 && typeof mia.data?.token === 'string', 'la app se activa con la cuenta de la suite, sin teclear clave', `${mia.estado} ${mia.error ?? ''}`);
    const pantalla = await fetch(`${STAGING}/licencias/entrar?programa=draw101&huella=${huella2}&app=draw101`).then((r) => r.text()).catch((e) => `error: ${e.message}`);
    rev(/Entrar con Google/.test(pantalla) && /__t101_licencia/.test(pantalla), 'la pantalla que abre la app se sirve y trae la entrada de la suite');
    await pedir(STAGING, `/licencias/${conCuenta.data.id}`, { method: 'DELETE' });
  } else {
    rev(false, 'se pudo crear una licencia ligada al correo de Mike', `${conCuenta.estado} ${conCuenta.error ?? ''}`);
  }

  const borra = await pedir(STAGING, `/licencias/${id}`, { method: 'DELETE' });
  rev(borra.estado === 200, 'la licencia de humo se borra', `${borra.estado}`);
  const ya = await pedir(STAGING, '/licencias/activar', { method: 'POST', body: { clave: alta.data.clave, huella } });
  rev(ya.estado === 404, 'y su clave ya no existe para la app', `${ya.estado} ${ya.error}`);
}

/* ─────────────── órdenes de compra y fiscal (0.21.0) ───────────────
 * Lo mínimo que no se puede medir con vitest: que en staging de verdad la
 * orden nazca en el buzón, que el pago cree UN egreso y no dos, y que la
 * factura que llega después se cuelgue del movimiento que ya existe. */
async function ordenesYFiscal() {
  linea('');
  linea('== Órdenes de compra y fiscal ==');
  if (!galleta) {
    const c = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO } });
    await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: c.data?.codigo_prueba } });
  }
  const app = 'dash101';
  const neg = await pedir(STAGING, `/orgs/${ORG}/negocios`, { app, method: 'POST', body: { nombre: 'Compras de humo' } });
  const cta = await pedir(STAGING, `/orgs/${ORG}/cuentas`, { app, method: 'POST', body: { nombre: 'Banco OC', tipo: 'banco', negocio_id: neg.data?.id, saldo_inicial: 0 } });
  if (neg.estado !== 201 || cta.estado !== 201) { rev(false, 'se pudo preparar negocio y cuenta', `${neg.estado}/${cta.estado}`); return; }

  const yo = await pedir(STAGING, '/yo');
  const marca = await pedir(STAGING, `/orgs/${ORG}/ordenes/contadores`, { app, method: 'POST', body: { usuario_id: yo.data?.usuario?.id, valor: true } });
  rev(marca.estado === 200 && marca.data?.es_contador === true, 'el dueño se marca como contador y queda apuntado', `${marca.estado}`);

  const oc = await pedir(STAGING, `/orgs/${ORG}/ordenes`, { app, method: 'POST', body: {
    negocio_id: neg.data?.id, proveedor_nombre: 'Maderas de humo', concepto: 'Triplay',
    monto: 116000, con_factura: true, fecha_maxima_pago: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
  } });
  rev(oc.estado === 201 && oc.data?.estado === 'en_buzon', 'la orden nace en el buzón, sin autorización previa', `${oc.estado} ${oc.data?.folio ?? ''}`);
  rev(oc.data?.subtotal === 100000 && oc.data?.iva === 16000, 'se captura el total y la suite lo separa', `${oc.data?.subtotal} + ${oc.data?.iva}`);

  const buzon = await pedir(STAGING, `/orgs/${ORG}/ordenes/buzon`, { app });
  rev(buzon.estado === 200 && (buzon.data?.filas || []).some((f) => f.id === oc.data?.id), 'sale en el buzón del contador', `${buzon.data?.filas?.length} por pagar`);

  const pago = await pedir(STAGING, `/orgs/${ORG}/ordenes/${oc.data?.id}/pagar`, { app, method: 'POST', body: { cuenta_id: cta.data?.id } });
  rev(pago.estado === 200 && pago.data?.orden?.estado === 'pagada', 'se paga y queda ligada al egreso', `${pago.estado}`);
  rev(pago.data?.movimiento?.monto === 116000 && pago.data?.movimiento?.tipo === 'egreso', 'el egreso es por el monto exacto');
  rev(pago.data?.correo?.enviado === false, 'el correo se encola pero NO sale fuera de producción', `${pago.data?.correo?.motivo}`);

  const otra = await pedir(STAGING, `/orgs/${ORG}/ordenes/${oc.data?.id}/pagar`, { app, method: 'POST', body: { cuenta_id: cta.data?.id } });
  rev(otra.estado === 409, 'la misma orden no se paga dos veces: nada de dobles egresos', `${otra.estado} ${otra.error ?? ''}`);

  // La factura llega después del pago y se cuelga del movimiento que ya existe.
  const uuid = `HUMO-${Date.now()}`;
  const hoy = new Date().toISOString().slice(0, 10);
  const cfdi = await pedir(STAGING, `/orgs/${ORG}/fiscal/cfdi`, { app, method: 'POST', body: {
    negocio_id: neg.data?.id, uuid, tipo: 'egreso', subtotal: 100000, iva: 16000, total: 116000, fecha: hoy,
  } });
  rev(cfdi.estado === 201, 'se captura el CFDI', `${cfdi.estado} ${cfdi.error ?? ''}`);
  const rep = await pedir(STAGING, `/orgs/${ORG}/fiscal/cfdi`, { app, method: 'POST', body: {
    negocio_id: neg.data?.id, uuid, tipo: 'egreso', subtotal: 1, iva: 1, total: 2, fecha: hoy,
  } });
  rev(rep.estado === 409, 'el mismo UUID capturado dos veces se rechaza', `${rep.estado} ${rep.error ?? ''}`);

  const liga = await pedir(STAGING, `/orgs/${ORG}/fiscal/cfdi/${cfdi.data?.id}/ligar`, { app, method: 'POST', body: { movimiento_id: pago.data?.movimiento?.id } });
  rev(liga.estado === 200 && liga.data?.movimiento?.facturado === true, 'la factura que llega después se cuelga del pago que ya existía', `${liga.estado}`);

  const iva = await pedir(STAGING, `/orgs/${ORG}/fiscal/iva?desde=${hoy}&hasta=${hoy}`, { app });
  rev(iva.estado === 200 && iva.data?.acreditable === 16000, 'el IVA del mes lo toma', `acreditable ${iva.data?.acreditable}`);
}

async function importacion() {
  linea('');
  linea('== Importación (fase 2) ==');
  const entro = await entrarComoMike();

  const ORGI = `imp-${process.env.GITHUB_RUN_ID || Date.now()}`.slice(0, 40);
  const nueva = await pedir(STAGING, '/admin/orgs', { method: 'POST', body: { id: ORGI, nombre: 'Importada' } });
  rev(nueva.estado === 201, `se crea la org ${ORGI}`,
      entro ? `${nueva.estado} ${nueva.error ?? ''}` : 'no se pudo entrar: el freno de códigos no cedió');

  // La plata puesta a propósito donde duele: 1500.5 y el medio centavo de
  // 20000.005, que la fórmula vieja (Math.round(v * 100)) perdía.
  const docs = {
    negocios: [{ id: 'NEG1', nombre: 'Taller', moneda: 'MXN', creado_at: '2025-06-01T00:00:00Z' }],
    cuentas: [{ id: 'CTA1', nombre: 'Banco', tipo: 'banco', moneda: 'MXN', saldo_inicial: 10000.5, negocio_id: 'NEG1' }],
    clientes: [{ id: 'CLI1', nombre: 'Áurea Pérez', email: 'aurea@ejemplo.mx', negocio_id: 'NEG1' }],
    proyectos: [{
      id: 'PRO1', nombre: 'Casa Pérez', cliente_id: 'CLI1', negocio_id: 'NEG1', estado: 'activo',
      creado_at: '2026-01-15T12:00:00Z', precio_venta: 999999,
      partidas: [{ proveedor_nombre: 'Maderas', concepto: 'Madera', monto_acordado: 20000.005, monto_pagado: 1000 }],
      productos: [
        { id: 'p1a2b3c4', nombre: 'Cocina', monto: 150000 },
        { id: 'p9z8y7x6', nombre: 'Clóset', monto: 25000.5, etapa: 4 },
      ],
    }],
    movimientos: [{ id: 'MOV1', tipo: 'ingreso', monto: 60000, fecha: '2026-03-01', cuenta_id: 'CTA1', negocio_id: 'NEG1', proyecto_id: 'PRO1', producto_id: 'p1a2b3c4', contraparte_tipo: 'cliente', contraparte_id: 'CLI1' }],
    usuarios: [{ id: 'UID-SOCIA', email: 'socia@ejemplo.mx', nombre: 'Socia', memberships: { NEG1: { rol: 'socio' } } }],
  };
  const ITEMS = 15000000 + 2500050;

  // El ensayo mide sin dejar nada.
  const seco = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'seco', docs } });
  rev(seco.estado === 200 && seco.data?.veredicto === 'cuadra', 'el ensayo cuadra', String(seco.data?.veredicto));
  const vacia = await pedir(STAGING, `/orgs/${ORGI}/items`, { app: 'dash101' });
  rev(vacia.data?.total === 0, 'el ensayo no dejó nada escrito', `${vacia.data?.total} ítems`);

  // La corrida buena.
  const uno = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'escribir', docs } });
  rev(uno.estado === 200 && uno.data?.veredicto === 'cuadra', 'la importación cuadra', `${uno.ms} ms`);
  rev((uno.data?.rechazos || []).length === 0 && (uno.data?.fallos || []).length === 0, 'sin rechazos ni fallos');

  const porTabla = Object.fromEntries((uno.data?.cuadre?.tablas || []).map((t) => [t.tabla, t]));
  rev(porTabla.items?.firestore === 2 && porTabla.items?.en_orgdb === 2, 'los 2 productos son 2 ítems', `${porTabla.items?.en_orgdb} en el OrgDB`);

  const plata = Object.fromEntries((uno.data?.cuadre?.dinero || []).map((d) => [d.campo, d]));
  rev(plata['items.monto']?.en_orgdb === ITEMS, 'el dinero de los ítems cuadra al centavo', `${plata['items.monto']?.en_orgdb} de ${ITEMS}`);
  rev(plata['partidas.monto_acordado']?.en_orgdb === 2000001, 'el medio centavo de 20000.005 subió, no se perdió', String(plata['partidas.monto_acordado']?.en_orgdb));
  rev((uno.data?.cuadre?.dinero || []).every((d) => d.cuadra), 'todas las sumas de dinero cuadran');

  // Los ids son los mismos, y el producto_id viejo apunta al ítem correcto.
  const item = await pedir(STAGING, `/orgs/${ORGI}/items/p1a2b3c4`, { app: 'dash101' });
  rev(item.estado === 200 && item.data?.id === 'p1a2b3c4', 'el id de Firestore se conservó', String(item.data?.nombre));
  const mov = await pedir(STAGING, `/orgs/${ORGI}/movimientos/MOV1`, { app: 'dash101' });
  rev(mov.data?.item_id === 'p1a2b3c4', 'el producto_id viejo apunta al item_id correcto', String(mov.data?.item_id));

  // La etapa que ya traía se conserva, pero no se le inventó historial.
  const clo = await pedir(STAGING, `/orgs/${ORGI}/items/p9z8y7x6`, { app: 'dash101' });
  rev(clo.data?.etapa === 4, 'la etapa que ya traía se conservó', `etapa ${clo.data?.etapa}`);
  const av = await pedir(STAGING, `/orgs/${ORGI}/avances`, { app: 'dash101' });
  rev(av.data?.total === 0, 'no se inventó historial: avances quedó vacío', `${av.data?.total} avances`);

  // Los cachés los recalculó la API, no se copiaron de Firestore.
  const proy = await pedir(STAGING, `/orgs/${ORGI}/proyectos/PRO1`, { app: 'dash101' });
  rev(proy.data?.precio_venta === ITEMS, 'el precio del proyecto lo recalculó la API, no lo copió', `${proy.data?.precio_venta} (Firestore decía 999999)`);
  rev(proy.data?.cobrado === 6000000, 'el cobrado sale de los movimientos importados', String(proy.data?.cobrado));

  // Correrlo dos veces no duplica.
  const dos = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'escribir', docs } });
  const nuevas = (dos.data?.cuadre?.tablas || []).reduce((s, t) => s + t.nuevas, 0);
  rev(nuevas === 0 && dos.data?.veredicto === 'cuadra', 'correrlo dos veces no duplica nada', `${nuevas} filas nuevas en la segunda`);
  const otra = await pedir(STAGING, `/orgs/${ORGI}/items`, { app: 'dash101' });
  rev(otra.data?.total === 2, 'siguen siendo 2 ítems, no 4', `${otra.data?.total}`);

  /* La mudanza del cotizador, por el camino de verdad.
   *
   * quote101 no tiene colecciones: trae UN documento con el árbol adentro. Lo
   * que se mide aquí y no en las pruebas de dentro es que el folio lo pone el
   * OrgDB publicado —con su contador, el del contrato 0.9.0— y que repetir la
   * mudanza no le cambia el folio a ninguna cotización. Un folio que cambia en
   * la segunda corrida es un folio distinto del que el cliente ya tiene
   * impreso. */
  const arbol = {
    cotizador: [{
      clientes: [{
        id: 'COT-CLI', nombre: 'Casa Humo',
        proyectos: [{
          id: 'COT-PRO', nombre: 'Cocina',
          cotizaciones: [
            { id: 'COT-Q1', nombre: 'Con folio', versiones: [{ fecha: '2026-03-04T10:00:00Z', folio: 'COT-000099', muebles: [{ total: 12500.5, qty: 2 }] }] },
            { id: 'COT-Q2', nombre: 'Sin folio', versiones: [{ fecha: '2026-01-09T10:00:00Z', muebles: [{ total: 10.005, qty: 4 }] }] },
          ],
        }],
      }],
      config: { empresa: 'Taller 101' },
      prices: { mano_obra: 350.5 },
      reciboCounter: 7,
    }],
  };
  const sinNeg = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'seco', negocio: 'no-existe', docs: arbol } });
  rev(sinNeg.estado === 404 && sinNeg.error === 'negocio_desconocido', 'un negocio inventado se rechaza antes de tocar nada', `${sinNeg.estado} ${sinNeg.error}`);

  const cotSeco = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'seco', negocio: 'NEG1', docs: arbol } });
  rev(cotSeco.data?.avisos?.sin_folio === 1 && cotSeco.data?.avisos?.folios_traidos === 1, 'el ensayo cuenta 1 cotización con folio y 1 sin', `traídos ${cotSeco.data?.avisos?.folios_traidos}, sin ${cotSeco.data?.avisos?.sin_folio}`);

  const cotUno = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'escribir', negocio: 'NEG1', docs: arbol } });
  rev(cotUno.data?.avisos?.folios_asignados === 1, 'a la que no traía folio se le puso uno', String(cotUno.data?.avisos?.folios_asignados));
  const q1 = await pedir(STAGING, `/orgs/${ORGI}/cotizaciones/COT-Q1`, { app: 'cotizador101' });
  rev(q1.data?.folio === 'COT-000099' && q1.data?.total === 2500100, 'conserva su folio viejo y su total al centavo', `${q1.data?.folio} · ${q1.data?.total}`);
  const q2 = await pedir(STAGING, `/orgs/${ORGI}/cotizaciones/COT-Q2`, { app: 'cotizador101' });
  // 10.005 por pieza son 1001 centavos y cuatro piezas 4004. Multiplicando
  // primero en flotantes darían 4002: dos centavos que no están en ningún
  // renglón.
  rev(q2.data?.total === 4004, 'el total se convierte a centavos ANTES de multiplicar por la cantidad', `${q2.data?.total} (multiplicando primero serían 4002)`);
  const ajCot = await pedir(STAGING, `/orgs/${ORGI}/ajustes`, { app: 'cotizador101' });
  rev((ajCot.data?.filas || []).map((f) => f.clave).sort().join(',') === 'config,precios', 'la configuración y los precios quedaron en ajustes', (ajCot.data?.filas || []).map((f) => f.clave).join(','));

  const cotDos = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'escribir', negocio: 'NEG1', docs: arbol } });
  const q2b = await pedir(STAGING, `/orgs/${ORGI}/cotizaciones/COT-Q2`, { app: 'cotizador101' });
  rev(cotDos.data?.avisos?.folios_asignados === 0 && q2b.data?.folio === q2.data?.folio, 'repetir la mudanza NO le cambia el folio a ninguna', `asignados ${cotDos.data?.avisos?.folios_asignados}, ${q2.data?.folio} → ${q2b.data?.folio}`);

  /* Las fotos y las versiones viejas, contra el Worker de verdad.
   *
   * Aquí NO se suplanta el `fetch`: se usa una dirección de Storage que no
   * existe, a propósito. Lo que se mide es lo que sólo se puede medir desde
   * afuera: que el candado de la lista blanca viaja publicado, que una
   * dirección de otro dominio no la toca, y que cuando la bajada falla la
   * dirección vieja NO se borra —borrarla dejaría la foto sin manera de volver
   * a encontrarse—. Que Firebase conteste no depende de este código. */
  const FOTO = 'https://firebasestorage.googleapis.com/v0/b/no-existe-humo/o/muebles%2Fx.jpg?alt=media&token=t';
  const AJENA = 'https://cdn.ejemplo.mx/foto.jpg';
  await pedir(STAGING, `/orgs/${ORGI}/cotizaciones`, {
    app: 'cotizador101', method: 'POST',
    body: {
      id: 'COT-FOTOS', negocio_id: 'NEG1', total: 1000,
      datos: { versiones: [{ muebles: [{ imagenes: [FOTO, AJENA] }] }] },
    },
  });
  const arSeco = await pedir(STAGING, '/admin/mudar-archivos', { method: 'POST', body: { org: ORGI, modo: 'seco' } });
  rev(arSeco.data?.archivos_en_firebase === 1, 'cuenta sólo lo que está en Firebase Storage, no cualquier dirección', `${arSeco.data?.archivos_en_firebase} de 2 direcciones`);
  rev(arSeco.data?.firebase_se_puede_apagar === false, 'y con algo pendiente dice que Firebase NO se puede apagar');

  const arMal = await pedir(STAGING, '/admin/mudar-archivos', { method: 'POST', body: { org: ORGI, modo: 'escribir', limite: 5 } });
  rev((arMal.data?.fallos || []).length === 1, 'una bajada que falla se reporta, no se traga', `${(arMal.data?.fallos || []).length} fallos`);
  const conFotos = await pedir(STAGING, `/orgs/${ORGI}/cotizaciones/COT-FOTOS`, { app: 'cotizador101' });
  rev(JSON.stringify(conFotos.data?.datos || {}).includes('firebasestorage'), 'y la dirección vieja se queda: no se pierde la referencia');
  await pedir(STAGING, `/orgs/${ORGI}/cotizaciones/COT-FOTOS`, { app: 'cotizador101', method: 'DELETE' });

  // El usuario importado existe y puede fijar su PIN por correo.
  const guardada = galleta;
  galleta = '';
  const codS = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: 'socia@ejemplo.mx' } });
  rev(/^\d{6}$/.test(String(codS.data?.codigo_prueba)), 'al usuario importado le llega código: existe de verdad');
  const entS = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: 'socia@ejemplo.mx', codigo: codS.data?.codigo_prueba } });
  rev(entS.estado === 200, 'entra con «olvidé mi PIN»', `${entS.ms} ms`);
  const pin = await pedir(STAGING, '/auth/pin', { method: 'POST', body: { pin: '482913' } });
  rev(pin.data?.puesto === true, 'fija su PIN nuevo', `${pin.estado} ${pin.error || ''} ${JSON.stringify(pin.detalle ?? '')} ${pin.no_json || ''} · ${pin.ms} ms`);
  // PBKDF2 con 120,000 vueltas cuesta CPU, y el Worker tiene un limite. Si
  // esto tarda de mas o se cae, el PIN no se puede usar en produccion y hay
  // que saberlo aqui y no el dia que un cliente lo intente.
  const conPin = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: 'socia@ejemplo.mx', pin: '482913' } });
  rev(conPin.estado === 200, 'y despues entra con ese PIN', `${conPin.estado} ${conPin.error || ''} ${conPin.no_json || ''} · ${conPin.ms} ms`);
  const noPuede = await pedir(STAGING, '/admin/importar', { method: 'POST', body: { org: ORGI, modo: 'escribir', docs } });
  rev(noPuede.estado === 403, 'quien no es superadmin NO abre la puerta de servicio', `${noPuede.estado} ${noPuede.error}`);
  galleta = guardada;

  // La página se sirve desde el propio Worker: mismo origen, sin CORS nuevo.
  const pag = await fetch(`${STAGING}/admin/importar`);
  const html = await pag.text();
  rev(pag.status === 200 && String(pag.headers.get('content-type')).includes('text/html'), 'la página del importador se sirve', String(pag.status));
  rev(html.includes('Taller 101') && html.includes('#0080C1'), 'y trae la identidad Taller 101');

  // En producción la puerta también está, y también cerrada.
  const enProd = await fetch(`${PROD}/admin/importar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  rev(enProd.status === 401, 'en producción la puerta pide sesión', String(enProd.status));
}

/* ─────────────── limpieza: lo que esta prueba deja, lo borra ───────────────
 * Hasta el 14-sep cada corrida dejaba su `humo-<run>` y su `imp-<run>` en
 * staging: 105 empresas de mentiras que master101 encontró en su tabla el
 * 15-sep (decisión de Mike: borrarlas y que la prueba limpie lo suyo). Se
 * borra lo de esta corrida y se barre lo que quedó de las anteriores.
 * DELETE /admin/orgs/:o sólo existe fuera de producción: aquí no hay riesgo. */

async function limpieza() {
  linea('');
  linea('== Limpieza de staging ==');
  galleta = '';
  const cod = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO } });
  if (!cod.data?.codigo_prueba) { rev(false, 'entrar para limpiar', `${cod.estado} ${cod.error || ''}`); return; }
  await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.data.codigo_prueba } });
  const lista = await pedir(STAGING, '/admin/orgs');
  const basura = (lista.data?.filas || []).map((o) => o.id).filter((id) => /^(humo|imp)-[0-9]+$/.test(id));
  let borradas = 0;
  for (const id of basura) {
    const r = await pedir(STAGING, `/admin/orgs/${id}`, { method: 'DELETE' });
    if (r.estado === 200) borradas++; else linea(`  (no se pudo borrar ${id}: ${r.estado} ${r.error || ''})`);
  }
  rev(borradas === basura.length, `se borraron las empresas de prueba (${borradas} de ${basura.length}, incluidas las de esta corrida)`);
  const despues = await pedir(STAGING, '/admin/orgs');
  const quedan = (despues.data?.filas || []).map((o) => o.id);
  rev(!quedan.some((id) => /^(humo|imp)-[0-9]+$/.test(id)), 'staging queda sin empresas de humo', quedan.join(', '));
}

const t0 = Date.now();
try {
  await produccion();
  await recorrido();
  await licencias();
  await ordenesYFiscal();
  await importacion();
} catch (e) {
  fallas++;
  linea(`  FALLA se rompió a medias: ${e?.message}`);
}
try {
  await limpieza();
} catch (e) {
  fallas++;
  linea(`  FALLA la limpieza se rompió: ${e?.message}`);
}
linea('');
linea(`RESULTADO: ${revisadas - fallas}/${revisadas} comprobaciones en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas ? 1 : 0);

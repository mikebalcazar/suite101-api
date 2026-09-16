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

async function pedir(base, ruta, { app, method = 'GET', body } = {}) {
  const t0 = Date.now();
  const cabeceras = { 'Content-Type': 'application/json' };
  if (app) cabeceras['X-App'] = app;
  if (galleta) cabeceras.Cookie = galleta;
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
  const ORIGEN = 'https://conta-master.netlify.app';
  const pre = await fetch(`${PROD}/orgs/x/items`, {
    method: 'OPTIONS',
    headers: { Origin: ORIGEN, 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'X-App,Content-Type' },
  });
  rev(pre.status === 204, 'el preflight contesta 204', String(pre.status));
  // Con credenciales no se puede contestar `*`: el navegador tira la respuesta.
  rev(pre.headers.get('access-control-allow-origin') === ORIGEN, 'devuelve el origen exacto, no un comodin', String(pre.headers.get('access-control-allow-origin')));
  rev(pre.headers.get('access-control-allow-credentials') === 'true', 'permite credenciales (la cookie de sesion)');
  rev(String(pre.headers.get('access-control-allow-headers')).includes('X-App'), 'deja pasar la cabecera X-App');
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
  const ent = await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.data?.codigo_prueba } });
  rev(ent.estado === 200, 'entra con el código', `${ent.ms} ms`);
  const yo = await pedir(STAGING, '/yo');
  rev(yo.estado === 200 && yo.data?.superadmin === true, 'la sesión sigue viva en la petición siguiente');

  // 2 · se crea una org y su DO nace solo
  const nueva = await pedir(STAGING, '/admin/orgs', { method: 'POST', body: { id: ORG, nombre: 'Humo' } });
  rev(nueva.estado === 201, `se crea la org ${ORG}`, `${nueva.ms} ms`);
  // Desde 0002 (partidas a tabla propia) el DO nace en la versión 2.
  rev(nueva.data?.org_db_version === 3, 'su Durable Object nació y corrió las tres migraciones solo, sin redeploy', `version ${nueva.data?.org_db_version}`);

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
  galleta = galletaSuper2;

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

async function importacion() {
  linea('');
  linea('== Importación (fase 2) ==');
  galleta = '';

  const cod = await pedir(STAGING, '/auth/codigo', { method: 'POST', body: { correo: CORREO } });
  await pedir(STAGING, '/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.data?.codigo_prueba } });

  const ORGI = `imp-${process.env.GITHUB_RUN_ID || Date.now()}`.slice(0, 40);
  const nueva = await pedir(STAGING, '/admin/orgs', { method: 'POST', body: { id: ORGI, nombre: 'Importada' } });
  rev(nueva.estado === 201, `se crea la org ${ORGI}`);

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

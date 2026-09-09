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
  let cuerpo = {};
  try { cuerpo = await r.json(); } catch { cuerpo = {}; }
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
  rev(nueva.data?.org_db_version === 1, 'su Durable Object nació y se migró solo, sin redeploy', `version ${nueva.data?.org_db_version}`);

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

const t0 = Date.now();
try {
  await produccion();
  await recorrido();
} catch (e) {
  fallas++;
  linea(`  FALLA se rompió a medias: ${e?.message}`);
}
linea('');
linea(`RESULTADO: ${revisadas - fallas}/${revisadas} comprobaciones en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
linea(`org de esta corrida: ${ORG} (queda en staging; staging es desechable)`);
process.exit(fallas ? 1 : 0);

/* Prueba de humo de LA NUBE de draw101, contra el Worker ya publicado.
 *
 * Va aparte de `humo.mjs` a propósito: ese archivo son 1 027 renglones, y el
 * chat que escribe esto no puede empujar por `git` —el proxy deja leer de
 * GitHub pero no escribir—, así que tendría que transcribirlo entero para
 * agregarle un bloque. Un archivo propio se manda solo y no arriesga el resto.
 *
 * Las pruebas de vitest corren dentro de workerd, con un R2 de juguete. Esto
 * corre contra el Worker de verdad y el bucket de verdad, y mide lo que sólo
 * se puede medir aquí:
 *
 *   · que las rutas existan en lo desplegado (una ruta que no se montó da 404
 *     y ninguna prueba local lo ve);
 *   · que R2 devuelva los MISMOS bytes que se le dieron;
 *   · y LO PRINCIPAL: que una cuenta no vea la de al lado en la base
 *     compartida de staging, que es donde conviven de verdad.
 *
 * Corre contra STAGING, nunca contra producción: crea licencias y sube
 * archivos, y eso no se hace donde viven las licencias vendidas (OPERAR §8).
 */

const STAGING = process.env.STAGING || '';
const CORREO = 'mike@forespot.com';
const ORG = Date.now().toString().slice(-8);

let galleta = '';
let revisadas = 0;
let fallas = 0;

const linea = (t) => console.log(t);

function rev(bien, que, detalle = '') {
  revisadas++;
  if (!bien) fallas++;
  linea(`  ${bien ? 'ok  ' : 'FALLA'} ${que}${detalle ? `   (${detalle})` : ''}`);
}

async function pedir(ruta, { method = 'GET', body, token } = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  else if (galleta) cabeceras.Cookie = galleta;
  const r = await fetch(`${STAGING}${ruta}`, { method, headers: cabeceras, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const puesta = r.headers.get('set-cookie');
  if (puesta) galleta = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { no_json: texto.slice(0, 200) }; }
  return { estado: r.status, ...cuerpo };
}

async function entrarComoMike() {
  galleta = '';
  const cod = await pedir('/auth/codigo', { method: 'POST', body: { correo: CORREO } });
  if (!cod.data?.codigo_prueba) return false;
  const e = await pedir('/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.data.codigo_prueba } });
  return e.estado === 200;
}

/** Un token de documento: 26 letras del alfabeto de Crockford, como el ULID
 *  que draw101 mete dentro del .t101d. */
function tokenDeDoc(semilla) {
  const abc = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let t = '';
  for (let i = 0; i < 26; i++) t += abc[(semilla.charCodeAt(i % semilla.length) + i * 7) % abc.length];
  return t;
}

async function main() {
  if (!STAGING) {
    linea('Falta STAGING en el entorno.');
    process.exit(1);
  }
  const t0 = Date.now();
  linea(`Prueba de humo — la nube de draw101 (0.22.0) — ${STAGING}`);
  linea('');

  if (!(await entrarComoMike())) {
    rev(false, 'entrar como Mike en staging');
    return terminar(t0);
  }

  /* ── dos cuentas de draw101, cada una con su máquina ── */
  const cuentas = [];
  for (const quien of ['A', 'B']) {
    const alta = await pedir('/licencias', {
      method: 'POST',
      body: { cliente: `Nube ${ORG} ${quien}`, programa: 'draw101', lugares: 1, perpetua: true, notas: 'la borra el propio humo' },
    });
    if (alta.estado !== 201 || !alta.data?.clave) {
      rev(false, `se crea la licencia ${quien}`, `${alta.estado} ${alta.error ?? ''}`);
      return terminar(t0);
    }
    // La clave se ve UNA vez, aquí. Que venga con su aviso es parte del trato.
    if (quien === 'A') {
      rev(/^T101-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(alta.data.clave),
        'al crear la licencia, la clave se ve una vez', `····-${alta.data.clave.slice(-4)}`);
      rev(String(alta.data.aviso || '').includes('no se guarda'),
        'y viene con el aviso de que no se guarda');
    }
    const huella = `nube-${ORG}-${quien}-0123456789ab`.replace(/[^A-Za-z0-9_-]/g, '-');
    galleta = '';
    const act = await pedir('/licencias/activar', { method: 'POST', body: { clave: alta.data.clave, huella, version: 'humo' } });
    if (act.estado !== 201 || !act.data?.token) {
      rev(false, `la máquina de ${quien} activa con su clave`, `${act.estado} ${act.error ?? ''}`);
      return terminar(t0);
    }
    cuentas.push({ id: alta.data.id, clave: alta.data.clave, token: act.data.token, huella });
    await entrarComoMike();
  }
  const [A, B] = cuentas;
  rev(true, 'dos cuentas de draw101 creadas y activadas');

  /* ── que la clave dejó de guardarse, medido desde el panel ── */
  const detalle = await pedir(`/licencias/${A.id}`);
  const txt = JSON.stringify(detalle.data ?? {});
  rev(detalle.estado === 200 && !txt.includes(A.clave),
    'el panel de Mike ya NO devuelve la clave del cliente', `${detalle.estado}`);
  rev(!txt.includes('llave_envuelta') && !txt.includes('llave_sal'),
    'ni la llave de cifrado de esa cuenta');
  rev(detalle.data?.clave_pista === A.clave.slice(-4),
    'pero sí las últimas cuatro letras, para reconocerla', `····-${detalle.data?.clave_pista}`);

  // Y la clave SIGUE sirviendo para activar, que es la otra mitad: guardar la
  // huella es fácil, guardarla y romper la activación también.
  galleta = '';
  const revive = await pedir('/licencias/activar', { method: 'POST', body: { clave: A.clave, huella: A.huella } });
  rev(revive.estado === 200 || revive.estado === 201,
    'y la misma clave sigue activando: nadie tiene que volver a activar', `${revive.estado}`);

  /* ── la puerta ── */
  galleta = '';
  const cerrado = await pedir('/nube/indice');
  rev(cerrado.estado === 401, 'sin token, la nube contesta 401', `${cerrado.estado} ${cerrado.error ?? ''}`);
  const inventado = await pedir('/nube/indice', { token: 'v1.aaaa.bbbb' });
  rev(inventado.estado === 401, 'con un token inventado, tampoco');

  /* ── la llave envuelta: una vez y sólo una ── */
  const vacia = await pedir('/nube/llave', { token: A.token });
  rev(vacia.estado === 200 && vacia.data?.envuelta === null, 'una cuenta nueva no tiene llave todavía');
  const put1 = await pedir('/nube/llave', { method: 'PUT', token: A.token, body: { envuelta: 'envuelta-de-A', sal: 'sal-de-A' } });
  rev(put1.estado === 200 && put1.data?.envuelta === 'envuelta-de-A' && put1.data?.era_mia === true,
    'la cuenta A deja su llave envuelta', `${put1.estado} ${put1.error ?? ''}`);
  const put2 = await pedir('/nube/llave', { method: 'PUT', token: A.token, body: { envuelta: 'otra-distinta', sal: 'otra-sal' } });
  rev(put2.data?.envuelta === 'envuelta-de-A' && put2.data?.era_mia === false,
    'y la segunda máquina recibe la de la primera, no la suya (si no, dejaría ilegibles los planos de la primera)',
    `quedó ${put2.data?.envuelta}`);

  /* ── subir bytes de verdad a R2 y bajarlos idénticos ── */
  const doc = tokenDeDoc(`humo${ORG}`);
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 13, 10, 0, 255, 128, 64]);
  const sube = await fetch(`${STAGING}/nube/archivo/${doc}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${A.token}`, 'X-Nombre': 'nombre-cifrado-de-humo', 'X-Modificado': '2026-09-29T20:00:00.000Z' },
    body: bytes,
  });
  rev(sube.status === 201, 'la cuenta A sube un archivo a R2', `${sube.status}`);

  const indice = await pedir('/nube/indice', { token: A.token });
  const fila = (indice.data?.archivos || []).find((x) => x.token === doc);
  rev(!!fila && fila.nombre === 'nombre-cifrado-de-humo' && fila.bytes === bytes.length,
    'y sale en su índice, con el nombre tal como se lo dio (cifrado)', JSON.stringify(fila ?? null));
  rev(fila?.modificado === '2026-09-29T20:00:00.000Z',
    'con la fecha de la máquina que guardó, no la del servidor', `${fila?.modificado}`);

  const baja = await fetch(`${STAGING}/nube/archivo/${doc}`, { headers: { Authorization: `Bearer ${A.token}` } });
  const vueltos = Buffer.from(await baja.arrayBuffer());
  rev(baja.status === 200 && vueltos.equals(bytes),
    'y baja con los MISMOS bytes, sin que R2 los toque', `${vueltos.length} de ${bytes.length} bytes`);

  // Otra versión encima, y la de antes se puede recuperar: es la red de
  // seguridad para el día que alguien guarde sobre algo bueno.
  const otros = Buffer.from([9, 9, 9]);
  const sube2 = await fetch(`${STAGING}/nube/archivo/${doc}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${A.token}`, 'X-Nombre': 'nombre-cifrado-de-humo' }, body: otros,
  });
  rev(sube2.status === 200, 'subirlo otra vez no crea otro archivo, sube su versión', `${sube2.status}`);
  const v1 = await fetch(`${STAGING}/nube/archivo/${doc}?version=1`, { headers: { Authorization: `Bearer ${A.token}` } });
  rev(v1.status === 200 && Buffer.from(await v1.arrayBuffer()).equals(bytes),
    'y la versión anterior sigue ahí, recuperable');

  /* ── LO PRINCIPAL: una cuenta no ve la de al lado ── */
  const deB = await pedir('/nube/indice', { token: B.token });
  rev((deB.data?.archivos || []).every((x) => x.token !== doc),
    'el índice de la cuenta B NO trae el archivo de A');
  // Control: si el índice viniera vacío para todos, lo de arriba no mediría nada.
  rev((indice.data?.archivos || []).some((x) => x.token === doc),
    '(control: el de A sí lo trae, así que el filtro no es «no devolver nada»)');

  const robo = await fetch(`${STAGING}/nube/archivo/${doc}`, { headers: { Authorization: `Bearer ${B.token}` } });
  rev(robo.status === 404, 'y con el token del documento en la mano, B tampoco lo baja', `${robo.status}`);
  const borraAjeno = await fetch(`${STAGING}/nube/archivo/${doc}`, { method: 'DELETE', headers: { Authorization: `Bearer ${B.token}` } });
  rev(borraAjeno.status === 404, 'ni lo borra', `${borraAjeno.status}`);

  // Ni lo pisa subiendo encima: tiene que nacer OTRO, suyo.
  await fetch(`${STAGING}/nube/archivo/${doc}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${B.token}`, 'X-Nombre': 'el-de-B' }, body: Buffer.from([7, 7, 7, 7]),
  });
  const deAotraVez = await fetch(`${STAGING}/nube/archivo/${doc}`, { headers: { Authorization: `Bearer ${A.token}` } });
  rev(deAotraVez.headers.get('X-Nombre') === 'nombre-cifrado-de-humo' &&
      Buffer.from(await deAotraVez.arrayBuffer()).equals(otros),
    'ni lo pisa subiendo encima: el archivo de A queda intacto');

  const llaveAjena = await pedir('/nube/llave', { token: B.token });
  rev(llaveAjena.data?.envuelta !== 'envuelta-de-A', 'y B no recibe la llave de cifrado de A', `${llaveAjena.data?.envuelta}`);

  /* ── quitar ── */
  const quita = await fetch(`${STAGING}/nube/archivo/${doc}`, { method: 'DELETE', headers: { Authorization: `Bearer ${A.token}` } });
  rev(quita.status === 200, 'A quita su archivo', `${quita.status}`);
  const yaNo = await pedir('/nube/indice', { token: A.token });
  rev((yaNo.data?.archivos || []).every((x) => x.token !== doc), 'y deja de salir en su índice');

  /* ── limpieza: las licencias de humo no se quedan ── */
  await entrarComoMike();
  let borradas = 0;
  for (const c of cuentas) {
    const r = await pedir(`/licencias/${c.id}`, { method: 'DELETE' });
    if (r.estado === 200) borradas++;
  }
  rev(borradas === cuentas.length, 'las licencias de esta corrida se borran al terminar', `${borradas} de ${cuentas.length}`);

  terminar(t0);
}

function terminar(t0) {
  linea('');
  linea(`RESULTADO: ${revisadas - fallas}/${revisadas} comprobaciones en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(fallas ? 1 : 0);
}

try {
  await main();
} catch (e) {
  linea(`  FALLA se rompió a medias: ${e?.message}`);
  terminar(Date.now());
}

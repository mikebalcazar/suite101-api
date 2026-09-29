/* La pantalla de activación, manejada con un navegador de verdad.
 *
 * Mike (28-sep-2026): «un panel de selección de licencias en los equipos,
 * similar a como le hace adobe. Te abre una lista (con íconos) de los equipos
 * en los que tienes registrada la licencia y puedes escoger dar de baja uno».
 *
 * Lo que se mide aquí es lo que no se ve desde la API: que al no haber lugar
 * la pantalla enseñe la lista en vez de un callejón, que el equipo desde el
 * que se pregunta salga marcado —para no darse de baja uno solo sin querer—,
 * y que al soltar uno se REINTENTE la activación sola. Quien llegó hasta aquí
 * quería entrar, no administrar equipos.
 *
 * Las rutas de la API están cubiertas en api.spec.ts; aquí se falsean.
 *
 *     node pruebas/pantalla-equipos.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PAGINA = fileURLToPath(new URL('../src/paginas/licencia.html', import.meta.url));
const html = await readFile(PAGINA, 'utf8');
const servidor = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
  res.end(html);
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

const AQUI = 'maquina-de-aqui-0123456789';
const VIEJA = 'maquina-vieja-0123456789ab';

/** El servidor de mentiras: las mismas rutas y errores que licencias.ts. */
function apiFalsa() {
  const equipos = [
    { huella: AQUI, nombre: null, sistema: null, version: '0.21.3', alta_at: hace(0), ultimo_latido_at: hace(0), es_de_aqui: true },
    { huella: VIEJA, nombre: 'TALLER-PC', sistema: 'windows', version: '0.20.20', alta_at: hace(120), ultimo_latido_at: hace(75), es_de_aqui: false },
  ];
  const visto = { soltadas: [], activaciones: 0 };
  return { equipos, visto };
}
function hace(d) { return new Date(Date.now() - d * 86400000).toISOString(); }

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await navegador.newContext({ viewport: { width: 460, height: 900 } });
const pagina = await ctx.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

const { equipos, visto } = apiFalsa();
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
const mal = (error, status, detalle) => ({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error, detalle }) });

await pagina.route('**/yo', (r) => r.fulfill(ok({ usuario: { correo: 'mike@forespot.com' }, tiene_clave: true, tiene_google: true, entro_con: 'clave' })));
await pagina.route('**/licencias/mia', (r) => {
  visto.activaciones++;
  const libres = 2 - equipos.filter((e) => e.activa !== false).length;
  if (libres <= 0) return r.fulfill(mal('sin_lugares', 409, { lugares: 2, ocupados: 2 }));
  return r.fulfill(ok({ token: 'v1.x.y', hasta: '2027-01-01', licencia: { perpetua: true }, lugares: { usados: 2, total: 2 } }));
});
await pagina.route('**/licencias/equipos', (r) => r.fulfill(ok({
  licencias: [{ licencia: { perpetua: true }, vigente: true, lugares: { usados: equipos.filter((e) => e.activa !== false).length, total: 2 },
                equipos: equipos.filter((e) => e.activa !== false) }],
})));
await pagina.route('**/licencias/soltar', (r) => {
  const b = r.request().postDataJSON();
  visto.soltadas.push(b.huella);
  const e = equipos.find((x) => x.huella === b.huella);
  if (e) e.activa = false;
  return r.fulfill(ok({ liberada: true, lugares: { usados: 1, total: 2 } }));
});

try {
  await pagina.goto(`${base}/?programa=draw101&huella=${AQUI}&app=draw101&version=0.21.4&equipo=LAPTOP-MIKE&sistema=windows`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForSelector('#v-equipos:not([hidden])', { timeout: 10000 });
  rev(true, 'sin lugar libre, la pantalla enseña la lista de equipos y no un callejón');

  const aviso = await pagina.textContent('#p-equipos');
  rev(/2 equipos a la vez/.test(aviso), 'dice cuántos permite la licencia', aviso.trim());

  const filas = pagina.locator('.equipo');
  rev(await filas.count() === 2, 'un renglón por equipo');

  const textos = await filas.allInnerTexts();
  rev(/TALLER-PC/.test(textos.join(' ')), 'el que mandó su nombre sale con su nombre');
  rev(/LAPTOP-MIKE/.test(textos.join(' ')),
      'y la de aquí con el nombre que la app mandó en la dirección, aunque el servidor todavía no lo tenga');
  rev(/usado hace 2 meses|usado hace 75 días/.test(textos.join(' ')), 'con cuándo se usó por última vez');
  rev(/esta computadora/.test(textos.join(' ')), 'la de aquí sale marcada, y sin botón de dar de baja');

  rev(await filas.locator('.icono svg').count() === 2, 'cada uno con su ícono');
  const botones = filas.locator('button');
  rev(await botones.count() === 1, 'sólo se puede dar de baja la otra: la de aquí no se ofrece');

  const activacionesAntes = visto.activaciones;
  await botones.first().click();
  await pagina.waitForSelector('#v-listo:not([hidden])', { timeout: 10000 });
  rev(true, 'al dar de baja uno, la activación se reintenta sola y entra');
  rev(visto.soltadas.length === 1 && visto.soltadas[0] === VIEJA,
      'y soltó exactamente el que se escogió', visto.soltadas.join(','));
  rev(visto.activaciones > activacionesAntes, 'sin pedirle a nadie que vuelva a empezar');
  const frag = await pagina.evaluate(() => location.hash);
  rev(frag === '#listo', 'y le avisa a la app como siempre, por el fragmento', frag);
  rev(await pagina.evaluate(() => !!window.__t101_licencia), 'con el token en el objeto de siempre');


  /* Dos ruidos que no son errores de la página: las fuentes de Google, que
   * aquí no se alcanzan, y el 409 de «sin lugares», que es exactamente lo que
   * esta prueba provoca a propósito. */
  const deVerdad = errores.filter((e) => !/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|status of 409/.test(e));
  rev(deVerdad.length === 0, 'sin errores de JavaScript', deVerdad.slice(0, 2).join(' | '));
} catch (e) {
  rev(false, 'la prueba reventó', String(e).slice(0, 300));
} finally {
  await navegador.close(); servidor.close();
}
console.log(`\n${fallas ? `${fallas} falla(s)` : 'Todo bien'}: ${revisadas} comprobaciones`);
process.exit(fallas ? 1 : 0);

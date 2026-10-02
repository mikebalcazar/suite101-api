de:     jr (programador)
para:   todos: quien toque src/index.ts o wrangler.toml de la API, y quien dé de alta una app nueva
fecha:  2-oct-2026, 01:05
asunto: suite101.taller101.com — la puerta de la suite, servida por la API (#204)

Mike, 2-oct: «necesito un website base donde pueda dar click en cada
aplicación para ir al portal de cada aplicación. El portal base sería
suite101.taller101.com». Escogió las ocho apps con dominio propio.

QUÉ ES. Una hoja (src/paginas/suite.html) con el logotipo de la suite y
ocho tarjetas: dash101, quell101, quote101, supply101, roster101,
peek101, workshop101 y master101, cada una con su liga a
<app>.taller101.com y una línea de para qué sirve. Identidad Taller 101
(azul 0080C1, Raleway por Google Fonts como la página de licencias),
una columna a 390 px, cuadrícula en escritorio, modo oscuro. Sin
JavaScript. `noindex`.

DÓNDE VIVE, Y POR QUÉ AHÍ. La sirve suite101-api en un SEGUNDO custom
domain (wrangler.toml: `suite101.taller101.com`), no un Worker aparte.
Un repositorio nuevo necesitaría sus propios secretos de Cloudflare en
GitHub Actions, que sólo Mike puede poner; la API ya tiene dominio,
certificado y flujo. src/portal.ts es un middleware que va ANTES de
conSesion: si el host es la puerta, `/` es la página, `/favicon.svg` y
`/salud` contestan, y cualquier otra ruta es 404 (no se expone la API
bajo ese nombre). En api.taller101.com nada cambia; staging no se
cuelga del dominio (routes = []).

PARA AGREGAR O QUITAR UNA LIGA: editar la lista de tarjetas en
src/paginas/suite.html y la lista APPS de pruebas/portal.spec.ts. Las
apps de escritorio (draw101, nest101, shape101) NO van: no son
portales; su lugar es la página de descargas.

LA LECCIÓN DEL LOGOTIPO: el sprite de descargas (sitio/marca/logos.svg)
guarda cada símbolo con un viewBox desplazado («126.69 208.74 402.06
194.51»). El <svg> que lo usa lleva viewBox «0 0 402.06 194.51»; si se
copia el viewBox del símbolo, el dibujo cae fuera del área y sale en
blanco. Me pasó.

MEDIDO: pruebas/portal.spec.ts (5), suite 681 en verde; Playwright a
390 y 1280 px sin barrido horizontal; en vivo: suite101.taller101.com resuelve (172.67.136.253), la raíz contesta 200 text/html con las ocho ligas; api.taller101.com sigue con su portada JSON; corrida 36948004923 en verde.

de:     jr (programador)
para:   quien toque la barra del plano de quell101 (web/src/Project.jsx, .tools)
fecha:  5-oct-2026, 22:26 UTC
asunto: «Imprimir» y «Compartir» del plano son puro ícono, y el botón de planos es el que cede espacio (bitacora-obra #110)

MIKE, 5-oct, con una captura de escritorio (HOLCIM · IMA, ~1270 px de
ancho) donde la barra del plano se cortaba a la altura de «En p…»: «Aquí ya
no se ven los siguientes botones. Hay que hacer puro ícono el "imprimir" y
el "compartir"».

QUÉ PASABA. La barra del plano (.stage .tools) es una fila sin salto en
escritorio: botón de planos (hasta 320 px), Imprimir, Compartir, selector
de fase, selector de alcance. Con un panel lateral de 400 px y una barra de
240, el plano se queda con ~630 px y la fila sumaba ~740: lo de la derecha
se salía del borde y no había forma de picarlo.

QUÉ SE HIZO.
- Imprimir y Compartir son un cuadrado de 32 con su dibujo (`.btn.ico`,
  `ICO.imprimir`, `ICO.compartir`). La palabra sigue en `title` y en
  `aria-label` (lector de pantalla). `BotonCompartir` (Fotos.jsx) acepta
  `etiqueta` para eso y, mientras baja el archivo, un botón de ícono enseña
  «…» en vez de «Preparando…». La foto ampliada y las tarjetas de
  documentos siguen con la palabra: ahí sí cabe.
- En la barra, el botón de planos es el ÚNICO que cede
  (`.stage .tools .btn.planos{flex:0 1 auto;min-width:120px}`): si aun así
  no caben los selectores, el nombre del plano se recorta con «…» y los
  selectores se quedan a la vista. Antes nada cedía.

PRUEBAS. `pruebas/los-botones-del-plano-son-iconos.mjs` (17, sin red:
forma de los dos botones, etiqueta y title, dibujos en ICO, el estilo, lo
armado). Con el código viejo fallan 15. `el-menu-se-ve-en-safari.mjs`
apunta a la forma nueva del botón de compartir del plano. `npm run prueba`
entero en verde.

OJO:
- El empaquetador escribe las cadenas del JS publicado con comillas o con
  acentos graves según le convenga; las pruebas que buscan texto en
  `web/dist` tienen que aceptar las dos (`[\`"]`). Me costó una corrida.
- La barra sigue sin saltar de línea en escritorio (sí en ≤900 px). Si
  algún día se le agrega un botón más, la que cede es el nombre del plano;
  si eso ya no alcanza, habrá que pensar en un menú de «más».

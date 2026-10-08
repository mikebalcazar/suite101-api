de:     jr (programador)
para:   quien toque la pantalla de cualquier app de la suite (menos quell101)
fecha:  8-oct-2026, 22:53 UTC
asunto: toda la suite con el look de cost101, la tipografía de dash y el logotipo oficial; quell101 no se tocó

Mike, 8-oct: «Quiero que todas las plataformas en toda suite 101 tengan el
diseño look and feel de cost101 pero siguiendo los parámetros de tipografía y
de logo de dash y quell». «La única que no tocas es quell. Quell se queda como
está.» Vio la muestra en dash101 y dijo «Me gusta, pásalo a todas».

Lo que quedó igual en todas (la receta, por si llega una app nueva):
- Fondo: `#060d13` con radial azul (`#2a9be0 → #0a6aa6 → #0b3655 →
  #07141e → #05090d`), fijo; `color-scheme: dark`.
- Tinta #e8eef2, secundaria #a9c0ce. Acento #3AA3DC, enlaces #86c9ec.
- Tarjetas de vidrio (gradiente blanco .085→.035, borde .13, radio 20 px,
  blur 16 px); barra de vidrio oscuro; campos rgba(255,255,255,.06) radio
  12 px; botones redondos, el principal blanco con letra #0b1b26.
- Bien #5CC28E, mal #F0A08A, aviso #E0A35A.
- Letra: Cifras (Fira, sólo dígitos) + Raleway locales, títulos en 600.
  Nunca Google Fonts. Sansation sólo vive dentro del logotipo, en trazos.
- Logotipo: el oficial en su versión `-claro` (palabra blanca, aro y «101»
  en #3AA3DC), 28 px en la barra y 36 px en la entrada.
- Al imprimir todo vuelve a claro. Lo que es papel (la hoja de quote101, el
  recibo, el estado de cuenta, la hoja de firma de roster, la caja del logo
  de la empresa en workshop) se queda claro también en pantalla.

Cada app, con su PR y su medición de producción en verde:
- dash101 (#148, 0e52bcf): variables `--c-*` en tailwind; `.bg-white` es
  vidrio. Medidor y verificar en verde.
- puerta de la suite (suite101-api #282/#283): las letras se sirven de
  /fuentes/*. OJO: wrangler sólo empaca `.woff2` con la regla `**/*.woff2`;
  una ruta completa pasa vitest y falla al publicar.
- peek101 (#26, 1c3bc6b): de paso, el cuadro del código de 6 dígitos se veía
  como círculo de 22 px desde el 5-oct (heredaba `.pin` del plano); ahora los
  pines son `button.pin`.
- master101 (#36, a710ddc). La tabla de Empresas se corta a la derecha a
  1440 px: ya pasaba en main antes de este cambio (captura de comparación).
- workshop101 (#16, 74bfaf8).
- supply101 (dash101 #149, 4f9056d): adiós al «s101» hechizo.
- roster101 (t101-portal-trabajadores #36, bd8356e, 0.15.0): logotipo a
  36 px en la barra porque a 26 px la palabra no se leía (nota del CSS).
- quote101 (cotizador-t101 #87, f94a179, G111): la app trae colores en
  línea; un bloque «ESTILO DE LA SUITE» los traduce fuera de la hoja. La hoja
  (`HOJA_CSS`) quedó intacta y todavía carga DM Sans de Google Fonts.
- cost101 (#7, 94edc7a, 0.3.1): logotipo SVG en vez de PNG + texto, Cifras,
  encabezado en una línea desde 1280 px; `entrar.html` ahora oscuro.

quell101 (bitacora-obra) no se tocó.

Pendiente que no es de este encargo: `cotizador-t101.netlify.app` responde
503 y sigue esperando que se borre; las 6 fallas de panel.spec de master101
con el banco falso (#125) siguen igual.

de:    jr
para:  quell101, quote101, coordinador, mike
qué:   quell101 y quote101 tienen pantalla de arranque propia (tipo draw101/nest101): un plano de obra y una hoja de cotización que se trazan solos mientras la app abre, con la marca encima. Además ya no pueden verse en blanco: fondo propio, aviso a los 8 s y «Reintentar» a los 20 s.

# Pantalla de arranque en quell101 y quote101

Mike la pidió el 14-sep, después de que quote101 se le quedó **en blanco**
en un iPhone (una copia vieja en caché; el letrero de carga era texto
blanco sin fondo, así que no se veía nada). Se hizo la misma pieza en las
dos apps, con el dibujo de cada una.

## quell101 (bitacora-obra, PR #53, 0ff62d4)

- `web/index.html`: overlay con fondo azul tinta propio; un plano de obra
  flotando en perspectiva que se traza solo (1,1 s) y al que le caen los
  cinco puntos de la punchlist (rojos y verdes); la marca quell101 en
  blanco; «Cargando aplicación» con puntos latiendo.
- `App.jsx` cambia el renglón a «Abriendo tu bitácora» y lo quita cuando ya
  sabe quién entró, con sesión o sin ella. Mínimo 1,4 s en pantalla.
- Va en el HTML, no en React: se ve desde el primer byte, antes del
  JavaScript, y sirve igual en web, Android y Windows (los tres cargan ese
  index.html).
- **Verificado en vivo**: bitacora-obra.mike-929.workers.dev sirve el
  index.html con el splash (44 menciones, script en línea, marca) y el JS
  publicado trae «Abriendo tu bitácora».

## quote101 (cotizador-t101, PR #12, 5e85364)

- Mismo patrón: la aurora de la app como fondo propio; una hoja de
  cotización trazándose (encabezado, cliente, tabla, totales); la marca
  quote·101; «Trayendo tus cotizaciones». La app lo quita al traer los datos
  de Firestore o al fallar.
- Netlify ya lo sirve (52 menciones); el Worker (staging y producción) en
  la corrida 34900841447. Se confirma abajo.

## Medido (Playwright, contra el archivo servido localmente, las dos apps)

| Escenario | Resultado |
|---|---|
| Arranque normal | splash visible con fondo oscuro a menos de 1 s; se retira solo; la app pinta; cero errores de JavaScript |
| Sin JavaScript (celular 390×844) | se ve la marca y «Cargando aplicación»: nunca más una pantalla en blanco |
| API / Firestore trabados | a 8,6 s «Sigue cargando… revisa tu señal/conexión»; a 20,6 s botón «Reintentar» |
| Sintaxis (quote101, acorn) | sigue en ES2020: el mismo mínimo de navegador que antes |

## Para los chats

- quell101: `window.splash101.estado("…")` y `.ocultar()` están disponibles
  si un día la app quiere reportar avances antes de entrar.
- quote101: idem. Nota aparte: la app usa `?.` en dos lugares (ES2020); en
  Safari anterior a 13.4 no arranca. No urge, pero conviene saberlo.

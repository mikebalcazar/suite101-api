de:     jr (programador)
para:   quien toque quell101, dash101, roster101 o supply101; y quien siga con lo de batería
fecha:  29-sep-2026
asunto: batería en móvil: quote101 G103 sin ambiente, y el análisis de dónde gasta cada app

Mike, 29-sep: «Hay que reducir el consumo de recursos de las apps en
MÓVIL. Es crítico. Empezando por quote. Hay que quitar los efectos del
fondo y las animaciones de ambiente. Solo dejar las animaciones de la
interfase. Y vemos de ahí como funciona. Y para todas las demás, requiero
análisis de donde gastan recursos y ver cómo eficientar.»

1. quote101 G103 (cotizador-t101 #66): se fue el ambiente
   Hasta G102 la app traía, detrás de todo y para siempre:
   · body::before, la aurora: 7 gradientes, `filter: saturate(1.1)` y
     `auroraDrift` 30 s infinita (transform sobre pantalla completa).
   · body::after y `.fg-particles`: dos capas de 60 gradientes radiales
     cada una, `particlesFloat`/`fgFloat` 10 s infinitas. La segunda iba
     ENCIMA de los bloques (z-index 50).
   · Tres `.float-orb`: `filter: blur(40px)` + `mix-blend-mode: screen`,
     `orbDrift` 28/34/40 s infinitas. Se creaban al arrancar por JS.
   · `backdrop-filter: blur(8–30px) saturate(180%)` en `.frost` y en 24
     estilos en línea: tarjetas, botones, cabeceras, velos, filtros, la
     hoja de cotización.
   Cuatro capas de pantalla completa componiéndose 60 veces por segundo
   con blur y mezcla, aunque nadie toque nada: eso es la GPU del
   teléfono al tope. El cristal esmerilado además vuelve a filtrar el
   fondo en cada cuadro en que algo se desplaza.
   Ahora: el mismo fondo azul, quieto, en `body::before` fijo sin
   animación ni filtro (se pinta una vez y sólo se compone; NO
   `background-attachment: fixed`, que repinta al desplazar y iOS
   ignora). Regla global `backdrop-filter: none !important` para que no
   vuelva por la puerta de atrás. Los fondos translúcidos suben a
   0.90–0.95 para leerse sin blur (tarjeta .72→.94, cliente .32/.42→
   .90/.95, hoja .32→.95, cabeceras azules .85→.96, botones .6→.9,
   entradas .7→.92).
   Se quedan, porque responden a la persona: neón del cliente abierto
   (`neonPulse`, infinita mientras está abierto), pin activo del armador
   (`arm-late`), `slideDown`/`fadeInUp`, el «vacuum» al archivar, y el
   splash (se quita solo al cargar).
   Medido: `pruebas/el-ambiente.spec.mjs` (3, a 390×844 con touch):
   body::before/after sin animación, 0 orbes, 0 partículas, 0 elementos
   con backdrop-filter, tarjeta ≥ .85 de alfa, y las únicas animaciones
   infinitas vivas son `.neon-circle`/`.arm-pin`. Fallan 3 de 3 en G102.
   Suite 112/112. Diff −259/+28 en index.html.
   Lo que NO se midió: el consumo real en un teléfono. Aquí no hay uno.
   Es lo que Mike va a sentir; si sigue caliente, lo siguiente en quote
   es el splash (flotar 9 s infinita con doble drop-shadow mientras carga)
   y el neón (box-shadow animado), pero son chicos.

2. El análisis de las demás apps (leído del código, sin tocar nada)
   Resumen: en ninguna otra app hay ambiente pesado (0 auroras, 0
   backdrop-filter, 0 mix-blend-mode, 0 fondos animados). Lo que gasta
   está en OTRO lado: en quell101 es el plano; en dash101 es peso muerto
   al arrancar; en roster101 es la cámara.

   | App | Front | Anim. infinitas | blur | Temporizadores | Gasto |
   |---|---|---|---|---|---|
   | quell101 | 373 KB + pdf.js 1.7 MB bajo demanda | 3 (splash, aviso, spin: acotadas) | 0 (drop-shadow doble en splash) | 60 s fila offline; 200 ms redibujo PDF | ALTO |
   | roster101 | 145 / 116 KB | 1 (spinner) | 0 | 20 s ×2 | MEDIO |
   | dash101 | ~755 KB de JS en el layout (385 KB de Firebase muerto) | 0 | 0 | 0 | MEDIO al arrancar, bajo en uso |
   | supply101 | 48 KB | 0 | 0 | 0 | BAJO (fotos sin comprimir) |
   | peek101 | 50 KB | 0 | 0 | 0 | BAJO |
   | workshop101 | 55 KB | 0 | 0 | 0 | BAJO |
   | master101 | 97 KB | 0 | 0 | 0 | BAJO |
   | taller101 | retirado 18-sep | — | — | — | no aplica |

   2a. quell101 (bitacora-obra/web), de mayor a menor:
   · INTERFAZ, ALTO — cada movimiento del dedo repinta todos los pines
     con React. `PlanCanvas.jsx:253-272` `onMove` → `aplica()` en cada
     pointermove (60–120/s); `aplica` (`:76-81`) hace `setV(val)` = estado
     de React → render completo; `:292-323` rearma `elements.map` con
     estilo en línea nuevo por pin; `:315` `transform: … scale(${1/v.s})`
     cambia el estilo de TODOS los pines en cada cuadro del pinch, con
     box-shadow (`styles.css:173,474,521`). `Project.jsx:418` pasa
     `onPick` nuevo en cada render, así que cualquier repintado de
     Project arrastra al plano.
     Arreglo: la vista vive sólo en `vista.current` mientras el dedo está
     abajo; escribir `worldRef.style.transform` dentro del `pide()` que
     ya existe (`:82`); `setV` únicamente en `onUp`. Escala de pines con
     una sola variable en `.world` (`--k: 1/s`) y `.pin{transform:
     scale(var(--k))}`: una escritura por cuadro en vez de N. Mejor aún:
     pines dibujados en el mismo canvas dentro de `pinta()` y toque por
     distancia. `React.memo(PlanCanvas)` + `useCallback` en Project.
   · INTERFAZ, ALTO — el PDF se redibuja COMPLETO en cada pausa.
     `PlanCanvas.jsx:182-186`: cualquier cambio de v.x/v.y/v.s programa
     `dibujaPdf()` a 200 ms; `:284` onUp también; `:188-231` `pg.render`
     vuelve a ejecutar toda la lista de operaciones de la página aunque
     se vea un pedazo; `:42` PAGINA_MAX 60000; `:43` densidad hasta dpr 2;
     `:89` ResizeObserver → fit() → otro redibujo.
     Arreglo: dibujar 1.5–2× el área visible; redibujar sólo si el zoom
     cambió más de ±25–30 % o la vista salió del área dibujada (un paneo
     corto se resuelve con el `drawImage` de `:175-176`); espera 400–500
     ms; densidad tope 1.5 en teléfono; no dibujar si `document.hidden`.
   · INTERFAZ, MEDIO — pdf.js (330 KB + worker 1.38 MB) se carga y
     compila en cada arranque con plano PDF (`pdf.js:12-13`,
     `PlanCanvas.jsx:110-117`). La descarga la guarda el SW; el parseo no.
     Arreglo: enseñar primero la imagen rasterizada que ya existe
     (`imagen`, `:95-103`) y cargar pdf.js sólo al acercarse más allá de
     su resolución.
   · INTERFAZ, MEDIO-BAJO pero constante — `App.jsx:34` `setInterval`
     60 s → `vaciaFila()` → `avisa()` (`api.js:43-45`) lee IndexedDB y
     `setRed({...})` con objeto nuevo → App, Project y PlanCanvas se
     repintan cada minuto, con la app en segundo plano incluida.
     Arreglo: correr sólo si `visibilityState === 'visible'` y
     `faltan > 0`; no cambiar estado si nada cambió; `useMemo` en `ctx`
     (`App.jsx:37-47`).
   · MEDIO en red — miniaturas a tamaño completo: `Fotos.jsx:10` pinta
     el archivo de 1600 px (`api.js:250`) en 80 px. Arreglo: miniatura
     de ~320 px al subir; original sólo en el lightbox.
   · BAJO-MEDIO — al abrir la obra se bajan todos los planos e imágenes
     (`Project.jsx:121-134`); en la app empaquetada el token va en la URL
     (`api.js:~147`) y al cambiar tira la caché. Arreglo: prebajar sólo
     con Wi-Fi/sin saveData; llave de caché sin token.
   · BAJO — visor de documentos hasta 16 MP (`nitidez.js:15-16`,
     `DocsItem.jsx:341-349`). Tope 8 MP / dpr 2.
   · AMBIENTE, BAJO — splash: `.plano` `splash101-flotar 9s infinite`
     sobre preserve-3d con doble drop-shadow (`web/index.html:90-91`),
     logo con doble drop-shadow (`:120`); si /me tarda, gira hasta 20 s.
     Arreglo: 1–2 ciclos y quieto; un solo drop-shadow; `animation:none`
     en el aviso.
   · Se quedan: `.spin` (sólo cargando), `.hint` (2 ciclos), `.pin.flash`
     (3 ciclos). `prefers-reduced-motion` cubre `.hint` y el splash.

   2b. dash101:
   · MEDIO al arrancar — Firebase entero en TODAS las pantallas aunque
     `FUENTE=api` desde el 16-sep: `lib/auth-context.tsx:22-30` y
     `lib/firebase.ts:1-3` importan `firebase/auth`, `firebase/app`,
     `firebase/firestore` de forma estática; `app/layout.tsx:2` monta
     `AuthProvider`. En la construcción: ~385 KB de JS muerto de ~755 KB
     del layout. Cuatro pantallas importan `Timestamp` como valor
     (`dashboard`, `opex/[id]`, `equipo`, `proyectos/[id]`).
     Arreglo: `await import('firebase/…')` sólo en la rama firestore, o
     quitarlo si la migración terminó; `Timestamp` → tipo propio/Date.
   · Recharts (377 KB) sólo en /flujo: bien.
   · `ordenes/[id]/page.tsx:200-203`: `<img>` sin lazy. Menor.
   · 0 keyframes, 0 blur, 0 temporizadores. Las 255 `transition` de
     Tailwind son de interfaz (150 ms).

   2c. roster101:
   · MEDIO mientras está abierta — cámara a 1920×1440 (`app.js:719-721`)
     y escáner a 2560×1920 (`escaner.js:122-124`); `visibilitychange`
     (`app.js:1055-1057`, `autoguardado.js:156`) sólo guarda, no apaga
     las pistas. La foto final se recorta a ~1600 px (`escaner.js:39-40`),
     así que 2560 no aporta. Arreglo: `getTracks().forEach(stop)` al
     ocultarse y volver a prender al regresar; vista previa a 1280×960.
   · BAJO — `setInterval` 20 s fijos (`app.js:1035`, `autoguardado.js:
     44,160`) despiertan el teléfono aunque no haya pendientes. Arreglo:
     `setTimeout` sólo cuando queda algo, cancelar al guardar.
   · 5 pesos de Raleway (~197 KB): revisar si 500 y 800 se usan.

   2d. supply101: sube la foto de cámara tal cual (3–12 MB,
   `app.js:502-505`) y la vuelve a pintar completa (`:553-554`). Arreglo:
   reducir a ~1600 px JPEG .82 antes de subir (como `compressImage` de
   quell101), `loading="lazy"`.

   2e. peek101, workshop101, master101: nada que hacer. Una transición
   de 500 ms en la barra de peek ya va bajo `prefers-reduced-motion`.

3. Orden sugerido (costo/beneficio), para que Mike escoja
   1) quell101: plano sin React al arrastrar (2a, primer punto). Acotado a
      PlanCanvas.jsx; es lo que más se usa en obra.
   2) quell101: PDF con margen y umbral (2a, segundo). Mismo archivo.
      Quita la mayor parte del gasto de CPU.
   3) quell101: temporizador de 60 s condicionado (cinco líneas).
   4) quell101: pdf.js sólo al acercarse; splash sin infinite.
   5) dash101: Firebase fuera del layout (~385 KB por arranque).
   6) roster101: cámara apagada en segundo plano y vista previa a 1280.
   7) quell101 miniaturas; supply101 comprimir antes de subir.
   8) Detalles: 20 s de roster bajo demanda, pesos de Raleway, lazy en
      ordenes/[id], prefers-reduced-motion en .spin/.pin.flash.

Regla que se queda: ambiente (decorativo, corre solo) se quita;
interfaz (responde a un toque, dura menos de un segundo o sólo mientras
carga) se queda. En quote101 la prueba `el-ambiente` la vigila; en las
demás no hay nada de ambiente que vigilar hoy.

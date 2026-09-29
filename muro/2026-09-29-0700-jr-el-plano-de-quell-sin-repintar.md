de:     jr (programador)
para:   quien toque el plano de quell101 (PlanCanvas.jsx, plano.js) o la fila sin señal (App.jsx, api.js)
fecha:  29-sep-2026
asunto: batería en móvil, paso 2: el plano de quell101 ya no repinta con React al arrastrar, y el PDF sólo se redibuja cuando hace falta

Mike escogió con botones, tras el análisis del muro 2026-09-29-0600,
seguir por el plano de quell101. bitacora-obra #87, publicado.

1. Qué gastaba (medido, no supuesto)
   Con toques de verdad por el protocolo del navegador (CDP) en Chromium a
   390×844, 80 pines, un arrastre de 40 pasos y un pinch de 30, tres
   corridas por versión:
   · Pinch: 2400 escrituras de estilo en pines (80 × 30), 34–41 ms de
     script, 182–219 ms de tareas en el hilo principal.
   · Arrastre: 48–51 ms de script, 216–225 ms de tareas. (En el arrastre
     el estilo de los pines no cambia de valor, así que el DOM no lo
     acusa; lo que costaba era React rearmando los 80 pines por evento.)
   Causa: cada `pointermove` pasaba por `setV` (estado de React) y cada
   pin recibía `transform: scale(1/s)` propio en cada cuadro. Además cada
   pausa del dedo (200 ms) ejecutaba la página completa del PDF con
   pdf.js, y `App.jsx` leía IndexedDB y repintaba toda la app cada minuto
   aunque la fila estuviera vacía y la pestaña oculta.

2. Qué cambió
   · `PlanCanvas.jsx`: durante el gesto la vista vive en `vista.current`;
     la capa `.world` se mueve con `style.transform` escrito directo, una
     vez por cuadro (desde el `requestAnimationFrame` que ya existía), y
     los pines se mantienen de tamaño con UNA variable CSS en la capa
     (`--k`, `.pin{transform:… scale(var(--k,1))}`) que sólo se toca si
     cambió más de 2 % (cada escritura obliga a recalcular el estilo de
     todos los pines; medido: escribirla en cada evento subía el recálculo
     de 30 a 113 ms) y exacta al soltar. `setV` corre una vez por gesto,
     en `onUp`. Con la pestaña oculta no se dibuja; al volver, se pone al
     día.
   · `plano.js` (nuevo, puro, sin navegador): `hojaConMargen` (1.75× la
     pantalla por lado, tope 8 MP: en un monitor grande el margen se
     encoge), `hayQueRedibujar` (sólo si no hay hoja, el zoom cambió más
     de ±25 %, la vista se salió de lo dibujado o cambió el tamaño de la
     caja), `pegado` (dónde se pega lo dibujado), `ESPERA_MS` 450,
     `mismaSenal`.
   · `App.jsx`: el `setInterval` de 60 s sólo actúa con
     `visibilityState === 'visible'` y `faltan > 0`; `visibilitychange` al
     volver también intenta; `setRed` no cambia el estado si el aviso es
     igual; `ctx` en `useMemo`. `api.js` exporta `revisaSenal()` para
     saber al arrancar cuántos cambios quedaron de la vez pasada aunque
     no haya señal (vaciaFila no avisa sin red).
   · `web/index.html`: el plano del splash flota 2 veces y se queda
     quieto, con una sola sombra.

3. Cómo quedó
   · Pinch: escrituras de estilo en pines 2400 → 0; script 12–15 ms;
     tareas 136–147 ms.
   · Arrastre: script 18–21 ms; tareas 132–136 ms.
   · La vista termina en el mismo lugar y la misma escala en las dos
     versiones; sin errores de JavaScript.
   · `pruebas/el-plano-no-repinta.mjs` (35 revisiones; 13 fallan con el
     código viejo), en la cadena de `npm run prueba` (13 archivos, 0
     fallas). El medidor con navegador NO va en el repo: quell101 no trae
     Playwright; se corrió desde cotizador-t101 con `web/dist` servido y
     una API de mentiras. Si hace falta repetirlo, está descrito arriba.
   · La densidad del lienzo se quedó en 2 (no se bajó a 1.5): Mike ya se
     quejó una vez de resolución en quell y no lo pidió. Es una palanca
     que sigue ahí.
   · NO medido: batería real en un teléfono. Lo siente Mike.

4. Lo que sigue del análisis (orden sugerido, para que Mike escoja)
   · quell101: pdf.js sólo al acercarse (hoy se carga y compila 1.7 MB en
     cada arranque con plano PDF); miniaturas de ~320 px para las fotos.
   · dash101: Firebase fuera del layout (~385 KB de JS muerto por
     arranque).
   · roster101: cámara apagada en segundo plano y vista previa a 1280.
   · supply101: comprimir la foto antes de subir.

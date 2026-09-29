de:     jr (programador)
para:   quien toque dash101 (next.config, lib/sin-firebase), roster101 (la cámara, los reintentos) o supply101 (fotos)
fecha:  29-sep-2026
asunto: batería en móvil, paso 3: Firebase fuera del arranque de dash101, la cámara de roster101 descansa, supply101 achica la foto

Mike, tras probar quote101 G103 y el plano de quell: «Mejoró. Veamos otras
mientras y regresamos a quell y quote para mejorar más.» Se fue en el
orden del análisis (muro 0600): dash101, roster101, supply101. Los tres
publicados y verificados en vivo.

1. dash101 #94: Firebase fuera del arranque
   Con FUENTE=api (lo publicado desde el 16-sep) nadie le habla a
   Firebase, pero los módulos de lib/ conservan su rama `firestore` y lo
   importan arriba del archivo: webpack metía el SDK entero (Auth y
   Firestore: 184 + 104 + 88 KB) en TODAS las pantallas.
   · `next.config.ts`: con `NEXT_PUBLIC_FUENTE` distinta de `firestore`,
     `firebase/app`, `firebase/auth` y `firebase/firestore` se apuntan a
     `lib/sin-firebase.ts` (navegador y servidor). Con `firestore` no se
     toca nada. Se decide al construir, igual que la fuente.
   · `lib/sin-firebase.ts`: los mismos nombres que el código importa
     (la prueba los busca en app/, lib/ y components/ y exige que todos
     existan), pesan nada y truenan diciendo «Con FUENTE=api no hay
     Firebase» si alguien los llama. `Timestamp` sí se usa con la API
     (adaptar.ts convierte las fechas ISO a Timestamp para que las
     pantallas no cambien): ahí vive una versión mínima con la misma cara.
   · `scripts/peso-arranque.mjs` (`npm run peso`): lo que el layout carga
     en todas las pantallas, leído de `.next/app-build-manifest.json`.
     pruebas.yml lo corre tras construir con tope de 450 KB.
   Medido: arranque 763 → 363 KB (9 → 6 archivos) en lo construido; en
   vivo la página de login pasó de 860 a 486 KB de JS y no queda ni una
   cadena de Firebase. Recorrido en navegador contra la construcción:
   16/17 (la 17 es el Excel, sólo contra el Worker, igual que antes).
   `pruebas/sin-firebase.spec.ts` (10; 2 fallan con el config viejo).
   NO hecho: borrar la rama firestore de lib/. Eso es decisión de Mike;
   hoy sigue construible con NEXT_PUBLIC_FUENTE=firestore.

2. roster101 #27: la cámara descansa
   · La vista previa de la foto pedía 1920×1440 y el escáner 2560×1920;
     lo guardado se recorta a 1200–1800 de lado, así que el sensor a esa
     resolución no le añadía nada y costaba 2–4× de procesador. Ahora
     piden 1280×960 (`CAMARA_ANCHO/ALTO` en app.js y escaner.js).
   · Con la app en el fondo el sensor seguía prendido. `visibilitychange`
     → hidden apaga las pistas y marca «dormida»; al volver, si la
     pantalla de la cámara sigue abierta y no está en «confirmar», se
     prende sola. Cerrada, no se prende.
   · Los `setInterval` de 20 s (app.js y autoguardado.js) despertaban al
     teléfono toda la sesión. Ahora `vigilarPendientes()` /
     `reintentar()` sólo existen desde que algo queda pendiente hasta que
     se guarda, no disparan con la app en el fondo, y se apagan al
     `soltar()` la ficha. `revisar`: cada `cambiosPendientes = true` y
     `pendiente = true` arma el reintento.
   `pruebas/0116-la-camara-descansa.mjs` (22): doble de getUserMedia que
   apunta la resolución y cuenta stop(), y visibilidad fingida. 14
   fallan con el código viejo. Cadena completa en verde. Vivo: los tres
   archivos en roster101.taller101.com traen el cambio.

3. supply101 (dash101 #95): la foto se achica
   · `supply101/publico/imagen.js`: `achicarImagen` a 1600 de lado, JPEG
     .82, como quell101 y roster101. Sólo imágenes; un PDF pasa tal cual;
     nunca agranda; si el navegador no puede, sube la original.
   · app.js: la foto pasa por ahí antes de la FormData; el papel del
     detalle con `loading="lazy" decoding="async"`.
   `pruebas/la-foto-se-achica.mjs` (10, en navegador): 3000×4000 →
   1200×1600, 239 → 31 KB. Corre en publicar.yml después de traer el
   navegador.
   Tropiezo: la primera publicación (#95) se detuvo en «Que supply101
   mande» porque la prueba de staging esperaba `img[alt="cotizacion.png"]`
   y ahora el archivo que cuelga se llama cotizacion.jpg (se convierte a
   JPEG antes de subir). #96 corrige la expectativa; producción no se
   tocó entre las dos porque el flujo se detiene antes de construirla.

4. Lo que queda del análisis (muro 0600), para volver a quell y quote
   · quell101: pdf.js sólo al acercarse (1.7 MB que se compilan en cada
     arranque con plano PDF); miniaturas de ~320 px para las fotos;
     prebaja de planos sólo con Wi-Fi; visor de documentos a 8 MP.
   · quote101: el splash (flotar 9 s infinita con doble drop-shadow
     mientras carga) y el neón (box-shadow animado) si sigue caliente;
     ExcelJS y jsPDF se cargan al inicio (revisar si pueden ir bajo
     demanda).
   · Detalles: pesos 500 y 800 de Raleway en roster101 y dash101; lazy
     en dash101 ordenes/[id]; prefers-reduced-motion en .spin/.pin.flash
     de quell101.

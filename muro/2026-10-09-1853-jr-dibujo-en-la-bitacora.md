de:     jr (sesión de Claude Code)
para:   quell101 y el coordinador
fecha:  9-oct-2026, 18:53 UTC
asunto: un dibujo a mano junto a «Cámara» y «Fotos» (quell #128; Android v19)

1. LO QUE PIDIÓ MIKE, 9-oct: «quiero poder hacer un dibujo bitmap adicional
   a agregar imagen o tomar foto para anotaciones de la bitácora. Un cuadro
   de 1000x1000 pixeles y un par de pinceles y opción a colores».

2. QUÉ ES. `web/src/Dibujo.jsx`, abierto desde `PhotoInput` (`Fotos.jsx`),
   así que sale en la bitácora y en todo compositor con fotos (punchlist,
   dudas, terminar con foto). Lienzo de 1000×1000 por dentro, cuadrado en
   pantalla, `touch-action:none`; pinceles Fino 5, Grueso 18 y Borrador 44;
   seis colores y `<input type="color">`. Deshacer guarda trazos (no
   copias del lienzo: 10 copias serían 40 MB); «Borrar todo» es un paso y
   se deshace. Sale un PNG `dibujo-AAAAMMDD-HHMMSS` que entra a
   `usePending` como cualquier foto (y por eso `compressImage` lo manda
   como JPEG, ~20 KB). No toca la API.

3. MEDIDO: `npm run prueba` en verde con `pruebas/el-dibujo.mjs`; recorrido
   en Chromium a 390 y 1280 leyendo pixeles del lienzo (trazo, deshacer,
   borrar y deshacer, otro color, agregar y registrar con nota);
   producción sirve el JS nuevo; la APK v19 lo trae y está firmada con la
   llave fija (844C…E9E4). No probado en un teléfono de verdad.

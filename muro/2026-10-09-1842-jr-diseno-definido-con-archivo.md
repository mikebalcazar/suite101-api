de:     jr (sesión de Claude Code)
para:   quell101, dash101 (cronograma y candados) y el coordinador
fecha:  9-oct-2026, 18:42 UTC
asunto: el diseño definido de la pieza, con su plano o imagen (API 0.90.0 y 0.90.1, org/0049; quell #127)

1. LO QUE PIDIÓ MIKE, 9-oct: «desde quell quiero poder marcar que el
   diseño ya está definido y poder adjuntar un plano (pdf) o imagen del
   diseño definido». Con botones escogió «Aparte, sin tocar el principal».

2. API (#314 y #315).
   - org/0049: `quell_element_docs.diseno` (0/1) con índice parcial de los
     vivos. Corre desde código (`disenoDelItem`, con `tieneColumna`) porque
     SQLite no tiene `ADD COLUMN IF NOT EXISTS` y las pruebas reaplican.
   - `POST /quell/elements/:id/docs` con `diseno=1` y `diseno_definido`
     (AAAA-MM-DD, opcional): entra como SOPORTE con la marca; si ya había
     uno vivo, el nuevo es su versión (misma familia) y el anterior queda
     archivado. Con fecha, fecha la pieza en el mismo paso. Sólo personal.
     Respuesta `{doc, archivada, diseno_definido}`. Fecha mala: 400.
   - `GET /quell/elements/:id` trae `diseno_doc` ({id, nombre, mime,
     paginas, version, r2_key, created_at} o null). `r2_key` llegó en
     0.90.1 para abrirlo con /files/<r2_key>.
   - El plano principal NO cambia, ni sus marcas ni sus versiones.

3. QUELL (#127). El rótulo «Diseño definido …» / «Diseño sin definir» del
   encabezado del ítem (sólo personal) se pica y abre el cuadro «Diseño
   definido»: fecha (hoy o la que tenga) y un PDF o imagen (escoger, pegar
   o arrastrar). Sin archivo sólo hace el PATCH de siempre. «Quitar la
   marca» deja la fecha vacía; el archivo se queda en «Archivos del ítem»,
   donde su tarjeta dice «Diseño definido». Con archivo sale «ver diseño».
   El campo de fecha de «Editar» sigue igual.
   - De paso: el rótulo leía AAAA-MM-DD como medianoche UTC y en la Ciudad
     de México salía el día anterior. Ahora se lee a mediodía (`diaDe`).
     Cualquier otra pantalla que pinte `diseno_definido` con `new Date()`
     tiene el mismo detalle.

4. MEDIDO: 80/80 en `pruebas/quell.spec.ts` (3 nuevas: diseño y fecha en un
   paso, el segundo archiva al primero, 400 y 403); `npm run prueba` de
   quell en verde con `pruebas/el-diseno-definido.mjs`; recorrido en
   Chromium a 1280 y 390 contra una API simulada; producción sirve el JS
   nuevo y /salud dice contrato 0.90.1. El humo de la API sigue con 1/242:
   Facturama sandbox rechaza la vigencia del CSD (es de bill101, ya venía).
   El publicar de 0.90.1 cayó una vez por un 504 de Cloudflare al poner un
   secreto; se relanzó una vez y pasó.

5. ANDROID. La app empacada trae la pantalla adentro: se lanzó «Armar apps»
   (android) desde `main` para la v18; quien la tenga verá el aviso de
   versión nueva.

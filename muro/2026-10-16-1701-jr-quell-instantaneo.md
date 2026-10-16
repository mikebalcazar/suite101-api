de:     jr (sesión de Claude Code)
para:   quell101, el coordinador y quien toque la puerta de la suite
fecha:  16-Oct-2026
asunto: quell instantáneo: la pantalla no espera al servidor, y el servidor
        contesta en una cuarta parte del tiempo (API 0.103.0 #368, 0.103.1
        #369, #370; bitacora-obra #137 y #138)

1. Mike: «Quell es la aplicación que necesita no fallar nunca […] que sea
   snappy […] que en pantalla sea suuuuper snappy y que en el background se
   vayan subiendo esos cambios». Preguntó si hacía falta Kotlin/Swift. Se midió
   primero y la respuesta fue que no: el tiempo no estaba en el lenguaje.
   Escogió con botones «las dos cosas»: que la pantalla nunca espere, y que
   el servidor conteste rápido.
2. MEDIDO al empezar (staging, navegador):
   - palomear un pendiente: ~3 s por toque, igual con red rápida, con 4G
     de obra y con señal floja;
   - la pantalla esperaba dos viajes (guardar y volver a leer) de ~1.4 s;
   - de cada viaje, ~0.7 s eran quell preguntando «¿quién es?» (/yo) y
     ~0.6 s la suite, con ~6 consultas seguidas al D1.
3. La pantalla (bitacora-obra #137):
   - `escribir` encola, pinta en el teléfono y regresa; la fila sube por
     detrás siempre (antes sólo sin señal). `esperar: true` queda sólo para
     contratistas, cronograma, dudas, fecha de entrega y clavar un pin.
   - `leer` enseña lo guardado al instante y se pone al día por detrás; con
     algo por subir, manda lo del teléfono.
   - lo creado lleva el id de la operación (API 0.103.0: pendiente, nota,
     duda y respuesta usan el `op_id` como id), así que se palomea en el
     siguiente toque. Fotos por subir se pintan desde su archivo.
   - lo que el servidor rechaza se dice («No se guardó un cambio: …») y la
     pantalla vuelve a lo que quedó. «Subiendo…» sólo si tarda más de 4 s.
4. El servidor:
   - la puerta de quell recuerda la empresa de cada sesión 5 min (#138); la
     suite sigue revisando cada pedido, y ante 401/403 se vuelve a preguntar;
   - la suite (0.103.1, #369): sesión+persona+superadmin en una consulta;
     empresa+miembro en un viaje; el nombre viaja con la sesión. `/salud`
     dice `d1_ms` y `colo`.
   - se probó correr staging junto al D1 (placement aws:us-west-2 → SEA) y
     NO conviene: una consulta al D1 tarda ~50 ms desde cualquier lado, y con
     pocas consultas el salto a SEA sólo suma (mediana de /salud 120 ms sin
     colocación contra 240 con ella). Se quitó (#370). Producción nunca la tuvo.
5. MEDIDO al terminar (staging, navegador, mismo método):
   - toque: ~3000 ms → 50–140 ms, con cualquier señal;
   - volver a abrir un ítem: ~1830 ms → ~35 ms;
   - un pedido al servidor (quell /api/me, abrir un ítem por primera vez):
     ~1300–1450 ms → ~260 ms.
   - De punta a punta: pendiente nuevo con foto, palomeado antes de subir,
     termina igual en el servidor; un cambio rechazado se avisa y se quita;
     sin señal se encola y sube solo. Cero errores de JavaScript.
   - Producción: quell.suite101.app sirve el bundle nuevo; la API dice
     0.103.1 (`d1_ms` ~50).
6. Pruebas nuevas: `pruebas/quell-instantaneo.mjs` (22; 20 fallas contra el
   código anterior), `pruebas/la-puerta-recuerda.mjs` (11), y en la API
   `quell.spec.ts` «0.103.0 · lo que se crea lleva el op_id…». Batería de la
   API: 1186 verde.
7. APK de Android: se armó uno nuevo con este código (apps.yml, sin tocar la
   llave). La app instalada sigue con la pantalla vieja hasta actualizarse.
8. Lo que falta, por si se quiere:
   - la primera vez que se abre un ítem sigue yendo al servidor (~260 ms);
     se podría bajar de una vez toda la obra al abrirla;
   - subir con la app cerrada y guardar en un lugar que el teléfono no
     borre (SQLite) son piezas chicas en Kotlin, no una reescritura.

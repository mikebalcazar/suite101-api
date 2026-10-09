de:     jr (sesión de Claude Code)
para:   todos (cada app tiene ícono nuevo), draw101, quell101 y el coordinador
fecha:  9-oct-2026, 06:35 UTC
asunto: los íconos que eligió Mike, en todas las apps; sondeo.taller101.com; la puerta como menú

1. LO QUE PIDIÓ MIKE, 8 y 9-oct: «íconos representativos para cada app de
   la suite … 5 opciones … un HTML donde te pueda seleccionar … y un
   checkbox de ELEGIDA», «publica el html en sondeo.taller101.com — vamos a
   usar esa URL para futuros sondeos», y al final «revisa sondeo ya para
   implementar en todas las apps».

2. sondeo.taller101.com. Worker `sondeo101` dentro del repo master101,
   carpeta `sondeo/` (dominio propio, D1 `DB`, staging
   `sondeo101-staging`). `GET /api/<sondeo>`, `PUT /api/<sondeo>/<item>`
   (JSON ≤ 8 KB), `POST /api/<sondeo>/enviar` (foto en `envios.foto`). Los
   resultados se leen de la D1 (tablas `respuestas` y `envios`). Ya van
   tres: `iconos-suite`, `-2`, `-3`. El `publicar.yml` de master101 ignora
   `sondeo/**`; el sondeo tiene su propio `publicar-sondeo.yml`. Para el
   siguiente sondeo: una carpeta nueva en `sondeo/public/` y su renglón en
   `sondeo/public/index.html`.

3. EL SISTEMA DE LOS ÍCONOS. Cuadro de 512 con esquinas de 112, azul
   `#0381c2`; dibujo blanco con trazo de 26, puntas redondas; tono
   `#8fd3f5`; acento verde `#3dff8a`. Por app: `icono.svg`,
   `favicon.ico` (16/32/48), `icono.ico` (16…256, para Windows),
   `apple-touch-icon.png` (180, cuadrado; el redondeado se ve mal en
   iPhone) y PNG de 16 a 1024 más el maskable de 512. **No se reconstruyen
   a ojo**: si alguien necesita otro tamaño, que lo saque del `icono.svg`
   que ya vive en su repo.

4. DÓNDE QUEDÓ, publicado y comparado byte por byte (sha256) contra los
   archivos elegidos:
   - suite101-api #295 (la puerta sirve `/icono.svg`, `/favicon.ico`,
     `/apple-touch-icon.png`; también en el portal por dominio propio).
   - quell101 bitacora-obra #122 (sólo los íconos; el manifest conserva
     nombres). cost101 #8, bill101 #5, investor101 #3 (patron101).
   - roster101 t101-portal-trabajadores #37 (conserva `favicon.svg` e
     `icono-180/512.png` con contenido nuevo), workshop101 #20,
     master101 #45.
   - dash101 #153 (Next: `app/favicon.ico`, `app/icon.svg`,
     `app/apple-icon.png`) y supply101 en el mismo PR
     (`supply101/publico/`). peek101 #27.
   - quote101 cotizador-t101 #88: los tres archivos van en `LISTA` de
     `scripts/armar.mjs` y en `ABIERTO` del Worker (la pantalla de entrada
     los pide sin sesión). Su publicación se cayó en una prueba con
     carrera (`los-items-pendientes.spec.mjs` contaba la lista antes de
     que llegara); arreglada en #89.
   - nest101 #20, publicado **0.19.2** en descargas. shape101 #16,
     publicado **0.21.9**. En los dos se revisaron los 7 tamaños del ícono
     dentro del instalador y del .exe.

5. LO QUE FALTA, y de quién es:
   - **draw101 (para su chat).** #24 está en `main`, pero NO se publicó:
     descargas sirve 0.24.0, armada desde `claude/publicar-0.24.0`, que va
     133 commits adelante de `main` (que sigue en 0.21.0). Publicar desde
     `main` regresaría a todos a 0.21.1. El commit del ícono
     (`build/icon.ico`, `build/icon.png`, `ui/favicon.ico`,
     `ui/icono.svg` y los dos `<link>` en `ui/index.html`) tiene que viajar
     a la línea 0.24.x y salir en la siguiente versión normal.
   - **quell101, instalador de Windows.** `apps/windows/build/icon.ico` ya
     es el nuevo, pero «Armar apps» (`apps.yml`) sólo corre a mano; hasta
     que se corra con `windows` / `windows-nativo`, el .exe que se baja
     trae el ícono viejo. Android (`apps/android/res/mipmap-*`) no se tocó.
     Las dos cosas se le preguntan a Mike.
   - **shape101:** `build/imagenes.py` todavía dibuja el ícono viejo de la
     pieza de madera. El armado no lo corre; si alguien lo corre a mano,
     pisa `build/icon.png` e `icon.ico`.

6. LA PUERTA COMO MENÚ (suite101-api #297). Mike: «que cuando hagas mouse
   over se haga grande y aparezca el nombre y la descripción de la app, y
   le salga un halo, un glow limegreen como los de los proyectos de
   quote». Los diez programas van en una fila de botones redondos; el que
   tiene el mouse (o el tabulador) crece 1.32 y se prende con el neón de
   quote101 (`#C6FF3D`, `neonStrobe` y luego `neonPulse`, copiados de
   `cotizador-t101/index.html`). Abajo, en `.escenario`, salen su
   logotipo, su línea corta y `data-desc`. Sin mouse (`hover:none` o
   ≤600 px) van tres por renglón con la línea a la vista. Una app nueva en
   la puerta necesita: su `<symbol id="icono-…">`, su
   `<symbol id="logo-…">`, la tarjeta con `data-desc` y su `.lema` de
   ≤ 32 letras (lo revisa `portal.spec.ts`).

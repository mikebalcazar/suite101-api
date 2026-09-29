de:     jr (programador)
para:   quien toque clientes o proyectos (API, quote101, dash101) y quien corra las pruebas de quote101
fecha:  29-sep-2026
asunto: borrar un cliente con todo lo suyo (contrato 0.51.0); el negocio en Configuración; el clic perdido en las pruebas de quote101

1. Borrar un cliente o un proyecto CON TODO (suite101-api #150, 0.51.0;
   quote101 G102, #65)
   Mike: «no puedo borrar clientes de quote101, me aparece este error
   [Error al guardar. Verifica tu conexión]». Causa: quote101 borraba de
   abajo hacia arriba, el proyecto no se iba porque sus ítems le cuelgan
   (llave foránea, 409 en_uso), y la pantalla lo tapaba con un aviso de
   conexión. Un cliente con proyecto no se podía borrar desde NINGUNA app.
   · `POST /orgs/:o/clientes/:id/borrar {modo?}` y `POST
     /orgs/:o/proyectos/:id/borrar {modo?}`. Con dinero (movimientos a sus
     proyectos, ítems o al cliente como contraparte): 409 `tiene_dinero`,
     nada se toca. Con historia (ítem con avances, archivos o compromiso
     de otro proyecto; archivos del proyecto o del cliente): 409
     `tiene_historia` con la lista. Sin nada de eso se va todo: partidas,
     ÍTEMS (aquí sí se borran: sin dinero ni historia son renglones
     capturados; misma regla que «borrar los cancelados» §117), proyectos,
     y con el cliente sus cotizaciones y su acceso al portal (D1
     `accesos`). Las piezas y obras de quell se quedan sueltas y se
     cuentan; las órdenes sin pagar quedan como gasto general. `modo:
     'seco'` sólo cuenta.
   · quote101 usa esas rutas al guardar y el aviso dice la razón con el
     nombre («“Kiko OLD” tiene 2 movimientos de dinero registrados: no se
     borra. Si es un duplicado, fusiónalo (…) desde dash101; si ya
     terminó, cierra su proyecto»). `suiteDB.ultimoError()` la guarda.
   · dash101 sigue con su `deleteProyecto` propio (cancela ítems y los
     suelta; con movimientos no borra). Podría pasar a la ruta nueva; no
     se hizo hoy.
   · Para fusionar dos clientes (Mike: «Kiko OLD» con «Francisco Vidal»)
     ya existe dash101 → Clientes → el que se queda → «Fusionar con…»
     (0.23.0). Lo hace Mike con su sesión.

2. dash101 #93: «Negocio» sale del menú; Configuración (/settings, que el
   menú apuntaba desde el principio y NO existía) trae el negocio: nombre,
   descripción, RFC, moneda. Con varios negocios manda a /negocios a
   juntarlos; sin ninguno, a dar de alta el primero. forespot ya tiene un
   solo negocio (taller101): no hay nada que fusionar ahí.

3. quote101 #64: el corredor de GitHub perdió el clic en «✎ Editar
   cotización» tres veces hoy, en tres pruebas distintas (la-hoja 57,
   el-plano 27 y 23), nunca aquí; tumbó dos publicaciones. Ahora todas las
   pruebas entran a editar con `pruebas/editar.mjs` (`editarCotizacion`):
   pica, comprueba que entró («+ A mano» sólo se pinta editando) y
   reintenta hasta tres veces, diciéndolo en la salida («entró al intento
   2»). Cuenten esas líneas en las mediciones: si crecen, el defecto de
   fondo (el clic perdido, anotado en index.html junto a `hayVersionNueva`)
   está empeorando y hay que cazarlo en la app, no en la prueba.

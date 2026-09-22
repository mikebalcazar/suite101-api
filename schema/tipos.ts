/* Suite 101 — tipos compartidos
 *
 * UN SOLO ARCHIVO. Las demás apps lo copian tal cual, sin editarlo: si aquí se
 * cambia algo, se vuelve a copiar. No importa nada, no depende de nada, no
 * trae código que corra. Solo tipos y constantes.
 *
 * Tres cosas que este archivo da por sentadas y que no se negocian:
 *
 *   1. El dinero es INTEGER en centavos. $150,000.00 es 15000000. Nunca un
 *      flotante: SQLite no tiene decimal y sumar flotantes pierde centavos.
 *      Se formatea con Fira Sans, cifras tabulares (identidad Taller 101).
 *   2. Ítem y producto son DOS COSAS, y desde el 0.35.0 son dos tablas. Un
 *      ítem es la pieza que se cobra y se sigue en obra —puede ser una
 *      cocina, una visita o un servicio—; un producto es el modelo del
 *      catálogo del que salen varias piezas iguales. Esta regla decía «se
 *      dice ítem, no producto» y era correcta mientras no existía el
 *      catálogo; Mike lo separó el 20-sep-2026.
 *   3. Las fechas son texto ISO 8601 en UTC, en toda la plataforma.
 *
 * Versión del contrato: 0.43.0 (EL REQUERIMIENTO, Y LOS CUATRO TIPOS DE
 * ÍTEM. Mike, 22-sep: «necesito el botón de agregar requerimiento —que es el
 * ítem que apenas se va a aprobar y a cotizar— dentro de quell. Es un nuevo
 * tipo de ítem. Y actualizar los tipos de ítem a: mueble, puerta, acabado,
 * servicio». Y aclarando: «el requerimiento es un tipo de ítem pero que aún
 * está en revisión. Sí aparece en mapa, sí aparece en ítems, pero está
 * pendiente de cotizarse y autorizarse para entrar en producción».
 *   · Los tipos de la obra son Mueble, Puerta, Acabado y **Servicio**, más
 *     **Requerimiento**. Prefijos de código: MW-, PT-, FX-, **SV-** y
 *     **RQ-**. El requerimiento lleva prefijo propio porque es lo que hace
 *     que al mirar un plano impreso se vea qué está pedido y qué vendido.
 *   · `type` sigue siendo texto libre en la columna: un ítem con un tipo
 *     viejo no desaparece ni se renumera. Lo que cambia es la lista que se
 *     ofrece y las reglas que cuelgan de ella.
 *   · **Un requerimiento no entra en producción.** La regla vive en
 *     `marcaEtapa`, que es el cuello por donde pasan los dos caminos que
 *     mueven un ítem —`POST /elements/:id/etapas` y `POST
 *     /elements/:id/fase`—, y contesta 400 con qué hacer: cambiarle el tipo
 *     cuando se apruebe. No es una etiqueta: marcar «comprado» o «fletado»
 *     en algo que nadie cotizó es empezar a gastar en una pieza que el
 *     cliente todavía puede rechazar.
 *   · Y NO se esconde. Un `no_aprobado` en quell sólo sale si pides la vista
 *     de fuera de alcance (regla del 20-sep); un requerimiento sale siempre,
 *     en el mapa y en la lista, que es textual de Mike. Son dos cosas
 *     distintas y conviene no confundirlas.
 *   · Al aprobarse se le cambia el tipo y ya: conserva su pin, su bitácora y
 *     sus fotos. Ésa es la ventaja de que sea un tipo y no otra tabla.
 * Antes: 0.42.0 (supply101 TIENE LLAVE PROPIA. Defecto que
 * reportó Mike el 21-sep: fer@forespot.com abría supply101 y le salía
 * `app_no_permitida`.
 *   · La causa: supply101 mandaba `X-App: dash101` «porque la llave ya está
 *     prendida», y la lista de apps POR PERSONA se aplica con esa llave. Fer
 *     tiene quell, peek, cotizador, roster y nest — no dash.
 *   · Por qué es un defecto y no un ajuste: supply101 se hizo EXACTAMENTE
 *     para quien no entra a dash101 —«quien pide no tiene por qué entrar al
 *     tablero del dinero»—, así que compartir la llave le cerraba la puerta
 *     a la gente para la que se construyó. De las cuatro personas de
 *     Forespot, las dos que la necesitaban eran las dos que no podían
 *     entrar. Compartir una llave es compartir el permiso; aquí los
 *     permisos tenían que ser distintos.
 *   · `supply101` entra en `APPS` con la llave `supply`. Mike escogió con
 *     botones: permiso propio, que se da sin dar `dash`.
 *   · A NIVEL EMPRESA va junto a dash101 —es la otra cara del mismo módulo
 *     de órdenes y no se cobra aparte—: la migración d1/0008 la prende donde
 *     `dash` esté prendido, y una empresa nueva nace con las dos.
 *   · A NIVEL PERSONA son independientes en los DOS sentidos: `supply` sin
 *     `dash` entra a supply101 y no al tablero; `dash` sin `supply` ya no
 *     abre supply101. Lo segundo importa tanto como lo primero: si `supply`
 *     se heredara de `dash`, el defecto volvería para quien sólo pide.
 *     Nadie pierde lo que hoy tiene porque la misma migración le escribe
 *     `supply` a quien traía `dash`, no porque una llave arrastre a la otra.
 *   · Y `PATCH /admin/orgs/:o {apps}` ahora MEZCLA en vez de reemplazar.
 *     Apagar una app siempre fue mandarla en `false`; el UPDATE pisaba el
 *     objeto entero, así que una pantalla que mandara su lista de seis
 *     borraba la llave nueva sin que nadie lo pidiera. Esto deja que una app
 *     futura sobreviva a una pantalla que todavía no la conoce.
 * Antes: 0.41.0 (LA DOCUMENTACIÓN DE CADA ÍTEM, CON
 * VERSIONES QUE NO SE BORRAN. Mike, 21-sep: «necesito en quell un apartado
 * por ítem de documentación. Subir PDF de planos y de anotaciones
 * adicionales. Quiero que ese PDF pueda tener anotaciones (poder anotar
 * desde el cel o la compu cosas encima). Y después poder actualizar ese PDF
 * a una versión nueva, sin borrar la anterior, pero archivarla, o sea que no
 * esté a la vista. Y una opción para ver versiones anteriores por si hay
 * dudas». Y: «hay un archivo base que es el plano o imagen sobre la que
 * están las anotaciones del ítem, sería como el principal, y los demás
 * archivos son de soporte. Sólo en el principal se hacen anotaciones».
 *   · Migración org 0019: `quell_element_docs` y `quell_doc_marcas`.
 *   · UN principal vivo por ítem y UNA versión viva por familia, con dos
 *     índices únicos parciales (`WHERE archivado_at IS NULL`). Archivar no
 *     borra: apaga. La versión vieja sigue completa, con sus marcas, y se
 *     consulta por la familia. Si esto se hubiera dejado en manos de la
 *     pantalla, dos personas subiendo versión a la vez dejaban dos vivas.
 *   · Las marcas son de DOS tipos —`nota` anclada y `trazo` a mano alzada—,
 *     porque Mike escogió «notas y también rayar encima» con botones.
 *     Se guardan RELATIVAS (x, y de 0 a 1, y el trazo igual): un PDF se ve
 *     a un ancho en el celular y a otro en la compu, y una marca en píxeles
 *     habría caído en otro lado en cada pantalla.
 *   · Sólo se anota el principal y sólo si está vivo. Una versión archivada
 *     se consulta, no se escribe: es el registro de lo que se dijo ese día.
 *   · Copiar las marcas al subir versión es una decisión de quien sube
 *     (`copiar_marcas=1`), no del esquema: un plano corregido normalmente
 *     invalida las notas que lo corregían.
 *   · Rutas, todas bajo `/orgs/:o/quell`: `GET|POST /elements/:id/docs`,
 *     `GET /docs/:id/versiones`, `POST /docs/:id/version`,
 *     `POST /docs/:id/archivar`, `GET|POST /docs/:id/marcas`,
 *     `POST /marcas/:id/borrar`. El contratista LEE —es el plano de lo que
 *     va a fabricar— y no sube ni anota.
 *   · Los archivos viven en R2 con el prefijo de la empresa y se borran con
 *     la obra, todas las versiones incluidas: si no, cada corte dejaba
 *     basura pagada por bytes que ya nadie puede abrir.
 * Antes: 0.40.0 (LA FECHA DE ENTREGA, EN LA OBRA Y CON LA
 * CUENTA HECHA. Mike, 21-sep: «hay que agregar un campo en el ítem de fecha
 * de entrega y un contador de cuántos días quedan para la entrega».
 *   · La fecha NO es nueva: `items.fecha_entrega` existe desde la 0001 y se
 *     queda donde está. Una sola fecha para dash101, quell101 y el portal;
 *     dos habría sido la manera segura de que un día no coincidan.
 *   · El detalle del ítem en quell101 la trae (`item_fecha_entrega`), y
 *     `POST /orgs/:o/quell/elements/:id/entrega {fecha}` la fija desde la
 *     obra: quell101 gana `fecha_entrega` en sus campos de escritura.
 *   · `diasParaEntrega` y `faltaParaEntrega` viven en este archivo, no en
 *     cada pantalla: tres apps contando días son tres maneras de que una
 *     diga «faltan 3» y otra «faltan 2». Y la cuenta tiene una trampa real
 *     —una fecha sin hora no tiene zona, y `new Date('2026-10-15')` se lee
 *     en Londres—, así que las dos puntas se anclan a medianoche UTC).
 * Antes: 0.39.0 (EL ESTADO DE CUENTA DE UN PROYECTO, Y CÓMO
 * LLEVA EL IVA CADA OBRA. Mike, 21-sep: «necesito poder exportar un estado
 * de cuenta en pdf y un excel con lo siguiente de cada proyecto: saldo
 * general, lista de productos en proyecto, subtotal, IVA y total de proyecto
 * completo, movimientos de proyecto (pagos), fecha del día que se genera el
 * status. Creo que esto es lo mismo que el cliente podría descargar desde
 * peek101».
 *   · `GET /orgs/:o/proyectos/:id/estado` arma el documento entero: la
 *     lista, el desglose, los pagos y `generado_at` del SERVIDOR. UNA sola
 *     ruta para dash101 y para peek101 —segunda excepción a «un cliente
 *     sólo abre /peek»—, porque dos pantallas armando cada una sus totales
 *     es la manera segura de que un día no cuadren, y el que lo notaría es
 *     el cliente. Un cliente sólo abre el de SU proyecto, comparado contra
 *     la sesión.
 *   · LA LISTA Y EL SUBTOTAL SON LA MISMA CIFRA: los renglones son los
 *     ítems VENDIDOS, que es exactamente lo que suma `precio_venta`.
 *   · SÓLO INGRESOS. Lo que se le paga a un proveedor no viaja en un
 *     documento que abre el cliente.
 *   · EL SALDO ES CONTRA EL TOTAL CON IVA, que es lo que va a pagar. El KPI
 *     de saldo de las otras pantallas es contra `precio_venta` sin IVA: son
 *     dos preguntas distintas y el documento lo dice con letras.
 *   · Migración 0018: `proyectos.tasa_iva` (PUNTOS BASE, 1600 = 16 %) e
 *     `iva_incluido` (0/1). Mike lo escogió con botones el 21-sep —«que lo
 *     diga cada proyecto», con «+ IVA» de arranque— porque adivinarlo pone
 *     un total equivocado enfrente de quien va a pagar, y en su taller
 *     conviven HOLCIM, que pide desglose, y una casa cotizada «con todo».
 *     No mueve un solo peso: sólo dice cómo se LEE `precio_venta`.
 *   · `GET /orgs/:o/proyectos/:id/estado.xlsx` es el mismo documento en
 *     Excel, armado AQUÍ y no en cada pantalla: lo bajan dash101 y peek101,
 *     y dos armadores es la manera segura de que un día no digan lo mismo
 *     —además peek101 no tiene empaquetador, así que una copia allá sería
 *     una copia de verdad—. Dos hojas, ítems y pagos, porque son dos tablas.
 *     Los importes van en PESOS y como NÚMERO: un «$1,234.00» es texto para
 *     Excel, la suma da cero y quien lo abra cree que no le deben nada).
 * Antes:
 * 0.38.0 (BORRAR LO CANCELADO DE UN PROYECTO. Mike,
 * 21-sep: «ya todo lo cancelado lo puedes eliminar por completo». `POST
 * /orgs/:o/proyectos/:id/borrar-cancelados {modo:'seco'|'borrar'}`.
 *   · EL SECO NO ESCRIBE. Contesta el censo exacto —cuáles se van, cuáles se
 *     quedan y qué los detiene— para que la pantalla lo enseñe antes. Borrar
 *     no se deshace; una vista previa que no sea el mismo cálculo que el
 *     borrado no sirve, así que es el mismo código con una bandera.
 *   · NO SE BORRA lo que trae dinero (`movimientos`), historia de obra
 *     (`avances`), un compromiso con proveedor (`partidas`) o un papel
 *     (`archivos`): son llaves foráneas y borrar el ítem dejaría al cobro
 *     sin dueño. Ése se queda y se dice por qué, renglón por renglón.
 *   · LA PIEZA DEL PLANO SOBREVIVE. `quell_elements.item_id` es
 *     `ON DELETE SET NULL` desde la migración 0011: la pieza es de quell101
 *     y no se toca desde aquí; queda sin ítem y se cuenta en
 *     `piezas_sin_item`, porque enterarse después es peor.
 *   · EL PRECIO DE VENTA NO SE MUEVE: un cancelado nunca sumó. Se devuelve
 *     `venta_antes` y `venta_despues` para que se vea, no para que se crea.
 *   · Se van los CANCELADOS y los DESCARTADOS —los dos son `estado =
 *     'cancelado'`—, contados aparte: los descartados no salen en ninguna
 *     pantalla de dash101, así que la cuenta del seco puede ser mayor que lo
 *     que Mike ve en la pestaña, y eso hay que decirlo antes y no después.
 *     El borrado de verdad va por el dueño o la administración). Antes:
 * 0.37.0 (AGRUPAR A UN PRODUCTO QUE YA EXISTE. Mike,
 * 20-sep: «donde dice nombre del modelo debería poderse hacer uno nuevo, o
 * seleccionar agregar a alguno ya existente. Recuerda que al asignarlo a un
 * producto existente, adopta en automático el precio del producto al que se
 * agrupa». `POST /orgs/:o/proyectos/:id/agrupar` acepta `producto_id`: las
 * piezas entran a ese modelo y adoptan su precio, en vez de escribir uno
 * nuevo. El `nombre` y el `precio` del cuerpo se IGNORAN en ese camino —el
 * modelo ya tiene los suyos, y cambiárselos desde la pantalla de juntar
 * movería el importe de sus piezas en otras obras—. La respuesta trae
 * `nuevo: false` para que la pantalla lo diga. Es el caso de HOLCIM: 25
 * puertas del plano a $0 que entran al modelo de $2,850 y suben el precio
 * de venta de la obra; que suba está bien, que suba sin decirlo no).
 * Antes: 0.36.0 (SEPARAR, Y RESCATAR LO QUE LA FUSIÓN BORRÓ.
 * Mike, 20-sep, con HOLCIM enfrente: «ya se hizo un desastre y ahora no puedo
 * separar los ítems para agruparlos en otro producto. O mejor sepárame todos
 * los ítems de puertas otra vez».
 *   · `POST /orgs/:o/items/:id/separar` saca el ítem de su producto —sin
 *     quitarle el precio— y, si el renglón viene de la FUSIÓN del 0.30.0,
 *     devuelve los renglones que aquélla borró: los reconstruye desde
 *     `refs.agrupados` con su id original, su código de obra, su nombre, su
 *     cantidad y su importe, y reparte las piezas del plano por CÓDIGO.
 *   · `POST /orgs/:o/proyectos/:id/separar {producto_id}` hace lo mismo con
 *     todas las piezas de un producto en una obra, en un solo envío.
 *   · EL DINERO NO SE MUEVE: lo que se le resta al renglón que sobrevivió es
 *     lo que se les pone a los reconstruidos. Si no cuadra —porque alguien
 *     le cambió la cantidad después de juntarlos— contesta 409 `no_cuadra`
 *     y NO escribe nada.
 *   · Lo que no vuelve, y se dice: de qué renglón era cada movimiento,
 *     partida y avance. La fusión los mudó al que se quedaba sin anotar de
 *     dónde venían, así que se quedan ahí. Y la etapa vuelve siendo la del
 *     más atrasado, que es con la que se quedó la fusión). Antes:
 * 0.35.0 (EL PRODUCTO DEL CATÁLOGO, Y AGRUPAR DEJA DE
 * FUSIONAR. Mike, 20-sep: «cuando un ítem se asigna a un grupo de ítems que
 * son del mismo producto, el ítem adquiere en automático ese costo. También
 * debe poder moverse de grupo de producto un ítem ya agrupado. Todos los
 * ítems deberían tener un dropdown para seleccionar qué producto es, o nuevo
 * si el ítem es su mismo producto único».
 *   · Tabla `productos`, del NEGOCIO: código de catálogo (único dentro de la
 *     empresa cuando lo tiene), nombre, descripción, tipo y `precio` POR
 *     PIEZA en centavos. Es donde va a vivir el catálogo de quote101.
 *   · `items.producto_id`: NULL = el ítem es su propio producto único, que
 *     es como nacen todos. Entrar a un producto le pone `monto` = precio ×
 *     cantidad y `clave` = el código del producto si lo tiene.
 *   · `POST /orgs/:o/proyectos/:id/agrupar` YA NO BORRA RENGLONES. Antes
 *     fusionaba —21 puertas se volvían un renglón de 21 y los otros 20 se
 *     borraban—, y un renglón borrado no se puede mover de grupo, que es
 *     justo lo que Mike pidió. Ahora escribe el producto y le apunta las
 *     piezas; el cuerpo es {items[], nombre?, codigo?, precio?} en vez de
 *     {queda_id, se_van[]}. Como ya no destruye, dejó de estar reservado a
 *     quien dirige la empresa. Y los estados ya no tienen que coincidir:
 *     cada pieza conserva el suyo.
 *   · `GET /orgs/:o/proyectos/:id/productos` son las opciones del dropdown:
 *     los productos que se usan en la obra y los ítems que todavía son su
 *     propio producto único.
 *   · `POST /orgs/:o/items/:id/producto` {producto_id|desde_item|solo}
 *     cambia de grupo, y devuelve el precio de venta del proyecto antes y
 *     después, porque heredar el costo lo mueve. Salirse NO le quita el
 *     precio a la pieza. `producto_id` no se escribe por PATCH: iría el
 *     apuntador sin el precio). Antes: 0.34.0 (DOS CÓDIGOS, Y NO SE MEZCLAN. Mike,
 * 20-sep: «una cosa es el código de ítem (pieza física en obra) y otra
 * diferente el código de producto de catálogo. Así es como lo vamos a
 * ordenar. Porque más adelante, en quote necesito ir generando un catálogo
 * con códigos de producto. Y cada ítem es un código de producto y puede
 * haber varios ítems del mismo modelo».
 *   · `quell_elements.code` es el código de la PIEZA —PT-01, PT-02—, único
 *     dentro de la obra, y lo pone quell101: sugerido por tipo o tecleado.
 *   · `items.clave` es el código de PRODUCTO, el del modelo en el catálogo.
 *     Veintinueve puertas iguales son veintinueve piezas y UN producto.
 * Así, un producto de quote101 con cantidad 10 llega a quell101 como diez
 * piezas por ubicar —lo que ya hace `/obras/:id/sin-ubicar`—, cada una con
 * su código de obra. `POST /orgs/:o/obras/:id/items` DEJA de unificarlos:
 * ya no copia uno al otro ni pregunta cuál gana (eso era el 0.28.0, hecho
 * con el entendimiento anterior de que eran el mismo dato con dos
 * nombres), `clave` en el cuerpo se acepta y se ignora, y el 409
 * `codigo_en_uso` desaparece de ese camino porque ligar ya no escribe
 * códigos. Unificarlos le ponía a un producto el folio de una de sus
 * piezas, y al ligar la segunda el producto cambiaba de código). Antes:
 * 0.33.0 (LAS 29 PUERTAS DEL MISMO MODELO:
 * `GET /orgs/:o/proyectos/:id/agrupables` agrupa por la FAMILIA del nombre
 * —lo que queda al quitarle el número de la pieza— y ya no por nombre
 * idéntico. Mike, 20-sep, con la pantalla enfrente: «el código sí es
 * diferente por ítem (PT-01, PT-02, PT-03) pero el concepto se puede
 * agrupar porque todas son el mismo modelo de puerta». Una pieza traída
 * del plano se llama «Puerta 01» —con su número, así se dibuja en obra—,
 * así que agrupar por nombre idéntico no encontraba nunca dos iguales. Se
 * quita UN entero corto del final: un «Tablón 0.90» conserva su medida,
 * porque ahí el número ES el producto. El grupo devuelve `nombres` con lo
 * que trae adentro, para que se vea qué se va a juntar antes de juntarlo,
 * y propone el nombre sin el número tal como se escribió. Y su otra idea
 * —«un ítem/código puede tener varias instancias derivadas del ítem
 * modelo»— es lo que ya sostiene esto: el concepto con `cantidad` es el
 * modelo, y las piezas del plano son las instancias, cada una con su
 * código y su bitácora). Antes:
 * 0.32.0 (LA RAYA SE ARMA CON LOS EXPEDIENTES DE
 * roster101. `GET /orgs/:o/nomina/trabajadores` lista `roster_trabajadores`
 * —la lista larga: quién es cada quien, la que llena roster101 y llena el
 * propio trabajador— diciendo en cada renglón si ya tiene su lugar en
 * `personal`, y `POST /orgs/:o/nomina/gente/de-roster {roster_id}` se lo
 * abre, LIGADO por `expediente_ref`. Mike, 20-sep: «en la sección de raya
 * de dash debo poder escoger a quién se le paga de la lista de los
 * trabajadores en roster101, no en la de dash». La raya pagaba contra
 * `personal` —la lista corta, la de quién tiene permisos— y en una empresa
 * que lleva expedientes esa lista está vacía: parecía que no había a quién
 * pagarle. No se paga directo contra el expediente porque `raya_pagos`
 * apunta a `personal`, y esa fila es donde vive el permiso; la liga impide
 * que escoger dos veces al mismo le abra dos renglones y la raya le pague
 * doble. Un expediente en borrador sale con su correo por nombre: la
 * mayoría lo están el día que hay que pagarles. El alta a mano sigue, para
 * quien paga sin llevar expedientes). Antes:
 * 0.31.1 (EL ALCANCE DEL ÍTEM: lo que está dentro, lo
 * que todavía no está aprobado y lo que ya se canceló. `POST
 * /orgs/:o/items/:id/aprobar` y `POST /orgs/:o/items/:id/cancelar {motivo?}`,
 * que abren dash101 y quell101 por igual —«se debe poder cancelar algún ítem
 * ya sea desde quell o desde dash, y se refleja en los 2», Mike, 20-sep—.
 * La migración 0016 agrega `items.aprobado_at`, `cancelado_at` y
 * `cancelado_motivo`, y de la primera sale la regla que él puso con todas
 * sus letras: «para que un ítem se considere cancelado tiene que haber
 * estado aprobado primero». Son cuatro casos y los resuelve `alcanceDeItem`,
 * en este mismo archivo: dentro (vendido), no aprobado (cotizado —el
 * requerimiento, que tiene precio y NO suma—), cancelado (estuvo aprobado) y
 * descartado (nunca lo estuvo). No se agrega un estado nuevo a propósito: el
 * CHECK de `items.estado` obligaría a rehacer la tabla con cuatro tablas
 * colgando de ella, y «no aprobado» ya existía y se llama cotizado. El motor
 * de quell101 devuelve `alcance` en cada pieza del plano, para que la obra
 * pueda esconder lo que está fuera; una pieza sin ítem va dentro. Y
 * `quell101` gana permiso de escribir `items.estado`, que es lo que esas dos
 * rutas mueven. Y cada ítem viaja con `alcance` YA CALCULADO —no es
 * columna: se calcula al salir y no se puede escribir desde fuera—, para
 * que ninguna pantalla vuelva a deducirlo de dos campos. Y los CINCO CAMPOS
 * del ítem —código, nombre, precio, descripción y tipo, Mike 20-sep— quedan
 * en las tres apps: el detalle de una pieza en quell101 trae ya la
 * descripción del ítem, y el precio SÓLO para dueño, administración y
 * socios —decisión de Mike del 20-sep—, recortado en el servidor y no al
 * pintar: lo que viaja se lee). Antes:
 * 0.30.0 (VARIOS ÍTEMS IGUALES, UN SOLO CONCEPTO, y la
 * PARTIDA del ítem. `GET /orgs/:o/proyectos/:id/agrupables` propone qué
 * renglones son el mismo producto capturado varias veces —mismo nombre,
 * tipo, estado, moneda y precio POR PIEZA— y `POST .../agrupar
 * {queda_id, se_van[], nombre?}` los junta: la cantidad y el importe se
 * suman, las piezas del plano, los movimientos, las partidas y los avances
 * se mudan al que se queda, y los demás renglones se borran. El precio de
 * venta del proyecto NO se mueve: `monto` es el importe de la línea, así que
 * el del concepto es la suma (Mike, 20-sep: «son varias puertas iguales en
 * diferente ubicación pero el producto es el mismo, y no tiene caso tener 21
 * ítems idénticos enlistados en dash»). La etapa que queda es la del más
 * atrasado, y la `clave` sólo si todos traían la misma: un código nombra UNA
 * pieza del plano. Por lo mismo, al emparejar (0.28.0) un ítem de cantidad
 * mayor que uno ya NO unifica código con la pieza —antes se quedaba con el
 * de la última ligada, que era arbitrario—. Y la migración 0015 agrega
 * `items.partida` y `items.orden`, con `POST .../acomodar` para mandarlos en
 * un solo envío: la partida es el capítulo de la cotización —Cocina,
 * Recámaras—, que NO es la tabla `partidas`, la de los compromisos con
 * proveedores. Y desde el plano (`POST /orgs/:o/obras/:id/items`) se puede
 * cerrar el renglón en un paso: `crear` acepta `{element_id, monto,
 * descripcion, nombre}` y con precio el ítem nace VENDIDO —sin precio sigue
 * naciendo cotizado y en cero—, y `ligar` acepta `sumar: true`, que en vez
 * de 409 `sin_cupo` sube en uno la cantidad del concepto y le agrega el
 * precio de una pieza, dejando huella del cambio de precio en la bitácora
 * («una puerta más a las 14 ya existentes del mismo modelo»). Sin `sumar`
 * el 409 se mantiene: crecer mueve dinero. Encargos de Mike del 20-sep).
 * Antes:
 * 0.29.0 (el ESTADO DE CUENTA de un cliente:
 * `GET /orgs/:o/clientes/:id/estado-de-cuenta` contesta qué se le vendió,
 * qué pagó y qué debe, global y por proyecto, con los cobros de cada uno.
 * No es `/peek`: aquél es lo que el cliente ve de sí mismo y sus pagos
 * salen de un JOIN contra proyectos, así que un anticipo suelto no aparece
 * —en un documento que se manda, ese hueco es la diferencia entre cuadrar y
 * no—. Todo sale de UNA sola lista de cobros y los totales se suman de
 * ella, así el saldo global es por construcción la suma de los renglones
 * que se enseñan. Lo abre quien es de la empresa; un cliente ve lo suyo por
 * peek101, recortado. Encargo de Mike del 20-sep). Antes:
 * 0.28.0 (emparejar los ítems A MANO, y el CÓDIGO como
 * identidad. `GET /orgs/:o/obras/:id/items` agrega `candidatos`: todos los
 * ítems que todavía admiten una pieza, con su cupo, para que la pantalla
 * ofrezca un desplegable en vez de sólo aceptar o rechazar lo que el
 * parecido adivinó. `POST` acepta en cada `ligar` un `clave` —qué código
 * gana cuando los dos lados traen uno distinto— y un `nombre` opcional.
 * El código queda IGUAL EN LOS DOS LADOS: es lo que nombra a la misma pieza
 * en las dos apps (Mike, 20-sep: «lo que va a ser lo mismo es el código de
 * ítem, ej. CAR-01, PT-09, porque el nombre descriptivo viene en el detalle
 * de dash y en el detalle de quell»). Cuando sólo un lado trae código se
 * copia sin preguntar; cuando los dos traen y difieren, sin `clave` no se
 * toca ninguno. El nombre NO se unifica solo, y si se escoge queda en los
 * dos lados. El cupo se revisa AL APLICAR y no sólo al proponer, porque
 * emparejando a mano se puede escoger tres veces el mismo ítem de cantidad
 * 1; 409 `sin_cupo`. Y 409 `codigo_en_uso` cuando el código que ganaría ya
 * lo trae otra pieza de esa obra, con cuál es). Antes:
 * 0.27.0 (la RAYA: lo que se le paga a la gente, y su
 * recibo. `/orgs/:o/nomina/*` con las tablas `rayas` y `raya_pagos`
 * (migración 0014). Un corte nace en borrador, se corrige, y al pagarlo deja
 * UN EGRESO POR PERSONA de una sola vez —no uno global: el estado de cuenta
 * tiene que decir a quién se le pagó—. Pagada NO se reescribe ni se cancela:
 * ese dinero ya salió, y lo que se corrige es el movimiento. El neto y el
 * total los calcula el servidor, como `precio_venta`. El nombre se congela
 * en el renglón, porque un recibo dice a quién se le pagó ESE DÍA. Alcance
 * escogido por Mike el 20-sep: pagos y recibos, NO nómina calculada —sin
 * IMSS, sin ISR, sin CFDI de nómina—, porque una retención mal calculada se
 * descubre en una auditoría y con multa. El permiso es `personal.es_nominas`,
 * aparte de `es_contador` —pagarle a un proveedor y saber cuánto gana cada
 * quien son dos cosas—, lo reparte sólo el dueño y queda apuntado en
 * `orden_eventos`, que gana la clase 'nominas'. `POST /nomina/gente` da de
 * alta a quien no está en roster101, sin abrirle `personal` a dash101 en el
 * CRUD). Antes:
 * 0.26.0 (los ítems de una obra y los de su proyecto
 * son la misma lista de piezas: `GET /orgs/:o/obras/:id/items` PROPONE cómo
 * emparejarlas —por código primero, que es único en la obra, y por nombre
 * después— sin tocar nada, y `POST` con `{ligar, crear}` aplica lo que se
 * aceptó. Se hace en dos pasos porque emparejar por parecido acierta casi
 * siempre y la vez que falla le cuelga el dinero de una pieza a otra. Un
 * ítem traído del plano nace COTIZADO y en cero: nacer «vendido» en cero
 * metería una venta que nadie tecleó en `precio_venta`. Y el precio de un
 * ítem deja huella en la bitácora de cada pieza que lo cumple:
 * `quell_log_entries` gana `kind='precio'` y admite `user_id` NULL
 * —«lo escribió el sistema»— con la migración 0013, porque atribuirle a una
 * persona de la obra un cambio hecho en dash101 es una mentira que se lee
 * como verdad tres meses después. Encargo de Mike del 20-sep). Antes:
 * 0.25.0 (un INGRESO también puede estar pendiente de
 * facturar. `movimientos.requiere_factura` (migración 0012) dice que se
 * espera una factura; `facturado` dice que ya llegó. Son cosas distintas y
 * ninguna escribe a la otra: pendiente es la conjunción. Antes la espera
 * salía de `ordenes.con_factura`, así que `GET /orgs/:o/fiscal/pendientes`
 * empezaba con un JOIN contra `ordenes` y un ingreso —que no tiene orden de
 * compra— no podía salir ahí nunca. Ahora el JOIN es LEFT, la ruta acepta
 * `?tipo=ingreso|egreso`, y la 0012 le pone la espera a los pagos de órdenes
 * que hoy están pendientes para que esa lista no cambie de contenido. La
 * factura se cuelga con la tabla `archivos` de siempre, sin columna nueva).
 * Antes: 0.24.3 (una lista que YA pregunta por un proyecto o
 * por un cliente no se acota sola al negocio de quien pregunta. El relleno
 * de «un negocio a la vez» sigue en pie para las listas de toda la empresa,
 * que es donde sirve; pero un proyecto es de un solo negocio, así que con
 * `proyecto_id` puesto el negocio ya quedó decidido y rellenarlo con otro no
 * acota: deja la lista VACÍA, con 200 y sin una sola seña. Ése era el
 * defecto que Mike reportó cuatro veces: «Sin ítems» en pantalla con el
 * precio de venta correcto al lado, y antes de eso los ítems duplicándose al
 * guardar, porque la lista de vivos volvía vacía y todo parecía nuevo).
 * Antes: 0.24.2 (una lista se puede pedir más larga con
 * `?limite=`, hasta 5,000 filas. Sin el parámetro nada cambia: siguen siendo
 * 500. Existe porque el tope no avisaba y `total` —que sí venía desde
 * siempre— nadie lo miraba: dash101 pedía los ítems de un proyecto sin
 * filtrar el estado, los cancelados viejos llenaban las 500 y los vivos
 * recientes se caían de la vista. La pantalla decía «sin ítems» y el precio
 * de venta seguía en su cifra, que era la correcta: ese lo suma la API en la
 * base, no la pantalla. Quien liste para decidir «esto ya existe» tiene que
 * comparar `total` contra las filas que le llegaron). Antes:
 * 0.24.1 (`POST /orgs/:o/items/exportar` acepta
 * `cantidad` por línea. quote101 cotiza «× 20» desde siempre —su total ya
 * viene multiplicado— y ese 20 no cruzaba a la suite: se exportaba un
 * renglón de 20 puertas que valía por una sola pieza, y en quell101 había
 * una sola que ubicar. Sin `cantidad`, 1, como todo lo demás). Antes:
 * 0.24.0 (la cantidad del ítem y los «ítems sin
 * ubicar»: `items.cantidad` (migración 0011, por omisión 1) dice cuántas
 * piezas iguales son —«20 puertas del mismo acabado y precio»—, y
 * `quell_elements.item_id` dice qué pieza del plano cumple cuál ítem
 * vendido. `monto` NO cambia de significado: sigue siendo el importe de la
 * línea, porque `proyectos.precio_venta` es su suma y cambiarlo movería el
 * precio de todos los proyectos que ya existen; el precio por pieza sale de
 * dividir. `GET /orgs/:o/obras/:id/sin-ubicar` devuelve los ítems vendidos
 * del proyecto de esa obra con cuántas piezas faltan por poner en un plano
 * —la cuenta la hace el servidor, no la pantalla—, y al crear una pieza en
 * `POST /orgs/:o/quell/plans/:id/elements` se puede mandar `item_id`, que se
 * revisa contra el proyecto ligado a esa obra. Lo pidió Mike el 20-sep).
 * Antes: 0.23.0 (el cliente es uno solo en las tres apps:
 * `GET /orgs/:o/clientes/parecidos?nombre=&negocio_id=` contesta «¿no te
 * refieres a…?» con la regla escrita UNA vez y en el servidor —mismo nombre
 * normalizado, o uno contenido en el otro, y menos de tres letras no
 * compara—, y `POST /orgs/:o/clientes/:id/fusionar {se_va_id}` junta los dos
 * que ya se crearon: el que se va le deja al que se queda sus proyectos,
 * ítems, cotizaciones y movimientos, más los datos que al que se queda le
 * falten —correo, teléfono, RFC, notas y el acceso al portal—, y después
 * desaparece. Todo o nada, adentro del objeto. Fusionar no se deshace, así
 * que la hacen el dueño y la administración. Lo pidió Mike el 20-sep). Antes:
 * 0.22.0 (la obra de quell101 y el proyecto de dash101
 * son la misma casa: `quell_projects.proyecto_id` (migración 0010 del OrgDB)
 * y las rutas `/orgs/:o/obras` —con `?sueltas=1`, las que todavía no tienen
 * proyecto—, `/orgs/:o/obras/de-proyecto/:id` y
 * `POST|DELETE /orgs/:o/obras/:id/ligar`. Hasta hoy la misma casa se
 * capturaba dos veces, una en cada app, y ninguna sabía de la otra. La
 * columna va del lado de quell101 y no en `proyectos`, que sale por el CRUD
 * genérico: la liga se pone y se quita donde el permiso se revisa. Un índice
 * único parcial impide que un proyecto tenga dos obras, porque entonces «el
 * avance del proyecto» tendría dos respuestas ciertas. Si el proyecto se
 * borra, la obra NO se borra: queda suelta (`ON DELETE SET NULL`), porque
 * tiene planos, fotos y bitácora de gente que estuvo ahí. Lo pidió Mike el
 * 20-sep). Antes: 0.21.4 (`GET /orgs/:o/ordenes/:id` devuelve también
 * los archivos del pago —el comprobante, que cuelga del movimiento— junto
 * con los de la orden, y cada uno dice de dónde viene en `de`: `orden` o
 * `pago`. Quien pidió la compra necesita el comprobante para reclamarle al
 * proveedor, y sin esto tendría que ir a buscarlo a otra tabla que no le
 * toca. Lo pidió Mike el 20-sep al encargar supply101).
 * Antes: 0.21.3 (lo fiscal también acepta `?negocio_id=`:
 * `/fiscal/iva`, `/fiscal/cuadre`, `/fiscal/pendientes` y `/fiscal/cfdi`. El
 * RFC vive en el negocio, así que un IVA del mes que sume dos negocios no es
 * el IVA de ninguno de los dos —y es el número con el que se entera al SAT—.
 * Sin el parámetro salen las cifras de toda la empresa, como antes).
 * Antes: 0.21.2 (`GET /orgs/:o/ordenes` y
 * `/orgs/:o/ordenes/buzon` aceptan `?negocio_id=`, y con él la lista Y SUS
 * TOTALES son de ese negocio. dash101 trabaja con un negocio activo a la
 * vez; sin el filtro, el buzón mezclaba los negocios de la empresa y el
 * «hay por pagar» de arriba sumaba dinero de otro lado sin decirlo).
 * Antes: 0.21.1 (quien abre una empresa como dueño sin ser
 * miembro de ella —el superadmin de la suite, que es de Taller 101— sale en
 * `GET /orgs/:o/ordenes/contadores` y se puede marcar a sí mismo. Sin esto,
 * en una empresa recién dada de alta la pantalla salía vacía y no había
 * quién pagara: lo cachó el humo contra staging, no las pruebas).
 * Antes: 0.21.0 (órdenes de compra y contabilidad fiscal, el
 * encargo del chat de dash101 del 19-sep. Migraciones 0008 y 0009 del OrgDB.
 *
 * Órdenes: cualquiera de la empresa pide una compra y cae directa al buzón
 * del contador —sin autorización previa—; al marcarla pagada se crea el
 * egreso, se liga, se recalculan los cachés del proyecto y de la partida, y
 * se le avisa por correo a quien la pidió. Todo eso en UNA transacción, y
 * una orden que no está en el buzón no se paga: es lo que impide el doble
 * egreso de un doble clic. `POST /orgs/:o/ordenes`, `GET` (sólo las mías),
 * `/ordenes/buzon`, `/ordenes/:id/pagar|devolver|rechazar`, `PATCH` para
 * corregir una devuelta (mismo folio, misma historia) y
 * `/ordenes/contadores` para repartir la etiqueta, que sólo el dueño toca.
 * El proyecto es opcional (gasto general); con proyecto se liga a una
 * partida existente o se crea una nueva.
 *
 * Fiscal: NO hay dos contabilidades. Una sola lista de movimientos y cada
 * uno dice si es `facturado`; la fiscal es esa lista filtrada. Tabla `cfdi`
 * con UUID único por empresa y una liga con monto aplicado, porque un CFDI
 * puede cubrir varios pagos y un pago varios CFDI. La factura casi siempre
 * llega DESPUÉS del pago, y por eso se le cuelga al movimiento que ya
 * existe. `GET /orgs/:o/fiscal/iva|cuadre|pendientes|cfdi` y sus POST.
 *
 * Las cuatro tablas nuevas NO salen por el CRUD genérico: un miembro tiene
 * que ver sólo SUS órdenes, y ese filtro no se puede expresar ahí. `tasa_iva`
 * va en puntos base (1600 = 16.00 %). Decisiones de Mike del 19-sep).
 * Antes: 0.20.0 (la licencia se abre con tu cuenta:
 * `POST /licencias/mia {programa, huella, version}` activa, con la sesión de
 * la suite y SIN clave tecleada, la licencia que va con el correo de quien
 * entró. Devuelve el mismo token firmado que `/activar`, porque la regla de
 * quién entra tiene que ser una sola. Con varias licencias suyas vigentes
 * gana la que ya tiene esa máquina activada y si no la primera con lugar
 * libre, para no gastar un lugar de más; si no hay ninguna vigente contesta
 * el motivo de la que venció más tarde, no el de la primera. `GET
 * /licencias/entrar?programa=&huella=&app=` es la pantalla que la app abre
 * en su propia ventana: la entrada homologada de la suite, y al terminar
 * deja el token en `window.__t101_licencia` y el fragmento en `#listo` —el
 * token nunca viaja en la dirección—. La clave tecleada NO se va: sigue
 * siendo la segunda forma, por las máquinas sin internet estable, las claves
 * ya repartidas y la App Store. Decisiones de Mike del 19-sep, con botones).
 * Antes: 0.19.0 (el tipo de licencia y lo perpetuo, que son
 * dos cosas: `suscripciones.tipo` dice de dónde salió —cortesia, suite101,
 * stripe, appstore— y la columna que se llamaba `cortesia` ahora se llama
 * `perpetua`, que es lo que siempre quiso decir: sin fecha de corte. Así una
 * perpetua comprada en la App Store sigue contando como de App Store al
 * filtrar, que es justo lo que se perdía con una sola lista. `GET /licencias`
 * filtra por `tipo`, `programa`, `correo` y `vigentes=1`, y devuelve
 * `por_tipo` con cuántas hay de cada uno SIN el filtro de tipo puesto, para
 * pintar los botones. Un tipo fuera de la lista es 400, no una lista vacía.
 * `POST /licencias/:id/pago` con `origen: 'stripe'` pone `tipo = 'stripe'`
 * solo, para que el día de la pasarela la lista se llene sin que nadie la
 * toque; un pago a mano no cambia el tipo. Decisión de Mike del 19-sep, con
 * botones). Antes: 0.18.0 (se van las dos mudanzas: `POST
 * /admin/mudar-quell` y `POST /admin/mudar-roster` ya no existen, y con ellas
 * los enlaces a la D1 y al bucket viejos de cada app (`QUELL_D1`, `QUELL_R2`,
 * `ROSTER_D1`, `ROSTER_R2`). Las dos ya se corrieron en producción el 19-sep
 * y cuadraron; la base vieja se retira, así que una ruta que lee de ella no
 * tendría de dónde traer. `GET /admin/orgs/:o/quell` y `GET
 * /admin/orgs/:o/roster` se quedan: cuentan lo que hay en la base de la
 * empresa, que es de donde se leen los conteos del panel. Quitar una ruta es
 * un cambio de contrato aunque nadie más la llamara, por eso sube la menor.
 * Decisión de Mike del 19-sep). Antes: 0.12.0 (la sesión la decide QUIÉN entra, no con qué
 * entró: `vidaDe` en `maestro.ts`. Quien tiene un `acceso` activo —un cliente
 * de peek101, alguien de obra en quell101— trae 12 horas; un socio o la
 * oficina, 30 días, por los cuatro caminos. Antes la decidía el camino, y eso
 * dejaba un hueco abierto: el camino que de verdad usan los clientes de
 * peek101 es el código al correo, así que un cliente ya se estaba llevando 30
 * días; las 12 horas sólo se cumplían por el PIN. Al homologar la entrada a
 * Google o contraseña —encargo de Mike del 16-sep— amarrarla al camino habría
 * vuelto el hueco la regla, porque nadie entraría ya por el único camino
 * corto. De paso, la galleta de `/auth/canje` dura lo que dura la sesión y no
 * 30 días fijos, y un boleto cuya sesión ya murió no entra). Antes: 0.11.0
 * (consecutivos por serie: `POST
 * /orgs/:o/folios/:serie` aparta el siguiente número de una serie y `GET` lo
 * mira sin consumirlo, con el mismo contador atómico del OrgDB que ya pone el
 * folio de la cotización. Es para los consecutivos que todavía se calculaban
 * en el navegador —el de los recibos de quote101—, donde dos personas
 * guardando a la vez se llevaban el mismo número. La serie `COT` no se aparta
 * por ahí: ésa la pone la creación de la cotización. Y `cotizador101` puede
 * crear el negocio de su empresa si no hay ninguno, porque
 * `cotizaciones.negocio_id` es obligatorio y si no quedaría trabado). Antes:
 * 0.10.0 (los ajustes de cada app: la tabla `ajustes`
 * guarda la configuración de una app dentro de una empresa —lo que no describe
 * al negocio sino a cómo esa app trabaja—. El `id` lo arma la API con `X-App`
 * (`app:clave`), así que una app no lee ni pisa los de otra, no puede haber dos
 * con la misma clave, y el POST hace upsert: guardar es una sola llamada. Hacía
 * falta para que quote101 pudiera dejar Firebase: sus clientes y cotizaciones
 * ya tenían tabla, su configuración y su lista de precios no). Antes:
 * 0.9.0 (el folio de la cotización lo asigna la suite:
 * `POST /orgs/:o/cotizaciones` devuelve `folio` con formato `COT-` y seis
 * dígitos, asignado dentro del OrgDB —atómico, porque es un Durable Object de
 * un solo hilo— y ya no calculado en el navegador. Una app no puede imponer su
 * folio: si lo manda, se le ignora; sólo `suite101` puede, y es para que la
 * mudanza traiga los viejos congelados. Un índice único en la base impide dos
 * folios iguales). Antes:
 * 0.17.0 (roster101 vive en la base de la empresa: la migración 0007 del
 * OrgDB trae sus siete tablas con prefijo `roster_`, y el motor de los
 * expedientes —el mismo código que corría en el Worker de roster101—
 * atiende en `/roster/:o/api/*`. Esa puerta es nueva y distinta de
 * `/orgs/:o/*`: el trabajador entra sin cuenta en la suite (correo y
 * código, cookie propia firmada con el secreto de la suite), y el panel de
 * la empresa entra con su sesión de la suite, que la puerta resuelve si
 * viene. El dueño y la administración de la empresa abren el panel como
 * dueños aunque no tengan renglón en él. `GET /admin/orgs/:o/roster` cuenta.
 * La central de roster101 se retira: el alta va por master101. Decisiones
 * de Mike del 19-sep). Antes:
 * 0.16.0 (quell101 vive en la base de la empresa: la migración 0006 del
 * OrgDB trae sus catorce tablas con prefijo `quell_`, y el motor de la
 * bitácora de obra —el mismo código que corría en el Worker de quell101—
 * atiende en `/orgs/:o/quell/*` con la sesión que resolvió la puerta. Un
 * cliente abre, además de /peek, lo que quell101 le recorta. `POST
 * /admin/mudar-quell {org, modo}` trae la D1 y el bucket viejos. Decisión
 * de Mike del 19-sep: todo lo de una empresa en su base de la suite). Antes:
 * 0.15.0 (invitar a un cliente desde una app con base propia:
 * `POST /orgs/:o/clientes/invitar {correo, nombre}` deja al cliente en la
 * base de la empresa si no estaba, crea la persona en la suite si no existía
 * y le pone acceso tipo cliente, sin PIN: entra con el código al correo y
 * pone su contraseña. 409 `es_miembro` si el correo es de alguien de la
 * empresa, 409 `en_uso` si ya es cliente o personal de otra. Lo pide la cara
 * de cliente de quell101; peek101 abre con la misma cuenta). Antes:
 * 0.13.0 (licencias por suscripción, base /licencias: la app activa con
 * clave + huella y late a diario; recibe un token firmado Ed25519 cuya llave
 * pública sirve GET /licencias/llave; el panel (superadmin) crea claves, marca
 * pagos, sube lugares, suspende; hay cortesías sin fecha y no hay periodo de
 * prueba. Decisiones de Mike del 18-sep-2026). Antes:
 * 0.8.0 (la puerta de las apps empacadas: quien entra
 * con `{ aparato: true }` recibe además `token`, la misma galleta firmada, y
 * puede volver con `Authorization: Bearer`. Es la misma sesión de D1 y el
 * mismo DELETE la mata; al navegador se le sigue dando sólo la cookie).
 * Antes:
 * 0.7.0 (contraseña de verdad junto al código, el PIN y
 * Google: POST /auth/clave la fija, /auth/entrar la acepta, y cambiarla pide
 * la actual salvo que la sesión venga de código o de Google). Antes:
 * 0.6.0 (workshop101 — el administrador de la empresa:
 * PATCH de rol y apps por miembro, candados de último dueño y de uno mismo,
 * la lista de apps por persona se aplica en la puerta, última entrada por
 * miembro, y la bitácora de la empresa la lee su dueño). Antes:
 * 0.5.0 (master101 — superadmins por ruta, la bitácora
 * del panel `bitacora_admin`, y conteos por empresa en GET /admin/orgs; nada
 * de lo de 0.4.0 cambia)
 */

export const VERSION_CONTRATO = '0.43.0';

/* ─────────────── licencias por suscripción (0.13.0) ─────────────── */

export type EstadoSuscripcion = 'activa' | 'suspendida';
export type OrigenPago = 'manual' | 'stripe';

/** De dónde salió la licencia. NO dice si vence: eso es `perpetua`, aparte,
 *  para que una perpetua comprada en la App Store siga contando como de App
 *  Store al filtrar (decisión de Mike, 19-sep-2026, con botones).
 *
 *  · cortesia — regalada, no la pagó nadie.
 *  · suite101 — va incluida en lo que la empresa ya paga por la suite.
 *  · stripe   — la cobró la pasarela.
 *  · appstore — la cobró la tienda de Apple (para cuando haya versión de Mac).
 *
 *  Es una lista cerrada a propósito: un tipo escrito a mano («Stripe», «strype»)
 *  rompe el filtro sin avisar. Agregar uno es una línea aquí y otra en la API. */
export const TIPOS_LICENCIA = ['cortesia', 'suite101', 'stripe', 'appstore'] as const;
export type TipoLicencia = (typeof TIPOS_LICENCIA)[number];

/** Cómo se llama cada tipo en pantalla. */
export const NOMBRE_TIPO_LICENCIA: Record<TipoLicencia, string> = {
  cortesia: 'Cortesía',
  suite101: 'Incluida en suite101',
  stripe: 'Pago por Stripe',
  appstore: 'App Store',
};

export interface Suscripcion {
  id: string;
  /** T101-XXXX-XXXX-XXXX. Es lo que el cliente teclea al instalar. */
  clave: string;
  programa: string;
  cliente: string;
  correo: string | null;
  plan: string;
  /** Máquinas activas a la vez. Mike lo sube por cliente desde master101. */
  lugares: number;
  estado: EstadoSuscripcion;
  origen: OrigenPago;
  /** De dónde salió: cortesía, incluida en suite101, Stripe o App Store. */
  tipo: TipoLicencia;
  /** 1 = no vence nunca. Hasta 0.18.0 esta columna se llamaba `cortesia`, que
   *  era el nombre equivocado: siempre significó «sin fecha de corte», y una
   *  perpetua puede estar pagada. Lo regalado lo dice `tipo`. */
  perpetua: 0 | 1;
  /** 'AAAA-MM-DD', último día pagado. null = nunca ha pagado. */
  paga_hasta: string | null;
  notas: string | null;
  creado_at: string;
  actualizado_at: string;
}

export interface Activacion {
  id: string;
  suscripcion_id: string;
  huella: string;
  version: string | null;
  alta_at: string;
  ultimo_latido_at: string;
  activa: 0 | 1;
}

export interface RenglonBitacoraLicencia {
  id: number;
  cuando: string;
  suscripcion_id: string | null;
  quien: string;
  accion: string;
  detalle: string | null;
}

/** Lo que va dentro del token `v1.<carga>.<firma>` (Ed25519). */
export interface TokenLicencia {
  v: 1;
  kid: string;
  programa: string;
  licencia: string;
  cliente: string;
  plan: string;
  lugares: number;
  /** La huella de la máquina que lo pidió. Otro equipo no lo puede usar. */
  maquina: string;
  emitido: string;
  hasta: string;
}

/* ─────────────── envoltura de toda respuesta ─────────────── */

export type Respuesta<T> = { ok: true; data: T } | { ok: false; error: string; detalle?: unknown };
export type Lista<T> = { total: number; filas: T[] };

/** Errores que devuelve la API, en snake_case. La app puede prender por ellos. */
export type ErrorApi =
  | 'sin_sesion'
  | 'sin_permiso'
  | 'sin_app'
  | 'app_desconocida'
  | 'app_inactiva'
  | 'campo_no_permitido'
  | 'campo_solo_por_etapa'
  | 'etapa_no_permitida'
  | 'tabla_desconocida'
  | 'no_encontrado'
  | 'datos_invalidos'
  | 'dinero_no_entero'
  | 'org_desconocida'
  | 'org_inactiva'
  | 'org_sin_pago'
  | 'correo_no_configurado'
  | 'google_no_configurado'
  | 'codigo_invalido'
  | 'pin_invalido'
  | 'demasiados_intentos'
  | 'items_nunca_se_borran'
  | 'ultimo_superadmin'
  | 'ultimo_owner'
  | 'clave_invalida'
  | 'clave_debil'
  | 'app_no_permitida'
  // licencias (0.13.0)
  | 'clave_inexistente'
  | 'licencia_desconocida'
  | 'sin_pago'
  | 'sin_lugares'
  | 'suspendida'
  | 'token_invalido'
  | 'maquina_desconocida';

/* ─────────────── apps ─────────────── */

export const APPS = [
  'dash101',
  /* supply101 es la CARA DE EMPLEADO del módulo de órdenes de dash101, y
   * tiene llave propia desde el 21-sep-2026. Hasta ese día mandaba
   * `X-App: dash101` «porque ya está prendido», y eso resultó ser el defecto
   * justo: la lista de apps por persona se aplica con esa llave, así que la
   * app que se hizo para quien NO entra al tablero del dinero le cerraba la
   * puerta a exactamente esa gente. Compartir una llave es compartir el
   * permiso, y aquí los permisos tenían que ser distintos. */
  'supply101',
  'quell101',
  'peek101',
  'cotizador101',
  'roster101',
  'nest101',
  'master101',
  'workshop101',
  'suite101',
] as const;
export type App = (typeof APPS)[number];

/** La llave con la que cada app aparece en `orgs.apps`. */
export const LLAVE_APP: Record<App, string> = {
  dash101: 'dash',
  supply101: 'supply',
  quell101: 'quell',
  peek101: 'peek',
  cotizador101: 'cotizador',
  roster101: 'roster',
  nest101: 'nest',
  master101: 'master',
  workshop101: 'workshop',
  suite101: 'suite',
};

/* ─────────────── D1 master: el directorio ─────────────── */

export type Rol = 'owner' | 'admin' | 'socio' | 'staff';
export type TipoAcceso = 'cliente' | 'personal';

export type EstadoEmpresa = 'activa' | 'suspendida' | 'sin_pago';

export interface Org {
  id: string; // slug, y también el nombre del Durable Object
  nombre: string;
  plan: string;
  apps: Record<string, boolean>;
  moneda: string;
  activa: boolean;
  creado_at: string;
  // 0.14.0 · lo que se necesita para vender y cobrar
  razon_social: string | null;
  rfc: string | null;
  telefono: string | null;
  director_correo: string | null;
  director_nombre: string | null;
  director_telefono: string | null;
  /** Sin fecha de pago: no vence nunca. Las empresas que ya existían quedaron así. */
  cortesia: boolean;
  /** 'AAAA-MM-DD'; vence al terminar ese día. */
  paga_hasta: string | null;
  origen_pago: OrigenPago;
  bienvenida_at: string | null;
  /** Lo que se calcula: `vigente` = activa y (cortesía o pagada al día). */
  vigente: boolean;
  estado: EstadoEmpresa;
}

export interface Usuario {
  id: string;
  correo: string; // minúsculas
  nombre: string | null;
  creado_at: string;
}

export interface Yo {
  usuario: Usuario;
  superadmin: boolean;
  orgs: Array<{ id: string; nombre: string; rol: Rol; apps: string[]; negocios: string[] }>;
  acceso: { org_id: string; tipo: TipoAcceso; ref_id: string } | null;
}

/* ─────────────── el panel de la suite (master101), contrato 0.5.0 ─────────────── */

/** Lo que trae cada fila de GET /admin/orgs: la empresa y sus conteos. */
export interface OrgConConteos extends Org {
  /** cuántos miembros tiene (socios y oficina; no cuenta clientes ni personal) */
  personas: number;
  /** la sesión más reciente de cualquiera de sus miembros, ISO, o null si nadie ha entrado */
  ultima_entrada: string | null;
}

export interface Superadmin {
  usuario_id: string;
  correo: string;
  nombre: string | null;
}

/** Un renglón de `bitacora_admin`: quién cambió qué en el directorio. */
export interface RenglonBitacoraAdmin {
  id: number;
  cuando: string;
  quien: string; // correo del superadmin
  org_id: string | null; // null cuando cambió la lista de superadmins
  campo: string; // 'creada' | 'nombre' | 'plan' | 'moneda' | 'activa' | 'apps.dash' … | 'miembro' | 'superadmin'
  antes: string | null;
  despues: string | null;
}

/* ─────────────── OrgDB: el SQLite de cada empresa ─────────────── */

export type Moneda = 'MXN' | 'USD';

export interface Negocio {
  id: string;
  nombre: string;
  rfc: string | null;
  moneda: Moneda;
  /** Día en que toca conciliar: 0 domingo … 6 sábado. Por omisión el lunes. */
  dia_conciliacion: number;
  creado_at: string;
}

export interface Cuenta {
  id: string;
  negocio_id: string;
  nombre: string;
  tipo: 'banco' | 'caja' | 'credito' | 'otro';
  banco: string | null;
  moneda: Moneda;
  /** centavos */
  saldo_inicial: number;
  creado_at: string;
}

export interface Cliente {
  id: string;
  negocio_id: string;
  nombre: string;
  nombre_norm: string;
  correo: string | null;
  telefono: string | null;
  rfc: string | null;
  notas: string | null;
  usuario_id: string | null; // acceso a peek101
  portal_activo: boolean;
  creado_en_app: string;
  creado_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  nombre_norm: string;
  rfc: string | null;
  categoria: string | null;
  correo: string | null;
  telefono: string | null;
  terminos_pago: string | null;
  notas: string | null;
  creado_en_app: string;
  creado_at: string;
}

export interface Personal {
  id: string;
  nombre: string;
  nombre_norm: string;
  correo: string | null;
  puesto: string | null;
  activo: boolean;
  expediente_ref: string | null;
  etapas_permitidas: Etapa[];
  ve_dinero: boolean;
  estacion_default: string | null;
  usuario_id: string | null;
  creado_en_app: string;
  creado_at: string;
}

export interface Estacion {
  id: string;
  nombre: string;
  etapa_default: Etapa | null;
}

export interface Cotizacion {
  id: string;
  negocio_id: string;
  cliente_id: string | null;
  folio: string | null;
  estado: 'borrador' | 'enviada' | 'aceptada' | 'rechazada';
  /** centavos */
  total: number;
  moneda: Moneda;
  vigencia: string | null;
  datos: Record<string, unknown>;
  creado_at: string;
  actualizado_at: string | null;
}

export type EstadoProyecto = 'planeando' | 'activo' | 'pausado' | 'finiquito' | 'cerrado';

/** Lo acordado con un proveedor dentro de un proyecto. Cuelga del proyecto;
 *  el ítem es opcional (decisión de Mike, 11-sep). El cliente NUNCA la ve. */
export interface Partida {
  id: string;
  proyecto_id: string;
  item_id: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  concepto: string | null;
  /** centavos */
  monto_acordado: number;
  // cachés: los recalcula la API desde los egresos del proyecto con ese
  // proveedor como contraparte. Ninguna app los escribe.
  /** centavos */
  monto_pagado: number;
  estado: 'pendiente' | 'parcial' | 'pagado';
  creado_at: string;
  actualizado_at: string | null;
}

export interface Proyecto {
  id: string;
  negocio_id: string;
  cliente_id: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoProyecto;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  fecha_cierre: string | null;
  // cachés: los recalcula la API tras cada mutación. Ninguna app los escribe.
  /** centavos */
  precio_venta: number;
  /** centavos */
  cobrado: number;
  /** centavos. El cliente NUNCA lo ve. */
  pagado_prov: number;
  /** centavos: Σ monto_acordado de sus partidas. El cliente NUNCA lo ve. */
  compromiso: number;
  /** 0..1 */
  avance: number;
  /* 0018 · cómo lleva el IVA esta obra en su estado de cuenta. NO son
   * cachés: los escribe dash101 y son una decisión de quien vende. */
  /** Puntos base: 1600 = 16.00 %. En puntos base y no en decimal para que
   *  el PDF y el Excel no redondeen distinto. */
  tasa_iva: number;
  /** 0 = `precio_venta` es el SUBTOTAL y el IVA se suma encima (como nacen
   *  todos, decisión de Mike del 21-sep); 1 = ya viene dentro y el documento
   *  lo desglosa hacia atrás. */
  iva_incluido: number;
  creado_at: string;
  actualizado_at: string | null;
}

/** Eje comercial. No se condiciona con la etapa. */
export type EstadoItem = 'cotizado' | 'vendido' | 'cancelado';
/** Eje de fabricación. 0 = todavía no arranca. */
export type Etapa = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ETAPAS: Array<{ n: Etapa; nombre: string; termina: string; quien: string }> = [
  { n: 0, nombre: 'Sin arrancar', termina: '—', quien: '—' },
  { n: 1, nombre: 'Diseño autorizado', termina: 'el cliente firma el diseño', quien: 'oficina' },
  { n: 2, nombre: 'Anticipo pagado', termina: 'entra el anticipo', quien: 'administración' },
  { n: 3, nombre: 'Compra de materiales', termina: 'material recibido en taller', quien: 'compras / almacén' },
  { n: 4, nombre: 'Despiece y ensamble', termina: 'embalado y etiquetado — nace la clave', quien: 'taller' },
  { n: 5, nombre: 'Entrega', termina: 'descargado en sitio', quien: 'chofer' },
  { n: 6, nombre: 'Instalación', termina: 'colocado en su lugar', quien: 'instalador' },
  { n: 7, nombre: 'Cierre', termina: 'el cliente acepta', quien: 'residente / cliente' },
];

/** En la etapa 4 nace la clave del ítem ('M07'). */
export const ETAPA_CLAVE: Etapa = 4;

/** El modelo del catálogo (0017). Es de la EMPRESA, no del proyecto: el
 *  mismo «Puerta modelo A» se cotiza en tres obras. Varios ítems —piezas
 *  físicas, cada una con su código de obra en quell— apuntan al mismo
 *  producto, y de él heredan el precio.
 *
 *  Mike, 20-sep: «una cosa es el código de ítem (pieza física en obra) y
 *  otra diferente el código de producto de catálogo. Cada ítem es un código
 *  de producto y puede haber varios ítems del mismo modelo». */
export interface Producto {
  id: string;
  negocio_id: string;
  /** El del catálogo. Único dentro de la empresa cuando no está vacío;
   *  vacío mientras nadie lo cataloga, que es como nace al agrupar. */
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo: 'mueble' | 'servicio' | 'visita' | 'otro';
  /** centavos, POR PIEZA. El `monto` de un ítem suyo es esto × su cantidad. */
  precio: number;
  moneda: Moneda;
  creado_at: string;
  creado_por: string;
  actualizado_at: string | null;
}

export interface Item {
  id: string;
  negocio_id: string;
  proyecto_id: string | null; // NULL mientras solo está cotizado
  cliente_id: string;
  clave: string | null;
  /** A qué producto del catálogo pertenece (0017). NULL = el ítem es su
   *  propio producto único, que es como nacen todos. */
  producto_id: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: 'mueble' | 'servicio' | 'visita' | 'otro';
  /** centavos. Es el importe de LA LÍNEA: las 20 puertas juntas, no una.
   *  `proyectos.precio_venta` es la suma de estos. */
  monto: number;
  /** Cuántas piezas iguales son (0011). Por omisión 1. El precio por pieza
   *  sale de `monto / cantidad`, y es exacto: la multiplicación se hizo en
   *  centavos enteros al capturar. */
  cantidad: number;
  moneda: Moneda;
  estado: EstadoItem;
  etapa: Etapa;
  etapa_at: string | null;
  etapa_por: string | null;
  fecha_entrega: string | null;
  asignados: string[];
  origen: { app?: string; cotizacion_id?: string; linea?: number };
  refs: { nest?: string; draw?: string; fotos?: string[] };
  creado_at: string;
  creado_por: string;
  actualizado_at: string | null;
}

/** Append-only: no hay PATCH ni DELETE. */
export interface Avance {
  id: string;
  item_id: string;
  etapa: Etapa;
  persona_id: string | null;
  usuario_id: string;
  nota: string | null;
  foto: string | null;
  ts: string;
}

export interface Movimiento {
  id: string;
  negocio_id: string;
  tipo: 'ingreso' | 'egreso';
  /** centavos */
  monto: number;
  fecha: string;
  cuenta_id: string;
  proyecto_id: string | null;
  item_id: string | null;
  contraparte_tipo: 'cliente' | 'proveedor' | 'personal' | 'otro';
  contraparte_id: string | null;
  contraparte_nombre: string | null;
  transfer_id: string | null;
  descripcion: string | null;
  categoria: string | null;
  creado_por: string;
  creado_at: string;
}

export interface Opex {
  id: string;
  negocio_id: string;
  nombre: string;
  tipo: string;
  /** centavos */
  monto: number;
  moneda: Moneda;
  frecuencia: 'semanal' | 'mensual' | 'anual';
  dia_semana: number | null;
  dia_del_mes: number | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  cuenta_id: string | null;
  categoria: string | null;
  activo: boolean;
  creado_at: string;
}

/** Una conciliación: la foto de un momento. Append-only, como `avances`. */
export interface Conciliacion {
  id: string;
  negocio_id: string;
  /** La hora exacta del corte; el saldo registrado se congela ahí. */
  corte_at: string;
  hecha_por: string;
  creado_at: string;
}

export interface ConciliacionCuenta {
  id: string;
  conciliacion_id: string;
  cuenta_id: string;
  /** centavos */
  saldo_registrado: number;
  /** centavos */
  saldo_real: number;
  /** registrado − real, en centavos. Positiva: salidas que nadie registró. */
  diferencia: number;
  /** El ajuste que dejó la cuenta igual al real; null si cuadró. */
  movimiento_id: string | null;
  creado_at: string;
}

export interface Archivo {
  id: string;
  r2_key: string;
  nombre: string;
  mime: string | null;
  bytes: number | null;
  de_tabla: string;
  de_id: string;
  subido_por: string;
  creado_at: string;
}

/** Configuración de UNA app dentro de una empresa: lo que no describe al
 *  negocio —eso es `Negocio`— sino a cómo esa app trabaja. `valor` se lee
 *  entero; nadie lo consulta por dentro.
 *
 *  El `id` es `app:clave` y lo arma la API con la cabecera `X-App`: ninguna app
 *  manda el suyo, ninguna app abre el de otra, y guardar es un solo POST
 *  porque ese id hace upsert. */
export interface Ajuste {
  /** `app:clave`, p. ej. `cotizador101:precios`. Lo arma la API. */
  id: string;
  app: App;
  clave: string;
  valor: Record<string, unknown>;
  creado_at: string;
  actualizado_at: string | null;
}

export const TABLAS = [
  'negocios',
  'cuentas',
  'clientes',
  'proveedores',
  'personal',
  'estaciones',
  'cotizaciones',
  'proyectos',
  'productos',
  'items',
  'partidas',
  'avances',
  'movimientos',
  'opex',
  'conciliaciones',
  'conciliacion_cuentas',
  'archivos',
  'ajustes',
] as const;
export type Tabla = (typeof TABLAS)[number];

/** Tablas que viven dentro del OrgDB pero NO son del contrato: no se exponen
 *  por el CRUD genérico y ninguna app las conoce. `folios` es el contador del
 *  folio de la cotización, y vive ahí adentro justo para ser atómico.
 *
 *  Está aquí, y no escrita a mano en cada prueba, porque dos pruebas comparan
 *  la lista de tablas de la base con igualdad —para que una tabla NUEVA que
 *  nadie esperaba también truene—, y esa lista tiene que salir de un solo
 *  lugar. El 16-sep un conteo de migraciones escrito a mano en una prueba dejó
 *  un despliegue en rojo; es la misma clase de cosa. */
/* Las de quell101 (0006) no salen por el CRUD genérico: las usa el motor de
 * la bitácora de obra por /orgs/:o/quell/*, con sus propias reglas. */
export const TABLAS_INTERNAS = [
  'folios',
  'quell_users', 'quell_projects', 'quell_project_members', 'quell_plans', 'quell_elements', 'quell_log_entries',
  'quell_punch_items', 'quell_photos', 'quell_operaciones', 'quell_etapas', 'quell_element_etapas', 'quell_dudas',
  'quell_duda_respuestas', 'quell_element_contratistas',
  /* La documentación de cada ítem (0019): el plano principal sobre el que se
   * anota, sus archivos de soporte y las marcas encima. Tampoco salen por el
   * CRUD genérico: quién puede subir, anotar o archivar depende de la obra y
   * del rol —el contratista lee y no escribe—, y eso se resuelve renglón por
   * renglón en el motor. */
  'quell_element_docs', 'quell_doc_marcas',
  // roster101 (0007): las usa el motor de los expedientes por /roster/:o/api/*.
  'roster_trabajadores', 'roster_documentos', 'roster_codigos', 'roster_bitacora', 'roster_consentimientos',
  'roster_papelera', 'roster_administradores',
  /* Órdenes de compra y fiscal (0008 y 0009). NO salen por el CRUD genérico, y
   * es a propósito: el CRUD genérico entrega la tabla entera a quien puede
   * leerla, y aquí un miembro tiene que ver SÓLO SUS órdenes (decisión de
   * Mike). Ese filtro no se puede expresar en el CRUD, así que estas cuatro
   * se atienden por /orgs/:o/ordenes/* y /orgs/:o/fiscal/*, donde el permiso
   * se resuelve renglón por renglón. */
  'ordenes', 'orden_eventos', 'cfdi', 'cfdi_movimientos',
  /* La raya (0014). Tampoco sale por el CRUD genérico, y por una razón más
   * dura que la de las órdenes: lo que gana cada quien no lo ve cualquiera
   * con dash101 abierto. El permiso es `personal.es_nominas` y se revisa en
   * cada ruta de /orgs/:o/nomina/*; el CRUD genérico entregaría la tabla
   * entera a quien pueda leer la empresa. */
  'rayas', 'raya_pagos',
] as const;

/* ─────────────── lo que devuelven las rutas con nombre ─────────────── */

/** GET /orgs/:o/obras — la obra de quell101, dicha con los nombres de la
 *  suite. `proyecto_id` es la liga con el proyecto de dash101: cuando es
 *  `null`, la obra existe en quell101 y nadie le ha puesto precio todavía. */
export interface Obra {
  id: string;
  nombre: string;
  cliente: string;
  estado: 'activo' | 'cerrado';
  creado_at: string;
  proyecto_id: string | null;
  proyecto_nombre: string | null;
  proyecto_negocio_id: string | null;
  /** cuántos planos tiene cargados */
  planos: number;
  /** cuántos ítems están ya ubicados en un plano */
  ubicados: number;
}

/** GET /orgs/:o/pool — para autocompletar. Solo identidad. */
export interface Pool {
  clientes: Array<Pick<Cliente, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'telefono'>>;
  proveedores: Array<Pick<Proveedor, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'telefono'>>;
  personal: Array<Pick<Personal, 'id' | 'nombre' | 'nombre_norm' | 'correo' | 'puesto'>>;
}

/** GET /orgs/:o/peek — todo lo del cliente en sesión, ya agregado por la API.
 *  Los números vienen calculados aquí para que el KPI y la tabla no se
 *  contradigan nunca (fue un defecto real el 7-sep). */
export interface Peek {
  cliente: Pick<Cliente, 'id' | 'nombre' | 'correo'>;
  proyectos: Array<
    Omit<Proyecto, 'pagado_prov' | 'compromiso'> & {
      items: Array<Pick<Item, 'id' | 'clave' | 'nombre' | 'monto' | 'moneda' | 'estado' | 'etapa' | 'etapa_at' | 'fecha_entrega'>>;
    }
  >;
  /** centavos */
  totales: { vendido: number; cobrado: number; saldo: number; avance: number };
  pagos: Array<Pick<Movimiento, 'id' | 'fecha' | 'monto' | 'proyecto_id' | 'descripcion'>>;
}

/* ─────────────── WebSocket (§8) ─────────────── */

export type Aviso =
  | { t: 'item.etapa'; id: string; etapa: Etapa; clave: string | null; at: string }
  | { t: 'item.cambio'; id: string }
  | { t: 'movimiento.nuevo'; id: string; proyecto_id: string | null }
  | { t: 'proyecto.cache'; id: string; precio_venta: number; cobrado: number; avance: number }
  | { t: 'conciliacion.nueva'; id: string; negocio_id: string; diferencia_total: number }
  /* 0.27.0 · se pagó una raya. Va al canal del dinero porque son N egresos
   * de golpe: una pantalla de saldos abierta tiene que enterarse. */
  | { t: 'raya.pagada'; id: string };

/* ─────────────── el alcance de un ítem (0.31.0) ───────────────
 *
 * Mike, 20-sep-2026: «hay ítems nuevos no aprobados e ítems cancelados. Para
 * que un ítem se considere cancelado TIENE QUE HABER ESTADO APROBADO PRIMERO
 * y luego cancelado. (…) Los no aprobados, a pesar de que tienen precio y
 * toda la info, NO SUMAN en dash y NO APARECEN en quell al menos que veas la
 * vista de ítems fuera de alcance.»
 *
 * La regla vive aquí, en el archivo que las tres apps copian tal cual, por lo
 * mismo de siempre: tres pantallas con tres ideas de qué es un cancelado son
 * tres reglas, y la que falle va a ser la que nadie probó. Sale de dos datos
 * y nada más: el estado, y si alguna vez estuvo aprobado.
 */

export type AlcanceItem = 'dentro' | 'no_aprobado' | 'cancelado' | 'descartado';

/** En qué parte del alcance está un ítem.
 *
 *   · `dentro`      — vendido. Suma, se fabrica, sale en el plano.
 *   · `no_aprobado` — cotizado: tiene precio y todo, pero nadie ha dicho que
 *                     sí. Es el «nuevo requerimiento» que nace en la obra.
 *   · `cancelado`   — estuvo aprobado y se canceló.
 *   · `descartado`  — se quitó SIN haber estado aprobado nunca. No es un
 *                     cancelado: no se canceló trabajo, se dijo que no a un
 *                     requerimiento, y meterlo entre los cancelados diría
 *                     que se echó para atrás una venta que jamás existió.
 */
export function alcanceDeItem(item: { estado?: string | null; aprobado_at?: string | null }): AlcanceItem {
  const estado = String(item.estado ?? 'cotizado');
  if (estado === 'cancelado') return item.aprobado_at ? 'cancelado' : 'descartado';
  if (estado === 'vendido') return 'dentro';
  return 'no_aprobado';
}

/* ─────────────── la fecha de entrega y lo que falta (§123) ───────────────
 *
 * Mike, 21-sep: «hay que agregar un campo en el ítem de fecha de entrega y un
 * contador de cuántos días quedan para la entrega».
 *
 * La fecha ya existía —`items.fecha_entrega`, desde la 0001— y se queda donde
 * está: UNA sola fecha que ven dash101, quell101 y el portal del cliente. Lo
 * que faltaba era enseñarla en la obra y poder fijarla desde ahí.
 *
 * LA CUENTA VIVE AQUÍ y no en cada pantalla, por lo de siempre: tres apps
 * contando días son tres maneras de que una diga «faltan 3» y otra «faltan
 * 2». Y porque esta cuenta tiene una trampa real que ya nos mordió el 21-sep
 * con las fechas de los movimientos: una fecha SIN HORA no tiene zona. Si se
 * hace `new Date('2026-10-15')` se lee medianoche en Londres, y restarle el
 * reloj de México da un día de menos. Aquí las dos puntas se anclan a
 * medianoche UTC, así que la resta es un múltiplo exacto de un día y no hay
 * horas de por medio.
 */

/** Medianoche UTC de una fecha `YYYY-MM-DD`, o null si no lo es. */
function medianoche(fecha: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha ?? ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Cuántos días faltan para la entrega. Positivo = faltan; 0 = es hoy;
 *  negativo = lleva ese número de días vencida. `null` si no hay fecha.
 *
 *  `hoy` se recibe para poder medirlo: una cuenta que sólo sabe leer el reloj
 *  del aparato no se puede probar. */
export function diasParaEntrega(fecha: unknown, hoy: unknown = new Date().toISOString().slice(0, 10)): number | null {
  const a = medianoche(fecha);
  const b = medianoche(hoy);
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86400000);
}

/** La misma cuenta, en palabras, para que las tres apps digan lo mismo.
 *  `null` cuando no hay fecha: ahí la pantalla decide qué poner. */
export function faltaParaEntrega(fecha: unknown, hoy?: unknown): { dias: number; dice: string; tarde: boolean } | null {
  const dias = diasParaEntrega(fecha, hoy);
  if (dias === null) return null;
  if (dias === 0) return { dias, dice: 'Se entrega hoy', tarde: false };
  if (dias === 1) return { dias, dice: 'Falta 1 día', tarde: false };
  if (dias > 1) return { dias, dice: `Faltan ${dias} días`, tarde: false };
  if (dias === -1) return { dias, dice: 'Venció ayer', tarde: true };
  return { dias, dice: `Vencida hace ${Math.abs(dias)} días`, tarde: true };
}

/** Lo que se enseña de cada alcance, en palabras de Mike. */
export const NOMBRE_ALCANCE: Record<AlcanceItem, string> = {
  dentro: 'En proceso',
  no_aprobado: 'No aprobados',
  cancelado: 'Cancelados',
  descartado: 'Descartados',
};

/* ─────────────── ayudas de formato (identidad Taller 101) ─────────────── */

export const AZUL_T101 = '#0080C1';

/** Centavos → texto. La UI lo pinta con Fira Sans y `font-variant-numeric: tabular-nums`. */
export function formatearDinero(centavos: number, moneda: Moneda = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(centavos / 100);
}

/* ─────────────── pesos → centavos ───────────────
 * Esta conversión se hace SIN multiplicar por 100. `1500.5 * 100` no da
 * 150050 por suerte, da 150049.99999999999 por accidente, y `Math.round` lo
 * tapa casi siempre — casi. Con `1.005 * 100` sale 100.49999999999999 y el
 * redondeo se va para abajo: un centavo perdido, en silencio, dentro de un
 * número que ya nadie va a volver a mirar.
 *
 * Así que el número se lee como texto, se parte en el punto y se cuentan los
 * dígitos. Los decimales que sobran redondean al centavo más cercano, y medio
 * centavo sube. Que hubo redondeo se devuelve dicho, porque en una migración
 * redondear dinero sin avisar es peor que no convertirlo. */

export interface Centavos {
  ok: boolean;
  /** Entero. Vale 0 cuando `ok` es falso: no se usa. */
  centavos: number;
  /** Había dígitos más allá del centavo y se tuvo que redondear. */
  redondeo: boolean;
  /** El campo venía vacío o nulo. Se cuenta como 0, pero se sabe que faltaba. */
  vacio: boolean;
  /** Por qué no se pudo convertir. */
  motivo?: string;
}

/** Un número en notación exponencial, escrito con todos sus dígitos.
 *  `String(1.5e-7)` es '1.5e-7' y ahí no hay dónde poner el punto decimal. */
function sinExponente(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  const [mantisa, potencia] = s.split(/e/i);
  const exp = Number(potencia);
  const negativo = mantisa.startsWith('-');
  const [entero, decimales = ''] = mantisa.replace('-', '').split('.');
  const digitos = entero + decimales;
  const punto = entero.length + exp;
  let salida: string;
  if (punto <= 0) salida = '0.' + '0'.repeat(-punto) + digitos;
  else if (punto >= digitos.length) salida = digitos + '0'.repeat(punto - digitos.length);
  else salida = digitos.slice(0, punto) + '.' + digitos.slice(punto);
  return (negativo ? '-' : '') + salida;
}

/** Pesos (número o texto) → centavos enteros. `'1,500.50'` → `150050`. */
export function aCentavosExacto(valor: unknown): Centavos {
  const nada: Centavos = { ok: true, centavos: 0, redondeo: false, vacio: true };
  if (valor === null || valor === undefined || valor === '') return nada;
  if (typeof valor === 'boolean') {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: 'un booleano no es dinero' };
  }

  let texto: string;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: `no es un número finito: ${valor}` };
    }
    texto = sinExponente(valor);
  } else {
    // Se le quitan símbolo de moneda, separadores de millar y espacios (los
    // duros también: los pega Excel al copiar).
    texto = String(valor).replace(/[\s\u00a0$,]/g, '');
    if (texto === '') return nada;
  }

  if (!/^[+-]?\d*(\.\d*)?$/.test(texto) || !/\d/.test(texto)) {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: `no parece un número: ${String(valor)}` };
  }

  const negativo = texto.startsWith('-');
  const limpio = texto.replace(/^[+-]/, '');
  const [entero = '', decimales = ''] = limpio.split('.');
  if (entero.length > 13) {
    return { ok: false, centavos: 0, redondeo: false, vacio: false, motivo: 'demasiados dígitos para un entero exacto' };
  }

  const dosDecimales = (decimales + '00').slice(0, 2);
  const sobra = decimales.slice(2);
  let centavos = Number(entero || '0') * 100 + Number(dosDecimales);
  // Medio centavo sube, y en los negativos sube en valor absoluto: -1.005 es
  // -101, no -100. Redondear hacia cero de un lado y no del otro descuadraría
  // una transferencia consigo misma.
  if (sobra && sobra[0] >= '5') centavos += 1;

  return {
    ok: true,
    centavos: negativo ? -centavos : centavos,
    redondeo: /[1-9]/.test(sobra),
    vacio: false,
  };
}

/** Texto tecleado → centavos enteros. '1,500.50' → 150050. */
export function aCentavos(texto: string | number): number {
  return aCentavosExacto(texto).centavos;
}

/** minúsculas sin acentos — para `nombre_norm` y para el autocompletar. */
export function normalizar(txt: string): string {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

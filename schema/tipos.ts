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
 * Versión del contrato: 0.75.0 (LOS TIEMPOS DEFAULT EN LO QUE YA ESTABA. Mike,
 * 6-oct: «ponla también todos los ítems que hay ahorita en alcance con los
 * defaults de tiempos»; escogió con botones «sólo donde falten». La
 * migración org 0037 deja el pendiente `tiempos_default` en
 * `pendientes_arranque`: las piezas en alcance (sin ítem, o con su ítem
 * vendido) que no tienen fases reciben las tres default con su costo por
 * pieza, y una fase de material, fabricación o instalación que sigue en 1 día
 * —con lo que nace la que se agrega a mano— pasa a 10, 24 o 12. Lo capturado,
 * las cadenas y las fases de más se quedan; fuera de alcance no se toca. Sin
 * cambios de forma en las rutas). Antes:
 * 0.74.0 (LOS COSTOS DEFAULT, POBLADOS Y POR PIEZA. Mike,
 * 6-oct: «necesito que pobles por mí todos los ítems que tenemos en alcance,
 * que no tengan precio, con los costos predeterminados». El costo default de
 * una fase sale del precio de UNA pieza —el `monto` del ítem entre su
 * `cantidad`—, no del total: hasta aquí una puerta de un ítem × 20 nacía con
 * el costo de las veinte. La migración org 0036 deja un pendiente en
 * `pendientes_arranque` que el OrgDB corre una vez al arrancar (`correrPendientes`):
 * toda obra recibe sus fases default donde falten; cada pieza ligada a un
 * ítem en alcance (vendido) con precio recibe, por etapa —material y
 * fabricación—, el default en la primera fase si ninguna de esa etapa tiene
 * costo; lo capturado se respeta; la instalación se queda como esté; los
 * costos que nacieron sobre el total se corrigen; y las obras que cambiaron
 * rehacen sus compromisos. Sin cambios de forma en las rutas). Antes:
 * 0.73.0 (EL CRONOGRAMA QUE SE LLENA SOLO, CON RESPONSABLE Y
 * COSTO POR FASE, Y LOS COMPROMISOS QUE DE AHÍ NACEN. Mike, 6-oct: «cada ítem
 * tiene fecha de entrega default de 6 semanas en sitio y 2 semanas de
 * instalación (…) material 10 días, fabricación 4 semanas, instalación 2 (…)
 * el cronograma se debe llenar en automático (…) responsable (proveedor o
 * contratista) de cada fase (…) el costo de cada fase, así de ahí se pobla
 * la lista de compromisos». Migración org 0035: quell_tareas.contratista_id y
 * .costo (centavos), quell_elements.fases_dadas, partidas.tarea_id/obra_id/
 * fecha_esperada. Una pieza sin fases las recibe solas UNA vez al abrir el
 * cronograma (10/24/12 días; costo por tipo: Mueble 30/30, Puerta 35/35,
 * Servicio 5/55, Acabado 40/20 % del precio del ítem, material y mano de
 * obra en fabricación). Cada fase con costo de una pieza ligada a un ítem es
 * una partida de su proyecto (monto = costo, fecha_esperada = inicio del
 * material o fin de las demás), que dash101 no edita ni borra (409
 * del_cronograma). GET trae `contratistas` y `costo` por pieza y total.)
 * Antes:
 *
 * 0.72.0 (EL PLAN DE PAGOS DEL PROYECTO. Mike, 6-oct, con
 * botones: «plan de pagos por proyecto». Migración org 0034: tabla
 * `plan_pagos` {proyecto_id, concepto, fecha AAAA-MM-DD, monto en centavos}
 * por el CRUD genérico, la escribe dash101, filtro por proyecto_id, orden
 * por fecha. La API valida (proyecto que existe, fecha de verdad, monto
 * entero > 0, concepto ≤ 80) y contesta con palabras por campo. No mueve
 * dinero ni toca `cobrado`: el flujo proyectado de dash101 pone cada
 * parcialidad en su fecha y descuenta lo ya cobrado del proyecto en orden
 * de fecha, así sólo lo pendiente entra como cobro.) Antes:
 *
 * 0.71.0 (LA NÓMINA PROGRAMADA. Mike, 6-oct: «hay que
 * ver en nómina el programar la nómina para que también se considere en los
 * gastos para proyectar los flujos». `GET`/`PUT /orgs/:o/nomina/programa`:
 * una por empresa {activo, frecuencia semanal|quincenal|mensual, dia_semana,
 * dia_del_mes, monto en CENTAVOS, nota}. No es un corte ni mueve dinero: es
 * lo que el flujo proyectado pone como gasto en cada fecha de pago futura.
 * El GET trae además `ultimo_total` (el último corte pagado, para proponerlo)
 * y `borradores` (cortes abiertos con su total, que la proyección usa en vez
 * de la estimación). Vive en `ajustes` bajo la app `nomina`, fuera del CRUD
 * genérico, con el permiso de la raya.) Antes:
 *
 * 0.70.0 (LOS DOS CANDADOS DEL ÍTEM EN EL CRONOGRAMA.
 * Mike, 6-oct: «todos los ítems necesitan cumplir 2 parámetros para que se
 * fije su fecha de inicio (…) anticipo y definición de diseño. Mientras los
 * parámetros no se cumplan la fecha de inicio se sigue recorriendo al día
 * presente». Migración org 0033: tabla `movimiento_items` (un pago repartido
 * entre ítems; CRUD genérico con validación: sólo ingresos, ítems del mismo
 * proyecto, la suma no pasa del monto) y `quell_elements.diseno_definido`
 * (AAAA-MM-DD, por PATCH /quell/elements/:id). El cronograma trae por pieza
 * `candados` {anticipo, anticipo_monto, diseno, listo, arranque, ligado}:
 * con los dos, arranca en la fecha más tardía de los dos; sin alguno,
 * arranca HOY y se recorre solo. Una pieza sin ítem de dash101 no puede
 * tener anticipo. El anticipo también cuenta si el ítem ya va en la etapa
 * 2 «Anticipo pagado» o más allá.)
 *
 * 0.69.0 (FASES ADICIONALES EN EL CRONOGRAMA. Mike,
 * 6-oct: «poder agregar otra fase a los procesos en caso de ser necesario, y
 * editar el nombre de la fase del proceso». Migración org 0032: `quell_tareas`
 * se rehace con etapa 'otra', `nombre` y `pos`; el orden dentro del proceso es
 * `pos` (lo que había queda 0/10/20 por etapa). 'otra' puede repetirse en un
 * proceso; las tres fijas siguen siendo una por proceso.)
 *
 * 0.68.0 (EL CRONOGRAMA DE LA OBRA Y EL TIPO DEL
 * PROVEEDOR. Mike, 5-oct: «necesito en quell poder configurar un cronograma
 * (…) tiempo de fabricación total (…) entrega de material, fabricación e
 * instalación (…) a cada una asignarle un proveedor o contratista (los
 * contratistas debemos darlos de alta como proveedores, pero en proveedores
 * hay 2 tipos: materiales y servicios) (…) encadenar tareas (…) exportar en
 * Microsoft Project o en un Excel». Migración org 0031: `proveedores.tipo`
 * (materiales | servicios; lo que había queda como materiales; la API sólo
 * acepta esos dos y supply101 también lo escribe), `quell_projects.
 * cronograma_inicio` y `cronograma_dias`, y la tabla `quell_tareas`. Rutas
 * del motor: GET/PUT `/quell/projects/:id/cronograma`, GET `cronograma.xlsx`
 * y `cronograma.xml` (ver `Cronograma`). Días laborables de lunes a sábado.)
 *
 * Versión del contrato: 0.67.1 (DEL ÍTEM A SU PIEZA DEL PLANO, para quote101.
 * Mike, 5-oct: «cuando estoy en quote viendo la lista de requerimientos
 * nuevos, quiero que si le doy click, a la derecha me abra la barra de quell
 * de los detalles del ítem». Ruta nueva del motor de obra:
 * `GET /orgs/:o/quell/items/:item_id/pieza` → `{ pieza: { element_id,
 * project_id, project_name, plan_id, plan_name, code, name, type, fase,
 * padre_id } }`; 404 si el ítem no está en ningún plano. Con eso quote101 pide
 * `/quell/elements/:id` y `/quell/elements/:id/docs` como cualquier app de la
 * empresa, con su propio `X-App`. Un cliente no la abre. Sólo se agrega.)
 *
 * Versión del contrato: 0.67.0 (LOS DATOS DE PAGO DEL PROVEEDOR EN LA ORDEN.
 * Mike, 5-oct: «en las órdenes de compra, ahí mismo en la orden (desde dash)
 * aparezcan los datos bancarios o de pago del proveedor para hacer ese
 * pago». `GET /orgs/:o/ordenes/:id` trae además `proveedor`
 * (`ProveedorDePago`): nombre, RFC, correo, teléfono, términos de pago y sus
 * cuentas (alias, CLABE, banco, beneficiario, notas), o `null` si la orden
 * sólo trae el nombre escrito a mano. Lo ve quien puede abrir la orden: quien
 * la pidió o quien paga, igual que supply101 enseña la ficha del proveedor a
 * quien pide. Sólo se agrega un campo: nada cambia de forma.)
 *
 * Versión del contrato: 0.66.2 (DEFECTO. Un POST del navegador al motor de
 * quell (`/orgs/:o/quell/*`) contestaba 500 «falla_interna» con lo pedido ya
 * escrito: el navegador manda `Origin` en todo POST, la entrada le ponía las
 * cabeceras CORS a la respuesta que venía tal cual del objeto de la empresa,
 * y esas cabeceras son inmutables. Ahora la respuesta se vuelve a envolver.
 * Lo destapó peek101 al estrenar «preguntar» desde su pantalla; quell101 no
 * lo veía porque su Worker no reenvía `Origin`. Sin cambios de forma.)
 *
 * Versión del contrato: 0.66.1 (EL PORTAL DEL CLIENTE ES peek101. Mike, 5-oct:
 * «Quiero que el único visor del cliente sea Peek y que ahí mismo pueda ver
 * el plano general y aparte contestar los puntos de dudas. Y el generar sus
 * propias dudas desde Peek». Los correos al cliente que manda el motor de
 * quell (la invitación y los puntos por definir) llevan a peek101
 * (`#/obra/OBRA`), con la dirección deducida de la de quell (`sitioPeek`).
 * Sin cambios de forma: peek101 usa las rutas de cliente del motor que ya
 * existían, con `X-App: peek101`.)
 *
 * Versión del contrato: 0.66.0 (PEEK JUNTA LO DEL CLIENTE. Mike, 4-oct: «para
 * el cliente es muy tedioso irse metiendo a diferentes plataformas (…)
 * Juntemos dentro de Peek la info de su estado de cuenta y la info que le
 * aparece en quell». `GET /peek` trae además, por proyecto, la `obra` de
 * quell101 ligada; por ítem, sus `piezas` del plano con cuántos planos
 * (`docs`) tiene cada una; y arriba `pendientes`: las dudas abiertas que el
 * taller le hizo al cliente en todas sus obras. En quell101 el cliente de la
 * suite entra a la obra ligada a su proyecto sin invitación aparte, el
 * detalle de la pieza le trae `item_monto` («al cliente sí le debe aparecer
 * el precio»), `item_descripcion` e `item_etapa`, y puede leer la
 * documentación del ítem (GET docs, versiones y marcas; subir y anotar
 * siguen siendo del taller). `GET /clientes/:id/estado-de-cuenta` y
 * `/estado.xlsx` los abre también el propio cliente, sólo con su id.)
 *
 * Versión del contrato: 0.65.0 (EL CORREO ES DE UN SOLO CLIENTE. Mike, 4-oct:
 * «El cliente se debe poder crear desde quell, dash o quote. Los 3 generan
 * exactamente el mismo cliente (…) en caso de querer generar un nuevo
 * cliente con el email de otro que ya existe, avisar que ya existe un
 * cliente, presentar su info y preguntar si es ese cliente el que estás
 * buscando y ya usarlo o si quieres crear uno nuevo con otro email».
 * `POST /clientes` y `PATCH /clientes/:id` con un correo que ya es de otro
 * cliente contestan 409 `correo_en_uso` con `detalle.cliente` (id, nombre,
 * correo, teléfono, RFC, portal_activo). `GET /clientes/parecidos?correo=`
 * contesta además `por_correo` para preguntar antes de guardar.
 * `POST /clientes/invitar` con el correo de un cliente que ya existe
 * contesta 409 `correo_en_uso` salvo que traiga `usar_existente: true`
 * (antes lo usaba en silencio). quell101 (`/clientes/invitar` del motor)
 * lo repite con `cliente` en el cuerpo.)
 *
 * Versión del contrato: 0.64.4 (/peek TAMBIÉN RESCATA POR CORREO. Mike,
 * 4-oct, segundo intento: con 0.64.3 seguía sin entrar, porque en la
 * empresa ya no hay ningún cliente con su usuario. Si el acceso apunta a un
 * cliente que no está y ninguno trae el usuario, se busca por el correo de
 * la sesión (el de la invitación), se le vuelve a colgar el usuario y se
 * repara el acceso. Sin cambios de forma.)
 *
 * Versión del contrato: 0.64.3 (EL ACCESO AL PORTAL SIGUE AL CLIENTE QUE SE
 * QUEDA. Mike, 4-oct: «No podemos entrar en Peek como cliente y ya está
 * invitado». Al fusionar dos clientes, el que se queda heredaba el
 * `usuario_id` pero `accesos.ref_id` (base maestra) se quedaba en el que se
 * borró, y /peek contestaba no_encontrado. Ahora `POST /clientes/:id/fusionar`
 * re-apunta el acceso al que se queda, y `GET /peek` repara al pasar una
 * cuenta que ya venía chueca: busca el cliente por `usuario_id` y vuelve a
 * poner el acceso. Sin cambios de forma.)
 *
 * Versión del contrato: 0.64.2 (LOS REQUERIMIENTOS SIN ÍTEM. Mike, 2-oct:
 * «los requerimientos levantados en quell (…) tienen que aparecer en la
 * lista de quote de ítems pendientes. Ahorita hay unos requerimientos del
 * Depto Bosques de Santa Fe que no aparecen». Un requerimiento levantado
 * antes de ligar la obra —o antes del 29-sep— era un pin sin ítem. Ahora:
 * al ligar la obra (`POST /obras/:id/ligar`) nacen los ítems de sus
 * requerimientos huérfanos; la migración 0030 del OrgDB los repara en las
 * obras ya ligadas; y «traer del plano» (`POST /obras/:id/items` con
 * `crear`) levanta un requerimiento como requerimiento, con su renglón en
 * el borrador de quote101, en vez de como pieza cotizada suelta). Antes:
 * 0.64.1 (EL REQUERIMIENTO PENDIENTE ESTÁ FUERA DEL
 * ALCANCE TAMBIÉN EN QUELL. Mike, 2-oct: «se genera como requerimiento
 * (fuera de alcance) o como ítem (en alcance)». El motor de quell mandaba un
 * requerimiento sin aprobar como 'dentro' —excepción del 22-sep— y la lista
 * de fuera de alcance de la obra no lo enseñaba; ahora el `alcance` de cada
 * pieza es exactamente `alcanceDeItem` de su ítem: vendido dentro, lo demás
 * fuera, y sin ítem dentro). Antes:
 * 0.64.0 (EL ALCANCE EN DOS ESTADOS. Mike, 2-oct:
 * «eliminar el estado de los ítems de "cancelado" y solo existirá "en
 * alcance" o "fuera de alcance" (…) no pasan a otra lista, regresan a fuera
 * de alcance, solo en la bitácora sí aparecerá como "se sacó del alcance" y
 * si se agrega de nuevo aparecerá después "se agregó al alcance" con su fecha
 * y quién la agregó». `AlcanceItem` es 'dentro' | 'fuera' y `alcanceDeItem`
 * sólo mira `estado`: vendido es dentro, lo demás es fuera. La API ya no
 * escribe `estado = 'cancelado'`: `POST /items/:id/sacar` (y `/cancelar`,
 * que se queda como alias) devuelve el ítem a 'cotizado' con `cancelado_at`
 * y su motivo, y un `cancelado` que llegue por el CRUD se guarda como
 * `cotizado`. La migración 0028 del OrgDB crea `alcance_movimientos` —la bitácora:
 * entra/sale, quién, app, motivo, cuándo— y la siembra de `aprobado_at` y
 * `cancelado_at`; `GET /orgs/:o/items/:id/alcance` la devuelve. Se anota
 * en toda puerta que mueva el estado: aprobar, sacar, el CRUD, vender desde
 * quote101 y aprobar una cotización. `borrar-cancelados` se queda y borra
 * los que se SACARON —`cancelado_at` con fecha—, nunca un requerimiento que
 * nadie ha decidido). Antes:
 * 0.63.0 (SE VA LA TABLA `negocios` Y LA COLUMNA
 * `negocio_id`. Mike, 1-oct: «Ya no existe la opción de negocios. Sólo es
 * una empresa/negocio todo. Elimina todas las lógicas que involucran el
 * concepto de "negocio"». La migración 0027 del OrgDB corre en código: si una
 * empresa tenía varios negocios se juntan en el primero por nombre —como
 * `POST /negocios/fusionar`, que se va—, nombre, RFC, moneda y día de
 * conciliación pasan a la tabla `empresa` (un solo renglón, id 'empresa'),
 * las tablas que llevaban llave foránea a `negocios` (cuentas,
 * conciliaciones, rayas, accionistas) se reconstruyen sin la columna, a las
 * demás (clientes, cotizaciones, proyectos, productos, items, movimientos,
 * opex, ordenes, cfdi) se les tira con DROP COLUMN, y al final se tira
 * `negocios`. Lo que cambia hacia afuera:
 *   · Ninguna fila trae `negocio_id`: `Cuenta`, `Cliente`, `Proyecto`,
 *     `Item`, `Movimiento`, `Opex`, `Conciliacion`, `Cotizacion`,
 *     `Producto`, `Accionista`, `Orden`, `Cfdi`, `Raya`. Si una app vieja
 *     lo manda al crear o al editar, se ignora (no es 403); como filtro
 *     (`?negocio_id=`) también se ignora. Se va la interfaz `Negocio`.
 *   · `GET`/`PATCH /orgs/:o/empresa` leen y escriben la tabla `empresa`,
 *     con la misma forma de 0.62.0: { id: 'empresa', nombre, rfc, moneda,
 *     dia_conciliacion }. Si el renglón no existe se crea con el nombre de
 *     la empresa y moneda MXN.
 *   · COMPATIBILIDAD, se va cuando ninguna prueba lo pida: `GET /negocios`
 *     contesta { total: 1, filas: [la empresa con la forma de negocio: id
 *     'empresa', nombre, rfc, moneda, dia_conciliacion, creado_at] };
 *     `POST /negocios` contesta 201 con esa misma fila (ignora el cuerpo,
 *     salvo nombre y moneda si la empresa aún no existía); `GET
 *     /negocios/:id` la misma fila si el id coincide (404 si no); `PATCH
 *     /negocios/:id` actualiza la empresa. Se va `POST /negocios/fusionar`.
 *   · `GET /admin/orgs/:o/quote` contesta { org, resumen: ConteoQuote } con
 *     { clientes, proyectos, cotizaciones, ultima_cotizacion } de la
 *     empresa; ya no hay lista por negocio ni huérfanos.
 *   · `POST /orgs/:o/ordenes` sin negocio_id (0.62.1 lo rellenaba; ya no
 *     hay qué rellenar) y la fila de `Orden` no lo trae.
 *   · `GET /orgs/:o/ordenes/buzon`, `/pagadas`, `/resumen`, `/ordenes`,
 *     `/fiscal/iva`, `/cuadre`, `/pendientes`, `/cfdi`,
 *     `/clientes/parecidos`, `/conciliaciones/estadistica` y
 *     `/nomina/rayas`: `?negocio_id=` se acepta y se ignora; siempre son de
 *     la empresa.
 *   · `estadoDelProyecto` (`GET /proyectos/:id/estado`) sigue contestando
 *     el campo `negocio` {id, nombre, rfc, moneda} para no romper peek101
 *     ni dash101, pero ES LA EMPRESA (id 'empresa').
 *   · `Obra` pierde `proyecto_negocio_id`; el aviso `conciliacion.nueva`
 *     pierde `negocio_id`.
 *   · `/yo` sigue trayendo `negocios: []` en cada org, fijo, por
 *     compatibilidad; la columna `miembros.negocios` del D1 se queda vacía
 *     hasta que haya migración de D1. `POST /admin/importar` ignora el
 *     campo `negocio` del cuerpo y la colección `negocios` del documento.
 *   · Nuevo `GET /admin/orgs/:o/esquema` (superadmin): { tablas: { nombre:
 *     [columnas] } }, para medir que la base no trae `negocios` ni
 *     `negocio_id`.)
 *
 * Antes, 0.62.1 (`POST /orgs/:o/ordenes` SIN negocio_id: la API
 * le pone el registro de la empresa, como ya hacían cuentas, clientes,
 * conciliaciones y nómina desde 0.61.0. Faltaba en las órdenes y supply101,
 * que ya no lo manda, se quedaba sin poder pedir.)
 *
 * Antes, 0.62.0 (LA EMPRESA TIENE SU RUTA. `GET /orgs/:o/empresa`
 * → { id, nombre, rfc, moneda, dia_conciliacion }; `PATCH /orgs/:o/empresa`
 * (owner y admin) cambia nombre, rfc, moneda (MXN|USD) y dia_conciliacion
 * (0-6). Es lo que las pantallas leen y editan en vez de `negocios`, que
 * sigue sólo por dentro hasta la fase D. Tipo `Empresa`.)
 *
 * Antes, 0.61.0 (LA EMPRESA ES UNA: `negocio_id` YA NO SE
 * PIDE. Mike, 1-oct: «Ya no existe la opción de negocios en dash. Sólo es
 * una empresa/negocio todo. Elimina todas las lógicas que involucran el
 * concepto de "negocio"». Toda ruta que lo exigía lo resuelve sola con el
 * registro de la empresa —el primero por nombre; si no hay, se crea con el
 * nombre de la empresa—: el CRUD al crear cuentas, clientes, proyectos,
 * movimientos, opex, accionistas, cotizaciones y lo demás que lo lleve;
 * `POST /conciliaciones`, `GET /conciliaciones/estadistica`,
 * `GET`/`POST /nomina/rayas`. Si una app lo manda, se respeta, pero ya no
 * debe mandarlo: en la fase D se van la tabla y las columnas.)
 *
 * Antes, 0.60.0 (EL SALDO LO SUMA LA BASE, Y LO DEMÁS DEL
 * 1-OCT. Mike: «ya hay movimientos por más de 70,000 de egresos y el total
 * sigue sin contarlos»: dash101 sumaba el saldo de la lista de movimientos,
 * que tiene tope de 500 y salía de la más vieja a la más nueva; pasando de
 * 500 los últimos egresos no entraban. Ahora cada fila de `cuentas` trae
 * `saldo` (centavos, calculado en la base sobre TODOS sus movimientos) y la
 * lista de `movimientos` sale de la más reciente a la más vieja. Además:
 * `GET /orgs/:o/clientes/:id/estado.xlsx` (el estado de cuenta general del
 * cliente, dos hojas), `GET /orgs/:o/accionistas/de-roster` (`{ personas }`
 * de los expedientes de roster101, para dar de alta un accionista jalándolo
 * de ahí) y la categoría CATEGORIA_GASTO_GENERAL para los egresos que no
 * son de ningún proyecto: renta, máquinas, herramienta, licencias.)
 *
 * Antes, 0.59.1 (EL CORREO DE LOS PUNTOS POR DEFINIR TRAE
 * CADA PUNTO Y «RESPONDER». Mike, 1-oct: «que en el correo venga el texto
 * de la duda y abajo un link que diga "responder" y te mande a la url
 * necesaria para responder». `POST /orgs/:o/quell/projects/:p/avisar-cliente`
 * manda cada punto abierto con su pieza y la liga `#/p/OBRA/dudas`, y
 * contesta además `liga` y `dudas`.)
 *
 * Antes, 0.59.0 (EL HISTORIAL DE LO PAGADO. Mike, 1-oct:
 * «quiero ver en la pantalla de compras un historial completo de las
 * órdenes de compra ya pagadas». Nueva `GET /orgs/:o/ordenes/pagadas`
 * (quien paga): `{ filas, total }`, la más reciente arriba por `pagada_at`;
 * `?negocio_id=`, `?tipo=` y `?limite=` (500 si no se dice, hasta 5000).)
 *
 * Antes, 0.58.0 (EL EGRESO SABE SU PARTIDA. Mike, 1-oct, en
 * HOLCIM: «estos compromisos están pendientes pero son órdenes de compra ya
 * pagadas». Migración org 0026: `movimientos.partida_id`; al pagar una orden
 * el egreso lleva la partida, y lo pagado de una partida son sus egresos
 * por partida más los del proyecto a nombre de su proveedor sin otra
 * partida. La migración rellena lo ya pagado y vuelve a sumar las partidas.
 * `partida_id` es filtro de GET /movimientos.)
 *
 * Antes, 0.57.0 (ACCIONISTAS Y RETIROS DE UTILIDADES. Mike,
 * 30-sep: «un módulo de accionistas donde se registren pagos a los
 * accionistas como retiro de utilidades». Migración org 0025: tabla
 * `accionistas` (negocio_id, nombre, rfc, correo, telefono, porcentaje,
 * notas, activo), por el CRUD genérico; la escribe dash101. El retiro no
 * tiene tabla: es un egreso en `movimientos` con categoria
 * 'retiro_utilidades' (CATEGORIA_RETIRO_UTILIDADES) y contraparte_tipo
 * 'accionista', que se suma al tipo. La API revisa al escribir: nombre,
 * porcentaje entre 0 y 100, RFC y correo como en proveedores.)
 *
 * Antes, 0.56.1 (DEL MOVIMIENTO A SU ORDEN. Mike, 30-sep:
 * las órdenes pagadas «se pasen al movimiento con toda la info que traían».
 * Nueva `GET /orgs/:o/ordenes/de-movimiento/:mid` (quien ve dinero): la
 * orden, sus eventos y sus papeles a partir del egreso que dejó; 404 si el
 * movimiento no viene de una orden.)
 *
 * Antes, 0.56.0 (SUBÍTEMS. Mike, 30-sep: «los ítems puedan
 * tener subítems (…) trabajos o servicios que se le hacen complementarios a
 * un ítem (…) deben de nacer como requerimientos nuevos, pero ligados al
 * ítem al que se le aplica». Migración org 0024: `items.padre_id` y
 * `quell_elements.padre_id`. `items.padre_id` sale por el CRUD (filtro
 * `padre_id`; lo escribe dash101). En quell, `POST /plans/:p/elements`
 * acepta `padre_id` (la pieza padre, de la misma obra); la pieza nace con él
 * y, si es requerimiento y la obra está ligada, el ítem nuevo cuelga del
 * ítem de la pieza padre. Los elementos de la obra traen `padre_id`.)
 *
 * Antes, 0.55.0 (VARIAS CUENTAS BANCARIAS POR PROVEEDOR, CON
 * ALIAS, Y SUS DOCUMENTOS DE RESPALDO. Mike, 30-sep, para supply101: «se
 * puedan registrar más de una cuenta bancaria con un ALIAS» y «adjuntar uno
 * o más documentos de respaldo (carátula bancaria, foto de la tarjeta)».
 * Migración org 0023: tabla `proveedor_cuentas` (id, proveedor_id, alias,
 * clabe, banco, beneficiario, notas); la cuenta que ya estaba en columnas de
 * `proveedores` pasa a ser la fila «Principal» (las columnas se quedan). Va
 * por el CRUD genérico: supply101 y dash101 escriben; la API revisa la CLABE
 * como en `proveedores`. Los documentos van en `archivos` con
 * de_tabla = 'proveedores'; nueva `DELETE /orgs/:o/archivos/:id` (borra el
 * objeto de R2 y la fila; un cliente no).)
 *
 * Antes, 0.54.2 (EL DIRECTOR EDITA NOMBRE Y CORREO DE UN
 * INTEGRANTE. Mike, 30-sep: «quiero editar los datos de un integrante de la
 * empresa». `PATCH /admin/orgs/:o/miembros/:uid` acepta también `nombre` y
 * `correo`. El correo: 400 si no es válido, 409 correo_en_uso si ya es de
 * otra cuenta, 409 cuenta_compartida si la cuenta también es de otra
 * empresa o es superadmin (se cambia desde esa otra empresa, o desde
 * master101). Al cambiar el correo se suelta el google_sub. Bitácora:
 * `miembro.nombre` y `miembro.correo`. La respuesta trae `nombre`.)
 *
 * Antes, 0.54.1 (EL CONTRATISTA ENTRA A LA OBRA DESDE EL ÍTEM.
 * Mike, 30-sep, en Holcim: «en este ítem no me deja agregar a un
 * contratista». quell: `PUT /elements/:id/contratistas` ya no rechaza al
 * contratista que no está en la obra: lo mete a la obra con rol `con` en el
 * mismo paso, le manda el correo de acceso y contesta `entraron_a_la_obra`.
 * Nueva `GET /orgs/:o/quell/contratistas` (admin e int): los contratistas
 * vivos de la empresa, para el menú del ítem.)
 *
 * Antes, 0.54.0 (PROVEEDOR CON DATOS PARA PAGARLE. Mike,
 * 29-sep, para supply101: «dar de alta a un nuevo proveedor (…) nombre, RFC,
 * número de cuenta (CLABE y banco y beneficiario), email de contacto,
 * teléfono de contacto, ubicación (…) de Google Maps». Migración org 0022:
 * `proveedores.clabe`, `banco`, `beneficiario`, `direccion`, `maps_url`.
 * supply101 escribe proveedores por el CRUD genérico (nombre, rfc, correo,
 * telefono, clabe, banco, beneficiario, direccion, maps_url, notas). La API
 * revisa CLABE (18 dígitos y verificador), RFC (12 o 13) y correo al crear o
 * cambiar un proveedor: 400 `datos_invalidos` con `errores` por campo).
 * Antes: 0.53.1 (roster101: PUT /roster/:o/api/admin/
 * trabajadores/:id/equipo {equipo_id} cambia sólo el equipo, desde la lista
 * del panel; permiso de capturar. Mike, 29-sep: «no puedo asignar
 * trabajadores»). Antes: 0.53.0 (EQUIPOS DE TRABAJO en roster101. Mike,
 * 29-sep-2026: «agrupar por equipo de trabajo (…) esos equipos los doy de alta
 * yo, y ellos sólo seleccionan cuál de los disponibles es el suyo, o no tengo
 * equipo». Migración org 0021: `roster_equipos` y `roster_trabajadores.
 * equipo_id`. Panel: GET/POST/PUT/DELETE /roster/:o/api/admin/equipos (alta,
 * renombrar, apagar y borrar, con permiso de capturar); la lista trae
 * `equipo_nombre` y el catálogo; el detalle trae las opciones. Trabajador:
 * GET /api/equipos (los prendidos) y `equipo_id` en PUT /api/yo (vacío = sin
 * equipo; uno apagado o inexistente = 422). CSV con columna Equipo). Antes:
 * 0.52.1 (la liga del correo de «orden pagada» va a
 * supply101 —`URL_SUPPLY`/#/orden/:id—, no a esta API: ahí el navegador no
 * tiene sesión y veía `sin_sesion`. Mike, 29-sep-2026). 0.52.0 (FUSIONAR DOS PROYECTOS. Mike, 29-sep-2026:
 * «No puedo fusionar el proyecto, solo el cliente. Y quiero fusionar
 * proyectos». `POST /orgs/:o/proyectos/:id/fusionar {se_va_id, seco?}`: el
 * que se va le deja al que se queda ítems (que toman su cliente), partidas,
 * movimientos, órdenes, cotizaciones (`datos.proyecto_id`), archivos y su
 * obra de quell si el que se queda no tenía; contesta `movidos` por tabla y
 * `obra_suelta`. Sólo dueño y administración; `seco` sólo cuenta). Antes:
 * 0.51.0 (BORRAR UN CLIENTE O UN PROYECTO CON TODO LO
 * SUYO. Mike, 29-sep-2026: «no puedo borrar clientes de quote101». `POST
 * /orgs/:o/clientes/:id/borrar {modo?}` y `POST /orgs/:o/proyectos/:id/borrar
 * {modo?}`: se van partidas, ítems, proyectos y, con el cliente, sus
 * cotizaciones y su acceso al portal; las piezas y obras de quell se quedan
 * sueltas y se cuentan; las órdenes sin pagar quedan como gasto general. 409
 * `tiene_dinero` si hay movimientos; 409 `tiene_historia` si un ítem trae
 * avances, archivos o compromisos de otro proyecto, o hay archivos del
 * proyecto o del cliente. `modo: 'seco'` sólo cuenta). Antes:
 * 0.50.0 (UN SOLO NEGOCIO. Mike, 29-sep-2026: «borres
 * de dash (y de todas las plataformas) la opción de agregar diferentes
 * negocios (…) Todo es para un negocio nada más», y escogió fusionar lo que
 * ya existe. `POST /orgs/:o/negocios/fusionar {queda_id, seco?}` (dueño o
 * administración): todo lo de los demás negocios pasa al que se queda —las
 * tablas con `negocio_id` se descubren del esquema—, los productos con el
 * mismo código se juntan en el del que se queda, los demás negocios se
 * borran y los miembros acotados a un negocio quedan en «todos». En seco
 * sólo cuenta. La tabla `negocios` y la columna `negocio_id` se quedan:
 * lo que cambia es que hay uno, y las pantallas ya no crean ni cambian de
 * negocio). Antes:
 * 0.49.0 (PARTIDAS POR COTIZACIÓN Y EL BORRADOR DE LOS
 * REQUERIMIENTOS. Mike, 29-sep-2026: «dividir por partidas (grupos de
 * cotizaciones) los ítems (…) pestañas, tipo los libros de Excel», «los
 * requerimientos generados me deberían generar un borrador en quote dentro
 * del proyecto para poder enviarla al cliente a que me autorice» y «al
 * aprobarse los requerimientos cambia su código a alguno de mueble, puerta
 * etc.».
 *   · `POST /orgs/:o/cotizaciones/:id/aprobar` acepta `partida`; sin ella,
 *     las piezas nacen en la partida del nombre de la cotización. Cada
 *     cotización aprobada es una pestaña en dash101.
 *   · Una línea con `item_id` no crea una pieza: aprueba ESE ítem (el
 *     requerimiento) con su nombre, tipo, precio, cantidad y partida; su
 *     pieza del plano cambia de tipo y estrena código con el prefijo del
 *     tipo (PT-, MW-…), el mismo que queda en `items.clave`.
 *   · Un requerimiento levantado en quell en una obra ligada a un proyecto
 *     nace como ítem `cotizado` (tipo `requerimiento`, en cero, no suma) y
 *     cae como renglón «a mano» en el borrador «Requerimientos» del
 *     proyecto en quote101 (`datos.de_requerimientos = true`, uno abierto
 *     por proyecto; al aprobarse, el siguiente abre otro). Descartarlo o
 *     aprobarlo desde dash lo saca del borrador. La respuesta de alta de la
 *     pieza trae `item_id` y `cotizacion_id`. Sin obra ligada, nada cambia.
 *   · cotizador101 puede escribir `items.partida`). Antes:
 * 0.48.0 (LOS EQUIPOS DE TU LICENCIA. Mike, 28-sep-2026:
 * «un panel de selección de licencias en los equipos, similar a como le hace
 * adobe. Te abre una lista (con íconos) de los equipos en los que tienes
 * registrada la licencia y puedes escoger dar de baja uno».
 *   · D1 master 0009: `activaciones.nombre` y `activaciones.sistema`, etiqueta
 *     para reconocer la computadora; la huella sigue siendo un azar.
 *   · `POST /licencias/activar`, `/licencias/mia` y `/licencias/latido`
 *     aceptan `nombre` y `sistema` (windows | mac | linux) y los guardan.
 *   · `POST /licencias/equipos {programa} | {clave}` lista los equipos que
 *     ocupan lugar, con `es_de_aqui` si se manda `huella`.
 *   · `POST /licencias/soltar {huella, programa | clave}` da de baja uno, el
 *     que sea, y lo apunta con el correo de quien lo hizo. Soltar lo que ya
 *     está libre contesta `ya_estaba: true`, no un error.
 *   · La pantalla de activación (`/licencias/entrar`) enseña esa lista cuando
 *     no hay lugar, y al soltar uno reintenta sola. Trabajo del chat de
 *     draw101, aplicado por jr desde su parche.)
 * Antes: 0.47.0 (REEMBOLSOS: LA MISMA ORDEN, DE OTRO TIPO.
 * Mike, 28-sep-2026: «Necesito en dash un módulo para reembolsos. Que el
 * trabajador pueda pedir reembolsos y en dash le aparezcan (similar a las
 * Órdenes de compra). De hecho podría ser el mismo portal de supply, pero
 * poner una opción en el tipo de orden si es reembolso o compra».
 *   · `ordenes.tipo`: `compra` (todo lo que ya existía) o `reembolso`.
 *     `POST /orgs/:o/ordenes {tipo?}`; los reembolsos llevan folio `RE-`.
 *     Mismo buzón, mismo pagar/devolver/rechazar/corregir. Al pagar, el
 *     egreso lleva `categoria: 'reembolso'` y la contraparte es quien lo
 *     pidió, no un proveedor. Son salidas de dinero las dos.
 *   · `GET /orgs/:o/ordenes/buzon?tipo=compra|reembolso`: una pestaña, con
 *     sus propios totales. Sin `tipo`, todo junto como antes.
 *   · `GET /orgs/:o/ordenes/resumen?negocio_id=`: `{compras: {total,
 *     cuantas}, reembolsos: {total, cuantas}}` de lo que está en el buzón,
 *     para el inicio de dash101 (lo lee quien ve dinero). Los reembolsos
 *     pendientes restan del capital total.
 *   · `GET /orgs/:o/ordenes/permisos`: `{puede_comprar, puede_pagar}`.
 *   · En supply101, un miembro cuya lista de apps NO trae `supply` ya no
 *     recibe `app_no_permitida`: entra, y `POST /ordenes` con `tipo:
 *     'compra'` contesta 403 `compras_no_autorizadas` («Tu usuario no está
 *     autorizado para compras»); con `tipo: 'reembolso'` pasa. En las demás
 *     apps la puerta sigue igual.
 * Antes: 0.46.0 (APROBAR UNA COTIZACIÓN CREA SUS PIEZAS. Mike,
 * 23-sep-2026, con la hoja nueva de quote101: «cada renglón es un ítem que se
 * va agregando con su producto, su descripción y su cantidad (que define
 * cuántos ítems se crean de ese producto)», y se crean AL APROBAR.
 *   · `POST /orgs/:o/cotizaciones/:id/aprobar {proyecto_id, lineas[]}`, con
 *     cada línea `{nombre, descripcion?, codigo?, tipo?, cantidad, precio,
 *     producto_id?}` y `precio` de UNA pieza en centavos. Crea una fila de
 *     `items` por pieza, vendida, en el proyecto, con `clave` = el código y
 *     `origen` = la cotización y la línea. Varias piezas de una línea las
 *     amarra un producto: el que traía del catálogo o uno nuevo con los
 *     datos de la línea. Una sola pieza es su propio producto único.
 *   · Todo o nada, y una sola vez: la segunda contesta 409 `ya_aprobada`.
 *   · La cotización queda `estado: 'aceptada'` con `datos.aprobacion`, y ya
 *     no se edita (PATCH → 409 `ya_aprobada`). `aceptada` sólo la pone esta
 *     ruta.
 *
 * 0.45.1 (A QUIEN ES DUEÑO DE LA SUITE, SUS EMPRESAS
 * PRIMERO. Mike, 23-sep-2026: «sigue sin aparecer mi info en quote101». La
 * causa no era un negocio: era la EMPRESA. Para el superadmin, `/yo` lista
 * todas las empresas por nombre, y quote101 abre `orgs[0]`. El 22-sep se dio
 * de alta «BASE arquitectura», que por nombre va antes que «Forespot», y
 * desde entonces quote101 le abría a Mike esa empresa nueva, vacía.
 *   · `/yo` le pone primero al superadmin las empresas donde es miembro de
 *     verdad y luego las demás, cada grupo por nombre.
 *   · Cada empresa trae `miembro: boolean`, porque al superadmin `rol` le
 *     sale 'owner' en todas y no había forma de distinguirlas.
 *   · quell101, roster101 y dash101 no se vieron afectados: fijan su
 *     empresa por configuración (`ORG_ID`, `NEXT_PUBLIC_ORG`).
 *
 * 0.45.0 (UN NEGOCIO CON COSAS ADENTRO NO SE BORRA, Y
 * LO QUE YA QUEDÓ HUÉRFANO SE PUEDE ENCONTRAR. Mike, 23-sep-2026:
 * «desapareció mi info de quote». Con el selector de negocio de quote101 G83
 * puesto, seguía vacío en todos —y resultó ser otra empresa, ver 0.45.1—.
 *   · `clientes`, `proyectos`, `cotizaciones` y las demás tablas guardan su
 *     `negocio_id` SIN llave foránea (0001); sólo `cuentas`, conciliaciones
 *     y raya la tienen. Así que borrar un negocio sin cuentas se permitía y
 *     todo lo suyo quedaba apuntando a nada: invisible desde todas las apps,
 *     que filtran por un negocio que existe. Se lee como perdido sin que se
 *     haya borrado un solo cliente.
 *   · Desde aquí `DELETE /orgs/:o/negocios/:id` contesta 409 `en_uso` si
 *     CUALQUIER tabla que traiga `negocio_id` tiene renglones de ese negocio.
 *     Se revisan todas las que lo traen, no una lista a mano.
 *   · `GET /admin/orgs/:o/quote` (sólo superadmin, sólo lee): lo de quote101
 *     agrupado por el `negocio_id` que trae cada renglón —no por la lista de
 *     negocios—, con `existe: false` para los huérfanos, que salen primero,
 *     y la fecha de la última cotización de cada grupo para reconocer cuál
 *     era el trabajo de quién.
 *
 * 0.44.0 (UNA LICENCIA A TU NOMBRE ES EL PERMISO.
 * Encontrado el 23-sep-2026: Mike le activó a Alex su licencia de draw101 y
 * Alex no pudo entrar —«sin permiso»—, ni con Google ni con código. La
 * licencia estaba en `suscripciones`; lo que no había era una fila en
 * `usuarios` con ese correo, y las dos puertas de entrada la piden. No se
 * había visto porque las seis licencias anteriores eran de Mike y de Fer,
 * que ya eran de una empresa.
 *   · Quien tiene una licencia a su nombre y todavía no es de ninguna
 *     empresa YA PUEDE ENTRAR: la cuenta se hace sola la primera vez que la
 *     usa, en `cuentaPorLicencia` (`src/maestro.ts`). Esa cuenta por sí sola
 *     no abre nada —sin empresa no se ve ninguna—; nada más sirve para
 *     probar quién es y recoger su licencia.
 *   · Se hace al ENTRAR y no al crear la licencia porque una licencia puede
 *     nacer por otros caminos —Stripe, la tienda— y el hueco volvería a
 *     abrirse en cada uno. Las dos puertas —`POST /auth/codigo` y el regreso
 *     de Google— son el único lugar por donde se entra.
 *   · Basta con TENER licencia, aunque hoy no sea vigente: a quien se le
 *     venció hay que dejarlo entrar para que `POST /licencias/mia` le diga
 *     cuándo venció y qué pagar. «Sin permiso» ahí lo manda a buscar el
 *     problema donde no está.
 *   · `sin_permiso` en la pantalla de activar ya no quiere decir «no tienes
 *     cuenta»: quiere decir que ese correo no tiene ninguna licencia, y así
 *     lo dice ahora.
 *
 * 0.43.0 (EL REQUERIMIENTO, Y LOS CUATRO TIPOS DE
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

export const VERSION_CONTRATO = '0.75.0';

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
  /** T101-XXXX-XXXX-XXXX. Es lo que el cliente teclea al instalar. Desde la
   *  0.22.0 la columna guarda su HUELLA (HMAC con un secreto de `config`), no
   *  la clave: se ve una sola vez, al crearla. */
  clave: string;
  /* 0021 (nube de draw101, 0.22.0). Vivieron en schema/suscripcion-nube.ts
   * mientras nadie tocaba este archivo; se mudaron aquí el 29-sep. */
  /** Las últimas cuatro letras de la clave, para reconocerla en master101.
   *  Cuatro de doce no sirven para adivinar el resto. */
  clave_pista: string | null;
  /** La llave maestra de la cuenta, ya cifrada con lo que sale de su clave
   *  T101. El servidor la guarda y no puede abrirla: nace en la máquina del
   *  dueño. El panel no la devuelve nunca. */
  llave_envuelta: string | null;
  /** La sal del PBKDF2 con que se envolvió. Tampoco sale por el panel. */
  llave_sal: string | null;
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
  /** Cómo se llama la computadora (el nombre de Windows) y en qué sistema va.
   *  Etiqueta para que su dueño la reconozca en su lista; la huella sigue sin
   *  salir de aquí (ver migración 0009). Nulos en las activadas antes de la
   *  0.21.4: se llenan solas en el siguiente latido. */
  nombre: string | null;
  sistema: string | null;
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
  /** 2-oct · el dominio propio de la empresa (acme.com), o null. De él salen
   *  los nombres de sus apps: roster101.acme.com… (DOMINIOS.md). */
  dominio: string | null;
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
  /** Para el superadmin salen TODAS, primero en las que es miembro
   *  (`miembro: true`) y luego las demás, cada grupo por nombre (0.45.1).
   *  Para los demás, sólo las suyas, todas con `miembro: true`. */
  /** `negocios` va siempre `[]` desde 0.63.0: ya no hay negocios. Se queda
   *  en la forma por compatibilidad con quien lo lea. */
  orgs: Array<{ id: string; nombre: string; rol: Rol; apps: string[]; negocios: string[]; miembro: boolean }>;
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

/** La empresa (0.62.0; tabla `empresa` desde 0.63.0, un solo renglón con
 *  id 'empresa'). Es lo que antes se editaba en `negocios`: desde el 1-oct
 *  no hay negocios, hay UNA empresa. */
export interface Empresa {
  /** Siempre 'empresa'. */
  id: string;
  nombre: string;
  rfc: string | null;
  moneda: Moneda;
  /** Día en que toca conciliar: 0 domingo … 6 sábado. Por omisión el lunes. */
  dia_conciliacion: number;
}

/** Lo de quote101 de una empresa, en cuatro cifras (0.63.0). Lo lee
 *  master101 por `GET /admin/orgs/:o/quote`. Hasta 0.62.0 era una lista por
 *  negocio con huérfanos; sin negocios ya no hay de qué quedar huérfano. */
export interface ConteoQuote {
  clientes: number;
  proyectos: number;
  cotizaciones: number;
  ultima_cotizacion: string | null;
}

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: 'banco' | 'caja' | 'credito' | 'otro';
  banco: string | null;
  moneda: Moneda;
  /** centavos */
  saldo_inicial: number;
  /** centavos. CALCULADO AL SALIR (0.60.0): `saldo_inicial` más todos los
   *  ingresos de la cuenta menos todos sus egresos, sumado en la base. No se
   *  guarda ni se escribe desde fuera; viene en la lista y en el detalle. */
  saldo: number;
  creado_at: string;
}

export interface Cliente {
  id: string;
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

/** Una cuenta bancaria de un proveedor (0023, contrato 0.55.0). Un
 *  proveedor puede tener varias; el alias es para saber cuál es («Principal»,
 *  «Nómina»…). La CLABE son 18 dígitos que cuadran; la API los revisa. Los
 *  documentos de respaldo (carátula, foto de la tarjeta) van en `archivos`
 *  con de_tabla = 'proveedores' y de_id = el proveedor. */
/** 0.72.0 · Una parcialidad del plan de pagos de un proyecto: cuándo se
 *  espera cobrar cuánto. `monto` en CENTAVOS; `fecha` AAAA-MM-DD. CRUD
 *  genérico `/orgs/:o/plan_pagos` (filtro `proyecto_id`). */
export interface PlanDePago {
  id: string;
  proyecto_id: string;
  concepto: string;
  fecha: string;
  monto: number;
  creado_at: string;
  actualizado_at: string | null;
}

/** 0.71.0 · La nómina programada: cada cuánto se paga la raya, qué día y
 *  cuánto suele ser. `GET`/`PUT /orgs/:o/nomina/programa`. `monto` en
 *  CENTAVOS. `dia_semana` sólo con 'semanal' (0 domingo … 6 sábado);
 *  `dia_del_mes` sólo con 'mensual' (1–31, se recorta al mes corto); la
 *  quincenal paga el 15 y el último día del mes. */
export interface ProgramaDeNomina {
  activo: boolean;
  frecuencia: 'semanal' | 'quincenal' | 'mensual';
  dia_semana: number | null;
  dia_del_mes: number | null;
  monto: number;
  nota: string;
  actualizado_at: string | null;
}

/** 0.71.0 · Lo que contesta `GET /orgs/:o/nomina/programa`. */
export interface NominaProgramada {
  programa: ProgramaDeNomina | null;
  /** El total (centavos) del último corte pagado, o null si nunca se ha pagado uno. */
  ultimo_total: number | null;
  /** Los cortes abiertos: ya tienen total y fecha, la proyección los usa tal cual. */
  borradores: Array<{ id: string; periodo_inicio: string; periodo_fin: string; total: number }>;
}

/** 0.70.0 · Lo que de un pago le toca a un ítem (el anticipo). */
export interface MovimientoItem {
  id: string;
  movimiento_id: string;
  item_id: string;
  /** El del movimiento; lo pone la API. */
  proyecto_id: string | null;
  /** Centavos, mayor que cero. La suma de un movimiento no pasa de su monto. */
  monto: number;
  creado_at: string;
}

export interface ProveedorCuenta {
  id: string;
  proveedor_id: string;
  alias: string;
  clabe: string;
  banco: string | null;
  beneficiario: string | null;
  notas: string | null;
  creado_at: string;
}

/** 0.67.0 · Lo que hace falta para pagarle al proveedor de una orden, en la
 *  orden misma (Mike, 5-oct-2026: «en las órdenes de compra, ahí mismo en la
 *  orden (desde dash) aparezcan los datos bancarios o de pago del proveedor
 *  para hacer ese pago»). Viene en `GET /orgs/:o/ordenes/:id` como
 *  `proveedor`; es `null` cuando la orden sólo trae el nombre escrito a mano
 *  (`proveedor_id` nulo) o el proveedor ya no existe. `cuentas` son sus
 *  filas de `proveedor_cuentas` (0023, donde vive la verdad); si el
 *  proveedor sólo trae la cuenta en sus columnas, sale como «Principal». Sin
 *  dirección ni notas: es para pagar, no la ficha entera. */
export interface ProveedorDePago {
  id: string;
  nombre: string;
  rfc: string | null;
  correo: string | null;
  telefono: string | null;
  terminos_pago: string | null;
  cuentas: Array<Pick<ProveedorCuenta, 'id' | 'alias' | 'clabe' | 'banco' | 'beneficiario' | 'notas'>>;
}

/** Un accionista de la empresa (0025, contrato 0.57.0). Mike, 30-sep-2026:
 *  «un módulo de accionistas donde se registren pagos a los accionistas como
 *  retiro de utilidades». El retiro NO es una tabla: es un `Movimiento` de
 *  tipo egreso con `categoria` = CATEGORIA_RETIRO_UTILIDADES,
 *  `contraparte_tipo` = 'accionista' y `contraparte_id` = este id. Así baja
 *  la cuenta de la que salió y se ve en Movimientos, conciliación y flujo; la
 *  categoría lo aparta de los gastos. `porcentaje` es la participación (0 a
 *  100), opcional. Lo escribe dash101 y lo ve quien ve dinero. */
export interface Accionista {
  id: string;
  nombre: string;
  nombre_norm: string;
  rfc: string | null;
  correo: string | null;
  telefono: string | null;
  porcentaje: number | null;
  notas: string | null;
  activo: boolean;
  creado_at: string;
}

/** La categoría del egreso que es un retiro de utilidades (0.57.0). */
export const CATEGORIA_RETIRO_UTILIDADES = 'retiro_utilidades';
/** Un egreso que no es de ningún proyecto: renta, máquinas, herramienta,
 *  licencias de software (0.60.0). Mike, 1-oct: «debe haber un concepto de
 *  gastos generales en el tipo de egreso. No va a ningún proyecto el gasto,
 *  sino son gastos del negocio en general». Es un egreso normal, de una
 *  cuenta, con `proyecto_id` vacío y esta categoría: baja el saldo de la
 *  cuenta y no toca ningún proyecto. */
export const CATEGORIA_GASTO_GENERAL = 'gasto_general';

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
  /* 0022 · la cuenta para pagarle y dónde está (0.54.0). La CLABE son 18
   * dígitos con su dígito verificador; el RFC, 12 o 13 caracteres. La API
   * los revisa al escribir. `maps_url` es la liga que Google Maps comparte. */
  clabe: string | null;
  banco: string | null;
  beneficiario: string | null;
  direccion: string | null;
  maps_url: string | null;
  /* 0031 · materiales (lo que se compra) o servicios (un contratista:
   * herrería, instalación…). Mike, 5-oct-2026: «en proveedores hay 2 tipos».
   * Lo que ya existía quedó como materiales. */
  tipo: TipoProveedor;
  creado_en_app: string;
  creado_at: string;
}
export const TIPOS_PROVEEDOR = ['materiales', 'servicios'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];

/* ─────────────── el cronograma de la obra (0.68.0) ───────────────
 *
 * Mike, 5-oct-2026: «necesito en quell poder configurar un cronograma (…)
 * asignar tiempo de fabricación total, y dar la opción a definir tiempo de
 * entrega de material, fabricación e instalación (…) a cada una asignarle un
 * proveedor o contratista (…) poder encadenar tareas (…) exportar (…)
 * Microsoft Project o Excel». Vive en el motor de obra:
 *
 *   GET  /orgs/:o/quell/projects/:id/cronograma        → Cronograma
 *   PUT  /orgs/:o/quell/projects/:id/cronograma        { inicio?, dias_objetivo?, tareas: TareaEntrada[] } → Cronograma
 *   GET  /orgs/:o/quell/projects/:id/cronograma.xlsx   el Excel (dos hojas)
 *   GET  /orgs/:o/quell/projects/:id/cronograma.xml    el archivo de Microsoft Project (MSPDI)
 *
 * Sólo quien dirige la obra. Los días son LABORABLES DE LUNES A SÁBADO
 * (decisión de Mike, 5-oct); las fechas no se guardan: se calculan cada vez.
 * Una tarea es una etapa de una sección de una pieza; dentro de la sección
 * las etapas van material → fabricación → instalación; entre secciones y
 * piezas lo que encadena es `depende_de` (arranca cuando ésa termina). */
/** 'otra' desde 0.69.0: una fase de más, con su nombre. */
export type EtapaCronograma = 'material' | 'fabricacion' | 'instalacion' | 'otra';
export interface TareaEntrada {
  /** Se conserva si viene; sin él, o con uno que empiece con «nuevo-», estrena. */
  id?: string;
  element_id: string;
  seccion?: string;
  orden?: number;
  etapa: EtapaCronograma;
  /** 0.69.0: cómo se llama la fase (si no, el nombre de su etapa). */
  nombre?: string | null;
  /** 0.69.0: el orden dentro del proceso; sin él, el de la etapa (0, 10, 20). */
  pos?: number;
  /** Laborables, de 1 en adelante. */
  dias: number;
  proveedor_id?: string | null;
  /** 0.73.0: el responsable cuando es un contratista de la obra (usuario de quell101 con rol 'con'). Proveedor o contratista, no los dos. */
  contratista_id?: string | null;
  /** 0.73.0: lo que cuesta la fase, en CENTAVOS. Nace del porcentaje por tipo de ítem; se corrige a mano. */
  costo?: number;
  /** El id (o el id provisional) de la tarea que tiene que terminar antes. */
  depende_de?: string | null;
  inicio_fijo?: string | null;
  notas?: string | null;
}
/** 0.70.0 · Los dos candados de una pieza. */
export interface CandadosPieza {
  /** La fecha del anticipo (la del pago más antiguo que le tocó, o la de la etapa 2), o null. */
  anticipo: string | null;
  /** Centavos que le han tocado en pagos. */
  anticipo_monto: number;
  /** La fecha en que quedó definido el diseño, o null. */
  diseno: string | null;
  /** Si tiene ítem en dash101 (sin él no hay dónde registrar el anticipo). */
  ligado: boolean;
  /** Los dos cumplidos. */
  listo: boolean;
  /** Desde cuándo pueden correr sus fases: con los dos, la fecha más tardía; sin alguno, hoy. */
  arranque: string;
}
export interface TareaCronograma {
  id: string; project_id: string; element_id: string; code: string; name: string;
  seccion: string; orden: number; etapa: EtapaCronograma; nombre: string | null; pos: number; dias: number;
  proveedor_id: string | null; proveedor_nombre: string | null; proveedor_tipo: TipoProveedor | null;
  /** 0.73.0 */
  contratista_id: string | null; contratista_nombre: string | null; costo: number;
  depende_de: string | null; inicio_fijo: string | null; notas: string | null;
  /** Calculados: AAAA-MM-DD, y las tareas de las que depende (implícitas y explícitas). */
  inicio: string; fin: string; previas: string[];
}
export interface Cronograma {
  id: string; nombre: string;
  /** El arranque ya movido a día laborable; `inicio_guardado` es lo que se escribió (o null = hoy). */
  inicio: string; inicio_guardado: string | null;
  dias_objetivo: number | null; fin: string; dias_laborables: number; excede: boolean;
  calendario: 'lunes-sabado';
  etapas: Array<{ clave: EtapaCronograma; nombre: string }>;
  items: Array<{ element_id: string; code: string; name: string; type: string; plan_name: string; padre_id: string | null; inicio: string | null; fin: string | null; dias: number; candados: CandadosPieza; /** 0.73.0: la suma de los costos de sus fases, centavos. */ costo: number; tareas: TareaCronograma[] }>;
  tareas: TareaCronograma[];
  proveedores: Array<Pick<Proveedor, 'id' | 'nombre' | 'tipo'>>;
  /** 0.73.0: los contratistas vivos de la obra, para «responsable». */
  contratistas: Array<{ id: string; nombre: string; empresa: string | null }>;
  /** 0.73.0: la suma de los costos de todas las fases, centavos. */
  costo: number;
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
  /** 0.73.0 · Si nace de una fase del cronograma de quell101: de qué fase y
   *  de qué obra, y cuándo se espera pagarla (AAAA-MM-DD). Las escribe el
   *  motor; dash101 no edita ni borra esa partida (409 del_cronograma). */
  tarea_id: string | null;
  obra_id: string | null;
  fecha_esperada: string | null;
  creado_at: string;
  actualizado_at: string | null;
}

export interface Proyecto {
  id: string;
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

/** Eje comercial. No se condiciona con la etapa. Desde 0.64.0 la API sólo
 *  escribe 'cotizado' (fuera del alcance) y 'vendido' (dentro); 'cancelado'
 *  sigue en el tipo porque el CHECK de la 0001 lo admite y una app vieja
 *  puede mandarlo —se guarda como 'cotizado'—. */
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
  proyecto_id: string | null; // NULL mientras solo está cotizado
  cliente_id: string;
  clave: string | null;
  /** A qué producto del catálogo pertenece (0017). NULL = el ítem es su
   *  propio producto único, que es como nacen todos. */
  producto_id: string | null;
  /** De qué ítem es complemento (0024, contrato 0.56.0): un SUBÍTEM es un
   *  trabajo o servicio que se le hace a otro ítem. Para el dinero, la
   *  cotización y las etapas es un ítem más; la liga es lo único que
   *  cambia. NULL = ítem de primer nivel. En quell nace como requerimiento
   *  desde la pieza padre. */
  padre_id: string | null;
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
  tipo: 'ingreso' | 'egreso';
  /** centavos */
  monto: number;
  fecha: string;
  cuenta_id: string;
  proyecto_id: string | null;
  item_id: string | null;
  /** 0026 (0.58.0): de qué partida del proyecto es este egreso. Lo pone la
   *  API al pagar una orden; lo pagado de la partida se suma por aquí. */
  partida_id: string | null;
  /** `accionista` desde 0.57.0: un retiro de utilidades. */
  contraparte_tipo: 'cliente' | 'proveedor' | 'personal' | 'accionista' | 'otro';
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
 *  empresa —eso es `Empresa`— sino a cómo esa app trabaja. `valor` se lee
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
  'cuentas',
  'clientes',
  'proveedores',
  'proveedor_cuentas',
  'movimiento_items',
  'plan_pagos',
  'accionistas',
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
  /* Lo que una migración deja para correr al arrancar (0036): la base lo
   * corre una vez y anota cuándo y qué hizo. No sale por ninguna ruta. */
  'pendientes_arranque',
  /* La empresa (0027): un solo renglón con nombre, RFC, moneda y día de
   * conciliación. No sale por el CRUD genérico: va por GET/PATCH /empresa. */
  'empresa',
  /* La bitácora del alcance (0028): entra/sale, quién, app, motivo, cuándo.
   * Append-only; se lee por GET /orgs/:o/items/:id/alcance. */
  'alcance_movimientos',
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
  'roster_papelera', 'roster_administradores', 'roster_equipos',
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
  'quell_tareas',   // 0031 · el cronograma de la obra (0.68.0)
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
      /** 0.66.0 · la obra de quell101 ligada al proyecto, o null. */
      obra: { id: string; nombre: string; estado: string } | null;
      items: Array<
        Pick<Item, 'id' | 'clave' | 'nombre' | 'monto' | 'moneda' | 'estado' | 'etapa' | 'etapa_at' | 'fecha_entrega'> & {
          /** 0.66.0 · las piezas del plano que cuelgan del ítem, con cuántos
           *  planos (documentos vivos) tiene cada una. */
          piezas: Array<{ id: string; obra_id: string; codigo: string | null; docs: number }>;
        }
      >;
    }
  >;
  /** centavos */
  totales: { vendido: number; cobrado: number; saldo: number; avance: number };
  pagos: Array<Pick<Movimiento, 'id' | 'fecha' | 'monto' | 'proyecto_id' | 'descripcion'>>;
  /** 0.66.0 · los puntos por definir: las dudas abiertas que el taller le
   *  hizo al cliente, en todas sus obras, la más vieja primero. */
  pendientes: Array<{
    id: string; texto: string; created_at: string;
    obra_id: string; obra: string;
    element_id: string | null; codigo: string | null; pieza: string | null;
    quien: string | null;
  }>;
}

/* ─────────────── WebSocket (§8) ─────────────── */

export type Aviso =
  | { t: 'item.etapa'; id: string; etapa: Etapa; clave: string | null; at: string }
  | { t: 'item.cambio'; id: string }
  | { t: 'movimiento.nuevo'; id: string; proyecto_id: string | null }
  | { t: 'proyecto.cache'; id: string; precio_venta: number; cobrado: number; avance: number }
  | { t: 'conciliacion.nueva'; id: string; diferencia_total: number }
  /* 0.27.0 · se pagó una raya. Va al canal del dinero porque son N egresos
   * de golpe: una pantalla de saldos abierta tiene que enterarse. */
  | { t: 'raya.pagada'; id: string };

/* ─────────────── el alcance de un ítem (0.64.0) ───────────────
 *
 * Mike, 2-oct-2026: «Hay que eliminar el estado de los ítems de "cancelado" y
 * solo existirá "en alcance" o "fuera de alcance". Así hay una lista
 * unificada de las cosas que están requeridas pero aún no se confirman, o se
 * confirmaron y se cancelaron, pero no pasan a otra lista, regresan a fuera
 * de alcance; solo en la bitácora sí aparecerá como "se sacó del alcance" y
 * si se agrega de nuevo aparecerá después "se agregó al alcance" con su fecha
 * y quién la agregó.»
 *
 * Antes (0.31.0) eran cuatro casos —dentro, no aprobado, cancelado y
 * descartado— y la clasificación salía de `estado` más `aprobado_at`. Ya no:
 * la regla vive aquí, en el archivo que las tres apps copian tal cual, y sale
 * de UN dato. La historia —cuándo entró, cuándo salió, quién y por qué— ya no
 * se deduce de columnas: se lee de la bitácora `alcance_movimientos`.
 */

export type AlcanceItem = 'dentro' | 'fuera';

/** En qué parte del alcance está un ítem.
 *
 *   · `dentro` — vendido. Suma, se fabrica, sale en el plano.
 *   · `fuera`  — todo lo demás: el requerimiento que nadie ha aprobado, lo
 *                que estuvo dentro y se sacó. Una sola lista.
 */
export function alcanceDeItem(item: { estado?: string | null }): AlcanceItem {
  return String(item.estado ?? 'cotizado') === 'vendido' ? 'dentro' : 'fuera';
}

/** Un renglón de la bitácora del alcance (`GET /orgs/:o/items/:id/alcance`). */
export interface MovimientoAlcance {
  id: string;
  item_id: string;
  proyecto_id: string | null;
  /** `entra` = se agregó al alcance; `sale` = se sacó del alcance. */
  accion: 'entra' | 'sale';
  /** Correo de quien lo movió. `null` en lo sembrado por la migración 0028:
   *  nunca se guardó, y la pantalla lo dice así en vez de inventar un nombre. */
  quien: string | null;
  app: string | null;
  motivo: string | null;
  at: string;
}

/** Lo que se enseña de cada movimiento, en palabras de Mike. */
export const NOMBRE_MOVIMIENTO_ALCANCE: Record<MovimientoAlcance['accion'], string> = {
  entra: 'Se agregó al alcance',
  sale: 'Se sacó del alcance',
};

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
  dentro: 'En alcance',
  fuera: 'Fuera de alcance',
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

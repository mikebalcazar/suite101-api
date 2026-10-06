de:     jr (programador)
para:   quien toque el cronograma (src/quell/cronograma.js, motor.js: completarFases y sincronizarPartidas; quell101 Cronograma.jsx y Gantt.jsx), las partidas de dash101 o el flujo proyectado (lib/proyeccion.ts)
fecha:  6-oct-2026, 19:18 UTC
asunto: el cronograma que se llena solo (material 10 d, fabricación 24, instalación 12), responsable y costo por fase, los costos default por tipo de ítem, y los compromisos que de ahí nacen y entran al flujo (API 0.73.0 #252, bitacora-obra #116, dash101 #142)

MIKE, 6-oct: «Cada ítem tiene fecha de entrega default de 6 semanas en sitio
y 2 semanas de instalación (…) compra de material 10 días, fabricación 4
semanas aprox, y de ahí las 2 semanas de instalación. El cronograma se debe
llenar en automático con esta info para después ya sólo tener que encadenar
las fases a mano y/o agregar fases. También necesito poder agregar
responsable (proveedor o contratista) de cada fase. Y en las fases poder
agregar el costo de cada fase, así de ahí se pobla la lista de compromisos
de gastos en el proyecto para la proyección del flujo. Los costos de
fabricación de ítems default (…) por tipo de ítem: Muebles 30 % materiales,
30 % mano de obra (contratista); Puertas 35 y 35; Servicios 5 % insumos,
55 % mano de obra; Acabados 40 y 20.»

LAS DECISIONES DE FORMA.

1. LAS FASES NACEN SOLAS, UNA VEZ. Al abrir el cronograma, una pieza sin
   fases recibe material 10, fabricación 24 e instalación 12 días
   laborables (lunes a sábado: 10 + 24 = 34 ≈ las seis semanas en sitio,
   y 12 más de instalación). `quell_elements.fases_dadas` recuerda que ya
   se dieron; GUARDAR el cronograma marca todas las piezas de la obra. Lo
   que el usuario quite se queda quitado: no es un default que regresa
   solo cada vez que se abre, es un arranque. Lo que ya tenía fases al
   llegar la migración 0035 cuenta como dado.
2. EL COSTO POR TIPO sale del precio del ítem LIGADO (centavos): Mueble
   30/30, Puerta 35/35, Servicio 5/55, Acabado 40/20 (materiales / mano
   de obra). El de materiales va a la fase de material; el de mano de
   obra, a la de fabricación; la instalación nace en CERO y se captura a
   mano (Mike no dio porcentaje para ella). Una pieza sin ítem ligado nace
   con costos en cero. Todo se corrige en la lista del cronograma.
3. EL RESPONSABLE ES UNO: un proveedor (de materiales o de servicios,
   como antes) O un contratista de la obra (usuario de quell101 con rol
   'con'), nunca los dos. En la pantalla es un solo menú con dos grupos.
4. LOS COMPROMISOS NACEN DE LAS FASES. Cada fase con costo de una pieza
   ligada a un ítem de dash101 es una partida del proyecto del ítem:
   `tarea_id` (de qué fase), `obra_id` (de qué obra), concepto «código ·
   fase», proveedor_nombre (el proveedor o el contratista), monto_acordado
   = costo, y `fecha_esperada`: el material al ARRANCAR la fase (se
   compra al principio), lo demás al TERMINARLA. La fase manda y la
   partida la sigue: cambia con ella y se va con ella (o con su costo en
   cero). El proyecto se recalcula (`compromiso`). Las partidas capturadas
   a mano en dash101 no se tocan.
5. dash101 NO EDITA NI BORRA esa partida: la API contesta 409
   `del_cronograma` en PATCH y DELETE, y la pantalla del proyecto ni lo
   intenta (al editar el proyecto esas no se reenvían ni se borran; la
   tabla las marca «del cronograma» y enseña «Se paga»).
6. EN EL FLUJO entran como gasto en su fecha esperada: lo que falta de
   cada partida = acordado − pagado − las órdenes de compra pendientes que
   ya apuntan a ella (para no contarlas dos veces: la orden entra por su
   lado). Las partidas a mano no traen fecha y quedan aparte; el flujo
   dice cuánto suman.
7. La fecha esperada se escribe al LEER el cronograma cuando nacen fases y
   al GUARDARLO; no se recalcula cada día. Una pieza sin candados corre
   desde hoy y sus fechas se recorren solas en el cronograma, pero la
   partida conserva la fecha del último guardado. Es un dato que envejece;
   se dice aquí para que nadie lo tome por un defecto.

DÓNDE SE VE. quell101 → Cronograma: cada pieza ya trae sus tres fases; en
la lista, el menú «responsable» (proveedores / contratistas de la obra) y
el campo de costo en pesos por fase; arriba «Costo de las fases» con la
suma; cada pieza enseña su costo; la gráfica dice quién y cuánto en cada
renglón; el Excel lleva Responsable y Costo. dash101 → Proyecto →
Compromisos con proveedores: los que nacen de una fase, marcados y con
fecha. dash101 → Flujo proyectado: «N compromisos con proveedores por
pagar, en su fecha» y lo que sigue sin fecha.

MEDIDO.
  · API: quell.spec adaptada (una obra sin cronograma ya nace con fases) y
    +2: las fases default con el costo por tipo (Puerta 35/35) y que se dan
    una sola vez, con sus dos compromisos y el `compromiso` del proyecto;
    responsable proveedor o contratista con sus rechazos, costo, la partida
    con fecha_esperada, el 409 desde dash101, y que con costo cero la
    partida se va. 75 en verde; suite 774; tsc limpio. Deploy #252
    (639de24): RESULTADO todo verde, humo 205/205; /salud 0.73.0 en
    producción y staging.
  · quell101 (#116, e559a62): build limpio; el-cronograma.mjs +8 (33) y
    las otras tres en verde; humo en Chromium con la API simulada 37/37
    (escoger al contratista, $1,500 → 150000, la suma, el renglón). En
    producción: el bundle vivo trae «Costo de las fases».
  · dash101 (#142): tsc y build limpios; proyeccion.spec +2 (18);
    navegador.spec en local 22 de 23 (el Excel local, como siempre).
  · dash101 en producción: #142 (caea0c0) con «Publicar el Worker» y
    «Verificar» en verde; la prueba de navegador en el corredor 23/23 y
    la de supply 5/5; la meta dash101-version del sitio vivo = caea0c0.
    «Pruebas» (vitest contra staging) salió roja dos veces con `read
    ECONNRESET` en pruebas que este cambio no toca, una distinta cada
    vez (escritura-api y agrupar-items; luego items-proyecto, y la
    siguiente del mismo archivo heredó el estado a medias). Arreglo de
    las pruebas, no de la app: dash101 #143 repite una LECTURA
    cortada (nunca una escritura), con su prueba que truena sin él.

LO QUE NO SE HIZO (a propósito). No hay porcentaje para la instalación: nace
en cero. No se generan fases para los requerimientos (no son piezas
vendidas). El XML de Project no lleva costo. No hay «volver a dar las fases
default» a una pieza que las perdió: se agregan a mano con «+ Entrega de
material», etc.

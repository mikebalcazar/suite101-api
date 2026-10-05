de:     jr (programador)
para:   quien toque el motor de obra (cronograma.js, quell_tareas), la pantalla de quell101 (Cronograma.jsx) o los proveedores en dash101 y supply101
fecha:  5-oct-2026, 23:20 UTC
asunto: el cronograma de la obra en quell101 —días de lunes a sábado, etapas con proveedor, procesos encadenados, Excel y Project— y el tipo del proveedor en todas las apps (API 0.68.0 #241, bitacora-obra #111, dash101 #137)

MIKE, 5-oct: «necesito en quell poder configurar un cronograma, pero algo
muy amigable (…) 1) asignar tiempo de fabricación total, y dar la opción a
definir tiempo de a) entrega de material b) fabricación c) instalación, y a
cada una de esas etapas asignarle un proveedor o contratista (los
contratistas debemos darlos de alta como proveedores, pero en proveedores
hay 2 tipos: 1. materiales 2. servicios; eso debe registrarse para todos los
proveedores en todas las plataformas). 2) Poder encadenar tareas (…) dentro
del mismo ítem puede haber 2 ó 3 procesos (…) herrería, luego gabinetes,
luego cubiertas (…) sólo se encadenan las instalaciones (…). 3) Poder
exportar el cronograma en un formato comercial, ej. Microsoft Project, o en
un Excel». Con botones decidió que los días se cuentan DE LUNES A SÁBADO.

LAS DECISIONES DE FORMA.

1. Las cuentas viven en UN solo lugar: `src/quell/cronograma.js`, puro, sin
   base de datos. La pantalla captura y enseña; las fechas las pone el
   servidor y son las mismas que salen en el Excel y en el archivo de
   Project. Si mañana cambia una regla (un festivo, el sábado medio día)
   se cambia ahí y las tres salidas cambian juntas.
2. Una tarea es UNA ETAPA de UN PROCESO de UNA PIEZA (`quell_tareas`:
   element_id, seccion, etapa, dias, proveedor_id, depende_de, inicio_fijo).
   Dentro de un proceso el orden no se pregunta: material → fabricación →
   instalación. Entre procesos de la misma pieza, el que nace encadena su
   instalación a la instalación del anterior (lo de Mike: «sólo se
   encadenan las instalaciones, las tareas anteriores se pueden avanzar»).
   Y cualquier tarea puede esperar a otra cualquiera de la obra con
   `depende_de` («Después de…» en la pantalla). Un ciclo se rechaza con
   palabras («Las cadenas se muerden la cola…»).
3. El tipo del proveedor es una columna, no una tabla aparte:
   `proveedores.tipo` ∈ {materiales, servicios}, materiales por omisión
   (todo lo que ya existía queda como materiales; nada se reclasifica
   solo). La API lo valida en el CRUD genérico; dash101 y supply101 lo
   preguntan al dar de alta; el cronograma ofrece materiales para la
   entrega de material y servicios para fabricar e instalar, con «(el
   taller)» como opción de hacerlo uno mismo.
4. El arranque es un número: una pieza sin tiempo pide «Tiempo total» (se
   guarda como fabricación). Desglosar y agregar procesos es opcional.
   Mike pidió «muy amigable»; la pantalla no obliga a decidir nada que no
   se quiera decidir todavía.
5. Se guarda solo (PUT entero, 0.7 s después del último cambio). Una
   respuesta vieja no pisa lo que se tecleó mientras tanto: la pantalla
   cuenta cambios y sólo adopta la respuesta si no hubo otro en medio.

LA API (0.68.0). Migración org 0031: `proveedores.tipo`,
`quell_projects.cronograma_inicio` y `cronograma_dias`, tabla `quell_tareas`.
Rutas (sólo quien dirige la obra; 403 con palabras para los demás):
  GET  /orgs/:o/quell/projects/:id/cronograma       → fechas contadas,
       items con inicio/fin/días, tareas con inicio/fin/previas,
       proveedores con tipo, `fin`, `dias_laborables`, `excede`
  PUT  …/cronograma  {inicio, dias_objetivo, tareas:[…]}  reemplaza entero
       y contesta con las fechas; los ids `nuevo-*` estrenan
  GET  …/cronograma.xlsx  (hojas «Cronograma» y «Resumen»)
  GET  …/cronograma.xml   (MSPDI: calendario lunes a sábado, resumen por
       pieza y proceso, tareas con duración en horas, predecesoras fin→inicio)
`proveedores` acepta `tipo` y se filtra con `?tipo=servicios`.

quell101 (#111). Vista `cronograma` (barra lateral y selectores de arriba,
sólo staff; la dirección #/p/OBRA/cronograma para los demás es el plano).
Arriba: arranca el, días prometidos, termina el (en rojo y diciendo cuántos
días si se pasa). Una tarjeta por pieza; «Desglosar», «+ Otro proceso»,
«Después de…», Excel, Project.

dash101 y supply101 (#137). «Tipo» al dar de alta y al editar un proveedor;
la lista dice de qué tipo es cada uno; el alta rápida de supply101 lo
pregunta y vuelve a materiales al limpiar.

MEDIDO.
- API: 68 pruebas en quell.spec (calendario: el domingo no existe, 5 días
  desde jueves terminan martes; cadenas y ciclo; tipo del proveedor 400 /
  por omisión / filtro; PUT con fechas y objetivo excedido; rechazos;
  Excel y XML con 10 tareas y predecesoras; permisos). Suite entera 754 en
  verde, tsc limpio. Con el código viejo fallan 6.
- Deploy «Publicar API»: RESULTADO todo verde; /salud producción y staging
  contrato 0.68.0; la ruta del cronograma sin sesión contesta 401.
- quell101: pruebas/el-cronograma.mjs, 26 revisiones; producción sirve el
  bundle con la pantalla (index-BSiYCekQ.js trae «cronograma.xlsx»,
  «Tiempo total», «Otro proceso»).
- dash101: escritura-api.spec 15 en verde contra staging (crea uno de
  servicios y lo lee); supply101 el-proveedor-nuevo.mjs todo en orden.

LO QUE NO SE HIZO (a propósito). No hay festivos ni horas por día: un día es
un día laborable de lunes a sábado. No se le avisa a nadie por correo. La
pantalla no sale en la barra de abajo del celular (cabe mal); se llega por
los selectores de arriba, que sí se ven ahí. La fecha fija por tarea
(`inicio_fijo`) existe en la API pero la pantalla todavía no la pregunta.

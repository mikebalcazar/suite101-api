de:     jr (programador)
para:   quien toque «+ Proyecto» o «Nuevo requerimiento» en quell101, las obras y los clientes en la API, o la lista de ítems de dash101
fecha:  7-oct-2026, 00:04 UTC
asunto: la obra de quell nace con cliente y proyecto en la suite (API 0.77.0 #261, bitacora-obra #120); el requerimiento trae descripción; y la lista de ítems de dash101 con el estilo de quell (dash101 #144, API 0.76.0 #260)

MIKE, 6-oct, cuatro mensajes:
  · «En dash quiero que la lista de ítems tenga el mismo estilo [que la de
    quell101]. Hoy en dash es muy cansado a la vista como está.»
  · En «Juntar las piezas del plano con los ítems»: «también quiero poder
    ver los detalles de quell del ítem, la barra lateral».
  · «Cree un nuevo proyecto en Quell, con un cliente nuevo. Pero no me
    aparece ni el cliente ni el proyecto ni en quote ni en dash.»
  · «agregar un campo de descripción en la ventana de Nuevo requerimiento,
    donde se escribe lo que aparecerá como descripción en quote (…) La clave
    se escoge en quote dependiendo del tipo de trabajo (…) En caso de que no
    se llene en quell, se puede llenar en quote.»

1. LA LISTA DE DASH101 (#144). Cada renglón es un div `data-fila-item`: barra
   de color por tipo (los colores de quell: Mueble #2C5AA0, Puerta #B4622A,
   Acabado #4B7F52, Servicio #6B4E9B), código y nombre, abajo tipo · partida
   · piezas · entrega; a la derecha los tramos por etapa, el % y la etapa en
   que va (la de su pieza MÁS atrasada), y el importe con el cobro en color.
   Arriba, un recuadro por etapa. El avance viene de GET /quell/avance-items
   (0.76.0, sólo quien dirige). Las cuentas viven en `lib/lista-items.ts`
   (con su spec). El «+» sigue abriendo el detalle de siempre.

2. EL PANEL DESDE UNA PIEZA (#144). `dash101:abrir-item` acepta también
   `{element_id, obra_id, obra_nombre}`: la pieza que todavía no es ítem abre
   el mismo panel. Y el panel decía «faltan [object Object] días»: la API
   manda `item_entrega_falta` como `{dias, dice, tarde}`; se usa `.dice`.

3. POR QUÉ NO APARECÍA EL PROYECTO (#261, #120). «+ Proyecto» en quell
   guardaba sólo la obra con el cliente como TEXTO. Ni cliente ni proyecto en
   la suite: dash y quote no tenían qué enseñar, y los requerimientos de esa
   obra tampoco caían en quote (sin proyecto no hay borrador). Ahora quell
   manda `suite: true` y la API (OrgDB.altaDeObraEnLaSuite) usa el cliente
   escogido, o el que ya existe con el mismo nombre (normalizado: sin
   acentos ni mayúsculas), o crea uno; crea el proyecto (activo; cerrado si
   la obra está archivada) y lo liga. Sin `suite: true` la obra nace suelta
   como antes: las pruebas y dash («Nuevo proyecto») la ligan a un proyecto
   que ya existe. GET /quell/clientes-suite da la lista para escoger (OJO:
   /quell/clientes es otra cosa, las cuentas del portal).
   La pantalla dice ANTES de crear qué va a pasar: el que ya existe, uno
   nuevo (y a cuál se parece), o sin cliente.

4. LO QUE YA EXISTÍA (0039, en código). Mike escogió con botones «darlos de
   alta todos»: cada obra sin proyecto que traiga cliente escrito quedó con
   su cliente y su proyecto al despertar la empresa. Sin cliente escrito no
   se toca. Una que falle se queda suelta y la empresa abre igual (try/catch
   por obra; un throw en migrar() dejaría la empresa sin abrir).

5. LA DESCRIPCIÓN (0038). `quell_elements.descripcion`. Al levantar el
   requerimiento va al ítem y al renglón del borrador de quote101; vacía, el
   renglón queda en blanco para llenarlo allá. Si la obra se liga después,
   `levantarRequerimientosHuerfanos` la lleva. La clave del requerimiento en
   quell se dice «provisional»: la definitiva se escoge en quote101.
   OJO: la 0030 corre `levantarRequerimientosHuerfanos` en código ANTES de
   que exista la columna (empresa nueva): por eso pregunta con
   `tieneColumna()`. Cualquier migración en código que lea columnas debe
   hacer lo mismo.

MEDIDO
  · API: obra-en-la-suite.spec 9/9 (las 9 fallan sin el cambio); 790/790;
    humo de producción 205/205 y 26/26; /salud contrato 0.77.0.
  · Staging (demo), de punta a punta: alta en quell con cliente nuevo →
    dash101 y quote101 ven proyecto y cliente; requerimiento con descripción
    → el renglón de quote101 la trae. Lo de prueba se borró después.
  · quell101: el-proyecto-nace-en-la-suite.mjs 15/15 (14 fallan sin el
    cambio); `npm run prueba` completo en verde (ahora corre también las dos
    del 6-oct que faltaban). Producción con la huella del build.
  · dash101: navegador 23/24 en local (la 13, Excel, sólo falla en local);
    Pruebas y Verificar en verde; producción con la versión del merge.
    `lectura-api.spec` contaba las partidas de la cocina demo: ahora trae
    también las del cronograma (`tarea_id`) y se cuentan aparte.

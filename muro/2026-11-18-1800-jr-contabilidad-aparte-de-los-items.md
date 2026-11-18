de:     jr (sesión de Claude Code)
para:   todos los chats y el coordinador
fecha:  18-Nov-2026
asunto: la contabilidad del proyecto, aparte de los ítems (API 0.105.0 y 0.106.0; dash, quote, peek)

1. Mike, 18-nov: «Vamos a separar la contabilidad. Ya no va a ir ligada a los
   ítems. Los precios de los proyectos se harán por aparte. (…) limpiar todos
   los precios de venta que estén ahorita en dash de los proyectos para cargar
   ya los nuevos independientes. Otra cosa es que vamos a poner en dash los
   pagos pendientes de cada proyecto a cada contratista. Y quiero tener un
   estado de cuenta por proyecto muy legible y también un estado de cuenta por
   cliente (incluyendo todos sus proyectos (cotización y pagos) global.»
2. Decisiones con botones:
   - «Conceptos de cobro con opción a importar de las cotizaciones del
     proyecto de quote.»
   - «Un concepto por renglón. Si se importa una segunda cotización del mismo
     proyecto, se debe ver que es una segunda cotización pero suma.»
   - «Todos a cero de una vez», con respaldo, «Precio por cargar» mientras
     tanto y lo cobrado intacto.
3. API 0.105.0 (#386, publicada):
   - Migración 0055 (en código, repetible): tabla `conceptos`,
     `proyectos.n_conceptos` y `precios_anteriores` (el respaldo). Todos los
     precios quedaron en 0 = POR CARGAR. Lo de antes se ve como
     `precio_anterior` en /estado.
   - `precio_venta` = Σ `conceptos.monto`. Ni aprobar una cotización ni vender
     un ítem le ponen precio al proyecto. QUIEN LEA PRECIO_VENTA: con
     `n_conceptos` = 0 no vale $0, no se sabe todavía.
   - CRUD `/conceptos` (dash101). GET /proyectos/:id/conceptos/cotizaciones y
     POST …/conceptos/importar: un concepto por renglón, con folio. El precio
     sale de `datos.renglones` que quote deja al guardar (G115) o, en una
     aprobada antes, del precio de sus piezas.
   - /estado (conceptos y grupos), /estado-de-cuenta del cliente (lo cotizado
     de cada proyecto, saldo contra el total con IVA), sus Excel, /peek (los
     por cargar no suman) y GET /pagos-pendientes (lo que se debe a cada
     contratista, por proyecto).
4. dash #165: «Precio del proyecto» con «Importar de quote»; «Por pagar» en el
   menú y columna Pendiente en compromisos; estados de cuenta nuevos.
   quote #101 (G115): manda el precio de cada renglón. peek 1.0.3: «Por
   cargar» y «Lo que se cobra».
5. Medido: API 53 archivos / 1226 pruebas; dash batería contra staging en
   verde; quote 169/169; humo de la API ajustado a la regla nueva.
6. Para los demás chats: si su app enseña `precio_venta` o un saldo, que mire
   `n_conceptos` (o `precio_por_cargar` en /peek y /estado).
7. dash subió a Next 16 (#166) para poder publicarse: OpenNext ya no acepta
   Next 15. Costo medido: +95 KB de JavaScript al arrancar (363 → 458 KB; tope
   470). #167 arregló el error #310 de /movimientos (un hook después de un
   return) y #168 la prueba de navegador del plan de pagos.
8. Netlify, fuera (Mike: «Borrar los 6»). Se borraron con la API de Netlify:
   conta-master, cuenta-taller101, cotizador-t101, shiny-mousse-a355f8,
   supervisor-t101 y t101draw. Las direcciones viejas contestan 404. Queda
   sólo bosque-bravo, que no es de la suite. Sus archivos salen de dash (#169)
   y de quote (#102). Aquí `pruebas/huecos.spec.ts` sigue midiendo que esos
   orígenes no estén permitidos: se queda.
9. La hoja del presupuesto (API 0.106.0). Mike preguntó si el presupuesto
   podía venir de un Sheets o editarse en una hoja dentro de dash; escogió
   con botones «Hoja dentro de dash»:
   - PUT /proyectos/:id/conceptos {renglones:[{id?, descripcion, cantidad,
     precio_unitario}]}: la hoja completa en su orden. Con id se queda (el
     importado conserva folio y grupo), sin id nace, el que no viene se
     quita. Todo o nada, un recálculo; un renglón malo regresa 400 con su
     número.
   - Tabla `plantillas_presupuesto` (0056), CRUD genérico de dash101:
     nombre y renglones JSON en centavos. Dinero: la ven quien ve dinero.
   - Medido: API 54 archivos / 1238 pruebas (hoja-de-presupuesto.spec.ts,
     nueva, 11).
10. Mike, viendo el proyecto HOLCIM: «Mueve la liga al nombre del proyecto
    y quita esa sección. Y ya quita la sección de los elementos de obra que
    lee de quell. Ya no vamos a importar de quell en tiempo real (…) Sólo
    existirán los conceptos que se importen desde quote (…) y los que se
    agreguen manualmente en la tabla de dash.» En dash: fuera «Obra en
    quell101» y «Ítems del proyecto»; la liga es un ↗ junto al nombre.
    PARA LOS DEMÁS CHATS: la API no cambió: los ítems siguen existiendo y
    quell sigue escribiéndolos; sólo dash deja de enseñarlos y de editarlos.

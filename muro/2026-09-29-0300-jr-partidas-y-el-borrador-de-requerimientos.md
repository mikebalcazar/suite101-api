de:     jr (programador)
para:   quien toque ítems, cotizaciones o el plano (API, dash101, quote101, quell101, peek101)
fecha:  29-sep-2026
asunto: partidas por cotización, el borrador de requerimientos, y el ítem como objeto base (contrato 0.49.0)

Tres encargos de Mike de hoy sobre la misma cadena, y un principio que él
dejó dicho con todas sus letras.

EL PRINCIPIO (Mike, 29-sep): «Cliente, proyecto e ítems existen en quote,
quell, peek y dash. Ítems es el bloque base de toda la plataforma. Son los
que existen como "objetos" y todo lo demás es para administrarlos o
pegarles información, y cada plataforma los acomoda y lee cierta
información según sea requerido. Los ítems son la base de todo, es lo que
movemos, creamos o cancelamos/borramos.» Así que: un ítem es UNO en la base
de la empresa de principio a fin; las apps no lo copian, lo enseñan. Lo de
hoy va exactamente así.

1. suite101-api #148 · contrato 0.49.0
   · `POST /orgs/:o/cotizaciones/:id/aprobar` acepta `partida`; sin ella,
     las piezas nacen en la partida del NOMBRE de la cotización. Cada
     cotización aprobada es una pestaña en dash101.
   · Una línea con `item_id` no crea nada: aprueba ESE ítem con nombre,
     tipo, precio, cantidad y partida. Su pieza del plano cambia de tipo y
     estrena código con el prefijo del tipo (PT-, MW-, FX-, SV-), propuesto
     por obra con `siguienteCodigo`; ese código queda también en
     `items.clave`. Mike: «al aprobarse los requerimientos cambia su código
     a alguno de mueble, puerta etc.»
   · Un requerimiento levantado en quell en una obra LIGADA a un proyecto
     nace como ítem `cotizado` (tipo `requerimiento`, en cero, no suma) y
     cae como renglón «a mano» (`manual: true`, `item_id`, precio en pesos)
     en el borrador «Requerimientos» del proyecto en quote101
     (`datos.de_requerimientos = true`; uno abierto por proyecto; aprobado,
     el siguiente abre otro). Descartarlo (`cancelar`) o aprobarlo desde
     dash lo saca del borrador. El alta de la pieza contesta `item_id` y
     `cotizacion_id`. Sin obra ligada, la pieza se levanta igual y nada
     más (se vuelve ítem al ligar, como antes). Hasta hoy un requerimiento
     NO tenía renglón en `items`.
   · En el plano, un requerimiento pendiente sigue `dentro` (Mike, 22-sep:
     «sí aparece en mapa»); su ítem dice `no_aprobado` y en quell eso
     significa escondido. La excepción está en `ALCANCE_SQL`
     (src/quell/motor.js). Descartado sí se va.
   · cotizador101 puede escribir `items.partida`.
   · OJO: si quote101 tiene abierto el borrador cuando la API le agrega un
     requerimiento, el guardado automático de quote101 (PATCH de `datos`
     entero) puede pisar el renglón nuevo hasta que se recargue. No pasó en
     pruebas; se anota porque puede pasar.
   · 10 pruebas nuevas en pruebas/alcance.spec.ts; suite 579.

2. quote101 G100 (#62)
   · El renglón que vino de la obra se reconoce («Requerimiento de la obra
     · RQ-01…», `data-requerimiento`). Los renglones a mano traen selector
     de tipo (`data-campo="tipo-i"`: mueble, puerta, acabado, servicio,
     otro) que viaja con la cotización. Al aprobar, cada línea manda
     `item_id` y `tipo`; la confirmación distingue lo que nace de lo que se
     aprueba. pruebas/los-requerimientos.spec.mjs (3); suite 107.

3. dash101 #91
   · La barra de pestañas SIEMPRE a la vista (antes sólo con más de una
     partida, y como todo caía en «Sin partida» nadie la vio), «+ Partida»
     (`data-nueva-partida`, `data-crear-partida`), en la pestaña abierta
     «Renombrar» (`data-renombrar-partida`, `data-guardar-nombre`) y
     «+ Ítem en esta partida» (`data-nuevo-item-en-partida`). Cada ítem
     detrás de su «+» tiene «En qué partida va» (`data-partida-de=<id>`;
     un producto `pr:<id>` mueve todas sus piezas). El editor de la lista
     trae la partida por renglón; guardar la lista sin mandar partida ya no
     la borra (regla en lib/api/escribir.ts). «No aprobados» dice que los
     requerimientos están también en el borrador de quote101.
   · Una pestaña vacía vive en la pantalla (`nuevas`), no en la base: la
     partida es texto en cada ítem. Al recargar sin ítems, desaparece.

Lo que sigue (encargos de Mike de hoy, aún NO hechos):
   · UN SOLO NEGOCIO: quitar de dash y de todas las plataformas la opción de
     agregar o cambiar de negocio («los otros negocios son como TUYS y
     vibehome. Todo es para un negocio nada más»). Falta decidir con Mike
     qué pasa con los negocios que ya existen en forespot.
   · BATERÍA en móviles (quell y quote): «eficientar y minimizar la demanda
     de recursos de procesamiento del teléfono. Empecemos por gráficos. En
     quote de entrada hay que quitar las animaciones y el look
     transparencia.»

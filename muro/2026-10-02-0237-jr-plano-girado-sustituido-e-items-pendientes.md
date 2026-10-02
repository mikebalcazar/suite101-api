de:     jr (programador)
para:   quien toque los planos de quell101 o la hoja de quote101
fecha:  2-oct-2026, 02:37 UTC
asunto: quell101: el plano se gira y se sustituye (OrgDB 0029, API #209, quell #101) · quote101: «Ítems pendientes» y agrupar arrastrando (#73)

PLANOS (Mike, 2-oct: «cuando subo un plano (…) quiero poder rotarlo porque a
veces el PDF viene vertical. Y también quiero poder actualizar el plano.
Subir y sustituir el que está para actualizar versiones»).
- OrgDB 0029: quell_plans gana `rotation` (0/90/180/270) y `versiones`
  (JSON con lo que había antes de cada sustitución: image_key, source_key,
  file_name, medidas, giro, cuándo y quién). POST /projects/:id/plans acepta
  `rotation`; POST /plans/:id/sustituir reemplaza imagen, original, medidas
  y giro del MISMO plano (mismo id, las piezas con sus x, y se quedan) y
  apila lo anterior en versiones. Los archivos viejos siguen en R2.
- quell101: subir pasa por una VISTA PREVIA (SubirPlanoModal): se ve el
  raster y se gira de 90 en 90 con ↺ ↻ (CSS, barato); al confirmar,
  rasterizePlan(file, giro) hace el giro de verdad —pdf.js con `rotation`
  en el viewport; una imagen, girando el lienzo— y el giro viaja con el
  plano. OJO: la capa nítida (PlanCanvas) dibuja el PDF original con el
  mismo `plan.rotation`; si se olvidara, el plano se vería bien hasta
  acercarse y entonces saldría cruzado. En «Renombrar / borrar plano» está
  «Sustituir el plano por una versión nueva» y la lista de versiones
  anteriores con «Bajar».
- Pruebas: plano-girado-y-sustituido.spec.ts (9) en la API;
  el-plano-se-gira-y-se-sustituye.mjs (20) en quell101.

QUOTE101 (Mike, 2-oct: «cuando en un proyecto hay ítems fuera de alcance, en
quote debe aparecer (…) abajo de nueva cotización, un botón que diga "ítems
pendientes" (…) seleccionar varios para agregar a una cotización. Y dentro de
la cotización, poder arrastrar un ítem sobre otro para agruparlos en un
producto (…) Sólo van sumando la cantidad de piezas»).
- La liga «Ítems pendientes (n)» (ItemsPendientesLiga) sale debajo de
  «+ Nueva cotización» sólo si la suite contesta que hay fuera del alcance
  (suite.itemsFuera: items?proyecto_id=&estado=cotizado&limite=5000). El
  modal (ItemsPendientesModal) dice de cada uno si se sacó —y por qué— o si
  es un requerimiento sin aprobar; los marcados caen como renglones a mano
  con su item_id (renglonDeItem: precio por pieza en pesos = monto/cantidad/
  100) en una cotización nueva o en un borrador del proyecto.
- En la hoja, cada renglón es `draggable`; soltarlo sobre otro llama
  agruparRenglones(muebles, de, a): queda el destino con la cantidad sumada
  y los ítems de los dos en `item_ids`. Al aprobar, lineasParaAprobar
  manda UNA línea por ítem (cantidad 1, mismo precio y descripción) y lo que
  sobra de la cantidad como piezas nuevas. La API no cambió: ya aceptaba una
  línea por item_id.
- Prueba los-items-pendientes.spec.mjs (4, Playwright, con la suite
  doblada). Suite completa 120/120.

OJO: PantallaProyecto (index.html ~3553) es código muerto; la pantalla de
proyecto de verdad vive dentro de PantallaInicio (~3290-3380). Perdí media
hora buscando el botón ahí.

VERIFICADO EN VIVO: API #209 publicada (corrida en verde); quell101 #101
publicado (el JavaScript vivo trae «Sustituir el plano» y «Girar»); quote101
#73 publicado (huella.txt en vivo = sha256 del index.html del commit).

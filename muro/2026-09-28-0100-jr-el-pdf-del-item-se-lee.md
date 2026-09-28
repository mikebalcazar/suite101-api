de:     jr (programador)
para:   quien toque la hoja del ítem en quell101 (DocsItem.jsx) o pinte un PDF en un lienzo en cualquier app
fecha:  28-sep-2026
asunto: el PDF del ítem se veía borroso en el celular; ya lleva los píxeles de la pantalla y se puede acercar

Mike, 28-sep: «En quell, cuando abro el archivo del ítem (un pdf) se ve muy
baja resolución y no sirve de nada, no se puede leer».

La causa: la hoja pintaba el PDF en un lienzo con tantos píxeles como puntos
CSS tiene la caja. En la compu (un píxel por punto) se ve aceptable; en el
celular hay dos o tres por punto y el plano quedaba a 390 píxeles de ancho,
estirado al triple. Borroso sin acercarse e ilegible al acercarse.

Lo que cambió (bitacora-obra #83, publicado y comprobado en
quell101.taller101.com):

· web/src/nitidez.js: la cuenta de píxeles del lienzo toma
  window.devicePixelRatio (tope 3) y el acercamiento pedido, con los dos
  topes del navegador del teléfono: 4096 por lado y 16 millones de píxeles.
  Pasarse no truena: deja la hoja en blanco sin avisar.
· La barra de la hoja trae −, el porcentaje (regresa a lo ancho) y +, hasta
  4×. Acercada, la lámina mide más que la caja y el visor se desplaza. Las
  marcas siguen encima porque van en porcentaje (0 a 1), no en píxeles.
· Prueba pruebas/el-pdf-se-lee.mjs, en npm run prueba.

Para quien pinte un PDF en un lienzo en otra app: PlanCanvas.jsx ya lo hacía
bien (tiene su propio `punto()` con devicePixelRatio). La regla es la misma:
c.width en píxeles de verdad, y el ancho visible por CSS aparte.

de:     jr (programador)
para:   quien toque las imágenes o las notas internas de la hoja de quote101 (index.html: ZonaFotos, HojaCotizacion, notaConLigas)
fecha:  7-oct-2026, 01:15 UTC
asunto: un recuadro para la imagen (cotizador-t101 #80) y las ligas de las notas internas se pueden picar (#81)

MIKE, 7-oct:
  · «para agregar una imagen de referencia, quiero poder arrastrarla o
    pegarla nada más. Sugiero hacer un recuadro donde diga, arrastrar imagen
    o agregar desde carpeta y que al arrastrarla sobre ese recuadro se
    cargue a ese ítem.»
  · «En las notas del ítem en quote, quiero que cuando agrego un link lo
    detecte como para poder darle click, ya sea durante edición o sobre el
    PDF interno exportado.»

1. EL RECUADRO (#80). Renglón a mano: `data-zona-imagen={i}`, punteado,
   «Arrastra la imagen aquí o pégala · agregar desde carpeta». Soltar o
   pegar ahí va a ESE renglón; pegar es con el recuadro picado (tabIndex),
   porque en la hoja hay muchos renglones: un escucha de «paste» en la
   ventana no sabría a cuál va. El drop del recuadro hace stopPropagation
   para que el renglón no lo tome. Armador («Imágenes de referencia»,
   ZonaFotos): el recuadro se ve siempre y dice lo mismo; ahí pegar sigue
   siendo en toda la ventana. Los tres caminos siguen en agregarFotos
   (fotos.spec lo revisa).

2. LAS LIGAS (#81). `ligasDe()` (http(s)://… o www.…, sin el punto o la
   coma que cierran la frase). En la hoja salen encima del campo de notas
   (`data-ligas-nota`), cada una abre en otra pestaña: un <textarea> no
   puede tener ligas por dentro. En el PDF interno, `notaConLigas()` parte
   sobre el texto CRUDO y escapa cada pedazo: si se escapara primero, un
   «&» de la liga quedaría como «&amp;» y la cortaría. Lo demás va como
   texto (la prueba mete un <script> y revisa que no se vuelve código).

MEDIDO: las dos pruebas nuevas en los-requerimientos.spec fallan sin el
cambio; completa 134/134; producción con la huella del build (2cd5c6bad74f),
«todo verde».

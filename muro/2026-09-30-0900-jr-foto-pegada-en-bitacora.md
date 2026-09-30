de:     jr (programador)
para:   quien toque los compositores de quell101 (web/src/ElementPanel.jsx, Fotos.jsx)
fecha:  30-sep-2026
asunto: la bitácora del ítem acepta fotos pegadas del portapapeles o arrastradas (quell101 #88)

Mike, 30-sep: «En quell, cuando escribo en la bitácora del ítem, quiero
poder agregar fotos pero solo arrastrando o pegando lo que está en el
portapapeles.»

Qué hay:
· web/src/pegar.js, puro: `imagenesDe(dataTransfer)` saca SÓLO las
  imágenes de un pegado o un arrastre (items kind=file image/*; si el
  navegador sólo llena `files`, de ahí). Un pegado de puro texto da
  vacío y el texto se pega como siempre; un PDF arrastrado no entra.
  `nombreDePegada(f)` porque una imagen pegada llega como «image.png».
· Fotos.jsx: `usePegarYSoltar(add)` devuelve onPaste (frena el pegado
  normal sólo si había imágenes), onDragOver/onDragLeave (marca
  `soltando`) y onDrop. Es genérico: el punchlist y las dudas tienen el
  mismo compositor y se les cuelga en dos líneas si Mike lo pide; hoy
  sólo la bitácora.
· ElementPanel.jsx (Log): la zona `.compose` recibe el arrastre
  (`data-compose="bitacora"`), la caja el pegado, «Suelta la foto aquí»
  mientras algo va encima, y el placeholder lo ofrece. Los botones de
  cámara y fotos siguen: en el teléfono no hay portapapeles de fotos.
· Las fotos pasan por el mismo `usePending` → `compressImage` → subida
  con la nota, y por la fila de sin-señal, igual que las escogidas.

Medido: pruebas/la-foto-pegada.mjs (18, en la cadena), cadena completa
en verde, publicado en quell101.taller101.com. No hay prueba con
navegador de verdad del pegado: Playwright no fabrica un portapapeles
con imagen de forma confiable; lo que se puede romper (qué se toma de un
DataTransfer) está medido en node.

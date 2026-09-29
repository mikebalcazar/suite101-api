de:     jr (programador)
para:   quien toque el armador sobre plano de quote101 (index.html: ArmadorSobrePlano, VisorPlano, Cotizador)
fecha:  29-sep-2026
asunto: quote101 G105: con plano nuevo se ofrece reubicar los componentes; los que quedaron sin lugar se ponen uno por uno

Mike, 29-sep: «cuando quito un plano los componentes pierden su
ubicación en el plano. Cuando meto un plano nuevo, necesito que me dé la
opción de reubicar los componentes en el plano.»

Qué pasaba:
· «Quitar» el plano borra `pos` de cada componente (eso sigue igual: sin
  plano no hay lugar). Pero al subir otro plano no había cómo volver a
  ponerlos: cada toque en el plano nuevo ponía un marcador rojo de
  componente NUEVO. Los viejos se quedaban sin lugar para siempre.
· «Cambiar» el plano dejaba los círculos en el mismo porcentaje sobre una
  imagen distinta, sin decir nada.

Qué hay ahora (#69, G105):
· Los componentes sin `pos` salen en una tira azul arriba del plano
  (`data-armador="sin-lugar"`, chips `data-sin-lugar=N`). «Ponerlos en el
  plano» activa el primero; el siguiente toque en el plano es su lugar y
  pasa solo al que sigue (el que va después de él, o desde el principio).
  Se puede escoger uno directo de la tira, o «Dejar así».
· Con plano nuevo y componentes ya puestos, una tira ofrece
  (`data-armador="plano-nuevo"`): «Reubicarlos uno por uno» (se les quita
  `pos` y arranca el modo) o «Se quedan donde están» (lo de siempre; la
  prueba de G100 de «Guardar cambios guarda el plano nuevo» sigue
  contando con eso).
· Los números (`c.marca`) no cambian al reubicar; el PDF pinta sólo los
  que tienen `pos`, como antes.
· En el estado de Cotizador: `reubicando` (índice en `comps`, o null) y
  `ofrecerReubicar`. `onTocar` primero pregunta si hay uno reubicando;
  si no, hace el marcador rojo de siempre. Un componente que se agregó
  sin tocar el plano también sale en la tira: es la misma situación.

Medido: dos pruebas nuevas en pruebas/el-plano.spec.mjs (fallan sobre
G104), suite 115 de 115. Publicado y huella igual en producción y en
staging (83e0d393…).

Ojo al medir con Playwright: la tira aparece y desaparece arriba de la
imagen, así que el `boundingBox` del plano cambia entre toques; se mide
otra vez antes de comparar dónde quedó un círculo.

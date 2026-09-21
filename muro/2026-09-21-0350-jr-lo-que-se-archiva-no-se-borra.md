de:     jr (programador)
para:   quien toque la documentación de un ítem, o algo que se versione
fecha:  21-sep-2026
asunto: «Sin borrar la anterior» es una columna, no una costumbre

Contrato **0.41.0**. Migración org **0019**: `quell_element_docs` y
`quell_doc_marcas`. Rutas nuevas bajo `/orgs/:o/quell`: `GET|POST
/elements/:id/docs`, `GET /docs/:id/versiones`, `POST /docs/:id/version`,
`POST /docs/:id/archivar`, `GET|POST /docs/:id/marcas`, `POST
/marcas/:id/borrar`. La pantalla es `web/src/DocsItem.jsx` en quell101.

Cuatro cosas de aquí sirven fuera de este encargo.

## 1. Un índice único PARCIAL es lo que hace que «uno solo» sea cierto

Mike pidió que al subir una versión nueva la anterior se archive y no se
borre. La tentación es obvia: la pantalla marca la vieja como archivada y
luego sube la nueva. Funciona los primeros nueve meses. El día que dos
supervisores suban versión al mismo segundo, el ítem se queda con dos
planos principales a la vista y nadie sabe cuál manda.

Lo que lo impide de verdad son dos renglones de SQL:

    CREATE UNIQUE INDEX quell_docs_un_principal
      ON quell_element_docs(element_id) WHERE rol = 'principal' AND archivado_at IS NULL;
    CREATE UNIQUE INDEX quell_docs_una_viva
      ON quell_element_docs(familia_id)  WHERE archivado_at IS NULL;

`WHERE archivado_at IS NULL` es la pieza. Un índice único normal no sirve
—el ítem TIENE que poder guardar diez versiones del mismo plano—; el
parcial dice «de las vivas, una». SQLite los soporta desde siempre y D1
también.

De paso, eso obliga al orden correcto en la ruta: **primero se archiva la
vieja y luego se inserta la nueva**. Al revés revienta contra el índice. Y
es el orden que queremos aunque el índice no existiera: entre los dos
pasos, es preferible quedarse un instante sin versión viva que con dos.

## 2. Lo que se pinta encima de un documento va RELATIVO

Las marcas se guardan con x e y de 0 a 1 sobre la página, y el trazo igual.
En píxeles se ve bien en la pantalla donde se hizo y en ninguna otra: el
mismo plano mide 390 puntos de ancho en un celular y 1200 en la compu, así
que una nota puesta en obra aparecería sobre otra pieza al abrirla en la
oficina. Nadie lo reporta, porque quien anota no ve las dos pantallas.

En la pantalla, la manera barata de no equivocarse es **no hacer la cuenta
a mano**: la capa es un `<svg viewBox="0 0 1 1" preserveAspectRatio="none">`
puesto exactamente encima de la hoja, y los puntos se pintan tal cual. La
conversión la hace el navegador. Para el grosor del trazo,
`vector-effect="non-scaling-stroke"`, que si no se estira con el viewBox.

Y el servidor recorta a 0–1 con `ceroAUno` en vez de confiar: una marca en
1.4 se pinta fuera del papel y nadie la vuelve a encontrar.

## 3. Copiar o no copiar no lo decide el esquema

Al subir una versión nueva, la pregunta «¿se traen las anotaciones de la
anterior?» no tiene una respuesta buena siempre. Un plano corregido
normalmente invalida las notas que pedían la corrección; pero si el cambio
fue chico, volver a clavar catorce notas a mano es lo que hace que nadie
las use. Va como `copiar_marcas=1` en el formulario, y la pantalla lo
pregunta cada vez, con dos botones y la consecuencia escrita.

Regla general: cuando las dos respuestas son defendibles, no se elige en el
esquema. Se pregunta, y se dice qué implica cada una antes de que
respondan.

## 4. Dos trampas de pantalla que se cobraron un rato

**Juntar puntos de un trazo en el estado de React no funciona.** Un dedo
dispara `pointermove` mucho más rápido de lo que React confirma un
`setState`, así que el siguiente evento lee la lista de hace tres puntos y
el trazo se guarda con dos. Se ve bien mientras se dibuja y se guarda mal.
Los puntos van en un `useRef`; el estado sólo existe para la línea de
vista previa.

**Y revisen que el nombre de clase no exista ya.** Puse `.hoja` a mi lámina;
`.hoja` ya era la capa del plano en el lienzo de la obra, con
`position:absolute`. Mi hoja heredó eso y se subió encima de la barra de
arriba, tapando los botones. En un archivo de CSS de 600 renglones sin
módulos, un `grep` antes de nombrar cuesta diez segundos.

## Cómo se midió

43 pruebas en `pruebas/quell.spec.ts` (de ellas un bloque nuevo completo),
`pruebas/migracion-0019.py` sobre una base con datos, y la suite entera en
verde: 538. Del lado de quell101, `pruebas/docs-del-item.mjs` con 28
revisadas, y un recorrido en Chromium a 390×844 y a 1280×800 que clava una
nota en el 25 %/75 % de la hoja y comprueba que lo que viaja es el mismo
par en las dos pantallas.

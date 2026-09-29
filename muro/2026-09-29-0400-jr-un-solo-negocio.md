de:     jr (programador)
para:   quien toque negocios en cualquier app (API, dash101, supply101, quote101, master101)
fecha:  29-sep-2026
asunto: un solo negocio por empresa (contrato 0.50.0); los que había se juntan desde dash101

Mike, 29-sep: «borres de dash (y de todas las plataformas) la opción de
agregar diferentes negocios. Ya no vamos a tener esa funcionalidad (los
otros negocios son como TUYS y vibehome). Todo es para un negocio nada
más.» Con botones escogió FUSIONAR lo que ya existe en uno (no esconderlo,
no sólo quitar «crear»).

1. suite101-api #149 · contrato 0.50.0
   · `POST /orgs/:o/negocios/fusionar {queda_id, seco?}` (dueño o
     administración). Todo lo de los demás negocios pasa al que se queda:
     las tablas con `negocio_id` se descubren del esquema (`sqlite_master`),
     no de una lista a mano. Los productos con el mismo código en dos
     negocios quedan en el del que se queda y sus piezas le apuntan; el
     repetido se borra. Los demás negocios se borran. Los miembros acotados
     a un negocio (`miembros.negocios` en el D1) quedan en `[]` = todos. En
     seco sólo cuenta.
   · La tabla `negocios` y la columna `negocio_id` SE QUEDAN: cuelgan de
     doce tablas. Lo que cambia es que hay uno. La API sigue aceptando
     `POST /negocios` (quote101 crea el primero en una empresa nueva; la
     demo de staging tiene varios a propósito: «Taller Demo» para las
     capturas y uno por prueba que escribe). NO fusionen la demo.
   · pruebas/un-solo-negocio.spec.ts (6); suite 585.

2. dash101 #92
   · La barra DICE el negocio (`data-negocio-actual`); ya no es desplegable
     ni ofrece crear. Menú: «Negocio». /negocios: sin negocio → alta del
     primero (única alta que queda); uno → se enseña y edita; varios → la
     pantalla de fusión (`data-fusion-de-negocios`): radio por negocio,
     «Ver qué se movería» (seco), escribir el nombre del que se queda,
     «Fusionar en «X»». No se deshace y se dice antes. /negocios/nuevo con
     un negocio ya dado de alta no da de alta (`data-un-solo-negocio`).
   · El contexto `negocio-activo` sigue leyendo `localStorage`
     (`conta-master:negocio-activo-id`): es como las pruebas del navegador
     escogen «Pruebas de navegador» en la demo. Sin selector, lo que se ve
     es el primero que devuelve la API o el recordado.
   · supply101: se quitó el `picker-negocio`; toma el de la empresa.
   · pruebas/un-solo-negocio.spec.ts (2, staging, empresa propia); la
     primera prueba del navegador comprueba barra sin botón, /negocios con
     la fusión (sin tocarla) y /negocios/nuevo cerrado.

3. quote101 G101 (#63)
   · Sin desplegable de negocio en la barra. Se queda: recordado o primero,
     sin crear ninguno (defecto del 23-sep). Prueba reescrita.

LO QUE LE TOCA A MIKE: en dash101 de forespot, «Negocio» → escoger cuál se
queda → «Ver qué se movería» → escribir el nombre → «Fusionar». Es
irreversible y lo hace él con su sesión; el chat no escribe en producción.
Hasta que lo haga, las apps abren el primero (o el recordado) sin ofrecer
cambiar: si algo «no aparece», está en otro negocio todavía sin juntar.

master101: `GET /admin/orgs/:o/quote` sigue enseñando por negocio; con uno
solo enseña uno. No se tocó.

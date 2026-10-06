de:     jr (programador)
para:   quien toque las listas de ítems en dash101 (items-del-proyecto.tsx, estado-de-cuenta, form-movimiento.tsx) o el panel del ítem en quell101 (ElementPanel.jsx)
fecha:  6-oct-2026, 03:56 UTC
asunto: el panel del ítem en dash101 —lo que se ve en quell, desde cualquier lista— con la liga que abre el ítem en quell101 (dash101 #139)

MIKE, 6-oct: «Necesito en dash también me abra la barra lateral de detalle
de los ítems cuando doy click sobre uno o sobre el ícono de info. No
importa en dónde esté viendo el ítem en lista, siempre debe tener esa
función. Y dentro de la barra lateral de detalles del ítem, debe haber un
hiperlink al item en quell. Osea que abra quell en el item.»

LAS DECISIONES DE FORMA.

1. Un solo panel para toda la app, no uno por pantalla. `PanelItemHost`
   va montado una vez en el layout de la app y escucha un evento del
   documento (`dash101:abrir-item`, con el id del ítem). Cualquier lista
   abre el panel con dos componentes: `NombreDeItem` (el nombre como
   botón) y `BotonVerItem` (el ícono ⓘ). Así «no importa en dónde esté
   viendo el ítem» se cumple poniendo dos etiquetas, sin pasar estado por
   props ni duplicar el panel. Escape y ✕ lo cierran.
2. El panel es SÓLO LECTURA y dice quién manda: «El ítem en la obra ·
   sólo lectura». Lo que se edita del ítem (precio, nombre, producto)
   sigue en el renglón de dash101; lo de la obra (etapa, archivos,
   punchlist, bitácora, diseño) se edita en quell101, y para eso está la
   liga «Abrir en quell101» (`#/p/<obra>/e/<pieza>`, pestaña nueva). No se
   repitió ningún formulario de quell dentro de dash.
3. Se lee por la ruta que ya existía para quote101: `GET
   /items/:id/pieza` (API 0.67.1 #239, para quote101) da la pieza del ítem; después el
   detalle y los documentos de la pieza. Un ítem sin pieza (404) no es un
   error: el panel dice «Este ítem no está en ningún plano de la obra.» y
   nada más. En la org demo de staging casi todos los ítems son así.
4. `casaQuell()` (lib/obras.ts) decide si la liga va a staging o a
   producción y ahora la comparten `urlObra` y el panel: una sola verdad
   de dónde vive quell101.
5. El ícono ⓘ lleva `no-print` en el estado de cuenta: el PDF que baja el
   cliente no cambia.

DÓNDE ESTÁ. La lista de ítems del proyecto (cada ítem y cada pieza de un
producto agrupado), la lista de fuera de alcance, el estado de cuenta del
proyecto, el reparto del anticipo en el movimiento (cada renglón) y el
producto escogido en el movimiento («Ver <producto> en la obra ⓘ»).

QUÉ ENSEÑA. Descripción; «En la obra»: contratistas, fecha de entrega,
precio, Diseño definido/sin definir y Anticipo (fecha y monto, o «sin
anticipo»); Archivos de la pieza (con su liga a quell); Punchlist;
Bitácora con fotos (`/quell/files/...` por la misma API, con la sesión).

MEDIDO.
  · tsc limpio; next build limpio.
  · escritura-api.spec contra staging, 17 en verde (nuevo: el ítem sin
    pieza da el mensaje exacto; la liga a quell con obra y pieza
    codificadas).
  · navegador.spec contra `next start` local → staging: 21 de 22 en verde,
    con el paso nuevo dentro de «editar los ítems del proyecto»: ⓘ abre el
    panel, dice «El ítem en la obra» y «ningún plano», Escape lo cierra, el
    nombre lo abre, ✕ lo cierra. La roja es la bajada del Excel del estado
    de cuenta y NO es del cambio: en local el `rewrite` de Next no pone
    `X-App`, la API contesta 400 a la navegación y no hay descarga; en el
    Worker el binding la pone. OJO para quien corra la prueba en local:
    hay que construir con NEXT_PUBLIC_FUENTE=api NEXT_PUBLIC_ORG=demo, si
    no la app dice «Falta NEXT_PUBLIC_ORG» y las 21 fallan desde el login.
  · Despliegue #139 (a2b5974): «Publicar el Worker» en verde; en el corredor
    la prueba de navegador contra staging dio 22 de 22 (el Excel incluido:
    ahí sí hay X-App). dash101-version en producción y staging = a2b5974.

LO QUE NO SE HIZO (a propósito). El panel no edita nada ni abre los
archivos en grande dentro de dash101: para eso se abre quell101. No está
en la lista de movimientos (ahí no hay ítems sueltos) ni en quote101 (ya
tenía el suyo desde #173).

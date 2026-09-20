# Lo verde de aquí no abarca la pantalla vacía

21-sep-2026, 00:10 · Jr. PROGRAMADOR

Dos veces en la misma noche la puerta de despliegue tumbó un cambio mío que
aquí salía verde entero: tipos limpios, build verde, 170/170 contra staging.
Las dos veces el defecto era real y las dos veces estaba en un estado que mi
medición local no llega a mirar.

**La primera.** Partí el botón de «Editar» en dos —uno para el proyecto,
otro para la lista de ítems, como pidió Mike— y puse el segundo dentro del
bloque que dibuja la tabla. En un proyecto **sin ítems** ese bloque no se
dibuja: sale un recuadro que dice «sin ítems» y ya. O sea que le quité el
único camino para capturar el primer ítem, justo al proyecto que más lo
necesita.

**La segunda**, media hora antes: una aserción del recorrido preguntaba si el
dropdown estaba en pantalla en el instante en que cargaba la lista, cuando se
dibuja con una segunda llamada que todavía no volvía.

## Por qué el verde de aquí no las vio

La suite de dash101 corre contra la API. Mide lo que se guarda y lo que se
devuelve, que es mucho, pero **no dibuja una sola pantalla**. Un componente
que no se renderiza nunca no puede fallar en una lista vacía, porque no hay
lista. El `tsc` tampoco: mover un botón de un `if` a otro es legal en los dos
lados.

Lo único que renderiza de verdad es el recorrido en navegador, y desde este
contenedor no corre —el proxy rompe los trozos `/_next/static/chunks/app/(app)/…`—.
Así que en la práctica **mi última medición antes de mezclar es la puerta de
despliegue**, y eso es tarde: cuesta un ciclo y, si el paso rojo estuviera
después de publicar en vez de antes, costaría producción.

## La lección

**Cuando un control se mueve dentro de una condición, hay que ir a ver la
otra rama.** No es una regla de React: es que `if (hay datos)` casi siempre
tiene un `else` con menos cariño, y ahí es donde vive el usuario que empieza
de cero. La pregunta que me habría salvado las dos veces es la misma:
*¿cómo se ve esto cuando no hay nada, y cuando todavía no llega?*

Vacío y cargando son estados, no accidentes. Y son los dos que ninguna
prueba de API alcanza a ver.

## Lo que sí se hizo bien, para no tirarlo

El paso del navegador corre **antes** de publicar en producción. Las dos
veces producción se quedó entera en la versión anterior, sin nada a medias.
La puerta hizo exactamente lo que existe para hacer; lo que hay que arreglar
es cuánto le estoy dejando a ella.

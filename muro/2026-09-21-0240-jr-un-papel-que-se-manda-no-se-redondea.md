# Un papel que se manda no se redondea, y una liga no es un botón

21-sep-2026, 02:40 · Jr. PROGRAMADOR

El estado de cuenta del proyecto se cayó dos veces en la puerta antes de
publicarse. Las dos las cazó el recorrido en navegador, y valen por razones
distintas.

## La primera: el formato ERA el defecto

`formatMonto` redondea a pesos enteros, y así está bien para todo dash101:
en un tablero, «$360,360» se lee y «$360,360.00» estorba.

Pero este documento se le manda a un cliente, y ahí el redondeo deja de ser
cosmética. Con «IVA incluido», de $111,250 salen $95,905.17 de subtotal y
$15,344.83 de IVA. Redondeados son 95,905 y 15,345: el papel dice tres
números que **no suman**, y el que lo nota es quien va a pagar.

La lección no es «usa dos decimales». Es que **el formato es parte del
contenido cuando el documento sale de la casa**. Una cifra que alguien va a
verificar con una calculadora no se puede redondear para que se vea bonita;
una cifra que alguien va a mirar de reojo, sí. Son dos usos distintos de la
misma cantidad y merecen dos formatos, y por eso ahora conviven
`formatMonto` y `formatMontoExact` con un comentario que dice cuál va dónde.

Lo mismo aplicó en peek101, donde el portal entero está en pesos redondos a
propósito: se le puso un `pesos2` sólo al desglose fiscal, no a todo.

## La segunda: una liga no es un botón

Cuando el armador del `.xlsx` se mudó a la API —porque lo bajan dos
aplicaciones y dos armadores es la manera segura de que un día no digan lo
mismo—, el botón de la pantalla se volvió un `<a href>`.

Un `<a href>` tiene rol de **liga**. El recorrido lo seguía buscando con
`getByRole('button')`, así que el clic nunca cayó y la espera de la descarga
se agotó sola. Defecto de la prueba, no de la pantalla, pero costó un ciclo.

La lección, que ya me mordió cuatro veces esta noche en variantes: **cuando
se mueve un control, se mueve su prueba en el mismo cambio**. No es una regla
de estilo; es que la prueba describe la pantalla, y una descripción vieja
falla o —peor— pasa midiendo algo que ya no existe.

## Lo que sí funcionó

La puerta. El recorrido corre ANTES de publicar producción, así que en los
dos tropiezos dash101 se quedó entero en la versión anterior. Dos rojos y
cero minutos de algo a medias enfrente de nadie.

Y el orden de los rojos dice algo: el primero fue un defecto real que sólo se
veía en el papel armado, y el segundo apareció **porque el primero se
arregló** y la prueba pudo avanzar hasta la descarga. Una prueba que falla
temprano esconde lo que viene después; llegar al segundo rojo fue avanzar.

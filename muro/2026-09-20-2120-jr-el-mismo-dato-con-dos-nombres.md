# Creí que eran el mismo dato con dos nombres

20-sep-2026, 21:20 · Jr. PROGRAMADOR

Ayer construí la unificación de códigos entre quell101 y dash101 sobre una
frase de Mike que entendí a medias: «lo que va a ser lo mismo es el código
de ítem, ej. CAR-01, PT-09». Hice que el código de la pieza del plano y la
`clave` del ítem fueran el mismo valor: se copiaban de un lado al otro, y
cuando los dos traían uno distinto le preguntaba a Mike cuál ganaba, con
botones.

Hoy me corrigió con una sola frase:

> «Una cosa es el código de ítem (pieza física en obra) y otra diferente el
> código de producto de catálogo. Así es como lo vamos a ordenar. Porque más
> adelante, en quote necesito ir generando un catálogo con códigos de
> producto. Y cada ítem es un código de producto y puede haber varios ítems
> del mismo modelo.»

Son dos códigos de dos cosas distintas. PT-01 nombra **una puerta en un
plano**. El código de producto nombra **un modelo en un catálogo**.
Veintinueve puertas iguales son veintinueve piezas y un producto.

## Lo que mi versión hacía de verdad

Le ponía a un producto el folio de una de sus piezas. Al ligar la segunda
pieza, el producto cambiaba de código; el de la primera quedaba escrito en
un plano impreso que ya no se podía relacionar con nada. Y el 409
`codigo_en_uso` que escribí con tanto cuidado —«otra pieza ya tiene ese
código, y dentro de una obra el código es único»— era el índice de la base
defendiéndose de una escritura que nunca debió existir.

Nada de eso se veía roto. Con un ítem y una pieza funcionaba perfecto, y así
lo probé.

## Cómo se ve este error desde dentro

No fue un descuido: fue una interpretación. Vi dos columnas con el mismo
aspecto —un texto corto, con guion, en mayúsculas— en dos tablas que hablan
de lo mismo, y concluí que la duplicación era el problema a resolver. La
frase de Mike la leí como confirmación.

Lo que no me pregunté es **qué nombra cada una**. Dos campos que se parecen
pueden ser el mismo dato duplicado o dos datos distintos, y la diferencia no
está en el tipo ni en el formato: está en a qué apuntan. Un código que
apunta a una pieza y uno que apunta a un modelo se ven idénticos en un
`SELECT` y no se pueden unificar sin destruir uno de los dos.

**La regla que queda: antes de unificar dos campos parecidos, decir en voz
alta qué nombra cada uno. Si las dos frases no son la misma frase, no son el
mismo dato.** Y si sólo hay una relación posible entre ellos —uno por
muchos—, unificar es aplastar la parte «muchos».

## Lo que sí sobrevive, y me tranquiliza

La estructura aguantó la corrección sin migración: el modelo que Mike acabó
describiendo —«un ítem/código puede tener varias instancias que se comportan
como ítems independientes pero derivados del ítem modelo»— es exactamente el
concepto con `cantidad` y sus piezas en el plano, que ya existía. Lo único
que hubo que deshacer fue la escritura de más: el código dejó de copiarse, y
las tres pruebas que defendían mi entendimiento equivocado quedaron
reescritas.

Eso también es una lección: **una prueba que afirma un entendimiento
equivocado es lo que lo deja en pie.** Las mías decían «gana el que se pida»
con toda la seguridad del mundo, y pasaban.

## De pasada, el mismo día y la misma tabla

«Juntar los iguales» tampoco servía, y por un pariente cercano del mismo
error: agrupaba por nombre **idéntico**, y una pieza traída del plano se
llama «Puerta 01» —con su número, así se dibuja en obra—. Veintinueve
puertas del mismo modelo eran veintinueve nombres distintos. Yo había
llamado «el mismo producto» a «el mismo texto».

Ahora agrupa por la familia del nombre, sin el número del final. Y como eso
puede juntar «Repisa 60» con «Repisa 80», el grupo devuelve los nombres que
trae adentro: propone, y quien decide ve qué va a juntar antes de aplicar.

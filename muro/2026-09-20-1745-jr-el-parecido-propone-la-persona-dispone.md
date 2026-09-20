# El parecido propone; la identidad la pone quien sabe

20-sep-2026, 17:45 · Jr. PROGRAMADOR

Construí el emparejado de ítems entre quell101 y dash101 con una propuesta
automática: por código primero, por nombre después. Lo dejé así porque el
parecido acierta casi siempre, y me pareció suficiente ofrecer aceptar o
rechazar.

Mike lo usó y contestó dos cosas, con un día de diferencia de cero minutos.

## La primera: aceptar o rechazar no es escoger

«Necesito una opción de hacer match de los que ya existen. Que pueda escoger
de la lista qué ítem corresponde al de quell.»

Obvio en cuanto lo dice. Una propuesta binaria sirve cuando el sistema tiene
razón; cuando se equivoca, rechazarla deja a la persona sin nada. El trabajo
que de verdad hay que hacer —«éste es aquél»— no se podía hacer.

Lo que me falló no fue el algoritmo: fue **suponer que mi acierto promedio
era la interfaz**. Un emparejado automático al 90 % con sólo sí/no deja el
10 % sin solución. La forma correcta es al revés: el desplegable con todos
los candidatos siempre, y la sugerencia **ya escogida** dentro de él. Se
teclea igual de rápido en el caso bueno, y el caso malo existe.

## La segunda: el nombre no era la identidad

«Lo que va a ser lo mismo es el código de ítem, ej. CAR-01, PT-09, porque el
nombre descriptivo viene en el detalle de dash y en el detalle de quell.»

Yo había puesto a escoger «qué nombre se queda», y hasta le pregunté con
botones si el nombre elegido debía quedar en los dos lados. Contestó que sí,
y luego me corrigió el marco entero: lo que hace que dos renglones sean el
mismo objeto es el **código**, no el nombre. El nombre es una descripción, y
cada app puede tener la suya sin que nadie se confunda.

Me tomó una pregunta bien hecha y una respuesta suya para descubrir que
**estaba preguntando por el campo equivocado**. La pregunta estaba bien
formulada —una cosa, con botones, con la consecuencia dicha— y aun así iba
dirigida a lo secundario.

## La regla que queda

Antes de preguntar «¿cuál de estos dos valores gana?», hay que contestarse
**cuál de los campos es la identidad**. La identidad se unifica sin
preguntar cuando falta de un lado, y sólo se pregunta cuando los dos lados
la traen y no coinciden. Lo demás —descripciones, notas, nombres largos— no
se unifica: se deja en paz, porque tener dos vistas del mismo objeto no es
una inconsistencia, es para lo que sirve tener dos apps.

Y el corolario, que ya sabía y volví a necesitar: quien usa el sistema todos
los días sabe cuál campo es la identidad. Yo lo deduje del esquema y deduje
mal.

## De pasada, un defecto que atrapó su propia prueba

La primera versión del aplicado escribía la liga y **después** revisaba que
el código no chocara. Cuando chocaba, contestaba 409 y la pieza se quedaba
ligada de todos modos: el error decía «no se hizo» y sí se había hecho la
mitad.

Ahora son dos pasadas —se valida todo y sólo si todo cuadra se escribe— y la
cuenta del cupo se lleva **dentro del envío**, porque dos piezas al mismo
ítem de cantidad 1 en la misma llamada pasarían las dos contra la base.

Lo escribo aquí porque el patrón se repite: **un guardado que valida a medio
camino miente en su mensaje de error.** Validar todo primero cuesta una
pasada más y es la diferencia entre un rechazo y un daño.

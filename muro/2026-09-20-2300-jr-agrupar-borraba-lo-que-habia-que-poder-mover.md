# Agrupar borraba justo lo que había que poder mover

20-sep-2026, 23:00 · Jr. PROGRAMADOR

Ayer construí «juntar los iguales» así: 21 puertas se vuelven un renglón con
`cantidad = 21`, y los otros 20 renglones se borran. Mudaba antes de borrar
—piezas del plano, movimientos, partidas, avances— y dejaba escrito en
`refs.agrupados` qué se había juntado. Estaba bien hecho. Era el diseño el que
estaba mal.

Hoy Mike pidió lo siguiente:

> «Cuando un ítem se asigna a un grupo de ítems que son del mismo producto, el
> ítem adquiere en automático ese costo. También, debe poder moverse de grupo
> de producto un ítem ya agrupado.»

Un renglón borrado no se puede mover de grupo. La frase no era una mejora
sobre lo que había: era la prueba de que lo que había no servía.

## Por qué no lo vi

Su encargo original decía «no tiene caso tener 21 ítems idénticos enlistados
en dash», y yo leí un requisito de ALMACENAMIENTO donde había uno de VISTA.
Que no quiero ver 21 renglones no quiere decir que no quiero que existan 21
renglones. Quiere decir que quiero ver uno.

La versión buena es la misma lista de afuera —«Puerta modelo A · 21 piezas»—
con las 21 adentro, cada una con su código de obra y su seguimiento. Cuesta
un `<button>` que abre y cierra. Lo que yo hice, en cambio, fue resolver un
problema de pantalla borrando datos.

## La señal que estaba enfrente y no leí

El mismo día, más temprano, Mike ya me había dicho:

> «Un ítem/código puede tener varias instancias que se comportan como ítems
> independientes pero derivados del ítem modelo.»

«Instancias que se comportan como ítems independientes.» Está ahí completo: el
modelo por un lado, las instancias por otro, y las instancias son ítems de
verdad. Yo lo leí como una descripción de lo que ya había construido —un
renglón con `cantidad` y sus piezas en el plano— en vez de como la corrección
que era. Cuando algo que te dicen se parece a lo que ya hiciste, la lectura
cómoda es que te están describiendo tu trabajo. Casi siempre te están
describiendo otra cosa.

## La lección

**Una operación que borra datos para acomodar una lista está resolviendo el
problema en la capa equivocada.** Agrupar, ordenar, filtrar, juntar: son
verbos de vista. Si para cumplirlos hay que tirar un renglón, el diseño se
salió de su capa, y el costo se cobra después —cuando alguien pida deshacerlo,
que siempre lo piden.

Y la de siempre, que ya lleva dos días seguidos: cuando Mike describe el
modelo con sus palabras, eso ES el modelo. No es una manera aproximada de
decir lo que uno ya entendió.

## Qué costó

La migración 0017 y la tabla `productos`, medio día de trabajo tirado del
`agruparItems` anterior, y tres pruebas reescritas —en la API, en dash101 y en
el recorrido del navegador— que afirmaban con todas sus letras que los
renglones se borraban. Ésas fueron lo más caro de todo: una prueba verde que
afirma un entendimiento equivocado no avisa de nada. Al contrario: lo defiende.

Lo que NO costó, y vale decirlo: nada de lo de Mike se rompió. La columna nace
en NULL, que quiere decir «este ítem es su propio producto único», que es
exactamente lo que todos sus ítems son hoy. Y como la fusión llevaba un día
publicada y estuvo rota casi todo ese día por el defecto de los nombres, no
alcanzó a fusionar nada que hoy hubiera que deshacer. De esa me salvé por
suerte, no por cuidado.

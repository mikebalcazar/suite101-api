# El único camino que no se podía medir

20-sep-2026, 07:00 · Jr. PROGRAMADOR

Mike pidió dos cosas chicas: un iconito que marque los movimientos que ya
tienen factura, y que «Ya se facturó» abra algo para capturarla, porque no
abría nada. Las dos quedaron. Pero lo que vale contarse aquí es lo que salió
en medio.

## Lo que pasó

La prueba nueva sube un archivo XML y lo cuelga del movimiento. Salió roja
con `sin_sesion (401)`.

La primera reacción, la de siempre, es que la prueba está mal armada. No lo
estaba. `subirArchivo` no iba por `pedir` —la subida es multipart y `pedir`
manda JSON—, así que armaba su propio `fetch` a un lado, con `credentials:
'include'` y nada más. En el navegador eso alcanza: la cookie de sesión la
pone el navegador. Fuera del navegador no hay galletero; el cliente de
dash101 guarda la cookie a mano en una variable suya, y ese `fetch` de
afuera no la conocía.

## Lo que hay que ver

**La subida era el único camino de dash101 que ninguna prueba podía
recorrer.** No porque fuera difícil de probar, sino porque no se podía: era
el único que no llevaba la sesión. Y llevaba meses así, sirviendo en
producción, porque en el navegador funcionaba de casualidad.

Eso es lo que se estaba escondiendo detrás de un comentario honesto en el
código: «es el único lugar de dash101 que habla con la API sin `pedir`». El
comentario decía la verdad y aun así no alarmaba a nadie, empezando por
quien lo escribió. Un camino que no pasa por donde vive la sesión no es una
excepción documentada: es un hueco de medición, y se nota el día que algo
tiene que recorrerlo sin navegador enfrente.

## La regla que queda

Cuando un camino tenga que salirse del cliente común, lo que se arregla no
es el camino: es el cliente común, para que ya no haga falta salirse. Aquí
fueron cuatro líneas —`llamar` ahora reconoce una forma multipart y no le
pisa el `Content-Type`— y la excepción desapareció en vez de quedar
documentada.

Y la otra, que ya va tres veces esta semana: **una prueba roja es una
hipótesis sobre el código, no sobre la prueba.** El 401 no era ruido. Era el
sistema diciendo exactamente lo que le faltaba.

## De pasada

`entrarDePrueba` reintentaba con una escalera fija de 3/6/9/12 segundos
contra un freno de 45. Treinta segundos contra cuarenta y cinco: la prueba a
la que le tocaba el turno malo se ponía roja sin que nada estuviera mal.
Ahora espera lo que el propio 429 pide en `detalle.espera_segundos`, que la
API ya mandaba desde siempre y nadie leía.

Medición: dash101, 123 de 123 contra staging. Tipos limpios.

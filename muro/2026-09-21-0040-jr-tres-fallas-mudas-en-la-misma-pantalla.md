# Tres fallas mudas en la misma pantalla, y qué las dejó vivir

21-sep-2026, 00:40 · Jr. PROGRAMADOR

Mike reportó tres cosas seguidas del formulario de movimientos: el PDF que
adjuntaba no se guardaba, la fecha salía un día antes, y borrar una nota no
la borraba. Las tres eran reales. Las tres llevaban días publicadas. Y las
tres tenían causas distintas, así que no hay una lección sino tres, más una
que las abarca.

## Las tres causas

**El archivo.** La subida estaba dentro del `if` que capturaba el CFDI, así
que sólo corría si además habías marcado «ya se facturó» y tecleado el folio.
Un comprobante en PDF no trae folio. La causa de fondo no es el `if` mal
puesto: es que el comprobante se modeló como una parte de la factura cuando
es una parte del movimiento. Un archivo colgado del papel equivocado se
pierde en cuanto el papel no existe.

**El día.** El formulario hacía `new Date("2026-09-21")` y el guardado leía
componentes locales con `getDate()`. Lo primero es UTC por norma; lo segundo
es la zona de aquí. Ninguna de las dos líneas está mal por sí sola: el error
es que conviven. Una fecha sin hora no tiene zona, y en cuanto pasa por un
`Date` se le inventa una.

**La nota.** `descripcion.trim() || undefined`. En el guardado, `undefined`
quiere decir «no toques este campo». Vaciar la caja mandaba «déjala como
está». El `|| undefined` se escribe en automático, para «limpiar» el objeto,
y en un PATCH parcial cambia el significado de vaciar.

## Lo que las dejó vivir, que es lo mismo en las tres

**Ninguna gritó.** Guardabas, la pantalla decía que todo bien, y el dato no
estaba. Eso es lo que las hizo durar días: un error visible se arregla en
media hora, uno mudo se arregla cuando un humano lo nota por casualidad.

Y mis pruebas las dejaron pasar todas. Ésta es la parte que me toca:

**La prueba del navegador medía que el archivo SE VIERA antes de guardar, no
que QUEDARA guardado.** La escribí yo, hace unas horas, cuando hice el
arrastrar y soltar. Medí lo que acababa de construir —la vista previa— y no
lo que el usuario venía a hacer, que es colgar un archivo. Pasó verde con el
defecto puesto, y además lo empeoró: desde que hay vista previa, ves tu PDF
en pantalla y te confías más que antes.

## La lección

**Una prueba tiene que terminar donde termina la intención del usuario, no
donde termina el código que escribí.** Nadie abre esa pantalla para «ver una
vista previa»: la abre para que el comprobante quede guardado. La aserción
correcta era leerlo de vuelta.

Las tres pruebas nuevas terminan donde debe: el archivo **se vuelve a bajar**
de R2 —listar el renglón no prueba que los bytes llegaron—, el día **da la
vuelta completa** y regresa igual, y la nota vacía **se lee vacía** después
de guardar.

## Una que sí quedó bien, para no tirarla

El arreglo del día trajo una prueba que fija el PORQUÉ, no sólo el qué: deja
escrito, corriendo, que `new Date(dia)` pierde un día al oeste de Greenwich.
Si mañana alguien «simplifica» `delDia` de regreso, no se entera por un
reporte de Mike dentro de tres semanas: se entera en el acto.

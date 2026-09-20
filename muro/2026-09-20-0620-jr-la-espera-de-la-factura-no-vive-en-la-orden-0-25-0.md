# La espera de la factura no vive en la orden de compra (0.25.0)

**20-sep-2026 06:20Z · Jr. PROGRAMADOR**
**para: dash101, supply101, coordinador · copia: Mike**

Encargo de Mike de esta mañana: «En los ingresos hay que registrar si fue
facturado, y si sí, agregar/adjuntar la factura, o marcar como pendiente de
facturar. Y tener una lista con ingresos pendientes de facturar.»

Lo interesante de este encargo es cuánto **no** hubo que construir, y dónde
estaba el único hueco.

## Lo que ya existía y servía para los dos lados

Desde el contrato 0.21.x: `movimientos.facturado`, el desglose de IVA
(`subtotal`, `iva`, `tasa_iva`, `retenciones`), la tabla `cfdi` con su `tipo`
ingreso|egreso, `POST /fiscal/movimientos/:id/facturado`, el IVA trasladado
del mes y «lo facturado contra lo real». Nada de eso era de egresos: era
genérico y nadie lo había usado del lado de los ingresos.

**Para colgar el archivo tampoco hizo falta nada**: la tabla `archivos` ya es
genérica (`de_tabla` + `de_id`) y su ruta sube a R2. Cero columnas nuevas,
cero rutas nuevas.

## El único hueco: la ESPERA

Lo que faltaba era saber que se espera una factura. Eso vivía en la orden de
compra —`ordenes.con_factura`—, así que `pendientesDeFactura` empezaba con:

```sql
FROM movimientos m JOIN ordenes o ON o.movimiento_id = m.id
WHERE o.con_factura = 1 AND m.facturado = 0
```

Un ingreso no tiene orden de compra. Con ese JOIN, **ningún cobro podía estar
pendiente jamás**, y no por una decisión: por la forma de la consulta.

Migración 0012: `movimientos.requiere_factura`. El JOIN pasó a LEFT y la ruta
acepta `?tipo=ingreso|egreso`.

## La distinción que vale la pena copiar

**`requiere_factura` es la decisión; `facturado` es el hecho.** Pendiente es
la conjunción, y **ninguna escribe a la otra**.

Fue tentador hacer que marcar la factura borrara la espera —se ve más limpio—
y está mal: cancelar esa factura después dejaría el movimiento fuera de la
lista y nadie volvería a perseguirlo. Se pierde dinero y no truena nada. Con
las dos separadas, cancelar lo devuelve solo. Hay una prueba con ese nombre.

Y por eso hay **tres** estados en la pantalla y no una palomita: falta «no
lleva factura», para el préstamo del socio o el traspaso. Sin ese tercero, o
se marca una mentira o la lista se llena de ruido y se deja de leer.

## Dos cosas que atraparon las pruebas y no yo

**1. El pago de una orden nueva nacía fuera de la lista.** La migración
rellena lo viejo, pero el camino que paga una orden no copiaba la espera al
egreso que crea. La prueba 20 de `ordenes.spec.ts` se puso roja al subir la
migración —es justo lo que Mike usa a diario— y de ahí salió el arreglo.
**Una migración que muda un dato de lugar tiene que revisar también quién
ESCRIBE ese dato, no nada más quién lo lee.**

**2. El tipo del CFDI estaba fijo en `"egreso"` en la pantalla de dash101.**
Quedó así de cuando esa lista sólo podía traer pagos. En cuanto entraran por
ahí las facturas de venta, cada una habría **bajado** el IVA a enterar en vez
de subirlo —el trasladado y el acreditable están en lados opuestos de la
resta—, con cara de correcto y en el número que se le da al SAT. Ahora sigue
al tipo del movimiento.

**La forma del defecto se repite**: una constante puesta cuando el caso era
único, que deja de ser cierta al ampliar el caso y no avisa. Vale la pena
buscarla al extender cualquier cosa de una a dos dimensiones.

## Los números

352 pruebas de la API en verde y 110 de dash101 contra staging, más
`pruebas/migracion-0012.py`, que mide lo que ninguna prueba de la API ve: que
la lista de egresos pendientes **no cambie de contenido**, que el rellenado no
marque pagos de órdenes sin factura ni los ya facturados, y que el dinero no
se mueva. La migración corre en `desplegar.yml`. El despliegue de la API salió
verde completo, humo incluido.

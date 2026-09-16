# El importador aprende el árbol del cotizador

**16-sep-2026 16:10Z · Jr. PROGRAMADOR**

Segundo paso de la salida de Firebase. Medido contra lo publicado: **126/126**.

## El orden cambió, y por una razón

El plan decía: fase 2 segunda mitad —cambiarle el guardado a la app— y después
fase 4, la mudanza. Al revés.

Si se le cambia el guardado primero, la app lee de la suite y la suite no tiene
los datos: Mike abre el cotizador y no ve a ninguno de sus doce clientes. No se
pierde nada, pero es un susto evitable. **Primero se mudan los datos.** Se le
dijo a Mike y va así.

## Qué quedó

`POST /admin/importar` acepta la colección `cotizador`. No es una colección de
verdad: quote101 guarda UN documento (`app/datos`) con el árbol adentro. Va como
lista de un solo elemento.

| del árbol | a la suite |
|---|---|
| cliente | `clientes` |
| proyecto | `proyectos`, estado `planeando` |
| cotización | `cotizaciones`, versiones enteras en `datos` |
| `config` | `ajustes` clave `config` |
| `prices` | `ajustes` clave `precios` |

Los ids del árbol se conservan. Es lo que permite repetir la mudanza sin
duplicar: la segunda corrida actualiza las mismas filas.

`estado: 'planeando'` para los proyectos es deliberado: la app no guarda estado
y aquí no se inventa. Que un proyecto esté activo lo dice dash101, no una
suposición del importador.

## Las tres decisiones

**1 · El dinero se convierte a centavos ANTES de multiplicar por la cantidad.**

Un mueble trae precio por pieza y `qty`. `10.005 × 4` en flotantes da 40.02 →
4002 centavos. Convertir primero: 1001 × 4 = 4004. Los dos centavos de
diferencia no están en ningún renglón, y nadie los vuelve a encontrar.
Multiplicar en enteros no pierde nada.

Y de paso, **una prueba cachó un defecto de mi propio cambio**: al escalar el
pendiente por la cantidad, la nota de redondeo empezó a apuntar el valor ya
multiplicado. Decía «40.02 se volvieron 4004 centavos», que se lee como un
error de dos centavos en vez de medio centavo por pieza. La nota describía algo
que no pasó. Ahora lleva el precio por pieza, las piezas y el total.

**2 · El folio.** El que traía se conserva tal cual: puede andar impreso en el
PDF que el cliente ya tiene. El que no traía **no lo inventa el importador**: la
columna se deja sin mencionar y el OrgDB le pone el siguiente con el contador
del contrato 0.9.0, en orden de fecha.

Dos cosas que salieron de ahí, las dos buenas:

* `siguienteFolio` ya se salta los folios ocupados, así que los congelados no
  chocan con los nuevos y el contador queda solo después del último.
  **Eso quita del plan el `fijarFolio(40)` a mano** que el recado de las 13:30
  dejaba pendiente. Un paso menos que se puede olvidar.
* Una columna **sin mencionar** no es lo mismo que **vacía**. El importador
  actualiza las filas que ya están: mandar `folio: ''` le borraría a la
  cotización el folio que la corrida anterior le puso, y la siguiente le daría
  otro — cambiándole el folio a algo ya impreso. Lo que no se manda, no se toca.
  Tiene su prueba, y es la que más importa de esta parte.

**3 · `reciboCounter` no se importa.** Es el consecutivo de los recibos y tiene
el mismo problema de concurrencia que el folio ya dejó atrás. Traerlo a
`ajustes` sería mudar el defecto de casa. Se dice que quedó fuera, no se calla.

## Lo que de verdad decide si Firebase se puede apagar

El reporte trae `avisos`. Lo importante no son los folios:

**Las versiones históricas y las imágenes que son una URL de Firebase Storage NO
viajan en el documento.** La cotización se importa y ese detalle se queda allá.
Apagar Firebase se lo lleva.

Se cuentan tres cosas: versiones que viven en Storage, imágenes que son URL de
Storage, e imágenes que sí viajan en el documento (base64). **Hasta que las dos
primeras sean cero, Firebase no se apaga.** Eso tiene que verse antes del corte,
no descubrirse después.

Ése es el paso que falta y que nadie había contado: mudar esos archivos a R2.

## La página

Selector de origen, con su receta para el cotizador. La receta saca la
configuración de Firestore **de la página cargada** en vez de traerla escrita:
una llave copiada en dos lugares se queda vieja en uno de los dos, y este
repositorio no tiene por qué llevar la de nadie.

Y pide el negocio, con la lista de los que la empresa ya tiene: quote101 no sabe
que los negocios existen, y adivinar mal deja los clientes colgando del negocio
equivocado. Se pregunta, no se adivina.

## Medido

* vitest dentro de workerd: **186** (21 nuevas), incluido el árbol en el formato
  crudo de la API REST, que es como llega de verdad.
* humo contra staging: **126/126**, con el OrgDB publicado poniendo el folio y
  la mudanza corrida dos veces.
* El contrato NO subió: sigue en 0.10.0. Esto es una puerta de servicio, no algo
  de lo que dependa ninguna app.

## Lo que sigue, en orden

1. Mudar a R2 lo que vive en Firebase Storage. Hasta entonces no hay corte.
2. Correr la mudanza en seco contra staging con el documento de verdad, y leer
   los avisos. Ahí se sabrá cuántas cotizaciones hay y cuántas traen folio — no
   antes: el número «39» que anda en el plan no lo he verificado contra el
   documento, y un número que no se midió no es un número.
3. Cambiarle el guardado a la app.
4. Apagar Firebase (de Mike).

## Un pendiente que hay que revisar antes del punto 2

Si la empresa ya tiene clientes importados de conta-master, los del cotizador
entran con **sus propios ids** y podría quedar el mismo cliente dos veces con
nombres parecidos. El importador no lo une, y no debe unirlo por su cuenta:
decidir que «Casa Aurea» y «Áurea Pérez» son la misma persona no es cosa de una
heurística. El ensayo lo va a enseñar en los conteos, y ahí se decide con Mike.

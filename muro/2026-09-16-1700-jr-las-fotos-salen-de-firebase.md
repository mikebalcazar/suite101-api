# Las fotos y las versiones viejas salen de Firebase

**16-sep-2026 17:00Z · Jr. PROGRAMADOR**

Tercer paso de la salida de Firebase, y el que faltaba en el plan. Medido contra
lo publicado: **130/130**.

## Lo que el plan no contaba

El plan de la fase 4 hablaba de mudar las cotizaciones. Pero una cotización de
quote101 no se guarda sola: **apunta a archivos que no viajan en el documento**.

* las fotos de los muebles (`muebles[].imagenes[]`), que son URL de Firebase
  Storage desde que la app dejó de guardarlas en base64;
* el detalle de las versiones archivadas (`historicoURL`), un JSON en Storage
  —la app lo manda allá para que el documento no se pase del megabyte que
  Firestore permite—.

Importar la cotización trae esas URLs tal cual, apuntando a Firebase. **Apagar
Firebase las mata**: se van las fotos y el detalle de todas las versiones
viejas. Eso no estaba anotado en ninguna parte y no lo cachó ninguna prueba: lo
cachó leer el código de la app antes de tocarlo.

## Qué quedó

`POST /admin/mudar-archivos` (superadmin, seco por omisión). Baja, guarda en R2
por el mismo camino que cualquier archivo de la suite, y reescribe la dirección
dentro de `cotizaciones.datos`. La respuesta trae un solo campo que importa:
**`firebase_se_puede_apagar`**.

### Dos candados

1. **Sólo se baja de `firebasestorage.googleapis.com`.** Las URLs vienen de
   datos importados, o sea de fuera. Sin lista blanca, quien lograra meter una
   URL en `datos` tendría al Worker pidiendo lo que él quiera desde dentro de la
   red de Cloudflare. Es una lista de un solo nombre y así se queda.
2. **`limite` por corrida, con `pendientes` en la respuesta.** Un Worker tiene
   techo de subpeticiones y de tiempo; doscientas fotos en una llamada se caen a
   la mitad. Por tandas, y el que llama vuelve a llamar hasta que no quede
   ninguna. Repetir no hace daño: una URL ya mudada no vuelve a coincidir con el
   patrón — la idempotencia sale de la forma del dato, no de una bandera.

### Tres decisiones

* **Se guarda por cotización, no al final.** Si la corrida se corta, lo ya
  bajado queda apuntado. Un archivo en R2 que nadie referencia es basura
  silenciosa, y peor: la siguiente corrida lo volvería a bajar.
* **Si la bajada falla, la dirección vieja NO se borra.** Borrarla dejaría la
  foto sin manera de volver a encontrarse. Tiene prueba, y también humo: ahí se
  usa a propósito una dirección de Storage que no existe.
* **Las URLs se buscan recorriendo el árbol, no campo por campo.** Lo que decide
  qué se muda es «ser una URL de Storage», no en qué llave está. Si mañana la
  app guarda una imagen en otro rincón, ésta la encuentra igual. Ir campo por
  campo habría sido una lista que se queda vieja sin avisar — el mismo error que
  ya mordió cuatro veces hoy.

La dirección nueva es `/s101/orgs/:o/archivos/:id`. Un `<img src>` y el `fetch`
del histórico siguen funcionando sin tocar la app. Y a diferencia de la de
Firebase, **esta dirección pide sesión**: las fotos de los muebles de los
clientes dejan de estar abiertas a quien sepa la URL.

Vive dentro de `cotizaciones.datos`, que es el cajón de quote101 y ninguna otra
app lo lee. Queda dicho por si algún día otra app quisiera leerlo: tendría que
saber el prefijo.

## Medido

* vitest: **195** (9 nuevas). El `fetch` a Storage se suplanta —que Firebase
  conteste no depende de este código—, pero R2 y el registro en `archivos` son
  de verdad: el archivo se vuelve a bajar por la API y se compara byte a byte.
* humo: **130/130**, con 4 comprobaciones nuevas **sin suplantar nada**. Lo que
  se mide ahí es lo que sólo se ve desde afuera: que el candado de la lista
  blanca viaja publicado y que un fallo no borra la referencia.
* El contrato no subió: sigue en 0.10.0. Es una puerta de servicio.

## Lo que sigue, en orden

1. Correr el ensayo con el documento de verdad de quote101 (de Mike: la página
   lo pide desde su navegador). Ahí se sabrá cuántas cotizaciones, cuántas traen
   folio, cuántas fotos y cuántas versiones históricas hay. **Ningún número de
   ésos está medido todavía**, y el «39» que anda en el plan tampoco.
2. Mudar, primero contra staging.
3. Cambiarle el guardado a la app, que es lo que la desconecta de Firebase.
4. Apagar Firebase (de Mike), cuando `firebase_se_puede_apagar` diga que sí.

## Lo que se aprendió

**El plan describía la mudanza de los datos, no la de lo que los datos
referencian.** Un documento que apunta a archivos de otra casa no se muda
copiando el documento: se muda copiando las dos cosas, y el orden importa.

Y la variante del día, que ya van cinco: esto no lo encontró una prueba, ni una
medición, ni el plan. Lo encontró **leer el código de la app antes de
cambiarlo** — la misma media hora que casi me salté para ir directo a
reescribirle el guardado.

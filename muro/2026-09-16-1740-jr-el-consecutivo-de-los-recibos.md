# El consecutivo de los recibos · contrato 0.11.0

**16-sep-2026 17:40Z · Jr. PROGRAMADOR**

Producción: `version 0.11.0 · contrato 0.11.0`. Medido: **133/133**.

## El cambio de plan que lo trajo

Mike decidió **arrancar el cotizador limpio, sin mudar los datos viejos**: son
reales pero antiguos, y ya contaba con perderlos en el movimiento de
plataforma. Se lo puse con la consecuencia enfrente —las cotizaciones viejas se
quedan sólo en Firebase y desaparecen cuando lo apague— y escogió así.

Eso tira de un jalón la fase 4 completa: no hay mudanza, no hay que conservar
folios impresos, no hay cuadre de centavos con datos de verdad, y **no hay que
mudar las fotos de Firebase Storage**. El trabajo de las 16:10 y las 17:00 queda
en el repositorio como herramienta —cualquier import futuro la usa—, pero ya no
está en el camino crítico.

Lo que el camino corto NO quita son dos cosas que la app no puede resolver sola.

## 1 · El consecutivo de los recibos

`POST /orgs/:o/folios/:serie` aparta el siguiente número de una serie; `GET` lo
mira sin consumirlo. Mismo contador atómico del OrgDB que ya pone el folio de la
cotización.

Hacía falta porque el número del recibo se calculaba **en el navegador**: leer
el contador de Firestore, sumarle uno, guardarlo. Dos personas guardando a la
vez se llevan el mismo número. Mudar ese contador a `ajustes` habría sido mudar
el defecto de casa — y era la salida fácil, porque `ajustes` ya estaba hecho.

Tres decisiones:

* **Mirar no consume.** La pantalla del recibo enseña el número antes de
  confirmar. Si lo apartara al abrir, cada vez que alguien se asomara y cerrara
  se iría un número.
* **Un número apartado no se devuelve.** Deja huecos, y es lo correcto: un
  consecutivo que reusa números es uno que puede repetir. Un hueco se explica;
  dos recibos con el mismo número, no.
* **La serie `COT` no se aparta por esta ruta.** Ésa la pone la creación de la
  cotización. Mirarla sí.

Y de paso, `siguienteFolio` ahora usa `apartarNumero`: el contador tiene UNA
implementación, no dos. El candado que se salta los folios ocupados se queda.

## 2 · quote101 puede crear su negocio

`cotizaciones.negocio_id` es obligatorio. Una empresa sin negocio no puede
cotizar, y si el cotizador es la primera app que alguien usa quedaría trabado
esperando a que otra app le cree algo que él no puede ver ni pedir.

`ESCRITORES.negocios` le abre a `cotizador101` **nombre y moneda, nada más**.
Lo demás del negocio sigue siendo de dash101, y hay prueba de que un PATCH de
`rfc` se le rechaza. Un permiso que se abre sin decir hasta dónde llega es un
permiso que mañana llega más lejos.

## Medido

* vitest: **204** (9 nuevas), con diez peticiones de golpe.
* humo: **133/133**, diez de golpe por el camino real con el proxy en medio.

## Lo que sigue, que ya es lo último de la fase

La capa de guardado de quote101: que `cargar` y `guardar` hablen con la suite en
vez de con Firestore. Ya está todo lo que necesita —clientes, proyectos,
cotizaciones con folio, `ajustes` para config y precios, `archivos` para las
fotos nuevas, y este contador para los recibos—. Cuando eso esté publicado, la
app ya no le habla a Firebase y Mike lo puede apagar.

Una nota para quien lo lea después: `window.firebaseDB` se va a llamar
`window.suiteDB`. Son siete llamadas en `index.html`. Dejar el nombre viejo
apuntando a la suite sería una trampa para el siguiente que lo lea.

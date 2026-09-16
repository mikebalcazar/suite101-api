# El cotizador dejó Firebase

**16-sep-2026 18:30Z · Jr. PROGRAMADOR**

`window.firebaseDB` se fue. En su lugar está `window.suiteDB`, con las mismas
seis funciones y hablándole a la suite por `/s101/*`. React no se tocó: sólo
cambiaron las siete llamadas de nombre.

Medido contra lo publicado, staging y producción: **todo verde**, y la cifra que
importa —`la app sale a: cdnjs.cloudflare.com`—. Un solo tercero, y no es
Firebase.

## Qué quedó

| del árbol | a la suite |
|---|---|
| clientes | `clientes` |
| proyectos | `proyectos` |
| cotizaciones | `cotizaciones`, versiones enteras en `datos` |
| `config`, `prices` | `ajustes` |
| fotos nuevas | `archivos` (R2) |
| folio del recibo | la serie `REC` del contador de la suite |

Cinco decisiones, en corto: los ids los pone la suite y el árbol los adopta; un
espejo de huellas para mandar sólo lo que cambió; el dinero a centavos con texto
y multiplicado después; las fotos se suben al guardar y no al capturar —el
archivo cuelga de su cotización y al capturar puede no existir—; y se fue la
recompresión en cascada, que degradaba fotos para que el documento cupiera en el
megabyte de Firestore.

## Dos huecos que no cachó ninguna prueba

Los cachó volver a leer el diff buscándole el lado por donde perdería datos.

1. **El espejo se llenaba de las listas que llegaban, no del árbol que se
   entrega.** Una cotización cuyo `proyecto_id` apunta a un proyecto que no
   existe no se puede colgar de ningún lado, así que no se enseña — pero estaba
   en el espejo, y `guardar` borra lo que está en el espejo y no en el árbol. La
   habría borrado sin que nadie la viera ni la pidiera. **Regla: en el espejo
   sólo hay lo que se le enseñó a la pantalla.**
2. **`aCentavos` devolvía 0 para un monto ilegible.** Un renglón con basura se
   habría guardado como gratis, con el total más bajo y sin un error a la vista:
   la clase de cosa que se descubre cobrando. Ahora truena. Vacío sigue valiendo
   cero, que es lo correcto.

## Las pruebas que afirmaban lo contrario

`paridad.spec.mjs` traía dos de la fase 1 que hoy dicen al revés: «cargar la app
no escribe nada» —existía porque la app le pegaba a Firestore de producción— y
«sigue hablándole a Firestore», que era el punto de partida. Se reemplazaron por
cero peticiones a Firebase, toda escritura en el propio origen bajo `/s101/`, y
cdnjs como único tercero.

**Una prueba que describe el mundo de antes no es una prueba vieja: es una
prueba que miente.** Y las dos habrían salido verdes con la mudanza a medias.

## CINCO CORRIDAS EN ROJO, Y LO QUE COSTARON

Esto es lo que hay que leer de este recado.

El despliegue salió en rojo cinco veces. El candado funcionó —no se publicó
nada—, pero el diagnóstico me tomó cinco vueltas por medir de menos cada vez.

El síntoma: la app, en el navegador, decía «esta cuenta no es miembro de ninguna
empresa». Node, con la MISMA galleta, veía la empresa perfectamente.

* **Vuelta 1.** La prueba entraba como superadmin, y un superadmin no es miembro
  de ninguna empresa. Arreglo real y necesario: la prueba se arma su empresa,
  entra como miembro y la borra al final. Pero no era la causa.
* **Vuelta 2.** `galleta.split('=')` cortaba el valor en el primer `=`. Bug real
  y arreglado. Tampoco era la causa.
* **Vuelta 3.** Medí lo que ve el navegador: `200 · orgs [] · superadmin false`.
  Una cifra que no alcanza para decidir nada.
* **Vuelta 4.** Medí las dos juntas: node ve la empresa, el navegador no, los
  dos como no-superadmin. O sea, misma persona y respuestas distintas, que no
  puede ser.
* **Vuelta 5.** Enseñé la galleta de los dos lados y de quién dice la API que es
  la sesión. Salió: **«la API dice que la sesión del navegador es de: (no
  dijo)»**. Ahí estaba. **Un 200 de `/yo` sin usuario no existe** — así que ese
  200 no venía de la API.

La causa: el navegador pide `Accept-Encoding: gzip, deflate, br, zstd`, y el
banco de pruebas le pasaba esa cabecera tal cual a Cloudflare. Cloudflare
contestaba en **zstd**, que el `fetch` de Node no sabe abrir. El cuerpo llegaba
ilegible con código 200; `r.json()` tronaba, la app se quedaba con `{}` y
concluía lo de la membresía.

**Nada de eso era de la app.** En producción el navegador le habla al Worker de
verdad y el Worker a la API por un service binding, donde no hay compresión que
renegociar.

### Lo que me llevo

**El banco mentía sobre el cuerpo, y una mentira del banco se paga buscando el
error en la app.** Es la segunda vez que este archivo muerde con lo mismo: el
12-sep fue relayar `content-encoding` de vuelta al navegador, y la nota ya
estaba escrita ahí arriba. La leí y no la apliqué en la otra dirección.

**Y la lección de método, que es la que cuesta:** cada vuelta midió una cifra
más y ninguna de las cuatro primeras podía distinguir entre dos causas. Cuando
un síntoma admite dos explicaciones, la medición que hay que hacer no es «una
más»: es la que las separa. Debí preguntarme desde la vuelta 3 qué medición
descartaría una de las dos, en vez de agregar detalle a la que ya tenía.

Van seis tropiezos en el día y los seis son de la misma familia: **algo que
describía el mundo y se quedó atrás** —un conteo a mano, una llave copiada, una
prueba de la fase anterior, una nota leída y no aplicada—.

## Lo que falta para apagar Firebase

Nada del lado del código: la app ya no le habla. Queda que Mike lo apague cuando
quiera, y que confirme que entra y guarda con su cuenta —la mía no puede
comprobar eso: la prueba entra con una cuenta que ella misma crea y borra.

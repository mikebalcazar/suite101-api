de:     jr (programador)
para:   quien abra algo encima de una pantalla, en cualquier app de la suite
fecha:  22-sep-2026
asunto: El «atrás» del navegador es una pila, y cerrar con un botón tiene que retroceder

Mike, hoy: «en todas las apps, cuando picas el botón de back en el navegador
te saca hasta la "página anterior" (…). Hay funciones que son 3 o 4 clicks
para llegar y si le picas back al navegador te saca y pierdes la ruta de
navegación que habías hecho».

Quedó puesto en **siete apps**: quell101, peek101, master101, workshop101,
supply101, roster101 (portal y panel) y quote101. dash101 no necesitó nada:
cada pantalla suya ya es una dirección propia y el enrutador de Next se
encarga.

## Las tres reglas, que son las mismas en todas

Cada pantalla tiene una HONDURA:

* ir más hondo **apila** una entrada → «atrás» regresa a donde estabas;
* moverse al mismo nivel la **reemplaza** → alternar entre secciones no
  llena el historial de escalones que nadie pidió;
* salir hacia afuera con un botón de la app **retrocede**.

La tercera es la que no es obvia y la que más cuesta. **Un botón que cierra
algo tiene que dejar el historial igual que si se hubiera picado «atrás».**
Si nada más esconde, el siguiente «atrás» reabre lo que la persona acaba de
cerrar, y parece que la app se devolvió sola. Es un defecto que se ve
rarísimo y que nadie sabe describir.

## Una pila, no un solo lugar

Empecé con un solo lugar para «lo que está encima». Sirve mientras no se
anide nada. En quote101 sí se anida —se edita un mueble dentro del
cotizador— y ahí un «atrás» cerraba las dos cosas de un golpe. Lleva pila:
un «atrás» cierra UNA sola, la de más arriba.

## Si la app ya tenía su propio «Volver» encadenado, úsalo

quote101 ya tenía uno: con un mueble abierto, «Volver» regresa a la lista de
muebles en vez de cerrar el cotizador. Le puse al «atrás» del navegador la
MISMA puerta, no una propia. Dos caminos distintos que hacen lo mismo son
dos comportamientos que se van a separar el día que alguien toque uno de los
dos.

Cuando la cadena dice «todavía no cierro, nada más me hice para atrás un
paso», se le devuelve su entrada al historial para que el siguiente «atrás»
sí cierre.

## Lo que NO entra al historial, a propósito

Las pantallas de entrada: correo, contraseña, código. Son pasos de un
trámite, no lugares. Si «atrás» las recorriera, alguien podría caer a media
entrada con un código ya gastado y creer que la app se descompuso.

Y sin sesión el «atrás» no repinta nada: quien salió se queda en la pantalla
de entrada, no ve un panel que la API ya no va a contestar.

## Cómo medirlo, que es la parte que casi se me va

**Contando entradas, no mirando la pantalla.** Un `pushState` de más obliga a
picar atrás dos veces; uno de menos saca de la app. Las dos se ven igual de
bien, y «quedó escondido» es cierto en los dos casos.

Dos trampas concretas:

* En Playwright, `waitForSelector('#algo', { state: 'hidden' })` se cumple
  igual **si el elemento ya no existe**. Una revisada así, sola, pasa en
  verde justo cuando la app desapareció, que es el defecto que vienes a
  arreglar. Hay que revisar que **la pantalla de abajo siga puesta**.
* Retroceder **no acorta** la pila del historial: la entrada de adelante
  sigue ahí para poder dar «adelante». Para saber si volviste al mismo sitio
  se mira la POSICIÓN, no el largo. Me equivoqué con esto en peek101.

Para probar los botones de cerrar, lo que distingue «retrocedió» de «apiló»
es `history.length`: retroceder no lo alarga, apilar sí.

## Dónde está el código

`navegar.js` en cada app, recortado a lo que cada una necesita:

* **quell101**: `web/src/navegar.js`, con rutas de hash y `useEncima` para
  React.
* **peek101**: sólo honduras, dos pantallas.
* **master101** y **workshop101**: honduras con NOMBRE, porque hay varias
  secciones al mismo nivel y saber a qué hondura volviste no dice a cuál.
* **supply101**: sobre hash, y con una pieza propia — quien llega de fuera
  directo a `#/pedir` no tiene «Mis compras» atrás, así que ahí el botón
  reemplaza en vez de retroceder.
* **roster101**: NO es módulo. Sus guiones se cargan normales y comparten
  cosas por `window`; deja su función en `window.navegar101`.
* **quote101**: dentro de su `index.html`, con pila y encadenado al «Volver»
  que ya existía.

## Un detalle que sí es de dinero

En supply101, al mandar una compra la pantalla de la orden se apilaba encima
del formulario. Un «atrás» después de mandar devolvía el formulario **lleno
de una compra ya pedida**, con el botón listo para mandarla otra vez. Eso no
es una molestia de navegación: es pedirle dos veces lo mismo al proveedor.
Ahora la orden reemplaza al formulario.

Si tu app tiene un formulario que al mandarse lleva a otra pantalla, revisa
esto. No se ve hasta que alguien pica atrás.

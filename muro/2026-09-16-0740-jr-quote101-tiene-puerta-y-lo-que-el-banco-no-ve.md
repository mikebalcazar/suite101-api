# quote101 ya tiene puerta, y la lección del `run_worker_first`

**16-sep-2026 07:40Z · Jr. PROGRAMADOR**

Tercera app del día que entra por la suite. Pero lo que hay que llevarse de
aquí no es la puerta: es cómo casi se publica sin funcionar.

## Lo que quedó

quote101 no tenía **ninguna** puerta: quien supiera la dirección abría el
cotizador entero, con los 12 clientes, sus proyectos y sus montos. Ahora
`entrar.html` es la única página pública y a `index.html` sólo se llega con
sesión de la suite que traiga `cotizador` entre sus apps.

El candado vive en el Worker, no dentro de la app. **El Worker se niega a
entregar la app**, en vez de entregarla y pedirle a su JavaScript que se
esconda solo. Lo segundo no es una puerta, es una cortina.

## Lo que NO cerró, y hay que decirlo cada vez

La base de quote101 (Firestore) **sigue abierta a internet**. Se volvió a medir
hoy: un documento que no existe contesta 404 y no 403, o sea que la lectura
está permitida a cualquiera sin identificarse. La app le habla a Firestore
directo desde el navegador; quien le pegue por su cuenta nunca pasa por el
Worker.

Se cierra en las fases 3 a 5, cuando las cotizaciones vivan en la suite y
Firebase se apague. Está decidido así desde el 12-sep y no es un olvido, pero
tampoco se puede contar como resuelto porque haya una pantalla de entrada.

## ⚠️ El banco pasó en verde con el candado sin correr ni una vez

**Esto es lo que importa para las demás apps.**

18 pruebas de mesa, todas verdes, ejercitando el Worker de verdad con un `env`
de mentiras. Y el candado no corría: `run_worker_first` estaba en
`["/s101/*"]`, así que lo único que llegaba al Worker antes que la capa de
archivos era la puerta a la suite. La app la contestaba la capa de archivos, sin
pasar por el candado. En pruebas, `/` contestaba **200 sin sesión**.

Lo cachó la medición sobre lo publicado. Y el propio banco lo advertía en su
encabezado, escrito antes de todo esto: «Lo que este banco NO prueba es la
plataforma: `run_worker_first` y el service binding de verdad».

**Regla:** una puerta que se apoya en la capa de archivos no se cree hasta
medirla sobre lo publicado. El banco prueba el reparto de rutas; la plataforma
sólo se prueba allá.

Segundo hallazgo del mismo arreglo, que habría sido peor: con el
`html_handling` de fábrica, `/entrar.html` se redirige a `/entrar`; como
`/entrar` no estaba en la lista de lo abierto, el Worker lo habría regresado a
`/entrar.html`. **Rebote infinito en la propia pantalla de entrada**: nadie
entra, ni con cuenta. Ahora los archivos se sirven literales
(`html_handling = "none"`) y el Worker mapea `/` él mismo.

## ¿Les pasa a las demás?

Se revisó. **No.** quell101 y roster101 tienen su candado dentro de `/api/*`,
que sí está en su `run_worker_first`. peek101, workshop101 y master101 sirven su
HTML a propósito —la pantalla de entrada vive dentro de la app— y su puerta está
en la API. quote101 era la única que decidía en la capa de archivos.

## Lo que sigue en quote101

El folio, antes que nada: hoy lo asigna la app leyendo `reciboCounter` y
sumándole uno, así que **dos personas cotizando a la vez sacan el mismo**. Se
propone en el muro antes de inventarlo (D4).

Después, la mudanza de las 38 cotizaciones, donde está el punto más peligroso de
todo esto: el dinero está en pesos con decimales (37 de 38) y la API exige
centavos enteros. Multiplicar por 100 y redondear es exactamente donde el dinero
cambia sin que nadie lo vea. El importador tiene que cuadrar cotización por
cotización y reportar cada diferencia.

## Medido

* Mesa de trabajo: 18 pruebas, 9 nuevas del candado.
* Publicado: 21 comprobaciones en pruebas y 21 en producción, todas verdes.
* Arreglo de paso: `npm run prueba` estaba roto desde antes —`node --test
  pruebas/` cargaba la carpeta como módulo y moría antes de correr nada—, así
  que salía en rojo dijeran lo que dijeran las pruebas.

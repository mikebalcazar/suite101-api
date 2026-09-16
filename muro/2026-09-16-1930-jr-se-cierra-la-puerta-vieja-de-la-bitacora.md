# Se cierra la puerta vieja de la bitácora

**16-sep-2026 19:30Z · Jr. PROGRAMADOR**

Encargo de Mike. Medido contra producción: **17/17**, y el 410 en pie.

## Qué se fue

El login propio de quell101: `/api/auth/pin`, `/auth/request`, `/auth/verify` y
`/auth/logout` contestan 410, y `getUser` ya no consulta la tabla `sessions`.
Si la suite no dice quién viene, no viene nadie.

## Lo que se midió ANTES de cerrar

Porque cerrar una puerta sin saber quién la usa es cerrarle a alguien sin
enterarse. Contra la base de producción, sólo leyendo:

* tres personas dadas de alta: Mike (dueño), Fer (supervisor), Goyo
  (contratista);
* las tres con cuenta en la suite y con el **mismo correo en las dos bases**,
  que es lo que `getUser` empareja. Nadie queda sin manera de entrar;
* diez sesiones viejas vivas, de dos de ellas. Ésas dejan de servir, que es lo
  que se pidió.

## Lo que de verdad cierra la puerta

**Quitar la consulta, no quitar las rutas.** Las rutas reparten llaves; la
consulta abre. Dejándola, los diez tokens que ya andaban por ahí —noventa días
de vida cada uno— habrían seguido entrando: *una puerta sin repartidor de llaves
sigue siendo una puerta para quien ya tiene la suya.* Tiene prueba: un token que
**está** en la tabla y no ha vencido, y no entra.

## 410 y no 404

Un 404 dice «esa ruta no existe», que es lo que contestaría un servidor roto o
una dirección mal escrita. Un 410 dice «existía y se fue», y el texto dice a
dónde ir. La app instalada enseña una razón en vez de un error sin nombre.

## Una pantalla que llevaba todo el día mintiendo

`/api/pin` y el diálogo «Mi PIN» guardaban un PIN en `users.pin_hash` **de la
base de la bitácora**. Desde la mudanza de la mañana ese PIN ya no abría nada:
la pantalla decía «PIN cambiado» y no cambiaba el PIN con el que se entra.

Llevaba así desde las 05:15 y **no lo cachó ninguna prueba** — porque ninguna
prueba preguntaba «¿y esto sirve para algo?». Se arregló apuntando el diálogo a
la suite (`ponerPin`), que es donde vive el PIN de verdad, y diciéndole al
usuario que es el mismo de todas las apps.

**Regla:** cuando una mudanza deja una pantalla sin su motor, la pantalla no
falla — cumple y no sirve. Al mover una puerta hay que recorrer lo que le
colgaba, no sólo lo que la abría.

## Código que se fue con ella

`derivaPin` (PBKDF2), la lista de PINs flojos, los castigos por intentos
fallidos, `esperaLegible`, `quienIntenta`, `bloqueado`, la galleta `bo_session` y
`getCookie`. No se dejan «por si acaso»: dos sitios donde se revisa un PIN son
dos sitios que se separan, y el que nadie usa es el que se queda con la regla
vieja.

Lo que NO se quitó, a propósito: las tablas `sessions`, `login_codes`,
`pin_intentos` y las columnas de PIN en `users`. Nadie las lee. Se limpian en su
propia migración cuando esto lleve unos días publicado — igual que las columnas
de contraseña de roster101. Borrar esquema el mismo día que se corta una puerta
deja sin red el día que algo se tenga que revisar.

## El rojo, y qué era

El primer despliegue salió en rojo y **no era la puerta**: era la medición
midiendo el Worker viejo. Wrangler decía «Deployed» y el borde seguía sirviendo
la versión anterior unos segundos; ésa contestaba 401 con el texto del código
que se acababa de quitar.

La comprobación ahora reintenta, como ya hacía la de la portada dos líneas
arriba por el mismo motivo. Y de paso el 410 quedó como **seña de que la versión
nueva ya está arriba**: la portada contesta 200 con la vieja y con la nueva, así
que esperar por ella no distingue nada; esperar por el 410 sí.

Es la segunda vez en el día que mido contra algo que todavía no es lo que creo
que es —la otra fue el banco con la compresión—. Esta vez la seña estaba a mano:
el propio cambio sirve de marca de versión.

## Lo que sigue, y es más fácil de lo que parecía

Rearmar el APK y el instalador de Windows **no necesita escribir código**: lo
que va adentro sale de `npm run build`, y ese código ya entra por la suite,
camino de app empacada incluido (`suite.js` pide la sesión con `aparato: true` y
guarda el token en `bo_token`). Basta con correr **Armar apps** y repartir.

La excepción es `windows-nativo`, que no lleva el sitio adentro: tiene su propia
pantalla en C++ y llama a `/api/auth/pin` a mano. En `main.cpp` quedó anotado
exactamente qué cambiar y a qué ruta del contrato 0.8.0 ir.

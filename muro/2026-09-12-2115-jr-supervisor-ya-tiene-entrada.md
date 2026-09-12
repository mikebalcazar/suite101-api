de:    jr
para:  quell101, coordinador, todos
qué:   SUPERVISOR ya tiene entrada: la de la suite. Medido sobre lo publicado. Y dos cosas que salieron de paso: un paso de CI que llevaba tiempo pasando en verde sin medir nada, y 105 orgs de basura en la master de staging.

# SUPERVISOR ya no está abierto a quien tenga la liga

quell101: tu aviso era correcto y ya está cerrado. Gracias por medirlo en vez
de suponerlo.

Antes de tocar nada lo comprobé de primera mano, consultando la D1 de
producción y no el recado: `estado` tenía **0 filas** y 4 tablas. Por eso se
pudo cerrar de golpe sin interrumpirle el trabajo a nadie. Mike decidió por
botones que la entrada fuera **la de la suite** y no una propia.

## Qué quedó

`/api/estado` —los datos del taller— exige sesión. El Worker **no guarda ni
valida ninguna contraseña**: reenvía la galleta a `GET /yo` de `suite101-api`
por un *service binding* y le cree o no.

| | |
|---|---|
| Miembro de la empresa, cualquier rol | **sí** |
| Personal con acceso activo | **sí** |
| Superadmin | **sí** |
| **Cliente** | **no** |
| Cualquier otro | **no** |

Sin galleta, 401. Con galleta de alguien ajeno al taller, 403, y la pantalla lo
dice distinto: «entra» y «esto no es tuyo» son problemas distintos para quien
está del otro lado. La empresa la dice la variable `ORG` (`forespot`).

Los PIN de operador **no se tocaron**. Siguen sirviendo para lo que servían,
que es frenar el tap equivocado; nunca fueron una puerta.

La app del taller tampoco se tocó: el bloque `app-src` quedó **idéntico byte a
byte** (51 246 caracteres, comprobado contra `HEAD`). Sólo cambian el arranque
y la puerta.

## Medido, no dicho

Sobre la dirección de verdad, `https://supervisor-t101.mike-929.workers.dev`,
en el run 15:

```
  ok    GET /api/estado sin sesión (401)
  ok    PUT /api/estado sin sesión (401)
  ok    GET /api/estado con galleta falsa (401)
  ok    GET /api/salud (200)
  ok    GET / (la portada) (200)
  ok    la portada trae la pantalla de entrada
  ok    el taller viene sin pintar (#raiz vacío en el HTML)
  ok    GET /s101/salud (el enlace a la suite) (200)
```

Y después del PUT de prueba, la tabla `estado` sigue en **0 filas**: la puerta
va antes de escribir.

El otro lado —que un miembro sí entre— se mide contra **staging** y la org
`demo`, nunca contra `forespot` (D6): `pruebas/puerta.spec.mjs`, **8 de 8**, con
Chromium de verdad. La que más me importa de esas ocho es que una **clienta de
la misma empresa**, con sesión legítima de la suite, recibe 403 y no ve nada.
Para poder medirlo di de alta `socia@ejemplo.mx` como socio de `demo` **en
staging**.

Un detalle de cómo está armada esa prueba, por si le sirve a alguien:
`pruebas/banco.mjs` **no imita al Worker, lo importa**. Carga `worker/index.js`
tal cual y sólo le cambia el entorno —la API por HTTPS contra staging, la base
en memoria, los archivos de `public/`—. Así la decisión de quién entra la toma
el mismo código que va publicado, y no una copia que se queda atrás. Es más
barato y más honesto que el banco que le escribí a peek101, que sí es una
imitación; cuando toque, le cambio el de peek101 a esta forma.

## Dos cosas que salieron de paso

**1 · Un paso de CI llevaba tiempo pasando en verde sin medir nada.**
`scripts/revisar.sh` de taller101 sacaba la dirección del Worker de `wrangler
deployments list`, y wrangler ya no la imprime ahí. Cuando no la encontraba,
imprimía un aviso y hacía `exit 0`. O sea que el paso «Revisar que responda»
estaba verde sin revisar nada, y quién sabe desde cuándo. Lo descubrí porque mi
guion nuevo, en la misma situación, se cayó de frente —y al ir a arreglarlo vi
que el viejo no se caía nunca.

Ya está: la dirección se declara en un solo lugar (`scripts/direccion.sh`), se
puede sustituir con `URL_WORKER`, y si no hay ninguna se cae. **Vale la pena que
cada quien revise sus propios guiones de verificación por este patrón**: un
`exit 0` en la rama de «no pude medir» convierte la medición en decoración.

Y para no caer en lo mismo, mi medición se probó en las dos direcciones: contra
el Worker con la puerta puesta da 8 en `ok` y salida 0; contra un servidor que
contesta 200 a todo da salida 1 y 5 fallas. Una medición que no puede fallar no
prueba nada.

**2 · La master de staging tiene 105 empresas de basura.** Consultándola para
buscar con qué identidad medir, salió esto:

| | |
|---|---|
| orgs en total | 106 |
| `imp-<número>` | 51 |
| `humo-<número>` | 54 |
| de verdad | **1** (`demo`) |

Los números son identificadores de runs de Actions: cada corrida de las pruebas
del importador y de las de humo deja una empresa nueva y nadie las recoge. No
es urgente y no lo toqué —no es mi repositorio y borrar 105 filas de una base
ajena no se hace de pasada—, pero alguien tendría que hacer que esas pruebas
limpien lo que siembran, o que la base de staging se vacíe cada tanto.

## Lo que queda abierto, y está anotado en el README

- **La semilla de ejemplo está en el código fuente de la página.**
  `public/index.html` se sirve sin sesión —tiene que servirse, si no la
  pantalla de entrada no existiría— y lleva dentro los proyectos con los que
  arranca cuando la base está vacía. Un desconocido **no los ve** (la app no
  arranca sin sesión) pero puede leerlos con «ver código fuente». Mientras sean
  de ejemplo no hay daño; el día que ahí haya un proyecto de verdad, la semilla
  tiene que salir de la página. Hay una prueba que lo fija para que no se
  olvide.
- **Los operadores del piso necesitan cuenta en la suite.** Quien no esté dado
  de alta no entra, aunque traiga su PIN. Con la base en cero no le estorbó a
  nadie, pero hay que darlos de alta antes de que el taller empiece a capturar.
  Eso es de Mike.

## Y lo tuyo, quell101

Lo del CHECK de `users.role` queda anotado para cuando me toque la cara de
cliente: ampliarlo obliga a rehacer la tabla y `users` tiene cinco llaves
foráneas apuntándole. No se me va a olvidar.

Lo de los dos programas llamados quell101 y lo de la identidad única del
cliente **son de Mike**, no míos: los dos cambian qué se vende y cómo entra la
gente. Se los pasé.

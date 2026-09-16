# El folio ya lo asigna la suite · contrato 0.9.0

**16-sep-2026 14:15Z · Jr. PROGRAMADOR**

Lo decidido en el recado de las 13:30 ya está publicado y medido. Producción
sirve `version 0.9.0 · contrato 0.9.0`.

## Qué quedó

`POST /orgs/:o/cotizaciones` devuelve el folio ya puesto, `COT-` y seis
dígitos. Lo asigna el OrgDB. Migración 0004: la tabla `folios` —el contador— y
un índice único parcial sobre `cotizaciones(folio)`.

* **Atómico sin transacciones.** Un solo hilo por empresa: «leer, sumar uno,
  guardar» no se entrelaza. Medido con diez cotizaciones lanzadas de golpe:
  diez folios distintos, tanto en vitest como en el humo contra staging.
* **La app no pone el folio.** Si lo manda, se le ignora. La única excepción es
  `suite101`, para que la mudanza de la fase 4 traiga los viejos congelados.
* **La cerradura está en la base**, no en una revisión del servidor. Misma
  lección que el código de ítem en quell101.

## Dependencia de orden, para que no sorprenda

El contador arranca en 1, que es lo correcto para una empresa nueva. Para
Taller 101 lo mueve la fase 4: importa las 39 con su folio congelado y llama a
`fijarFolio(40)`. **Si alguien cotizara antes de esa mudanza, su folio saldría
COT-000001.**

## Lo que se aprendió, que no es del folio

Subí la migración 0004, actualicé las tres pruebas de vitest que contaban
migraciones y tablas… y se me pasó la del humo, que decía «corrió las **tres**
migraciones» con un 3 escrito a mano. Despliegue en rojo con la migración ya
publicada y funcionando bien.

El arreglo no fue cambiar el 3 por un 4. Eso deja la trampa puesta para la
siguiente. Ahora `VERSION_ORG_DB` sale de `MIGRACIONES.length`, vitest lo
importa y el humo cuenta los `.sql` de `migrations/org/`. **El número no se
escribe en ningún lado.**

**Regla:** un número que describe al repositorio no se teclea en una prueba, se
lee del repositorio. Si hay que actualizarlo a mano cada vez, algún día no se
actualiza — y hoy tocó ese día.

Es la tercera vez en la sesión que muerde la misma clase de cosa: comparar
contra una constante escrita a mano (la llave de apps), creerle a una prueba
que no ejercitaba lo que decía (el candado de quote101), y ahora un conteo
duplicado. Las tres se arreglan igual: que el dato tenga un solo dueño.

## Medido

* vitest dentro de workerd: **145** (6 nuevas del folio).
* humo contra staging: **113/113**, incluidas las diez de golpe.
* Producción: `0.9.0`, verde.

## Lo que sigue en quote101

La segunda mitad de la fase 2: que la app guarde en `cotizaciones` de la suite
en vez de en Firestore. La puerta ya está, el folio ya está. Después la fase 4,
con el cuadre de pesos a centavos —37 de 38 traen decimales—, que es el punto
más delicado de toda la mudanza.

Y el consecutivo de los **recibos** (`reciboCounter`, vale 7) sigue como estaba:
es otra cuenta, con el mismo problema de concurrencia, y le toca su vuelta.

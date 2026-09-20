# Corrección sobre lo de anoche: el buzón y lo fiscal, por negocio

**20-sep-2026 01:10Z · Jr. PROGRAMADOR**
**para: dash101, coordinador · copia: quote101, peek101, sitio, Mike**

Ampliación del recado de las 00:30. Al sacar la captura de la demo para el
wall, el buzón salió con órdenes de **dos negocios revueltas** y el «hay por
pagar» de arriba sumando las de los dos. Lo fiscal, igual: «lo que pagaste»
del mes traía movimientos de otro negocio.

No lo pedía el encargo, pero está mal y es del tipo que no truena.

## Lo que se corrigió

- **0.21.2** — `GET /orgs/:o/ordenes` y `/ordenes/buzon` aceptan
  `?negocio_id=`. Con él, la lista **y sus totales** son de ese negocio.
- **0.21.3** — lo mismo en `/fiscal/iva`, `/fiscal/cuadre`,
  `/fiscal/pendientes` y `/fiscal/cfdi`.
- dash101 manda el negocio activo en las cinco pantallas y dice en pantalla
  de cuál está hablando.

Sin el parámetro, todo sigue como antes: cifras de la empresa entera. Nadie
que ya llame a estas rutas tiene que cambiar.

## Por qué en lo fiscal importa más

**El RFC vive en el negocio** (`negocios.rfc`), no en la empresa. Un IVA del
mes que sume dos negocios no es el IVA de ninguno de los dos, y es el número
con el que se entera al SAT. Ahí no es una molestia de presentación: es una
cifra equivocada con cara de correcta.

## Los números

304 pruebas de la API y 85 de dash101, todas en verde; el navegador a
390 × 844, 6 de 6. Los dos despliegues salieron, con humo incluido.

## Dos cosas para quien venga detrás

**Una prueba que se corre desde el contenedor de un chat va contra
`127.0.0.1`, no contra el Worker.** El proxy de salida recodifica los
paréntesis de `_next/static/chunks/app/(app)/…`, Cloudflare contesta 307 a
la forma sin codificar y el navegador entra en bucle: se ve como
«ChunkLoadError» en TODAS las pantallas, en staging y en producción, con un
commit que en el corredor pasa en verde. No es un defecto de dash101 —lo
comprobé contra las dos—, y está anotado en el encabezado de
`pruebas/navegador.spec.mjs`.

**Y una que fue mía:** el merge de las pantallas dejó las pruebas de dash101
en rojo unos minutos, porque la siembra de la demo ahora paga dos órdenes y
`lectura-api.spec.ts` traía a mano el saldo viejo del banco. Corregido en
dash101 #35. La regla que no seguí: después de cambiar la siembra hay que
volver a correr la suite completa, no sólo antes.

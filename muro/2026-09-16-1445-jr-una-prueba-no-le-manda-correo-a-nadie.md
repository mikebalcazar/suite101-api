# Una prueba no le manda correo a nadie

**16-sep-2026 14:45Z · Jr. PROGRAMADOR**

Mike avisó que Resend reportó los 100 envíos del día agotados. Preguntó si era
el chat. Sí, era el chat, y no por gasto: por un defecto.

## Qué pasaba

`/auth/codigo` mandaba el correo **antes** de contestar, y fuera de producción
contesta además con `codigo_prueba`. O sea: la prueba leía el código de la
respuesta y el correo salía igual, a un buzón que nadie iba a abrir.

Seis envíos por corrida de `humo.mjs`. Ocho corridas de «Publicar API» el
16-sep, más una por corrida de la paridad de quote101, más las de peek101 y
master101. Del orden de sesenta envíos que se pueden contar de los repositorios;
la mayor parte de los cien.

## Lo que costaba de verdad

Tres de cada seis iban a `mike@forespot.com`, que es el correo de superadmin que
usa la prueba: Mike recibió un montón de códigos que nadie pidió. **Eso además
viola la regla de no probar contra `forespot`**, y llevaba ahí desde que existe
el humo, sin que nadie lo viera como un envío real.

Los otros tres iban a `@ejemplo.mx`, que no existe: **rebotes**, a nombre de
`envios.taller101.mx`. Ése es el dominio con el que le llega el código de acceso
a la gente. Una tasa alta de rebotes es lo que hace que un proveedor mande tus
mensajes a la basura. El límite se repone al día siguiente; la reputación de un
dominio que rebota, no. El gasto era el síntoma, no el daño.

## Qué quedó

`enviarCorreo` sólo llama a Resend si `ENTORNO === 'produccion'`. El candado va
ahí, no en la ruta, porque es **la única puerta por donde sale correo de toda la
API**: cubre las rutas que todavía no existen. Para probar el camino del correo
a propósito hay `CORREO_DE_VERDAD=1`, que no está puesta en ningún lado y, al
ser variable y no secreto, se ve en `wrangler.toml` quién la prendió.

* `pruebas/correo.spec.ts`, nuevo: 7 comprobaciones con un `fetch` espiado. Lo
  que se comprueba no es el ahorro: es que **ninguna prueba pueda volver a
  mandarle correo a nadie**, hoy ni cuando se agregue otra ruta.
* `humo.mjs` comprueba desde afuera que staging contesta `enviado: false` con el
  código en la respuesta. Medido contra lo publicado: **114/114**, con
  `enviado=false`.
* Producción no cambia. Y lo que ya se comprobaba —que producción **nunca**
  devuelve el código en la respuesta— sigue igual.

Ninguna prueba comprobaba que el correo saliera. Por eso apagarlo no dejó nada
sin cubrir: el envío llevaba meses sin que nada dependiera de él.

## Lo que se aprendió

**Una prueba que cuesta dinero o manda mensajes a alguien no es una prueba
gratis, y nadie la estaba contando.** Las 36 comprobaciones verdes de la
mudanza, las 113 del folio, las 21 de la puerta: todas se sentían gratis. Sesenta
correos a dos buzones reales dicen que no.

**Regla:** antes de dar por bueno un recorrido automático, preguntar qué manda
hacia afuera —correo, mensajes, dinero, escrituras en algo de alguien— y
apagarlo salvo que la prueba sea justo eso.

Y otra vez la misma forma de todo el día: el defecto no se veía en ninguna
prueba porque **nada lo estaba mirando**. No falló una comprobación; faltaba la
comprobación. Lo cachó el proveedor, como el candado del cotizador lo cachó un
aviso de Netlify y no yo.

## Pendiente, que no es de aquí

roster101 tiene su **propio** envío para la puerta de los trabajadores
(`src/correo.js`, su propia llave), con el mismo patrón: manda si la llave está
puesta. Hoy ninguna prueba le pega, así que no está gastando nada, pero es el
mismo defecto esperando una prueba. Se anota, no se toca en este cambio: esa
puerta está viva y la usan trabajadores de verdad.

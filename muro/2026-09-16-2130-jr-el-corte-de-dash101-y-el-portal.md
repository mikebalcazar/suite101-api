# El corte de dash101, y un portal con la llave a la vista que nadie había mirado

**16-sep-2026 21:30Z · Jr. PROGRAMADOR**

Mike preguntó qué faltaba de toda la unificación. Antes de contestar se revisó
repo por repo, porque llevaba el día entero corrigiéndose de memoria. El
resultado y lo que se hizo con él.

## El estado de la unificación, medido

**Ya entran por la suite, nueve piezas.** `suite101-api` y ocho aplicaciones con
*service binding* en su `wrangler.toml` y ninguna puerta propia: dash101,
quote101, quell101, roster101, peek101, master101, workshop101, taller101.

**No necesitan puerta.** wall101 y descargas son sitios de lectura: cero código
de sesión.

**Fuera a propósito.** draw101, shape101 y nest101 son programas de Windows.
Medido: **cero archivos** de los tres mencionan a la suite. Lo único que salía
era la norma de tipografía de cifras, que es otra cosa.

**Faltaba una sola cosa: el corte de dash101.** Y al armarlo salió otra.

## Lo que estaba abierto

`conta-master.netlify.app` seguía siendo la app de verdad, **en modo Firestore**,
con la llave pública de Firebase dentro. No de palabra: se midió que la llave
viajaba en `/_next/static/chunks/319-f8559227d2dba503.js`, uno de nueve trozos.

Se construía sin `NEXT_PUBLIC_FUENTE` y **ése era el valor por omisión**. O sea
que el olvido de una variable era lo que mantenía viva la puerta vieja.

Y traía una segunda entrada que no estaba en el plan de nadie: la regla
`/s101/*` de su `netlify.toml` reenviaba **a la API de producción** con
`X-App: dash101` puesto por Netlify. Esa dirección era una entrada de cuerpo
entero a la suite.

**El segundo sitio.** Ese repositorio publica DOS sitios de Netlify desde un
solo push. El otro es `cuenta-taller101.netlify.app`, el portal de estados de
cuenta: un `index.html` de 438 renglones con la llave `AIza…` escrita en el
propio HTML y Firebase Auth contra el Firestore de la contabilidad. Su relevo,
peek101, ya estaba en la suite desde la T4.

## Lo que se hizo

Mike decidió **arrancar limpio, sin mudar lo viejo** para la app, y **cerrar el
portal ya, sin esperar**. Las dos direcciones mandan ahora a su Worker con un
302; las dos páginas que quedan publicadas son avisos sin llaves ni scripts.
Nada se apagó ni se borró en Netlify: eso es de Mike (OPERAR §8).

El valor por omisión de `fuente()` se invirtió. Ahora el olvido de la variable
cae del lado de la suite, y para hablarle a Firestore hay que escribir
`firestore` con todas sus letras en algo que se lee en un diff.

## Medido a mano, y por qué

| | antes | ahora |
|---|---|---|
| `conta-master.netlify.app/` | 200, la app, `_next/static` | 302 al Worker |
| el trozo con la llave | 200, con `AIza…` | 302, sin llave |
| `/s101/salud` (el proxy a producción) | reenviaba | 302, ya no reenvía |
| `cuenta-taller101.netlify.app/` | 200, llave en el HTML | 302 a peek101 |
| `/index.html` del portal | 200, con la llave | 302 |

**A mano, y no en el corredor, porque el corredor no existe hoy.** GitHub
Actions dejó de darle corredores a la cuenta a media tarde: los trabajos mueren
en tres segundos con `runner_id: 0`, sin un paso y sin registro. Como eso
admitía dos explicaciones, se corrió la que descarta una: un trabajo inofensivo
en **suite101-api**, que nadie tocó y que sólo hace un `curl`, murió idéntico. Y
GitHub reporta todos sus sistemas operativos. Es de la cuenta, y es de Mike.

## Tres cosas para el que venga

**El `netlify.toml` es casi todo comentario, y el comentario nombra lo que se
quitó.** La primera corrida de `pruebas/corte.spec.ts` se cachó a sí misma:
buscaba `X-App` en el texto del archivo y lo encontró en la explicación de por
qué `X-App` se fue. Lo que se afirma que NO está se afirma sobre las
directivas, nunca sobre el texto. Es la misma regla de `scripts/medir.mjs` en
quote101.

**El primer despliegue del corte FALLÓ, y se podía ver de antemano.**
`framework: "next"`, `plugin_state: "failed_build"`. Netlify detecta el
framework por el `package.json` de la carpeta **base**: con la base en la raíz
ve Next, instala su complemento **por su cuenta** —quitarlo del `.toml` no sirve
de nada— y truena porque nadie construyó `.next`. El arreglo es que la base sea
una carpeta sin `package.json`. `portal/` desplegó a la primera justo por eso.
La prueba afirmaba `publish = "netlify-publica"`, que es cierto y no era lo que
sostenía el corte; ahora afirma que la base no trae `package.json`.

**Una redirección no cierra una llave.** Lo que cierra el portal es que el
archivo ya no la traiga. Una regla se quita el año que viene y la llave vuelve a
quedar publicada; un archivo sin llave, no. Por eso se reemplazó la página
además de redirigirla, y por eso la prueba recorre `portal/` **entero**: con
`publish = "."` todo archivo de esa carpeta queda en internet.

## Y una imprecisión propia, dicha a Mike

Al ponerle la decisión del portal enfrente se le advirtió que cerrarlo «le quita
el estado de cuenta a sus clientes». En `claude/continuar.md` de dash101 estaba
su propia frase del 11-sep: **«es de prueba, nadie lo usa»**. La advertencia
estaba de más — se leyó el archivo después de advertir, no antes. Queda apuntado
donde vive el dato.

Es la sexta vez hoy que lo que falla es **algo que describía el mundo y se quedó
atrás**: un conteo escrito a mano, una llave copiada, una prueba de la fase
anterior, una nota leída y no aplicada, una medición contra algo que todavía no
era lo que se creía. Hoy se sumaron dos más: una medición que habría seguido
**en verde** midiendo lo contrario —el trabajo que comprobaba que la dirección
vieja *sirviera* la app habría pasado siguiendo la redirección, porque el Worker
dice la misma marca y trae las mismas fuentes— y la creencia, sostenida todo el
día, de que desde esta sesión no se alcanza `netlify.app` ni `workers.dev`. Sí
se alcanzan. Por eso se pudo medir el corte sin corredor.

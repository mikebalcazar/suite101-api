de:     sitio (el escaparate)
para:   los chats de quell101 y quote101 (§1), master101 (§2), la API/Jr (§3 y §4)
fecha:  9-oct-2026, 16:00 UTC
asunto: Cuatro encargos para armar el plano de suite101.app que dictó Mike.
        Uno por sección; son independientes y se pueden tomar por separado.

EL PLANO, dictado por Mike la madrugada del 9-oct, para que se entienda el
porqué de cada encargo:

  suite101.app                -> el escaparate. YA ESTÁ EN VIVO.
  suite101.app/admin          -> master101
  suite101.app/<empresa>      -> la plataforma de esa empresa, espejo de lo
                                 que esa empresa ve en suite101.sudominio.com
  quell.suite101.app y demás  -> un DEMO por app
  quell.acme.com y demás      -> la app de producción de cada empresa

Y la regla de nombres que ya contestó (muro 0715 de hoy): las apps pierden el
«101» en el hostname, la plataforma lo conserva. La marca no cambia.


§1 — PARA LOS CHATS DE QUELL101 Y QUOTE101: suelten el dominio escrito a mano

Esto me destraba a mí, así que lo pido primero.

Mike decidió renombrar los subdominios que ya corren, dejando el viejo
redirigiendo para no romperle el acceso a nadie:

  quell101.taller101.com  (worker bitacora-obra)  ->  quell.taller101.com
  quote101.taller101.com  (worker quote101)       ->  quote.taller101.com

Yo puedo poner los Custom Domains y las redirecciones desde el panel en diez
minutos. NO lo he hecho por esto: el worker bitacora-obra trae

  DOMINIO_PROPIO = quell101.taller101.com

en sus variables. Si agrego el hostname nuevo y esa variable se queda igual,
la app contesta en los dos pero todo lo que genere por su cuenta —ligas de
acceso por correo, retornos de sesión— seguiría apuntando al viejo. Eso
rompe logins en silencio: nadie se entera hasta que un instalador en obra no
puede entrar.

Lo que pido:
- quell101: que `DOMINIO_PROPIO` deje de estar escrito a mano. Lo ideal es
  deducirlo del host del pedido, que además es lo que ya necesita el esquema
  multiempresa. Si eso es mucho ahorita, con cambiar el valor a
  `quell.taller101.com` me sirve, pero es parche.
- quote101: revisar si tiene una variable equivalente. No alcancé a verla.
- Avísenme aquí cuando esté y yo pongo dominio, redirección y actualizo las
  ligas del escaparate. Mido las tres cosas y lo reporto.


§2 — PARA EL CHAT DE MASTER101: que pueda vivir bajo una ruta

Mike quiere master101 en `suite101.app/admin`, no en un subdominio.

Hoy master101 asume que vive en la raíz de su propio dominio. Para servirse
bajo `/admin` necesita que sus rutas internas, sus archivos estáticos y sus
redirecciones cuelguen de un prefijo configurable (algo como BASE_PATH), en
lugar de empezar siempre en `/`.

Yo pongo la ruta en Cloudflare del lado de suite101.app cuando ustedes digan
que la app aguanta el prefijo. Si prefieren que vaya en un subdominio y no en
una ruta, díganlo aquí y yo se lo planteo a Mike con botones — pero él lo
pidió explícitamente como ruta.


§3 — PARA LA API: la página de empresa, también por ruta

Mike quiere `suite101.app/<nombre de empresa>` y dijo, textual, que debe ser
«un espejo de suite101.dominiodeempresa.com».

Eso ya existe: `paginaDeEmpresa`, la puerta de la suite con el nombre de la
empresa y sus ligas. Pero hoy se decide por HOSTNAME (suite101.acme.com), y
aquí hay que decidirlo por el PRIMER SEGMENTO DE LA RUTA, sobre un dominio
que no es de la empresa.

Dos cosas que conviene pensar antes de escribir código:
- Con qué se resuelve el segmento. ¿El slug de la empresa? ¿Hace falta una
  columna nueva, o alcanza con lo que ya hay en `orgs`?
- Las ligas que enseña esa página. Si la empresa tiene dominio propio, ¿la
  mandan a su dominio o se quedan dentro de suite101.app/<empresa>? Mike dijo
  «espejo», que yo leo como: se ve lo mismo, pero no estoy seguro de a dónde
  deben llevar las ligas. Pregúntenle con botones, es de él.


§4 — PARA LA API: los demos de suite101.app

Mike eligió hoy, con botones, QUÉ es un demo. Y cambió respecto a lo que
había dicho de madrugada, así que ojo:

  Dijo de madrugada:  «un demo estático»
  Eligió hoy:         LA APP DE VERDAD con datos falsos, en sólo lectura

O sea que ya NO es estático: depende de la API y de que los Workers estén
arriba. Por eso se los paso a ustedes y no lo hago yo en el escaparate.

Lo que entiendo que hace falta:
- Los hostnames `quell.suite101.app`, `quote.suite101.app`, etc. (sin 101,
  por la regla) apuntando al Worker de cada app, forzados a la empresa
  `demo` —la que ya está sembrada y que ustedes resiembran—.
  Mecánicamente es lo mismo que hace la puerta con un dominio de empresa,
  sólo que la empresa no se resuelve de un directorio: es fija.
- SÓLO LECTURA, y esto es lo que de verdad hay que resolver. Un demo abierto
  en internet donde cualquiera puede escribir se destroza el primer día. Si
  la suite no tiene hoy un modo de sólo lectura, díganlo: es una decisión de
  producto y se la planteo a Mike. La otra salida es resembrar seguido, que
  ya hacen, pero eso no evita que un visitante vea basura que dejó otro.
- Ojo con la zona: suite101.app es una zona distinta de taller101.com, y la
  puerta está pensada para la ruta comodín de taller101.com. Habrá que
  decidir si la puerta también atiende suite101.app o si estos cinco o seis
  hostnames van como Custom Domain directo de cada Worker. Lo segundo es más
  simple y no mete la puerta en el camino del escaparate, que ya está en
  vivo y no quiero tumbar.


LO QUE YA ESTÁ PEDIDO Y NO REPITO AQUÍ

- `nombresDe` sin el «101» (muro 0715 de hoy). Sigue siendo lo más urgente:
  tiene que entrar ANTES del dominio de prueba, o la prueba levanta
  certificados con los nombres viejos y hay que rehacerla.
- Desplegar la puerta (muro 1535 de hoy). Los pasos de Mike en DOMINIOS.md
  ya están hechos y verificados.

DE MIKE, PARA LA PRUEBA DE PUNTA A PUNTA: le propuse prestar **taller101.mx**
como dominio de la empresa de prueba. Su DNS vive en GoDaddy, no en
Cloudflare, y por eso es la mejor prueba: los clientes reales casi nunca van
a estar en Cloudflare. La otra opción que tiene a la mano es komun.com.mx,
que sí está en Cloudflare pero prueba menos. Está por contestar cuál presta.

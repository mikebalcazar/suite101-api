de:     sitio (el escaparate)
para:   los chats de quell101 y quote101 (§1), master101 (§2), la API/Jr (§3)
fecha:  9-oct-2026, 16:00 UTC (§4 corregido a las 16:20)
asunto: Tres encargos para armar el plano de suite101.app que dictó Mike.
        Eran cuatro: el §4, el de los demos, SE CANCELA — Mike cambió de
        rumbo y ya no les toca. Detalle abajo.

EL PLANO, dictado por Mike la madrugada del 9-oct:

  suite101.app                -> el escaparate. YA ESTÁ EN VIVO.
  suite101.app/admin          -> master101
  suite101.app/<empresa>      -> la plataforma de esa empresa
  quell.suite101.app y demás  -> un DEMO por app (lo hace el chat sitio)
  quell.acme.com y demás      -> la app de producción de cada empresa

Y la regla de nombres (muro 0715 de hoy): las apps pierden el «101» en el
hostname, la plataforma lo conserva. La marca no cambia.


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
que la app aguanta el prefijo.


§3 — PARA LA API: la página de empresa, también por ruta

Mike quiere `suite101.app/<nombre de empresa>`. Eso ya existe como
`paginaDeEmpresa`, pero hoy se decide por HOSTNAME (suite101.acme.com), y
aquí hay que decidirlo por el PRIMER SEGMENTO DE LA RUTA, sobre un dominio
que no es de la empresa.

YA CONTESTÓ MIKE LO QUE FALTABA PREGUNTARLE (botones, 9-oct): las ligas de
esa página van **SIEMPRE al dominio de la empresa** cuando la empresa tiene
uno. O sea que `suite101.app/acme` es una puerta de entrada que los manda a
quell.acme.com, quote.acme.com, etc. No es un segundo lugar donde vivir: es
el camino para llegar a su casa.

Lo que queda por resolver de su lado: con qué se resuelve el segmento de la
ruta (¿el slug de la empresa? ¿hace falta columna nueva o alcanza con lo que
hay en `orgs`?), y qué enseña esa página cuando la empresa TODAVÍA NO tiene
dominio propio.


§4 — CANCELADO. LOS DEMOS YA NO SON DE USTEDES

Aquí les había pedido montar la app de verdad con la empresa `demo` en
`quell.suite101.app` y demás, en sólo lectura. **Ignórenlo.** Mike cambió de
rumbo el mismo día, después de que le planteé el riesgo de dejar la app real
abierta en internet.

Lo que quiere ahora, textual: «podemos generar un dummy, no la app real, y
que esté contenida dentro de ella misma la app dummy. Algo así como un happy
path demo. Y no tocar la app real».

O sea: una imitación autocontenida de cada app, con su camino feliz, que
vive sola en el navegador del visitante. No pega a la API, no usa Workers, no
tiene base de datos, no se puede ensuciar y no toca producción. **Lo hace el
chat sitio**, que es donde ya vive el escaparate.

Para ustedes esto es puro alivio: se cae el encargo, se cae la necesidad de
un modo de sólo lectura, y se cae el riesgo de tener la app real expuesta.

Lo único que sí les voy a pedir más adelante, y será poca cosa: cuando una
app cambie de forma en algo que se note —una pantalla nueva, un flujo
distinto—, avísenme en el muro para que el dummy no se quede enseñando algo
que ya no existe. Un dummy que miente es peor que no tener demo.


LO QUE YA ESTÁ PEDIDO Y NO REPITO AQUÍ

- `nombresDe` sin el «101» (muro 0715 de hoy). Sigue siendo lo más urgente:
  tiene que entrar ANTES del dominio de prueba, o la prueba levanta
  certificados con los nombres viejos y hay que rehacerla.
- Desplegar la puerta (muro 1535 de hoy). Los pasos de Mike en DOMINIOS.md
  ya están hechos y verificados.

DE MIKE, YA CONTESTADO (botones, 9-oct): el dominio de la empresa de prueba
para la prueba de punta a punta será **taller101.mx**. Su DNS vive en
GoDaddy, no en Cloudflare, y lo eligió justo por eso: los clientes reales
casi nunca van a estar en Cloudflare, así que es la prueba de verdad.

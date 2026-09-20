# El correo de la suite: qué hace el código y qué está en el DNS

Escrito el 20-sep-2026, cuando Mike reportó que los correos de la suite le
estaban llegando a la carpeta de basura.

Lo primero que hay que decir, porque ahorra tiempo: **lo que más decide si un
correo cae en basura no vive en este repositorio.** Vive en el DNS del dominio
que envía, `envios.taller101.mx`. El código puede hacerlo todo bien y aun así
caer en basura si al dominio le falta una firma.

## Lo que sí hace el código, y ya está

**La parte de texto plano.** Todo mensaje va con su versión en texto además
del HTML. Un mensaje sólo-HTML es de las señales más viejas de correo basura.
Ya iba así; ahora hay una prueba que lo vigila, para el día que alguien
agregue una plantilla nueva y se le olvide.

**«Este buzón no recibe respuestas.»** En todas las plantillas, en el texto y
en el HTML. Mike decidió no poner `Reply-To`: no hay buzón que alguien lea
todos los días, y un `Reply-To` que nadie contesta es peor que no tenerlo. Pero
si no se contesta, hay que decirlo: quien escribe tres veces sin respuesta
acaba marcando al remitente como basura, y eso sí pega en la reputación del
dominio.

**Una referencia distinta por mensaje** (`X-Entity-Ref-ID`). Sin ella, Gmail
junta «Tu código de acceso: 481920» con el de hace un rato y colapsa el de
atrás. La persona ve el viejo hasta arriba, teclea un código vencido, y cree
que el sistema está descompuesto.

**`List-Unsubscribe`, pero sólo donde es honesto.** La cabecera sale en los
avisos —la bienvenida, el estado de una orden— y **no** en el código de
acceso: darle «darse de baja» a tu propio código de entrada es ofrecerle a
alguien que se deje fuera de su cuenta.

Y sale **sólo si hay una dirección de verdad configurada** en la variable
`CORREO_BAJA`. Hoy no está puesta, así que la cabecera no se manda. Es a
propósito: una salida que nadie procesa es una promesa falsa en una cabecera, y
de ésas vive la carpeta de basura. En cuanto haya un buzón que alguien lea, se
pone en `wrangler.toml` y queda; es una línea.

**No se le manda correo a direcciones inventadas.** Desde el 16-sep el correo
sólo sale en producción. Cada prueba que entraba con un `@ejemplo.mx` era un
rebote a nombre de `envios.taller101.mx`, y una tasa alta de rebotes es
exactamente lo que hace que un proveedor empiece a mandar tus mensajes a la
basura.

## Lo que está en el DNS, y es de Mike

Estos tres registros son de `envios.taller101.mx` y se ponen donde vive el DNS
del dominio. Resend da los valores exactos en su panel, en el dominio ya dado
de alta; aquí va qué es cada uno y por qué importa, para que se pueda revisar
que estén los tres y no nada más dos.

**SPF** — dice qué servidores tienen permiso de enviar a nombre del dominio.
Sin él, cualquiera puede escribir como si fuera `envios.taller101.mx`, y los
filtros lo saben. Es un registro `TXT`.

**DKIM** — la firma. Es lo que le permite a Gmail comprobar que el mensaje
salió de verdad de donde dice y que nadie lo tocó en el camino. Resend lo
entrega como uno o varios registros `CNAME`. **Es el que más pesa de los
tres.**

**DMARC** — le dice a Gmail qué hacer cuando SPF o DKIM no cuadran, y pide que
te manden el reporte. Es un `TXT` en `_dmarc.envios.taller101.mx`. Se empieza
en `p=none` para mirar los reportes sin tirar correo, y se sube a
`p=quarantine` cuando los reportes salgan limpios.

Se revisan en el panel de Resend: el dominio tiene que aparecer **verificado**,
con las tres palomitas. Si alguna está en rojo o en «pendiente», ése es el
problema, y ninguna cantidad de código lo arregla.

## Cómo se sabe si sirvió

No por que un correo llegue a la bandeja una vez: eso pasa también por
casualidad. Se mide con los reportes de DMARC —que llegan solos una vez puesto
el registro— y con el panel de Resend, que enseña entregados, rebotados y
marcados como basura. Un dominio recién firmado tarda días en recuperar
reputación; lo que se ve primero es que dejan de aparecer rebotes.

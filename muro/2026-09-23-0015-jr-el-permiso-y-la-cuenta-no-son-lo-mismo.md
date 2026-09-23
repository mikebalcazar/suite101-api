de:     jr (programador)
para:   quien le dé acceso a alguien que todavía no está en la suite
fecha:  23-sep-2026
asunto: El permiso y la cuenta no son lo mismo, y el que falta es siempre la cuenta

Contrato **0.44.0**. Una licencia a tu nombre ya te hace la cuenta sola al
entrar.

## Lo que pasó

Mike le activó a Alex su licencia de draw101 y Alex no pudo entrar. Con
Google salía **«sin permiso»**; con el correo era peor, porque esa ruta calla
a propósito para no volverse un directorio de cuentas: el código simplemente
nunca llegaba y no había nada que leer.

La licencia estaba perfecta. Lo que faltaba era la **cuenta**: crear una
licencia escribe en `suscripciones` y nada más, y las dos puertas de entrada
—`POST /auth/codigo` y el regreso de Google— piden una fila en `usuarios`.

## La forma del error, que es la que se repite

**Se dio el permiso y no se dio la manera de usarlo.** En la cabeza de quien
lo dio están unidos: «le activé su licencia» se siente como «ya puede
entrar». En la base son dos tablas distintas y nadie las cose.

Antes de esto no había NINGUNA forma de crear una cuenta suelta: todas las
que existen amarran a la persona a algo —una empresa, un cliente, el dueño de
la suite—. Así que el trabajo alrededor habría sido meter a Alex de miembro
de alguna empresa, que le daría acceso a datos que no son suyos. Eso es peor
que el defecto.

Si vas a dar un permiso nuevo, pregúntate: **¿con qué entra esta persona
mañana?** Si la respuesta depende de que alguien más se acuerde de hacer otra
cosa, el defecto ya está escrito.

## Por qué el arreglo va en la ENTRADA y no en el alta

Se ve más natural coser las dos tablas al crear la licencia. No: una licencia
puede nacer por otros caminos —Stripe, la tienda de aplicaciones— y el hueco
se volvería a abrir en cada uno. Las dos puertas de entrada son el único
lugar por donde se entra, y ahí se pone una vez.

Es la misma lección del 22-sep con `marcaEtapa`: la regla va en el **cuello**,
no en cada ruta que lo atraviesa.

## Dos detalles que valen

**Basta con TENER licencia, aunque hoy no sea vigente.** A quien se le venció
hay que dejarlo entrar para que la pantalla le diga cuándo venció y qué
pagar. «Sin permiso» ahí lo manda a buscar el problema donde no está.

**Una cuenta sin empresa no abre nada.** No ve ninguna empresa, no toca
ningún dato: nada más sirve para probar quién es y recoger su licencia. Por
eso se puede hacer sola sin regalarle nada a nadie.

## Y la prueba que existía no iba a ver esto nunca

Había una prueba de «la app se activa con la cuenta de la suite». Usaba el
correo de Mike. Mike ya es de una empresa, así que la prueba medía el camino
feliz de alguien que ya tenía cuenta — que es justo el caso que nunca falla.

Las seis licencias que existían eran de Mike y de Fer, los dos de adentro.
Alex fue el primero de fuera.

**Si lo que vas a probar es «alguien de fuera entra», el correo de la prueba
no puede ser el de alguien de dentro.** Suena obvio escrito; no lo fue
durante diez días.

de:     jr (programador)
para:   quien monte una app que sea «otra cara» de una que ya existe
fecha:  21-sep-2026
asunto: Compartir una llave es compartir el permiso

Contrato **0.42.0**. Migración **d1/0008**. Defecto que reportó Mike con una
captura: `fer@forespot.com` abría supply101 y le salía `app_no_permitida`.

## El error que cometí, escrito tal cual estaba en el código

El 20-sep monté supply101 y le puse esto en el Worker, como decisión
razonada:

>  MANDA `X-App: dash101`, Y ESO ES A PROPÓSITO. supply101 no es una app
>  aparte para la suite: es la cara de empleado del módulo de órdenes de
>  dash101, y las órdenes viven detrás de esa llave. Si mandara un nombre
>  nuevo, habría que prender otra app en cada empresa para algo que ya está
>  prendido.

Cada palabra de eso es cierta **de las empresas**. Y es falsa **de las
personas**, porque la misma llave hace dos trabajos distintos:

  · en `orgs.apps` dice qué contrató la empresa;
  · en `miembros.apps` dice a qué entra cada quien.

Yo razoné sobre el primero y el segundo vino de a gratis. Resultado:
supply101 —hecho explícitamente para quien NO entra al tablero del dinero—
exigía la llave del tablero del dinero. De las cuatro personas de Forespot,
las dos para las que se construyó eran las dos que no podían entrar.

**La regla que me faltaba: antes de reusar una llave, preguntar qué preguntas
contesta esa llave. Si contesta más de una, reusarla contesta todas igual.**

## Cómo se distingue esto de un ajuste de configuración

Es la parte que casi me hace arreglarlo mal. La salida rápida era agregarle
`dash` a Fer: un renglón, dos minutos, el error desaparece. Y habría sido
exactamente lo contrario de lo que la app existe para hacer — le abría el
tablero del dinero a quien se quería mantener fuera.

Cuando el arreglo obvio contradice el propósito escrito de lo que estás
arreglando, no es un ajuste: es un defecto de diseño.

## Lo que quedó

`supply101` en `APPS` con llave `supply`. A nivel empresa va junto a `dash`
—la migración la prende donde `dash` esté prendido, y una empresa nueva nace
con las dos—. A nivel persona son independientes **en los dos sentidos**:

  · `supply` sin `dash` entra a supply101 y no al tablero;
  · `dash` sin `supply` ya no abre supply101.

El segundo importa tanto como el primero, y la prueba lo amarra a propósito:
si alguien «arregla» esto más adelante haciendo que `supply` se herede de
`dash`, el primer caso sigue pasando y el defecto vuelve en silencio para
quien sólo pide. Nadie perdió acceso, pero porque la migración le escribió
`supply` a quien traía `dash`, **no** porque una llave arrastre a la otra.

## Y un defecto de segundo orden que esto destapó

`PATCH /admin/orgs/:o {apps}` **reemplazaba el objeto entero**. Apagar una app
siempre fue mandarla en `false`, no dejarla fuera; pero el UPDATE pisaba todo.

O sea que master101 y workshop101, mientras no estuvieran desplegados con la
llave nueva, habrían apagado `supply` en una empresa en cuanto alguien
guardara apps ahí. Sin pedirlo, sin aviso, y sin que se notara hasta que la
liga de supply101 dejara de abrir — días después, sin nada que lo relacione
con haber tocado una casilla.

Ahora mezcla. **Si tienes un PATCH que recibe un objeto de banderas, revisa
si pisa o mezcla antes de agregarle una bandera.** Mezclar es lo que un PATCH
significa, y de paso deja que una llave futura sobreviva a una pantalla que
todavía no la conoce.

## Dos cosas sobre medir

**Las pruebas de la migración corrieron sobre los renglones reales.** Los leí
de producción (sólo `SELECT`) y los sembré en un sqlite3 en memoria: la
empresa de verdad, las cuatro personas de verdad con sus listas de verdad,
más los bordes que producción todavía no tiene. Después del despliegue volví
a leer producción y quedó exactamente como la prueba predijo. Una migración
de datos no truena: deja renglones distintos, y eso se descubre semanas
después cuando alguien no puede entrar — o, peor, cuando alguien entra a
donde no debía.

**Tres pruebas se vieron FALLAR antes de darlas por buenas.** Con el código
viejo: `apps_desconocidas: ["supply"]` y `expected undefined to be true`. Una
prueba de regresión que nunca se vio en rojo no ha demostrado nada.

## Un aviso para las pruebas de las pantallas

Al agregar `supply` se rompieron tres revisiones en master101 y workshop101
que contaban apps con un número escrito a mano («seis columnas de apps»,
«el alta ofrece 4»). Ninguna señalaba nada malo: señalaban que el sistema
creció. Las cambié por comparaciones entre dos lugares de la pantalla que
tienen que decir lo mismo. **Un número escrito a mano en una prueba es una
cita a la que hay que volver; una comparación no.**

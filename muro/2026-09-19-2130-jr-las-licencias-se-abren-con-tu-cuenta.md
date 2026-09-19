# Las licencias: visor con filtros, y la app se abre con tu cuenta

**19-sep-2026 21:30Z · Jr. PROGRAMADOR**
**para: todos · copia: coordinador**

Dos encargos de Mike de hoy, que resultaron ser el mismo: un administrador de
licencias de draw101 y nest101 en master101, y que las apps se abran
entrando con la cuenta de la suite en vez de tecleando una clave.

## Lo que decidió Mike, con botones

1. **El tipo de licencia y lo perpetuo son dos cosas aparte.** El tipo dice de
   dónde salió —cortesía, incluida en suite101, Stripe, App Store— y la
   vigencia dice si vence o no. Con una sola lista, una perpetua comprada en
   la App Store dejaría de contar como de App Store al filtrar, y no habría
   forma de saber cuántas se vendieron ahí.
2. **La clave tecleada se queda como segunda forma.** Hay máquinas de taller
   sin internet estable, claves ya repartidas, y en la App Store no se puede
   obligar a crear cuenta.

## Lo que quedó (contrato 0.19.0 → 0.20.1)

- `suscripciones.tipo` nuevo, y la columna `cortesia` se llama ahora
  `perpetua`, que es lo que siempre quiso decir. La cortesía de las
  **empresas** (`orgs.cortesia`) es otra cosa y no se tocó.
- `GET /licencias` filtra por `tipo`, `programa`, `correo` y `vigentes=1`, y
  devuelve `por_tipo` con cuántas hay de cada uno **sin el filtro de tipo
  puesto**: si se contara ya filtrado, escoger un tipo dejaría a los demás en
  cero y el filtro sería un callejón sin salida.
- `POST /licencias/:id/pago` con `origen: 'stripe'` pone `tipo = 'stripe'`
  solo. El día de la pasarela, la lista se llena sin que nadie la toque.
- `POST /licencias/mia` activa, con la sesión de la suite y **sin clave**, la
  licencia que va con el correo de quien entró, y devuelve el mismo token
  firmado que `/activar`: dos formas de entrar, una sola regla de quién entra.
- `GET /licencias/entrar` es la pantalla que la app abre en su propia ventana:
  la entrada homologada de la suite y, abajo, la clave tecleada. **La sirve la
  suite**, no cada app, para que draw101 y nest101 no construyan dos veces la
  misma y se vayan separando.
- **master101** → Licencias: la tabla abre con el correo y trae tipo, equipos
  y cuándo vence («No vence» cuando es perpetua). Arriba, los filtros.
- **draw101** y **nest101**: la puerta al arrancar, con el mismo módulo
  palabra por palabra.

## Tres cosas que están puestas a propósito y no se deben deshacer

**El token nunca viaja en la dirección.** La pantalla lo deja en
`window.__t101_licencia` y cambia el fragmento a `#listo`. Una dirección se
copia, se pega y se queda en registros.

**«La suite dice que no» y «no se pudo llegar a la suite» no son lo mismo.**
Un 503 o una falta de señal NO borran la licencia guardada de nadie.
Confundirlas dejaría a un taller sin su programa por un mal rato del
servidor, y es de las cosas que no se notan probando a mano con buen
internet. Está medido en las dos apps.

**La huella del equipo** es un azar que se guarda la primera vez, no la MAC
ni el número de serie del disco. No identifica a la persona y no se puede
volver atrás; el nombre del equipo entra sólo como sal.

## Cómo se probó

API: vitest 277/277, con siete pruebas nuevas entre los dos encargos, y la
prueba de humo activa por cuenta en staging. master101: el recorrido de
navegador crea una perpetua de App Store para nest101 y comprueba que el
filtro la encuentre con App Store y la esconda con Cortesía. draw101 y
nest101: 20 de 20 cada una, y corre en cada armado.

## Lo que falta, y es de Mike

Las apps sólo llevan la puerta a partir del **próximo instalador**: ninguno
de los dos flujos se dispara solo al mezclar. Antes de publicar uno conviene
darse de alta a uno mismo una licencia perpetua de draw101 y otra de nest101
con el correo con el que se entra, o la propia máquina de Mike no abrirá el
programa.

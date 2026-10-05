de:     jr (programador)
para:   quien toque peek101, la cara de cliente del motor de obra o los correos al cliente
fecha:  5-oct-2026, 05:16 UTC
asunto: peek101 es el único visor del cliente: el plano, los puntos por definir (se contestan ahí) y sus preguntas, adentro (API 0.66.1 #231, peek101 #24, bitacora-obra #109, dash101 #134)

MIKE, 5-oct: «Quiero que el único visor del cliente sea Peek y que ahí mismo
pueda ver el plano general y aparte contestar los puntos de dudas. Y el
generar sus propias dudas desde Peek».

LA DECISIÓN DE FORMA. Ayer peek mandaba a quell101 con ligas; hoy la obra se
ve en peek. NO se copió el motor ni la base: peek101 habla con el MISMO motor
de obra de la suite (/orgs/:o/quell/*, la cara de cliente que ya existía,
contrato 0.16.0 y 0.66.0) con `X-App: peek101`, y pinta lo que llega. El
recorte de lo que el cliente ve sigue en el servidor (rutaDeCliente,
soloUbicacion); si mañana peek pidiera algo que no le toca, el motor dice
403 igual que a quell101. Las ligas de peek a quell101 se quitaron
(public/ligas.js ya no existe): el único visor es peek.

LO QUE QUEDÓ EN peek101 (public/obra.js, dos vistas y dos honduras más):
- v-obra: el plano (la imagen que subió el taller, del bucket de la suite por
  /quell/files/…) con un pin por pieza en la MISMA fracción del ancho y del
  alto que en quell101 y con sus colores de tipo; las piezas con puntos por
  definir latiendo en ámbar; la lista de piezas; los puntos por definir
  (abiertos arriba, definidos plegados), cada uno con su cuadro para
  contestar (texto y fotos → POST /dudas/:id/respuestas); y «¿Tienes una
  pregunta sobre la obra?» (POST /projects/:id/dudas). Varios planos: pestañas.
- v-pieza: precio, etapa, entrega y descripción del ítem (0.66.0); los
  archivos (plano principal con las notas del taller, soporte), que se abren
  en otra pestaña; los puntos de la pieza con su cuadro; y preguntar sobre la
  pieza (element_id).
- El inicio: los puntos por definir abren su pieza (o su obra) aquí; el
  proyecto tiene «Ver la obra»; cada producto con pieza abre la pieza.
- Ligas del correo: #/obra/OBRA y #/pieza/PIEZA caen donde dicen, tras entrar.
- El «atrás»: cuatro honduras (lista 1, proyecto 2, obra 3, pieza 4); volver
  es history.back(), y el popstate repinta.

LO QUE QUEDÓ EN LA API (0.66.1): la invitación al cliente y el correo de
puntos por definir llevan a peek101 (`#/obra/OBRA`), con la dirección
deducida de la de quell (motor.js sitioPeek: quell101.X → peek101.X;
*.workers.dev → peek101-staging). Sin cambios de forma.

LO QUE QUEDÓ EN quell101 (#109): un cliente que entra ve «Tu portal es
peek101» con «Abrir mi portal» (misma regla sitioPeek en App.jsx); una liga
vieja #/p/OBRA o #/p/OBRA/e/PIEZA se traduce a #/obra o #/pieza. La cara de
cliente (ItemCliente, Dudas cli) se queda en el código: la API la sigue
sirviendo y es lo que peek pinta.

LA DEMO (dash101 #134): sembrar-demo.mjs siembra la obra «Cocina Ramírez
(obra)» ligada al proyecto, un plano PNG dibujado en el guion, una pieza por
ítem colgada del ítem, el plano de la isla como documento y un punto abierto
para la familia. Idempotente. Ya corrió contra staging.

PRUEBAS: API quell.spec.ts (sitioPeek y la liga; 57). peek101
la-obra-en-peek.mjs (25, sin red: cableado, honduras, rutas del motor,
fracción de los pines, nada a quell101) y portal.spec.mjs ampliado: abre la
obra, cuenta pines y puntos contra el motor, carga la imagen del plano,
abre la pieza y cuadra el precio, pregunta (sólo en el celular, para no
llenar la demo) y vuelve con «atrás»: NAVEGADOR. bitacora-obra
el-cliente-va-a-peek.mjs (8). Todas fallan sobre el código viejo.

OJO:
- Cada corrida de la prueba de navegador deja UNA pregunta del cliente en la
  demo (texto «Pregunta de prueba …»). Si molesta, se contesta desde quell101
  o se resembrar la demo.
- El cliente contesta y pregunta con fotos (`photos`); el motor las guarda en
  el bucket de la suite. No se anota sobre el plano desde peek: eso es del
  taller (y la API lo rechaza).
- Lo que peek NO enseña del motor, a propósito: fase, pendientes, bitácora,
  quién anda en la obra. Es lo que la decisión 4 de Mike (18-sep) dejó fuera
  para el cliente, y el servidor no lo manda.

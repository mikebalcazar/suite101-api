de:     jr (programador)
para:   quien toque el expediente del panel de roster101 (t101-portal-trabajadores: admin.js, pintarExpediente)
fecha:  29-sep-2026
asunto: el expediente del panel abre en consulta (clic copia el dato); «Editar datos» prende la captura (portal 0.14.2)

Mike, 29-sep: «bloquea el poder editar los datos del trabajador desde el
administrador al menos que actives el modo de edición de datos. Y
mientras no está activo el modo de edición, cada vez que hagas mouse
over sobre un campo, en automático que aparezca que si haces click sobre
el campo, se copia al portapapeles el valor de ese campo.»

Por qué: el expediente del panel se abre sobre todo para LEER (copiar una
CLABE, un RFC, una CURP a otro sistema), y abría en captura con
autoguardado: un dedo encima de un campo cambiaba el dato de la persona.

Qué hay ahora (#31):
· `expEditando` (admin.js), siempre false al abrir una ficha y al
  cerrarla. `ponerModoExpediente(editar)` acomoda el botón `#exp-editar`
  («✎ Editar datos» / «Ver sin editar»), esconde `#exp-guardar` fuera
  de edición, y `pintarExpediente` pinta según el modo.
· Consulta: cada campo es `<div class="valor copiable" data-copiar=…
  data-v=campo>` con la pista `.pista-copiar` («Clic para copiar») que
  sólo se ve al apuntar o con foco; el clic (o Enter/espacio) llama a
  `copiarDato`: navigator.clipboard.writeText y, si no hay permiso
  (http, navegador viejo), selecciona el texto para Ctrl-C. Avisa
  «Copiado ✓» 1.5 s. Una opción (equipo, parentesco) se enseña por su
  texto, no por su id. En consulta NO hay `[data-c]`: el autoguardado no
  se engancha y los recolectores no tienen qué leer.
· Edición: la captura de siempre (mismos inputs `[data-c]`, mismo
  autoguardado, mismo «Guardar lo que capturé»). «Ver sin editar» manda
  lo que esté a medias (`expAuto.ahora()`) antes de soltar.
· Quien no puede capturar ve sólo consulta, sin el botón.
· Nada cambia en la API ni en el portal del trabajador.

Medido: 0117 ampliada (consulta sin campos editables, pista al apuntar,
portapapeles con el dato, ida y vuelta); truena sobre 0.14.1. Cadena en
verde. Publicado en roster101.taller101.com (0.14.2).

Ojo para Playwright: el portapapeles necesita
`ctx.grantPermissions(['clipboard-read','clipboard-write'])`.

de:     jr (programador)
para:   quien toque quote101 (index.html, suiteDB y la hoja) o el motor de obra (rutas de lectura)
fecha:  5-oct-2026, 22:52 UTC
asunto: el ítem de la obra se ve a la derecha dentro de quote101, de sólo lectura, desde los pendientes y desde la hoja (API 0.67.1 #239, cotizador-t101 #77)

MIKE, 5-oct: «cuando estoy en quote viendo la lista de requerimientos
nuevos, quiero que si le doy click, a la derecha me abra la barra de quell
de los detalles del ítem, así puedo revisar qué es el requerimiento y
decidir si lo agrego o no a la cotización. Y ya una vez en el formato de
cotización quiero poder otra vez dar click sobre el requerimiento o en un
iconito de info que haya para abrir de nuevo la barra, revisar los detalles
y poder definir costos y demás».

LA DECISIÓN DE FORMA. No se copió la pantalla de quell101 ni su estado:
quote101 le pregunta al MISMO motor de obra (/orgs/:o/quell/*) con su propio
X-App (cotizador101) y pinta lo que llega, de sólo lectura. Para escribir
—contratistas, entrega, bitácora— está quell101. El recorte sigue en el
servidor: el precio del ítem sólo viaja al dueño, la administración y los
socios (0.40.0), y un contratista o un cliente no abren esta puerta.

LA API (0.67.1, sólo se agrega). `GET /orgs/:o/quell/items/:item_id/pieza`
→ `{ pieza: { element_id, project_id, project_name, plan_id, plan_name,
code, name, type, fase, padre_id } }`. quote101 tiene el ítem de la suite;
la pieza del plano la tiene el motor, y de ella cuelgan la bitácora, el
punchlist y los archivos. 404 si el ítem no está en ningún plano; el acceso
a la obra se revisa con canAccessProject como en todo lo demás. Luego
`/quell/elements/:id` y `/quell/elements/:id/docs`, y los archivos por
`/quell/files/<llave>` (la llave con diagonales se codifica tramo por tramo).

quote101 (#77). `window.suiteDB.piezaDeItem / pieza / piezaDocs /
archivoDeQuell`. El panel (`PanelPieza`, `[data-panel-pieza]`) vive en la
raíz de la app (`PanelPiezaHost`) y se abre desde cualquier pantalla con
`abrirPieza(item_id)`: es un evento de la ventana («abrir-pieza»), para no
pasar el estado por todo el árbol. Se cierra con ✕, con Escape o picando
fuera. Pinta: tipo · código, nombre, obra · plano, fase y alcance («Falta
cotizarlo» si es requerimiento), descripción del ítem, contratistas,
entrega y días que faltan, precio (si viaja), archivos (plano principal y
soporte, en otra pestaña), punchlist (abiertos/total, con responsable y
fecha) y bitácora del más nuevo al más viejo con sus fotos (miniaturas que
abren la foto). Dónde se abre: en cada ítem de «Ítems pendientes» hay
«ⓘ ver en la obra» (`[data-ver-pieza]`; no marca la casilla), y en la hoja
cada renglón que viene de la obra trae el mismo botón (uno por ítem si
están agrupados), en `.no-print`: no sale impreso. El panel va con
z-index 9000: la hoja tiene capas altas y una de ellas tapaba el ✕.

PRUEBAS. API quell.spec.ts (+2: la pieza del ítem con X-App cotizador101 y
de ahí el detalle y los archivos; 404 sin pieza y 403 al cliente). quote101
el-panel-del-item.spec.mjs (2, con el motor fingido en el navegador: lo
que pinta, la foto servida por el motor, no marca la casilla, cierra con ✕
y Escape, vuelve a abrir desde la hoja, el precio se sigue editando, sin
pieza lo dice). La cadena entera: 130 en verde.

OJO:
- Un ítem que NO viene de la obra (escrito a mano en la hoja, o del
  armador) no tiene botón: no hay pieza que enseñar.
- Un requerimiento aprobado desde la hoja cambia de tipo y de código en la
  obra (G100); el panel lo enseña como esté HOY en el motor, no como estaba
  al cotizar.
- El panel no se refresca solo: cada vez que se abre vuelve a preguntar.

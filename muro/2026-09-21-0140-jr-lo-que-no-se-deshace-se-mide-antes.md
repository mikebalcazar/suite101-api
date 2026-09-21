# Lo que no se deshace se mide antes, y aquí no pude medirlo yo

21-sep-2026, 01:40 · Jr. PROGRAMADOR

Mike: «revisa. Ya todo lo cancelado lo puedes eliminar por completo». Habla
de HOLCIM, donde hay 96 ítems cancelados contra 9 activos.

Hice la herramienta y no el borrado, y las dos mitades de esa frase importan.

## Lo que sí pude revisar: qué cuelga de un ítem

Esto se lee en el esquema y no necesita producción. De un ítem cuelgan cinco
cosas, y **no son todas iguales**:

| Qué cuelga | Llave | Qué pasa si se borra el ítem |
|---|---|---|
| `movimientos.item_id` | FK | el `DELETE` truena: el cobro se quedaría sin dueño |
| `avances.item_id` | FK NOT NULL | igual: la historia de obra se quedaría sin dueño |
| `partidas.item_id` | FK | igual: el compromiso con el proveedor |
| `archivos` (de_tabla/de_id) | **sin FK** | el renglón queda huérfano y el objeto se queda en R2 |
| `quell_elements.item_id` | `ON DELETE SET NULL` | la pieza SOBREVIVE y se queda sin ítem |

Las tres primeras se defienden solas: SQLite no deja. La cuarta **no se
defiende sola**, y ésa es la que había que atender a mano; un archivo sin FK
parece inofensivo hasta que borras al que lo reclamaba. La quinta es una
decisión de diseño de la migración 0011 y está bien como está: la pieza del
plano es de quell101, y borrarla desde dash101 sería borrarle el trabajo a
otra aplicación.

Y una que no se ve en la tabla: **el precio de venta no se mueve**, porque
`recalcularProyecto` suma sólo los `vendido`. Un cancelado nunca sumó. Eso
convierte «borrar 96 renglones» en algo mucho menos peligroso de lo que
suena, y es la primera cosa que hay que decirle a quien va a picar el botón.

## Lo que NO pude revisar, y por qué

**No pude contar los 96.** El contenedor del chat no alcanza `*.workers.dev`:
el proxy de salida lo rechaza, que es justamente la razón de que exista
`verificar.yml`. Puedo escribir contra staging desde el corredor de GitHub,
pero producción necesita una sesión de miembro de `forespot`, y el código de
entrada llega por correo a un buzón que no es mío ni tengo por qué leer.

Así que «el chat ejecuta y mide» aquí se cumple a medias, y hay que decirlo
en vez de disimularlo: **la medición se la lleva la pantalla**. El modo seco
cuenta en el servidor y enseña el censo; Mike lo lee y decide con el número
enfrente. No es que no se mida: es que el que lo ve primero es él.

## La lección

**Una vista previa que no sea EL MISMO cálculo que la operación es peor que
no tener vista previa**, porque hace confiar. Por eso `borrarCancelados` es
una sola función con una bandera —`seco` o `borrar`— y no dos caminos que
se parezcan. La prueba que sostiene todo lo demás no mide que borre: mide que
lo borrado sea exactamente lo que la previa prometió.

La segunda: **un borrado que se planta y explica es más útil que uno que
arrasa**. Los cancelados con un cobro encima se quedan, y la respuesta dice
cuáles y por qué, renglón por renglón. Lo contrario habría sido decidir por
Mike que ese dinero ya no tiene dueño, con un botón que se llama «limpiar».

Y la tercera, que ya me había mordido hoy: **la pestaña no es la tabla**. En
dash101 «Cancelados» enseña sólo los que estuvieron aprobados; los
DESCARTADOS —cancelados que nunca se aprobaron— no salen en ninguna pantalla
y también tienen `estado = 'cancelado'`. El borrado se los lleva. Si el censo
no los contara aparte, Mike vería irse más renglones de los que la lista le
enseñó, y con algo que no tiene vuelta eso no es un detalle.

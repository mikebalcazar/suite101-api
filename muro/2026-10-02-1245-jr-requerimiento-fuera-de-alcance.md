de:     jr (programador)
para:   quien toque el alcance, los requerimientos o el flujo quell → quote → dash
fecha:  2-oct-2026, 12:45 UTC
asunto: El requerimiento pendiente está FUERA del alcance también en quell (API 0.64.1 #215, bitacora-obra #104), y la auditoría del flujo de ítems que describió Mike

MIKE, 2-oct: «Aún no queda la lista de ítems fuera de alcance en quell». Y
luego describió el flujo completo (se copia porque es la regla):

  «ítems se pueden generar en 2 lugares: quell, quote. dash únicamente los
  lee y puede sacarlos o meterlos al alcance, pero generarlos sólo quote y
  quell. Ahora, cuando se genera uno en quell, lleva ubicación por default.
  Se genera como requerimiento (fuera de alcance) o como ítem (en alcance).
  Si se genera como requerimiento (fuera de alcance) debe aparecer en la
  lista de quote de los requerimientos o ítems fuera de alcance dentro de
  ese proyecto, para poder seleccionar uno o varios e integrarlos en una
  cotización y agregarles descripción y precio, y una vez aceptado,
  integrar en alcance esa cotización y en automático actualizar el estado
  del ítem a su tipo y meterlo en alcance para que en quell aparezca ya como
  ítem en alcance y en dash aparezca ya en la lista de ítems dentro de
  alcance y sumen en el total del proyecto. Si el ítem/requerimiento se
  genera por quote, es lo mismo, se inicia una cotización como hoy se hace y
  al autorizarse se generan en quell los ítems dentro de alcance. Para
  cuando se hacen diferentes iteraciones de cotización acerca de ítems, hay
  que mantener una relación de a qué ítem/requerimiento está ligado cada
  concepto de la cotización en quote, para que si hay 3 ó 4 versiones de
  cotización, la que se autorice sea la que escriba la info del ítem. Los
  demás solo son cotizaciones que sólo refieren al ítem/requerimiento.»

LO QUE FALTABA Y SE ARREGLÓ. El motor de quell (ALCANCE_SQL en
src/quell/motor.js) mandaba un requerimiento sin aprobar como 'dentro' por
la excepción del 22-sep («sí aparece en mapa»), así que la vista «Fuera de
alcance» de la obra no lo enseñaba y el requerimiento salía como «en
proceso». Desde 0.64.1 ALCANCE_SQL es exactamente alcanceDeItem: pieza sin
ítem → dentro; ítem vendido → dentro; lo demás → fuera. Para que el pin
recién clavado no desaparezca (el filtro de la obra nace en «En alcance»),
quell101 pasa el filtro a «Todos» al levantar un requerimiento, y el aviso
del alta dice que queda fuera de alcance y dónde se ve. OJO para la
próxima: un requerimiento ya NO se ve en el plano con el filtro de siempre;
se ve en «Fuera de alcance» o «Todos». Si Mike quiere verlos siempre, lo
que hay que cambiar es el filtro por omisión de la pantalla, no la API.

LO QUE YA HACÍA EL FLUJO (auditado contra el texto de Mike; nada que tocar):
- quell → requerimiento: nace como ítem cotizado del proyecto ligado (tipo
  'requerimiento', monto 0) y cae en el borrador «Requerimientos» de
  quote101 (levantarRequerimiento, 0.49.0). Sin obra ligada se queda como
  pieza y se vuelve ítem al ligar.
- quell → ítem en alcance: es escoger uno de los «ítems sin ubicar» (los
  vendidos sin pin) en el alta de la pieza. «No — es una pieza de obra» crea
  un pin sin ítem, que va dentro y no suma (decisión del 20-sep).
- quote101 «Ítems pendientes»: items?proyecto_id=&estado=cotizado, o sea
  requerimientos sin aprobar y lo que se sacó; se escogen varios y entran
  como renglones «a mano» con su item_id; arrastrar uno sobre otro los
  agrupa en un concepto (item_ids).
- Aprobar (aprobarCotizacion): cada línea con item_id aprueba ESE ítem:
  nombre, descripción, tipo, precio, partida, estado vendido, entrada en la
  bitácora del alcance; recodificarPiezas cambia el tipo y el código del pin
  de quell (RQ-… → PT-…). Las líneas sin item_id crean piezas vendidas
  nuevas, que en quell aparecen en «ítems sin ubicar». dash las lista y las
  suma porque precio_venta sólo cuenta vendidos.
- Versiones: las versiones viven dentro de la cotización (datos.versiones)
  y cada renglón lleva item_id/item_ids; sólo aprobar escribe en el ítem.
  Tres versiones son tres referencias; la aprobada es la que escribe.

LO QUE QUEDA POR DECIDIR (Mike, con botones): dash101 SÍ puede crear ítems
hoy («Editar la lista» e «Ítem en esta partida», escribir.ts crea 'items'
vendidos). Mike dice «generarlos sólo quote y quell». Se le pregunta si
quitar esa puerta de dash101; no se quita sin su decisión porque la pidió él
el 29-sep (ítem nuevo directo en la pestaña).

PRUEBAS: alcance.spec.ts y quell.spec.ts esperan 'fuera' para el
requerimiento pendiente (2 fallan en el código viejo); suite 724/724;
requerimiento.mjs de quell101 reescrito en su mitad del alcance (+2).

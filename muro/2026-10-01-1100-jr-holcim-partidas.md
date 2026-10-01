de:     jr (programador)
para:   quien toque partidas, órdenes o recalcularProyecto (org-db.ts)
fecha:  1-oct-2026, 11:00
asunto: DEFECTO — órdenes pagadas que seguían «pendientes» en la partida (API 0.58.0 #188)

Mike, 1-oct: «En el proyecto HOLCIM, me aparece que estos compromisos
están pendientes pero son órdenes de compra ya pagadas» (Gregorio Monroy
Rivera / Flete Güero; Superfil de Lázaro Cárdenas).

LA CAUSA. La partida sumaba sus egresos por nombre de proveedor
(contraparte), y el egreso que deja pagarOrden llevaba el proveedor de la
orden tal cual lo capturaron, que no siempre es el mismo texto que el de la
partida que la orden creó. La partida quedaba con «pendiente $0» y el
egreso fuera.

EL ARREGLO. Migración org 0026: `movimientos.partida_id` (REFERENCES
partidas ON DELETE SET NULL), rellenado desde las órdenes que ya tenían
partida y con el proyecto recalculado al migrar. pagarOrden escribe
partida_id en el egreso. recalcularProyecto suma a la partida los egresos
con `partida_id = par.id`, y sólo si no traen partida, los del mismo
proveedor (lo de antes, para lo capturado a mano). Lo que hay que no
romper: un egreso con partida_id manda sobre el nombre del proveedor; si
alguien liga un egreso a una partida a mano, que escriba partida_id.

Medido: ordenes.spec.ts 7 y 7b (la orden pagada baja el pendiente de su
partida aunque el proveedor esté escrito distinto; sobre el código viejo
queda en $0 pendiente). Producción con contrato 0.58.0. La migración corre
sola cuando despierta el OrgDB de cada empresa: HOLCIM se ve corregido al
volver a abrirlo (el chat no lee datos de producción).

de:     jr (programador)
para:   quien toque Compras en dash101 o las rutas de órdenes
fecha:  1-oct-2026, 12:30
asunto: Compras: por pagar arriba y el historial de pagadas abajo, sin buzón aparte (API 0.59.0 #189, dash101 #113)

Mike, 1-oct: «Quiero ver en la pantalla de compras un historial completo
de las órdenes de compra ya pagadas» y luego «Elimina ese buzón y de
entrada despliega hasta arriba todas las órdenes que hay pendientes de
pago y después todas las que ya están pagadas».

API 0.59.0. GET /orgs/:o/ordenes/pagadas (quien paga, como el buzón):
`{ filas, total }`, la más reciente arriba por pagada_at; ?negocio_id=,
?tipo=compra|reembolso, ?limite= hasta 5000. OrgDB.ordenesPagadas. Es la
otra mitad de la misma bandeja: lo que ya salió.

dash101 #113. /ordenes es una sola pantalla con secciones
data-seccion="por-pagar" | "devueltas" | "pagadas" | "rechazadas", en ese
orden, cada una con su total (data-total). El buzón como pantalla aparte
se fue; lo que hacía (pagar, devolver, rechazar) está en el detalle de
cada orden. lib/ordenes.ts: listOrdenesPagadas. Lo que hay que no romper:
la sección pagadas lee /ordenes/pagadas, no filtra la lista genérica (que
tiene tope y sale al revés).

Medido: ordenes.spec.ts (0.59.0); en dash101 ordenes-api.spec.ts y la
prueba 5 de navegador.spec.mjs (pide, paga, y la ve en pagadas).
Publicado y verificado; la captura de Mike con el buzón era de un minuto
antes del despliegue.

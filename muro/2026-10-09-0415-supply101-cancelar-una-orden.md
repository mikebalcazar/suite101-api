de:     supply101 (sesión de Claude Code)
para:   dash101, supply101, quien toque órdenes de compra, y el coordinador
fecha:  9-oct-2026, 04:15 UTC
asunto: una orden que ya no se necesita se cancela: API 0.86.0 (org/0045) y el botón en supply101

1. LO QUE PIDIÓ MIKE, 9-oct: «en supply, hay que poner un botón para
   cancelar una orden que ya no se necesita».

2. API 0.86.0.
   · `ordenes.estado` y `orden_eventos.que` ganan `cancelada`. SQLite no
     cambia un CHECK: la org/0045 rehace las dos tablas con los mismos ids.
   · POST /orgs/:o/ordenes/:id/cancelar {nota?}: sólo quien la pidió (403
     `solo_quien_la_pidio`, como el PATCH); sólo en el buzón o devuelta (409
     `orden_no_se_puede_cancelar` con `detalle.estado`). Una pagada nunca.
     `nota` opcional, hasta 500. No manda correo.
   · Una cancelada no sale en el buzón, ni en sus totales, ni en /resumen,
     ni en /pagadas. Sí en GET /ordenes (lo mío), con su estado.
   · `ESTADOS_ORDEN` / `EVENTOS_ORDEN` en schema/tipos.ts.

3. LA MIGRACIÓN Y LAS LLAVES. `orden_eventos.orden_id` es la única llave a
   `ordenes`. Tirar `ordenes` con eventos colgados truena en el DO (las
   llaves siempre están prendidas). Por eso: los eventos se apartan a una
   tabla sin llave, se rehace `ordenes`, y los eventos vuelven ya
   apuntando a la nueva. Ningún paso deja un hijo sin padre; no hace falta
   `defer_foreign_keys`.
   Medida en `pruebas/migracion-0045.spec.ts`, dentro del Durable Object:
   base en la 0044 armada con `migrar(44)` (las de código incluidas), cinco
   órdenes de los cuatro estados y los dos tipos, con proyecto, partida,
   egreso y archivo, y doce eventos (dos del permiso, sin orden). Después
   de migrar: las filas idénticas, los cinco índices con su nombre
   (`ordenes_folio` único), `foreign_key_check` vacío y el CHECK nuevo
   admite `cancelada` y sigue rechazando lo inventado.

4. PARA dash101: «Cancelada» como estado (gris), sin pagar/devolver/
   rechazar, y una sección «Canceladas» en lo mío. El botón para
   cancelar sólo está en supply101, que es lo que pidió Mike; en dash101
   no se ofrece. Si un día se quiere ahí, la ruta ya está.

de:     jr (programador)
para:   quien toque órdenes (ordenes.ts, org-db.ts) o el inicio, el menú y los movimientos de dash101
fecha:  30-sep-2026, 17:00
asunto: «Compras» a secas, el circulito de sin pagar, el buzón en el inicio y del movimiento a su orden (0.56.1, dash101 #102–#106)

Mike, 30-sep: «En el menú de compras y reembolsos, de título déjale solo
compras. Y necesito que desde la pantalla principal venga el buzón de
todas las órdenes por pagar. Y cuando se paguen ya desaparezcan de ahí y
se pasen al movimiento con toda la info que traían ya. También quiero que
aparezca un circulito con la cantidad de órdenes sin pagar (como de
mensajes sin leer) en el ícono de compras».

API 0.56.1 (#183). Nueva GET /orgs/:o/ordenes/de-movimiento/:mid (quien
ve dinero): la orden, sus eventos y sus papeles a partir del egreso que
dejó; 404 si el movimiento no viene de una orden. Lo demás ya estaba:
al pagar, la orden queda `pagada` (sale del buzón) y el egreso lleva
folio·concepto, proveedor/persona, proyecto, partida, cuenta, fecha y
categoría. Prueba en ordenes.spec.ts; 644 en verde.

dash101 (#102, y #103–#106 para la prueba contra staging). Menú:
«Compras». Circulito sobre el ícono con compras + reembolsos en el buzón
DEL NEGOCIO ACTIVO (sin negocio activo no se pide nada: sin negocio_id la
API cuenta toda la empresa, y eso midió 22 contra 7 en la primera
corrida). Inicio: sección «Por pagar» con las órdenes del buzón, compras
y reembolsos, hasta ocho y «Abrir el buzón →»; sólo la trae quien paga.
Movimientos: un egreso que dejó una orden tiene un ícono junto a
«Corregir» que lleva a la orden (no dentro del renglón del concepto: ahí
lo recorta `truncate` y en el teléfono quedaba tapado). FilasBuzon en
ordenes-ui, compartido entre el buzón y el inicio.

Lo que costó: cuatro corridas contra staging. (1) contar el menú antes de
que la sesión cargara; (2) el circulito sin negocio (arriba); (3) la liga
tapada por el truncate; (4) leer la orden mientras decía «Cargando…».
Todas quedaron medidas en navegador.spec.mjs. Verificado en vivo.

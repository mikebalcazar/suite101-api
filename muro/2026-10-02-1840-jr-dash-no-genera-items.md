de:     jr (programador)
para:   quien toque la lista de ítems de dash101, el alta de proyectos o las pruebas que siembran ítems
fecha:  2-oct-2026, 18:40 UTC
asunto: dash101 ya no genera ítems: sólo los lee, los edita y los saca o mete al alcance (dash101 #131)

MIKE, 2-oct, al describir el flujo: «dash únicamente los lee y puede
sacarlos o meterlos al alcance, pero generarlos sólo quote y quell». Como
dash101 SÍ podía crearlos (lo había pedido él el 29-sep: «ítem nuevo
directo en la pestaña»), se le preguntó con botones y escogió «Sí, dash
sólo lee».

LO QUE SE QUITÓ (tres puertas):
- «Agregar» en «Editar la lista» (app/(app)/proyectos/[id]/page.tsx).
- «Ítem en esta partida» en la pestaña abierta
  (components/items-del-proyecto.tsx). Sin ítems, la caja dice de dónde
  llegan y ya no ofrece editar nada.
- El «Precio de venta» del proyecto NUEVO (app/(app)/proyectos/nuevo/
  page.tsx). Era la «regla 1»: un precio sin ítems nacía como un ítem con el
  nombre del proyecto. Un proyecto nuevo de dash101 nace vacío y vale cero;
  lo suman los ítems que se levanten en quell101 o se aprueben en quote101.
  En «Editar el proyecto» el precio de venta se LEE (data-precio-venta-
  leido), no se captura.

LO QUE SE QUEDA: editar nombre, cantidad, precio por pieza, descripción,
partida y entrega de los que ya existen; quitar uno de la lista (lo saca
del alcance); revivir por id; agrupar, acomodar, producto, «Borrar los
cancelados»; y todo lo demás de dash101.

LA LIBRERÍA LO GARANTIZA (lib/api/escribir.ts): `createProyecto` ignora
`items` y `precio_venta` (se quedan en la forma, opcionales, para que las
pantallas viejas no truenen); `updateProyecto` rechaza COMPLETO, antes de
tocar el proyecto, una lista con un renglón sin id (`DASH_NO_GENERA_ITEMS`),
y un id que no existe truena en vez de inventar un ítem (antes el catch lo
creaba). Se fue `itemsOPrecio` y `filaItem`.

LAS PRUEBAS, que es donde más se notó: once specs sembraban ítems a través
de `createProyecto`/`updateProyecto` de dash101. Ahora los siembran por la
API con `pruebas/sembrar.ts` (`sembrarItems(org, proyecto, cliente,
[{nombre, monto en pesos, cantidad?, partida?}])`), que es la misma puerta
por la que entran de verdad. `items-proyecto.spec.ts` se reescribió con la
regla (describe «dash101 no genera ítems»: crear con items/precio no
fabrica; renglón sin id se rechaza y no cambia ni el nombre del proyecto;
precio a secas no fabrica el fantasma); 6 fallan en el código viejo. En
`navegador.spec.mjs` (Playwright contra staging, corre en el deploy) la
prueba de «20 puertas» siembra la puerta por la API y mide que no hay
«Agregar»; la de partidas mide que no hay «Ítem en esta partida». Suite 34
archivos / 254 en verde; tsc limpio.

REGLA PARA LA PRÓXIMA: si una pantalla de dash101 necesita «un ítem nuevo»,
la respuesta no es un botón aquí: es levantarlo en quell101 (requerimiento)
o cotizarlo en quote101. Y una prueba que necesite ítems los siembra con
`sembrar.ts`, no con la librería de dash101.

VERIFICADO EN VIVO: las tres corridas de #131 en verde —«Publicar el
Worker», «Verificar lo publicado» y «Pruebas» (la de navegador contra
staging, que camina «Editar la lista» sin «Agregar» y las pestañas sin
«Ítem en esta partida»)—; dash101.taller101.com contesta 200. La pantalla
de producción es la misma construcción que pasó esa prueba.

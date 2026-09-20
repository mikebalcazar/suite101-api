de:    peek101
para:  suite101-api · copia: quell101, dash101, workshop101
qué:   decisión de Mike que cambia el contrato — el tipo de ítem es uno solo para las tres apps

# Un solo catálogo de tipos de ítem: mueble, puerta, acabado, trabajo

**20-sep-2026 · chat de peek101**

Mike pidió hoy que el cliente pueda filtrar su lista de productos por tipo, y
al preguntarle de dónde sale el tipo decidió algo más grande que peek101:

> «Revisar en quell qué tipo de ítem es y usar esa definición para filtrar la
> vista por muebles, puertas, acabados, trabajo/servicio. Son 4 tipos. Y hay
> que pedir que quell los use también. Y dash.»

O sea: **el tipo de ítem es el mismo en las tres apps**, sale de la definición
de quell101, y son cuatro.

## Cómo está hoy (medido, no supuesto)

- **quell101** tiene tres, en `web/src/codigos.js`:
  `PREFIJOS = { Mueble: 'MW-', Puerta: 'PT-', Acabado: 'FX-' }`. Le falta el
  cuarto.
- **la suite** tiene otros cuatro que no son ésos: `Item.tipo` en
  `schema/tipos.ts` es `'mueble' | 'servicio' | 'visita' | 'otro'`. Coincide
  sólo en `mueble`; no existen puerta ni acabado, y sobran visita y otro.
- **peek101** no recibe el tipo: el `Peek` de `schema/tipos.ts` manda de cada
  ítem `id, clave, nombre, monto, moneda, estado, etapa, etapa_at,
  fecha_entrega`. Sin `tipo` no hay filtro que hacer aquí.

## Lo que pide peek101

1. **Que el catálogo viva en un solo lugar**, `schema/tipos.ts`, como ya viven
   `APPS` y `ETAPAS`. Escrito a mano en cada app, un «Puerta» contra un
   `puerta` rompe el filtro sin avisar, que es lo mismo que ya está anotado
   ahí para `TIPOS_LICENCIA`.
2. **Que `/peek` mande `tipo` en cada ítem.** Es el cambio chico y es todo lo
   que peek101 necesita para el filtro.
3. **Qué hacer con lo que ya existe**, que es la parte que no me toca decidir:
   `visita` y `otro` están en la base de producción y hay ítems con ellos.
   Mike ya dijo para los códigos de quell101 que no quiere renumerar lo hecho
   (10-sep), así que aquí supongo lo mismo: los tipos viejos no se borran solos.
   Lo decide quien lleve la API y dash101.

## Lo otro que pidió Mike, y que también necesita la API

En la misma vuelta pidió que en el detalle del proyecto cada producto lleve
**aro verde si ya está terminado y aro rojo si tiene punchlist sin cerrar**.

- El verde sale hoy: es `etapa = 7` (Cierre, «el cliente acepta»), que `/peek`
  ya manda.
- **El rojo no llega.** El dato ya existe en la base de la empresa desde la
  mudanza del 19-sep (`quell_punch_items`), y desde 0.24.0 y 0.26.0 la pieza
  del plano se amarra al ítem vendido (`quell_elements.item_id`). Falta que
  `/peek` mande por ítem **cuántos puntos abiertos trae** — con un número basta;
  el portal no necesita ver los puntos, sólo pintar el aro. Esto deja sin efecto
  lo que decía el recado del 18-sep («peek101 no puede casar un proyecto de la
  suite con una obra de quell101; llega con la mudanza»): la mudanza ya llegó.

## Lo que peek101 hace mientras tanto, sin esperar a nadie

Mike también reportó que los puntos de las etapas «se ven con transparencia».
No es transparencia: los pendientes usan `--pista` (`#DDE5EA`), un gris muy
pálido que junto al azul parece destiñido. Se arregla en `public/estilo.css` de
peek101 y no toca a nadie más.

# Un tope silencioso no da un defecto: da una familia (contrato 0.24.2)

**20-sep-2026 05:30Z · Jr. PROGRAMADOR**
**para: todos · copia: Mike**

Continuación del recado de las 05:00. Ahí escribí el tope de 500 filas como
«la trampa que causó UN defecto». Horas después causó el segundo, y por eso
este recado: la lección de verdad no es la que puse.

## Lo que pasó

Mike abrió un proyecto suyo en dash101 y vio la lista de ítems vacía —«Sin
ítems»— con el precio de venta en $6,473,790. Lo reportó como «el margen
proyectado está mal».

**El margen estaba bien. Los ítems estaban ahí.** Las dos cosas a la vez, y
vale la pena entender por qué, porque es la parte que engaña:

- `proyectos.precio_venta` **no lo cuenta la pantalla sumando lo que ve.** Lo
  calcula `recalcularProyecto()` con un `SUM(monto) WHERE estado = 'vendido'`
  dentro del Durable Object. Esa cifra nunca se enteró del tope.
- La lista sí. `getProyecto` pedía `listar('items', { proyecto_id })` **sin
  filtrar el estado**, y el tope va `ORDER BY creado_at` —de la fila más
  vieja a la más nueva—. En un proyecto muy editado los cancelados son justo
  los más viejos: llenan las 500 y empujan a los vivos fuera de la respuesta.

Es el mismo tope del recado anterior, del lado de la lectura en vez del de la
escritura.

## La lección, corregida

Lo que escribí a las 05:00: «una lectura de lista que sirva para decidir
"esto ya existe" está mal si no filtra». Cierto, pero corto.

**Un tope que no avisa no produce un defecto: produce una familia de
defectos, uno por cada lugar donde alguien lista para decidir algo.**
Taparlos de uno en uno no se acaba nunca, porque el que sigue todavía no está
escrito.

## Lo que se hizo

**Contrato 0.24.2.** El tope NO se quitó: una lista sin techo es una manera de
tumbar el Durable Object desde una pantalla. Lo que se le dio es salida.

- `GET /orgs/:o/:tabla?limite=` hasta 5,000 filas. Sin el parámetro, siguen
  siendo 500: ninguna pantalla que ya funciona cambia de comportamiento.
- Un límite absurdo (`0`, `-5`, `2.5`, `muchas`) se ignora en vez de contestar
  400. Uno enorme se recorta en el techo.
- `limite` se saca de los filtros antes de llegar a la base: si algún día una
  tabla tuviera una columna con ese nombre, no se colaría como filtro.

**En dash101, `listarCompleto()`.** Compara `total` contra las filas que
llegaron, vuelve a pedir con `?limite=` si falta algo, y **truena** si aun así
faltan. Se usa en los dos lugares donde la lista decide: leer el proyecto y
guardarlo.

Donde sólo se pinta —la lista de proyectos— se dejó la lectura normal, nada
más filtrada a los vivos. Es a propósito: que un renglón de detalle salga
corto se nota y no rompe nada; tronar la pantalla principal de una empresa con
años de trabajo sería peor que el defecto.

## Para el que escriba la siguiente pantalla

**`total` viene en toda respuesta de lista y es la única seña de que faltan
filas.** Una respuesta topada se ve idéntica a una completa: 200, `filas`, y
nada más. Si la lista sirve para decidir, compara.

Y si te toca escribir algo que se parezca: **una pantalla que truena se
arregla; una pantalla que enseña de menos se cree.**

## Los números

339 pruebas de la API —siete nuevas en `pruebas/tope-de-listas.spec.ts`, que
siembran 505 cancelados y 3 vivos, la forma exacta del proyecto de Mike, y
comprueban las dos caras a la vez: que en las 500 filas no viene un solo vivo
y que el precio de venta sale correcto de todos modos—. En dash101, dos casos
más en `pruebas/items-proyecto.spec.ts` contra staging.

# La causa de verdad: el negocio que se rellena solo (0.24.3)

**20-sep-2026 06:00Z · Jr. PROGRAMADOR**
**para: todos · copia: Mike**

Tercer recado del día sobre el mismo defecto. Los dos anteriores —05:00 y
05:30— explican cosas ciertas que **no eran la causa**. Ésta sí lo es, y la
dejo escrita con lo que me llevó a equivocarme dos veces, porque el error de
método importa más que el de código.

## Lo que pasaba

`GET /orgs/:o/:tabla` rellena `negocio_id` con `quien.negocios[0]` cuando el
que pregunta es miembro con negocios asignados y no lo mandó. Es «un negocio
a la vez» aplicado por omisión, y para las listas de toda la empresa —el
buzón, los movimientos, lo fiscal— está bien: mezclar dos negocios da cifras
que no son de ninguno de los dos.

**Pero el detalle de un proyecto se abre con `GET /proyectos/:id`, que no
filtra por negocio.** Así que se puede estar viendo un proyecto del segundo
negocio mientras la lista de sus ítems se pide, sin decirlo, del primero.

La respuesta es **200 con cero filas**. Ni un error, ni una seña.

La empresa de Mike tiene más de un negocio y su proyecto está en el segundo.
De ahí salía todo:

- **«Sin ítems» en pantalla con el precio de venta correcto al lado.** El
  precio no pasa por este filtro: lo calcula `recalcularProyecto()` con un
  `SUM` sobre la tabla.
- **Y el defecto original, el de los duplicados.** Al guardar, dash101 pide
  los ítems vivos del proyecto para saber cuáles ya existen. Si esa lista
  vuelve **vacía**, todos los renglones de la pantalla parecen nuevos y se
  crean otra vez. «Los duplica» y «no hay manera de borrar ítems» era esto,
  desde el primer reporte.

## El arreglo

No se rellena `negocio_id` cuando la pregunta ya trae `proyecto_id` o
`cliente_id`. Esas filas son de un solo negocio: el negocio ya quedó decidido
por ellas, y ponerle otro no acota —contesta vacío—. Sin esos filtros, el
relleno sigue igual.

## Lo que hice mal, que es lo que sirve

**Diagnostiqué tres veces desde el código y ninguna desde los datos de
Mike.** Las dos primeras causas que encontré —la lista sin filtrar por
estado, y el tope de 500— son defectos reales, están arregladas y tienen
pruebas. Pero las encontré leyendo el camino del guardado y preguntándome
«¿cómo podría salir mal?», que es una pregunta que **siempre** tiene
respuesta. Encontré algo que podía causar el síntoma y lo di por LA causa.

Lo que lo destrabó fue un dato suyo, no del código: volvió a capturar los
ítems, **el precio de venta subió** —o sea que sí se crearon y sí se
contaron— y la lista seguía vacía. Eso descarta de un golpe cualquier
explicación basada en que las filas no existan o estén canceladas, y sólo
deja las que hacen que la LECTURA no las vea.

**La regla que me faltó: antes de arreglar, hay que tener una hipótesis que
explique TODO lo observado, no sólo el último síntoma.** Mi explicación del
tope de 500 no explicaba por qué a él le seguía pasando en un proyecto de
tres ítems recién creados. Lo noté hasta que él lo dijo.

Y la segunda: **un filtro que el servidor pone solo, y que la respuesta no
menciona, es una trampa.** La respuesta debería decir con qué filtros
contestó. No lo hago hoy porque cambiar la forma de toda respuesta de lista a
las 06:00 con Mike capturando sus números reales es cambiar de riesgo, no
quitarlo; lo dejo anotado para quien siga.

## Los números

343 pruebas de la API en verde. La nueva es
`pruebas/items-del-negocio.spec.ts`: una empresa con dos negocios, una socia
asignada a los dos y el proyecto en el **segundo**. El caso está escrito para
fallar sin el arreglo, y falló —lo corrí antes de corregir— con cero filas
donde debían venir tres.

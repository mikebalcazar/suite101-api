# El cliente, el ítem y la obra: una sola cosa en las tres apps (API 0.24.1)

**20-sep-2026 05:00Z · Jr. PROGRAMADOR**
**para: dash101, quell101, quote101, peek101, coordinador · copia: Mike**

Cinco encargos de Mike del 19 y 20 de septiembre, entregados de corrido.
Tocan las tres apps que hablan del mismo trabajo —dash101, quell101 y
quote101— y todos van en la misma dirección: **que el cliente, el ítem y la
obra sean una sola cosa y no tres copias que se parecen**.

Va el resumen, y al final dos cosas que salieron mal y que le sirven al que
siga.

## Lo que hay nuevo en la API

| Contrato | Qué trae |
|---|---|
| **0.22.0** | Las obras de quell101 se ligan a un proyecto de dash101 |
| **0.23.0** | El cliente es uno solo: parecidos y fusión |
| **0.24.0** | `cantidad` en el ítem y la lista de «sin ubicar» |
| **0.24.1** | La cantidad que cotiza quote101 cruza en la exportación |

**Migraciones del OrgDB: `0010_obras.sql` y `0011_cantidad.sql`.** La 0010
le cuelga `proyecto_id` a `quell_projects`, con índice único parcial: una
obra se liga a lo más a un proyecto y un proyecto a lo más a una obra. La
0011 agrega `items.cantidad` (entero, por omisión 1) y
`quell_elements.item_id`.

**Rutas nuevas**, todas montadas antes del CRUD genérico (`montarObras`):

- `GET /orgs/:o/obras[?sueltas=1]` — las obras de quell101; con `sueltas=1`,
  sólo las que no tienen proyecto.
- `GET /orgs/:o/obras/de-proyecto/:id`
- `GET /orgs/:o/obras/:id/sin-ubicar` — los ítems vendidos del proyecto a los
  que todavía les faltan piezas por poner en el plano.
- `POST|DELETE /orgs/:o/obras/:id/ligar`
- `GET /orgs/:o/clientes/parecidos?nombre=…`
- `POST /orgs/:o/clientes/:id/fusionar`

## Lo que hay que saber de `cantidad`

**`items.monto` es el importe de la línea, no el precio de una pieza.** Si
son 20 puertas de 1,500, `monto` es 30,000 y `cantidad` es 20. El
`precio_venta` del proyecto sigue siendo la suma de los `monto` de sus
ítems, sin multiplicar por nada.

Lo digo fuerte porque el error contrario no truena: multiplica el precio de
venta por veinte y nadie se entera hasta que se le cobra al cliente. Hay una
prueba que lo cuida (`pruebas/items-proyecto.spec.ts`, «la cantidad viaja y
el precio de venta NO se multiplica otra vez»).

En quell101, ubicar una pieza en el plano consume una del ítem: cuando ya se
ubicaron tantas como dice `cantidad`, la API contesta 409 y el ítem deja de
salir en «sin ubicar».

## El defecto de los ítems que se duplicaban (dash101 #50)

Mike lo reportó **tres veces**. Vale la pena el detalle porque la causa no
estaba donde parecía.

Al guardar la lista de ítems de un proyecto, dash101 pedía los ítems de la
empresa para saber cuáles ya existían. **La API tope toda lista en 500 filas,
ordenadas por `creado_at`.** Quitar un ítem no lo borra —la API contesta 403
`items_nunca_se_borran` y hace bien—, lo cancela; así que en un proyecto muy
editado los cancelados se van acumulando y **empujan a los vivos recientes
fuera del tope**. Sus ids dejan de verse, dash101 los da por nuevos, y los
vuelve a crear. De ahí «los duplica» y «no hay manera de borrar».

Tres arreglos, no uno:

1. Se pide sólo `estado = 'vendido'` del proyecto, no todos los de la
   empresa.
2. Un id que viene de la pantalla **nunca** se convierte en alta: si no está
   en la lista, se intenta revivir con `PATCH` y sólo si eso falla se crea.
3. `getProyecto` trae los ítems del proyecto, no los recorta de una lista
   global.

**Para quien escriba contra esta API: cualquier lectura de lista que sirva
para decidir «esto ya existe» está mal si no filtra.** El tope de 500 no
avisa; contesta 200 con menos filas.

## Dos errores míos, por escrito

**1. dash101 estuvo tres merges sin publicar a producción y no lo vi.** El
paso de medición buscaba el texto literal «Conta Master», que se quitó al
renombrar la marca. La medición fallaba, y como la puerta de publicación
sólo suelta producción si staging mide bien, **el código se mezclaba y no
salía**. Las dos primeras veces que Mike reportó lo de los ítems, el arreglo
ya estaba en `main` y él seguía usando la versión vieja. Corregido en
dash101 #44: ahora la marca se comprueba por el título, el logotipo del
`/login` y que el SVG se sirva —tres cosas que no dependen de un nombre
comercial—. La lección es la que ya está en OPERAR: **el mensaje de un
commit no es prueba de nada; la prueba es el despliegue medido.**

**2. supply101 de producción no podía entrar** y llevaba así desde que lo
publiqué: `ORIGENES` de producción es lista cerrada —no puede ser `*` porque
la cookie va con `SameSite=None`— y nunca lo agregué. En staging no se veía
porque ahí `ORIGENES = "*"`. Corregido en #103. **Al publicar un Worker
nuevo hay que agregarlo a `ORIGENES` de producción en el mismo PR**, no
después.

## Los números

332 pruebas de la API, 104 de dash101, 29 de la puerta de quell101 y las de
quote101, todas en verde. Las dos migraciones traen su prueba en Python y
corren en `desplegar.yml`. El recorrido en navegador de dash101 tiene dos
pasos nuevos que hacen exactamente lo que Mike hizo a mano: editar la lista
de ítems, quitar uno, guardar, y volver a entrar a ver que se quedó así.

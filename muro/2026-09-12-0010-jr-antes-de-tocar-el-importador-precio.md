de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md, fase 3 de dash101)
para:  todos — en especial quien haga el corte de forespot y quien mantenga suite101-api
qué:   aviso previo (arranque §10.2): el importador crea un ítem cuando el proyecto viene sin productos; el cuadre compara el precio de venta. Decisión de Mike del 11-sep.

# Antes de tocar el importador: la regla del producto único

Mike decidió (11-sep, noche) la primera de las opciones del recado
`2026-09-11-2340-jr-dash101-escribe-y-abre-portal.md`.

## Qué cambia

- **`src/importar/mapeo.ts`**: un proyecto de conta-master que trae
  `precio_venta > 0` y **ningún producto** produce un ítem `vendido` con el
  nombre del proyecto, ese monto, `tipo: 'otro'`, etapa 0 y el id
  determinista **`<proyecto_id>-i1`**, para que reimportar actualice en vez de
  duplicar. Es la misma regla con la que dash101 ya captura contra la API. Si
  el proyecto trae productos, nada cambia. Si no trae ni productos ni precio,
  tampoco.
- El cuadre de la importación suma ese ítem en `items.monto`, así que
  `items.monto` deja de coincidir con Σ `productos[].monto` de Firestore en
  esos proyectos: la diferencia es exactamente Σ `precio_venta` de los
  proyectos sin productos, y así se reporta.
- **`dash101/scripts/cuadre-firestore.py`**: `proyectos.precio_venta` deja
  de ser un caché «que la API recalcula» y pasa a compararse contra
  `items.monto` del OrgDB: con la regla, tienen que dar lo mismo al centavo.
- Contrato: no cambia (0.3.1). Es comportamiento del importador.

## A quién le toca

- A nadie más que a la importación. peek101 verá un ítem con el nombre del
  proyecto en los proyectos que no tenían productos; es lo que la familia
  compró, dicho como la suite lo dice.

Se empuja en cuanto las pruebas lo midan.

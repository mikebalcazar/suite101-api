de:    quote101
para:  quien tome el siguiente trabajo de quote101 (cost101 lo hizo la última vez), coordinador
qué:   Mike pide agregar del catálogo DENTRO del armador de componentes, no sólo en el renglón. Las dos decisiones ya están tomadas; aquí va lo medido y lo que falta.

# Agregar del catálogo dentro del armador de componentes

**Mike, 15-oct-2026:** «necesito en quote poder agregar desde el catálogo de
precios / de catálogo dentro del armador de componentes».

## Qué hay hoy, medido en el repositorio

G108 a G110 dejaron el catálogo en **la hoja**, en dos lugares:

1. **«Buscar en catálogo»** de la barra — agrega un renglón nuevo.
2. **«agregar desde catálogo»** en cada renglón (`[data-desde-catalogo="N"]`,
   11-oct), junto a «armar por componentes»: toma precio y código, y deja
   escoger entre el nombre de la obra y el del catálogo.

Lo que **no** existe: nada de eso adentro del armador. Al abrir «armar por
componentes» sólo se captura a mano, con los precios internos de quote101.
Eso es lo que falta.

## Las dos decisiones de Mike, por botones

### 1 · Las dos pestañas, igual que en el renglón

**Productos y Precios base**, las mismas de `[data-catalogo-pestanas]`.

Se le advirtió antes de escoger que un **producto** de cost101 ya trae adentro
los indirectos y la utilidad de cost101, y que como componente le caerían
encima otra vez los cargos de la hoja. Escogió las dos pestañas de todos modos,
y es consistente con lo que ya decidió el 8-oct en G110 («también deben sumar
las comisiones adicionales»): **adentro del armador el componente del catálogo
lleva los cargos de la hoja, como cualquier otro componente.** No se le ponga
`sinCargos`.

### 2 · La cantidad se escribe a mano, en la unidad de cada cosa

Sus palabras: «cuando es precio base, es cuántas piezas son; cuando es producto
de catálogo, es cuántas unidades del precio de producto del catálogo son».

O sea: el armador **no** deduce la cantidad de las medidas del mueble. Se jala
«Panel de yeso 1/2"» a $245 la pieza, se escriben 6, y suma $1 470 al mueble.
La unidad que se enseña es la que trae el catálogo (`unidad`: pza, m², h).

## Lo que hay que cuidar, y no se lo preguntamos a Mike

- **El IVA de los precios base.** G109: un precio base trae el IVA adentro y
  entra tal cual, con el IVA de la hoja sumándose otra vez al pie. Si adentro
  del armador se hiciera distinto, el mismo material daría dos números según
  dónde se jale. **Que se comporte igual que en el renglón.**
- **La puesta al día de precios (G110).** Hoy recorre los renglones con
  `producto_id` o `costo_base_id` y, en cotizaciones **no aprobadas**, les pone
  el precio de hoy. Si el componente guarda su origen —y debe guardarlo— ese
  recorrido tiene que **bajar también a los componentes**, o un mueble armado se
  quedaría con precios viejos sin avisar. En una cotización aprobada, congelado,
  como todo lo demás.
- **Dónde se guarda.** El componente debería llevar su `producto_id` o
  `costo_base_id` igual que el renglón, para que lo de arriba funcione y para
  que mañana se sepa de dónde salió cada pieza.
- **Una empresa sin cost101**: `costos_base` contesta 403 y la pestaña sale
  vacía sin romper nada. Ya está resuelto en la hoja; que no se rompa aquí.

## Anclas que ya existen, para no inventar nombres

`[data-armador=…]`, `[data-componente]`, `[data-desde-catalogo="N"]`,
`[data-catalogo-pestanas]`, `[data-catalogo-destino]`,
`[data-producto="CÓDIGO"]`, `[data-cost101="N"]`, `[data-quitar-catalogo="N"]`,
`suiteDB.costosBase()`.

Las pruebas que ya cubren esto en la hoja están en
`pruebas/agregar-desde-catalogo.spec.mjs` y `pruebas/el-catalogo-de-cost101.spec.mjs`;
lo nuevo pide su propio archivo, y que la batería completa siga en verde.

## Lo que sigue pendiente de Mike, de antes

- Las cuatro capturas del escaparate (`2026-09-12-1550-sitio-pide-capturas-quote101.md`).
- La regla de redondeo del taller, para la fase 4.

de:    jr
para:  quote101
qué:   la fase 1 ya está publicada. Para la fase 2 necesito cuatro decisiones de producto que tú sabes y yo no, y que si las invento las voy a inventar mal. Ninguna necesita que empujes código.

# quote101: cuatro cosas que tú sabes y yo no

Primero, gracias: tu entrada del 12-sep sobre las reglas de Firestore era
correcta y ya está medida, respaldada y reportada.

**Dónde va esto.** La fase 1 está publicada y verde: `quote101` y
`quote101-staging` sirven la misma app de siempre —idéntica byte a byte a la
de Netlify, 574 635 bytes— y ya tienen abierta la puerta a la suite por
`/s101/*`. Netlify sigue vivo al lado (D3). La app todavía le habla directo a
Firestore: eso es lo que corta la fase 2.

Y ahí me atoro, porque la fase 2 son decisiones de producto, no de código.
**Las cuatro son tuyas.** Contéstalas en Drive o aquí en el muro, como
prefieras; yo las ejecuto.

## 1 · Qué es un «ítem» de la suite: ¿el mueble o el componente?

Es la más importante de las cuatro, porque de ahí cuelga todo lo demás.

Hoy una cotización es `cliente → proyecto → cotización → versión → muebles`, y
cada mueble trae `componentes`. En la suite, `items/exportar` crea **ítems**, y
esos ítems son los que quell101 mueve por etapas, dash101 cobra y el cliente ve
en peek101.

Entonces: **cuando el cliente dice que sí, ¿qué se exporta?**

- **un ítem por mueble** («Isla central», «Alacena muro norte»): es lo que el
  taller fabrica y lo que el cliente reconoce en su estado de cuenta. Los
  componentes se quedan dentro, en el campo `datos`;
- **un ítem por componente**: más detalle para el taller, pero el cliente
  vería en peek101 una lista de piezas en vez de sus muebles;
- otra cosa que yo no estoy viendo.

Lo que yo haría es **un ítem por mueble**, pero eso es intuición mía leyendo el
JSON, no conocimiento del taller. Tú sabes cómo se fabrica y cómo se cobra.

## 2 · Qué tiene que caber en `datos`

La tabla `cotizaciones` de la suite guarda `total` en centavos y un campo
`datos` (JSON) para el desglose. Del respaldo saqué que una versión trae
`muebles`, `materiales`, `totalFinal`, `descuento`, `usaTDC`, `usaFlete`,
`usaArq` y `autosave`, y que `config` trae `iva`, `indirectos`, `ingenieria`,
`embalaje`, `comisionArq`, `comisionTDC`, `fleteMin`, `fleteEscalon`,
`fleteIncremento` y `especialesGuardados`.

**¿Se guardan las versiones o sólo la última?** Hoy hay 38 cotizaciones con
varias versiones cada una. Guardar todas conserva la historia de la
negociación; guardar sólo la última es más simple y más barato.

Y **¿los cargos se congelan con la cotización o se leen de la configuración del
momento?** Si el IVA o una comisión cambian, una cotización vieja reimpresa
debería dar el mismo número que dio el día que se mandó. Si eso importa, los
cargos van dentro de `datos`, no en una tabla aparte.

## 3 · El folio: ¿sigue del 7 o empieza de nuevo?

Hoy lo asigna la propia app: lee `reciboCounter`, le suma uno y lo guarda. Va
en **7**, y dos personas cotizando a la vez sacan el mismo número.

La API **no genera folios** (medido: ninguna ruta lo hace). Así que hay que
decidir dos cosas:

- **¿La numeración nueva continúa desde el 7 o arranca de cero?** Si tus
  clientes ya vieron folios, continuar evita que dos cotizaciones distintas
  lleven el mismo número en papeles distintos.
- Y como la API no los genera, **voy a proponer una ruta nueva en
  `suite101-api`** que entregue folios únicos por empresa (D4: ninguna app
  toca una base directo, y un contador en el navegador vuelve a chocar). Si
  tienes un formato en mente —`2026-0008`, o sólo el número— dilo antes y lo
  pido así de una vez.

## 4 · Los precios: ¿los edita quién, y desde dónde?

`prices` son 11 listas (`LED_ML`, `PP`, `PC`, `PPG`, `JALADERAS`, `PPO`, `PF`,
`PL`, `PE`, `PG`, `PCUB`) y hoy viven en la misma base, editables desde el
engrane de la app.

En la suite no hay tabla de precios de material. Entonces: **¿se quedan dentro
de quote101 —en `datos` o en una tabla suya— o son de la empresa y otros
programas deberían verlos?** Si nest101 o quell101 van a necesitarlos alguna
vez, conviene decidirlo ahora y no después de mudarlos.

## Dos cosas que NO te pregunto porque no son tuyas

- **La facturación cerrada de Google**, que tiene el Storage caído y las 93
  fotos sin cargar. Es de Mike, ya se lo dije.
- **Cuándo se apaga Netlify.** También de Mike, y es la fase 5.

## Una advertencia para cuando toque la fase 4

Cuando mudemos las 38 cotizaciones viejas: **están en pesos con decimales y la
API exige centavos enteros.** 37 de 38 totales llevan centavos, y hay 447
números con decimales en todo el documento. Multiplicar por 100 y redondear es
donde el dinero cambia sin que nadie lo vea. El importador va a cuadrar
cotización por cotización y a reportar cada diferencia; si hay alguna regla de
redondeo que el taller ya usa —siempre hacia arriba, al peso, lo que sea—,
dímela y la aplico en vez de inventarla.

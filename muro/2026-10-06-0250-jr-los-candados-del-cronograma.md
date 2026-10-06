de:     jr (programador)
para:   quien toque el cronograma (cronograma.js, motor.js), los pagos en dash101 (form-movimiento.tsx, movimiento_items) o el ítem en quell101 (ElementPanel.jsx)
fecha:  6-oct-2026, 02:50 UTC
asunto: los dos candados del ítem en el cronograma —anticipo repartido de un pago, diseño definido— y el eslabón que quita una cadena (API 0.70.0 #245, bitacora-obra #113 y #114, dash101 #138)

MIKE, 6-oct: «Todos los ítems necesitan cumplir 2 parámetros para que se
fije su fecha de inicio, mientras los parámetros no se cumplan la fecha de
inicio se sigue recorriendo al día presente. Son 2: anticipo y definición
de diseño. Necesito poder marcar en el ítem la fecha de definición de
diseño, y si hay cambios, poder editarla. Esa edición movería todo el ítem
dentro del cronograma. El anticipo se debe marcar desde dash. A la hora de
registrar un pago, se debe poder alocar cantidades a cada ítem. Puede
definirse por monto, por porcentaje, o distribuir entre los ítems
seleccionados.» Y antes, en la gráfica: «no puedo borrar una cadena hecha
sin querer de una fase con otra. Necesito poder quitarla, o en su caso
sobreescribirla para corregir si va antes o después».

LAS DECISIONES DE FORMA.

1. El candado es un PISO, no una fecha de inicio. `programar(tareas,
   inicio, pisos)`: con los dos candados, la pieza no corre antes de la
   fecha más tardía de los dos (el pago más antiguo que le tocó, o la del
   diseño); sin alguno, no corre antes de HOY. Un piso nunca adelanta: la
   obra, las cadenas y la fecha fija siguen pudiendo retrasarla. Y como
   «hoy» se recalcula en cada lectura, la pieza sin candados se recorre
   sola día con día, que es lo que Mike pidió, sin que nadie la toque.
2. El anticipo es un REPARTO del pago, no un campo del ítem: tabla
   `movimiento_items` (movimiento_id, item_id, monto en centavos,
   proyecto_id que pone la API). Un pago puede repartirse en parte: lo que
   no se reparte queda al proyecto sin ítem. La API valida cada renglón
   (ingreso; ítem del mismo proyecto; monto > 0; la suma no pasa del pago;
   al corregir, el renglón no se cuenta dos veces) y contesta con palabras
   por campo, que dash101 ahora enseña tal cual (`enClaro` junta `errores`).
   El anticipo también cuenta si el ítem ya va en la etapa 2 «Anticipo
   pagado» (con la fecha de esa etapa): lo que ya estaba marcado así no
   queda trabado.
3. Una pieza SIN ítem de dash101 no puede tener anticipo (`ligado:
   false`) y por eso corre desde hoy; la pantalla lo dice con palabras:
   «Sin ítem en dash101: liga la obra al proyecto para registrarle el
   anticipo». No se inventó un «anticipo manual» en quell: el dinero entra
   por dash101 y de ahí se sabe.
4. La fecha de diseño vive en la pieza (`quell_elements.diseno_definido`,
   AAAA-MM-DD), no en el ítem de la suite: la define quien dirige la obra,
   en «Editar», y vacía la quita. Es la única que mueve la pieza entera.
5. El cronograma trae por pieza `candados` {anticipo, anticipo_monto,
   diseno, ligado, listo, arranque}: las pantallas enseñan, no cuentan.
   `anticipo_monto` es dinero y se recorta a quien no lo ve, igual que el
   precio del ítem.

LA API (0.70.0). Migración org 0033 (`movimiento_items` + la columna).
CRUD genérico: dash101 escribe movimiento_id, item_id y monto; se lista
por movimiento_id, item_id o proyecto_id. PATCH /quell/elements/:id acepta
`diseno_definido`; el detalle de la pieza trae `anticipo_fecha` y
`anticipo_monto`. Tipos `MovimientoItem` y `CandadosPieza`.

dash101 (#138). En el movimiento (ingreso a un proyecto con ítems): «Repartir
este pago como anticipo entre ítems», se escogen ítems y el modo —por monto,
por porcentaje del pago, proporcional al precio, en partes iguales—; abajo
«Repartido X de Y · Z quedan al proyecto sin ítem», en rojo si se pasa. Se
guarda colgado del movimiento (se reemplaza entero); al corregir, lo
repartido se carga. `ItemProyecto.anticipo`.

quell101 (#114). Al editar el ítem, «Diseño definido el». El encabezado del
ítem (staff) dice Diseño definido/sin definir y Anticipo/Sin anticipo/Sin
ítem en dash101. En el cronograma, cada pieza: «Arranca <fecha>» con los
dos, o en rojo lo que falta y «corre desde hoy» (en la gráfica: ✓, ⚠
anticipo, ⚠ diseño).

Y LA CADENA (#113, antes de todo esto). Una barra encadenada trae un
eslabón (⛓) que quita la cadena; y encadenar `a` después de `b` quita en el
mismo paso la cadena al revés si `b` esperaba a `a`: soltar la barra del
otro lado sobreescribe. Antes el servidor rechazaba el ciclo y la pantalla
se quedaba en «Sin guardar».

MEDIDO.
  · API: quell.spec 73 en verde (tres nuevas: el reparto con sus rechazos y
    la corrección; los candados y el arranque en la fecha más tardía; la
    pieza sin candados arranca hoy, el diseño solo no la suelta, la etapa 2
    cuenta). OJO: las pruebas de fechas de 0.68.0/0.69.0 ahora dejan puestos
    los candados ANTES, con fechas anteriores al 5-oct; si alguien agrega
    una pieza nueva a esas pruebas sin candados, correrá desde hoy. Suite
    760, tsc limpio. Deploy: RESULTADO todo verde, humo 205/205, /salud
    0.70.0 en producción y staging.
  · dash101: escritura-api.spec contra staging, 16 en verde (se reparte,
    el ítem lo suma, «no alcanza» al pasarse). tsc limpio.
  · quell101: los-candados.mjs (17) y el recorrido en Chromium con la API
    simulada (27): rótulos en gráfica y lista, el eslabón, voltear la
    cadena.

LO QUE NO SE HIZO (a propósito). El reparto no se enseña todavía en la
pantalla del proyecto de dash101 ni en el estado de cuenta: sólo en el
movimiento y, sumado, en el ítem (`anticipo`). No hay aviso al cliente. Un
pago repartido que se borra se lleva su reparto (ON DELETE CASCADE) y la
pieza vuelve a correr desde hoy: es lo correcto, pero conviene saberlo.

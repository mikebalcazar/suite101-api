de:     jr (programador)
para:   quien toque el cronograma de quell101 (src/quell/motor.js: completarFases, poblarCostosDefault, ponerTiemposDefault), el arranque del OrgDB (org-db.ts: correrPendientes) o las migraciones que necesitan el motor
fecha:  6-oct-2026, 20:58 UTC
asunto: los costos default se calculan por PIEZA (defecto del 0.73.0), y se pueblan una vez los costos y los tiempos default en lo que ya estaba (API 0.74.0 #255 y #256, 0.75.0 #257; bitacora-obra #117)

MIKE, 6-oct, dos mensajes seguidos:
  «necesito que pobles por mí todos los ítems que tenemos en alcance, que
   no tengan precio, con los costos predeterminados»
  «ponla también todos los ítems que hay ahorita en alcance con los
   defaults de tiempos. Avísame si te falta algo de info»
Con botones, sobre los días capturados a mano: «sólo donde falten».

EL DEFECTO QUE SALIÓ AL LEER EL CÓDIGO. En 0.73.0 el costo default de una
fase salía de `items.monto`, que es el de TODAS las piezas del ítem (precio
por pieza × cantidad), y cada pieza del plano es una unidad. Una puerta de
un ítem × 20 nacía con el costo de las veinte, y su compromiso también. Ahora
sale de `precioPorPieza(monto, cantidad)` (cronograma.js). Vivió de las
~18:50 a las ~20:50 UTC; lo que nació así se corrige en el paso 3 de abajo.

EL MECANISMO: PENDIENTES DE ARRANQUE. Las migraciones del OrgDB corren
síncronas (`migrar()`), y poblar necesita el motor de quell (fechas del
cronograma, compromisos), que es asíncrono. Una migración SQL deja una fila
en `pendientes_arranque` (clave, creado_at, hecho_at, resultado) y el
constructor, después de migrar, corre `correrPendientes()`: cada pendiente
una vez, en el orden en que nació, y anota cuándo y qué hizo (JSON). Si uno
truena se queda pendiente y se reintenta en el siguiente arranque: un
arreglo que falla nunca deja la empresa sin abrir. OJO: la tabla se llamaba
`_pendientes` en #255 y el despliegue se detuvo en las pruebas (la del DO
recién nacido no cuenta tablas con guion bajo; la del esquema sí); #256 la
renombró. No se publicó nada con el nombre viejo.

0036 · poblar_costos_default (0.74.0):
  1. Toda obra recibe sus fases default donde falten (`completarFases`),
     como al abrir su cronograma: así sus compromisos entran al flujo sin
     que nadie abra cada obra.
  2. Pieza ligada a un ítem EN ALCANCE (vendido) con precio: por etapa
     —material, fabricación— si ninguna fase de esa etapa tiene costo, la
     PRIMERA (orden, sección, pos) recibe el default sobre el precio de una
     pieza. Si alguna ya tiene costo, se respeta. Instalación: no tiene
     porcentaje, no se toca.
  3. Con cantidad > 1, una fase cuyo costo es EXACTAMENTE el default
     calculado sobre el total se corrige al de una pieza.
  4. Las obras que cambiaron rehacen sus compromisos y su proyecto.

0037 · tiempos_default (0.75.0), «sólo donde falten»:
  · Piezas en alcance —la regla de quell101: sin ítem, o con su ítem
    vendido— que no tienen NINGUNA fase: reciben las tres (10/24/12 días)
    con su costo por pieza.
  · Una fase de material, fabricación o instalación que sigue en 1 día pasa
    a 10, 24 o 12. «Falta» = 1 porque con 1 día nace la fase que se agrega a
    mano en quell101 (`tarea({…dias: 1})`, Cronograma.jsx) y la base no
    admite cero (`dias INTEGER NOT NULL DEFAULT 1`, mínimo 1). Si alguien
    capturó 1 día a propósito, quedó en el default: se le dijo a Mike.
  · Lo capturado (otros días), las cadenas, las fechas fijas y las fases
    «otra» se quedan. Fuera de alcance y requerimientos, no.
  · Las obras que cambiaron rehacen sus compromisos (las fechas se mueven).

DÓNDE SE VE. quell101 → Cronograma: costos y días puestos; la nota dice ya
«sobre el precio de cada pieza: el del ítem entre su cantidad» (#117).
dash101 → Proyecto → compromisos «del cronograma», y Flujo proyectado.

MEDIDO.
  · API: pruebas/poblar-costos.spec.ts (3) arma una empresa de antes de la
    0036 con los cinco casos (fases de antes de la 0035 en cero, costo sobre
    el total, costo capturado con dos procesos, fuera de alcance, pieza sin
    abrir con cantidad 2); con el cálculo viejo truena.
    pruebas/tiempos-default.spec.ts (2): 1 día → default, 7 capturados y la
    fase «otra» se quedan, pieza en alcance sin fases recibe tres con costo
    de UNA pieza, pieza sin ítem sí, fuera de alcance y requerimiento no;
    idempotente. Suite 779, tsc limpio.
  · Despliegues: #255 se detuvo en las pruebas (la tabla con guion bajo,
    arriba) sin publicar nada; #256 (afc84c3) y #257 (a853534) con
    «Publicar API» en verde, RESULTADO todo verde y humo 205/205 las dos
    veces; /salud contrato 0.75.0 en producción y staging. bitacora-obra
    #117 publicado; el bundle vivo dice «sobre el precio de cada pieza».
  · Staging, org demo (medición de sólo lectura, sin escribir): la obra
    Cocina Ramírez quedó con 3 piezas y 9 fases, 6 con costo ($157,200; MW-01
    $111,000, MW-02 $37,200, SV-01 $9,000), y los días m10/f24/i12 en las
    tres piezas.
  · Producción (forespot): sólo se mira. Los dos pendientes corren solos la
    primera vez que la empresa abre después del despliegue.

LO QUE NO SE HIZO (a propósito). Lo capturado a mano no se pisa (decisión
de Mike). Las piezas fuera de alcance no reciben costo ni días. Una pieza
cuyo ítem entra al alcance DESPUÉS no se puebla sola: los pendientes corren
una vez; nace con fases al abrir el cronograma si nunca las tuvo.

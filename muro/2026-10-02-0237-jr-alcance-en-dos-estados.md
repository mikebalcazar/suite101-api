de:     jr (programador)
para:   quien toque el alcance de los ítems (API, dash101, quell101, quote101)
fecha:  2-oct-2026, 02:37 UTC
asunto: El alcance en dos estados —dentro o fuera— con su bitácora (API 0.64.0, dash101 #128/#129, quell101 #100)

MIKE, 2-oct: «Hay que eliminar el estado de los ítems de "cancelado" y solo
existirá "en alcance" o "fuera de alcance". Así hay una lista unificada de
las cosas que están requeridas pero aún no se confirman, o se confirmaron y
se cancelaron, pero no pasan a otra lista, regresan a fuera de alcance; solo
en la bitácora sí aparecerá como "se sacó del alcance" y si se agrega de
nuevo aparecerá después "se agregó al alcance" con su fecha y quién la
agregó.»

LO QUE CAMBIÓ EN LA API (0.64.0, PR #208):
- `AlcanceItem` es 'dentro' | 'fuera'. `alcanceDeItem` sólo mira `estado`:
  vendido es dentro, lo demás es fuera. Se fueron 'no_aprobado',
  'cancelado' y 'descartado' del contrato.
- La API ya NO escribe `estado = 'cancelado'`. `POST /items/:id/sacar` (y
  `/cancelar`, que se queda como alias) regresa el ítem a 'cotizado' con
  `cancelado_at` y motivo. Un 'cancelado' que llegue por el CRUD (la
  pantalla del proyecto de dash101 al quitar un renglón, una app vieja) se
  guarda como 'cotizado'. El CHECK de `items.estado` sigue admitiendo
  'cancelado' —rehacer la tabla con cinco hijas no vale una palabra—, pero
  ya nadie lo escribe.
- `cancelado_at` sigue importando: dice que a ese ítem lo SACARON. No es
  lo mismo que un requerimiento que nadie ha decidido: ése sigue saliendo en
  el plano de quell101 como pendiente y en el borrador «Requerimientos» de
  quote101; el sacado, no.
- Migración 0028 del OrgDB: tabla `alcance_movimientos` (entra/sale, quién,
  app, motivo, cuándo). Append-only, se borra sola con el ítem. Sembrada de
  `aprobado_at` (entra) y `cancelado_at` (sale), SIN quién: nunca se
  guardó, y las pantallas lo dicen así («sin registro de quién»). Y los
  'cancelado' que había pasan a 'cotizado'. OJO: se llama
  `alcance_movimientos` y no `items_alcance` porque ese nombre ya era de un
  ÍNDICE de la 0016, y SQLite comparte el espacio de nombres entre tablas e
  índices: «there is already an index named items_alcance».
- Se anota en TODA puerta que mueva el estado, en org-db.ts y no en las
  rutas: aprobar, sacar, el CRUD (actualizar), nacer vendido (crear),
  vender desde quote101 (venderItems) y aprobar una cotización. El quién es
  el correo de la sesión; las rutas se lo pasan en `contexto`.
- `GET /orgs/:o/items/:id/alcance` → {item_id, alcance, movimientos}. El
  detalle de la pieza en quell trae `item_alcance_movimientos` (no al
  cliente).
- `borrar-cancelados` se queda y censa lo que se SACÓ (`estado <> 'vendido'
  AND cancelado_at IS NOT NULL`); un requerimiento sin decidir no entra.
- Pruebas: alcance.spec.ts reescrita (17 fallan en el código viejo), humo
  con cuatro revisiones nuevas; sin-negocio.spec repite las migraciones
  hasta la 0026 (asumía que la 0027 era la última).

DASH101 (#128 y #129):
- Una sola pestaña «Fuera de alcance (n)». Cada renglón dice si lo sacaron
  (fecha y motivo) o si nadie lo ha decidido; botones «Agregar al alcance»,
  «Sacar» y «Bitácora». Detrás del «+» de cada ítem: la bitácora del
  alcance. «Sacar del alcance» en vez de «Cancelar» en el renglón.
- lib: fueraDeAlcance devuelve una lista con `sacado`; sacarItem (POST
  /sacar); bitacoraAlcance; NOMBRE_MOVIMIENTO_ALCANCE.
- «Revisar y borrar los que se sacaron del alcance».
- La corrida de staging de #128 se cayó en navegador.spec: la prueba
  filtraba `estado !== 'cancelado'` para ver «lo que queda» y el ítem
  quitado ahora es 'cotizado'. #129: se lee `estado === 'vendido'` (cuatro
  lugares y el filtro de respaldo del adaptador). Lección: al cambiar un
  contrato, buscar la palabra vieja también en las pruebas de navegador.

QUELL101 (#100):
- Filtro: En alcance / Fuera de alcance / Todos. Panel del ítem: «Agregar al
  alcance» / «Sacar del alcance» (pide /sacar) y la bitácora debajo.
- La regla del plano sigue: un requerimiento pendiente se dibuja como
  dentro (Mike, 22-sep: «sí aparece en mapa»); uno sacado (cancelado_at)
  ya no. Está en ALCANCE_SQL del motor.

QUOTE101: no toca el alcance, pero gana «Ítems pendientes» (nota aparte).

VERIFICADO EN VIVO: API 0.64.0 en api.taller101.com (humo en verde: vender deja «entra», sacar contesta «fuera»); dash101 #128+#129 publicado con las pruebas de navegador de staging en verde; quell101 #100 publicado (el JavaScript vivo trae «Fuera de alcance» y «Se sacó del alcance»).

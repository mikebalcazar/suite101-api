# quell101: trabajos A y D del encargo hechos (ítems y contratistas por ítem)

**18-sep-2026 18:55Z · Jr. PROGRAMADOR**
**para: quell101 · copia: peek101, roster101**

Del encargo de Mike del 18-sep para quell101 (Drive,
`2026-09-18-encargo-quell101.md`), quedan hechos y publicados los trabajos
**A** (ítems) y **D** (contratistas por ítem). bitacora-obra #69, main
`74b2fff`, runner `35382323024` verde: pruebas (puerta, código único, obra,
build, entrada), migración `0011` aplicada en la base real, Worker publicado
y `/` contesta 200. **B** (cara de cliente, incluida la liga por proyecto
para peek101) y **C** siguen detenidos como dice el encargo.

## Lo que cambió en el Worker

- `POST /projects/:p/elements` propone el código en el servidor cuando llega
  vacío y el tipo tiene prefijo (`MW-`, `PT-`, `FX-`): toma el mayor de la obra
  y suma uno (`MW-07`). Contesta `{ok, id, code}`. Si mandan código, se
  respeta (y sigue la unicidad por obra de la 0010).
- Tipo nuevo `Acabado` (prefijo `FX-`). Los tipos viejos siguen abriendo.
- `PATCH /elements/:id` con `{x, y, reubicar: true}` mueve el pin y deja
  renglón de bitácora «Reubicado en el plano.» (kind `trabajo`). Idempotente
  por `op_id`, como el resto.
- Tabla nueva `element_contratistas (element_id, user_id, asignado_por,
  asignado_at)`, migración `0011_contratistas_por_item.sql`.
- `PUT /elements/:id/contratistas {user_ids, op_id}` (sólo staff): reemplaza
  la lista. Sólo acepta usuarios activos, con rol `con` y miembros de la obra.
- Un contratista es «suyo» de un ítem si está en esa tabla **o** tiene un
  pendiente asignado en él. El GET de la obra le manda `mios` (los ids suyos)
  y los ajenos recortados (`ajeno: true`, sólo id, código, nombre, tipo y
  posición, conteos en 0). El GET del ítem ajeno viene con `recorte: true` y
  sin bitácora ni pendientes; el suyo, completo, con `contratistas`.

## Lo que cambió en la pantalla

- Alta de ítem: el código ya viene propuesto y editable; tipo con `Acabado`.
- En el ítem: selector de tipo, botón «Reubicar en el plano…» (se toca el
  plano y queda), y el bloque **Contratistas** (chips con ✕ y un selector de
  los miembros con rol `con`).
- Para el contratista: sus pines se ven distintos de los ajenos, la pestaña
  dice «Pendientes del ítem» y los ajenos abren en modo recorte.

## Lo que no hice y por qué

- El encargo pide **una obra de prueba con datos inventados en la base de
  producción**, avisarla aquí y una imagen en el wall. No la creé: una sesión
  no abre sesión de producción como Mike y en producción sólo miramos. La
  puede crear Mike desde quell101 o ustedes si tienen sesión de `demo` ahí.
  Lo comprobado es el banco local (`pruebas/obra.mjs`, 47 comprobaciones con
  el Worker sobre SQLite real) y el humo del runner.
- Para que Berna y Tema aparezcan en el selector necesitan cuenta en la
  suite con rol `con` y membresía en la obra: eso lo da el director en
  workshop101, no quell101.

## Qué les toca

- Revisar que los textos de recorte y de «Reubicar» les suenen; corríjanlos
  en su rama si no.
- B y C cuando Mike los suelte. La liga por proyecto para peek101 va en B.
- Si al probar en producción algo no cuadra con esta nota, recado aquí; yo
  corrijo.

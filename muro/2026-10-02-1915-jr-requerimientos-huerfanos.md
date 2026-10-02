de:     jr (programador)
para:   quien toque los requerimientos, la liga obra↔proyecto o las migraciones del OrgDB
fecha:  2-oct-2026, 19:15 UTC
asunto: Los requerimientos del plano sin ítem: nacen al ligar la obra y la 0030 repara los que ya estaban (API 0.64.2 #218)

MIKE, 2-oct: «los requerimientos levantados en quell son ítems no aprobados,
son trabajos nuevos que se piden en obra y tienen que pasar por un proceso
de autorización y precio. Esos tienen que aparecer en la lista de quote de
ítems pendientes. Ahorita hay unos requerimientos del Depto Bosques de Santa
Fe que no aparecen en ítems pendientes en quote».

LA CAUSA. Un requerimiento nace como ítem cotizado del proyecto SÓLO si la
obra ya estaba ligada a un proyecto de dash101 cuando se levantó (0.49.0,
29-sep; `levantarRequerimiento` contesta nulos si la obra no tiene
`proyecto_id`). Los de Bosques de Santa Fe se levantaron antes de ligar la
obra, o antes del 29-sep: son pines del plano sin `item_id`. quote101 lista
`items?proyecto_id=&estado=cotizado`, y un pin sin ítem no está ahí. No era
la lista de quote: era que el ítem no existía.

EL ARREGLO (tres puertas, todas en la API):
- `ligarObra` (POST /orgs/:o/obras/:id/ligar) termina llamando a
  `levantarRequerimientosHuerfanos(obra_id, usuario)`: por cada pin de tipo
  requerimiento sin ítem, nace su ítem cotizado (tipo 'requerimiento',
  monto 0, clave = código del pin), el pin queda ligado y cae un renglón en
  el borrador «Requerimientos» de quote101. Igual que si se levantara hoy.
- Migración 0030 del OrgDB, EN CÓDIGO (como la 0027): la misma barrida en
  todas las obras ya ligadas de la empresa, al abrir su Durable Object tras
  el deploy. Es idempotente: un pin con ítem no se toca; las obras sin
  ligar no se tocan (se reparan al ligarlas). Los ítems que crea llevan
  `creado_por = 'migracion-0030'`.
- «Traer del plano» (POST /obras/:id/items {crear}) con un pin de tipo
  requerimiento y sin precio lo levanta como requerimiento (tipo + borrador)
  en vez de como pieza cotizada suelta que quote101 no sabría de dónde salió.

OJO: si la obra de Bosques de Santa Fe NO está ligada a su proyecto, nada
de esto aplica hasta que se ligue (dash101 → proyecto → «Obra de quell101»
→ escoger la obra → ligar). Al ligar, los requerimientos nacen solos.

PRUEBAS: alcance.spec.ts +3 (levantar en obra suelta → ligar → el ítem
pendiente existe, está en el borrador y el pin fuera del alcance; desligar
y religar no duplica; traer del plano un pin vuelto requerimiento).
requerimientos-huerfanos.spec.ts (3): arma una base en v26 dentro del DO
—negocio, cliente, proyecto, obra ligada, plano, un requerimiento sin ítem,
un mueble sin ítem y un requerimiento en obra suelta— y mide que `migrar()`
(0027→0030) deje UN ítem, el pin ligado, el borrador con su renglón, y los
otros dos pines intactos; y que repetirla no haga nada. Fallan 5 en el
código viejo. Suite 33 archivos / 730 en verde.

VERIFICADO EN VIVO: «Publicar API» de #218 en verde (pruebas, humo,
staging y producción); /salud en producción contesta contrato 0.64.2. La
migración 0030 corre en cada empresa al abrir su Durable Object: la de
forespot se repara en cuanto alguien abra quell101, quote101 o dash101
después de este deploy. Lo que no puedo medir desde aquí es Bosques de Santa
Fe en producción (sólo se mira): lo mide Mike abriendo «Ítems pendientes» en
quote101.

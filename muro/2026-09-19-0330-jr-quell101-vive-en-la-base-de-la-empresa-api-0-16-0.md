# quell101 vive en la base de la empresa (API 0.16.0): la primera mudanza

**19-sep-2026 03:30Z · Jr. PROGRAMADOR**
**para: quell101, coordinador, roster101 · copia: master101, peek101, dash101**

Mike decidió el 19-sep, con los riesgos dichos: **todo lo de una empresa vive
en su base de la suite**. quell101 es la primera app en mudarse; roster101 va
después por el mismo camino. Está publicado en la API y en master101; el
Worker de quell101 pasa a producción cuando Mike corra la mudanza de forespot
desde master101 (por el orden: primero los datos, luego el corte).

## Cómo se hizo sin cambiar una regla de obra

- **Migración `0006_quell.sql` del OrgDB**: las catorce tablas de quell101
  con prefijo `quell_` (sus doce migraciones consolidadas), la cerradura del
  código único por obra y las cinco etapas sembradas. `items` de la suite y
  `quell_elements` son cosas distintas y se quedan distintas.
- **`src/quell/motor.js`**: el MISMO archivo que corría en
  `bitacora-obra/worker/index.js`, con tres cambios: tablas con prefijo sobre
  un adaptador D1→SqlStorage (prepare · bind · first · all · run · batch), la
  sesión la resuelve la puerta de la suite (`env.SESION`), y los archivos van
  al bucket de la suite bajo `orgs/{org}/quell/`. Es JavaScript a propósito;
  `motor.d.ts` le pone la firma. Sus 95 comprobaciones pasaron a
  `pruebas/quell.spec.ts` sin reescribirse.
- **`/orgs/:o/quell/*`** (`src/rutas/orgs.ts`): la puerta de siempre
  (sesión, empresa, `org_sin_pago`, app prendida, miembro o cliente) y el
  reenvío al Durable Object con `x-sesion`. `/orgs/:o/quell/files/*` sirve
  planos y fotos, sólo de esa empresa. **Un cliente entra**: es la cara de
  cliente, recortada por el motor. Es la única excepción a «un cliente sólo
  abre /peek» y está probada renglón por renglón (peek101: nada cambia para
  ti).
- **El dueño de la empresa entra solo**: el director que master101 dio de
  alta (owner/admin en la suite) nace como dueño de la bitácora la primera
  vez; los demás siguen necesitando su renglón (dos altas, como hasta hoy).
- **`src/clientes.ts`**: la invitación del cliente en un solo lugar; la usa
  `POST /orgs/:o/clientes/invitar` y el motor desde adentro del DO. Si la
  empresa no tiene negocio, se crea uno con su nombre (una empresa que sólo
  usa quell101 no abrió dash101 antes).
- **`POST /admin/mudar-quell {org, modo}`**: trae la D1 `bitacora-obra` y el
  bucket `bitacora-obra-files` (ligas `QUELL_D1`/`QUELL_R2`, sólo lectura,
  sólo producción) al OrgDB, por llave, con **upsert**. Ojo para quien mude
  roster101: `INSERT OR REPLACE` dispara los `ON DELETE CASCADE` de las
  hijas; se vio en la prueba. `seco` por omisión. `GET /admin/orgs/:o/quell`
  cuenta las filas.
- `DELETE /projects/:id` (dueño) borra la obra y sus archivos (nuevo; el
  humo lo usa para limpiar).

## quell101 (bitacora-obra #71, sin mezclar todavía)

El Worker es un cascarón: sirve la pantalla y los instaladores y reenvía
`/api/*` y `/files/*` a `/orgs/{empresa}/quell/…`. La empresa sale de la
sesión: el cliente va a la de su acceso; un miembro a la de este sitio
(`ORG_ID`) si está en ella, o a la primera suya con quell prendida. Sin D1,
sin migraciones. **Gana staging**: `bitacora-obra-staging` contra la API de
staging y la empresa `demo`; el despliegue entra, levanta obra, plano e
ítem, sirve el plano y borra, antes de tocar producción.

## master101 (#12)

Dentro de cada empresa, «Bitácora de obra (quell101)»: cuenta lo que hay y
la mudanza en dos pasos (contar en seco → traer de verdad).

## El orden del corte (forespot)

1. API 0.16.0 publicada (hecho, runner `35417806394`).
2. Mike, en master101 → forespot: «Contar lo que se traería» y luego «Traer
   de verdad». Medido hoy en la D1 vieja: 2 obras, 4 planos, 69 ítems, 35
   renglones de bitácora, 3 pendientes, 8 fotos, 3 personas.
3. Se mezcla bitacora-obra #71: producción pasa a la suite.
4. Mike vuelve a «Traer de verdad»: trae lo que se haya escrito en la D1
   vieja entre 2 y 3 (upsert; no borra).
5. La D1 vieja se queda unos días sin que nadie la lea; luego se borra (eso
   lo decide Mike).

## Para roster101 (siguiente)

Mismo patrón: migración `0007_roster.sql` con prefijo `roster_`, el Worker
de t101-portal como cascarón, `POST /admin/mudar-roster`. Dos cosas que
cambian de fondo y conviene decir ya: el «central» de roster101 (registro de
empresa, un Worker por empresa) queda sustituido por el alta de master101; y
la puerta del trabajador (correo + código, sin cuenta de la suite) tiene que
saber de qué empresa es —la propuesta es que la liga de invitación lleve la
empresa—. Lo planteo en el muro antes de tocarlo.

## Cómo se probó

- API: 247 pruebas en workerd, 19 nuevas (`pruebas/quell.spec.ts`). Humo en
  staging con vuelta de quell101, verde.
- quell101: `pruebas/puerta.mjs` 26 revisiones; build; entrada 15.
- master101: recorrido «mudanza» con navegador contra staging, 8 revisiones.
- docs101: https://docs101.pages.dev/quell101-en-la-base-de-la-empresa/ (se
  publica con el corte).

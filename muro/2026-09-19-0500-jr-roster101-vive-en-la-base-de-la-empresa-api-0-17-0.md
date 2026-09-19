# roster101 vive en la base de la empresa (API 0.17.0): la segunda mudanza

**19-sep-2026 05:00Z · Jr. PROGRAMADOR**
**para: roster101, coordinador, master101 · copia: quell101, workshop101**

Mike decidió tres cosas hoy, cada una con su consecuencia dicha antes: todo lo
de una empresa vive en su base de la suite (ya venía de quell101); **la central
de roster101 se retira** y el alta va por master101 (queda superada la decisión
vieja de «master101 no toca roster101»); y **un Worker por empresa, como hoy**
(no un portal con la empresa en la liga). Está publicado en la API (#80, #81) y
en master101 (#13). El Worker de roster101 (t101-portal-trabajadores #21) pasa
a producción cuando Mike corra la mudanza de forespot desde master101: primero
los datos, luego el corte, igual que con quell101.

## Cómo se hizo sin cambiar una regla del expediente

- **Migración `0007_roster.sql` del OrgDB**: siete tablas con prefijo
  `roster_` (trabajadores, documentos, códigos, bitácora, consentimientos,
  papelera, administradores). Las de la contraseña vieja del panel se quedaron
  atrás: ya estaban vacías desde el 16-sep.
- **`src/roster/motor.js`**: el MISMO `src/index.js` del Worker, con cuatro
  cambios: tablas con prefijo sobre el mismo adaptador de quell101; quién viene
  al panel lo dice `env.SESION` (ya no se pregunta a `/yo`); documentos en el
  bucket de la suite bajo `orgs/{org}/roster/` con las llaves relativas de
  siempre (`bucketConPrefijo`); y los datos de la empresa llegan en cada
  petición. Con sus módulos (validar, correo, exportar, ficha, cuentas, lib) y
  `fflate` como dependencia nueva.
- **Puerta nueva `/roster/:o/api/*`** (`src/rutas/roster.ts`), APARTE de
  `/orgs`: el trabajador entra sin cuenta en la suite —correo y código, cookie
  `t101_sesion` firmada ahora con el secreto de la suite— y `/orgs` exige sesión
  para todo. La puerta revisa X-App, empresa activa/vigente, roster prendida; la
  sesión de la suite es opcional y se pasa al motor sólo si la persona es
  miembro con `roster` en su lista (o el dueño de la suite). Los documentos los
  sirve el motor desde adentro: quién ve cada uno lo dice la base.
- **El dueño y la administración de la empresa entran como dueños del panel**
  sin renglón (`de_la_suite`), igual que en quell101: sin eso, con la central
  retirada nadie podría abrir un panel nuevo.
- **`X-Roster`**: el Worker de cada empresa manda nombre, razón social,
  domicilio, correos y versión del aviso, codificados con `encodeURIComponent`.
  Ojo general: **las cabeceras `x-sesion`/`x-roster`/`x-empresa` entre el Worker
  y el DO van en ASCII** (también la de quell101 desde #80); «Dueña» sacaba un
  aviso en workerd y en un navegador sería un TypeError.
- **`POST /admin/mudar-roster {org, modo}`**: trae la D1 `t101-trabajadores` y
  el bucket `t101-documentos` (`ROSTER_D1`/`ROSTER_R2`, sólo lectura, con el
  id de siempre en wrangler.toml). Upsert por llave; dice qué cuentas del panel
  no tienen cuenta en la suite. `GET /admin/orgs/:o/roster` cuenta. Los
  códigos de acceso no se mudan (valen diez minutos).
- `conteosQuell/importarQuell` y los de roster comparten `contarTablas` /
  `importarTablas` en org-db.ts.

## roster101 (t101-portal-trabajadores #21, sin mezclar todavía)

Cascarón: `/s101/*` y `/api/*` a la suite; `/api/salud` (`datos: 'suite'`) y
`/api/config` aquí. Se fueron la central (Worker, base con cero empresas,
flujos «Alta de cliente» e «Instalar central»), schema.sql, migrations/, los
scripts de Windows y los secretos SECRETO/RESEND_API_KEY (ya no se usan). Un
Worker por empresa sigue: `clientes/_plantilla.toml` es el molde (ORG_ID +
datos); alta = master101 + archivo. **Gana staging** (`t101-portal-staging`,
empresa demo): el despliegue entra al panel y como trabajador antes de tocar
producción. Sin reloj: la papelera se vacía al abrir el panel.

## master101 (#13)

Bloque «Expedientes de trabajadores (roster101)» con conteo y la mudanza en
dos pasos, como el de quell101.

## El orden del corte (forespot)

1. API 0.17.0 publicada (hecho; humo verde con la ronda de roster101).
2. Mike, en master101 → Forespot: «Contar lo que se traería» y luego «Traer de
   verdad». Medido hoy en la D1 vieja: 10 trabajadores, 81 documentos, 12
   consentimientos, 373 renglones de bitácora, 2 cuentas del panel.
3. Se mezcla t101-portal-trabajadores #21: producción pasa a la suite. Quien
   tuviera sesión de trabajador abierta vuelve a pedir su código (cambió el
   secreto que la firma). **Hecho 05:17Z** (Mike contó y trajo, cuadró; run
   35423438280 verde: pruebas, staging con humo, producción, medición 23/0,
   `/api/salud` → `datos: 'suite', empresa: 'forespot'`).
4. Mike vuelve a «Traer de verdad»: trae lo escrito en la D1 vieja entre 2 y 3.
5. La D1 y el bucket viejos se quedan unos días; luego se borran (Mike).

## Cómo se probó

- API: 275 pruebas en workerd, 28 nuevas (`pruebas/roster.spec.ts`,
  `pruebas/roster-cuentas.spec.ts`). Humo en staging con ronda de roster101 y
  mirada en producción, verde (runs 35422260731, 35422615497).
- roster101: `pruebas/0112-cascaron.mjs` 22 revisiones; 0101 en verde.
- master101: recorrido «mudanza» con navegador (publicado, run 35422613887).
- docs101: https://docs101.pages.dev/roster101-en-la-base-de-la-empresa/

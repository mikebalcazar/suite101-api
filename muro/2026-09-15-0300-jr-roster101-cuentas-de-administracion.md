de:    jr
para:  roster101, coordinador, mike
qué:   roster101 0.11.0 publicado: cuentas de administración con contraseña (encargo `suite101/roster101/ENCARGO-cuentas-admin-2026-09-14.md`). Cada persona entra al panel con su correo; tres niveles; la bitácora dice quién exportó. La clave compartida sigue abriendo sólo hasta que Mike cree su cuenta de dueño.

# roster101 0.11.0 · cuentas de administración con contraseña

Mike lo disparó el 15-sep («Lee ENCARGO-cuentas-admin-2026-09-14.md … y
hazlo. Los otros archivos de esa carpeta tienen errores, ignóralos»). Se
ejecutó el encargo tal cual; los otros dos archivos de la carpeta no se
leyeron.

## Qué quedó

PR #14 → `main` a860d87 en `t101-portal-trabajadores`.

- **`administradores`** al final de `schema.sql` (`CREATE TABLE IF NOT
  EXISTS`): `id`, `email` (único, minúsculas), `nombre`, `hash`, `sal`,
  `vueltas`, `nivel`, `activo`, `debe_cambiar`, `creado_en`, `creado_por`,
  `ultimo_acceso`. La contraseña se deriva con `derivaClave()` de
  `src/lib.js` (PBKDF2, `VUELTAS_CLAVE` = 100 000). No se escribió
  criptografía nueva.
- **Niveles y permisos** en `src/cuentas.js` (sin base): dueño todo y
  cuentas; admin todo menos cuentas; consulta ve expedientes y saca fichas,
  no exporta, no da de baja, no captura. `exigePermiso()` cierra cada ruta:
  `exportar` (ZIP y CSV), `baja` (papelera: baja, devolver, borrar ya),
  `capturar` (PUT del expediente), `cuentas`.
- **Ingreso** `/api/admin/entrar` con correo y contraseña. Si la cuenta no
  existe o está apagada se deriva contra un señuelo, para gastar el mismo
  tiempo; el error es «Correo o contraseña incorrectos», sin decir cuál.
  `intentos_admin` sigue igual. `exigeAdmin` consulta la base en cada
  llamada: quitar el acceso surte efecto al momento (medido: 401 en la sesión
  abierta).
- **Arranque:** mientras `administradores` esté vacía, la clave compartida
  (`claves_admin` o `CLAVE_ADMIN`) abre una sesión que sólo sirve para
  `POST /api/admin/cuentas/primera`, de dueño. Con una cuenta creada, la
  clave compartida deja de valer (medido: 400).
- **Olvidé mi contraseña** sobre `codigos_admin`, sin otro camino: el código
  va a `CORREO_AVISOS` y su hash lleva el correo de la cuenta, así que sólo
  sirve para esa (medido: 401 al usarlo con otra). El dueño repone
  contraseñas desde su tarjeta; toda contraseña puesta por otra persona deja
  `debe_cambiar = 1` y el panel no abre hasta cambiarla (403 del servidor y
  pantalla de cambio obligado).
- **Candados** (`candado()` en `cuentas.js`): el último dueño activo no se
  borra, no se apaga ni se baja de nivel; nadie se apaga ni se borra a sí
  mismo. Contraseña: 10+, sin exigir mayúscula ni símbolo; se rechazan las
  que llevan el usuario del correo, las obvias y las secuencias de dígitos.
- **Bitácora:** fichas, baja, restaurar, borrado definitivo y exportar
  apuntan el correo de la sesión. Nuevas acciones: `cuenta_creada`,
  `cuenta_nivel`, `cuenta_desactivada`, `cuenta_activada`, `cuenta_borrada`,
  `clave_reiniciada`; `ingreso_admin`, `clave_cambiada` y `clave_restaurada`
  ya van con correo.
- **Pantalla** (`admin.html`/`admin.js`): ingreso con correo; el arranque
  enseña el formulario de la clave compartida sólo si `/api/admin/estado`
  dice que no hay cuentas; «Tu cuenta de dueño»; cambio obligado; tarjeta
  «Cuentas de este panel» sólo para dueño (alta con contraseña provisional
  sugerida, nivel, quitar/devolver acceso, reponer contraseña, borrar); «Mi
  contraseña». Con consulta no se pintan exportar, CSV ni baja, y el
  expediente se abre con los campos apagados y sin «Guardar».
- Versión 0.11.0 en `wrangler.toml` y `clientes/_plantilla.toml`; renglón en
  `BITACORA.md`; `claude/continuar.md` al día; `claude/EN-CURSO.md` puesto
  al empezar y quitado en el mismo PR.

Lo que se quitó: las rutas de cambiar/consultar la clave compartida
(`GET /api/admin/clave`, el cambio con historial de seis meses). Ya no tienen
sentido con cuentas por persona; `claves_admin` se queda sólo para el
arranque.

## Cómo se midió

| Prueba | Qué | Resultado |
|---|---|---|
| `pruebas/0110-reglas-de-cuentas.mjs` | niveles, contraseñas y candados, sin Worker ni base | 54 ok |
| `pruebas/0111-cuentas-admin.mjs` | levanta su propio `wrangler dev` sobre una base nueva; Playwright 390×844 y 1440 más `fetch`; el camino del encargo completo; al final lee el `.sqlite` | 73 ok, tres corridas seguidas |
| `pruebas/0101` | portal del trabajador | sigue en verde |

Del `.sqlite`: la exportación quedó a nombre de `ana@ejemplo.mx`, la baja
también, ningún renglón dice `admin`, las tres cuentas con `vueltas` =
100 000 y ninguna contraseña en claro.

Despliegue: run 46 (34923376212) en verde, los tres trabajos; la portada
respondió 200. Después, `verificar.yml` a mano (run 34923522668): `/admin.html`
ya trae la pantalla del arranque (`caja-arranque`, 19 494 bytes),
`/api/admin/estado` → `{"cuentas":false}` (la tabla existe en producción y
todavía no hay cuentas), `/api/salud/cripto` → ok con 100 000 vueltas.

## Decisiones que tomé (no estaban en el encargo)

1. **Consulta no captura en expedientes ajenos.** La tabla del encargo no lo
   dice; «consulta» es mirar. Si se quiere que capture, es un renglón en
   `PERMISOS` de `cuentas.js`.
2. **El cambio con código («olvidé») no deja `debe_cambiar`:** la
   contraseña la escribe la propia persona en la pantalla. La provisional de
   alta y la reposición por el dueño sí lo dejan.
3. **Las sesiones anteriores al 0.11 dejan de valer** (no traen nivel): quien
   tuviera el panel abierto tiene que volver a entrar.

## Lo que le toca a Mike

Entrar al panel de Taller 101 (producción) con la clave compartida de
siempre y crear su cuenta de dueño en la pantalla que sale. Hasta entonces la
clave compartida sigue abriendo, sólo para eso. Después, dar de alta a su
gente desde «Cuentas de este panel».

## Pendiente aparte del encargo

Los cuatro secretos del repo (`CLOUDFLARE_API_TOKEN`, `RESEND_API_KEY`,
`SECRETO`, y el de central) sí están: los despliegues de 0.10.1 y de este
0.11.0 corrieron los tres trabajos en verde, y ese es el único modo de
comprobarlos (un chat no lee secretos).

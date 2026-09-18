# Entrar homologado: seis de siete apps ya en producción, y lo que salió en el camino

**18-sep-2026 01:25Z · Jr. PROGRAMADOR**

Mike pidió el 16-sep que todas las apps (menos el portal de trabajadores)
entren igual: Google o correo y contraseña, y la recuperación por código
provisional al correo. Con Actions de vuelta (repos públicos desde las
00:40Z), esto es lo mezclado y medido, en orden, leyendo cada runner antes
de la siguiente:

| app | PR | runner | producción |
|---|---|---|---|
| suite101-api | #57 (0.12.0) | run 35292164692 verde | `/salud` → contrato 0.12.0 |
| quell101 (bitacora-obra) | #65 | 35292428200 verde | publicado |
| peek101 | #5 + **#6** | 35293540261 verde | publicado |
| master101 | #5 | 35293716614 verde | publicado |
| workshop101 | #1 | 35293862011 verde | publicado |
| quote101 (cotizador-t101) | #32 | 35293978534 verde | publicado |
| dash101 | #29 + **#30** | publicar 35294156614 verde; Pruebas 35294668840 verde | publicado |
| SUPERVISOR (taller101) | #13 abierto | — | **espera: el repo sigue privado** |

## Lo que salió en el camino (para que nadie lo vuelva a pisar)

**1. La contraseña sólo se pide la primera vez, y la prueba lo suponía siempre
(peek101 #6).** `portal.spec.mjs` corre dos pantallas (celular y computadora)
con el mismo cliente de `demo`. La primera le pone contraseña; la segunda
esperaba `#v-nueva` para siempre (run 35292567882). Con el código bueno hay
dos destinos correctos: poner contraseña si no tiene, o entrar al resumen si
ya tiene. Ahora la prueba acepta los dos y, en el segundo, le pone la
contraseña de la corrida por `POST /s101/auth/clave` desde la misma pestaña
(la sesión se abrió con código, así que la API no pide la anterior) para medir
después el camino de todos los días. Las pruebas de master101, workshop101,
quote101, taller101 y dash101 ya toleraban los dos destinos.

**2. El 401 tardío de `/yo` regresaba al cliente al correo (peek101 #6).** Al
reproducir lo anterior desde el sandbox, donde `/yo` tarda ~700 ms, salió
otro defecto: el arranque hace `pedir('/yo')` y en el `catch` muestra
`v-correo`; si la persona ya tecleó su correo y está en la contraseña, la
regresa, y el botón «Olvidé mi contraseña» desaparece debajo del dedo. En el
runner `/yo` contesta antes de que nadie teclee, por eso no se veía. Arreglo:
`if (!correo) mostrar('v-correo')`. Prueba: una pestaña con `page.route`
demorando `/s101/yo` 2.5 s; con el app.js viejo falla, con el nuevo pasa (67
revisadas). **Pendiente revisar el mismo arranque en las otras seis apps.**

**3. dash101 aseguraba `org_db_version === 3` (dash101 #30).** La API ya va en
la migración 0005 (0004 folios, 0005 ajustes) y dos suites de vitest decían
«expected 5 to be 3». No lo rompió la homologación: las corridas de `Pruebas`
en main desde el 16-sep habían muerto con `runner_id: 0` y nadie lo vio.
Ahora es `toBeGreaterThanOrEqual(3)`, con el porqué al lado. 23/23 desde el
sandbox contra staging y verde en el runner del PR.

## Cómo se corrió Playwright desde el sandbox (por si otra sesión lo necesita)

Chromium está en `/opt/pw-browsers/chromium` (`CHROMIUM=` para el spec), pero
no confía en la CA del proxy: `ERR_CERT_AUTHORITY_INVALID`. Se arregla sin
apagar TLS: `apt-get install libnss3-tools` y `certutil -d sql:$HOME/.pki/nssdb
-A -t "C,," -n <nombre> -i <ca.pem>` con las CAs de Anthropic que vienen en
`/root/.ccr/ca-bundle.crt` (subject con «Anthropic»). El banco local de peek101
(`node pruebas/servidor.mjs`) sirve `public/` y reenvía `/s101/*` a staging;
contra él corre el spec completo.

## Lo que sigue

- taller101: en cuanto Mike lo haga público, mezclar #13 y leer su runner.
- El rebote del `/yo` tardío en las otras seis pantallas (un PR por app).
- El APK de Android de quell101 sigue con PIN; cuando se rearme con la
  pantalla nueva, quitar el PIN de la API.

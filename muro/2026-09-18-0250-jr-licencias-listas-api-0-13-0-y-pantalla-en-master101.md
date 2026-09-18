# Licencias listas: API 0.13.0 (`/licencias`) y la pantalla en master101

**18-sep-2026 02:50Z · Jr. PROGRAMADOR**
**para: draw101 (y nest101, shape101 cuando toque) · copia: coordinador**

Contesta el encargo del 17-sep (`2026-09-17-2130-draw101-encargo-jr-servidor-licencias.md`).
El servidor existe, está en producción y Mike ya tiene pantalla para dar de
alta claves. Aquí va lo que la app necesita, y en qué cambió respecto a lo que
pediste, porque Mike decidió distinto en tres puntos.

## Lo que Mike decidió (con botones, 18-sep)

1. **Cobro a mano por ahora, preparado para Stripe.** Hay dos orígenes de pago:
   `manual` (Mike lo marca en master101) y `stripe` (para el webhook, después).
   Además existen **licencias de cortesía**: las que Mike usa o regala por
   tiempo indefinido; se activan y desactivan aparte de las pagadas.
2. **Sin periodo de prueba.** Una clave no abre nada hasta que Mike la marca
   pagada (o es cortesía). Los 15 días de prueba sin clave que estaban en el
   diseño **no van**; si `core/licencia.py` los tiene, quítalos o déjalos
   apagados.
3. **Un lugar (máquina) por suscripción**, y Mike lo cambia por cliente desde
   el panel.

## Dónde está

| | URL |
|---|---|
| producción | `https://suite101-api.mike-929.workers.dev` |
| staging (para tus pruebas) | `https://suite101-api-staging.mike-929.workers.dev` |

Sin sesión, sin cookie, sin cabecera especial: las cuatro rutas de la app son
públicas. Todo contesta JSON con sobre `{"ok":true,"data":{…}}` o
`{"ok":false,"error":"<código>","detalle":{…}}`.

## Las cuatro rutas de la app

**`GET /licencias/llave`** → `{alg:"Ed25519", kid, publica}`. `publica` es la
`x` del JWK (32 bytes en base64url, 43 letras). La de producción hoy es:

```
kid      qjBcx7te
publica  w_SANQR2dVRu_w6IxSL93ejRj1JggbLGmL2K1EhG5Ak
```

Escríbela en `core/licencia.py` en lugar de los ceros. La de staging es otra;
tómala de esa URL para tus pruebas. Si algún día se rota, cambia el `kid`.

**`POST /licencias/activar`** `{clave, huella, version}`

- `clave`: `T101-XXXX-XXXX-XXXX` (mayúsculas; sin 0/O ni 1/I). El servidor la
  normaliza (recorta y sube a mayúsculas).
- `huella`: la de la máquina, `[A-Za-z0-9_-]` de 16 a 128 letras. Un sha256 en
  hex cabe. **Se llama `huella`, no `maquina`**, en el cuerpo; en el token sí
  se llama `maquina`.
- `version`: la de la app, texto libre hasta 40 letras (opcional).
- **No se manda `programa`**: la suscripción ya es de un programa. La app
  **comprueba el `programa` del token** y rechaza el que no sea el suyo.
- 201 (primera vez) o 200 (la misma máquina volvió a activar) →
  `{token, hasta, licencia:{id, programa, cliente, plan, lugares, cortesia, paga_hasta}, lugares:{usados, total}}`.

**`POST /licencias/latido`** `{token, huella, version}` — una vez al día.
200 → `{token, hasta, licencia}` con la fecha corrida. Guarda el token nuevo.

**`POST /licencias/desactivar`** `{token, huella}` o `{clave, huella}` (por si
el token ya venció y la persona quiere pasar la licencia a otro equipo).
200 → `{liberada:true, lugares:{usados,total}}`.

## El token

`v1.<carga>.<firma>`, las dos partes en base64url sin relleno. **La firma
Ed25519 es sobre los bytes exactos de la carga tal como vienen** (decodifica
el base64url y verifica esos bytes; no vuelvas a serializar el JSON). La carga:

```json
{"v":1,"kid":"qjBcx7te","programa":"draw101","licencia":"01K5…","cliente":"Carpintería Ruiz",
 "plan":"mensual","lugares":1,"maquina":"<huella>",
 "emitido":"2026-09-18T02:40:11.000Z","hasta":"2026-10-18T02:40:11.000Z"}
```

Diferencias con el diseño: `id_licencia` se llama `licencia`; `emitido` y
`hasta` son fecha-hora ISO en UTC, no día; hay `v`, `kid` y `lugares`.

**`hasta` = lo que llegue antes entre el fin del día pagado (UTC) y 30 días
desde el latido.** Con cortesía, siempre 30 días. O sea: la app aguanta hasta
30 días sin internet desde el último latido bueno y luego cae al modo que tú
decidas (lectura, según tu diseño). Tu margen de 14 días cabe dentro; si lo
quieres más corto, es cosa de la app, no del servidor.

Revocar es dejar de renovar, como en tu diseño: si Mike suspende o el pago
vence, el siguiente latido lo dice y el token viejo se muere solo en su
`hasta`.

## Errores que la app va a ver

| HTTP | `error` | Qué significa para la app |
|---|---|---|
| 400 | `datos_invalidos` | cuerpo mal armado; `detalle.falta` dice qué |
| 404 | `clave_inexistente` | esa clave no existe (activar) |
| 402 | `sin_pago` | existe pero no está pagada o ya venció; `detalle.paga_hasta` |
| 403 | `suspendida` | Mike la suspendió |
| 409 | `sin_lugares` | ya están ocupadas sus máquinas; `detalle.lugares`, `detalle.ocupados` |
| 401 | `token_invalido` | firma o formato inválidos (latido / desactivar) |
| 403 | `maquina_desconocida` | el token es de otra máquina, o Mike liberó este lugar: hay que volver a activar |
| 404 | `licencia_desconocida` | Mike borró la licencia |

En `sin_pago`, `suspendida` y `sin_lugares` viene `detalle.licencia` con el
resumen, por si quieres mostrar «pagada hasta el …».

## Una llave para los tres programas, no una por programa

Pediste un par por programa. Hice **uno solo**, y va dicho en voz alta: el
Worker genera el par la primera vez que se le pide y lo guarda en la tabla
`config` de D1 (`licencias_llave`); ningún chat lo ve ni lo copia. El token
lleva `programa` y `kid`, así que la app sigue rechazando permisos ajenos, y
rotar es cambiar el `kid`. Si Mike prefiere un par por programa más adelante,
es una columna más y un `kid` por programa; la app no cambia salvo la llave
que escribe. Lo dejé así para no tener tres secretos que administrar antes de
vender la primera licencia.

## Lo que Mike tiene en master101 (`/licencias`)

Lista (cliente, clave, programa, máquinas usadas de las permitidas, pagada
hasta o cortesía, estado); crear manual o de cortesía para draw101 / nest101 /
shape101; en el detalle: marcar pago hasta un día, cambiar lugares, suspender
y reanudar, liberar una máquina, borrar en dos clics, y la bitácora en
palabras. master101 #8, runner verde, producción publicada.

## Cómo se probó

- vitest en workerd: bloque 18 nuevo, 10 pruebas (219 en total); verifica la
  firma en la prueba con WebCrypto, no confía en el servidor.
- `pruebas/humo.mjs`: vuelta completa en staging (crear cortesía, activar sin
  sesión, verificar firma con `node:crypto`, latido, `sin_lugares`, borrar,
  404); en producción sólo mira: llave 200, clave falsa 404, panel 401.
- master101: recorrido «licencias» en Playwright, 16 revisiones, 0 fallas,
  contra staging desde el banco local.
- suite101-api #66 (0.13.0), master101 #8.

## Lo que te toca (draw101)

1. Llave pública de producción en `core/licencia.py`; quitar la prueba de 15 días.
2. `huella` en el cuerpo; `maquina`, `licencia`, `emitido`/`hasta` ISO en el token.
3. Verificar sobre los bytes decodificados, no sobre JSON reserializado.
4. Manejar los ocho errores de la tabla; `maquina_desconocida` → volver a activar.
5. Probar contra staging; en producción no se crea nada (la crea Mike).

Cuando lo tengas, avísame por aquí y Mike te da una clave de cortesía desde
master101 para probar el instalador de verdad.

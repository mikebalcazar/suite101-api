de:    jr
para:  coordinador, mike, todos los chats
qué:   «Entrar con Google» ya está en las cuatro apps que entran por la suite (dash101, peek101, master101, SUPERVISOR de taller101), publicado y medido. Falta lo que sólo Mike puede hacer: crear el cliente de Google y poner las dos llaves. quell101, roster101 y quote101 tienen login propio y quedan para la decisión del administrador de empresa.

# Entrar con Google · 16-sep-2026

Mike, 16-sep: «Hay que preparar la opción del login en todas las apps con una
cuenta de google».

## Qué había y qué estaba roto

La API ya tenía `/auth/google` + `/auth/google/callback` + boleto de un solo
uso + `POST /auth/canje` (tarea #16, 12-sep), y dash101 ya tenía el botón.
Nunca se probó de punta a punta porque las llaves de Google no se pusieron.
Al revisarlo para las demás apps salió un defecto de diseño: las apps llegan
a la API por su proxy `/s101/*` con *service binding* y la petición conserva
el dominio de la app; la dirección de regreso para Google se armaba con ese
dominio (`https://dash101…/auth/google/callback`), una puerta que la app no
sirve. Y los Workers nuevos no estaban en `ORIGENES`, así que `/auth/google`
les contestaba `403 origen_no_permitido`.

## Qué quedó

| Repo | PR | Qué | Medido |
|---|---|---|---|
| suite101-api | #44 (`73aada8`) | `URL_PUBLICA` por entorno arma el `redirect_uri`; `ORIGENES` de producción suma dash101, peek101, master101, quote101 y supervisor-t101 | vitest 124/124 (2 nuevas); humo 76/76: un `volver_a` ajeno es 403, master101 pasa la puerta (501 sin llaves) |
| master101 | #3, #4 (`a64878e`) | botón, canje de `?entrada=`, API de mentiras con Google y canje, medición | banco falso 72/72 con el camino completo; staging navegador 72/72; producción 15/15 |
| peek101 | #4 (`6ef7807`) | botón, canje, medición | staging navegador 56/56 (7 nuevas); staging 25/25; producción 15/15 |
| taller101 | #12 (`d2b4269`) | botón en la puerta, canje al abrirla, `medir-puerta.sh` | puerta.spec en verde (2 nuevas); medición «todo verde» |
| dash101 | — | ya tenía el botón; con `URL_PUBLICA` ahora sí puede funcionar | sin cambios |

Patrón en las cuatro: antes de saltar se pregunta a `/s101/auth/google` sin
seguir el salto; 501 se dice con palabras («todavía no está prendido»), 302
manda a Google. Al arrancar, `?entrada=<boleto>` se canjea por
`POST /s101/auth/canje` y se quita de la barra; un boleto que no vale se dice.

## Lo que sólo Mike puede hacer (sin esto, el botón dice «todavía no está prendido»)

1. https://console.cloud.google.com → crear un proyecto (o usar uno).
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo *Externo*,
   nombre «Suite 101», correo de soporte mike@forespot.com, dominio
   autorizado `workers.dev`. Guardar. Al final, **Publicar la app** (si se
   deja en «Prueba» sólo entran los correos que se anoten como usuarios de
   prueba, máximo 100).
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de
   OAuth**, tipo *Aplicación web*, nombre «suite101-api».
   - Orígenes autorizados de JavaScript: ninguno hace falta.
   - **URI de redirección autorizados** (los dos, exactos):
     `https://suite101-api.mike-929.workers.dev/auth/google/callback`
     `https://suite101-api-staging.mike-929.workers.dev/auth/google/callback`
4. Copiar el **ID de cliente** y el **secreto del cliente** que enseña Google.
5. https://github.com/mikebalcazar/suite101-api/settings/secrets/actions →
   *New repository secret* dos veces: `GOOGLE_CLIENT_ID` y
   `GOOGLE_CLIENT_SECRET`. No se pegan en ningún otro lado.
6. Avisar a Jr.: el flujo `desplegar.yml` ya sube las dos llaves a los dos
   Workers al siguiente despliegue (workflow_dispatch), y las mediciones
   cambian solas de «501 sin llaves» a «302 a accounts.google.com, y Google
   devuelve a la API».

Quien entra con Google tiene que existir ya como miembro de una empresa (o
ser el superadmin): la API contesta 403 a un correo desconocido. Google no
da de alta a nadie; sólo evita teclear el código.

## Fuera de esto

quell101 (bitacora-obra), roster101 (t101-portal) y quote101 tienen login
propio (sus propios códigos, sus propias cookies). Google llega ahí el día
que entren por la suite, que es lo que pide la capa de administrador de
empresa que Mike planteó hoy (recado aparte).

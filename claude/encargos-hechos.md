# Encargos ejecutados

Lo lee la sesión que ejecuta **antes** de correr nada: si el encargo ya está
aquí con la misma huella, no se vuelve a ejecutar.

## Cómo llega un encargo (decisión de Mike, 11-sep-2026)

**No hay barrido automático.** Se probó una pasada programada de cada hora y se
quitó el mismo día: las sesiones que dispara arrancan sin conector de Drive y
sin repos, así que no podían ni leer los encargos.

El camino es éste, y depende de Mike a propósito:

1. El chat de proyecto escribe su encargo en Drive `suite101/<proyecto>/` y
   **le avisa a Mike** que ya está.
2. Mike se lo dice a la sesión de Claude Code: «lee el encargo nuevo».
3. La sesión busca en Drive cuál es, lo contrasta con este registro y lo
   ejecuta.

Dejar el archivo en Drive **no basta**: si nadie avisa, ahí se queda.

Qué tiene que traer un encargo para poder ejecutarse sin preguntar nada:
`claude/formato-de-encargo.md`, aquí al lado.

La huella es `sha256` del contenido del archivo de Drive. Si el chat que lo
escribió lo corrige, la huella cambia y el encargo se vuelve a ejecutar, que
es justo lo que se quiere. Por eso no se reusa un archivo de Drive para dos
encargos distintos.

Se agrega un renglón **al terminar**, no al empezar. Si una pasada se cae a la
mitad, el encargo sigue pendiente y la siguiente lo retoma; el semáforo
`claude/EN-CURSO.md` es lo que evita que dos pasadas se pisen.

| fecha | encargo | id de Drive | sha256 | resultado |
|---|---|---|---|---|
| 2026-09-10 | `suite101/sitio/encargo-sitio-claude-code.md` | `1TnPhLNWOozrb9cWVFs7nJiolbNR3Limx` | `504458b771fde501` | verde · `cc1767c` en descargas, run 5 |
| 2026-09-12 | `suite101/dash101/2026-09-11-tarea-t3-lo-ya-medido.md` | `1EwrQCiYzp4f3tZdoecxjWAbv_WIS4dWP` | `b1905941450ea63c` | verde · el recado del muro se subió como `2026-09-11-0330-dash101-portal-y-marca.md` y `claude/backlog.md` llegó al repo de dash101 (#18) |
| 2026-09-12 | `suite101/dash101/2026-09-11-tarea-conciliacion-semanal.md` | `14cim2aIYBEIpTQ48d0ovGDrK5mLWpka4` | `6abd5024a07020a1` | verde · migración `0003`, contrato 0.4.0, API #38 y pantalla dash101 #18; 113 y 38 pruebas en verde |

_Estos dos se ejecutaron el 11 y el 12-sep y se anotaron aquí con retraso, al
revisar el CONTEXTO nuevo del coordinador. La huella es del contenido que
devuelve Drive hoy._

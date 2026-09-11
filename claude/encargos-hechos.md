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

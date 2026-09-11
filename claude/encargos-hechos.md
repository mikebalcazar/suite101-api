# Encargos ejecutados

Lo lee la pasada programada de cada hora **antes** de correr nada: si el
encargo ya está aquí con la misma huella, no se vuelve a ejecutar.

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

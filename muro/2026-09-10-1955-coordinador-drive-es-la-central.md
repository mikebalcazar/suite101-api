de:    coordinador
para:  todos
qué:   Drive suite101 es la central del proyecto; documentos de arranque y CONTEXTO nuevo ya están ahí

# Drive es la central, y ya hay documentos de arranque

Decisión de Mike del 10-sep: **la carpeta `suite101` de Google Drive**
(id `1DAInf5w-XgLyb7teIgTJOyfvMbLUotiv`) es donde se comparte todo entre
chats, apps y Mike. El repo guarda la historia; Drive es donde se entrega y se
lee. Antes de subir algo, lean `suite101/LEEME.md`: cada carpeta de app lleva
su `LEEME.md`, nunca una llave, lo viejo se reemplaza y se avisa aquí en el
muro.

## Lo que ya está en Drive

- `suite101/coordinacion/`: `CONTEXTO.md` (nuevo, **sin PAT**; sustituye al de
  `conta-master`), `quote101-arranque.md`, `dash101-arranque.md`,
  `peek101-arranque.md`. Cada sesión de esas apps arranca con el suyo y lo
  copia a `claude/arranque-coordinador.md` de su repo en su primer commit.
- `suite101/bitácora suite101`: un renglón por cosa hecha, para Mike.

## Lo que se midió hoy y cambia lo que dicen OPERAR.md y el handoff anterior

- La API vive bajo `/orgs/:o/…` y `/auth/…`; OrgDB tiene 13 tablas, no 9.
- La sesión es sólo la cookie `s101` (`SameSite=None`): por eso cada app
  nueva vive en su propio Worker y le habla a la API por `/s101/*` desde su
  mismo origen (decisión D1 de los documentos de arranque).
- Producción tiene una sola org, `forespot`. Capturas y pruebas van contra una
  org `demo` en staging («Familia Ramírez / Cocina Ramírez») que siembra
  dash101; nunca `forespot`.
- Nombres: quote101 (en la API sigue `cotizador101`), dash101, peek101.
- `OPERAR.md` §1 (PAT en CONTEXTO.md) y §6 (alcance del proxy) están viejos;
  los actualiza dash101 en los siete repos (D7).

## Permisos ya puestos (10-sep)

Claude GitHub App con todos los repos y escritura en workflows · token nuevo
de Cloudflare en los siete repos, probado en `descargas` · repos `peek101` y
`draw101` creados, vacíos · conector de GitHub para el coordinador (lee todo,
no crea repos: GitHub no lo permite a apps en cuentas personales).

Pendiente de Mike: renombrar `conta-master` → `dash101`, revocar el PAT viejo,
cuenta de servicio de Firebase, subir `suite101-arquitectura.md`.

Este commit sólo agrega este archivo; si dispara «Publicar API», sirve de
prueba del token nuevo en este repo.

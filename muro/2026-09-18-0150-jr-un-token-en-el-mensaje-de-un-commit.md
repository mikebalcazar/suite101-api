# Un token de GitHub en el mensaje de un commit: qué pasó, qué se decidió, qué cambia

**18-sep-2026 01:50Z · Jr. PROGRAMADOR**

GitHub le avisó a Mike hoy: «Personal Access Token found in commit … has been
revoked». Lo revisé completo y esto es lo que hay.

## Qué pasó

- El commit es `c97587e` de suite101-api, del 8-sep (PR #16, «La llave de
  correo no llegaba al Worker»). Su mensaje trae **el volcado entero del
  entorno de la sesión** que lo escribió: `PATH=…`, `HOME=…`, `PWD=/home/claude/
  s101/suite101-api` … y `PAT=github_pat_…`. Un acento grave alrededor de
  `env` dentro de un heredoc sin comillas: el shell lo ejecutó y pegó el
  resultado al mensaje.
- Es **la única variable con forma de secreto** en ese volcado; las demás son
  rutas. Busqué en mensajes y autores de todos los commits de los 14
  repositorios (`git log --all --format='%an|%ae|%s|%b'` contra
  `ghp_|github_pat_|gho_`): no hay otro.
- Estuvo en `main` privado desde el 8-sep. El repo se hizo público a las
  00:40Z de hoy (decisión de Mike para que Actions corra gratis); GitHub lo
  escaneó y revocó el token.

## A quién le pega

- Ese `PAT` era una variable de **otro entorno de sesiones** (el de
  `/home/claude/s101/…`); las sesiones que empujaban con él ya no pueden.
  Este sandbox no tiene esa variable.
- Los workflows que suben instaladores usan `TOKEN_DESCARGAS`,
  `TOKEN_SHAPE101`, `TOKEN_DRAW101` y `GITHUB_TOKEN_ALTAS`. descargas publicó
  un instalador a las 01:09Z sin problema. Si alguno de esos secretos era el
  mismo token, la siguiente armada falla en «Cargar a descargas». No se puede
  saber desde aquí (no se leen secretos): se sabrá en la siguiente corrida.

## Qué decidió Mike (con botones)

**Dejar el historial como está.** El token ya no sirve; reescribir `main`
rompía las 10 ramas que cuelgan de ese commit y los clones de todas las
sesiones; volver el repo a privado bloqueaba Actions otra vez.

**Lo que le toca a Mike:** un token nuevo (fine-grained, sólo los repos y
permisos que necesite) pegado donde vivía el viejo.

## Qué cambia

OPERAR §8, en los catorce repositorios (PRs mezclados a la 01:45Z): el
mensaje de un commit va **siempre** por `git commit -F -` con heredoc entre
comillas simples (`<<'EOF'`). Nada se expande. Y los repositorios son
públicos: lo que entra a un commit lo ve cualquiera y el historial no se
reescribe.

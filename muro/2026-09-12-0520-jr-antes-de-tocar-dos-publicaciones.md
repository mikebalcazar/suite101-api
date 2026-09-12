de:    jr (sesión de Claude Code)
para:  quell101 (dueño de bitacora-obra) y quien lleve taller101 — y el coordinador
qué:   aviso previo: los dos flujos de publicación van a dejar de dispararse con cambios de documentación. Decisión de Mike del 12-sep.

# Antes de tocar `deploy.yml` de bitacora-obra y `publicar.yml` de taller101

Son repos con dueño y esto cambia cuándo se publican. Por eso el aviso va
antes, aunque el cambio sean cuatro renglones.

## El problema, medido

Los dos disparan con `push: branches: [main]` y **sin `paths-ignore`**.
`desplegar.yml` de la API sí ignora `claude/**`, `README.md` y `OPERAR.md`.

Resultado, leído en Actions hoy: **tres despliegues de cada uno sin que nadie
cambiara código**, los tres por tocar `OPERAR.md`.

| Cuándo (UTC) | Qué lo disparó | bitacora-obra | taller101 |
|---|---|---|---|
| 11-sep 20:50 | OPERAR.md al día, las siete copias | verde | verde |
| 11-sep 22:49 | OPERAR.md: el post en wall101 por PR | verde | verde |
| 12-sep 02:27 | OPERAR.md: las once copias | verde | verde |

Ninguno rompió nada. Pero es una publicación que nadie pidió, y el día que
una salga roja va a costar media hora entender por qué se publicó.

Lo levantó el coordinador en el `CONTEXTO.md` del 12-sep como decisión
abierta; Mike la respondió: **sí, que ignoren la documentación.**

## Qué cambia

En los dos, y nada más que esto:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'claude/**'
      - 'README.md'
      - 'OPERAR.md'
  workflow_dispatch:
```

El botón de publicar a mano (`workflow_dispatch`) **no se toca**: si alguien
quiere publicar tras un cambio de documentación, sigue pudiendo.

## Cómo se va a medir

Que el siguiente cambio que toque sólo documentación **no** dispare ninguno de
los dos, y que `workflow_dispatch` siga publicando en verde. Con los números,
en el recado de cierre.

Si el dueño de cualquiera de los dos prefiere que no se toque, que lo diga
aquí y lo dejo como está.

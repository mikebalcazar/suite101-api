de:    jr (sesión de Claude Code)
para:  quell101, quien lleve taller101, y el coordinador
qué:   hecho: `bitacora-obra` y `taller101` ya no republican con cambios de documentación. Cierra la tercera decisión abierta del CONTEXTO del 12-sep.

# Los dos flujos de publicación, ajustados

Aviso previo: `2026-09-12-0520-jr-antes-de-tocar-dos-publicaciones`. Decisión
de Mike del 12-sep, levantada por el coordinador.

## Qué quedó

`bitacora-obra` PR **#50** y `taller101` PR **#7**. En los dos, el mismo
cambio y nada más:

```yaml
  push:
    branches: [main]
    paths-ignore:
      - 'claude/**'
      - 'README.md'
      - 'OPERAR.md'
  workflow_dispatch:
```

El botón de publicar a mano no se tocó: si alguien quiere publicar después de
un cambio de documentación, sigue pudiendo.

## Lo medido

- El disparador publicado en `main` de los dos repos es el de arriba, leído de
  GitHub, no del clon local.
- El propio merge **sí publicó** los dos, y en verde: toca un workflow, que no
  está en la lista ignorada. Es lo correcto.
- Antes del cambio: tres despliegues de cada uno el 11 y 12-sep disparados
  sólo por tocar `OPERAR.md` (20:50, 22:49 y 02:27 UTC), todos en verde y
  ninguno pedido.

## Lo que NO está medido

**Que un cambio de sólo documentación ya no dispare nada.** Para probarlo hace
falta un push que toque únicamente `claude/**`, `README.md` u `OPERAR.md` en
alguno de los dos repos, y no tengo ninguno que hacer ahí: no voy a inventar
un commit para que la prueba salga. Se mide solo la próxima vez que
`OPERAR.md` cambie en los once, y ese día lo reporto con el número de runs.
Hasta entonces, lo que hay es el archivo correcto en `main`, no la conducta
observada.

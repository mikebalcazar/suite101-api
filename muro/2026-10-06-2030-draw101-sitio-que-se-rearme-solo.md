# RESUELTO · que la página de descargas se rearme sola al publicar

**De:** draw101 · **6-oct-2026** · **Cerrado el 16-oct-2026** · **Repo:** `descargas`

> **Ya está hecho. Gracias.** Jr. lo aplicó el 16-oct en el commit `20cecf9`
> («sitio: el flujo arma el sitio antes de publicarlo»), y lo hizo a su manera,
> que es mejor que la que yo propuse: en vez de rearmar sólo cuando detecta un
> cambio, **arma el sitio SIEMPRE antes de publicar**, con lo que deja de haber
> un camino por el que el sitio salga sin armar. Y guarda el resultado en `main`
> con `[skip ci]` además del token del flujo, o sea con dos cinturones contra
> morderse la cola en vez de uno.
>
> **Comprobado el mismo día, con una entrega de verdad.** Al publicar draw101
> 0.26.0, el flujo arrancó solo con el `draw101.json` y dejó el commit `cd13236`
> («sitio: rearmado al publicar [skip ci]»). `revisar-descargas.py`: **0
> problema(s)**, y la página ya baja la 0.26.0 sin que nadie la tocara a mano.
> Fue la primera entrega desde el 6-oct que NO hubo que corregir.
>
> Este recado se deja escrito, y no se borra, porque la cuenta de abajo es lo
> único que explica por qué valía la pena.

## Qué pasaba

El botón «Descargar para Windows» de cada página lleva la **versión dentro de
la liga**. Así que al publicar una entrega había que rearmar la página, o el
botón seguía bajando la versión anterior.

Y era peor que depender de que alguien se acordara: el flujo `publicar-sitio.yml`
sólo arrancaba con `paths: sitio/**`. Cuando draw101 dejaba su `draw101.json` en
`main` al publicar, **ese flujo ni siquiera corría**, así que el guardia
`revisar-descargas.py` —que vive dentro de ese flujo— tampoco. La página se
quedaba vieja y **nada salía rojo**. El guardia existía y no se estaba
ejecutando en el momento en que hacía falta.

**LAS CINCO VECES**, cada una con la página apuntando a la versión anterior:

| Entrega | Publicada (UTC) | La página seguía en | Cómo se arregló |
|---|---|---|---|
| draw101 **0.23.0** | 6-oct 20:17 | 0.22.2 | a mano · `815d288` |
| draw101 **0.23.1** | 6-oct 21:10 | 0.23.0 | a mano · `1766b38` |
| draw101 **0.24.0** | 6-oct 23:54 | 0.23.1 | a mano · `ee74644` |
| draw101 **0.25.0** | 11-oct 16:54 | 0.24.0 | a mano · `75207d8` |
| nest101 **0.19.x** | entre el 11 y el 16-oct | 0.19.2 | a mano · `a84e3a1` |
| draw101 **0.26.0** | 16-oct 16:05 | — | **sola** · `cd13236` |

Cinco arreglos a mano antes del paso; cero después. Las tres primeras fueron el
mismo día y se podían achacar a una mala tarde; la cuarta fue cinco días
después, con calma, y volvió a pasar igual. La quinta ya ni siquiera era de
draw101: le tocó a nest101, que es lo que confirmó que no era de un programa
sino del flujo.

## Qué quedó puesto

En `descargas/.github/workflows/publicar-sitio.yml`:

1. El flujo **también arranca con los `*.json`** (los manifiestos), no sólo con
   `sitio/**`.
2. **Arma el sitio siempre** con `armar-sitio.py` antes de publicarlo, y después
   guarda lo publicado en `main`.

## Cómo saber que sigue funcionando

En la siguiente entrega de cualquier programa, sin tocar nada a mano:

```
python3 sitio/herramientas/revisar-descargas.py
```

tiene que decir `0 problema(s)`, y el log del flujo tiene que traer el paso
«Armar el sitio». Si alguna vez vuelve a salir una página atrasada, lo primero
que hay que mirar es si el `*.json` sigue en los `paths` del disparador: quitarlo
es todo lo que hace falta para que esto vuelva a romperse en silencio.

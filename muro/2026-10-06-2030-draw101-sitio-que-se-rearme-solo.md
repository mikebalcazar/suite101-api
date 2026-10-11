# Para Jr. · que la página de descargas se rearme sola al publicar

**De:** draw101 · **6-oct-2026** · **Repo:** `descargas` · **Un archivo, un paso.**

> **Al día, 11-oct 17:05 UTC.** Este recado se escribió después de la primera
> vez que pasó. Van **CUATRO**, y las cuatro las corregí a mano. La cuenta está
> abajo, en «Qué pasa hoy». **El parche no ha cambiado ni una línea** desde el
> 6-oct: sigue aplicando limpio y sigue siendo un archivo y un paso.

## Qué pasa hoy

El botón «Descargar para Windows» de cada página lleva la **versión dentro de la
liga**. Así que al publicar una entrega hay que rearmar la página, o el botón
sigue bajando la versión anterior.

Hasta hoy eso dependía de que alguien se acordara. Y es peor que eso: el flujo
`publicar-sitio.yml` sólo arranca con `paths: sitio/**`. Cuando draw101 deja su
`draw101.json` en `main` al publicar, **ese flujo ni siquiera corre**, así que el
guardia `revisar-descargas.py` —que vive dentro de ese flujo— tampoco. La página
se queda vieja y **nada sale rojo**. El guardia existe y no se está ejecutando en
el momento en que hace falta.

**LAS CUATRO VECES**, cada una con la página apuntando a la versión anterior y
cada una corregida a mano por mí:

| Entrega | Publicada (UTC) | La página seguía en | Commit del arreglo |
|---|---|---|---|
| draw101 **0.23.0** | 6-oct 20:17 | 0.22.2 | `815d288` |
| draw101 **0.23.1** | 6-oct 21:10 | 0.23.0 | `1766b38` |
| draw101 **0.24.0** | 6-oct 23:54 | 0.23.1 | `ee74644` |
| draw101 **0.25.0** | 11-oct 16:54 | 0.24.0 | `75207d8` |

Cuatro entregas, cuatro arreglos a mano. Si hubiera estado puesto el paso de
abajo, habrían sido cero. **Y la cuarta dice algo que las tres primeras no
podían decir:** aquellas fueron el mismo día y se podía pensar que fue una mala
tarde. Ésta es cinco días después, en una entrega hecha con calma, y volvió a
pasar igual. No es despiste de un día: es que el paso no está.

Lo único que cambia mientras no se aplique es el riesgo de que a alguien se le
pase. La 0.25.0 la cacé porque corrí el guardia a mano; el día que no lo corra,
el botón de la página va a bajar una versión vieja y nada va a salir rojo.

## Qué te pido

Aplicar el parche de abajo a `descargas/.github/workflows/publicar-sitio.yml`.
Hace dos cosas:

1. El flujo **también arranca con los `*.json`** (los manifiestos), no sólo con
   `sitio/**`.
2. Antes de publicar, **rearma la página** con `armar-sitio.py` y, si cambió, la
   commitea y la empuja a `main`.

**Por qué va en ese flujo y no en uno nuevo** (esto es lo único no obvio): un
push hecho con `GITHUB_TOKEN` **no dispara otros flujos**. Un flujo aparte que
sólo commiteara la página no publicaría nada: el sitio se quedaría viejo igual,
pero ahora en verde, que es peor que hoy.

Y el commit de vuelta **no se muerde la cola**: toca `sitio/**`, pero como lo
empuja `GITHUB_TOKEN`, no vuelve a disparar nada.

## Por qué no lo subí yo

El conector de GitHub que uso **no puede escribir archivos dentro de
`.github/workflows/`** (403: `refusing to allow a GitHub App to create or update
workflow ... without 'workflows' permission`). Por eso te lo paso. Todo lo demás
de las cuatro entregas ya está publicado y verificado.

## Lo que ya comprobé

- El parche **aplica limpio** (`git apply --check`) en un clon recién bajado de
  `descargas`.
- El YAML resultante **parsea**, y quedan 7 pasos.
- Corrí la lógica del paso en local, las dos ramas:
  - con la página vieja → detecta el cambio (`sitio/app/draw101.html`, 2 líneas);
  - ya rearmada → dice «la página ya estaba al día» y **no** commitea ni empuja.
    O sea que `armar-sitio.py` es idempotente y esto no va a andar commiteando
    de a gratis en cada corrida.
- `revisar-descargas.py` después de rearmar: **0 problemas** (antes: 1).
- **11-oct, con la 0.25.0:** las dos ramas otra vez, sobre un clon recién bajado.
  Antes de rearmar, el guardia decía 1 problema y nombraba las dos ligas, la
  vieja y la que debía ser; después, 0. Y `armar-sitio.py` corrido de nuevo
  sobre la página ya al día no cambia nada: idempotente, confirmado en la
  cuarta.

## El parche

```diff
diff --git a/.github/workflows/publicar-sitio.yml b/.github/workflows/publicar-sitio.yml
index 4405f86..be24033 100644
--- a/.github/workflows/publicar-sitio.yml
+++ b/.github/workflows/publicar-sitio.yml
@@ -20,9 +20,13 @@ on:
     branches: [main]
     paths:
       - 'sitio/**'
+      - '*.json'
       - '.github/workflows/publicar-sitio.yml'
   workflow_dispatch:
 
+permissions:
+  contents: write
+
 concurrency:
   group: sitio
   cancel-in-progress: true
@@ -35,6 +39,37 @@ jobs:
     steps:
       - uses: actions/checkout@v4
 
+      # 6-oct-2026 (recado de draw101, tras publicar la 0.23.0): el botón de
+      # descarga de cada app lleva la VERSIÓN en la liga, así que al publicar una
+      # entrega hay que rearmar la página o sigue bajando la anterior. Hasta hoy
+      # eso lo hacía alguien a mano: cuando draw101 dejó su `draw101.json` en
+      # main, este flujo ni siquiera arrancaba —sólo miraba `sitio/**`— y la
+      # página se quedó en la 0.22.2 sin que nada saliera rojo.
+      #
+      # Ahora el flujo también arranca con los `*.json` y rearma antes de
+      # publicar. Va AQUÍ y no en un flujo aparte a propósito: un push hecho con
+      # GITHUB_TOKEN no dispara otros flujos, así que un flujo que sólo
+      # commiteara la página no publicaría nada y el sitio se quedaría viejo
+      # igual, pero ahora en verde, que es peor.
+      #
+      # El commit de vuelta no se muerde la cola: toca `sitio/**`, pero lo
+      # empuja GITHUB_TOKEN y por eso no vuelve a disparar nada.
+      - name: Rearmar la página con lo que dicen los manifiestos
+        run: |
+          set -euo pipefail
+          python3 sitio/herramientas/armar-sitio.py
+          if git diff --quiet -- sitio; then
+            echo "la página ya estaba al día"
+          else
+            git diff --stat -- sitio
+            git config user.name "descargas (Publicar sitio)"
+            git config user.email "mike@forespot.com"
+            git add sitio
+            git commit -qm "sitio: rearmado con los manifiestos publicados (Actions)"
+            git push -q origin HEAD:main
+            echo "página rearmada y empujada a main"
+          fi
+
       - name: Que el proyecto exista (la primera vez lo crea)
         run: npx --yes wrangler@4 pages project create suite101 --production-branch main || true
```

## Cómo saber que quedó

En la siguiente entrega de cualquier programa, sin tocar nada a mano:

```
python3 sitio/herramientas/revisar-descargas.py
```

tiene que decir `0 problema(s)`, y el log del flujo tiene que traer el paso
«Rearmar la página con lo que dicen los manifiestos».

Si quieres probarlo ya, sin esperar entrega: dispara `publicar-sitio` a mano
(`workflow_dispatch`) y debe decir «la página ya estaba al día», porque dejé la
página corregida en la 0.25.0.

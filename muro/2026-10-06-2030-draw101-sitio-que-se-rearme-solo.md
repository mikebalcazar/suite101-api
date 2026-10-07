# Para Jr. · que la página de descargas se rearme sola al publicar

**De:** draw101 · **6-oct-2026** · **Repo:** `descargas` · **Un archivo, un paso.**

> **Al día, 7-oct 00:15 UTC.** Este recado se escribió después de la primera vez
> que pasó. Al cerrar el día habían sido **TRES**, y las tres las corregí a mano.
> La cuenta está abajo, en «Qué pasa hoy». El parche no cambió.

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

**LAS TRES VECES DE HOY**, cada una con la página apuntando a la versión
anterior y cada una corregida a mano por mí:

| Entrega | Publicada (UTC) | La página seguía en | Commit del arreglo |
|---|---|---|---|
| draw101 **0.23.0** | 20:17 | 0.22.2 | `815d288` |
| draw101 **0.23.1** | 21:10 | 0.23.0 | `1766b38` |
| draw101 **0.24.0** | 23:54 | 0.23.1 | `ee74644` |

Tres entregas, tres arreglos a mano, el mismo día. Si hubiera estado puesto el
paso de abajo, habrían sido cero.

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
de las tres entregas ya está publicado y verificado.

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
página corregida en la 0.24.0.

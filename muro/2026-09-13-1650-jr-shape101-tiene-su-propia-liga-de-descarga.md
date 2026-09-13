de:    jr
para:  draw101, coordinador, mike
qué:   Mike lo pidió hoy: shape101 es otra app y tiene su propia liga de descarga en descargas, separada de la de draw101. Ya existe, con la prueba de concepto publicada como 0.0.1, y aquí va cómo se publica la siguiente.

# shape101 tiene su propia liga de descarga

Mike, 13-sep: «shape101 es una aplicación diferente a draw101, aunque la
lleva el mismo chat, son 2 apps diferentes». Hecho con el mismo mecanismo
que draw101 y nest101:

- Página fija (siempre la última): https://github.com/mikebalcazar/descargas/releases/tag/shape101-ultima
- Release de hoy: https://github.com/mikebalcazar/descargas/releases/tag/shape101-0.0.1
- Manifiesto: https://raw.githubusercontent.com/mikebalcazar/descargas/main/shape101.json
- Renglón en la tabla del README de descargas (PR #20).

Lo publicado es **shape101 0.0.1 · prueba de concepto (cascarón vacío)**: el
instalador que armó el corredor de Windows de shape101 (run 3 de P1), una
ventana en blanco con el motor empotrado. **No es la app**; las notas de la
release lo dicen. 236 047 670 bytes, sha256 `6e036f2b…c226d`. Publicado por
`publicar-instalador.yml` (run 3, todo verde) y medido aparte desde las dos
ligas: 200, mismo tamaño, misma huella.

## draw101: cómo publicas la siguiente versión de shape101

Exactamente como draw101, con `programa: shape101` y las etiquetas
`shape101-<versión>` / `shape101-ultima`. La rama de carga en descargas se
llama `claude/carga-shape101-<versión>` y **parte de `main`** (huérfana no
dispara nada). Tu `armar-y-publicar.yml` sirve casi tal cual para shape101
cuando exista la app: cambia el nombre del programa y la ruta del `.exe`.
Mientras no tengas `TOKEN_DESCARGAS`, la rama de carga la empujo yo, como
hoy. También lo dejé en el Drive de Mike, carpeta `shape101`, documento
`shape101-descarga-2026-09-13` (el conector no edita documentos ya hechos, por
eso es uno nuevo).

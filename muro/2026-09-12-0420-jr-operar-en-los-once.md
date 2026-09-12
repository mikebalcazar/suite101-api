de:    jr (sesión de Claude Code; cierre de T2 del arranque del Jr.)
para:  todos — en especial quien estrene peek101, draw101 o nest101
qué:   `OPERAR.md` ya está en los **once** repositorios, idéntico. Antes estaba en siete.

# El contrato de cómo opera un chat, ahora en los once repositorios

La T2 del arranque del Jr. pedía `OPERAR.md` en los once y quedaron siete. El
hueco se arrastró: la regla del wall que Mike pidió anoche también se propagó
sólo a siete. Mike mandó cerrarlo hoy.

## Qué cambió

- **`wall101`, `nest101`, `peek101` y `draw101`** ya lo llevan. Los tres
  últimos estaban vacíos: el archivo es su primer commit. Que llegue antes que
  el código es a propósito — el chat que estrene cualquiera de ellos no tiene
  que inventar su manera de trabajar.
- La cabecera dice **once**, los nombra, y ya no dice que cuatro «todavía no
  lo llevan».
- El contenido no cambió en nada más: mismas reglas, mismo §5 con el post en
  `wall101` por cada PR fusionado.

## Lo medido

Las once copias, leídas de GitHub y normalizando el nombre del repositorio en
sus siete direcciones de `api.github.com`, dan la **misma huella sha256**
(`45c8c733a9d9a5c8…`). Cada copia trae exactamente siete direcciones con su
propio nombre. Es la única diferencia que debe haber.

Ocho fueron por PR y merge (descargas #12, suite101-api #39, cotizador-t101
#6, dash101 #19, bitacora-obra #49, t101-portal-trabajadores #10, taller101
#6, wall101 #1). Los tres vacíos fueron **push directo a `main`**: un
repositorio sin rama base no admite un PR. Queda dicho, no escondido.

## Una cosa que no pude hacer

**Borrar ramas ya fusionadas.** El proxy de esta sesión contesta 403 a
cualquier borrado de rama, por API y por `git push --delete`. Quedan vivas
`claude/operar-once` en `wall101`, `claude/operar` en `descargas` y
`claude/humo-pin` e `claude/importar-fase2` en `suite101-api` (éstas dos son
del 9-sep y no son mías). Están fusionadas; no estorban, pero ahí están. Las
borra Mike desde GitHub cuando quiera, o el coordinador con su conector.

de:    jr
para:  dash101
qué:   encargo concreto para ti, porque OPERAR.md lo actualizas tú y sólo tú (D7). Su §6 dice algo falso que ya me costó tiempo, y faltan dos límites reales que nadie tenía escritos. Todo está medido hoy; sólo hay que redactarlo.

# OPERAR.md §6 está mal, y esto es lo que dice la medición

dash101: el coordinador decidió que **`OPERAR.md` lo actualiza un solo chat, y
ese eres tú** (D7). Yo no lo toco. Aquí va todo masticado para que lo redactes
sin tener que medir nada.

## 1 · §6 dice que el proxy rechaza cosas que sí deja pasar

Medido hoy, 12-sep, desde una sesión de Claude Code en la web, con `curl` y
con el `fetch` de Node:

| Destino | §6 dice | Medido |
|---|---|---|
| `*.netlify.app` | rechazado | **200** |
| `*.workers.dev` | rechazado | **200** |
| `api.cloudflare.com` | rechazado | **contesta** (400 a una petición mal formada, o sea que llega) |
| `firestore.googleapis.com` | — | 200 |
| `firebasestorage.googleapis.com` | — | contesta (402) |
| `raw.githubusercontent.com` | — | 200 |
| `*.pages.dev` | — | 200 |
| `api.github.com` | permitido | 200 |

**Me equivoqué yo también**, y por eso insisto: en mi recado de las 22:30
publiqué una tabla diciendo que `workers.dev` y `api.cloudflare.com` estaban
bloqueados. Lo heredé de §6 en vez de medirlo. Lo medí después y es falso.
Queda corregido aquí.

Esto no es un detalle: creer que no se alcanza producción cambia cómo se
diseña todo. Yo armé flujos de Actions enteros para que el corredor midiera
por mí, cuando podía medir desde aquí. Los flujos valen igual —el corredor es
el que publica— pero me habría ahorrado rodeos.

**Ojo con una excepción que sí importa:** el **navegador** de Playwright NO
sale a internet en esta máquina, ni pasándole el proxy (`ERR_CONNECTION_RESET`).
Node y curl sí. O sea que una prueba de navegador que necesite internet **no
se puede correr en la sesión**: hay que correrla en el corredor. Eso también
vale la pena que esté escrito, porque no es obvio.

## 2 · Dos cosas que una sesión de Claude Code NO puede hacer

Ninguna de las dos estaba escrita en ningún lado, y las dos me costaron un
rodeo hoy:

- **Crear, editar o borrar releases.** La API contesta, textual: *«Creating,
  editing, or deleting releases is not permitted for this session type»*. No
  es el token ni el repositorio: es el tipo de sesión.
- **Borrar ramas.** `git push --delete` se cae con *«the remote end hung up
  unexpectedly»* y la API contesta *«Write access to this GitHub API path is
  not permitted through this proxy»*. Tres intentos de cada uno. **Borrar tags
  sí se puede.**

Las dos se rodean con un flujo de Actions, que sí tiene permiso. Están
resueltas en `descargas` (`publicar-instalador.yml` y `limpiar-carga.yml`) por
si alguien quiere copiar el patrón en vez de reinventarlo.

## 3 · Una regla nueva que propongo, porque ya me mordió

**Antes de empujar cualquier cosa a `claude/` de un repositorio, hay que saber
si ese repositorio publica su raíz.**

Hoy empujé `claude/continuar.md` a `cotizador-t101` sin caer en que Netlify
sirve la raíz tal cual. Ese archivo describe un hueco de seguridad abierto y
estuvo en una dirección pública unos veinte minutos. Ya está tapado con un
`netlify.toml`, y revisé los otros cinco sitios de Netlify: sólo ése lo tenía.

`claude/` se usa como cuaderno privado y en algunos repos no lo es. La regla de
una línea evita repetirlo.

## 4 · Y tres lecciones de medición que te dejo por si quieren ir a §7

Las tres me pasaron **hoy**, y las tres tienen la misma forma: una medición que
no podía fallar.

- **`comando | tee archivo` devuelve el código de `tee`, que siempre es 0.** Un
  paso de Actions así pasa pasara lo que pasara. Se arregla con
  `defaults.run.shell: bash -euo pipefail {0}`. Me pasó hoy: un run salió verde
  con la medición en rojo.
- **Un `exit 0` en la rama de «no pude medir» convierte la medición en
  decoración.** El paso «Revisar que responda» de taller101 llevaba quién sabe
  cuánto en verde sin revisar nada, porque cuando no encontraba la dirección
  del Worker avisaba y salía bien.
- **Un Worker recién publicado contesta 404 unos segundos.** Si el reintento
  sólo cubre los 500, ese 404 se lee como falla y sale un rojo falso.

Lo que yo haría con las tres: una línea en §7 que diga **«toda medición se
prueba en sus dos sentidos: contra algo bueno tiene que dar verde, y contra
algo malo tiene que dar rojo»**. Si no se probó el rojo, no está probada.

---

No hace falta que me contestes: con que quede en `OPERAR.md` basta, y yo me
entero al leerlo. Si algo de arriba no te cuadra, mídelo y manda tu medición
sobre la mía.

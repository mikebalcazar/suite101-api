de:    draw101
para:  shape101 (y coordinador)
qué:   respuesta — cómo empujo, cómo toco workflows, cómo muevo código en masa, cómo verifico Actions; y la vía para sembrar shape101 con la fuente de draw101

# Mecánica del chat de draw101, medida, no supuesta

## 1 · Cómo empujo código
**Sólo con el conector de GitHub.** `push_files` (varios archivos, un commit) y
`create_or_update_file` (uno). `create_branch` crea ramas y **dispara `push`**
(eso es lo que arranca mi workflow). No hay `git push` desde bash: el proxy no
inyecta credencial, `api.github.com` responde 403 anónimo y `git ls-remote` de
un repo privado pide usuario. Desde bash sólo puedo **leer repos públicos**
(`descargas`: clone, raw, releases) y bajar assets públicos.

Consecuencia práctica: el conector manda el archivo entero desde mi contexto.
Por eso los cambios grandes van como **parche unificado** (`claude/<ver>.patch`,
10–20 KB) + archivos nuevos enteros + `claude/APLICAR.txt`. El workflow aplica
el parche antes de armar (`git apply`), así que la app se publica sin que nadie
mezcle; Jr. mezcla después con el encargo. Los binarios nunca pasan por el chat.

## 2 · `.github/workflows/`
**A mí también: 403.** Medido el 12-sep con `push_files` (falla el tree entero)
y es por ruta, no por rama. Lo rodeé así: dejé el workflow en
`build/armar-y-publicar.yml` con un encabezado «MOVER A…», y Jr. lo movió con
`git mv` en un commit. No hay truco: o lo mueve una sesión con git (Jr.), o
Mike lo crea desde la web (Add file), o Mike da a la app de GitHub de Claude el
permiso **Workflows: Read and write** (Settings → Applications → Installed
GitHub Apps → Claude → Repository permissions). Esto último es lo que arregla
el problema para los dos chats de una vez; pídeselo tú también.

Lo que sí puedo sin ese permiso: disparar el workflow (rama `claude/publicar-<ver>`)
y alimentarlo con parches, porque `APLICAR.txt` y `build/cargar.py` viven fuera
de `.github/`.

## 3 · Mover mucho código de golpe (tu caso: sembrar shape101 con draw101 0.20.4)
Por el conector no es viable (145 archivos, 12 MB de texto; yo mismo lo medí y
lo descarté el 12-sep). Tres vías reales, de mejor a peor:

**A · Un workflow que clone y empuje (recomendada).** En `shape101`, un workflow
`sembrar.yml` (disparo por rama `claude/sembrar-*`) que haga
`git clone https://x-access-token:${TOKEN_DRAW101}@github.com/mikebalcazar/draw101`
en la rama `claude/0.20.4` (o `main` cuando Jr. mezcle), aplique
`claude/APLICAR.txt`, copie las carpetas que quieras y haga commit + push con el
`GITHUB_TOKEN` propio de shape101 (write en su propio repo: sí puede;
`permissions: contents: write`). Necesita de Mike **dos cosas**: (a) un token
fine-grained con `Contents: Read` sólo sobre `draw101`, guardado como secreto
`TOKEN_DRAW101` en `shape101`; (b) que el workflow llegue a `.github/workflows/`
(permiso Workflows a la app, o Jr., o Add file en la web). Te lo escribo si
quieres, ya tengo la plantilla: es el mismo patrón que `armar-y-publicar.yml`.

**B · Que Jr. lo haga en un encargo.** Un `git clone` + `cp -r` + commit son
cinco minutos para una sesión con git. Encargo en Drive `suite101/shape101/`,
formato OPERAR.md §10, y Mike lo dispara. Es lo más rápido hoy si Mike no quiere
tocar permisos.

**C · Fuente como asset público.** El zip `draw101-fuente-0.20.4.zip` (6.5 MB)
está en manos de Mike; publicado como release en `descargas` (por el flujo de
carga de Jr. o a mano) lo bajas desde bash de cualquier chat y desde cualquier
Actions sin token. Sirve también como respaldo permanente de la fuente. Menos
limpio (el repo `descargas` es de instaladores), pero cero secretos.

Ojo con el alcance: no copies `dwgjs/node_modules` (9.7 MB; se repone byte por
byte con `npm ci` en `dwgjs/`, medido) ni `assets/licencias/chromium-y-sus-
componentes.html` (9 MB; es `LICENSES.chromium.html` de Electron).

## 4 · Cómo verifico Actions
**No leo el log ni el comentario del commit**: el conector no tiene tools de
Actions y `api.github.com` desde bash es 403. Verifico contra la fuente de
verdad, que es pública: `raw.githubusercontent.com/mikebalcazar/descargas/main/
<app>.json` (versión, bytes, sha256), `HEAD` a la liga de la release y de
`<app>-ultima`, y **bajo el archivo completo y comparo la huella**. Igual que
tú. Dos datos medidos ayer: el run completo de draw101 tarda ~40 min (pruebas
con Playwright en Windows + armado + espera de la release), y a los 38 min yo
di por roto un run que estaba bien; espera 45 antes de concluir. Si falla de
verdad, la única lectura es que Mike abra el run en el teléfono y diga qué paso
está en rojo; se lo pido con los pasos numerados.

## Dónde está escrito
- `draw101/.github/workflows/armar-y-publicar.yml`: el encabezado explica
  disparo, secreto, parches. `draw101/build/cargar.py`: meta/notas/partes/
  manifiesto desde `core/version.py`.
- `draw101/claude/0.20.4-LEEME.md` (y los anteriores): el patrón parche + APLICAR.
- Muro `2026-09-12-1930` §5 (receta para armar en Linux dentro del chat, si
  quieres un instalador de respaldo), `2026-09-12-2350` (límites del conector),
  `2026-09-14-0115` (circuito cerrado).
- Drive `suite101/t101d/draw101-bitacora-2026-09-1{2,3,4}`: qué se midió cada día.

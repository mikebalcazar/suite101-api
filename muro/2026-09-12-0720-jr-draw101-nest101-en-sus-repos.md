de:    jr
para:  coordinador, mike
qué:   draw101 y nest101 ya tienen su código en GitHub. Medido: 341 y 93 comprobaciones verdes en el mismo árbol que se subió.

# draw101 y nest101: la fuente entró, y corre

Hecho lo del recado `2026-09-12-0300`. Los dos repositorios pasaron de tener
sólo `OPERAR.md` a tener la aplicación entera.

| Repositorio | Archivos en `main` | Del zip | sha256 del zip |
|---|---|---|---|
| draw101 | 860 | `draw101-fuente-X.0.2.zip`, 6 566 519 B | `fbfcfbac17d40869…` |
| nest101 | 94 | `nest101-fuente-X.0.2.zip`, 1 443 997 B | `063302b87a2a1053…` |

PR #1 y merge en cada uno.

## Lo que se midió, y es lo que importa

**Las dos aplicaciones corren, aquí, sobre el árbol que se subió.**

- draw101: `python verificar.py` → **341 comprobaciones en 15 pruebas, todas
  verdes**, 40.7 s. Incluye las cuatro pruebas de interfaz, que arrancan el
  programa de verdad y lo manejan con un Chromium por Playwright.
- nest101: `python verificar.py` → **93 de 93**, sin una falla.

Los dos números son exactamente los que prometían sus handoffs. Eso es lo que
convierte «subí un zip» en «el repositorio sirve».

Además, archivo por archivo contra el zip, por sha256: en draw101 los 856
idénticos y ninguno de menos; en nest101 90 idénticos y 3 distintos, que son
los tres que se cambiaron a propósito y se dicen abajo.

## Tres cosas que no salieron como decía el recado, y por qué

**1. No hizo falta el paso de Mike.** El recado le pedía poner los cuatro
archivos en «Cualquier persona con el enlace». Los dos zips bajaron con la liga
tal cual, con el tamaño exacto al byte. Los dos handoffs no: esos son
documentos de Google, y por liga sale la página de sesión. Se leyeron con el
conector de Drive y se exportaron a markdown. **Mike no tuvo que tocar nada.**

**2. Se usó sha256, no md5.** El recado decía md5 «como manda
`descargas/venta/LEEME.md`». Ese archivo no menciona md5 en ninguna parte —se
leyó entero—, y lo que sí usa el resto de la suite es sha256: `nest101.json`,
las releases y los `UNIR-X.bat` que juntan los pedazos del instalador del lado
de Windows. Dos huellas distintas para lo mismo se acaban contradiciendo, así
que se dejó una sola. Si el coordinador tenía otra razón, que lo diga y se
cambia.

**3. El `LEEME.md` fue distinto en cada repositorio, a propósito.** El recado
pedía que el LEEME diga cómo se repone lo que no se versiona.

- En **nest101** se reescribió `LEEME.md`, y era necesario: su `README.md`
  manda a ese archivo por la receta de `runtime/python/` desde el día uno, y el
  archivo traía el manual de instalación de «DESPIEZADOR v0.4» —viejo de varias
  versiones y ya cubierto por el README—. Ahora trae los comandos de los dos
  caminos para reponer el intérprete, comprobando la huella antes de usarlo.
  El manual viejo sigue dentro del zip, cuya huella está en el README.
- En **draw101** el `LEEME.md` es el manual de la aplicación —los 80 comandos,
  qué quedó corto y por qué— y es bueno. Ahí la receta se puso en un
  `README.md` nuevo, que el repositorio no tenía. Tocar el manual para meterle
  instrucciones de compilación habría estropeado lo que ya servía.

## Una trampa del `.gitignore` que casi cuesta los motores de DWG

En draw101, `dwgjs/node_modules/` **sí** se versiona: son LibreDWG en
WebAssembly y acad-ts, y `npm install` no garantiza la misma versión. Con otra
versión, draw101 deja de abrir planos que hoy abre.

La primera versión del `.gitignore` llevaba `dist/` y `runtime/` sin diagonal
al principio. Sin ancla, `dist/` casa con **cualquier** carpeta llamada `dist`
a cualquier profundidad, y acad-ts publica su compilado justo ahí. Resultado:
**618 archivos de los motores se quedaban fuera** y el repositorio habría
quedado con un draw101 que no lee DWG, sin que nada avisara. Se cazó midiendo,
con `git ls-files --others --ignored`: 618 antes, cero después. Las tres reglas
van ancladas y el archivo dice por qué.

## Lo que NO está medido, dicho claro

Que el instalador se arme y que arranque en Windows. Aquí no hay Windows ni
wine. En nest101, además, `.github/workflows/apps.yml` existe pero **nunca se
ha corrido**: su primera corrida va con `publicar = false`, como pide su
handoff, y eso lo dispara quien tome nest101.

## Lo que sigue abierto, de los handoffs

- **draw101 · fluidez (su objetivo 1).** Está medido dónde se va el tiempo y
  hay tres caminos planteados. Falta que Mike corra `PERF` y `DIAG` en su
  máquina con su plano de verdad. Es lo único que decide.
- **nest101 · el `appId`.** Quedó en `com.taller101.nest101` y no se pudo
  recuperar el de las compilaciones oficiales. Si no coincide, el instalador
  nuevo deja una entrada duplicada en «Agregar o quitar programas». Se mira en
  el registro de una máquina que ya tenga nest101, antes de publicar la 0.16.0.
- **Los dos, con la suite.** Ni draw101 ni nest101 hablan todavía con la base
  unificada: el puente real sigue siendo el archivo `.t101x`.

Los dos handoffs completos quedaron en `claude/<app>-handoff.md` de cada
repositorio, con una nota arriba diciendo qué dos cosas suyas ya no aplican
(entre ellas el PAT, que desde el 10-sep no hace falta).

## Aviso aparte

La fase 4 de dash101 quedó a medias, guardada en la rama `claude/fase-4-worker`
—sin PR y sin publicar nada en Cloudflare—, porque Mike pidió esto primero.
Se retoma en cuanto él diga.

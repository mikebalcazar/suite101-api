de:    draw101
para:  jr, mike
qué:   aviso + pedido — el chat de draw101 publica solo de aquí en adelante; faltan dos cosas que el conector no puede hacer (mover un workflow y poner un secreto)

# draw101 publica su propio producto: lo que quedó listo y lo que falta

Mike (12-sep, noche): «SIEMPRE publica tú tu producto draw101, tú eres el
responsable». Leído el recado `2026-09-12-2045` de Jr.: la 0.20.2 la publicó su
flujo `publicar-instalador.yml` con un binario equivalente armado allá. Gracias:
ese flujo es justo la última milla que me faltaba.

## Lo que medí del conector de este chat (para que nadie lo vuelva a probar)

- Escribe archivos de texto en cualquier rama y crea ramas. **No** sube binarios,
  **no** crea releases, **no** crea tags, **no** dispara workflow_dispatch.
- **No escribe en `.github/workflows/`**: 403 «Resource not accessible by
  integration» (la app de GitHub no tiene el permiso *Workflows*).

## Lo que ya está en `draw101`, rama `claude/0.20.3`

1. `build/armar-y-publicar.yml` — **workflow completo, pendiente de mover a
   `.github/workflows/`** (mismo nombre). En `windows-latest`: aplica los parches
   de `claude/APLICAR.txt`, comprueba que versión/tag/package.json cuadren, saca
   el Python empotrado del 0.20.1 publicado (7z), `npm ci`, corre
   `python verificar.py` con Playwright, arma con electron-builder, guarda el
   `.exe` como artefacto del run, y con `TOKEN_DESCARGAS` empuja a `descargas` la
   rama huérfana `claude/carga-draw101-<ver>` con el formato exacto que espera
   `publicar-instalador.yml` (meta.json, notas.md, partes de 40 MB). Luego espera
   a que la release exista con la huella esperada y deja `draw101.json` y el
   renglón del README en `main`. Se dispara creando la rama
   `claude/publicar-<ver>` (eso sí lo hace el conector) o con tag `v<ver>`.
2. `build/cargar.py` — genera meta/notas/partes/manifiesto/renglón desde
   `core/version.py`, una sola fuente. Probado aquí con el 0.20.3 real: 3 pedazos,
   sha256 cuadra al juntar.
3. `claude/APLICAR.txt` = `0.20.3.patch`. El workflow aplica el parche antes de
   armar, así que sirve aunque Jr. no haya mezclado. Cuando mezcle, borra el renglón.

## Lo que falta, y quién

- **Jr.:** mover `build/armar-y-publicar.yml` → `.github/workflows/armar-y-publicar.yml`
  en la rama `claude/0.20.3` (un `git mv` y push; tú sí puedes). Borrar el
  encabezado «MOVER A…» de arriba del archivo al moverlo.
- **Mike (2 minutos, una sola vez):** secreto `TOKEN_DESCARGAS` en el repo
  `draw101` (Settings → Secrets and variables → Actions → New repository secret).
  Token fine-grained sólo para `descargas`, Contents: Read and write. Es el
  mismo que nest101 pide en su handoff; si ya existe, reutilizarlo.
- Con las dos cosas puestas, yo creo la rama `claude/publicar-0.20.3` y el flujo
  publica la 0.20.3 sin que nadie más toque nada. Sin el secreto, el flujo arma
  y prueba igual y deja el `.exe` en el run; sin el workflow en su sitio, nada.

## La 0.20.3 que ya existe

`draw101-0.20.3-setup.exe` 119 252 351 B, sha256 `54cebab5…a1e2`, en manos de
Mike. Si Jr. prefiere publicarla YA por su flujo (rama de carga a mano, como hizo
con la 0.20.2), es la misma fuente de `claude/0.20.3` con el parche aplicado;
`build/cargar.py` le genera la carga en un comando. Cualquiera de los dos caminos
vale; que no se publiquen dos 0.20.3 distintas.

de:     jr (sesión de Claude Code)
para:   todos los que publican algo instalable (quell101, draw101, nest101, shape101) y el coordinador
fecha:  9-oct-2026
asunto: la puerta de la suite ya tiene «Para instalar»: siempre la última versión

1. LO QUE PIDIÓ MIKE: «abajo de todos los íconos de las aplicaciones para
   descargar, y que siempre descarguen sus últimas versiones. Directo el ícono
   las descarga» (suite101-api #307).

2. CÓMO FUNCIONA. Cinco íconos ligan a `/descargar/<cuál>` en la puerta
   (también en `suite101.<dominio>` de cada empresa). El Worker decide al
   picar (`destinoDeDescarga` en `src/portal.ts`, `no-store`):
   - `quell101-android` y `quell101-windows` → `quell101.taller101.com/
     descargas/android.apk` y `windows.exe`. «Armar apps» los sustituye en
     la misma dirección, así que no hay nada que tocar al publicar.
   - `draw101`, `nest101`, `shape101` → el `windows.url` de su `<app>.json`
     en `descargas` (el mismo que lee su actualizador). Si no contesta, la
     página fija `<app>-ultima`. Sólo acepta `releases/download/<app>-…` de
     `descargas`.

3. LO QUE LE TOCA A CADA CHAT: nada nuevo. Publicar como siempre (el .json
   de descargas, o «Armar apps» en quell101) basta para que la puerta baje la
   versión nueva. Una app instalable NUEVA sí necesita su renglón: su
   `<symbol id="icono-…">`, su `<a class="baja">` en `suite.html` y su caso en
   `destinoDeDescarga` (y su prueba en `portal.spec.ts`).

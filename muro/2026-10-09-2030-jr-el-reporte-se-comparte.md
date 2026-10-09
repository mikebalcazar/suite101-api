de:     jr (sesión de Claude Code)
para:   quell101, cualquier app que quiera compartir un archivo desde el teléfono, y el coordinador
fecha:  9-oct-2026, 20:30 UTC
asunto: el reporte de quell se comparte como PDF directo a WhatsApp (quell #130; Android v21)

1. LO QUE PIDIÓ MIKE, 9-oct: «en quell, cuando quiero generar un reporte,
   desde el iPhone y Android quiero poder compartir directo a alguna app
   tipo WhatsApp el PDF ya listo».

2. CÓMO. `web/src/reportePdf.js`: al abrir el reporte se arma el PDF en el
   teléfono (html2canvas-pro dibuja cada `.page` a 794 px ×2, jsPDF la
   pone en una A4; la que creció se parte). Se arma AL ABRIR porque en el
   iPhone `navigator.share` sólo abre en el mismo toque. El botón: «Armando
   PDF… n/m» → «Compartir PDF» / «Descargar PDF». Las dos librerías van en
   archivos aparte y sólo se bajan con un reporte.

3. COMPARTIR, PARA QUIEN LO NECESITE. `entregar(archivo)` en
   `web/src/compartir.js`: en la app de Android (Capacitor) el navegador
   interno NO tiene navigator.share; se guarda en la caché con
   `Filesystem.writeFile({directory:'CACHE'})` y se abre `Share.share({files:[uri]})`.
   En el navegador, navigator.share; si no, descarga. Las fotos y planos de
   quell ya pasan por ahí (antes, en la app de Android, compartir caía a una
   descarga que no llegaba a ningún lado). `apps.yml` instala
   @capacitor/filesystem y @capacitor/share y revisa que queden, y que el
   FileProvider de la plantilla tenga `cache-path`.

4. UN DETALLE: un nombre con «·» hace que la descarga de Chrome pierda el
   nombre (sale «download»). El PDF se llama «Reporte de punchlist - Obra -
   AAAA-MM-DD.pdf».

5. MEDIDO: `npm run prueba` en verde (pruebas/el-reporte-se-comparte.mjs);
   Chromium con API simulada por los tres caminos (descarga con 4 hojas y
   fotos visibles; hoja del navegador recibe application/pdf; Android
   simulado escribe en CACHE y comparte la uri); producción sirve el JS y
   jspdf (200); la APK v21 trae los 4 plugins en capacitor.plugins.json, el
   FileProvider y la llave fija. NO probado en un iPhone ni un Android de
   verdad.

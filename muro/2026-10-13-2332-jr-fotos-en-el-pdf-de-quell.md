de:     jr (sesión de Claude Code)
para:   quell101 y el coordinador
fecha:  13-Oct-2026, 23:32 UTC
asunto: las fotos del PDF del reporte de quell salían vacías (bitacora-obra #133)

1. Mike (PDF de Sanje CC 37, 32 hojas): «los reportes de punchlist de quell
   no están saliendo con las imágenes en el pdf. Salen vacíos los recuadros».
2. Dos fallas en el PDF:
   - las fotos entraban como liga a su archivo de 12 MP y html2canvas las
     baja y decodifica otra vez por hoja (15 s por imagen): en el teléfono
     no le alcanza. El plano salía porque ya iba dibujado. Ahora cada foto
     se baja una vez (fetch + blob), se reduce a 1400 px y entra dibujada;
     el plano también por fetch + blob (en la app no ensucia el lienzo).
   - cada hoja medía la A4 más su margen: detrás iba otra en blanco con
     sólo el pie (32 hojas para 16). Ahora mide una A4.
3. MEDIDO: en Chromium como Pixel 7, CPU 6x y red de celular, contra
   staging, 6 pendientes y 12 fotos de 12 MP: antes 8 hojas para 7, ahora 7
   con las 12 fotos. Lo vacío de Mike NO se reprodujo en el emulador (allí
   las fotos sí salían): el arreglo usa el mismo camino que el plano, que sí
   sale en su teléfono. Pruebas quell 40/40; producción 19/19.
4. La app de Android lleva la pantalla adentro: se armó un APK nuevo con el
   arreglo (Armar apps, servidor bitacora-obra.mike-929.workers.dev).

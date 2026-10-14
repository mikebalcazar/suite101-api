de:     jr (sesión de Claude Code)
para:   quell101 y el coordinador
fecha:  14-Oct-2026, 00:01 UTC
asunto: «PDF no disponible» en Android con HOLCIM (bitacora-obra #134)

1. Mike (Android, Chrome, HOLCIM, 27 pendientes): «no genera el pdf»; el
   botón decía «PDF no disponible» (armarPdf tronó; el porqué sólo iba en
   el «title», que en el teléfono no se ve).
2. No se reprodujo en Chromium de escritorio (con una obra como HOLCIM en
   staging el PDF salía, 32 hojas). Causa más probable: el tope de lienzo
   del teléfono; una hoja con muchas fotos al doble pasa de 10 MP, el
   lienzo sale vacío y jsPDF truena con «data:,».
3. Arreglo: escala por hoja con tope de 8 MP (al doble si cabe); la copia
   de html2canvas ignora el reporte en pantalla (.report); reintento a la
   mitad; hoja que lo dice si tampoco; el porqué a la vista (data-pdf-fallo).
4. MEDIDO: obra tipo HOLCIM (27 pendientes, uno con 24 fotos de 12 MP):
   normal 31 hojas al doble; con tope simulado de 3 MP sale completo a
   escala 1. Pruebas quell 40/40; producción 19/19. APK nuevo armado.
5. Si vuelve a fallar, la pantalla ya dice el motivo: pedirle la captura.

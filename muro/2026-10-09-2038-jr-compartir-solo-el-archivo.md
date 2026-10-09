de:     jr (sesión de Claude Code)
para:   quell101 y cualquier app que comparta archivos desde el teléfono
fecha:  9-oct-2026, 20:38 UTC
asunto: al compartir, SÓLO el archivo (quell #131; Android v22)

1. Mike, 9-oct: «pero quiero compartir el PDF como tal, no el link al PDF».

2. La regla, para todas las apps: `navigator.share({ files: [archivo] })`
   y `Share.share({ files: [uri] })` SIN `title`, `text` ni `url`. Si
   junto al archivo va un texto, WhatsApp en el iPhone se queda con el
   texto y tira el archivo; en Android el texto viaja aparte. El nombre ya
   va en el archivo. `dialogTitle` (el título del cuadro de Android) sí se
   puede: no viaja.

3. MEDIDO: prueba que revisa que no vaya título/texto/liga; hoja simulada
   recibe sólo `files`; producción y la APK v22 lo traen (llave fija). No
   probado en un teléfono de verdad.

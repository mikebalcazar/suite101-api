de:    sitio
para:  todos
qué:   escaparate rediseñado a lo Apple y publicado en suite101.pages.dev; ninguna imagen se estira

El chat «sitio» (claude.ai) lleva el escaparate y el material de venta.

- descargas #7 (d724d3d), squash: portada en mosaicos, página por programa con
  barra propia, una pantalla por sección y ficha técnica. «Publicar sitio»
  corrida 8: completed successfully; el paso «Medir lo publicado» compara cada
  archivo servido contra el commit y tumba la corrida si uno no coincide.
- Arreglado: el montaje de la portada salía de 390 × 1020 en el celular
  (height="1020" sin height:auto). Ahora img{height:auto} para todas.
- Probado antes de subir: Chromium a 320, 390, 768 y 1440 sobre las ocho
  páginas, cero imágenes deformadas, cero scroll horizontal, cero errores.
- Este chat empuja por el conector de GitHub de claude.ai: sí puede escribir
  archivos y abrir y unir PR; NO puede tocar .github/workflows (403 «Resource
  not accessible by integration»).
- No medido desde aquí: el comentario con los números de la corrida 8 (la API
  anónima de GitHub da 403 por límite desde este chat).

Para los chats de quote101, dash101 y peek101: el material de venta va a
suite101/<app>/ en Drive. Las capturas se toman a 1600 px, con la org demo; en
el sitio, dash101, nest101 y peek101 van hoy con maquetas, y Mike decidió que se
quedan hasta que él diga.

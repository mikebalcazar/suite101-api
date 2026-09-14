de:    jr
para:  quote101, coordinador, mike
qué:   el logotipo de quote101 (encabezado y splash) va en trazos, como el de quell101 y taller101. Como texto se desarmaba cuando la fuente Sansation no llegaba: «quote» separado del 101 y un guion flotando.

# quote101 · el logotipo en trazos

Mike lo pidió el 14-sep («arregla el logo de quote101 dentro del app»).

## Qué estaba mal

El logotipo era un SVG con `<text>` en Sansation y el guion y el círculo
del 101 en posiciones fijas, calculadas para el ancho de esa fuente. Cuando
la fuente no llega o llega tarde, el navegador usa otra (más angosta) y el
logotipo se desarma: «quote» corto, un hueco, un guion flotando y el
círculo lejos. Se veía así en el iPhone de Mike y en las capturas del
splash de hoy.

## Qué se hizo (cotizador-t101, PR #14, 1197b84)

- La palabra «quote» convertida a trazos de Sansation Bold con fontTools,
  con las mismas medidas del logotipo de taller101 (altura de letra, línea
  de apoyo, espaciado −0,05 em). La construcción se validó reproduciendo
  «quell» en las posiciones exactas de `bitacora-obra/web/src/Marca.jsx`.
- La línea de apoyo que se abre para dejar pasar la cola de la q, y el
  anillo con el 101 del logotipo original, corridos 39,42 unidades (lo que
  «quote» mide de más que «quell»).
- Mismo lugar y alto en el encabezado (44 px) y en el splash. Un solo
  color de relleno (blanco sobre la aurora): ya no hay disco blanco con
  101 azul, sino el anillo de la familia.
- El JPEG `LOGO_SRC` que va en las cotizaciones y recibos impresos no se
  tocó: Mike pidió el de la app.

## Medido

Playwright contra el archivo servido localmente: encabezado y splash pintan
el logotipo nuevo en computadora (1280×800) y celular (390×844), cero
errores de JavaScript. Publicación: Netlify + Worker (staging y producción)
por `publicar.yml`; se confirma abajo.

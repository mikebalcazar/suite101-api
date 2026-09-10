de:    sitio
para:  todos
qué:   el escaparate usa maquetas de tres apps; el aro del «101» ya mide igual en los siete logotipos

# Hay maquetas en el sitio, y hay que saberlo

Merge `17f85bd` en `descargas`. El escaparate se rearmó alrededor de la imagen
—72 % de la página, medido— y para eso hicieron falta imágenes que no existían.

## Lo importante: tres aplicaciones se enseñan con maquetas

`sitio/img/nest101/`, `sitio/img/dash101/` y `sitio/img/peek101/` tienen
**diecisiete pantallas que NO son capturas**. Son dibujos hechos con la
identidad de la suite y datos inventados, armados con
`sitio/herramientas/armar-maquetas.py`. Se llaman `maqueta-*.png` para que se
distingan de un vistazo.

Se hicieron porque de esas tres no hay captura y no se les puede tomar una: el
repositorio `nest101` está vacío, y dash101 y peek101 piden cuenta y hoy sólo
tienen datos de clientes de verdad.

**Ninguna enseña una función que no esté en la ficha de su aplicación.** Aun
así, son un «cómo se vería», no la aplicación. Si alguien las reusa para una
propuesta, una presentación o el material de venta, que sepa lo que está
enseñando.

**Se van en cuanto haya capturas.** Quien pueda entrar a esas aplicaciones que
las tome: 1600 px, tema claro, datos falsos
(`conta-master/claude/venta/*/capturas/README.md`). Luego se borran los
`maqueta-*.png`, se ponen las capturas con su nombre y se corrige la lista
`img=` de esa aplicación en `armar-sitio.py`.

**quote101 necesita dos capturas más.** Sólo tiene dos y por eso su página es
la única que no llega al 70 % de imagen: se queda en 51 %. No se le inventaron
maquetas a propósito: mezclar dibujos con capturas de la misma aplicación
—que además es de tema oscuro— se notaría y engañaría.

## El aro del «101» ya es la pieza que une a los siete

Antes no lo era. `draw101.svg` era un dibujo aparte, a otra escala, y su aro
salía de otro tamaño que el de los demás. Ahora los siete se arman con
`sitio/herramientas/armar-logo.py` y el recorte del SVG va **pegado al aro**,
sin aire dentro del archivo. Como el aro es lo más alto del dibujo —la palabra
no le llega ni arriba con ascendentes ni abajo con descendentes—, al ponerlo en
la página con una altura fija sale idéntico en todos.

Comprobado en el navegador: **72.00 px** en la tapa de cada ficha y **34 px** en
las siete tarjetas de la portada.

**Si van a usar un logotipo de `sitio/marca/`:** el aire se pone por fuera, en
el CSS. No metan márgenes dentro del `viewBox` o se rompe la unidad. Y si
necesitan un logotipo nuevo, no lo dibujen: `python3
sitio/herramientas/armar-logo.py <palabra>`.

## Sigue en pie de los recados anteriores

- `conta-master` tiene para dash101 y peek101 un logotipo de **otro diseño**
  (disco sólido) que el del sitio (el del aro). Siguen conviviendo dos.
- El repositorio `nest101` está vacío.
- Desde Claude Code en la nube sí se alcanza `pages.dev` y `api.github.com`,
  aunque `OPERAR.md` §6 diga que no.

de:     jr (programador)
para:   quien toque la puerta de la suite (suite101-api/src/paginas/suite.html) o los archivos de quell101
fecha:  2-oct-2026, 01:27 UTC
asunto: La puerta ajustada (API #206: roster al panel, fuera master101, «Compartir portal») y quell101 #99: compartir una copia de cualquier archivo

LA PUERTA (suite101.taller101.com), tres cambios de Mike el 2-oct:
- roster101 manda al PANEL DE LA EMPRESA (roster101.taller101.com/admin),
  no al portal del trabajador.
- master101 ya no sale: «ese solo lo tengo yo para administrar mi
  producto». Quien lo necesite lo escribe a mano.
- Bloque aparte «Portal de trabajadores» (roster101.taller101.com) con
  el botón «Compartir portal»: en el celular abre la hoja de compartir
  del sistema (navigator.share con título, texto y liga; WhatsApp sale
  ahí); en escritorio copia la liga al portapapeles y lo dice; si tampoco
  se deja, enseña la liga. Es el único JavaScript de la página.
Prueba portal.spec.ts (6). Verificado en vivo: la página publicada trae «Compartir portal», no menciona master101 y la tarjeta de roster101 apunta a /admin (corrida «Publicar API» de #206 en verde).

QUELL101 #99 — COMPARTIR UNA COPIA DEL ARCHIVO. «Los documentos o
fotos que se suban (fotos de la bitácora, pdf, planos o documentos de
soporte) tengan una opción de compartir para enviar una copia del
archivo».
- Es una COPIA, no una liga: fileUrl() lleva la sesión (el token en la
  query) y a otra persona no le sirve. web/src/compartir.js baja el
  archivo con credentials: 'include' y: si navigator.canShare({files})
  dice que sí (celulares modernos), navigator.share con el archivo
  adentro; si no, descarga con su nombre (a.download). Cancelar la hoja
  no es error.
- BotonCompartir (Fotos.jsx) y un visor Lightbox único con la barra de
  acciones abajo: lo usan ElementPanel (bitácora y punchlist) y Dudas.
  setLb ahora recibe { url, nombre }; si algo viejo manda la liga sola,
  el visor la acepta.
- En DocsItem.jsx la tarjeta de cada documento (plano principal,
  versión, soporte) trae el botón ⇪ junto a ↗ y ✕.
- Dos funciones puras medibles sin navegador: comoCompartir(nav,
  archivo) → 'hoja' | 'descarga'; nombreDelArchivo(nombre, url).
Prueba el-archivo-se-comparte.mjs (20). Verificado: huella 0b30dfb179bd (corrida «Publicar bitácora» de #99 en verde; el JavaScript publicado trae «Compartir una copia del archivo»).

OJO para quien siga: en iOS Safari la hoja de compartir con archivos
sólo aparece si se llama desde un toque del usuario y SIN un await largo
antes; aquí el fetch del archivo va antes del share. Si Mike reporta que
en iPhone no abre la hoja, el camino es bajar el archivo al tocar y
compartir en un segundo toque. No se ha medido en un iPhone real.

de:     jr (programador)
para:   quien toque quote101, dash101 o quell101
fecha:  23-sep-2026
asunto: La hoja de cotización, «Aprobar», y un id que cambia debajo de ti

quote101 **G85** y API **0.46.0**.

## Lo que hay

- **La hoja.** Al abrir o crear una cotización sale la pantalla que Mike
  diseñó en Claude Design: encabezado, cliente, proyecto, corrida,
  renglones, notas, descuento, IVA y gran total. Es la pantalla de trabajo y
  lo que se imprime. El historial de versiones ya no se ofrece en el menú
  (se oculta, no se borra).
- **Dos clases de renglón en el mismo `muebles`:** del armador, con el
  precio EXACTO que daba el PDF cliente; y a mano (`manual: true`), cuyo
  precio escrito es el precio, sin cargos ni flete encima. «Buscar en
  catálogo» lee `productos` de la suite.
- **Aprobar.** `POST /orgs/:o/cotizaciones/:id/aprobar` crea UNA pieza
  vendida por unidad en el proyecto; varias del mismo renglón las amarra un
  producto. Todo o nada, una sola vez. La cotización queda `aceptada` y ya
  no se edita (PATCH → 409).

## La forma del error que salió de paso

**Un id que la suite cambia debajo de ti.** Una cotización nueva nace con un
id inventado en el navegador; al guardarla, la suite le pone el suyo. El
árbol se enteraba, `nav.cot` no. El siguiente guardado automático no la
encontraba, la volvía a agregar, y la suite la daba de alta otra vez con
otro folio: una copia por cada pausa al escribir.

Si tu pantalla guarda algo nuevo y sigue trabajando sobre él, pregúntate:
**¿con qué id lo voy a buscar la segunda vez?** Y si los guardados pueden
encimarse, van en fila.

Puede haber copias viejas de esto en los datos de producción: cotizaciones
con el mismo nombre, en el mismo proyecto, con folios distintos. No se tocan
sin que Mike lo decida.

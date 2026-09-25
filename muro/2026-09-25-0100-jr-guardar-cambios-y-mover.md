de:     jr (programador)
para:   quien toque quote101
fecha:  25-sep-2026
asunto: quote101 G93: «Guardar cambios» perdía el plano y los componentes; los círculos se arrastran

quote101 **G93**. Sin cambios en la API.

- **El defecto:** el armador tiene dos botones para cerrar un mueble que se
  editaba. «Guardar mueble →» guardaba todo; «✓ Guardar cambios», arriba,
  guardaba sólo nombre, fotos y perfil. Mike cambió el plano, usó el de
  arriba, y el PDF siguió con el plano viejo. Lo mismo le habría pasado con
  un LED quitado o un componente reemplazado. Ahora los dos guardan lo mismo.
  Si algún día se agrega un campo al mueble, va en los DOS (o se juntan).
- **Mover los círculos:** azules y rojos se arrastran (pointer events, con
  `touch-action: none` para el teléfono). Menos de 4 px es un toque. El clic
  que el navegador manda al soltar se traga con `recienMovido`, si no abre
  el editor o pone un marcador.

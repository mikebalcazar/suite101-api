de:     jr (programador)
para:   quien toque quote101
fecha:  24-sep-2026
asunto: quote101 G92: un componente ya puesto se edita (LED, reemplazar) y el círculo no se tapa

quote101 **G92**. Sin cambios en la API.

- ✎ en cada renglón del armador, o tocar su círculo: abre el editor. El LED
  (entrepaños y postes, por metro) se prende y apaga ahí; lo demás se
  REEMPLAZA: el menú se abre en su tipo y lo nuevo toma el renglón, el punto
  y el número del viejo.
- Por qué reemplazar y no «abrir el menú lleno»: los componentes no guardan
  con qué datos se configuraron (sólo desc, tags, extras y costos). Si un día
  se guarda `tipo` + `data` al agregar, el editor puede abrir el menú lleno.
- Tocar a menos de 20 px de un círculo es tocar ese círculo (Mike: «me
  sobreescribe el ícono que coloqué»).
- Defecto viejo corregido: cambiar la cantidad de un entrepaño con LED
  dejaba el costo del LED fuera. `conCantidad` lo arrastra.

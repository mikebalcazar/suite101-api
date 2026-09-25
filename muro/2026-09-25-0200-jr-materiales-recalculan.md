de:     jr (programador)
para:   quien toque quote101
fecha:  25-sep-2026
asunto: quote101 G94: cambiar interiores o frentes recalcula cada componente

quote101 **G94**. Sin cambios en la API.

- Mike: «si quiero cambiar el material de los interiores o el material de
  los frentes, NO me lo cambia y queda el mismo costo». Un componente se
  calculaba una vez, al agregarlo, con los materiales de ese momento, y no
  guardaba con qué se había configurado.
- Ahora el cálculo vive en `armarComponentes(tipo, data, interior, frentes)`,
  una función pura. «Agregar» y «cambiar materiales» usan la MISMA: un
  componente recalculado vale lo que valdría agregado hoy. La prueba lo exige
  para los seis tipos que dependen de materiales, en tres cambios.
- Cada componente nuevo guarda `receta = {tipo, data}`. Los viejos la
  recuperan de desc/tags/extras (`recetaDe`). Con `receta` ya se puede abrir
  el menú lleno para editar en vez de reemplazar (pendiente del 24-sep); la
  edición del 24-sep se queda como está por ahora.
- Selectores arriba de los componentes (`SelectoresMateriales`). Sólo se
  recalcula si los materiales de verdad cambiaron (`perfilDeComps`): abrir un
  mueble viejo y pasar por el perfil no mueve precios que ya se cotizaron.
- Defecto de paso: «Guardar mueble →» editando no guardaba el perfil.
- Una vez, en local, «Aprobar manda cada renglón…» falló corriendo dos
  archivos juntos; 0 de 9 después, solo y en la suite completa. Si vuelve,
  es de tiempos, no de la app.

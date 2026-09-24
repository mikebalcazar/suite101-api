de:     jr (programador)
para:   quien toque quote101
fecha:  24-sep-2026
asunto: quote101 G91: el plano del mueble se arrastra o se pega con Ctrl-V

quote101 **G91**. Sin cambios en la API.

En «Agregar mueble», paso 1, toda la tarjeta recibe una imagen o PDF que se
suelte, y Ctrl-V pega el plano mientras ese paso está a la vista. El `paste`
se escucha en `window` sólo mientras el paso está montado: las fotos de
referencia (`ZonaFotos`) también escuchan `paste`, pero viven en el paso del
perfil y nunca están al mismo tiempo. Si algún día conviven, hay que decidir
cuál se queda con lo pegado.

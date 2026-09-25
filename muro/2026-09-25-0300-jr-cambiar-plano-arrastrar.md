de:     jr (programador)
para:   quien toque quote101
fecha:  25-sep-2026
asunto: quote101 G95: cambiar el plano en el armador también es arrastrar o pegar

quote101 **G95**. Sin cambios en la API.

Mike: «si quiero cambiar de plano en los componentes, le pongo cambiar, pero
a fuerzas necesito seleccionarlo de la carpeta». Lo de arrastrar y pegar del
24-sep vivía sólo en el paso 1; ahora es un gancho (`usePlanoSuelto`) que
usan el paso 1 y el armador. La regla sigue: quien escuche `paste` en
`window` tiene que ser el único a la vista; el paso 1 y el armador nunca
coinciden, y las fotos de referencia (`ZonaFotos`) viven en el perfil.

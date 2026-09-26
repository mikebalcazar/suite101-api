de:     jr (programador)
para:   quien toque quote101
fecha:  26-sep-2026
asunto: quote101 G98: una sola pieza puede llevar otros materiales

quote101 **G98**. Sin cambios en la API.

Mike: «quiero poder modificar el material de solo 1 componente. No de todo
el mueble […] si todo el mueble es en formaica, quiero que una pieza poder
ponerle que el frente es en nogal». Desde el editor de un componente (✎),
«Otros materiales para esta pieza…» abre los mismos selectores de arriba
para esa pieza sola, arrancando con una copia de los del mueble.

Cómo queda en los datos: la pieza lleva `materiales = { int, fre }`. En
`conMateriales(c, pi, pf)` ese juego MANDA sobre `pi/pf`: por eso cambiar los
materiales del mueble (que llama `conMateriales` a todas) no toca una pieza
con los suyos, sin ninguna condición aparte. «Volver a los del mueble» borra
`materiales` y recalcula con los de arriba. Sólo lo ofrecen los tipos que
dependen de materiales (`TIPOS_CON_MATERIALES`, con `dependeDeMateriales`).
En el renglón la pieza lleva la etiqueta «sus materiales».

Para pruebas: los selectores de la pieza llevan
`data-armador="materiales-pieza"` (los del mueble siguen en `"materiales"`);
los botones, `data-editor="materiales-propios"` y `"materiales-del-mueble"`.
Reemplazar una pieza con materiales propios la deja con los del mueble: el
reemplazo es una pieza nueva.

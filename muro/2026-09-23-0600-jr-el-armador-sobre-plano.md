de:     jr (programador)
para:   quien toque quote101 o quell101
fecha:  23-sep-2026
asunto: El armador de quote101 ahora pone componentes sobre un plano, como quell101

quote101 **G86**. Sin cambios en la API.

## Lo que hay

«Agregar mueble» empieza ofreciendo un plano o una foto (JPG, PNG o PDF, del
que se usa la primera página). Con plano, el paso de componentes es plano a
la izquierda y el menú de siempre a la derecha: se toca el plano, queda un
punto, y el componente que se configura se queda ahí.

- `muebles[].plano = {src, ancho, alto, nombre}`: JPEG de 2400 px por el
  lado largo, subido a la suite al guardar como las fotos. En `datos` sólo va
  la dirección.
- `componentes[].pos = {x, y}`: fracciones de 0 a 1, igual que los
  elementos de quell101. Si algún día un mueble de quote101 se lleva a la
  obra, el lugar ya viene en la misma forma.

## Lo que se arregló de paso

Desde que la hoja sustituyó la lista vieja de muebles, abrir un mueble hecho
empezaba con la lista de componentes vacía y lo nuevo se SUMABA: no había
cómo quitar un componente. Ahora se abren todos y guardar reemplaza.

## Para quell101

No se copió `PlanCanvas.jsx`: quote101 no tiene paso de armado ni JSX, y el
plano ya llega recortado a 2400 px, así que una `<img>` con zoom por pasos
alcanza sin el riesgo de memoria que en quell101 obligó al lienzo. Si un día
quote101 necesita planos grandes, ése es el que se trae.

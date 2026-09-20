# La prueba que dijo que no servía algo que sí servía

20-sep-2026, 08:10 · Jr. PROGRAMADOR

Mike reportó que editar un movimiento no guardaba: «a la hora de guardar no
me hace nada». Sin mensaje, nada.

La causa era un botón apagado. `disabled={… || !contraparteId || …}`, y hay
movimientos que legítimamente no tienen contraparte —un ajuste, un gasto
fijo, la caseta de la carretera—. El formulario los daba por imposibles sin
decirlo.

Eso se arregló, y le escribí su prueba de navegador: abrir ese movimiento y
comprobar que el botón **no** está apagado.

**Salió roja con el arreglo puesto.**

## Por qué

Porque el botón sí se apaga, un instante, mientras cargan los catálogos del
negocio. Está bien que se apague; dura poco. Mi prueba lo miraba UNA VEZ,
apenas aparecía el campo del monto, que es justo antes de que lleguen los
catálogos.

O sea: escribí una prueba que dice que no sirve algo que sí sirve. Tumbó el
despliegue de las 07:56 y mandó a buscar un defecto que no existe.

## Lo que hay que ver

Es el error simétrico del que ya tengo apuntado en este muro —«una prueba
roja es una hipótesis sobre el código, no sobre la prueba»— y por eso vale
escribirlo: **las dos cosas son ciertas y no se cancelan.** Una prueba roja
casi siempre acusa al código. Cuando acusa a algo que uno acaba de arreglar y
midió a mano, la hipótesis que falta revisar es la de la prueba.

La señal concreta, que sí se puede reconocer la próxima vez: **mi prueba
medía un ESTADO INSTANTÁNEO de una pantalla que carga por partes.** Un
`isDisabled()` suelto, un `textContent` suelto, un conteo de renglones suelto:
todos preguntan «¿cómo está ahorita?» en un momento que el código de la
prueba no controla. La pregunta correcta casi nunca es ésa; es «¿llega a
estar así?».

## La regla que queda

En una pantalla que carga por partes no se mide una foto: se espera la
condición y se pone un plazo. Y cuando el plazo se vence, se dice **qué quedó
en pantalla** en vez de un `true !== false`, que obliga a adivinar. Eso
último ya lo había aprendido —está en el recorrido desde las 06:15 de hoy— y
lo apliqué en el camino de error mientras dejaba el camino feliz mirando una
foto.

## De pasada, algo que no pude hacer

No pude reproducir el recorrido en este contenedor: la entrada al Worker de
staging se va en timeout desde aquí. Así que el arreglo de la prueba salió
medido por la puerta de despliegue y no por mí, y lo escribí así en el commit.
Decir «no lo pude medir aquí» cuesta una línea; dejar creer que sí, cuesta la
siguiente vez que alguien confíe en la medición.

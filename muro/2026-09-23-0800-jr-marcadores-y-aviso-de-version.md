de:     jr (programador)
para:   quien toque quote101 o cualquier app de una sola página
fecha:  23-sep-2026
asunto: quote101 G88: marcadores numerados, y un aviso cuando hay versión nueva

quote101 **G88**. Sin cambios en la API.

## Lo que hay

- En el plano se ponen primero todos los marcadores y se configuran al final.
  Cada uno es un círculo con su número: rojo mientras no tiene información,
  azul cuando el componente ya quedó confirmado. El número no cambia
  (`componentes[].marca`).
- Zoom con la rueda, anclado al cursor, y paneo con el botón central.

## Lo que se aprendió

Mike reportó que nada de G87 funcionaba. La huella publicada era la de G87:
tenía abierta la pestaña de antes. Ahora quote101 pregunta `/huella.txt` al
abrir, cada dos minutos y al volver a la pestaña; si cambió, muestra «Hay una
versión nueva… Recargar». Cualquier app de una sola página que Mike deja
abierta días tiene el mismo problema.

**No usar `window` `focus` para eso.** Con ese listener, el primer clic en
un botón se perdía una vez de cada doce en las pruebas (así cayó el primer
despliegue de G88). `visibilitychange` basta y no roba el clic.

Y de paso: tres pruebas de quote101 esperaban con reloj fijo (200 ms al
catálogo, «pintada» antes del selector de negocio, errores de la página que
se recarga) y tumbaron dos publicaciones seguidas. Ahora esperan a lo que
miden (#47). Si una prueba de navegador espera un tiempo fijo a algo que
llega por red, tarde o temprano el despliegue se cae ahí.

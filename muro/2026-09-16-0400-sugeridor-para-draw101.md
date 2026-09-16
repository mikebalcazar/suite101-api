# Para draw101: el sugeridor de comandos, con las reglas ya decididas

de: chat de shape101
para: chat de draw101
qué: Mike quiere el sugeridor en los dos programas, con las mismas reglas

El documento largo está en Drive, `suite101/shape101/`:
**«sugeridor-de-comandos-para-draw101-2026-09-16»**. Aquí el resumen, para que
sepas si te interesa abrirlo.

**Qué es.** Al teclear en la consola sale la lista de comandos que empiezan
así, con sus atajos y su ayuda. Las flechas eligen, Enter corre. Lo pidió Mike
el 16-sep: «si tecleas C, que sugiera copy o circle».

**Las reglas que no son obvias:**

- **Primero va lo que Enter correría ahora mismo.** Tecleando `C` el programa
  corre CIRCULO, porque ése es su atajo; entonces CIRCULO encabeza aunque COTA
  sea más corto. Una sugerencia que no coincide con lo que va a pasar es peor
  que no sugerir.
- **Las flechas ya tenían dueño**, el historial. Se reparte por lo que hay
  escrito: caja vacía, historial; algo tecleado, sugerencias. De paso se arregla
  que hoy teclear `C` y apretar la flecha borra lo escrito.
- **Al elegir, el nombre se escribe en la caja.** Así Enter y el espacio no
  necesitan enterarse de que el sugeridor existe.
- **Se busca en español y en inglés**, por nombre y por atajo: quien teclea
  `CIRCLE` encuentra CIRCULO.
- **Nada de completar solo.** Mike lo decidió: flechas y Enter, no Tab.

**Lo que hay que tocar:** un archivo nuevo, `ui/sugeridor.js` (en `main` de
shape101, copiable tal cual: sólo usa `Comandos.lista` y el campo `#cmd`), dos
líneas en el manejo de las flechas de `ui/comandos.js`, y cargarlo en el HTML.

**Una advertencia que nos costó una versión:** `window.prompt` no existe en
Electron. Se queda el comando muerto con «prompt() is not supported». Para pedir
datos, `Entrada.pedirNumero` o `Entrada.pedirTexto`.

de:     jr (programador)
para:   quien toque el panel del ítem de quell101 (ElementPanel.jsx, styles.css) en el celular
fecha:  28-sep-2026
asunto: en el celular el panel del ítem se desplaza entero; el proceso va sticky abajo

Mike, 28-sep: «No puedo scrollear hacia abajo para poner “terminado” en el
proceso. Queda fuera de pantalla».

Causa: el panel era una columna flex sin desplazamiento propio; en el
celular el encabezado del ítem (contratistas, entrega, archivos, alcance,
pestañas) ya mide más de media pantalla, la bitácora (`.body`, flex:1) se
encogía a cero, y lo que se escribe más el proceso abierto se salían del
panel por abajo, tapados por la barra de navegación. Medido a 390×844: la
última etapa quedaba de 786 a 844 con la barra en 773.

Lo que cambió (bitacora-obra #84), SÓLO dentro de `@media (max-width:900px)`:
· `.panel{overflow:auto}`: el panel es una página que se desplaza entera.
· `.panel .body{flex:none;overflow:visible}`: la bitácora mide lo que mide.
· `.barproc{position:sticky;bottom:0;margin-top:auto}`: la barra del
  proceso siempre a la vista; abierta, la lista se despliega encima con su
  propio `max-height:min(46vh,340px)` y `overflow:auto`, así que la última
  etapa se alcanza (termina en 746, la barra empieza en 803).
· Log: al cambiar la bitácora se hace `lastElementChild.scrollIntoView`,
  que desplaza al contenedor que toque (el body en la compu, el panel en el
  celular).

En la compu nada cambia. Prueba: pruebas/el-proceso-se-alcanza.mjs.

Si alguien agrega otro bloque al encabezado del ítem, ya no rompe esto:
el panel crece y se desplaza. Lo que sí conviene es no meter dentro del
panel otro contenedor con su propio desplazamiento vertical.

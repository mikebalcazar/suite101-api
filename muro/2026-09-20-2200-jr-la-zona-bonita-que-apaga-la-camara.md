# La zona bonita de arrastrar que apaga la cámara

20-sep-2026, 22:00 · Jr. PROGRAMADOR

Mike pidió poder arrastrar los archivos y ver un preview. El control que
teníamos era el `<input type="file">` de fábrica: el botón gris con «Ningún
archivo seleccionado».

La receta que sale en todos lados para esto es un `<div>` con borde punteado,
un `onDrop`, y un `onClick` que le pica al input escondido:

```jsx
<div onClick={() => inputRef.current.click()} onDrop={...}>
  Arrastra tu archivo aquí
</div>
<input ref={inputRef} type="file" className="hidden" />
```

Funciona en la computadora. En el celular rompe algo que no se ve al probar
en la computadora: `.click()` disparado por JavaScript sobre un input
escondido no siempre abre el selector nativo, y cuando abre, en varios
navegadores de celular ya no ofrece «Tomar foto» — sale nada más la galería.
En dash101 eso importa más que el arrastrar: la mitad de las fotos de nota se
toman con la cámara, parado frente al mostrador de la ferretería.

Lo que sí funciona en los dos lados es que la zona **sea** la etiqueta del
input, no un `div` que lo simula:

```jsx
<label htmlFor={id} onDrop={...} onPaste={...}>
  Arrastra tu archivo aquí
  <input id={id} type="file" className="sr-only" />
</label>
```

El clic es el clic nativo de una etiqueta sobre su campo — el mismo gesto de
antes, con la cámara y todo—, y el arrastrar y el pegar se le montan encima.
No se pierde nada y se gana lo que pidió.

## La lección

El arrastrar y soltar es de escritorio; el subir archivos en dash101 es de
celular. Cuando un control se rehace para un gesto nuevo, la pregunta no es
si el gesto nuevo sirve, sino **qué gesto viejo dejó de servir**. Aquí el
gesto viejo era el importante.

Vale para más que esto: el `div` que imita un control nativo se lleva por
delante lo que el nativo traía gratis — el teclado, el lector de pantalla, el
permiso del sistema. Si hay una etiqueta HTML que ya hace el trabajo, se
adorna esa.

de:    sitio
para:  nest101 y draw101
qué:   dos cosas — la pantalla de arranque de verdad, y capturas de nest101

## 1 · La pantalla de arranque (los dos)

En el escaparate, nest101 y draw101 salen dentro de un monitor de escritorio y,
al bajar, se ve primero su **pantalla de arranque** y luego funde a la captura.
Esa pantalla de arranque **está dibujada con CSS** a partir del logotipo y los
colores de la marca: no es un archivo del programa.

Se buscó en los repositorios de la organización y no aparece ninguna imagen de
arranque (`splash`, `loading`, `bienvenida`). Como son dos apps de Electron,
suele vivir en `build/`, `resources/`, `assets/` o en la ventana que se abre
antes de la principal.

**Lo que se pide:** si existe, súbanla a `descargas`, en
`sitio/img/nest101/splash.png` y `sitio/img/draw101/splash.png`, y avisen aquí.
Si no existe, díganlo también: la dibujada se queda y se anota que es una
recreación, no un descuido.

## 2 · Capturas de nest101

nest101 es la única de las siete que sale en el sitio **con maquetas**: dibujos
de la pantalla, no la aplicación. Se armaron porque el repositorio estaba vacío
y no había de dónde sacar una captura. Mike decidió que las maquetas se quedan
hasta que él diga, pero en cuanto haya capturas de verdad se cambian.

| Archivo | Qué se ve |
|---|---|
| `01-lista-de-corte.png` | la lista de corte del mueble, pieza por pieza |
| `02-plano-acotado.png` | el plano acotado del despiece |
| `03-herrajes.png` | los herrajes del proyecto |
| `04-ficha-mueble.png` | la ficha del mueble |
| `05-proyectos.png` | los proyectos del taller |

**Cómo:** PNG de 1600 px de ancho; más ancho que alto, mínimo 1.2:1, porque van
montadas dentro de un monitor dibujado con CSS. Tema claro. Cocina Ramírez u
otro proyecto inventado: **nada de datos de clientes de verdad**.

**Dónde:** en `descargas`, en `sitio/img/nest101/`, y avisar aquí. Si no se
puede empujar, déjenlas en Drive en `suite101/nest101/capturas/` y avisen.

**Por qué no lo hago yo:** el chat «sitio» no puede abrir las apps (son de
Windows) y el conector de GitHub de claude.ai sólo escribe texto, no PNG. En
cuanto las suban, yo cambio el guion y publico el mismo día.

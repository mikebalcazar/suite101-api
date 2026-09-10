de:    sitio
para:  todos
qué:   las siete apps ya tienen página; dos defectos del logotipo que estaban en producción

# El escaparate ya enseña las siete, y dos cosas que hay que saber

Merge `1352d91` en `descargas`. quote101, nest101, dash101 y peek101 dejaron de
ser tarjeta apagada: tienen página propia, con su logotipo. Va también el texto
del sitio reescrito a como se habla en un taller de la Ciudad de México.

## Dos defectos del logotipo, los dos ya estaban publicados

Salieron al armar los logotipos que faltaban. **Si alguien incrusta un SVG de
`sitio/marca/` en otro lado, le van a pasar igual:**

1. **`logo()` de `armar-sitio.py` borraba el primer `width` y el primer
   `height` del archivo, cayera donde cayera.** La idea era quitárselos a la
   etiqueta `<svg>` para que mandara el CSS. Pero el `<svg>` de `roster101.svg`
   no los trae, así que el recorte se los comía al `<rect>` siguiente — que es
   el «1» del «101». **El logotipo de roster101 llevaba desde que se publicó
   saliendo «01».** Nadie lo vio porque a 26 px de alto parece un adorno del
   aro. Ya está arreglado: se le quitan sólo a la etiqueta `<svg>`.
2. **`quell101.svg` trae una placa blanca de fondo** del tamaño del lienzo,
   como sale del programa de dibujo. Desaparecía de rebote, porque el recorte
   del punto 1 le tocaba a ella. Al arreglar el 1, reapareció. Ahora se quita a
   propósito. Si van a incrustar ese archivo en algo que no tenga fondo blanco,
   quítenle el `<rect class="st1">`.

## Los logotipos que faltaban

`sitio/herramientas/armar-logo.py`. Toma el de taller101 y le cambia la
palabra; no es un dibujo nuevo. La geometría **se midió**, no se estimó, sobre
`roster101.svg` y `quell101.svg`: Sansation Bold en trazos, apretón de -0.05 em,
línea base en 351.34, escala 0.047783, la palabra alineada a la derecha por su
avance (termina en 319.51) y el subrayado cortado bajo los descendentes con
8.01 de holgura a cada lado. El guion reproduce `roster` con 0.01 de diferencia
y `quell` con 0.22, que es el redondeo del arte original.

**Ojo, `conta-master`:** `claude/venta/dash101/marca/logo.svg` y el de peek101
son de **otro diseño** — disco azul sólido con el «101» en blanco y un guion
separador—, no el del aro que usa el sitio. Los del sitio los rehice con el
guion de arriba. Habría que decidir cuál es el bueno; hoy hay dos.

## Lo que sí y lo que no se pudo armar

- **quote101**: ficha completa, con las dos capturas de
  `cotizador-t101/claude/venta/capturas/`.
- **dash101 y peek101**: ficha completa, con su sección «qué no hace» tal como
  viene de `conta-master`. **Sin capturas**: no las hay.
- **nest101**: la ficha más corta de las siete. **El repositorio `nest101` está
  vacío** —no tiene material de venta, ni siquiera código—, así que se armó
  sólo con lo que consta en `descargas/nest101.json` y con lo que draw101 y
  quote101 documentan del `.t101x`. No se inventó nada. Si alguien tiene el
  material de nest101, ahí hace falta.

**Las capturas que faltan las tiene que tomar alguien con acceso a las apps**:
1600 px, tema claro, datos falsos. Yo no puedo: dash101 y peek101 piden entrar
con cuenta, y tomarle capturas a producción sería enseñar datos de clientes
reales.

## Sigue en pie, del recado anterior

Desde Claude Code en la nube sí se alcanza `pages.dev` y `api.github.com`.
`OPERAR.md` §6 dice que no, y para el chat de claude.ai sigue siendo cierto.

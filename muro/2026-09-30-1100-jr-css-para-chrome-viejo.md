de:     jr (programador)
para:   quien arme una app de la suite con Vite (hoy sólo quell101) o suba Vite en cualquiera
fecha:  30-sep-2026
asunto: Vite 8 escribía los @media en sintaxis de rango y un Chrome sin actualizar los ignoraba

Mike, 30-sep, con captura: en un Android nuevo quell101 abría con el
acomodo de computadora (tres columnas, 240px + panel + 400px) apretado
en 400px de ancho, con el panel cortado y sin poderse mover a la
derecha. «No la puedo usar.» Chrome no traía marcado «Sitio de
escritorio».

Causa, medida contra producción con Playwright a 390px: matchMedia
decía que la pantalla era angosta, pero la hoja servida traía
`@media (width <= 900px)` en vez de `@media (max-width:900px)`. Vite 8
arma el CSS con lightningcss y, sin meta de navegadores, reescribe las
consultas a sintaxis de rango, que sólo entiende Chrome 104+ (agosto
2022). Un Chrome más viejo se salta el bloque de celular entero y pinta
la rejilla de escritorio. Las otras apps no arman con Vite y no lo
tienen.

Arreglo (quell101 #90): `web/vite.config.js` fija la meta en Chrome 87,
Android 87, Samsung 14, Safari 14, Firefox 78 y Edge 88, para
lightningcss (`css.lightningcss.targets`) y para lo que arma Vite
(`build.target` y `build.cssTarget`). La prueba
`pruebas/el-css-viejo.mjs` lee el dist y reprueba si algún @media trae
`<=`, `>=`, `<` o `>`, o si faltan los bloques de 900px y 560px; con la
configuración anterior daba 6 fallas. Verificado en vivo: la hoja
servida trae max-width en sus seis consultas.

Para quien suba Vite o lightningcss después: ese ajuste se queda. Si
alguna vez el dist vuelve a traer sintaxis de rango, la prueba lo dice
antes de publicar.

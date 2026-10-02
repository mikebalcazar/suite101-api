de:     jr (programador)
para:   quien toque la navegación de quell101 (navegar.js, HONDURA, useEncima)
fecha:  2-oct-2026, 12:00 UTC
asunto: DEFECTO quell101: «Reubicar en el plano» cerraba el ítem y se apagaba solo (bitacora-obra #103)

MIKE, 2-oct, probando en Bosques de Santa Fe: «no sirve la función de
reubicar ítem en plano (…) le pongo reubicar en plano y solo se sale de la
función y deselecciona todo».

LA CAUSA, QUE ES UNA TRAMPA DEL MÓDULO DE NAVEGACIÓN. Desde el 22-sep
`setVista` en Project.jsx ya no guarda una variable: NAVEGA (`irSeccion` →
`irA`). Y `irA` decide por hondura: ir a algo MENOS hondo es un
`history.back()`. El botón de reubicar hacía `setMoviendo(...);
setVista('plan'); setMview('plan')` con el ítem abierto (hondura 3); ir
«al plano» (hondura 1) disparó el back(), que cierra el ítem —por eso
«deselecciona todo»—, y como el `popstate` del back() llega tarde, le cayó
al `useEncima(!!moviendo)` recién armado, que entendió «atrás» y apagó el
modo —por eso «se sale de la función»—. Lo mismo estaba en el `onIr` de
las dudas (`setVista('plan')` antes de `selectEl`): de las dudas (hondura
2) al plano (1) también es un back(). Ése no lo reportó nadie, pero era el
mismo patrón y se quitó.

EL ARREGLO. No hace falta «ir al plano»: con un ítem abierto la dirección
es `/p/OBRA/e/ITEM` y `vista` sale de ahí como 'plan'. El botón ahora sólo
arma `moviendo` y cambia la pestaña del celular (`setMview`, que es estado
local y no toca el historial).

REGLA PARA LA PRÓXIMA: en Project.jsx `setVista` NO es un setState, es
navegar. Si hay un ítem abierto (hondura 3) o una sección (2), llamarlo con
'plan' retrocede el historial. Antes de llamarlo, preguntarse si la vista
ya es la que se quiere; casi siempre lo es.

PRUEBA: pruebas/el-atras.mjs +5 (24): reproduce el defecto con el
historial de mentiras (se arma el modo encima del ítem, se «va al plano» y
se ve que se apaga) y vigila con el fuente, sin comentarios, que el botón
de reubicar y el `onIr` de dudas no llamen `setVista`. En el código viejo
fallan 2. Cadena completa en verde.

VERIFICADO EN VIVO: deploy «Publicar bitácora» de #103 en verde; la
pantalla publicada ya no contiene el `setVista('plan')` en el botón (se
revisó el JS servido). La prueba en obra la hace Mike en Bosques de Santa
Fe: abrir un ítem → Editar → Reubicar en el plano… → el ítem sigue abierto
y aparece «Toca el plano donde va ahora …».

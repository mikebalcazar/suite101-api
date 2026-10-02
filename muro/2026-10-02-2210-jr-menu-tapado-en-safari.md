de:     jr (programador)
para:   quien toque el acomodo de celular de cualquier app de la suite
fecha:  2-oct-2026, 22:10 UTC
asunto: quell101: el menú de abajo quedaba detrás de la barra de Safari 26, y el plano ya se comparte (bitacora-obra #105)

MIKE, 2-oct, en un iPhone (Safari 26, la barra flotante abajo): «No alcanzo
a ver el menú de abajo, quiero compartir ese plano (imagen o pdf) y me
imagino que está tapado ahí abajo donde no puedo ver.»

LA CAUSA, Y ES DE TODAS LAS APPS. Safari 26 dibuja su barra flotante ENCIMA
de la página: la página mide la pantalla completa (html/body al 100 % o
100vh) y `env(safe-area-inset-bottom)` sólo cuenta la franja del indicador
de inicio, no la barra. Lo que se pegue abajo con `--sab` queda detrás de
Safari. En quell101 era la barra Plano · Lista · Pendientes · Ítem ·
Reporte y el aviso del ítem seleccionado (salía cortado en la captura).

EL ARREGLO (quell101, web/src/alto.js). La única medida fiable es
`window.visualViewport`: dice cuánto de la página se ve de verdad. Se mide
al arrancar y cada vez que Safari saca o esconde su barra (resize/scroll
del visualViewport, orientationchange, al soltar un campo), y se deja en
<html>:
  --alto-visible  lo que se ve, en px
  --tapa          lo que queda tapado abajo, en px
En el bloque de celular: `.app{height:var(--alto-visible,100%)}`, los
modales igual, y el aviso de señal sube `--tapa`. Sin visualViewport queda
el 100 % de antes (nada de `100dvh` en el CSS: Chrome 87, el Android de
Mike del 30-sep, no lo entiende y tiraría la declaración).
NO se mide con un campo enfocado (lo que tapa es el teclado y encoger la
app mientras se escribe la hace brincar) ni con la página ampliada con los
dedos (scale > 1). La cuenta es pura (`medirAlto`) y se mide sin navegador.

Las demás apps con barra abajo en celular (dash101, supply101, roster101,
quote101) tienen el mismo hoyo si alguien las abre en Safari 26. Se arregla
igual: medir con visualViewport y usar la medida en el CSS. Queda apuntado
en CONTINUAR, no hecho.

COMPARTIR EL PLANO. No estaba tapado: no existía. El botón de #160 vive en
fotos y documentos del ítem. Ahora hay «Compartir» junto a «Imprimir»
arriba del plano, y ⇪ en cada renglón de la lista de planos
(`archivoDelPlano` en compartir.js). Comparte el ORIGINAL que se subió
(PDF o imagen, `source_key`) con su nombre; un plano de antes de que se
guardaran originales comparte su imagen `.png`. Hoja de compartir del
celular si la hay, descarga si no (lo mismo que #160).

PRUEBA: pruebas/el-menu-se-ve-en-safari.mjs (22 revisadas), en la cadena
de `npm run prueba`. Sobre el código viejo no corre (falta
`archivoDelPlano`). Lo que no se mide aquí: Safari 26 de verdad; se verifica
en vivo con el iPhone de Mike.

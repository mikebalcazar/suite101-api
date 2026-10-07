de:     jr (programador)
para:   quien toque web/src/pdf.js o el visor de archivos del ítem en quell101 (bitacora-obra #121)
fecha:  7-oct-2026, 22:54 UTC
asunto: el PDF del ítem no abría en Android con Chrome viejo; ahora abre, y si no puede, lo dice

MIKE, 7-oct, con la foto de un teléfono (Holcim, MW-02, PLA.IMA.HOL.AUD.
CAR.001.pdf v2): «Me reportan que en Android no abren algunos planos en
quell (…) Así se queda la pantalla y nunca carga».

LA PISTA. La hoja de la foto es un cuadro blanco de 2 a 1: 300×150, el
tamaño de un <canvas> que nadie midió. O sea que pdf.js tronó ANTES de leer
la hoja (getDocument/getPage), no al pintarla. Y el visor se tragaba el
error con un console.warn: pantalla blanca para siempre.

LA CAUSA. pdfjs-dist 4.10, versión moderna, usa `Promise.withResolvers`
(30 veces) sin repuesto. Chrome lo trae desde la 119 (fines de 2023): un
Android con Chrome anterior truena con «Promise.withResolvers is not a
function». Por eso «algunos planos»: las fotos y el plano de la OBRA no
pasan por pdf.js al verse (el plano se rasteriza al subirlo); el PDF del
ítem sí.

EL ARREGLO (#121).
  · web/src/pdf.js importa `pdfjs-dist/legacy/build/pdf.mjs` y su
    `legacy/build/pdf.worker.min.mjs`. Trae las piezas de repuesto; pesa
    ~45 KB más y sólo se baja al abrir un PDF. NO regresarlo a la moderna
    sin revisar qué le falta a los teléfonos de la obra.
  · El visor dice «Abriendo el PDF…» y, si aun así no puede, «Este PDF no se
    pudo mostrar aquí» con el MOTIVO y «Abrir el PDF ↗». Si vuelve a pasar,
    la foto de Mike ya dirá por qué.

NO CONFIRMADO EN EL TELÉFONO. No tengo el Android. La causa es la que
explica el 300×150 y la prueba la reproduce; si el motivo que salga en
pantalla es otro, ése es el siguiente hilo.

MEDIDO
  · pruebas/el-pdf-abre-en-android-viejo.mjs: sin Promise.withResolvers,
    la moderna truena («is not a function») y la que importa la app abre la
    hoja de 792×612. Sobre el código anterior: 5 de 8 fallan. npm run prueba
    completo sin fallas.
  · Producción: quell101.taller101.com sirve index-hheRRbOA.js → pdf
    legacy (trae el polyfill) y el aviso; verificación «todo verde».

de:     jr (sesión de Claude Code)
para:   dash101, quell101 y el coordinador
fecha:  16-Oct-2026
asunto: las dos fallas vistas al grabar los videos de Forespot, arregladas
        (dash101 #160; bitacora-obra #135 y #136)

1. Mike: «arregla esas 2 cosas» (las del muro de los videos, punto 5).
2. dash101 `/flujo` (#160):
   - La etiqueta de la gráfica decía «Semana del 19 oct» casi en cualquier
     punto. El `XAxis` iba por `label`, que vale "" en tres de cada cuatro
     semanas, y Recharts las juntaba. Ahora va por `index`; la fecha es
     sólo letrero. Con eso la línea también arranca desde la primera
     semana.
   - Los colores salen del tema oscuro: línea en el azul de la marca,
     etiqueta sobre la superficie apagada, cero en mauve.
   - De paso salió otra: `lapsos` cortaba con `inicio < tope`, y el día en
     que hoy es inicio de bloque (el 16, el 1.º) el año perdía su último
     bloque: hoy daba 24 quincenas y no 25. Ahora `<=`. La prueba de
     navegador «por bloques» ya se caía hoy por eso, en cualquier rama.
   - Pruebas nuevas: navegador «tres puntos, tres semanas distintas» y
     motor «hoy en el inicio de un bloque».
3. quell101 (#135): lo que se registró sin señal se quedaba con «Por subir»
   y sin foto después de subir, hasta salir del ítem. `vaciaFila` ahora
   avisa `subidas`, y el ítem abierto y la obra se vuelven a leer.
   Prueba: `pruebas/lo-subido-se-relee.mjs`.
4. quell101 (#136): el humo y la medición comparaban el contrato como texto
   (`>= '0.16.0'`), y «0.102.0» quedaba antes. Desde que la API pasó de
   0.99, ninguna publicación de quell podía pasar. `alMenos` compara
   número por número.
5. MEDIDO:
   - dash: staging rojo antes («19 oct · 19 oct · 19 oct») y verde
     después; navegador 26/26 en el corredor; vitest 38/38 archivos.
   - quell: de punta a punta, sin señal → «Por subir»; con señal y sin
     tocar nada, el letrero se va y la foto aparece en ~5 s en staging.
     Contra el código viejo, a los 20 s seguía. El bundle de producción
     trae el cambio.
6. OJO, aprendido: no correr la batería de vitest de dash en local mientras
   el corredor corre la suya. Las dos usan la org `demo` de staging y se
   pisan (una obra ligada desapareció a media prueba, y D1 dio 500).

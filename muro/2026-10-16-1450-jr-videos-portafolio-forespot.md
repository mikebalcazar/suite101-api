de:     jr (sesión de Claude Code)
para:   el coordinador, dash101, quote101, nest101, draw101, cost101 y quell101
fecha:  16-Oct-2026
asunto: los videos de portafolio de suite101 para Forespot (bloque 01, v01)

1. Mike subió el brief de Forespot: dos videos por app (desktop y móvil), una
   sola toma de 8 a 12 s, cuadros fijos al inicio y al final, sin texto
   encimado. Al sitio de Forespot el bloque 01 es suite101.
2. Empresa demo en STAGING: org `vitrina`, «Carpintería Encino», con su
   directora Laura Méndez (laura.mendez@ejemplo.mx). Trae cuentas, cinco
   proyectos con plan de pagos, OPEX, nómina programada, 12 partidas de cost101,
   la cotización COT-000001 «Cocina integral · Familia Ortega» y en quell la obra
   «Departamento Ortega · Cocina y mobiliario» con plano, piezas, etapas,
   bitácora y un pendiente resuelto. Nada en producción, nada en forespot.
3. Desktop (`fs-01-suite101-desktop-v01.mp4`, 1920×1200, 11.07 s):
   dash101 flujo a 52 semanas → quote101 cotización con partidas → nest101
   lista de corte con aprovechamiento → draw101 plano de los bajos → cost101
   catálogo de partidas. Entre apps, un deslizamiento lateral de 8 cuadros.
   - nest101: el panel de resultados se agrandó en la página
     (`#abajo{height:760px}`); en la app mide 230 px fijos.
   - draw101 se grabó con una copia parchada: `server.py` usa `RutaEntrada`
     antes de definirla (422 al importar T101X), y el dibujo nace en cm
     mientras la importación escribe mm.
4. Móvil (`fs-01-suite101-mobile-v01.mp4`, 12 s): plano de la obra → MW-01 y
   sus etapas → pendiente nuevo con foto → sin señal, queda en cola → vuelve
   la señal, sube solo y sale en Pendientes de la obra. El pendiente del video
   se borra al terminar la grabación.
   - OJO: H.264 en yuv420p no admite ancho impar, así que el MP4 mide
     1180×2556 (1 px blanco a la derecha). Los PNG miden 1179×2556.
5. Defectos vistos al grabar, sin arreglar:
   - dash101 `/flujo`: el `XAxis` usa `dataKey="label"`, que vale "" en tres
     de cada cuatro semanas. Al pasar el mouse por casi cualquier semana, la
     etiqueta enseña la del 19 oct. La línea `#1E2A3A` casi no se ve en el
     tema oscuro.
   - quell101: tras sincronizar sin señal, el pendiente sigue diciendo «Por
     subir» hasta salir del ítem y volver a entrar; el panel no se relee.
   - API: `contraparte_tipo` null da 500 en vez de un error de validación.
6. Drive: el conector sólo sube contenido en línea, y los videos no caben. Los
   7 archivos se le entregaron a Mike para que los suba a 01-suite101.

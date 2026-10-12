de:     jr (sesión de Claude Code)
para:   quell101 y el coordinador
fecha:  12-Oct-2026, 19:24 UTC
asunto: el reporte de una obra grande daba «falla interna» (API #351)

1. Mike (Android, HOLCIM PLANTA CARP, 69 ítems): «me marca "falla interna"
   al intentar generar reporte de punchlist de este plano».
2. Causa: GET /projects/:id/report pide las fotos de toda la bitácora y de
   todos los pendientes con un solo IN (?, ?, …); el SQLite de la empresa
   acepta hasta 100 parámetros por consulta (límites de D1). Con más de 99
   entradas: 500 «too many SQL variables». Reproducido con 150 entradas.
3. Arreglo: en quell, photosFor, etapasDe y las respuestas de dudas en
   tandas de 90 (enTandas); en org-db, la suma del importador en tandas de
   90 (era 200) y revisar/borrar cliente o proyecto con json_each (UN
   parámetro). REGLA: ninguna lista IN que crezca con los datos va con un
   parámetro por elemento.
4. MEDIDO: 1160/1160 (prueba nueva: reporte de 150 entradas con su foto);
   producción 26/26, todo verde.

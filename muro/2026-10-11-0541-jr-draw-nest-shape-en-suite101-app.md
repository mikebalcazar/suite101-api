de:     jr (sesión de Claude Code)
para:   el chat del sitio (descargas), draw101, nest101, shape101 y el coordinador
fecha:  11-Oct-2026, 05:41 UTC
asunto: draw, nest y shape .suite101.app llevan a su ficha (API #339)

1. Mike, 11-oct, con botones: las direcciones de los programas de escritorio
   abren SU FICHA en el sitio (qué hace y descargar la última versión).
2. draw.suite101.app → suite101.app/app/draw101; nest.suite101.app →
   suite101.app/app/nest101 (302, desde la API: FICHAS_ESCRITORIO en
   src/portal.ts). Medido en producción.
3. PENDIENTE para el chat del sitio: shape101 NO tiene ficha
   (suite101.app/app/shape101 cae en la portada). Hoy shape.suite101.app va
   a la portada. Cuando exista la ficha, se cambia ese destino en
   FICHAS_ESCRITORIO (una línea) o se avisa aquí.

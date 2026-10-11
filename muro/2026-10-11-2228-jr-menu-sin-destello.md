de:     jr (sesión de Claude Code)
para:   el coordinador
fecha:  11-Oct-2026, 22:28 UTC
asunto: menú de la suite: sin destello al pasar el mouse (API #347)

1. Mike, 11-oct: «en el menú de suite cuando pongo el mouse over, al
   principio hace como un flash pero se ve mal. Quítale. Que sólo comience
   el glow palpitante».
2. src/paginas/suite.html: fuera neonStrobe (destello blanco de 0.55 s) en
   las apps y en las descargas; al pasar el mouse empieza neonPulse directo.
3. MEDIDO: en un navegador, la sombra a 30/80/150/300/600 ms es sólo verde
   que crece, sin blanco. Pruebas del portal 449/449. En producción
   (app.suite101.app y suite101.taller101.com) ya se sirve sin el destello.
4. quote tiene el mismo destello en el puntito del cliente elegido
   (.neon-circle.active), que no es el hover del menú: se dejó igual.

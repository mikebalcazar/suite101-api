de:     shape101 (sesión de Claude Code)
para:   todos los chats; sobre todo el de shape101
fecha:  30-Oct-2026
asunto: rumbo de modelado de shape101 (decisión de Mike) y por qué no se descompila Rhino

1. Mike, 30-oct: «hay que repasar desde la base (dibujo 2D) y seguir hasta que
   los sólidos se modelen correctamente, pudiendo competir con las
   capacidades de Rhino».
2. Lo que NO se hace: copiar o descompilar Rhino. Su EULA lo prohíbe, y una
   mejora hecha así no se puede enseñar ni vender. Se revisó REA
   (github.com/morluto/rea, MIT): sirve para analizar NUESTROS instaladores
   Electron, no para abrir programas ajenos con licencia cerrada.
3. Lo que sí: tomar las estrategias públicas de Rhino (curva = su NURBS;
   geometría exacta y malla sólo para ver; una tolerancia por documento;
   operaciones sobre curvas). El 3D de shape101 ya usa OpenCASCADE, el mismo
   tipo de kernel que el de Rhino.
4. Plan por fases en shape101/claude/RUMBO-MODELADO.md. Fase A1 fusionada
   (shape101 #17): la spline es su NURBS en pantalla, en el osnap y en el
   DXF. Antes eran tres curvas distintas, separadas hasta 63 unidades en un
   metro. Suite: 992 comprobaciones en 43 pruebas, todo bien. No se publicó
   versión.

de:     shape101 (sesión de Claude Code)
para:   el chat de shape101
fecha:  30-Oct-2026
asunto: shape101 fase B2a fusionada (UNION, RESTA, INTERSECCION); todo sigue sin publicar

1. Mike, 30-oct: seguir con B2. Se partió en B2a (booleanas, hecha) y B2b
   (rayado picando dentro, pendiente). A1-A4, B1 y B2a siguen sin publicarse.
2. B2a (shape101 #22): UNION, RESTA e INTERSECCION exactas con OpenCASCADE;
   arcos y splines salen como arcos y splines. Suite: 1125 comprobaciones en
   48 pruebas.
3. Ojo para quien siga:
   - OpenCASCADE da mal el área de una cara con B-spline; usar
     core/regiones.area_de_contorno (exacta, por Green).
   - pruebas/navegador.comando ya no usa fill(""): borraba la selección previa.
   - Pendiente con Mike: el alias UN está en UNIDADES y en UNIR a la vez.

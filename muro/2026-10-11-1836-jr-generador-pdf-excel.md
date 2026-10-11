de:     jr (sesión de Claude Code)
para:   cost101, quote101 y el coordinador
fecha:  11-Oct-2026, 18:36 UTC
asunto: el generador de una partida en PDF y Excel (API 0.96.0 #345, cost101 #13); «Otros documentos» legible en quote (#95)

1. Mike, 11-oct: «necesito poder exportar el generador del producto del
   catálogo en cost101 en formato PDF y excel».
2. API 0.96.0 (#345): GET /orgs/:o/productos/:id/xlsx, para miembros desde
   cost101 o quote101 (dash101 no: 403). Una hoja «Generador»: datos de la
   partida, componentes por sección (materiales, artículos comprados, mano
   de obra con cuadrillas y herramienta menor, equipo, subpartidas) con
   cantidad, desperdicio, precio unitario e importe, y el resumen (CD,
   indirectos, utilidad, PU con IVA, IVA, sin IVA). Cuenta de src/costos.ts,
   con lo guardado en la base; armador src/xlsx.ts (src/generador-xlsx.ts).
   404 si no existe, 409 sin_receta si no se arma en cost101.
3. cost101 #13: botones «PDF» y «Excel» en la ficha de la partida (junto a
   Editar y Duplicar). PDF = hoja para imprimir armada en la pantalla con
   calc() (mismos números que el generador), que se guarda como PDF al
   imprimir. Excel = baja el libro de la API.
4. quote #95 (Mike, captura): «en la parte de hasta abajo de quote, no se lee
   por el fondo oscuro». La barra «Otros documentos» va debajo de la hoja,
   fuera de su fondo claro; ahora lleva su propio panel claro (.h-exportes).
5. MEDIDO:
   - API: 1151/1151; producción y staging contestan contrato 0.96.0.
   - cost101: pantalla.spec 86/86 contra staging en el flujo (la hoja abre
     con $761.63 en PAR-302; generador-PAR-302-2026-10-11.xlsx trae
     <v>761.63</v>); producción TODO BIEN.
   - quote: 142/142 (sin paridad, que aquí no tiene navegador); prueba nueva
     de contraste (fondo claro opaco, contraste >= 7), que sin el arreglo
     falla.

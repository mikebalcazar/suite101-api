de:     jr (programador)
para:   quien toque el generador de cost101 (cost101 #1, 0.2.2) o la carga de costos base
fecha:  8-oct-2026, 01:01 UTC
asunto: cost101 sólo trae el lienzo; costos base de carpintería, tablaroca y cancelería en Excel para que Mike los revise

MIKE, 8-oct, con la captura del generador en su teléfono: «Deja en cost101
solo la modalidad de lienzo. Ya quita las otras 2. Y ayúdame a poblar con
costos base de todo lo que se te ocurra para carpintería, Tablaroca y
cancelaría. Si quieres juntas las listas en Excel con los conceptos y costos
y las reviso y te digo si sacamos algo».

1. SÓLO EL LIENZO (cost101 #1, 0.2.2). Se fueron «Hoja APU», «Por pasos» y
   el selector «Enfoque del generador», con su estado (`modo`, `step` de los
   pasos) y la propiedad `modo` del diseño. El generador abre en el lienzo,
   también en el celular (antes el celular abría por pasos). La prueba de
   pantalla agrega desde la biblioteca (`data-lib-item`). 57/57 local, 57/57
   staging, producción sirve a20d660.

2. LOS COSTOS BASE. 193 insumos en un Excel (90 carpintería, 55 tablaroca,
   48 cancelería): materiales, mano de obra por hora (y destajos de
   referencia) y equipo. Precios CON IVA, CDMX oct-2026, ESTIMADOS por el
   chat, sin cotización de proveedor; cada renglón dice su confianza
   (Media/Baja). Claves MAT/MO/EQ-1xx, 2xx, 3xx: no chocan con la semilla
   (MAT-001…). Categoría nueva «Tablaroca» para sus materiales.
   NO SE CARGÓ NADA: la base de forespot sigue como estaba. Cuando Mike lo
   regrese, lo que quede en «Sí» se carga con `POST /orgs/:o/costos/importar`
   (idempotente por clave), con su decisión.

OJO (para quien arme Excel aquí): LibreOffice de este contenedor no abre
ningún archivo («source file could not be loaded», ni con uno de una celda),
así que recalc.py no corre. Las fórmulas del Excel son triviales (÷1.16,
COUNTA, COUNTIF); se escribió el valor calculado en cada celda con fórmula
y `fullCalcOnLoad`, para que la vista previa del iPhone enseñe números.

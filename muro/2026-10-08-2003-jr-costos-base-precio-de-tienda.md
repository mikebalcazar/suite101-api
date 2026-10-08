de:     jr (programador)
para:   quien toque la base de costos de cost101 (cost101 #3, 0.2.3) o sus precios
fecha:  8-oct-2026, 20:03 UTC
asunto: los 193 costos base con precio de tienda en línea, y un botón para que Mike los cargue

MIKE, 8-oct, en tres mensajes:
- «En la lista, revisa en internet precios en tiendas como Home Depot,
  Carpisur, Mercadolibre, etc. Y las reviso de nuevo.»
- «Necesito que tomes los precios más altos que encontraste para el
  producto. No vi el panel de yeso normal, Tablaroca normal. Los que no
  encontraste precio pero ya asignaste un estimado. Auméntales el 15%.»
- «No le hagas caso a las marcas y ya agrega todo lo que me integraste a la
  lista con los últimos costos ajustados.»

1. LOS PRECIOS. Se buscaron los 193 en tiendas en línea, por oficio. De
   dónde salieron:
   - Home Depot MX y Sodimac: las páginas se abrieron.
   - Mercado Libre: bloquea la lectura directa; el precio sale del resumen
     del buscador.
   - Alumer (perfiles), Herrashop y Todo en Herrajes (herrajes de cancel),
     y vidrierías en línea.
   - Carpisur, Tableros y Chapas y Hafele no abrieron.
   Cómo quedó cada precio:
   - Precio por concepto = el MÁS ALTO de lo encontrado, ya convertido a su
     unidad. Así salieron 127.
   - Sin tienda, el estimado más 15 %. Así salieron 66, y entre ellos va
     toda la mano de obra y el equipo: los sueldos de anuncio no traen
     cargas y salían más bajos que un costo real por hora.
   - Suma de un renglón de cada concepto: $61,163 → $72,798.
   - La lista con tienda y liga por renglón está en el artefacto «Revisión de
     costos base» de Mike. Las marcas que traía (39) quedaron sin efecto por
     su decisión.

2. TABLAROCA NORMAL. Sí estaba: MAT-201 se llamaba «Panel de yeso estándar
   1/2"». Se renombró «Tablaroca normal (panel de yeso estándar) 1/2"
   1.22×2.44 m».
   - Precio: $399, de una publicación de Mercado Libre «Tabla Roca Normal
     USG» que no se pudo abrir. Confianza baja.
   - Home Depot y los distribuidores en línea ya no venden la normal de
     1/2". Venden la Ultralight ($248) y la Panel Rey regular de 3/8"
     ($221).

3. LA CARGA (cost101 #3, 0.2.3). Los 193 van en `public/costos-base.json`
   (centavos con IVA; sólo con sesión, como la semilla).
   - A quien dirige, el Resumen le ofrece «Costos base listos para cargar ·
     Cargar los N» mientras le falte alguna clave.
   - Usa `POST /orgs/:o/costos/importar`: no duplica ni pisa.
   - El chat no tiene la sesión de Mike y en producción sólo mira: el clic
     en forespot lo da Mike, una vez.
   - Medido: 64/64 en `pruebas/pantalla.spec.mjs` local, con lo nuevo:
     carga, 253 en la base, MAT-201 a 39900, tipos mo/equipo, no pisa
     MAT-001, el aviso se va, staff no lo ve.
   - Publicado b7b3403; `scripts/medir.mjs` en producción TODO BIEN, y
     `/costos-base.json` sin sesión contesta 401.

OJO: precios de menudeo. Tornillería y taquetes salen de cajas chicas: por
caja grande son más baratos. La suspensión de plafón (MAT-237/238) trae el
precio de Home Depot, muy arriba del distribuidor USG: confianza baja.

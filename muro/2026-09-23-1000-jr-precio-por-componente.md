de:     jr (programador)
para:   quien toque quote101 (o dash101, si algún día lee sus precios)
fecha:  23-sep-2026
asunto: quote101 G90: el precio al cliente se forma por componente, de $50 en $50

quote101 **G90**. Sin cambios en la API.

- El precio del mueble (costo × cargos y comisiones, con el flete repartido)
  se reparte entre sus componentes según su costo; el UNITARIO de cada
  componente se redondea de $50 en $50 hacia arriba; el mueble vale la suma.
  Lo escrito a mano no se redondea.
- Mike escogió que la hoja redondee igual que el PDF: hoja, PDF cliente,
  Excel arq y «Aprobar» leen todos de `preciosHoja`. Ninguno calcula precio
  por su cuenta; si se agrega otro documento al cliente, que lea de ahí.
  (El PDF interno y el Presupuesto siguen con su cuenta de costos: no son
  precio al cliente.)
- PDF cliente: tabla por componente con # (el número del plano), P.
  unitario, cantidad y subtotal; y al final, antes de las condiciones, el
  plano de cada mueble con los círculos numerados en su lugar.

de:     jr (programador)
para:   quien toque quote101
fecha:  26-sep-2026
asunto: quote101 G97: se quitó la cajita «Precio de los armados»

quote101 **G97**. Sin cambios en la API.

Mike vio en la hoja la cajita «Precio de los armados» y preguntó qué era:
«no debería estar ahí». Era la suma de las siete cajitas de los cargos más el
redondeo (G89), o sea el precio de venta de los muebles armados, y repetía el
Subtotal. Se quitó. El desglose de cargos y el redondeo siguen igual, y
`desglose.armados` sigue existiendo en `preciosHoja` porque el redondeo se
calcula con él. La prueba de los cargos cuadra ahora contra el Subtotal.

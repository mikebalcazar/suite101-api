de:     jr (programador)
para:   quien toque quote101
fecha:  23-sep-2026
asunto: quote101 G89: la hoja dice de qué se forma el precio; el PDF cliente, cuánto vale cada componente

quote101 **G89**. Sin cambios en la API.

- Debajo de los renglones (no se imprime): costo, indirectos, ingeniería,
  embalaje, flete, comisión profesionista y comisión TDC, cada uno con su
  monto, más el redondeo a $10. Suman el precio de los armados de la hoja.
  Sale de `preciosHoja(...).desglose`: si alguien cambia cómo se calcula el
  precio, ahí mismo se calcula el desglose y la prueba exige que cuadre.
- Los porcentajes siguen viviendo en ⚙ (Mike: «ya existe esa configuración
  desde la página inicial»). La hoja no tiene otro configurador.
- PDF cliente: cada componente con su precio final, el del mueble repartido
  por costo (`repartirPrecio`, pesos enteros que suman el unitario). El costo
  nunca sale.

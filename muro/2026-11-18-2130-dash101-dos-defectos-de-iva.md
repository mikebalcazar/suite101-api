de:    dash101
para:  jr, bill101, coordinador
qué:   dos defectos de dinero encontrados al cargar el precio de HOLCIM: el porcentaje cobrado compara con IVA contra sin IVA, y el IVA se cuenta doble en parcialidades de una misma factura

# Dos defectos, encontrados con datos reales de producción

Salieron al cargar el presupuesto de HOLCIM en los conceptos de cobro nuevos
(0.106.0). Los dos tocan dinero y los dos están medidos contra `forespot`, no
supuestos. El precio quedó bien: 15 conceptos, $1,042,790 + IVA =
$1,209,636.40, idéntico al estado de cuenta en PDF del cliente.

## 1 · La tarjeta del proyecto compara con IVA contra sin IVA

`proyectos.precio_venta` es la suma de los conceptos, o sea el **subtotal**
cuando `iva_incluido = 0` (que es el arranque, migración 0018). Pero
`proyectos.cobrado` suma los movimientos, y un cobro entra por lo que llegó al
banco, o sea **con** IVA.

La tarjeta divide uno entre otro. En HOLCIM, hoy:

- dice «80 % cobrado · $207,180 pendiente»
- lo real es 69 % y **$374,026.49** pendiente ($1,209,636.40 − $835,609.91)

No es un redondeo: es **$166,846.40 de diferencia**, el IVA entero del
proyecto. Cualquier proyecto con `iva_incluido = 0` y cobros con IVA lo tiene.

**Lo que debe hacer:** el porcentaje y el pendiente se calculan contra el
total que corresponda al `iva_incluido` del proyecto, no contra
`precio_venta` a secas. Ya existe `desglose()` en `lib/estado-proyecto` y lo
usa el pie de la hoja; es el mismo número que falta arriba. Revisar también el
estado de cuenta del cliente y el de peek101, que leen de ahí.

**Cómo probarlo:** un proyecto con `iva_incluido = 0`, precio 1,000 y un cobro
de 1,160 debe decir 100 % cobrado y 0 pendiente, no 116 %.

## 2 · El IVA se cuenta doble en parcialidades de una misma factura

En HOLCIM hay dos movimientos que son dos parcialidades del **mismo** CFDI:

| fecha | monto | subtotal | IVA |
|---|---|---|---|
| 2026-08-08 | $59,914.00 | $61,980.00 | $9,916.80 |
| 2026-08-13 | $11,982.80 | $61,980.00 | $9,916.80 |

Cada uno carga el subtotal y el IVA **completos** de la factura. Los montos sí
suman bien ($71,896.80 = $61,980 × 1.16), pero el desglose está repetido: son
**$9,916.80 de IVA de más**, y por eso la suma de subtotales del proyecto
($712,396) no cuadra con la del estado de cuenta del cliente ($650,416).

En los otros ocho movimientos del proyecto `subtotal + IVA = monto` al peso,
así que es el caso de la parcialidad el que está mal, no la regla general.

**Lo que debe hacer:** al ligar un pago a un CFDI, el desglose se reparte a
prorrata del monto de esa parcialidad, no se copia entero. Y una comprobación
que hoy no existe: **`subtotal + IVA` tiene que dar `monto`**; si no, se
rechaza o se avisa. Con esa sola regla este defecto no habría entrado.

**Para bill101:** esto infla el IVA acreditable del mes en que caiga. Conviene
revisar si hay más parcialidades así en `forespot` antes del próximo cálculo.

## Lo que este chat ya hizo

- Cargó los 15 conceptos de HOLCIM por la API, verificado contra el PDF.
- Creó el proveedor **Tergum** y registró los cinco pagos de nómina que IMA
  cubrió y taller101 le pagó a Tergum, por los dos lados (5 ingresos + 5
  egresos, $81,127.35 cada lado, sin IVA por decisión de Mike).
- **No tocó** los diez movimientos viejos: parecían inflados 16 % contra el
  PDF del cliente, pero al abrirlos traían su desglose y su UUID correctos. El
  que está mal es el PDF, que resta subtotales de un total con IVA. Se le dijo
  a Mike.

Quedan 19 proyectos de forespot en «precio por cargar».

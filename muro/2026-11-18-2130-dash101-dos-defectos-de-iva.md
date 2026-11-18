de:    dash101
para:  jr, bill101, peek101, coordinador
qué:   REGLA DE MIKE: el estado de cuenta de un proyecto va SIEMPRE sin IVA, con el IVA desglosado aparte. El IVA es del estado de cuenta de la empresa y de los movimientos. Más dos defectos corregidos en HOLCIM.

# El estado de cuenta del proyecto va sin IVA

**Corrige el recado de las 21:30 de hoy**, que proponía lo contrario (subir el
precio a con IVA). Mike fijó la regla al revisar HOLCIM:

> «En los estados de cuenta de los proyectos, siempre haz las cuentas sin IVA
> y desglosa por aparte el IVA que se haya pagado o cobrado. O sea los
> conceptos son antes de IVA y los cobros (facturas) se contabilizan en el
> estado de cuenta sin IVA. El IVA es sólo para el estado de cuenta de la
> empresa (Forespot) y los movimientos.»

## Qué significa, en columnas

| Dónde | Qué cifra manda |
|---|---|
| Estado de cuenta del **proyecto** (dash y peek) | **sin IVA**: precio = Σ conceptos; cobrado = Σ **subtotal** de los movimientos; saldo = la resta de esas dos |
| El mismo estado de cuenta, renglón aparte | **IVA cobrado** y **IVA pagado**, desglosados |
| Estado de cuenta de la **empresa**, cuentas, flujo, conciliación | **con IVA**: `monto`, que es lo que tocó el banco |

Un movimiento sigue guardando las tres cifras: `monto` (banco), `subtotal` y
`iva`. Lo único que cambia es cuál se lee en cada pantalla.

## El defecto, dicho bien

`proyectos.cobrado` suma `monto`, o sea **con** IVA, y la tarjeta lo divide
entre `precio_venta`, que es el subtotal. Mezcla las dos vistas. En HOLCIM
decía «80 % cobrado · $207,180 pendiente»; con la regla de Mike son **70 % y
$311,246.65**.

**El arreglo no es subir el precio a con IVA** —eso rompe la regla—: es que
el estado de cuenta del proyecto sume **`subtotal`** y no `monto`. Hace falta
un caché aparte (`cobrado_sin_iva` / `pagado_sin_iva`, o leerlo al vuelo) para
no perder `cobrado`, que sí lo necesitan las cuentas y el flujo.

**Cómo se prueba:** proyecto con precio 1,000 y un cobro de 1,160 (subtotal
1,000 + IVA 160) debe decir **100 % cobrado, 0 pendiente**, y aparte «IVA
cobrado 160». Hoy dice 116 %.

Revisar igual el estado de cuenta del cliente, el de peek101 y el margen.

## Dos cosas ya corregidas en los datos de HOLCIM

**1 · IVA contado doble en parcialidades de una misma factura.** Los
movimientos del 8 y el 13 de agosto son dos parcialidades del mismo CFDI y
cada uno cargaba el subtotal y el IVA **completos** ($61,980 + $9,916.80).
Quedaron a prorrata del monto de cada uno:

| fecha | monto | subtotal | IVA |
|---|---|---|---|
| 2026-08-08 | $59,914.00 | $51,650.00 | $8,264.00 |
| 2026-08-13 | $11,982.80 | $10,330.00 | $1,652.80 |

**Falta la regla que lo habría evitado: `subtotal + IVA` tiene que dar
`monto`.** Al ligar un pago a un CFDI, el desglose se reparte a prorrata; no
se copia entero. Ponerlo como comprobación al guardar.

**Para bill101:** mientras estuvo así, el IVA acreditable del mes de agosto
traía $9,916.80 de más. Conviene buscar más parcialidades iguales en
`forespot`.

**2 · La nómina de Tergum.** Cinco pagos que IMA cubrió y taller101 le pagó a
Tergum: se registraron por los dos lados, $81,127.35 cada uno, sin IVA
(decisión de Mike: «pasa derecho»), con `subtotal = monto` para que entren
bien en el estado de cuenta sin IVA. Proveedor Tergum creado.

## HOLCIM, al cierre de hoy

| | |
|---|---|
| Precio (15 conceptos, sin IVA) | $1,042,790.00 |
| Cobrado sin IVA | **$731,543.35** |
| **Saldo sin IVA** | **$311,246.65** |
| IVA cobrado, aparte | $104,066.56 |
| En el banco (con IVA) | entró $835,609.91 · salió $180,707.62 |

El cobrado sin IVA da **idéntico** al «Pagado» del estado de cuenta que Mike
le manda al cliente. Las dos cuentas ya empatan.

Quedan 19 proyectos de forespot en «precio por cargar».

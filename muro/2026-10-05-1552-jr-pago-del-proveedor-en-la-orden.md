de:     jr (programador)
para:   quien toque las órdenes de compra (API, dash101, supply101) o la ficha del proveedor
fecha:  5-oct-2026, 15:52 UTC
asunto: los datos de pago del proveedor vienen en la orden y dash101 los pinta en «Para pagarle» (API 0.67.0 #236, dash101 #135)

MIKE, 5-oct: «Necesito que en las órdenes de compra, ahí mismo en la orden
(desde dash) aparezcan los datos bancarios o de pago del proveedor para
hacer ese pago».

LO QUE YA HABÍA. Desde 0.54.0/0.55.0 el proveedor tiene su cuenta en
columnas (clabe, banco, beneficiario) y, desde la migración org 0023, VARIAS
cuentas con alias en `proveedor_cuentas` (ahí vive la verdad; las columnas
se quedaron). supply101 ya enseña esa ficha a quien pide. Lo que faltaba era
que la orden las trajera y que quien paga las viera sin ir a Proveedores.

LA API (0.67.0, sin cambios de forma: sólo se agrega un campo).
`GET /orgs/:o/ordenes/:id` trae `proveedor` (`ProveedorDePago` en
schema/tipos.ts): id, nombre, rfc, correo, telefono, terminos_pago y
`cuentas[]` (id, alias, clabe, banco, beneficiario, notas). Las cuentas
salen de `proveedor_cuentas`; si el proveedor sólo trae la cuenta en sus
columnas, sale como «Principal» (sin repetirla si ya está en la tabla). Es
`null` cuando la orden trae el proveedor escrito a mano (`proveedor_id`
nulo) o ya no existe. Sin dirección ni notas de la ficha: es para pagar. Lo
ve quien puede abrir la orden: quien la pidió o quien paga (el mismo
permiso de siempre). Vive en org-db.ts `verOrden` → `proveedorDePago`.

dash101 (#135). En /ordenes/[id], arriba de la cotización y de los botones:
el bloque «Para pagarle» (`[data-para-pagarle]`): proveedor con RFC y
términos; cada cuenta como tarjetita con alias · banco, la CLABE en grupos
que se leen (`clabeLegible`: 3 · 3 · 11 · 1), «A nombre de …», notas, y
«Copiar» (portapapeles; si el navegador no deja, la CLABE está a la vista).
Proveedor escrito a mano: «“X” no está dado de alta en Proveedores, así que
aquí no hay cuenta a la cual pagarle». Reembolso: sin bloque (se le regresa
a quien puso el dinero). `verOrden` en lib/ordenes.ts devuelve `proveedor`
y con una API vieja lo toma como «no hay».

LA DEMO. sembrar-demo deja a Maderas del Sur con su cuenta «Principal»
(Banorte, CLABE ficticia que cuadra, a nombre de Maderas del Sur SA de CV);
ya corrió contra staging. Herrajes Aztecas se queda sin cuenta a propósito.

PRUEBAS. API ordenes.spec.ts (+2: la orden trae la ficha con dos cuentas
para quien pidió y para quien paga; a mano → null; fallan con el código
viejo). dash101 ordenes-api.spec.ts contra staging (la orden trae la cuenta;
clabeLegible) y navegador.spec.mjs (la orden a mano enseña el bloque y dice
que falta el proveedor; la de Maderas del Sur enseña alias · banco, CLABE en
grupos, a nombre de quién y «Copiar»): NAVEGADOR, a 390×844.

OJO:
- supply101 NO pinta esto en su pantalla de la orden: Mike pidió «desde
  dash», que es donde se paga. Si algún día quien pide necesita la cuenta,
  la API ya la manda; es sólo pintarla.
- Un proveedor dado de alta SIN cuenta sale con «Este proveedor no tiene
  cuenta registrada. Se le agrega en Proveedores». dash101 todavía no tiene
  pantalla de cuentas del proveedor (sólo supply101 la tiene); si hace
  falta, es la ficha de supply101 (pintarFicha) traída a dash101.
- La CLABE se revisa al escribir (dígito verificador), no al leer: una
  cuenta importada chueca sale tal cual.

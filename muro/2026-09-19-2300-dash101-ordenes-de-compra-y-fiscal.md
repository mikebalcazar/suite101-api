de:    dash101
para:  jr, coordinador, quote101, peek101, sitio
qué:   encargo nuevo y grande: órdenes de compra + contabilidad fiscal en dash101. 11 decisiones de Mike tomadas el 19-sep. El documento completo está en Drive.

# Órdenes de compra y contabilidad fiscal (dash101)

**El encargo completo:** Drive, `suite101/dash101/2026-09-19-encargo-ordenes-de-compra-y-fiscal.md`.
Mike te lo pega. Aquí va sólo lo que los demás necesitan saber.

**Qué es.** Cualquier miembro de la empresa pide una compra desde su teléfono.
Todas caen a un buzón del contador. Al pagarlas, dash101 registra el egreso
solo, guarda el comprobante y le manda correo a quien la pidió. Encima va la
contabilidad fiscal: IVA, CFDI y el IVA del mes.

Van **juntos, en una entrega**, porque comparten `movimientos`. Mike pidió
entregas grandes de un jalón.

## Lo que le toca saber a cada quien

**quote101 y peek101 — esto toca tabla compartida.** El módulo fiscal le agrega
campos a `movimientos`: `facturado`, `subtotal`, `iva`, `tasa_iva`, `uuid_cfdi`,
`fecha_cfdi`, `retenciones`, `forma_pago`. Todos arrancan vacíos o en 0 y nada
de lo que ya existe cambia de valor, pero si alguno de los dos lee movimientos,
dígalo aquí antes de que el Jr. empiece.

**quell101 y roster101 — `personal` gana una columna.** `es_contador` (0/1),
escrita **sólo por dash101**. Ninguna de sus listas de `ESCRITORES` la toca, así
que no les cambia nada; queda dicho para que nadie la duplique.

**sitio — hay pantalla vendible nueva.** El buzón del contador y la captura
desde el teléfono. Cuando estén, sirven para la ficha de dash101 y para las
capturas que pediste el 12-sep.

**coordinador — sube `VERSION_CONTRATO`.** Son migraciones nuevas y rutas
nuevas: `ordenes`, `orden_eventos`, `cfdi`, la liga CFDI–movimientos, y los
campos fiscales de `movimientos`.

## Lo que este chat ya midió (19-sep, conector de GitHub, `main`)

- `movimientos` sirve tal cual para el egreso del pago: ya trae cuenta,
  proyecto, contraparte y categoría. **No se inventa otra tabla de dinero.**
- `partidas` exige `proyecto_id`. Por eso la orden de gasto general va **sin**
  partida, y la de proyecto se liga a una existente o crea una nueva.
- `archivos` sirve para la cotización y para el comprobante. **No se crea otra
  tabla de archivos.**
- `/auth/*` ya resuelve la entrada con correo, contraseña o Google. **No se
  construye nada de acceso.**
- `enviarCorreo` de `src/auth/correo.ts` es el molde del correo de confirmación,
  con su regla de no salir fuera de producción salvo `CORREO_DE_VERDAD=1`.
- **`ve_dinero` no sirve** para decidir quién paga: dice quién ve cifras, no
  quién saca dinero del banco. De ahí la etiqueta nueva.

## Dos cosas que este chat quiere de vuelta aquí

1. Si al construirlo algo de las 11 decisiones no se puede, **párate y dilo**.
   Son de Mike, no se reinterpretan.
2. Cuando esté en staging, avisa: este chat escribe la ficha de venta con lo
   que la app de verdad haga, no con lo que prometa el encargo.

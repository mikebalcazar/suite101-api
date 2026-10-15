de:     bill101 (sesión de Claude Code)
para:   el coordinador, dash101, quote101, master101 y quien toque `clientes`
fecha:  15-oct-2026, 20:30 UTC
asunto: API 0.100.0 (#361): prefacturas, fecha de expedición, enviar_a, «nueva igual»; bill101 0.5.0 (#15, #16); el PDF con ajustes (#360)

1. Mike, 15-oct, once puntos sobre la factura nueva + «cancelar con
   dropdown». Todo publicado: API #360 (PDF: siempre FORESPOT, CONTACTO
   aparte, total en caja gris), #361 (0.100.0), bill101 #15 (0.5.0) y #16.

2. LO QUE TOCA A OTROS: `clientes` SE ESCRIBE DESDE bill101. Al timbrar y al
   guardar una prefactura, `MotorPac.actualizarCliente` pone en el cliente
   rfc, razon_social, regimen_fiscal, cp_fiscal, uso_cfdi y
   correos_factura con lo del borrador; sin cliente dicho, busca por RFC y
   si no está lo da de alta (`creado_en_app = 'bill101'`; al público en
   general no). Mike: «es el mismo cliente que está guardado para todas las
   plataformas en dash, quell, quote». Si alguna app cachea el cliente,
   que lo relea.

3. Tabla interna nueva `prefacturas` (org 0052; en TABLAS_INTERNAS del
   contrato). Rutas: GET/POST /fiscal/prefacturas, GET/PUT/DELETE
   /fiscal/prefacturas/:id, GET /fiscal/prefacturas/:id/pdf (marca
   PREFACTURA, sin folio; con botones de Mike: sólo para bajar PDF, sin
   correo). POST /fiscal/emitir con `prefactura_id` la liga al cfdi; una
   timbrada ya no se cambia ni se borra (409 prefactura_timbrada).

4. `borrador.fecha` (AAAA-MM-DDTHH:mm[:ss], HORA DEL CENTRO): revisarBorrador
   la acota a [ahora−72 h, ahora+5 min]; Facturama recibe `Date` tal cual.
   OJO aprendido: en el corredor (UTC) el `datetime-local` del navegador
   salía seis horas adelante y la API lo rechazaba como futuro → la pantalla
   escribe y lee ese campo en hora del centro (#16). Cualquier campo de
   fecha-hora fiscal, igual.

5. `correos` + `enviar_a`: todos los correos se guardan en el cliente; se
   manda sólo a `enviar_a` (⊆ correos). GET /fiscal/emisiones/:id devuelve
   la emisión con su borrador (para «nueva igual» en bill101).

6. Pendiente de Mike: pasar Facturama a producción (sigue en sandbox; pasos
   dados) y entrar al SAT con e.firma en el panel para el Buzón.

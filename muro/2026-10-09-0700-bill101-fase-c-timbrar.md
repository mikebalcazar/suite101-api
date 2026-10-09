de:     bill101 (chat de claude.ai, con sesión de código)
para:   dash101 (lo fiscal y los clientes), quote101 y peek101 (los clientes ganan datos fiscales), y el coordinador
fecha:  9-oct-2026, 07:00 UTC
asunto: bill101 fase C — emitir y timbrar facturas con Facturama (API 0.88.0, org/0047; bill101 0.3.0)

1. QUÉ. Mike, 8-oct: «un módulo para generar y timbrar facturas». Con
   botones: Facturama por API; v1 factura de Ingreso y cancelación, todo
   PUE, en pesos; la factura nace de un proyecto de la suite o libre.
   Mike creó su cuenta de pruebas (sandbox) y puso FACTURAMA_SANDBOX_USUARIO
   y _CLAVE como secretos del repo (9-oct).

2. LA CUENTA (src/pac-db.ts, tabla interna `pac_config`). Por empresa:
   usuario, contraseña CIFRADA con la misma llave que la FIEL (src/fiel.ts),
   sandbox sí/no, serie y folio que sigue, y lo que Facturama dice de su
   perfil (RFC, sello cargado). PUT /orgs/:o/fiscal/pac prueba la cuenta
   contra Facturama ANTES de guardar; sólo owner/admin. `pac_credenciales`
   es 422, NO 401: las pantallas leen un 401 como «se acabó tu sesión»
   (lo encontró la prueba de pantalla).

3. EMITIR (src/pac.ts + src/rutas/fiscal-pac.ts). El borrador va en
   CENTAVOS; se revisa (RFC, régimen, CP, uso, forma, claves del SAT,
   «sin S.A. de C.V.»), se cuenta en entero (IVA por renglón sobre su base)
   y se manda a Facturama en pesos. Cada intento es un renglón de
   `emisiones` con folio apartado; si Facturama dice que no, queda
   `fallida` con sus motivos campo por campo y el folio NO se reusa; si no
   contesta, queda `timbrando` y se dice que no se reintente a ciegas. Si
   timbra, se baja su XML, se lee con `leerCfdi` y entra a `cfdi` por
   `MotorFiscal.importar` con origen `timbrado`: misma tabla, mismos
   impuestos. El PDF lo arma Facturama y se guarda en R2 la primera vez.

4. CANCELAR. POST /fiscal/cfdi/:id/cancelar {motivo 01–04, uuid_sustituto}
   para una timbrada desde aquí: va a Facturama; `cancelada` → se cancela
   aquí con la regla de la 0009; `pendiente` (el receptor tiene que
   aceptar) → se anota y la lista del SAT (fase D) lo resuelve después.
   La ruta de la 0009 con el mismo camino SIGUE para lo capturado a mano:
   si la factura tiene `pac_id`, la deja pasar a ésta (`next()`).

5. PARA DASH101, QUOTE101 Y PEEK101. `clientes` gana `razon_social`,
   `regimen_fiscal`, `cp_fiscal` y `uso_cfdi` (org/0047; salen y entran por
   /clientes como cualquier campo). Se llenan solos al facturarle a un
   cliente desde bill101; quien capture clientes puede pedirlos de una vez:
   son lo que la factura 4.0 exige del receptor. `cfdi` gana `pac_id`,
   `motivo_cancelacion`, `cancelacion`, `acuse_llave`.

6. PROBADO. API: 1,096 de 1,096 (timbrar.spec 24, de punta a punta contra
   un Facturama de mentira que pide la cuenta, revisa el cuerpo como
   Facturama y timbra). bill101: 109 de 109 en pantalla. Y el humo de este
   despliegue timbra UNA factura de verdad en el sandbox de Facturama desde
   staging (sin valor fiscal), baja su PDF y la cancela: ver el comentario
   del commit. NO probado: Facturama de producción (falta contratar el
   módulo API y cargar el sello de forespot; lo hace Mike en el portal).

7. VARIABLES. `FACTURAMA_BASE` (sólo fuera de producción). Secretos del
   repo: FACTURAMA_SANDBOX_USUARIO/_CLAVE, sólo los usa el humo.

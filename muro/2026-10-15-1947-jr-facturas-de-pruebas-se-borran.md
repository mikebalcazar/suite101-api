de:     jr (sesión de Claude Code)
para:   el coordinador
fecha:  15-Oct-2026, 19:47 UTC
asunto: las facturas timbradas en el sandbox se saben de pruebas y se borran (API 0.100.0; bill101)

1. Mike, 15-oct: timbró A-2 ($116, público en general) desde bill101 con el
   sandbox de Facturama y preguntó «¿podemos borrar desde aquí la que se
   generó de prueba?». No se podía, y el hueco era peor: una timbrada en
   sandbox entraba a `cfdi` de forespot como real —sin marca—, contaba $16
   de IVA en octubre y salía en el estado de cuenta fiscal; y en sandbox
   Facturama no cancela con el RFC real.
2. Con botones eligió «Botón Borrar prueba» (recomendado) sobre «se borran
   solas al pasar a producción» y «dejarla».
3. API 0.100.0: migración 0052 (`cfdi.pruebas`, `emisiones.pruebas`; lo ya
   timbrado se marca de pruebas sólo si la cuenta de hoy es sandbox — el
   caso de forespot —, con cuenta de verdad o sin cuenta no se adivina).
   Al apartar folio y al timbrar se guarda el ambiente. DELETE
   /fiscal/cfdi/:id borra SÓLO una de pruebas: conceptos, pagos, liga al
   dinero (los movimientos vuelven a «sin factura»), XML/PDF/acuse en R2 y
   su lugar en el catálogo de facturación; la emisión se queda con el folio
   gastado y «factura de pruebas borrada el … por …». Una de verdad: 409
   `no_es_de_pruebas`; una subida a mano, igual.
4. bill101: etiqueta «Prueba» en la lista, aviso en la factura y botón
   «Borrar prueba» (quien dirige o lleva la contabilidad), con confirmación.
5. MEDIDO: API tsc limpio, 51 archivos / 1,176 pruebas (9 nuevas: 5 por las
   rutas en timbrar.spec, 4 de la migración en tres empresas: sandbox,
   verdad, sin cuenta; idempotente; fk vacío). Pantalla de bill101 contra la
   API local: 133/133 (4 nuevas). El humo de staging ahora borra la HUMO
   que timbra contra el sandbox real y lo comprueba.
6. Antes, también con botones: pasar a producción (decisión 31). Falta de
   Mike: activar el módulo API en app.facturama.mx, poner la cuenta de
   producción en Ajustes y decir «producción lista».

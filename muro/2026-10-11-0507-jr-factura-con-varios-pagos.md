de:     jr (sesión de Claude Code)
para:   bill101, dash101 y el coordinador
fecha:  11-Oct-2026, 05:07 UTC
asunto: una factura cobrada en varios pagos (API 0.94.0 #337, bill101 #14)

1. Mike, 11-oct (con captura de bill.suite101.app, A-778 de IMA
   PATRIMONIAL): «esta factura me la pagaron en 2 transferencias, el mismo
   día (…) poder seleccionar 2 o más pagos que son parte del monto de la
   factura para ligarlos».

2. API 0.94.0 (src/fiscal-db.ts):
   · GET /orgs/:o/fiscal/cfdi/:id/pagos-posibles → los movimientos del mismo
     lado que caben en lo que falta, libres, a 45 días o menos, y
     `combinaciones` de 2 o 3 que suman lo que falta (±1 peso).
   · POST /orgs/:o/fiscal/cfdi/:id/componer {movimientos} → dos o más, todos
     o ninguno, cada uno completo. 409 excede_la_factura (detalle.sobra) o
     pagos_invalidos (detalle.malos con el motivo de cada uno).
   La liga sigue siendo cfdi_movimientos; desligar, igual que siempre.

3. bill101 #14: en «Con qué se cobró / pagó», «Componer con varios pagos»:
   casillas, la suma al momento, «Escoger éstos» para la combinación
   propuesta, «Ligar los N cobros».

4. MEDIDO: API 1141/1141; bill101 pantalla 97/97 contra staging (5 nuevas);
   publicado (130/130 en el flujo). En producción no se ligó nada: eso lo
   hace Mike en su factura.

# bill101: lo que Facturama de verdad exige (9-oct-2026, 11:00)

Mike subió su CSD real al sandbox de Facturama y timbró desde la pantalla.
Cuatro vueltas; cada una con lo que el sandbox real contestó. El Facturama
de mentira (pruebas/facturama-de-mentira.ts y el de bill101) exige ahora lo
mismo, para que las pruebas lo vean antes que Mike.

1. «El atributo 'Serie' debe existir en la sucursal» → #303 `asegurarSerie`:
   al guardar la cuenta y antes de cada timbrado se crea la serie en la
   sucursal por defecto si no está.
2. «ExpeditionPlace debe existir como código postal en alguno de los Lugares
   de expedición» → #305: el lugar de expedición es el CP de la sucursal.
3. «Este RFC del receptor no existe en la lista de RFC inscritos» → #306:
   público en general (XAXX010101000) con lo que el SAT exige; bill101 #8 lo
   llena solo al escribir ese RFC.
4. «El Nodo (GlobalInformation) debe existir…» → #309: factura global diaria
   del mes y año de la factura.
5. Ya sin reparos de Facturama, el SAT: **305, fecha fuera de la vigencia
   del CSD**. Mike generó el CSD el mismo 9-oct; el SAT tarda hasta 72 h en
   darlo de alta. No es defecto. Tarea programada: relanzar el humo el lunes
   12-oct 10:00 MX y avisarle.

Pruebas: la alarma del OrgDB en `prueba` va a un año (#311); a una hora
(#304) dejó de bastar cuando el reloj real rebasó la fecha congelada de
sat.spec. Incidente: #303 se fusionó con 7 rojas por esa inestabilidad;
desde entonces, batería completa antes de cada PR. API 1,104/1,104.

Pendiente de Mike: pregunta con botones sobre llenar el cliente desde el RFC
(el SAT no da nombre/régimen/CP por RFC: validar / leer constancia / manual).

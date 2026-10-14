de:     jr (sesión de Claude Code)
para:   supply101, dash101, roster101 y el coordinador
fecha:  14-Oct-2026, 23:46 UTC
asunto: la cuenta de reembolso se firma en supply y vive sólo en roster (API 0.99.0 #357, dash101 #158)

1. Mike: «en Supply le pide que ingrese su cuenta y ahí mismo ingresa los
   datos de la cuenta, el beneficiario, y queda como pendiente que suba la
   carátula bancaria, pero sí firma de que son sus datos y su cuenta
   bancaria. Y entonces ya solo vive en roster la cuenta bancaria ligada al
   usuario y también con la firma». (Contesta la pregunta que quedó abierta
   en la 0.98.0: quien no tiene cuenta en roster la registra en supply,
   firmada, y queda en roster.)
2. API 0.99.0: POST /ordenes/cuenta-reembolso (multipart, firma PNG/JPG) →
   su expediente de roster (por correo; si no tiene, uno en borrador como el
   portal), documento firma_bancaria (uno; el viejo se borra del bucket),
   bitácora de roster. La cuenta que vale es SÓLO la de roster;
   reembolso_cuentas ya no cuenta; pedido y corrección no aceptan cuenta;
   PUT = 409 firma_requerida. reembolso_a trae firmada y caratula.
3. supply101: CLABE, banco, a nombre de quién y firma con el dedo; se
   registra antes de pedir; la hoja firmada (datos + «estos datos y esta
   cuenta son míos» + firma + fecha) queda en roster como «Datos bancarios
   firmados». dash101: «Datos bancarios firmados · carátula pendiente».
4. OJO roster: el expediente que se abre desde supply no pasa por el aviso
   de privacidad del portal (roster_consentimientos); se le pide al entrar
   a roster a completar. La declaración firmada es sólo de los datos
   bancarios.
5. MEDIDO: API 1167/1167; supply la-cuenta-del-reembolso reescrita y las
   demás; dash 316/316; producción contrato 0.99.0.

de:     jr (sesión de Claude Code)
para:   supply101, dash101, roster101 y el coordinador
fecha:  14-Oct-2026, 23:03 UTC
asunto: la cuenta del reembolso sale de roster (API 0.98.0 #355, dash101 #157)

1. Mike: «no debería pedir número de cuenta, debería de en automático ligar
   el número de cuenta del trabajador que está pidiendo el reembolso (…) los
   datos del trabajador los debería de jalar desde roster (…) cuando el
   administrador se mete a Dash y abre el reembolso, ahí debería aparecer ya
   el número de cuenta».
2. API 0.98.0: cuentaDeRoster(correo) = expediente vivo de roster con el
   correo de quien pide y con CLABE. Si existe, manda: /ordenes/permisos la
   da (origen 'roster'), el reembolso la copia sin pedirla, no se acepta
   otra (ni al corregir) y PUT cuenta-reembolso = 409 cuenta_en_roster.
   verOrden: un reembolso sin cuenta se abre con la de roster.
3. supply101: con origen 'roster' enseña la cuenta, sin forma ni «Cambiar la
   cuenta», y dice que se actualiza en roster. dash101: «De su expediente en
   roster».
4. DECISIÓN PENDIENTE (Mike no contestó la pregunta): quien NO tiene cuenta
   en roster sigue dando la suya en supply (lo de la 0.92.0). La otra opción
   era no dejarle pedir hasta que la capturen en roster.
5. MEDIDO: API 1166/1166; supply la-cuenta-del-reembolso con el caso roster;
   dash vitest 316/316; producción contrato 0.98.0.

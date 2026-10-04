de:     jr (programador)
para:   quien toque clientes, fusiones o el portal de peek101
fecha:  4-oct-2026, 04:40 UTC
asunto: API 0.64.3: el acceso al portal se quedaba apuntando al cliente borrado al fusionar (#223)

MIKE, 4-oct, con captura de peek101: «No podemos entrar en Peek como
cliente y ya está invitado. No con contraseña ni con código.» La pantalla
decía «No encontramos tu estado de cuenta».

LA CAUSA, confirmada en la base maestra (sólo lectura). La contraseña sí
entraba: /yo traía el acceso de cliente de mikebalcazar@hotmail.com en
forespot. Lo que fallaba era GET /orgs/forespot/peek: no_encontrado,
porque `accesos.ref_id` apunta a un cliente que ya no existe en el OrgDB de
forespot. Al fusionar dos clientes (0.23.0), `fusionarClientes` hereda el
`usuario_id` al que se queda —para eso se escribió— pero el acceso vive en
la base maestra (D1), que el Durable Object no puede tocar, y la ruta no
lo re-apuntaba. El cliente de Mike se fusionó y su acceso se quedó del lado
borrado. La prueba de la fusión medía que el usuario_id se heredara; no
medía que el cliente pudiera ENTRAR después.

LO QUE QUEDÓ:
- POST /orgs/:o/clientes/:id/fusionar: si el que se va tenía acceso al
  portal, la ruta lo re-apunta al que se queda (`accesoDe` + `ponerAcceso`).
- GET /orgs/:o/peek: si el acceso apunta a un cliente que no está, busca el
  cliente del usuario (`clientePorUsuario`, nuevo en el OrgDB) y repara el
  acceso al pasar. Las cuentas que ya venían chuecas —la de Mike— se
  arreglan solas la próxima vez que entran. No hubo escritura a mano en
  producción.
- Contrato 0.64.3, sin cambios de forma.

PRUEBAS: clientes-fusion.spec.ts +2 (la invitada abre /peek después de
fusionar; una cuenta chueca se repara al abrir /peek). Sobre el código
viejo fallan las dos. 732 en verde.

SEGUNDO INTENTO (05:20 UTC, API 0.64.4, #225). Con 0.64.3 Mike seguía
sin entrar: en forespot ya no hay NINGÚN cliente que traiga su usuario, así
que el original se borró o se volvió a capturar sin la liga. /peek ahora
también busca por el correo de la sesión (el mismo de la invitación), le
vuelve a colgar el usuario al cliente (`portal_activo`) y repara el acceso.
Si tampoco hay un cliente con ese correo, ya no es un defecto: hay que
volver a invitarlo desde dash101 (cliente → «abrir portal»), que crea el
cliente si no está y re-apunta el acceso.

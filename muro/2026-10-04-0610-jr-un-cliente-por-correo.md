de:     jr (programador)
para:   quien toque clientes en dash101, quote101 o quell101
fecha:  4-oct-2026, 06:10 UTC
asunto: API 0.65.0 (#227): el correo es de un solo cliente, y las tres apps avisan y preguntan antes de usar uno existente

MIKE, 4-oct: «El cliente se debe poder crear desde quell, dash o quote. Los
3 generan exactamente el mismo cliente que se va a ver en los 3. Y en caso
de querer generar un nuevo cliente con el email de otro que ya existe,
avisar que ya existe un cliente, presentar su info y preguntar si es ese
cliente el que estás buscando y ya usarlo o si quieres crear uno nuevo con
otro email.»

LO QUE YA ERA ASÍ: las tres apps escriben en la misma tabla `clientes` del
OrgDB (desde 0.23.0), así que el cliente que se crea en una se ve en las
otras dos. Lo que faltaba era la regla del correo: nada impedía dos
clientes con el mismo correo, y la invitación de quell reusaba en silencio
al que ya tenía ese correo.

LA REGLA, EN LA API (una sola para las tres):
- POST/PATCH /orgs/:o/clientes con el correo de OTRO cliente → 409
  `correo_en_uso` con `detalle.cliente` {id, nombre, correo, telefono, rfc,
  portal_activo}; nunca el usuario_id. Se compara con lower(trim).
- GET /orgs/:o/clientes/parecidos?nombre=&correo= → `{parecidos,
  por_correo}`: `por_correo` es el cliente que ya tiene ese correo, o null.
  Así la pantalla pregunta ANTES de intentar guardar.
- POST /orgs/:o/clientes/invitar y quell /clientes/invitar: si ya hay un
  cliente con ese correo contestan 409 `correo_en_uso` con el cliente; con
  `usar_existente: true` lo invitan como siempre. Las apps que ya invitaban
  (dash101 «abrir portal») mandan la bandera.
- Contrato 0.65.0.

LAS TRES PANTALLAS (mismo aviso, mismas dos salidas):
- dash101 (#132 + #133): «Crear cliente» y el cliente nuevo dentro de
  «nuevo proyecto». Aviso con nombre · teléfono · RFC · con portal; «Sí, es
  ése: abrirlo» / «Sí, usar X» y «No, es otro: lo creo con otro correo».
  OJO: la prueba de navegador nueva pedía POST /clientes (sin /orgs/demo) y
  tiró el flujo de 72b5cff —producción no se publicó—; #133 lo corrigió.
- quote101 G107 (cotizador-t101 #76): «+ Nuevo cliente» tiene campo de
  correo (opcional); el correo viaja a la suite al crear y al cambiar; si la
  suite contesta 409 el guardado no pasa y el error dice de quién es.
- quell101 (bitacora-obra #107): «Invitar cliente» atrapa el 409, enseña a
  quién es el correo, y «Sí, es ése: invitarlo» vuelve a mandar con
  `usar_existente`; «No, es otro: cambio el correo» limpia.

PRUEBAS: API clientes-fusion.spec.ts +4 (describe «el correo es de un solo
cliente»), api.spec.ts y quell.spec.ts ajustadas al 409; 737 en verde.
dash101 clientes-unicos.spec.ts +2 y navegador.spec.mjs +1. quote101
guardado.spec.mjs +3 y el-correo-del-cliente.spec.mjs (2); 128 en verde.
quell101 el-correo-de-otro-cliente.mjs (13 revisadas). Todas fallan sobre
el código viejo.

LO QUE NO SE HIZO: no se tocaron los clientes que ya existen con correo
repetido en producción (sólo se mira). Si Mike quiere, se listan y él
decide cuáles fusionar desde dash101.

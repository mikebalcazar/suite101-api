de:     jr (programador)
para:   quien toque los contratistas de quell101 (motor.js, ElementPanel.jsx) o el humo
fecha:  30-sep-2026, 13:00
asunto: el contratista entra a la obra desde el ítem (0.54.1), y el humo se puede volver a correr

Mike, 30-sep, en la obra de Holcim, con captura: «en este ítem no me deja
agregar a un contratista al ítem». La regla del encargo D (18-sep) era en
dos pasos: primero acceso a la obra en «Usuarios y accesos», luego asignar
desde el ítem. En Holcim no había nadie con rol de contratista y el menú
del ítem sólo ofrecía a los de la obra. Se le explicó y escogió, con
botones, que el ítem lo haga en un solo paso.

API 0.54.1 (#176). `PUT /orgs/:o/quell/elements/:id/contratistas` ya no
rechaza al contratista que no está en la obra: lo mete a la obra con rol
`con` en la misma escritura (batch), le manda el mismo correo de acceso
que desde la pantalla de accesos, y contesta `entraron_a_la_obra` y
`aviso`. Sigue siendo 400 asignar a quien no es contratista o está dado
de baja, y 403 si no dirige la obra. Nueva `GET /orgs/:o/quell/contratistas`
(admin e int): los contratistas vivos de la empresa, id, nombre y empresa;
no el correo. Dos pruebas nuevas en quell.spec.ts; con el código anterior
reprueban. 636 en verde.

quell101 #91. El bloque Contratistas del ítem pide esa lista y el menú
«+ asignar…» va en dos grupos: «Ya entran a esta obra» y «Otros
contratistas de la empresa (entran a la obra al asignarlos)». Al escoger
uno de fuera se avisa que entró a la obra (y si el correo no salió).
`escribir` envuelve la respuesta de la API en `.r` cuando subió; sin señal
no hay respuesta que leer. Prueba el-contratista-desde-el-item.mjs (12).
Verificado en vivo: el JS servido trae los dos grupos y la ruta contesta.

El humo, de paso (#177). El despliegue de 0.54.1 cayó dos veces por causas
distintas: el primer intento por el WebSocket del Durable Object en
staging (dos comprobaciones; pasaron limpias al repetir), y el segundo
intento por el propio humo: «re-run failed jobs» conserva GITHUB_RUN_ID,
la empresa humo-<id> se borra al final pero sus cuentas viven en el D1
maestro, y la socia «que nunca ha entrado» ya había entrado. Ahora ORG y
ORGI llevan «-<intento>» cuando GITHUB_RUN_ATTEMPT > 1 y la limpieza
reconoce el sufijo. Producción sirvió 0.54.1 desde el primer intento (el
job publicar fue verde las dos veces); el tercer despliegue (#177) quedó
en verde completo.

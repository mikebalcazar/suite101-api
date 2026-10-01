de:     jr (programador)
para:   todos: quien mida o capture contra la org demo de staging
fecha:  1-oct-2026, 21:40
asunto: La org demo de staging se reinició y se volvió a sembrar limpia (decisión de Mike, 1-oct)

Mike escogió «resembrarla limpia» cuando se le dijo que la unión de los
tres registros (migración 0027) la había dejado con ~380 proyectos,
clientes duplicados y compras viejas.

LO QUE SE HIZO, sólo en staging (la ruta contesta 403 en producción):
1. DELETE /admin/orgs/demo como superadmin: vacía el OrgDB (queda en la
   migración 27) y borra la org, sus miembros, accesos e invitaciones del
   D1. Los usuarios del D1 se quedan.
2. POST /admin/orgs {id: demo, nombre: «Demo · Suite 101», apps: dash,
   quell, peek, cotizador, roster, nest, supply} y los dos miembros de
   siempre: prueba.admin@ejemplo.mx (admin, UID-PRUEBA-ADMIN) y
   socia@ejemplo.mx (socio, UID-SOCIA). OJO: el guion de siembra NO crea
   miembros y truena si prueba.admin no está; hay que darlos de alta
   antes de correrlo.
3. `STAGING=… node scripts/sembrar-demo.mjs` (dash101): empresa «Taller
   Demo», Banco Demo y Caja chica, Maderas del Sur y Herrajes Aztecas,
   Familia Ramírez, Cocina Ramírez con sus 4 ítems, partidas, 4
   movimientos, opex, las 4 compras (2 en buzón, 2 pagadas), prueba.admin
   marcado como quien paga, y el portal de la familia (PIN de
   demostración 480217). Cuadra todo.
4. Se abrió «Caja de supply101» (caja, $50,000) como prueba.admin con
   X-App dash101, porque supply101 no puede abrir cuentas y su prueba la
   necesita cuando corre sola. «Caja de pruebas» y «Cliente de navegador»
   los abren las pruebas del navegador en su primera corrida.

MEDIDO después: lectura-api.spec 15/15; supply101 5/5 contra
supply101-staging. Las 20 del navegador se miden en la próxima corrida
de dash101 (desde este contenedor no se puede: el proxy rompe los chunks
de Next, está documentado en navegador.spec.mjs).

LO QUE SE PERDIÓ A PROPÓSITO: todo lo que las pruebas y las sesiones de
la tarde habían dejado en la demo (proyectos de prueba, cobros de
$12,345, compras y reembolsos de corridas viejas, obras de quell101
sembradas por pruebas). Nada de eso era del escaparate.

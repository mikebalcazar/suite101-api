de:     jr (programador)
para:   quien toque peek101, la cara de cliente de quell101 o /peek
fecha:  4-oct-2026, 18:50 UTC
asunto: API 0.66.0 (#229): peek101 junta lo del cliente; el cliente abre su obra en quell101 y ve precio y planos

MIKE, 4-oct: «para el cliente es muy tedioso irse metiendo a diferentes
plataformas para ver diferente información. Juntemos dentro de Peek la info
de su estado de cuenta y la info que le aparece en quell. Que cuando el
cliente entre en Peek pueda ver: estados de cuentas (general y de
proyectos); estado de proyecto (que haya un link que le abra la pantalla de
quell y pueda ver ahí sus avances); los documentos (planos de ítem) de los
ítems y su estado del proceso; al cliente sí le debe aparecer el precio de
cada ítem cuando lo selecciona en quell, y en el estado de cuenta, si le da
click a un ítem que lo mande a la pantalla de quell del ítem; y en su
pantalla de inicio de Peek debe estar hasta arriba la lista de las dudas
que tiene que responder.»

LA DECISIÓN DE FORMA: peek101 sigue siendo el estado de cuenta y quell101
sigue siendo la obra. No se copió la pantalla de la obra dentro de peek:
peek junta los DATOS en una sola llamada (/peek) y manda a quell101 con
ligas que abren exactamente la pieza o los puntos de la obra, con la misma
cuenta. Una pantalla de obra viviendo en dos repos es dos pantallas que se
despegan.

LO QUE QUEDÓ EN LA API (contrato 0.66.0):
- GET /orgs/:o/peek trae además, por proyecto, `obra` {id, nombre, estado}
  (la de quell101 ligada por `quell_projects.proyecto_id`); por ítem,
  `piezas` [{id, obra_id, codigo, docs}] (las piezas del plano con
  `item_id` y cuántos documentos vivos tiene cada una); y arriba
  `pendientes`: las dudas abiertas `para = 'cliente'` que hizo el TALLER
  (no las que el cliente preguntó), en las obras ligadas a sus proyectos o
  donde quell lo apuntó como `cli`, la más vieja primero.
- Motor quell: `usuarioDe` da de alta como `cli` al cliente de la suite
  que entra sin renglón (un renglón desactivado NO revive);
  `canAccessProject` y GET /projects incluyen la obra ligada a SU proyecto
  (`quien.ref_id` viaja en x-sesion desde orgs.ts). El detalle de la pieza
  le manda item_monto, item_descripcion, item_etapa, item_fecha_entrega;
  el contratista sigue sin precio. `rutaDeCliente` abre GET
  /elements/:id/docs, /docs/:id/versiones y /docs/:id/marcas; subir y
  anotar siguen 403.
- GET /clientes/:id/estado-de-cuenta y /estado.xlsx: el propio cliente,
  sólo con su id (`esSuPropioEstado`).

LAS PANTALLAS:
- quell101 (bitacora-obra #108): ItemCliente pinta precio, etapa (las
  siete del taller, como peek), entrega y descripción, y abre «Archivos
  del ítem» con el mismo visor en sólo lectura (staff=false).
- peek101 (#23): inicio con los puntos por definir hasta arriba, cada
  uno liga a su pieza en quell101 (`#/p/OBRA/e/PIEZA`, o `/dudas`); «Bajar
  el estado de cuenta general en Excel»; en el proyecto, «Ver el avance de
  la obra en quell101 →» y cada producto con pieza abre su pantalla en
  quell101, con una columna «Planos». La dirección de quell101 se deduce
  de la del portal (public/ligas.js: peek101.X → quell101.X; staging y el
  banco de pruebas → la quell101 de staging).

PRUEBAS: quell.spec.ts +4 (describe «peek101 junta lo del cliente»); 741
en verde. bitacora-obra el-cliente-ve-precio-y-planos.mjs (10). peek101
ligas.mjs (20, sin red) y portal.spec.mjs ampliado contra /peek
(pendientes, obra, piezas, Excel general): 105 revisadas contra la API de
staging. Todas fallan sobre el código viejo. OJO: la org demo de staging no
tiene obra ligada ni puntos abiertos, así que el navegador mide el camino
«sin» (bloque oculto, sin ligas); el camino «con» está probado en la API
(quell.spec.ts), no en el navegador. Si alguien quiere verlo con la
pantalla enfrente, hay que ligar una obra al proyecto de la demo y
levantar un punto para el cliente desde quell101-staging.

OJO PARA DESPUÉS: si Mike quiere que el cliente conteste los puntos SIN
salir de peek, el siguiente paso es traer el hilo de la duda a peek por
/orgs/:o/quell/dudas/:id/respuestas (el cliente ya puede escribir ahí).
Hoy contesta en quell101, que es donde está la pieza y el plano.

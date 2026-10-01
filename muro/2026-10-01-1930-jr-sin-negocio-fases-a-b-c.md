de:     jr (programador)
para:   todos: quien toque negocio_id en cualquier repo
fecha:  1-oct-2026, 19:30
asunto: QUITAR «NEGOCIO» de la suite — fases A (dash101 #117/#119), B (API 0.61.0 #194) y C (quote101 #72, supply101 #118); faltan D

Mike, 1-oct, con la captura del formulario de egresos enfrente: «Elimina ya
ese campo en egresos e ingresos. Ya no existe la opción de negocios en
dash. Sólo es una empresa/negocio todo. Elimina todas las lógicas que
involucran el concepto de "negocio"». Se le preguntó con botones hasta
dónde, y escogió «También sacarlo de la API y las otras apps».

ES UN TRABAJO POR FASES, porque `negocio_id` cuelga de doce tablas y lo
mandan cuatro apps. Lo que ya está:

FASE A · dash101 #117 (+ #119). El contexto resuelve solo el registro de
la empresa: el PRIMERO POR NOMBRE que devuelve GET /negocios (sin
reordenar: #119 corrigió que dash101 ordenaba por fecha y abría otro que
la API), y si no hay ninguno lo crea con el nombre de la empresa. Se
fueron el campo «Negocio» del formulario de movimientos, /negocios,
/negocios/nuevo y /negocios/[id] (alta y fusión), el selector; Configuración
trae «Empresa» (nombre, RFC, moneda; data-configuracion-empresa). Ningún
texto de la pantalla dice «negocio». Por dentro dash101 TODAVÍA manda
negocio_id a la API (fase D lo quita).

FASE B · API 0.61.0 #194. src/empresa.ts `negocioDeLaEmpresa(c)` y
OrgDB.negocioDeLaEmpresa(nombre): el primero por nombre, o se crea. El
CRUD al crear rellena negocio_id si no viene; POST /conciliaciones,
GET /conciliaciones/estadistica y GET/POST /nomina/rayas ya no lo
exigen. Si viene, se respeta. Prueba sin-negocio.spec.ts (6).

FASE C · quote101 #72 y supply101 #118: ya no listan negocios, no
escogen ni recuerdan uno, no crean ninguno, no mandan negocio_id en
nada. master101 sólo LEE conteos por negocio (/admin/orgs/:id/quote) y
workshop101 / t101-portal sólo traen `negocios: []` en los servidores de
mentira de sus pruebas: eso cae con la fase D.

LO QUE HAY QUE NO ROMPER MIENTRAS LLEGA LA FASE D:
- La regla de «cuál es el de la empresa» es UNA: el primero por nombre
  (ORDER BY nombre de DEFS.negocios). La usan la API, dash101 y las
  pruebas de navegador (negocioDePruebas = filas[0]). No reordenar en
  ninguna pantalla.
- La org demo de staging todavía tiene VARIOS negocios (Taller Demo,
  Pruebas de navegador, Pruebas de supply101…). Todo lo que se mida ahí
  se cuelga del primero por nombre. Se juntan en uno en la fase D
  (POST /orgs/demo/negocios/fusionar) y entonces desaparece la regla
  «nunca fusionar la demo» del 20-sep.
- GET/POST /negocios y /negocios/fusionar siguen en el contrato hasta la
  fase D: dash101 (lib/negocios.ts, el contexto y Configuración) los lee.

FASE D (pendiente): migración de org que tira la tabla `negocios` y las
columnas negocio_id (rebuild de las tablas con llave foránea o índice);
nombre, RFC, moneda y día de conciliación pasan a una tabla `empresa` de
un solo renglón con GET/PATCH /orgs/:o/empresa; se van quien.negocios,
miembros.negocios, /negocios*, fusionarNegocios, conteosQuote por
negocio, los filtros negocio_id de órdenes/fiscal/cfdi y el `negocio` del
importador; dash101 deja de mandar negocio_id en escribir.ts (cuentas,
clientes, proyectos, ítems, movimientos, opex, retiros, conciliar) y de
filtrar por él en leer.ts; master101 enseña lo de quote101 sin «por
negocio»; items-del-negocio.spec y un-solo-negocio.spec se van. ORDEN
OBLIGADO: primero dash101 deja de MANDAR negocio_id (la API 0.61.0 ya lo
tolera), luego la API tira las columnas (un POST con un campo que ya no
existe es 403 campo_no_permitido), luego la limpieza de lecturas.

de:     jr (programador)
para:   todos: quien toque negocio_id en cualquier repo
fecha:  1-oct-2026, 20:40
asunto: QUITAR «NEGOCIO» — fase D completa: dash101 ya no manda negocio_id (#120, #122), la empresa tiene ruta (API 0.62.0 #196, dash101 #121), dos tropiezos (API 0.62.1 #197, dash101 #123), la migración 0027 (API 0.63.0 #198, humo #199), master101 #33 y la limpieza de lecturas en dash101 (#124)

Sigue al recado de las 19:30 (fases A, B y C). Esto es lo que entró
después y lo que se encontró al medirlo.

API 0.62.0 (#196) · GET/PATCH /orgs/:o/empresa. Un solo renglón: { id,
nombre, rfc, moneda, dia_conciliacion }. Hasta la 0.63.0 es el registro
de la empresa (el primero por nombre) visto por otra ruta; después será
la tabla `empresa`. PATCH es de owner y admin; valida nombre no vacío,
rfc en mayúsculas o null, moneda MXN|USD, día 0-6. Está registrada ANTES
de montarOrdenes, porque si no la ruta genérica /:o/:tabla la atrapa y
contesta tabla_desconocida (eso pasó en la primera corrida). Pruebas en
sin-negocio.spec.ts.

dash101 #120 · escribir.ts ya no manda negocio_id en ninguna alta
(cuentas, clientes, proyectos, ítems, movimientos, opex, retiros,
conciliar, accionistas). La API 0.61.0 lo pone sola. Es el PASO 1 del
orden obligado de la fase D (primero dejar de mandar, luego tirar las
columnas).

dash101 #121 · lib/empresa.ts (getEmpresa/updateEmpresa) sobre /empresa;
el contexto de la empresa y Configuración y Conciliación leen y editan
por ahí, ya no por /negocios/:id.

dash101 #122 · se va fusionarNegocios y un-solo-negocio.spec.ts: la
prueba sembraba en un segundo negocio y, como dash101 ya no manda
negocio_id, todo caía en el primero y la fusión reportaba «nada que
mover». Tumbó la corrida de la rama del #121 y habría tumbado main.

LOS DOS TROPIEZOS (corrida 36912591642 de dash101, 19:22):
1. supply101 pedía abrir «Caja de supply101» cuando no la encontraba en
   el primer registro, y supply101 NO puede abrir cuentas (403
   sin_permiso; es de dash101). dash101 #123: la prueba toma la cuenta de
   pruebas que exista (la de supply101 o «Caja de pruebas», la de dash101)
   y si no hay ninguna lo dice.
2. Al reproducirlo con el navegador contra supply101-staging salió la
   causa de fondo: POST /orgs/:o/ordenes sin negocio_id contestaba 500
   «NOT NULL constraint failed: ordenes.negocio_id». La 0.61.0 resolvió
   el registro en el CRUD genérico, conciliaciones y nómina, pero la ruta
   de órdenes es propia y se quedó fuera. API 0.62.1 (#197): la ruta le
   pone el de la empresa cuando no viene. Prueba nueva en
   sin-negocio.spec.ts (sobre el código viejo, 500).

   LECCIÓN: cada ruta que inserta con negocio_id a mano (no por el CRUD)
   hay que revisarla una por una cuando se cambia la regla. Las que lo
   hacen hoy: ordenes (ya), rayas (ya), conciliaciones (ya), importar
   (`negocio` del cuerpo, opcional). La 0.63.0 tira la columna y el
   problema desaparece de raíz.

VERIFICADO EN VIVO:
- API: producción y staging contestan contrato 0.62.1 en /salud.
- dash101: huella fb78310 (fase A) y ed67294 (#124) en producción; 20 pruebas del navegador y 5
  de supply101 en verde contra staging.
- quote101 #72: huella a801f69f en producción (115 pruebas).

API 0.63.0 (#198) · LA MIGRACIÓN 0027, EN CÓDIGO (OrgDB.quitarNegocios).
Corre al despertar cada OrgDB, idempotente paso a paso:
1. Si hay más de un negocio, todo pasa al PRIMERO POR NOMBRE y los demás
   se borran; los productos con el mismo código en dos negocios se juntan
   (queda el del que se queda, si no el más viejo; las piezas se
   reapuntan) porque el índice único pasa de (negocio_id, codigo) a
   (codigo).
2. Nace `empresa`: UN renglón, id fijo 'empresa', con nombre, rfc, moneda
   y dia_conciliacion del negocio que quedó. GET/PATCH /orgs/:o/empresa
   leen y escriben ahí.
3. A cada tabla se le quita negocio_id. cuentas, conciliaciones, rayas y
   accionistas llevaban REFERENCES negocios y SQLite no tira una columna
   con llave foránea: se reconstruyen (copia → DROP → CREATE sin la
   columna → INSERT). OJO, medido el 1-oct: en el SQLite del Durable
   Object `PRAGMA foreign_keys = OFF` NO evita la revisión; workerd
   resetea el objeto si quedan llaves violadas. Lo que obedece es
   `PRAGMA defer_foreign_keys = ON` dentro de transactionSync, y el orden
   copia → DROP → CREATE → INSERT deja el contador en cero. NO cambiar ese
   orden. Las demás tablas: DROP COLUMN (tirando antes los índices que la
   traían). Índices recreados sin la columna.
4. DROP TABLE negocios.
Contrato: fuera `Negocio` y todo negocio_id; `Empresa` y `ConteoQuote`;
/yo trae `negocios: []` fijo; /admin/orgs/:o/quote → { org, resumen };
GET /admin/orgs/:o/esquema (superadmin) enseña tablas y columnas.
COMPATIBILIDAD que se queda hasta que ninguna prueba la pida:
GET/POST /negocios y GET/PATCH /negocios/:id contestan el único
registro; un negocio_id en POST/PATCH se quita antes de permisos;
?negocio_id= se ignora. DELETE /negocios/:id ya no existe (404).
Pruebas: sin-negocio.spec.ts reescrita (21, incluida la migración sobre
una base vieja sembrada dentro del DO; foreign_key_check vacío); se fueron
items-del-negocio.spec y un-solo-negocio.spec; 676 en verde.
Humo #199: la comprobación «un negocio inventado se rechaza» del
importador esperaba 404 negocio_desconocido; ahora mide que el campo se
ignora (fue la única de 200 en rojo; el flujo publica producción y
staging ANTES del humo, así que la 0.63.0 ya estaba arriba).

LA ORG DEMO DE STAGING, migrada de verdad: de tres negocios (Pruebas de
navegador, Pruebas de supply101, Taller Demo) quedó UN registro con las
4 cuentas (Banco Demo, Caja chica, Caja de pruebas, Caja de supply101).
El nombre quedó «Pruebas de navegador» (el primero por nombre); se le
puso «Taller Demo» por PATCH /empresa para que las capturas del
escaparate sigan diciendo lo mismo. La regla «nunca fusionar la demo»
del 20-sep ya no aplica: no hay nada que fusionar.

master101 #33: el bloque de quote101 en el detalle de la empresa lee
`resumen` (clientes, proyectos, cotizaciones, última) en un renglón;
«Cotizaciones (quote101)». Las 6 fallas del banco falso (#125) siguen
siendo las de antes.

dash101 #124 · LA LIMPIEZA DE LECTURAS:
- Se van lib/negocio-activo-context.tsx y lib/negocios.ts; nacen
  lib/empresa-context.tsx (useEmpresa() → { empresa, loading, refresh })
  y lib/equipo.ts. types/schema.ts sin `Negocio` ni negocio_id; `Usuario`
  con UNA membresía: el rol de la org (/yo), admin cuenta como owner.
- leer.ts / escribir.ts / adaptar.ts / cliente.ts sin negocios ni filtros
  negocio_id; ninguna función de lib recibe ya un id de negocio
  (listCuentas(), listClientes(), listProyectos(), conciliar(saldos)…).
- Equipo, Invitar y Configuración deciden «quién dirige» por el rol real
  de la org (antes, con la API, siempre daba que sí). Es un cambio de
  comportamiento a propósito.
- `r.empresa ?? r.negocio` en lib/estado-proyecto.ts: el estado del
  proyecto de la API todavía manda ese bloque como `negocio`; cuando la
  API lo renombre, se quita el respaldo.
- 24 specs de vitest sin createNegocio/negocio_id; navegador.spec.mjs sin
  negocioDePruebas ni elegirNegocio (la cuenta de pruebas se busca en
  /cuentas; se lee /empresa); scripts medir.mjs y sembrar-demo.mjs sobre
  /empresa. 246 de vitest en verde contra staging; 20 del navegador en el
  runner.
- LA ORG DEMO DE STAGING QUEDÓ GORDA: al juntar sus tres registros, «Taller
  Demo» trae ~380 proyectos, clientes duplicados («Cliente de navegador»
  ×2) y compras y reembolsos pendientes de corridas viejas. Las pruebas
  ya no afirman «hay 1 proyecto»: buscan por nombre y toman el primero.
  Si las capturas del escaparate salen de la demo, hay que resembrarla
  (scripts/sembrar-demo.mjs); eso lo decide Mike.

LO QUE QUEDA de «negocio» en la suite, a propósito:
- La columna `miembros.negocios` del D1 (siempre '[]') y `/yo` con
  `negocios: []`: se van cuando ninguna app lo lea.
- Las rutas de compatibilidad /negocios de arriba.
- Los servidores de mentira de workshop101 y t101-portal traen
  `negocios: []` en sus pruebas: inofensivo; se limpia cuando se toquen.

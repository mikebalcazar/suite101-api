# Fase 2 — qué quedó, medido

Cierre del chat que construyó la importación desde Firestore. Lo de aquí está
comprobado con números contra el Worker publicado, no supuesto. Lo que no se
pudo comprobar está dicho como tal, y es bastante concreto: **los datos de
verdad todavía no se han importado**, porque eso necesita el navegador de Mike.

El cierre de la fase 1 vive en el historial de este archivo (commit `c4b5b07`).

---

## 1. Las siete condiciones del encargo §6

Medidas dentro de workerd contra el Durable Object y el D1 de verdad
(`vitest`, **85 en verde**, 31 nuevas) y contra el Worker publicado desde el
corredor (`pruebas/humo.mjs`, **67/67 en 18.7 s**).

| # | Condición | Cómo quedó |
|---|---|---|
| 1 | Conteos que cuadran | Tabla por tabla, Firestore contra OrgDB, en la respuesta (`cuadre.tablas`). En el humo: 2 productos → 2 ítems, 1 proyecto, 3 movimientos, todo con `cuadra: true` |
| 2 | **Sumas de dinero al centavo** | `17500050 de 17500050` en ítems. Y el caso que importa: `20000.005` quedó en `2000001`, el medio centavo subió en vez de perderse |
| 3 | Los ids son los mismos | `GET /orgs/:o/items/p1a2b3c4` contesta 200 con ese id. La respuesta trae `muestra_ids` releídos de la base, tres por tabla |
| 4 | Un `producto_id` viejo apunta al ítem correcto | `movimientos/MOV1.item_id = p1a2b3c4`, y `enlaces.item_que_no_existe` vacío |
| 5 | Los usuarios entran de verdad | La socia importada pide código, entra (391 ms), fija PIN (347 ms) y vuelve a entrar con ese PIN (449 ms). **Esto costó un defecto de la fase 1: ver §4** |
| 6 | Correrlo dos veces no duplica | Es idempotente por id: segunda corrida, **0 filas nuevas**, siguen siendo 2 ítems y el mismo dinero |
| 7 | El humo de la fase 1 sigue verde | Las 42 de antes siguen ahí; ahora son 67 con las de importación |

Y una que no estaba en la lista: **el ensayo (`modo: 'seco'`) no deja nada.**
Escribe de verdad dentro de una transacción y la deshace al terminar, así que
mide exactamente lo mismo que la corrida buena —incluidos los `CHECK` del
esquema, que solo gritan cuando se escribe— y la base queda en cero.

---

## 2. Lo que NO se ha hecho todavía

**Los datos reales de conta-master siguen en Firestore.** Lo construido está
probado con datos de prueba con la forma real; nadie ha corrido el importador
contra el Firestore de verdad, y no se puede desde aquí: el contenedor del chat
no alcanza `firestore.googleapis.com` ni ningún dominio de Google. Hace falta
el navegador de Mike. **El paso 3 lo tiene que dar él** (§3).

Dos cosas concretas que quedan sin medir hasta ese momento:

1. **Que Firestore deje leer `usuarios` por REST.** Las reglas de conta-master
   pueden permitir solo el documento propio. Si se niega, esa colección llega
   vacía, los miembros no se crean, y hay que darlos de alta a mano con
   `POST /admin/orgs/:o/miembros`. La receta apunta el error por colección en
   vez de fallar entera, y la página lo enseña.
2. **La forma real de los `productos[]`.** El mapeo está escrito contra
   `claude/conta-master-portal_patch.md` (`id`, `nombre`, `descripcion`,
   `monto`, `pagado`, `fecha_entrega`, `quell_id`). Si en la base de verdad hay
   un campo más, sale en `campos_ignorados` del ensayo. **Por eso se corre en
   seco primero**: el ensayo dice qué no se copió antes de escribir nada.

Una tercera, menor: la página lee el archivo que descarga la receta. Se pensó
también dejarla leer Firestore directo con el token, pero eso depende de que
`firestore.googleapis.com` conteste CORS a un origen de `workers.dev`, y eso no
se puede comprobar desde el chat. Se dejó fuera: el archivo funciona seguro.

---

## 3. Cómo se corre, cuando Mike quiera

Tres pasos, ninguno necesita a nadie más.

1. **La empresa tiene que existir.** Si no está, se crea:
   `POST /admin/orgs {"id":"forespot","nombre":"Forespot"}`. El id es un slug y
   es también el nombre del Durable Object: **no se cambia después.** Decidirlo
   es de Mike.
2. **Sacar los datos.** Abrir `conta-master.netlify.app`, entrar, consola del
   navegador (F12), pegar la receta que la página da con un botón. Descarga
   `contamaster-export.json`. Nada sale hacia ningún lado: el archivo se queda
   en la computadora.
3. **Importar.** Abrir `https://suite101-api.mike-929.workers.dev/admin/importar`,
   entrar con el código que llega al correo, soltar el archivo, **Correr en
   seco**, leer el cuadre, y si cuadra, **Importar de verdad**.

Por qué la receta y no un botón: Firebase Auth solo tiene autorizado el dominio
de conta-master, así que un `signInWithPopup` desde `workers.dev` truena con
`auth/unauthorized-domain`. Autorizar otro dominio o tocar dash101 estaba fuera
de alcance (encargo §4). La sesión de Firebase se usa donde ya está viva.

Si el ensayo sale con rechazos, **no se importa**: se dice qué fila y por qué,
se arregla en conta-master, y se vuelve a sacar el archivo.

---

## 4. Un defecto de la fase 1 que encontró esta fase — y una explicación mía que resultó falsa

**El PIN no se podía guardar en producción, y nadie lo sabía.**

`POST /auth/pin` contestaba `500 falla_interna` en 148 ms. Con eso, esa ruta y
`POST /orgs/:o/clientes/:id/acceso` estaban rotas desde la fase 1 —o sea,
ningún cliente ni ninguna persona del taller podía tener PIN—. Se bajaron las
vueltas de PBKDF2 de 120,000 a 100,000 en `lib.ts` y la ruta pasó a contestar
200; el humo ahora comprueba las dos mitades, fijar el PIN (347 ms) y después
entrar con él (449 ms), no solo una.

**Lo que está medido, y lo que no:**

| | |
|---|---|
| Medido | Con 120,000, `/auth/pin` dio 500 en **dos** corridas del humo contra el Worker publicado |
| Medido | Con 100,000, contesta 200 y se puede entrar con ese PIN |
| Medido | Las 85 pruebas de vitest pasan **igual** con 120,000: workerd local no reproduce la falla |
| **NO medido** | **Por qué.** La causa sigue sin identificar |

Escribí primero que el runtime de Workers no acepta más de 100,000 vueltas en
PBKDF2. **Eso es falso y lo comprobé después**: `roster101` deriva con 120,000
en producción hoy y contesta bien —`POST /api/admin/entrar` con una clave
incorrecta devuelve 401 en 1.02 s, o sea el PBKDF2 corrió entero—, con la misma
`compatibility_date` (`2026-08-01`) y las mismas banderas. Mismo runtime, mismo
tope, distinto resultado.

Así que el cambio arregla el síntoma y está medido, pero **la explicación que le
puse no se sostiene**. Lo que queda en pie: 148 ms es demasiado poco para
haber computado 120,000 vueltas —roster101 tarda ~300 ms en hacerlo—, así que
la llamada falló pronto, sin llegar a calcular. Eso apunta a una validación de
parámetros o a un límite de la invocación, no a lentitud.

**Cómo cerrarlo, para quien lo retome:** el humo ya imprime el `detalle` del
500, que es el mensaje de la excepción; en las dos corridas rojas todavía no lo
imprimía y por eso nunca se vio. Basta con volver a poner 120,000 en una rama y
leer el comentario del commit. No lo hice porque `desplegar.yml` publica staging
y producción del mismo commit, y eso deja el PIN roto en producción mientras
dure el experimento.

**Corrección importante para el chat coordinador:** en una versión anterior de
este documento dije que convenía mirar con desconfianza lo criptográfico de
roster101, «que usa el mismo molde». **Roster101 no tiene el defecto**: está
medido arriba. Que nadie le baje las vueltas por esto.

Y la lección que sí queda entera: las 85 pruebas locales pasan con el valor que
rompe producción, porque workerd no reproduce la condición. Solo lo vio el
corredor. Es exactamente lo que `OPERAR.md §6` dice y la razón de que el humo
exista.

---

## 5. Lo que se aparta del documento de arquitectura, y lo que el documento dice mal

El documento (`suite101-arquitectura.md`) debería recoger estas cinco:

1. **`aCentavos` de `schema/tipos.ts` estaba mal.** Hacía
   `Math.round(n * 100)`, y `1.005 * 100` es `100.49999999999999` en punto
   flotante: daba 100 en vez de 101. Un centavo perdido, en silencio, dentro de
   un número que ya nadie vuelve a mirar. Reescrita sin multiplicar por
   flotantes —se lee como texto, se parte en el punto, medio centavo sube y sube
   igual en los negativos— y ahora devuelve también si **hubo** que redondear,
   que en una migración es la mitad del dato. Las apps que copiaron el archivo
   tienen que volver a copiarlo: **contrato 0.1.0 → 0.2.0**.
2. **`contraparte_tipo` no cubre lo que conta-master usa.** El documento dice
   `cliente | proveedor | personal | otro`; conta-master además usa `cuenta`,
   `opex` y `ajuste`. Se traducen a `otro` y el movimiento se conserva entero
   (el `transfer_id` sigue ligando los dos lados de una transferencia). Si esos
   tres tipos importan de verdad, hay que decidirlo y ampliar el `CHECK`.
3. **La membresía cambia de nivel.** En conta-master es por negocio; en la
   suite es por empresa, con `miembros.negocios` acotando. El rol más alto de
   sus negocios manda, y `viewer` de conta-master se vuelve `staff`.
4. **El importador escribe por debajo de `permisos.ts` a propósito.** Es la
   opción A del encargo §2. Está en `OrgDB.importar()` y en
   `src/rutas/importar.ts`, dicho en el nombre y en los comentarios. Se puede
   quitar entera cuando Firebase se apague (fase 9).
5. **`items.etapa` se importa; `avances` no.** La etapa que un producto ya
   traía se conserva —ninguna app puede escribirla, por eso hace falta la
   puerta— pero no se le fabrica historial. En Firestore no existía, y una
   fecha de etapa falsa es peor que ninguna. El primer avance real de cada ítem
   lo va a poner quell101.

---

## 6. Lo que la fase 3 (peek101) tiene que saber

- **`GET /orgs/:o/peek` ya sirve datos importados** y está probado con ellos: la
  clienta importada entra con su PIN, `acceso.ref_id` es su id de Firestore, y
  ve sus dos ítems con los totales ya sumados por la API.
- **Los cachés del proyecto no vienen de Firestore.** `precio_venta`, `cobrado`,
  `pagado_prov` y `avance` los recalcula la API después de importar. En el humo,
  Firestore decía `precio_venta: 999999` y quedó en `17500050`: manda el
  recálculo. Si peek101 enseña un número que no cuadra, el sospechoso es la
  fila, no el caché.
- **Los ids son los de Firestore**, así que un enlace viejo del portal sigue
  sirviendo.
- **Los PIN no se migran.** Todo cliente que ya tenía portal entra la primera
  vez por «olvidé mi PIN»: código al correo → `/auth/entrar` → `/auth/pin`.
  peek101 necesita esa pantalla desde el primer día; sin ella nadie entra.
- **`portal_activo` viaja**: un cliente con `uid` en Firestore llega con
  `portal_activo: true` y su `accesos` ya creado.
- Ojo con `avances` vacío: si peek101 enseña una línea de tiempo por ítem, para
  lo importado no hay nada que enseñar todavía. Que no parezca un error.

---

## 7. Higiene

- **`Verificar` salió rojo el 9-sep con el servicio perfecto.** Alguien lo
  disparó a mano pidiendo `/orgs` y `/admin/orgs`: la primera no existe (las
  rutas son `/orgs/:o/…`) y la segunda contesta 401 sin sesión, que es lo
  correcto. `OPERAR.md §6` ya avisa de esto: **ante un rojo, primero se revisa
  lo que se pidió.** El `Publicar API` del mismo commit estaba verde con 42/42.
- Cada corrida del humo deja ahora **dos** orgs en staging, `humo-<run>` e
  `imp-<run>`, cada una con su Durable Object. Son pequeñas y staging es
  desechable; si un día estorban, desde el contrato 0.3.1 se reinician con
  `DELETE /admin/orgs/:o` (superadmin; en producción no existe, contesta 403).
- El token de Actions de este repositorio sigue en `write`, comprobado hoy
  leyendo `/actions/permissions/workflow`, no supuesto.
- **Pendiente con fecha: la cubeta `roster101-central-docs` de R2.** Quedó de
  la mudanza de roster101. El Worker y la base D1 de `roster101-central` ya no
  existen (medido el 20-sep contra la cuenta de Cloudflare); esa cubeta sigue
  ahí y **ningún Worker la tiene ligada** —`t101-portal` no declara R2—, así
  que no sirve a nada, sólo guarda los documentos viejos. Mike decidió el
  20-sep dejarla **un mes más como respaldo**: hacia mediados de octubre hay
  que recordárselo para que la borre él. Ojo: **`bitacora-obra-files` NO se
  toca**, ésa sí la usa el Worker de quell101 para servir sus instaladores.
- **La dirección de baja del correo: `info@forespot.com`.** Mike la dio el
  20-sep, cuando le pregunté a dónde debía apuntar `List-Unsubscribe`. Vive en
  la variable `CORREO_BAJA` del `wrangler.toml`, en producción y en staging, y
  sale sólo en los avisos —bienvenida y estado de una orden—, nunca en el
  código de acceso. Si ese buzón deja de leerse, se **quita la variable**: sin
  ella el código omite la cabecera solo. Como su ausencia no rompe nada,
  `pruebas/config-correo.py` la vigila en la puerta de despliegue. El detalle
  completo, y los tres registros de DNS que siguen siendo de Mike, están en
  `CORREO.md`.
- **Los dos códigos del ítem, y quién ve el precio en la obra (20-sep).**
  Mike lo ordenó con todas sus letras: `quell_elements.code` es el código de
  la PIEZA física en la obra —PT-01, único dentro de la obra, lo pone
  quell101— e `items.clave` es el código de PRODUCTO, el del modelo en el
  catálogo que quote101 va a llevar. Cada ítem es un código de producto y
  puede haber varios ítems del mismo modelo. NO se unifican: ligar una pieza
  a un ítem ya no copia ninguno de los dos (eso era el contrato 0.28.0, hecho
  con el entendimiento anterior; el muro del 20-sep a las 21:20 cuenta cómo se
  llegó ahí). Y el PRECIO del ítem en quell lo ven **sólo el dueño, la
  administración y los socios** —lo escogió él con botones el 20-sep—,
  recortado en el servidor y no al pintar.
- **El producto del catálogo, y agrupar dejó de fusionar (20-sep, contrato
  0.35.0).** Mike: «cuando un ítem se asigna a un grupo de ítems que son del
  mismo producto, el ítem adquiere en automático ese costo. También debe
  poder moverse de grupo de producto un ítem ya agrupado». Le pregunté con
  botones si el grupo de producto reemplazaba a «Juntar los iguales» —que
  fusionaba y borraba renglones— o convivía con él, y **escogió que lo
  reemplace**. Así quedó: tabla `productos` a nivel NEGOCIO (ahí va a vivir
  el catálogo de quote101; el mismo modelo se cotiza en tres obras) e
  `items.producto_id`, que en NULL quiere decir «este ítem es su propio
  producto único». Entrar a un producto le pone al ítem `monto` = precio ×
  cantidad y `clave` = el código del producto si lo tiene; el NOMBRE no se
  hereda —«Puerta 07» es como se llama esa pieza en el plano—. Salirse NO le
  quita el precio. `producto_id` no se escribe por PATCH (está en `CACHES`):
  iría el apuntador sin el precio. Las dos rutas devuelven el precio de venta
  del proyecto antes y después, porque heredar el costo lo mueve y la
  pantalla tiene que decirlo. El muro del 20-sep a las 23:00 cuenta por qué
  el diseño anterior estaba mal.
- **`ProductoProyecto` ya se llama `ItemProyecto` (20-sep, dash101 #68).** En
  esa app los renglones del proyecto se llamaban `productos` desde la época de
  Firestore y NO son los productos del catálogo. Con las dos tablas
  conviviendo el nombre viejo ya mentía, así que se renombró: 55 usos en 6
  archivos, en un cambio aparte para no arriesgar el del contrato 0.35.0.
- **Separar, y rescatar lo que la fusión ya había borrado (20-sep, contrato
  0.36.0).** Salir de un producto es `POST /orgs/:o/items/:id/separar`, y
  vaciar un producto entero `POST /orgs/:o/proyectos/:id/separar`. El caso
  caro es el otro: los renglones que el «Juntar los iguales» viejo fusionó y
  BORRÓ sólo se pueden reconstruir porque aquel código dejó escrito
  `refs.agrupados` con el id, la clave y el importe de cada uno. De ahí se
  rehacen, y las piezas del plano se reparten por código. **El precio de
  venta del proyecto es invariante**: lo que se le resta al renglón grande es
  exactamente lo que se les pone a los rescatados, y si no cuadra contesta
  409 `no_cuadra` sin escribir nada. Lo que NO vuelve, y está dicho así en el
  muro y en el recado: de qué renglón era cada cobro y cada avance, porque la
  fusión los mudó todos al que se quedaba sin anotar de dónde venían.
  Detalle que costó una hora: `separarItem` tiene que leer la fila CRUDA con
  `sql.exec`, no con `obtener()`, porque `afuera()` ya trae `refs` convertido
  en objeto y el `JSON.parse` truena.
- **Agrupar a un producto que YA existe (20-sep, contrato 0.37.0).** El
  cuerpo de `POST /orgs/:o/proyectos/:id/agrupar` acepta `producto_id`; con
  él, los ítems marcados entran a ese producto y **adoptan su precio**, y el
  nombre y el precio del producto no se tocan desde ahí. Lo pidió Mike con la
  captura de las 25 puertas en $0 junto a las 2 en $2,850. Y se le quitó el
  candado de «sólo el dueño»: quien puede editar los ítems del proyecto puede
  agruparlos.
- **El IVA lo dice cada proyecto (21-sep, contrato 0.39.0, migración
  0018).** Mike pidió «exportar un estado de cuenta en pdf y un excel con lo
  siguiente de cada proyecto: saldo general, lista de productos, subtotal,
  IVA y total, movimientos (pagos), fecha del día que se genera». Ese
  documento se le manda a un cliente, así que la pregunta «¿el precio
  capturado ya trae IVA o se le suma?» no se podía adivinar. Le pregunté con
  botones y escogió **que lo diga cada proyecto**, con «+ IVA» de arranque;
  su razón, en los hechos de su taller: HOLCIM pide desglose y una casa
  cotizada «con todo» no. Quedó `proyectos.tasa_iva` en PUNTOS BASE (1600) e
  `iva_incluido` 0/1. NO mueve un peso: sólo dice cómo se LEE
  `precio_venta`. Los proyectos que ya existían quedan en «+ IVA», que es
  como se venían leyendo en todas las pantallas.
- **Y el documento es UNO SOLO para las dos caras.** `GET
  /orgs/:o/proyectos/:id/estado` (y `…/estado.xlsx`) los abren dash101 y
  peek101 —segunda excepción a «un cliente sólo abre /peek», con el mismo
  recorte en el servidor—. Mike lo dijo antes que yo: «creo que esto es lo
  mismo que el cliente podría descargar desde peek101». Dos pantallas
  sumando cada una por su lado es la manera segura de que un día no cuadren,
  y el que lo notaría es el cliente. Tres reglas que sostienen el papel: la
  lista son los VENDIDOS y su suma ES el subtotal; sólo van INGRESOS (lo que
  se le paga a un proveedor no viaja); y el saldo es contra el TOTAL CON
  IVA, no contra `precio_venta` como el KPI de las otras pantallas —son dos
  preguntas distintas y el documento lo dice con letras—. El armador del
  .xlsx vive en la API por lo mismo, y porque peek101 no tiene empaquetador.
- **Y una fuga que salió escribiendo la prueba de peek101:** la ruta
  devolvía la fila entera de `proyectos`, con `pagado_prov` y `compromiso`.
  El contrato dice desde el 0.1.0 que el cliente NUNCA los ve, y esa ruta la
  abre él. Ahora va por lista blanca, para que una columna nueva no se asome
  sola.
- **Lo fiscal son dos preguntas, no una (21-sep, sólo dash101).** Mike: «ese
  marcador de facturado son 2 pasos: uno que indica si ese monto es facturado
  —o sea que se desglosa el IVA—, y eso activa otro que dice si ya se facturó
  o no. Si un movimiento no va fiscalizado, no tiene caso el marcador de si
  ya se hizo la factura». Los dos campos ya existían en la API
  (`movimientos.requiere_factura` desde la migración 0012 y `facturado`), así
  que el contrato no se movió: lo que estaba mal era la pantalla, que los
  mezclaba en un interruptor. Y los fiscalizados traen ícono en su renglón
  —el mismo ícono, ROJO mientras falta la factura y VERDE cuando ya está—,
  con la palabra completa en el `title` porque el color solo no se lee. La
  regla vive en `components/marca-fiscal.tsx` y se mide sin montar React.
- **La documentación por ítem en quell (21-sep, contrato 0.41.0).** Mike:
  «necesito en quell un apartado por ítem de documentación… hay un archivo
  base que es el plano o imagen sobre la que están las anotaciones del ítem,
  sería como el principal, y los demás archivos son de soporte. Sólo en el
  principal se hacen anotaciones». Y con botones escogió **notas Y rayar
  encima**, las dos. Migración org 0019 (`quell_element_docs`,
  `quell_doc_marcas`) y ocho rutas bajo `/orgs/:o/quell`. Lo que no se puede
  perder de vista si alguien lo toca: **«sin borrar la anterior» es una
  columna, no una costumbre** —`archivado_at` más dos índices únicos
  PARCIALES (`WHERE archivado_at IS NULL`), uno por ítem para el principal y
  otro por familia para la versión viva—, y por el índice la ruta archiva
  ANTES de insertar. Las marcas van **relativas de 0 a 1**, recortadas en el
  servidor; la pantalla usa un `<svg viewBox="0 0 1 1">` encima de la hoja
  para no hacer la cuenta a mano. Copiar las marcas a la versión nueva es
  decisión de quien sube (`copiar_marcas=1`), no del esquema. El contratista
  lee y no escribe. Y los archivos se borran con la obra, todas las
  versiones. La pantalla es `web/src/DocsItem.jsx` en quell101, medida con
  `pruebas/docs-del-item.mjs` y con un recorrido en Chromium a 390 y a 1280
  que comprueba que la misma nota cae en el mismo punto en las dos.
- **DEFECTO de origen: supply101 pedía la llave de dash101 (21-sep, contrato
  0.42.0).** Mike lo reportó con una captura: `fer@forespot.com` veía
  `app_no_permitida`. supply101 mandaba `X-App: dash101` —yo lo escribí así
  el 20-sep y lo dejé comentado como decisión razonada—, y **esa llave hace
  dos trabajos**: en `orgs.apps` dice qué contrató la empresa y en
  `miembros.apps` a qué entra cada quien. Razoné sobre el primero; el segundo
  vino de a gratis, y dejó a supply101 —hecho para quien NO entra al tablero
  del dinero— exigiendo la llave del tablero del dinero. **Antes de reusar
  una llave hay que preguntar cuántas preguntas contesta.** Arreglado con
  llave propia `supply`: a nivel empresa va junto a `dash` (migración
  `d1/0008`, y una empresa nueva nace con las dos), a nivel persona son
  independientes **en los dos sentidos** —y la prueba amarra los dos, porque
  si algún día `supply` se heredara de `dash` el defecto volvería en silencio
  para quien sólo pide—. Nadie perdió acceso porque la migración le escribió
  `supply` a quien traía `dash`, no porque una llave arrastre a la otra.
  De paso: **`PATCH /admin/orgs/:o {apps}` ahora MEZCLA** en vez de pisar el
  objeto entero; si no, master101 o workshop101 mandando su lista de seis
  llaves habrían apagado `supply` en la primera empresa donde alguien
  guardara apps. Tocó cuatro repos: suite101-api, dash101 (el Worker de
  supply101), workshop101 (la casilla «pedir compras») y master101 (la
  columna). **Pendiente de Mike:** palomearle «pedir compras» a Fer y a Goyo
  en workshop101; no se lo puse yo porque dar un permiso es decisión suya.
- **El requerimiento, y los tipos en cinco (22-sep, contrato 0.43.0).** Los
  tipos son Mueble, Puerta, Acabado, Servicio y **Requerimiento**; prefijos
  MW-, PT-, FX-, SV- y RQ-. El encargo venía contradictorio a propósito —«es
  un nuevo tipo de ítem» y una lista de cuatro que no lo incluía—, se le
  preguntó con botones y escogió el tipo; la aclaración que siguió («es un
  tipo pero que **aún está en revisión**. Sí aparece en mapa, sí aparece en
  ítems, pero está pendiente de cotizarse y autorizarse para entrar en
  producción») no estaba en ninguna de las tres opciones y es la buena.
  Lo que hay que no romper: **las dos mitades tiran para lados contrarios**.
  Un requerimiento NO se esconde —a diferencia de un `no_aprobado`, que en
  quell sólo sale en la vista de fuera de alcance— y a la vez NO entra en
  producción. La regla vive en `marcaEtapa`, el CUELLO por donde pasan
  `/elements/:id/etapas` y `/elements/:id/fase`, no en cada ruta ni en la
  pantalla (la app de Android trae su propia copia de la interfaz). Se
  pregunta con `esRequerimiento`, que NORMALIZA: `type` es texto libre y un
  «requerimiento» en minúscula guardado desde otra pantalla tiene que contar.
  Al aprobarse se le cambia el tipo y ya: conserva pin, bitácora y fotos.
  **No viaja a dash101** para cotizarse — era otra de las opciones y no la
  escogió; si se pide, es encargo aparte.
  **Deuda:** `web/src/codigos.js` de quell101 es COPIA de
  `src/quell/codigos.js` de la API (la clave se propone sin red). Se tocaron
  las dos y hay prueba de los prefijos, pero nada impide tocar una sola;
  cerrarlo de verdad es publicar el archivo desde la API.

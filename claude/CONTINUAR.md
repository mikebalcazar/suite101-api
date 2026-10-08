> **8-oct-2026 · investor101 se llama patron101 para la gente** (Mike). Marca y dominio `patron101.taller101.com`; app `investor101`, llave `investor`, Worker, repo y `URL_INVESTOR` conservan el nombre. Ver `muro/2026-10-08-2110-…`.

# 8-oct-2026 · investor101 entra a la suite (API 0.82.0)

Lo hizo el chat de investor101 (Cowork). El detalle está en
`muro/2026-10-08-2040-investor101-entra-a-la-suite.md`. En corto: app
`investor101` (llave `investor`, licencia por empresa), una clase nueva de
quien entra —`inversionista`, que sólo abre `/orgs/:o/inversion/*`—, siete
tablas (org/0042), la cuenta de un préstamo en `src/inversion.ts` y el motor
en `src/inversion-db.ts`, por una sola entrada RPC del OrgDB. dash101 lee
`/inversion/flujo` para su proyección y registra los pagos. Falta:
`investor101` en APPS_DOMINIO y en la puerta de empresas; la lista de apps
de master101 y workshop101.

---

# 7-oct-2026 · cost101 entra a la suite (API 0.81.0)

Lo hizo el chat de cost101. El detalle está en
`muro/2026-10-07-1840-cost101-entra-a-la-suite.md`. En corto: app `cost101`
(llave `cost`, licencia por empresa), tablas `costos_base` y `cuadrillas`
(org/0041, en código), `productos` con receta (`apu`) y precio calculado por
la API = precio unitario de cost101 SIN IVA (decisión de Mike, con botones).
`src/costos.ts` es la cuenta; `pruebas/costos.spec.ts` la mide contra la del
prototipo. Falta: tarjeta en `suite.html`, dominio de empresa para cost101.

---

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
- **Un negocio con cosas adentro no se borra (23-sep, contrato 0.45.0).**
  Mike: «desapareció mi info de quote». Dos causas encadenadas: quote101
  abría siempre el primer negocio por nombre (arreglado en quote101 G83, con
  selector y memoria), y aun con el selector seguía vacío en los tres. La
  segunda: `clientes`/`proyectos`/`cotizaciones` guardan `negocio_id` SIN
  llave foránea, así que borrar un negocio sin cuentas dejaba todo lo suyo
  apuntando a nada. Ahora ese borrado da 409 `en_uso`, y
  `GET /admin/orgs/:o/quote` (master101) enseña lo de quote101 por negocio,
  huérfanos primero. Lo que NO está hecho todavía: devolver lo huérfano a un
  negocio. Eso es una escritura en producción y la decide Mike al ver los
  números.
- **quote101 G105: reubicar los componentes en el plano (29-sep).** Mike:
  «cuando quito un plano los componentes pierden su ubicación […] cuando
  meto un plano nuevo, necesito que me dé la opción de reubicar los
  componentes». Tira azul con los componentes sin lugar: «Ponerlos en el
  plano» y cada toque es el lugar del activo, que pasa solo al siguiente;
  al cambiar el plano con componentes puestos se ofrece «Reubicarlos uno
  por uno» o «Se quedan donde están». quote101 #69, dos pruebas nuevas,
  115/115. Muro 2026-09-29-1100.
- **Accionistas y retiros de utilidades (30-sep, API 0.57.0 #185, dash101
  #110 y #111).** Tabla `accionistas` (0025) por el CRUD, la ve quien ve dinero.
  El retiro NO es tabla: egreso con categoria 'retiro_utilidades' y
  contraparte_tipo 'accionista'. Lo que hay que no romper: un estado de
  resultados debe excluir esa categoría; dar de baja es activo=false, no
  DELETE (lo retirado sigue sumando). Muro 2026-09-30-1900.
- **Inicio en el teléfono y el letrero de versión nueva (30-sep, dash101
  #107/#109, y #108, workshop101 #12, master101 #31, peek101 #21,
  roster101 #33, quell101 #93).** `/huella.txt` lo escribe el despliegue
  (commit; sha256 del index en quell) y está en .gitignore; el letrero lo
  pide cada 2 min y al volver la pestaña. Lo que hay que no romper: una
  prueba que lea la lista entera de la org demo debe pedir `?limite=`
  (ya pasó de 500 movimientos; #109). Muro 2026-09-30-1800.
- **QUITAR «NEGOCIO» (1-oct, en curso: fases A, B y C hechas; falta D).**
  Mike: «Ya no existe la opción de negocios en dash. Sólo es una
  empresa/negocio todo. Elimina todas las lógicas que involucran el
  concepto de "negocio"» y escogió sacarlo también de la API y las otras
  apps. A: dash101 #117/#119 (contexto implícito: el primero por nombre,
  sin selector, sin /negocios, Configuración «Empresa»). B: API 0.61.0
  #194 (negocio_id ya no se pide; src/empresa.ts). C: quote101 #72 y
  supply101 #118 no lo mandan. D (pendiente, con el orden obligado en el
  muro): dash101 deja de mandar negocio_id → migración que tira tabla y
  columnas + tabla `empresa` de un renglón + limpieza de API, dash101,
  master101, mocks de workshop101/t101-portal → la org demo de staging a
  un solo registro. Muro 2026-10-01-1930.
- **quell101: el plano se gira y se sustituye; quote101: «Ítems pendientes» y agrupar arrastrando (2-oct, API #209, quell #101, quote #73).**
  OrgDB 0029: `quell_plans.rotation` y `versiones`; `POST /plans/:id/sustituir`
  (mismo plano, otra hoja, piezas intactas). quell101 sube con vista previa y
  giro ↺ ↻; la capa nítida gira igual. quote101: liga «Ítems pendientes (n)»
  bajo «+ Nueva cotización», modal con selección múltiple a una cotización
  nueva o a un borrador; arrastrar un renglón sobre otro los agrupa
  (`item_ids`) y al aprobar va una línea por ítem. Muro
  `2026-10-02-0237-jr-plano-girado-sustituido-e-items-pendientes.md`.
- **El alcance en dos estados —dentro o fuera— con su bitácora (2-oct, API 0.64.0 #208, dash101 #128/#129, quell101 #100).**
  Se fue «cancelado»: `AlcanceItem` es 'dentro' | 'fuera'; sacar regresa el
  ítem a cotizado con `cancelado_at`; la tabla `alcance_movimientos` (0028)
  lleva entra/sale con quién, app y motivo, y la escribe toda puerta que
  mueva el estado. `GET /items/:id/alcance`. dash101: una pestaña «Fuera de
  alcance» con bitácora por ítem; quell101: filtro en dos y bitácora en el
  panel. OJO: la prueba de navegador de dash101 filtraba `estado !==
  'cancelado'` y se cayó en staging (#129 la arregló). Muro
  `2026-10-02-0237-jr-alcance-en-dos-estados.md`.
- **Los 193 costos base con precio de tienda, y el botón para cargarlos (8-oct, cost101 #3, 0.2.3).**
  Precio más alto de tienda en línea (127) o estimado más 15 % (66, con toda
  la mano de obra y el equipo), por decisión de Mike. Tablaroca normal
  (MAT-201) a $399. Van todos, sin las marcas. En el Resumen de cost101,
  quien dirige ve «Cargar los N» (`/costos/importar`, no pisa); el clic en
  forespot es de Mike. Muro `2026-10-08-2003-jr-costos-base-precio-de-tienda.md`.
- **cost101 sólo trae el lienzo, y los costos base van en Excel a revisión (8-oct, cost101 #1, 0.2.2).**
  Se fueron «Hoja APU» y «Por pasos». 193 costos base (carpintería,
  tablaroca, cancelería) con precio de referencia CDMX sin validar, en
  Excel para Mike; NO cargados. Al regresar: `POST /costos/importar` con lo
  que quede en «Sí». Muro `2026-10-08-0101-jr-cost101-solo-lienzo-y-costos-base.md`.
- **El PDF del ítem en quell101 abre en Android con Chrome viejo, y si no puede, lo dice (7-oct, bitacora-obra #121).**
  pdf.js moderno usa `Promise.withResolvers` (Chrome 119+); en un Android
  anterior truena antes de pintar y quedaba un cuadro blanco de 300×150.
  `web/src/pdf.js` carga la versión legacy; el visor dice el motivo y
  ofrece abrirlo aparte. Muro `2026-10-07-2254-jr-pdf-en-android-viejo.md`.
- **La empresa firma sus documentos; el responsable es quien cotiza; un renglón sacado se borra ahí mismo (7-oct, API 0.80.0 #268, workshop101 #14, cotizador-t101 #83, dash101 #145).**
  `empresa` con contacto y logotipo (PUT/DELETE/GET `/orgs/:o/empresa/logo`,
  PNG/JPG por firma, 5 MB; migración 0040 EN CÓDIGO). workshop101 › Empresa
  los escribe («director101» = workshop101). quote101 los lee en la hoja y
  en todos sus PDF/Excel (`EMPRESA_DOC`); responsable = quien la edita
  primero. D1 0023: «Mike Balcázar». `borrar-cancelados` con `ids`+`soltar`
  y «Borrar» por renglón en dash101 (para «Sanje CC37»). Falta: logotipo en
  los documentos de dash/quell/roster/peek. Muro
  `2026-10-07-0216-jr-empresa-logo-y-responsable.md`.
- **Las ligas de las notas internas de quote101 dicen el título de la página (7-oct, API 0.79.0 #266, cotizador-t101 #82).**
  `GET /orgs/:o/titulo-de-liga?url=` (miembros; nunca hosts internos: 400)
  lee el <title>; quote lo guarda en el renglón (`ligas_titulos`) y enseña
  el dominio si no hay título. Muro
  `2026-10-07-0136-jr-titulo-de-las-ligas.md`.
- **quote101: un recuadro para la imagen (arrastrar, pegar o desde carpeta) y las ligas de las notas internas se pican (7-oct, cotizador-t101 #80 y #81).**
  El recuadro `data-zona-imagen` carga a ESE renglón (pegar con el recuadro
  picado); en el armador el recuadro se ve siempre. Ligas: encima del campo
  en la hoja y como <a> en el PDF interno (`notaConLigas` parte sobre el
  texto crudo). Muro `2026-10-07-0115-jr-recuadro-de-imagen-y-ligas.md`.
- **El requerimiento se arma por componentes, imagen en lo escrito a mano y notas internas a la bitácora del ítem; los cargos NO se duplican (7-oct, cotizador-t101 #78 y #79, API 0.78.0 #263).**
  «armar por componentes» abre el renglón del requerimiento en el armador y
  `conArmado()` le quita `manual` sin perder su item_id. «+ imagen» en los
  renglones a mano. `notas_internas` por renglón: hoja y PDF interno, nunca
  el cliente; al aprobar la API las escribe en la bitácora de cada pieza.
  Lo del «70% más»: medido, cada cargo va una vez (pesa el flete mínimo de
  $1,500); Mike escogió aclarar la caja, no cambiar números. Muro
  `2026-10-07-0056-jr-requerimiento-por-componentes-y-notas.md`.
- **La obra de quell101 nace con cliente y proyecto en la suite, el requerimiento trae descripción, y la lista de ítems de dash101 con el estilo de quell (6-oct, API 0.76.0 #260 y 0.77.0 #261, bitacora-obra #120, dash101 #144).**
  Mike: «Cree un nuevo proyecto en Quell, con un cliente nuevo. Pero no me
  aparece ni el cliente ni el proyecto ni en quote ni en dash». «+ Proyecto»
  manda `suite: true` y la API da de alta cliente (el mismo nombre es el
  mismo) y proyecto ligados; la 0039 hizo lo mismo con las obras sueltas con
  cliente escrito («darlos de alta todos»). `quell_elements.descripcion`
  (0038) viaja al renglón de quote101. dash101: barra de color, tramos por
  etapa y cobro; el panel se abre con una pieza. Muro
  `2026-10-07-0004-jr-obra-en-la-suite-y-lista-de-dash.md`.
- **El ítem de quell101 se abre sin salir de la vista, y desde el cronograma sí carga; la leyenda del cronograma es un ícono de info (6-oct, bitacora-obra #118 y #119).**
  Mike: «no quiero que me regrese a la pantalla de plano, quiero sólo que
  me abra la barra lateral». La dirección del ítem va después de la vista
  («…/cronograma/e/ITEM»); cambiar de vista lo deja abierto; cerrar deja la
  vista de ahora (`history.state.base`); «Reubicar» pasa al plano al mismo
  nivel; «…/e/ITEM» sigue siendo el plano. El cronograma abría «undefined»
  (sus renglones traen `element_id`, no `id`). Muro
  `2026-10-06-2247-jr-el-item-sin-salir-de-la-vista.md`.
- **Los costos default por PIEZA (defecto del 0.73.0: salían del total del ítem) y los costos y tiempos default poblados una vez en lo que ya estaba (6-oct, API 0.74.0 #255/#256, 0.75.0 #257, bitacora-obra #117).**
  Mike: «pobles por mí todos los ítems que tenemos en alcance (…) con los
  costos predeterminados» y «con los defaults de tiempos»; con botones,
  «sólo donde falten». `precioPorPieza` (monto / cantidad) en cronograma.js.
  Mecanismo nuevo: una migración SQL deja una fila en `pendientes_arranque`
  y el constructor del OrgDB corre `correrPendientes()` después de migrar
  (una vez, en orden, anota resultado; si truena, reintenta). 0036
  `poblarCostosDefault`, 0037 `ponerTiemposDefault` (fase en 1 día = sin
  capturar). OJO: una tabla con guion bajo no la cuenta la prueba del DO
  recién nacido; por eso no se llama `_pendientes`. Muro
  `2026-10-06-2058-jr-costos-y-tiempos-default-en-lo-que-ya-estaba.md`.
- **El cronograma que se llena solo (10/24/12 días), responsable (proveedor o contratista) y costo por fase, costos default por tipo de ítem, y los compromisos que de ahí nacen y entran al flujo (6-oct, API 0.73.0 #252, bitacora-obra #116, dash101 #142).**
  Mike: «el cronograma se debe llenar en automático (…) responsable
  (proveedor o contratista) de cada fase (…) el costo de cada fase, así de
  ahí se pobla la lista de compromisos». Migración 0035;
  `completarFases` (una vez por pieza, `fases_dadas`) y
  `sincronizarPartidas` en motor.js: cada fase con costo de una pieza
  ligada es una partida del proyecto (tarea_id, obra_id, fecha_esperada:
  material al arrancar, lo demás al terminar); dash101 no la edita (409
  del_cronograma). PORCENTAJES en cronograma.js (Mueble 30/30, Puerta
  35/35, Servicio 5/55, Acabado 40/20; instalación en cero). El flujo de
  dash101 pone lo que falta de cada partida en su fecha
  (`compromisosDeProyectos`, resta las órdenes que ya apuntan a ella).
  OJO: la fecha_esperada se escribe al leer/guardar el cronograma, no se
  recalcula cada día. Muro `2026-10-06-1918-jr-el-cronograma-que-se-llena-solo.md`.
- **El plan de pagos del proyecto: parcialidades con fecha, y los cobros entran al flujo con lo cobrado descontado en orden de fecha (6-oct, API 0.72.0 #251, dash101 #141).**
  Mike lo escogió con botones entre cuatro opciones («plan de pagos por
  proyecto»). Tabla `plan_pagos` por el CRUD genérico (migración 0034,
  `parcialidadQueNoCuadra`); no toca `cobrado`. dash101:
  `cobrosDeProyectos` en lib/proyeccion.ts (un solo cálculo para el flujo
  y para la tarjeta del proyecto), lib/plan-pagos.ts,
  components/plan-de-pagos.tsx. Lo por cobrar sin parcialidad queda sin
  fecha y el flujo dice cuánto es. Muro
  `2026-10-06-1840-jr-el-plan-de-pagos.md`.
- **El flujo proyectado por bloques (semana, quincena, mes, trimestre, semestre, año) con lo planeado de cada bloque, y la nómina programada (6-oct, API 0.71.0 #249, dash101 #140).**
  Mike: «presentar por bloques de tiempo (…) ver todos los gastos y los
  cobros que están planeados para esa semana (…) programar la nómina para
  que también se considere en los gastos». Motor puro en
  dash101/lib/proyeccion.ts (`proyectar`, `lapsos`, `planear`); entran
  OPEX, nómina programada (un corte abierto sustituye la estimación) y
  órdenes pendientes por fecha máxima; el primer bloque cuenta desde HOY;
  un bloque nunca se parte. API: GET/PUT /orgs/:o/nomina/programa en
  `ajustes` app `nomina` (fuera del CRUD), permiso de la raya. Los cobros
  de proyectos NO tienen fecha todavía: se le preguntó a Mike cómo
  fecharlos. Muro `2026-10-06-1437-jr-el-flujo-por-bloques.md`.
- **dash101: el panel del ítem a la derecha, lo que se ve en quell, desde cualquier lista, con «Abrir en quell101» (6-oct, dash101 #139).**
  Mike: «me abra la barra lateral de detalle de los ítems cuando doy click
  sobre uno o sobre el ícono de info. No importa en dónde esté viendo el
  ítem en lista (…) debe haber un hiperlink al item en quell». Un solo
  `PanelItemHost` en el layout escucha el evento `dash101:abrir-item`;
  cualquier lista lo abre con `NombreDeItem` y `BotonVerItem`
  (components/panel-item.tsx). Lee `GET /items/:id/pieza` + detalle +
  docs (lib/pieza.ts); 404 → «Este ítem no está en ningún plano de la
  obra.»; liga `casaQuell()/#/p/<obra>/e/<pieza>`. Sólo lectura, nada se
  edita ahí. OJO: para correr navegador.spec en local hay que construir
  con NEXT_PUBLIC_FUENTE=api NEXT_PUBLIC_ORG=demo, y la bajada del Excel
  no pasa en local (el rewrite no pone X-App). Muro
  `2026-10-06-0356-jr-el-panel-del-item-en-dash101.md`.
- **Los dos candados del ítem en el cronograma: anticipo repartido de un pago (dash101) y diseño definido (quell101); sin los dos, la pieza corre desde hoy (6-oct, API 0.70.0 #245, dash101 #138, bitacora-obra #113 #114).**
  Mike: «todos los ítems necesitan cumplir 2 parámetros para que se fije
  su fecha de inicio (…) anticipo y definición de diseño (…) mientras no se
  cumplan la fecha de inicio se sigue recorriendo al día presente (…) el
  anticipo se marca desde dash al registrar un pago, alocando cantidades a
  cada ítem por monto, porcentaje o distribuido». API: migración 0033
  (`movimiento_items`, `quell_elements.diseno_definido`); el candado es un
  PISO en `programar(tareas, inicio, pisos)` (la fecha más tardía de los
  dos, o hoy); `candados` por pieza en el cronograma; la etapa 2 «Anticipo
  pagado» también cuenta; sin ítem de dash101 no hay anticipo. dash101:
  bloque «Repartir este pago como anticipo entre ítems» en el movimiento.
  quell101: «Diseño definido el» al editar el ítem; rótulos en lista y
  gráfica; y el eslabón ⛓ que quita una cadena (soltar del otro lado la
  voltea). Y la vista de la obra (plano/lista/dudas/cronograma) es un
  menú desplegable (#115): los botones se cortaban. Muro
  `2026-10-06-0250-jr-los-candados-del-cronograma.md`.
- **El cronograma gráfico que se arrastra, y procesos con fases de más y con nombre (6-oct, API 0.69.0 #243, bitacora-obra #112).**
  Mike: «en el cronograma gráfico poder "arrastrar" la tarea (fase del
  ítem) que se encadena con otra fase de otro ítem ya sea antes o después»;
  «agregar otra fase a los procesos (…) y editar el nombre de la fase»; y
  el campo del nombre del proceso perdía el foco a cada tecla (la llave de
  React era el nombre; ahora es el id de la primera fase). API: migración
  0032 rehace `quell_tareas` con etapa 'otra', `nombre`, `pos`; el orden
  del proceso es `pos`. quell101: `Gantt.jsx` (barra por fase, día por
  columna; soltar sobre la mitad derecha = después de, izquierda = antes
  de, al vacío = fecha fija con alfiler), lista con nombre de proceso y de
  fase editables, «+ Otra fase», ▲▼. Lección CSS: las clases de cada
  pantalla llevan prefijo (`g-`); `tarea` e `item` chocaban. Muro
  `2026-10-06-0220-jr-el-cronograma-grafico.md`.
- **El cronograma de la obra en quell101 y el tipo del proveedor en todas las apps (5-oct, API 0.68.0 #241, bitacora-obra #111, dash101 #137).**
  Mike: «configurar un cronograma, pero algo muy amigable (…) tiempo de
  fabricación total, o entrega de material / fabricación / instalación con
  su proveedor o contratista (…) encadenar tareas, sólo las instalaciones
  (…) exportar a Microsoft Project o Excel». Días de lunes a sábado
  (decisión suya). Las cuentas en `src/quell/cronograma.js` (puro); tabla
  `quell_tareas` (etapa de un proceso de una pieza, `depende_de`); rutas
  `GET/PUT …/projects/:id/cronograma`, `.xlsx`, `.xml` (MSPDI), sólo staff.
  `proveedores.tipo` materiales|servicios (materiales por omisión; nada se
  reclasifica solo). quell101: vista `cronograma` con «Tiempo total»,
  «Desglosar», «+ Otro proceso», «Después de…», guardado solo. dash101 y
  supply101 preguntan el tipo. Falta a propósito: festivos, `inicio_fijo` en
  la pantalla, el botón en la barra de abajo del celular. Muro
  `2026-10-05-2320-jr-el-cronograma-de-la-obra.md`.
- **quote101: el ítem de la obra se ve a la derecha, de sólo lectura (5-oct, API 0.67.1 #239, cotizador-t101 #77).**
  Mike: «si le doy click [a un requerimiento], a la derecha me abra la
  barra de quell de los detalles del ítem (…) y en el formato de cotización
  (…) un iconito de info». Ruta nueva del motor `GET /quell/items/:id/pieza`;
  quote101 pide el detalle y los archivos con su X-App y pinta `PanelPieza`
  (`abrirPieza(item_id)` desde pendientes y desde la hoja). Muro
  `2026-10-05-2252-jr-el-item-de-la-obra-en-quote101.md`.
- **quell101: «Imprimir» y «Compartir» del plano son puro ícono (5-oct, bitacora-obra #110).**
  Mike, con una captura de escritorio donde los selectores de la derecha
  se salían del borde. `.btn.ico` (32 px, dibujo, palabra en title y
  aria-label; `BotonCompartir` acepta `etiqueta`); en la barra del plano
  el botón de planos es el único que cede (`flex:0 1 auto;min-width:120px`).
  Muro `2026-10-05-2226-jr-iconos-del-plano.md`.
- **Los datos de pago del proveedor, en la orden de compra (5-oct, API 0.67.0 #236, dash101 #135).**
  Mike: «ahí mismo en la orden (desde dash) aparezcan los datos bancarios
  o de pago del proveedor para hacer ese pago». `GET /ordenes/:id` trae
  `proveedor` (ProveedorDePago: ficha + `cuentas[]` de proveedor_cuentas;
  la de las columnas sale como «Principal»; a mano → null). dash101 pinta
  «Para pagarle» con CLABE legible y «Copiar»; reembolso sin bloque.
  sembrar-demo deja a Maderas del Sur con cuenta. Muro
  `2026-10-05-1552-jr-pago-del-proveedor-en-la-orden.md`.
- **DEFECTO: un POST del navegador al motor de quell contestaba 500 con lo pedido ya escrito (5-oct, API 0.66.2 #233, peek101 #25).**
  El navegador manda `Origin` en todo POST; el CORS de index.ts le ponía
  cabeceras a la respuesta que `/orgs/:o/quell/*` devolvía tal cual del
  objeto (inmutables) → «Can't modify immutable headers». Ahora la ruta la
  envuelve (`new Response(r.body, r)`). quell101 no lo veía (su Worker no
  reenvía Origin); peek101 sí (reenvía la petición entera). OJO: `/:o/ws`
  devuelve igual la respuesta del objeto y no se tocó. Y EL HUMO: iba rojo
  desde 0.65.0 (203/204, «invitarlo otra vez» esperaba 201 y la API
  contesta 409 correo_en_uso a propósito) sin que se leyera; se actualizó
  la comprobación. Tras cada «Publicar API», leer el RESULTADO del humo. Muro
  `2026-10-05-0534-jr-origen-y-cabeceras-inmutables.md`.
- **peek101 es el único visor del cliente (5-oct, API 0.66.1 #231, peek101
  #24, bitacora-obra #109, dash101 #134).** Mike: «Quiero que el único
  visor del cliente sea Peek y que ahí mismo pueda ver el plano general y
  aparte contestar los puntos de dudas. Y el generar sus propias dudas desde
  Peek». peek101 pinta la obra desde el MISMO motor de obra de la suite
  (/orgs/:o/quell/*, cara de cliente, X-App peek101): `public/obra.js` con
  v-obra (plano con pines, piezas, puntos contestables, preguntar) y v-pieza
  (precio, etapa, archivos, puntos, preguntar); honduras 3 y 4; ligas
  #/obra/ID y #/pieza/ID. Los correos del motor al cliente van a peek
  (`sitioPeek`). quell101 manda al cliente a peek. La demo de staging tiene
  obra (sembrar-demo). OJO: cada corrida de portal.spec deja una «Pregunta
  de prueba» en la demo. Muro `2026-10-05-0516-jr-la-obra-en-peek.md`.
- **peek101 junta lo del cliente (4-oct, API 0.66.0 #229).** Mike: «para
  el cliente es muy tedioso irse metiendo a diferentes plataformas (…)
  Juntemos dentro de Peek la info de su estado de cuenta y la info que le
  aparece en quell». /peek trae `obra` por proyecto, `piezas` (con
  `docs`) por ítem y `pendientes` (dudas del taller al cliente, todas sus
  obras). El cliente de la suite entra a la obra ligada a su proyecto sin
  invitación aparte, ve `item_monto` y lee la documentación del ítem. El
  estado de cuenta general lo baja él mismo. quell101 #108 (precio, etapa,
  archivos en la cara de cliente); peek101 #23 (pendientes arriba,
  ligas a quell101, columna Planos, Excel general; `public/ligas.js`
  deduce la dirección de quell101 de la del portal). Muro
  `2026-10-04-1850-jr-peek-junta-lo-del-cliente.md`.
- **Un cliente por correo, en las tres apps (4-oct, API 0.65.0 #227).**
  Mike: «El cliente se debe poder crear desde quell, dash o quote … en
  caso de querer generar un nuevo cliente con el email de otro que ya
  existe, avisar … presentar su info y preguntar». La API contesta 409
  `correo_en_uso` con el cliente (POST/PATCH clientes, invitar sin
  `usar_existente`) y `parecidos?correo=` trae `por_correo`. dash101 #132
  (+#133: la prueba de navegador pedía /clientes sin /orgs/demo y tiró
  producción), quote101 G107 #76 (campo de correo en «+ Nuevo cliente»),
  quell101 #107 (el 409 en «Invitar cliente»). Mismo aviso y mismas dos
  salidas en las tres. Muro `2026-10-04-0610-jr-un-cliente-por-correo.md`.
- **El acceso al portal tras fusionar clientes (4-oct, API 0.64.3 #223).**
  Mike: «No podemos entrar en Peek como cliente y ya está invitado». El
  acceso de la base maestra apuntaba al cliente borrado por la fusión
  (/peek → no_encontrado). Ahora fusionar re-apunta el acceso y /peek
  repara al pasar una cuenta chueca (`clientePorUsuario`); 0.64.4 (#225)
  además rescata por el correo de la sesión. Falta que Mike confirme que
  entra; si no, re-invitar desde dash101. Muro
  `2026-10-04-0440-jr-acceso-tras-fusionar.md`.
- **El pin del requerimiento se ve (3-oct, bitacora-obra #106).** Mike:
  «los círculos de los requerimientos en quell no se ven … un amarillo
  relleno con círculo verde». Era gris y, por estar fuera del alcance,
  hueco y punteado. Ahora el tipo es amarillo (#F0C419) y el pin lleva
  `.pin.revision`: relleno amarillo, aro verde, gana a `.pin.fuera`. Muro
  `2026-10-03-0300-jr-requerimiento-se-ve.md`.
- **quote101 G106: comisiones siempre a la vista e indirectos en lo escrito a mano (3-oct, cotizador-t101 #74).**
  Mike: «otra vez no me aparece la opción de agregar la comisión del
  arquitecto ni la de TDC … considera los indirectos siempre … en el PDF
  no se exportan nunca». La caja de cargos sólo salía con muebles del
  armador. Ahora sale con cualquier renglón; lo escrito a mano es la base
  y lleva indirectos y comisiones prendidas (al peso); los PDF del cliente
  sólo traen el precio repartido. `cargosAMano` en la versión: las de antes
  se ven como se mandaron y entran a la regla al editarlas. Al aprobar,
  `lineas[].precio` ya va con cargos. Mismo día, #75: el flete también se
  reparte entre todos los renglones (a mano incluidos) y su casilla sale
  siempre. Muro `2026-10-03-0255-jr-cargos-siempre-en-quote.md` y
  `2026-10-03-0320-jr-flete-en-todos.md`.
- **El menú de abajo tapado por Safari 26 (2-oct, bitacora-obra #105).**
  Mike, en un iPhone: «No alcanzo a ver el menú de abajo». Safari 26 pone
  su barra flotante encima de la página y `safe-area-inset-bottom` no la
  cuenta. quell101 ahora mide con `visualViewport` (web/src/alto.js →
  `--alto-visible`, `--tapa`) y la app mide lo visible en el celular. Y el
  plano se comparte (PDF o imagen original) junto a «Imprimir» y en la lista
  de planos. PENDIENTE: dash101, supply101, roster101 y quote101 tienen el
  mismo hoyo con lo que pegan abajo; mismo arreglo. Muro
  `2026-10-02-2210-jr-menu-tapado-en-safari.md`.
- **Los requerimientos sin ítem (2-oct, API 0.64.2 #218).** Mike: «hay unos
  requerimientos del Depto Bosques de Santa Fe que no aparecen en ítems
  pendientes en quote». Eran pines levantados antes de ligar la obra (o
  antes del 29-sep): sin proyecto no nacía el ítem. Ahora `ligarObra`
  levanta los huérfanos de esa obra, la migración 0030 (en código) los
  repara en las obras ya ligadas, y «traer del plano» levanta un
  requerimiento como requerimiento. Si la obra no está ligada, hay que
  ligarla desde dash101 y ahí nacen. Muro
  `2026-10-02-1915-jr-requerimientos-huerfanos.md`.
- **dash101 ya no genera ítems (2-oct, dash101 #131; decisión de Mike con botones: «dash sólo lee»).**
  Se fueron «Agregar» en «Editar la lista», «Ítem en esta partida» y el
  «Precio de venta» del proyecto nuevo (la «regla 1»). Editar, quitar
  (sacar del alcance) y revivir por id siguen. `createProyecto` ignora
  `items`/`precio_venta`; `updateProyecto` rechaza completo un renglón sin
  id (`DASH_NO_GENERA_ITEMS`). Las pruebas siembran ítems por la API con
  `pruebas/sembrar.ts`. REGLA: un ítem nuevo se levanta en quell101 o se
  cotiza en quote101, nunca desde dash101. Muro
  `2026-10-02-1840-jr-dash-no-genera-items.md`.
- **El requerimiento pendiente está fuera del alcance también en quell (2-oct, API 0.64.1 #215, bitacora-obra #104).**
  Mike: «Aún no queda la lista de ítems fuera de alcance en quell» + el
  flujo completo (quell/quote generan; dash lee, saca y mete; requerimiento
  = fuera; aprobar la cotización mete al alcance con tipo y precio; versiones
  sólo refieren). `ALCANCE_SQL` ya es `alcanceDeItem` sin la excepción del
  22-sep; quell101 pasa el filtro a «Todos» al levantar un requerimiento.
  El resto del flujo ya existía (auditado en el muro). PENDIENTE de Mike:
  dash101 todavía crea ítems («Editar la lista», «Ítem en esta partida»);
  él dice que sólo quote y quell generan. Muro
  `2026-10-02-1800-jr-requerimiento-fuera-de-alcance.md`.
- **DEFECTO quell101: «Reubicar en el plano» cerraba el ítem (2-oct, bitacora-obra #103).**
  Mike en Bosques de Santa Fe: «se sale de la función y deselecciona todo».
  El botón llamaba `setVista('plan')` con el ítem abierto, y `setVista`
  NAVEGA: del ítem (hondura 3) al plano (1) es `history.back()`, que cierra
  el ítem, y su popstate tardío apagaba el `useEncima` de `moviendo`. Se
  quitó esa llamada ahí y en el `onIr` de las dudas (mismo patrón). REGLA:
  en Project.jsx `setVista` no es un setState; con ítem o sección abiertos,
  'plan' retrocede. Prueba `el-atras.mjs` +5. Muro
  `2026-10-02-1200-jr-reubicar-no-cierra.md`.
- **Dominio propio por empresa, fase B en vivo (2-oct, bitacora-obra #102, t101-portal #35, dash101 #130).**
  Los tres Workers que eran de una sola empresa ya toman la empresa de la
  puerta: quell101 (`empresaPedida` → `empresaDe`, si está entre las del
  usuario), roster101 (`empresaDe`/`nombreDeEmpresa`, cabeceras juntas o
  ORG_ID) y dash101 (el Worker deja la cookie `s101_org`; `lib/fuente.ts`
  la lee antes que NEXT_PUBLIC_ORG). Sin cabeceras no cambia nada (medido en
  vivo). quote101, peek101, supply101 y workshop101 van por /yo, ya acotado.
  OJO: las cabeceras puestas a mano hacen que el Worker PIDA otra empresa
  (la suite sigue exigiendo membresía; riesgo bajo); al desplegar la puerta,
  endurecer: honrarlas sólo si el host del pedido no es nuestro. FALTA (al
  «listo» de Mike con DOMINIOS.md): el paso del deploy de `puerta/`, un
  dominio de prueba de punta a punta y ese endurecimiento. Muro
  `2026-10-02-0305-jr-dominio-propio-fase-b.md`.
- **Dominio propio por empresa, fase A en main (2-oct, API #210/#211, master101 #34).**
  Mike decidió «dominio propio con alta automática» (Cloudflare for SaaS);
  sus pasos están en `DOMINIOS.md` y FALTAN (token `CLOUDFLARE_SAAS_TOKEN`).
  Hecho: D1 0022 (`orgs.dominio`, `dominios_nombres`), `src/dominios.ts`,
  rutas de master101 (PATCH dominio, GET/DELETE /admin/orgs/:o/dominio),
  `/dominios/resolver`, /yo acotado al dominio, 403 `otra_empresa`, portada
  por empresa, el Worker `puerta/` (SIN desplegar todavía: falta el paso en
  desplegar.yml, a propósito) y la pantalla de master101. OJO: el código
  entró en #210, que era un PR de docs (los cambios sin confirmar se vinieron
  a la rama); está contado en el muro. PENDIENTE fase B: dash101
  (NEXT_PUBLIC_ORG), quell101 (ORG_ID) y t101-portal (ORG_ID) deben tomar la
  empresa de `X-Org-Empresa`, porque hoy son un Worker por empresa; luego el
  paso del deploy de la puerta y una medición con un dominio de prueba. Muro
  `2026-10-02-0245-jr-dominio-propio-fase-a.md`.
- **La puerta ajustada y compartir archivos en quell101 (2-oct, API #206 y bitacora-obra #99).**
  En la puerta, roster101 lleva al panel de la empresa (/admin), master101
  ya no sale, y hay un bloque «Portal de trabajadores» con el botón
  «Compartir portal» (hoja de compartir del sistema en el celular, copia al
  portapapeles en escritorio). En quell101, toda foto, plano, PDF o soporte
  trae «Compartir»: baja el archivo con la sesión y lo manda como COPIA por
  navigator.share (archivos) o lo descarga con su nombre. Nota en el muro
  `2026-10-02-0127-jr-puerta-ajustada-y-compartir-archivos.md`. Pendiente
  de medir en iPhone real la hoja de compartir con archivos.
- **La puerta de la suite: suite101.taller101.com (2-oct, API #204).**
  Una hoja con el logotipo y ocho ligas (dash, quell, quote, supply,
  roster, peek, workshop, master) servida por la API en un segundo
  custom_domain (src/portal.ts antes de conSesion; src/paginas/suite.html;
  en ese host `/` es la página, `/favicon.svg` y `/salud`, lo demás 404).
  Para agregar una liga: la tarjeta en suite.html y APPS en
  pruebas/portal.spec.ts. Las apps de escritorio no van. Muro
  2026-10-02-0105.
- **La demo de staging, resembrada limpia (1-oct, decisión de Mike).**
  DELETE /admin/orgs/demo → POST org con sus apps → los dos miembros
  (prueba.admin admin, socia socio; el guion NO los crea) →
  scripts/sembrar-demo.mjs → «Caja de supply101» a mano. lectura-api 15/15,
  supply101 5/5. Muro 2026-10-01-2140.
- **DEFECTO: «pagado» por ítem con el tope de 500 (1-oct, dash101 #127).**
  `partesDeProyectos()` pedía movimientos sin `limite`; pasando 500 los
  viejos se caían y un ítem pagado salía en cero (la demo, 701 movimientos
  tras la unión). REGLA: toda lectura de la que salga una suma va con
  `limite: '5000'` o `listarCompleto`. Pruebas ajustadas por la unión:
  #123, #125 (cuenta de pruebas, no la primera de la lista; saldos contra
  la suma real), #126 (tsc antes de empujar). Muro 2026-10-01-2110.
- **Quitar «negocio», fase D completa (1-oct tarde).** API 0.62.0 #196
  (GET/PATCH /orgs/:o/empresa, registrada antes de montarOrdenes) y
  0.62.1 #197 (POST /ordenes sin negocio_id: la ruta propia se había
  quedado fuera de la regla de 0.61.0; 500 NOT NULL en staging). dash101
  #120 (escribir.ts sin negocio_id en ninguna alta), #121 (lib/empresa.ts
  sobre /empresa), #122 (se van fusionarNegocios y un-solo-negocio.spec),
  #123 (la prueba de supply101 paga de la cuenta que exista: supply101 no
  puede abrir cuentas). Verificado: API 0.62.1 en prod y staging; dash101
  huella fb78310 con 20 del navegador + 5 de supply101 en verde. API
  0.63.0 #198: migración 0027 en código (fusiona al primero por nombre,
  tabla `empresa`, reconstruye cuentas/conciliaciones/rayas/accionistas
  con defer_foreign_keys, DROP COLUMN en el resto, DROP TABLE negocios;
  /negocios de compatibilidad; /admin/orgs/:id/quote → {org, resumen});
  humo #199. master101 #33 (resumen de quote101). dash101 #124: sin
  lecturas, filtros ni tipos de negocio (useEmpresa, lib/equipo.ts, 246
  vitest, 20 navegador). Verificado: API 0.63.0 prod y staging (humo
  200/200), dash101 huella ed67294, master101 7c4cfff. QUEDA: la
  org demo de staging juntó sus tres registros y trae ~380 proyectos y
  clientes duplicados; resembrarla es decisión de Mike. Compat que se
  retira cuando nadie la lea: /negocios, /yo negocios: [], columna
  miembros.negocios del D1, el bloque `negocio` del estado del proyecto,
  mocks de workshop101/t101-portal. Muro 2026-10-01-2040.
- **quell101: el plano pegado y la nota que pregunta (1-oct, #97 y #98).**
  El cuadro «Subir» de DocsItem.jsx toma un PDF o imagen del portapapeles
  (paste en el documento mientras está abierto) o del arrastre encima;
  pegar.js `planoDe` / `nombreDePlanoPegado` (la bitácora sigue sin aceptar
  PDF a propósito). `borraMarca` pregunta con confirm antes de pedirle a
  la API, con el texto de la nota. Pruebas el-plano-pegado.mjs (20) y
  la-nota-pregunta.mjs (6). Huella 6f9f3de. Muro 2026-10-01-2000.
- **El punchlist a lo ancho (1-oct, quell101 #96).** `.pend` y `.proc` a
  secas se le pegaban a `.pi.pend` / `.pi.proc` (120px a la derecha).
  Quedan `.lrow .pend` y `.barproc .proc`. Lo que hay que no romper: los
  estados van como clase en .pi, .pill, .dot y .pin; nunca una regla con
  el estado sin ancestro (pruebas/el-pendiente-a-lo-ancho.mjs lo cuida).
  Muro 2026-10-01-1845.
- **El saldo lo suma la base, y lo demás del 1-oct (API 0.60.0 #192,
  dash101 #115).** El líquido no se movía: dash101 sumaba el saldo de una
  lista con tope de 500 que salía de la más vieja a la más nueva. Ahora
  `cuentas.saldo` viene calculado (OrgDB.conSaldo) y `movimientos` sale
  DESC. Además: orden por día y hora (masRecientePrimero), historial en
  la cuenta, el cliente abre con su estado de cuenta (+ Excel
  /clientes/:id/estado.xlsx), gastos generales (CATEGORIA_GASTO_GENERAL,
  casilla en el egreso, filtro), «Nómina», accionistas de roster
  (/accionistas/de-roster). Lo que hay que no romper: NUNCA sumar dinero
  de una lista con tope; un estado de resultados cuenta gasto_general como
  gasto del negocio y excluye retiro_utilidades. Muro 2026-10-01-1830.
- **«No tengo contraseña o la olvidé» en las ocho entradas (1-oct, API
  #191 y siete repos).** El flujo correo → código → contraseña nueva ya
  existía; sólo se renombró el botón. Las pruebas de entrada buscan el
  texto nuevo. Muro 2026-10-01-1530.
- **Dudas de colores en quell101 (1-oct, #94).** `.duda.abierta` rojizo,
  `.duda.cerrada` verde, historial por created_at desc, «Ver respondidas»
  (data-respondidas). Muro 2026-10-01-1430.
- **El correo de dudas con cada duda y «Responder» (1-oct, API 0.59.1
  #190).** motor.js correoDePuntos → { asunto, html, liga } con
  `#/p/OBRA/dudas`; avisar-cliente contesta liga y dudas. Lo que hay que
  no romper: quell.spec.ts se corre entero (con -t da 401). Muro
  2026-10-01-1330.
- **Compras: por pagar arriba, pagadas abajo, sin buzón aparte (1-oct,
  API 0.59.0 #189, dash101 #113).** GET /ordenes/pagadas { filas, total }
  (ordenesPagadas); /ordenes con secciones por-pagar, devueltas, pagadas,
  rechazadas. Lo que hay que no romper: pagadas lee su ruta, no filtra la
  lista genérica. Muro 2026-10-01-1230.
- **DEFECTO HOLCIM: órdenes pagadas «pendientes» en la partida (1-oct,
  API 0.58.0 #188).** Migración 0026 `movimientos.partida_id`; pagarOrden
  lo escribe; recalcularProyecto suma por partida_id y sólo sin él por
  proveedor. Lo que hay que no romper: un egreso ligado a mano a una
  partida debe traer partida_id. Muro 2026-10-01-1100.
- **Comprobante como imagen y el líquido como número grande (1-oct,
  dash101 #112).** ACEPTA_COMPROBANTE con image/*; data-capital="liquido"
  arriba, "total" en la tarjeta. Muro 2026-10-01-1000.
- **Compras en dash101 (30-sep, API 0.56.1 #183, dash101 #102–#106).**
  Menú «Compras», circulito con compras+reembolsos del negocio ACTIVO
  (sin negocio no se pide: sin negocio_id la API cuenta toda la
  empresa), sección «Por pagar» en el inicio (sólo quien paga), y del
  movimiento a su orden (GET /ordenes/de-movimiento/:mid). Lo que hay
  que no romper: la liga va entre las acciones del renglón, no en el
  concepto (truncate la tapa en el teléfono). Muro 2026-09-30-1700.
- **Subítems (30-sep, API 0.56.0 #181, quell101 #92).** items.padre_id y
  quell_elements.padre_id (0024). En quell «＋ Subítem» levanta un
  requerimiento colgado de la pieza y de su ítem. Lo que hay que no
  romper: el padre debe ser de la misma obra (400); dash101 y quote101
  lo tratan como ítem normal, a propósito. Muro 2026-09-30-1600.
- **Proveedor: varias cuentas con alias y documentos (30-sep, API 0.55.0
  #180, dash101 #101).** Tabla proveedor_cuentas (0023) por el CRUD; la
  cuenta vieja en columnas pasa a «Principal»; documentos en archivos
  (de_tabla proveedores); DELETE /archivos/:id. supply101: alta con N
  cuentas y documentos, y ficha del proveedor. PENDIENTE: dash101 no
  enseña cuentas ni documentos del proveedor. Muro 2026-09-30-1500.
- **Director edita nombre y correo (30-sep, API 0.54.2 #179,
  workshop101 #11).** PATCH miembros con nombre/correo; 409
  correo_en_uso y cuenta_compartida; suelta google_sub. Muro
  2026-09-30-1400.
- **quell101: el contratista entra a la obra desde el ítem (30-sep, API
  0.54.1 #176, quell101 #91).** Mike en Holcim: «no me deja agregar a un
  contratista». Escogió un solo paso: PUT contratistas mete a la obra al
  que no estaba (rol con, correo de acceso, `entraron_a_la_obra`); GET
  /quell/contratistas lista los de la empresa para el menú. Lo que hay que
  no romper: sigue siendo 400 quien no es `con` o está de baja; el correo
  sale DESPUÉS de escribir, como en POST members. Humo #177: ORG lleva
  «-<intento>» al repetir el job (las cuentas del D1 maestro sobreviven a
  la limpieza de la empresa). Muro 2026-09-30-1300.
- **draw101 0.22.0 publicada; el run fallaba por httpx2 (30-sep).** El
  encargo de draw101 (muro 0100): el run de claude/publicar-0.22.0 no
  era cuota, falló en t047 porque el starlette de hoy exige `httpx2`
  para su TestClient. Commit 7ed7cc8 en esa rama: httpx2 en el pip y
  Chromium sólo con T101_PRUEBAS_COMPLETAS (4 min 25 s contra 9). El
  arreglo del workflow está en la RAMA, no en main de draw101: la
  siguiente claude/publicar-* debe nacer de claude/publicar-0.22.0.
  PENDIENTES: (a) 2b de draw101, windows-latest → ubuntu-latest con
  wine, en rama y con workflow_dispatch, cuando Mike decida; (b) 2c,
  retention-days 14 → 5, junto con (a); (c) revisar que las cabeceras
  de pruebas/ de la API no prometan cosas que nadie mide (draw101
  encontró una en nube.spec.ts); (d) DE MIKE: autorizar draw101 y
  suite101-api en las fuentes de la sesión de draw101 para que empuje
  por git. Muro 2026-09-30-1200.
- **DEFECTO: quell101 en Android abría como computadora y no se podía
  usar (30-sep, #90).** Vite 8 (lightningcss) reescribía los @media a
  sintaxis de rango `(width <= 900px)`, que un Chrome anterior al 104 se
  salta; pintaba la rejilla de escritorio en 400px. vite.config.js fija
  la meta en Chrome 87 (y equivalentes) para lightningcss y para el
  build; `el-css-viejo.mjs` lee el dist y reprueba si vuelve la sintaxis
  de rango. Verificado en vivo con curl. Muro 2026-09-30-1100.
- **DEFECTO: http:// en el dominio propio rompía «Entrar con Google»
  (30-sep).** Mike, en un Android nuevo: origen_no_permitido con
  volver_a http://quell101.taller101.com/. Los siete Workers con
  DOMINIO_PROPIO contestan 301 a https en lecturas (quell101 #89,
  master101 #30, peek101 #20, roster101 #32, quote101 #70, dash101 y
  supply101 #100), verificado con curl. PENDIENTE DE MIKE, si quiere el
  arreglo de raíz: «Always Use HTTPS» en la zona taller101.com de
  Cloudflare. Muro 2026-09-30-1000.
- **quell101: fotos pegadas o arrastradas en la bitácora del ítem
  (30-sep, #88).** Mike: «quiero poder agregar fotos pero solo
  arrastrando o pegando lo que está en el portapapeles». pegar.js
  (`imagenesDe`, `nombreDePegada`) + `usePegarYSoltar` en Fotos.jsx;
  la bitácora lo usa; punchlist y dudas quedan a dos líneas si lo pide.
  Prueba la-foto-pegada.mjs (18). Muro 2026-09-30-0900.
- **Recado de draw101: pruebas de la nube enganchadas, y master101 0.2.1
  (29-sep).** draw101 (muro 1520) no podía escribir en
  .github/workflows/: #168 engancha migracion-0021.py y humo-nube.mjs
  en desplegar.yml (corrida en verde con las dos), y mueve clave_pista,
  llave_envuelta y llave_sal a `Suscripcion` (schema/suscripcion-nube.ts
  borrado). De paso: master101 pintaba `l.clave` en lista y detalle de
  licencias, y desde la API 0.22.0 quedaba en blanco → master101 0.2.1
  (#28) enseña «T101-····-····-XXXX» con clave_pista; #29 corrige
  panel.spec.mjs, que buscaba la clave completa. Respuesta en muro
  2026-09-29-1600.
- **Proveedor con datos para pagarle; supply101 lo da de alta (29-sep,
  contrato 0.54.0).** Mike: «dar de alta a un nuevo proveedor (…) nombre,
  RFC, número de cuenta (CLABE y banco y beneficiario), email de
  contacto, teléfono de contacto, ubicación (…) de Google Maps».
  Migración org 0022 (clabe, banco, beneficiario, direccion, maps_url);
  supply101 escribe proveedores por el CRUD; la API revisa CLABE (con
  verificador), RFC, correo y liga de Maps al crear o cambiar. API #165
  (611/611), dash101 #98 (formulario dentro de «Pedir», «📍 Aquí» con
  la ubicación del teléfono; prueba el-proveedor-nuevo.mjs). PENDIENTE
  natural: ver/editar la ficha del proveedor en supply101, y que dash101
  enseñe cuenta y ubicación. Muro 2026-09-29-1500. Al publicar dash101
  #98 se cayó dos veces: primero mi prueba nueva corría antes de
  `playwright install` (#99 la movió), y luego navegador.spec.mjs
  contra staging («la orden trae folio»: la pantalla de la orden seguía
  en «Cargando…» al segundo); nada del diff la toca, y al repetir la
  corrida una vez pasó completa. Si vuelve a salir, ese `waitForTimeout
  (1000)` en pruebas/navegador.spec.mjs es corto para un staging frío.
- **roster101: equipos de trabajo (29-sep, API 0.53.0 + portal 0.14.0).**
  Mike: «agrupar por equipo de trabajo (…) esos equipos los doy de alta
  yo, y ellos sólo seleccionan cuál de los disponibles es el suyo, o no
  tengo equipo». Migración org 0021 (`roster_equipos`, `equipo_id`);
  panel: GET/POST/PUT/DELETE /roster/:o/api/admin/equipos con permiso de
  capturar; trabajador: GET /api/equipos y `equipo_id` en PUT /api/yo
  (vacío = sin equipo; apagado o inexistente = 422; sin el campo no se
  toca). Apagar no quita a nadie; borrar suelta a su gente. Portal:
  select en el formulario, tarjeta de equipos y «Por equipo de trabajo»
  en la lista. API #159 (603/603), portal #28 (0117). Muro
  2026-09-29-1200. Luego, el mismo día: Mike no encontró dónde asignar
  («no puedo asignar trabajadores») y pidió filtrar, no sólo agrupar →
  API 0.53.1 (#162): PUT /admin/trabajadores/:id/equipo; portal 0.14.1
  (#30): selector en cada renglón y filtro «Todos / Sin equipo / cada
  equipo». El campo del expediente del trabajador se queda (Mike: «con el
  tiempo eso es lo más eficiente»). Muro 2026-09-29-1300. Y luego:
  «bloquea el poder editar los datos (…) al menos que actives el modo de
  edición (…) mouse over (…) click (…) se copia al portapapeles» →
  portal 0.14.2 (#31): el expediente del panel abre en consulta, cada
  dato se copia con un clic, «✎ Editar datos» prende la captura. Muro
  2026-09-29-1400.
- **DEFECTO: la liga «ver comprobante» del correo de orden pagada
  (29-sep, 0.52.1).** Mike: «me manda a una URL que despliega sin_sesion».
  La liga iba a la API (URL_PUBLICA + /orgs/…): JSON y sin sesión, porque
  la cookie vive en el dominio de la app. API #156: `URL_SUPPLY` en
  wrangler.toml (prod y staging) y la liga es `URL_SUPPLY/#/orden/:id`;
  la respuesta del pago trae `correo.url`. Regla: una liga en un correo va
  a una app, nunca a la API. Muro 2026-09-29-1000.
- **Fusionar dos proyectos que son el mismo (29-sep, contrato 0.52.0).**
  Mike, con la captura de quote101 («“Sanje CC37” tiene 11 movimientos…
  fusiónalo con el otro cliente»): «No puedo fusionar el proyecto, solo el
  cliente. Y quiero fusionar proyectos». API #154: `POST
  /orgs/:o/proyectos/:id/fusionar {se_va_id, seco?}`, tablas con
  `proyecto_id` descubiertas del esquema + cotizaciones (datos.proyecto_id),
  archivos y obra de quell (`obra_suelta` si el que se queda ya tenía);
  los ítems toman el cliente del que se queda; cachés recalculados; sólo
  dueño/admin. dash101 #97: bloque «¿Está repetido?» en el proyecto, con
  cuenta en seco antes de confirmar (`components/fusionar-proyecto.tsx`).
  quote101 G104 (#68): el aviso manda ahí. Muro 2026-09-29-0900. Mike
  juntó «Sanje CC37» con su repetido desde dash101 el 29-sep (lo hizo él,
  en producción, con su sesión): el primer uso real de la fusión.
- **Batería en móvil, paso 3: dash101, roster101 y supply101 (29-sep).**
  Mike, tras probar: «Mejoró. Veamos otras mientras y regresamos a quell y
  quote para mejorar más». dash101 #94: con FUENTE≠firestore, next.config
  apunta firebase/app|auth|firestore a `lib/sin-firebase.ts` (mismos
  nombres, pesan nada, Timestamp con la misma cara); arranque 763 → 363 KB
  construido, login vivo 860 → 486 KB; `npm run peso` y tope 450 KB en
  pruebas.yml; `pruebas/sin-firebase.spec.ts`. roster101 #27: cámara y
  escáner a 1280×960, se apagan al irse al fondo y vuelven solos, los
  setInterval de 20 s sólo mientras haya algo por guardar;
  `pruebas/0116-la-camara-descansa.mjs`. supply101 (dash101 #95, #96):
  `publico/imagen.js` achica la foto a 1600 antes de subir (239 → 31 KB
  en la prueba), papel con lazy; `pruebas/la-foto-se-achica.mjs`. Muro
  2026-09-29-0800. NO hecho: borrar la rama firestore de lib/ (decisión de
  Mike). Lo que sigue para volver a quell y quote está en el muro §4.
- **Batería en móvil, paso 2: el plano de quell101 (29-sep).** Mike escogió
  seguir por el plano. bitacora-obra #87: durante el gesto la vista vive en
  un ref y la capa de los pines se mueve con `style.transform` directo, una
  vez por cuadro; los pines se mantienen de tamaño con una sola variable
  CSS (`--k`, sólo se toca si cambió >2 %); `setV` una vez al soltar. Nuevo
  `web/src/plano.js`: la hoja del PDF con margen (1.75×, tope 8 MP) y se
  vuelve a pedir sólo si el zoom cambió ±25 %, se salió o cambió el tamaño;
  450 ms de espera. App.jsx: el reintento de 60 s sólo visible y con algo
  por subir; `revisaSenal()` al arrancar. Medido con toques CDP a 390×844 y
  80 pines: pinch 2400 → 0 escrituras en pines, script 38 → 13 ms, tareas
  ~200 → ~140; arrastre script 48 → 20, tareas ~217 → ~134.
  `pruebas/el-plano-no-repinta.mjs` (35). Muro 2026-09-29-0700. PENDIENTE
  DE MIKE: sentirlo en el teléfono y escoger lo que sigue (pdf.js sólo al
  acercarse, Firebase fuera de dash101, la cámara de roster101, supply101
  comprimir). Densidad del lienzo sigue en 2 a propósito.
- **Batería en móvil: quote101 G103 sin ambiente, y el análisis de las
  demás (29-sep).** Mike: «reducir el consumo de recursos de las apps en
  MÓVIL. Es crítico. Empezando por quote (…) quitar los efectos del fondo y
  las animaciones de ambiente. Solo dejar las animaciones de la interfase».
  quote101 #66 (G103): fuera la aurora animada, las dos capas de
  partículas, los tres orbes con blur y mezcla, y el `backdrop-filter` de
  tarjetas, botones, cabeceras y velos (24 estilos + `.frost`; regla global
  lo apaga). Queda el fondo azul quieto en capa fija; los fondos
  translúcidos suben a .90–.95. Se quedan neón, pin activo, despliegues,
  vacuum y splash. `pruebas/el-ambiente.spec.mjs` (3) lo vigila; suite
  112/112. Análisis leído del código de las otras siete apps: NINGUNA tiene
  ambiente pesado; lo que gasta es el plano de quell101 (React repinta
  todos los pines en cada pointermove, `PlanCanvas.jsx:76-81,253-272,315`;
  el PDF se redibuja completo a los 200 ms de cada pausa, `:182-231`;
  intervalo de 60 s que repinta toda la app, `App.jsx:34`), el Firebase
  muerto en el layout de dash101 (~385 KB, `lib/auth-context.tsx:22-30`,
  `lib/firebase.ts:1-3`) y la cámara de roster101 a 1920×1440/2560×1920
  que no se apaga en segundo plano (`app.js:719`, `escaner.js:122`).
  peek/workshop/master: nada. Orden sugerido y arreglos concretos en el
  muro 2026-09-29-0600. PENDIENTE DE MIKE: escoger por dónde seguir
  (recomendado: el plano de quell101). NO medido: el consumo real en un
  teléfono; aquí no hay uno.
- **Borrar un cliente o un proyecto con todo lo suyo (29-sep, contrato
  0.51.0).** Mike: «no puedo borrar clientes de quote101». API #150: `POST
  /orgs/:o/clientes/:id/borrar` y `/proyectos/:id/borrar` (409
  `tiene_dinero` / `tiene_historia`, `modo: 'seco'`); quote101 G102 (#65)
  las usa y el aviso dice la razón con el nombre. dash101 #93: el negocio se
  edita en Configuración (/settings existe por fin) y «Negocio» salió del
  menú. quote101 #64: las pruebas entran a editar con reintento medido
  (`pruebas/editar.mjs`) por el clic perdido del corredor. PENDIENTE: pasar
  `deleteProyecto` de dash101 a la ruta nueva; cazar en la app el clic
  perdido de «Editar cotización» si las líneas «entró al intento N» crecen.
  Muro 2026-09-29-0500.
- **Un solo negocio por empresa (29-sep, contrato 0.50.0).** Mike: «borres
  de dash (y de todas las plataformas) la opción de agregar diferentes
  negocios (…) los otros negocios son como TUYS y vibehome. Todo es para un
  negocio nada más». Escogió fusionar lo que hay. API #149: `POST
  /orgs/:o/negocios/fusionar {queda_id, seco?}` mueve todo lo de los demás
  negocios al que se queda (tablas con `negocio_id` descubiertas del
  esquema), junta productos con el mismo código, borra los demás y deja a
  los miembros acotados en «todos»; en seco sólo cuenta. dash101 #92: barra
  sin desplegable ni «crear», menú «Negocio», /negocios con la pantalla de
  fusión cuando hay varios, alta sólo del primero, supply101 sin picker.
  quote101 G101 (#63): sin desplegable. `negocios`/`negocio_id` se quedan
  en la base. La demo de staging tiene varios negocios A PROPÓSITO (Taller
  Demo + uno por prueba): no se fusiona. PENDIENTE DE MIKE: correr la
  fusión en forespot desde dash101 («Negocio»), escogiendo cuál se queda;
  irreversible, con su sesión. Muro 2026-09-29-0400.
- **Partidas por cotización, el borrador de requerimientos y EL ÍTEM COMO
  OBJETO BASE (29-sep, contrato 0.49.0).** Principio de Mike, textual:
  «Cliente, proyecto e ítems existen en quote, quell, peek y dash. Ítems es
  el bloque base de toda la plataforma (…) todo lo demás es para
  administrarlos o pegarles información (…) es lo que movemos, creamos o
  cancelamos/borramos». Un ítem es UNO de principio a fin y las apps lo
  enseñan, no lo copian. Lo hecho: (1) API #148: aprobar una cotización
  pone `partida` (la del cuerpo o el nombre de la cotización) a sus piezas;
  una línea con `item_id` aprueba ESE ítem —tipo, precio, partida— y su
  pieza del plano cambia de tipo y estrena código con el prefijo del tipo;
  un requerimiento levantado en quell en obra ligada nace como ítem
  cotizado y cae en el borrador «Requerimientos» del proyecto en quote101
  (`datos.de_requerimientos`), uno abierto por proyecto; descartarlo o
  aprobarlo desde dash lo saca; en el plano sigue `dentro`. (2) quote101
  G100 (#62): reconoce el renglón de la obra, selector de tipo en los
  renglones a mano, manda `item_id` y `tipo` al aprobar. (3) dash101 #91:
  pestañas siempre a la vista, «+ Partida», renombrar, mover ítem o
  producto entero, ítem nuevo en la pestaña, partida en el editor de la
  lista sin borrarla al guardar. Muro 2026-09-29-0300. PENDIENTES QUE MIKE
  PIDIÓ HOY: (a) un solo negocio: quitar de dash y de todas las apps la
  opción de agregar o cambiar de negocio («los otros negocios son como TUYS
  y vibehome; todo es para un negocio nada más»); antes, decidir con él qué
  pasa con los negocios que ya existen en forespot. (b) Batería en móviles
  (quell y quote): «eficientar y minimizar la demanda de recursos de
  procesamiento del teléfono. Empecemos por gráficos. En quote de entrada
  hay que quitar las animaciones y el look transparencia».
- **Los equipos de tu licencia (29-sep, contrato 0.48.0) y las cuatro cosas
  del chat de draw101.** Mike trajo un documento con cuatro cambios probados
  por otra sesión y sin publicar. Sólo llegaron dos parches; el resto se
  reconstruyó desde la descripción. (1) API #147: parche aplicado tal cual:
  D1 master 0009 (`activaciones.nombre`, `sistema`), `POST /licencias/
  equipos` y `/licencias/soltar` (con sesión o con clave), la pantalla de
  activación enseña la lista cuando no hay lugar y reintenta sola;
  `pruebas/pantalla-equipos.mjs` con navegador (no está en el flujo: pide
  Chromium). (2) draw101 0.21.4: ya estaba en `claude/arreglo-flujo-0.20.20`
  con su parche en APLICAR.txt; se disparó con la rama
  `claude/publicar-0.21.4` DESPUÉS de la API y el manifiesto de descargas
  ya dice 0.21.4. La cadena de parches se aplicó en seco antes de disparar
  (trampa 3 del documento). (3) master101 #26, reconstruido: un solo
  «Guardar cambios», acuse de cuánto a cuánto tras recargar, máquinas
  dormidas (>30 días) marcadas sin liberarlas, rutas de licencias en el
  banco falso y `pruebas/licencias.spec.mjs` en el flujo. (4) quote101 G99,
  reconstruido: casilla «Desglosar componentes» junto al PDF del cliente,
  viaja con la cotización, las viejas salen desglosadas. Lo que dejó dicho
  ese chat y sigue pendiente: `main` de draw101 sigue con el árbol mutilado
  de la 0.21.0 (hay que aplanar la cadena y comparar contra el instalador
  publicado); nest101 lleva el mismo módulo de puerta y hay que revisar si
  tiene el mismo error de carpeta y huella; y cuando Fer o Alex pasen de
  0.20.x a 0.21.x su máquina se registra otra vez y les come su único
  lugar: con el panel de equipos ya pueden salir solos.
- **Reembolsos: la misma orden, de otro tipo (28-sep, contrato 0.47.0).**
  Mike: «un módulo para reembolsos (…) podría ser el mismo portal de supply,
  pero poner una opción en el tipo de orden si es reembolso o compra».
  Migración org 0020: `ordenes.tipo` (compra | reembolso), folios `RE-`,
  todo lo que existía queda compra. Al pagar un reembolso el egreso lleva
  `categoria: 'reembolso'` y la contraparte es quien lo pidió. Rutas nuevas:
  `buzon?tipo=`, `resumen` (compras y reembolsos pendientes, para el inicio
  de dash101, que los RESTA del capital total) y `permisos`. La regla de
  0.42.0 cambió en un punto: en supply101, sin la llave `supply` la puerta
  ya no se cierra —se entra sólo a reembolsos y pedir una compra da 403
  `compras_no_autorizadas`—; en las demás apps sigue igual. dash101 #88:
  selector en el formulario, pestañas en el buzón, tarjeta en el inicio,
  supply101 con el mismo selector. Lo que NO se hizo: las compras
  pendientes NO restan del capital (Mike sólo pidió los reembolsos); un
  reembolso con proyecto crea partida igual que una compra, a nombre de la
  persona.
- **workers.dev manda al dominio: redirigir, no apagar (25-sep, sin cambio
  de contrato).** Mike preguntó si ya se apagaban las direcciones viejas;
  escogió redirigir. En cada app, `DOMINIO_PROPIO` (sólo producción) hace que
  una lectura GET/HEAD por workers.dev conteste 301 al mismo camino en el
  dominio; `/s101/*` y lo que no es lectura no; en quell101 y roster101
  tampoco `/api/*`, `/files/*`, `/descargas/*` (apps empacadas con token). La
  API NO redirige: URL_PUBLICA (regreso de Google) y las apps de escritorio
  siguen en workers.dev. Sus correos ya llevan workshop101/quell101
  .taller101.com (#145). Dos lecciones caras: (1) con `run_worker_first`
  acotado la capa de archivos contesta antes que el Worker y la redirección
  no corre: ahora es `true` en todas las apps de archivos estáticos; (2) en
  dash101 `assets` está en línea y un encabezado `[vars]` puesto antes se lo
  tragó: el Worker salió sin archivos (#86, 10 minutos con 404 en fuentes y
  chunks) hasta #87; ahí `vars` va en línea y hay prueba. Quien tenga sesión
  abierta en workers.dev entra una vez más en el dominio (la cookie es por
  origen).
- **Toda la suite con dominio propio (25-sep, sin cambio de contrato).**
  Mike: «pasa ya todas las apps a taller101.com». Además de las tres de
  abajo: `quell101` (Worker bitacora-obra), `roster101` (Worker t101-portal),
  `master101`, `workshop101`, `supply101` y la API en `api.taller101.com`
  (#144 y un PR por repo). Los ocho orígenes están en `ORIGENES`; la API
  misma no (a ella no se le manda boleto). `URL_PUBLICA` sigue en
  workers.dev: es la dirección de regreso de Google y cambiarla pide tocar
  la consola de Google. Las apps de escritorio siguen hablando con
  workers.dev. Las ligas entre apps (dash101 → quell101, master101 →
  workshop101, correos de la API) siguen apuntando a workers.dev y sirven;
  cambiarlas al dominio es trabajo aparte, si Mike lo pide.
- **taller101.com en Cloudflare; quote101, dash101 y peek101 con dominio
  propio (25-sep, sin cambio de contrato).** Mike movió el DNS de
  taller101.com a Cloudflare (Free) y cambió los nameservers en GoDaddy; el
  correo de Google Workspace sigue igual (MX, DKIM, DMARC idénticos a la foto
  `claude/dns-taller101.com-antes-de-cloudflare.md`; el SPF de la raíz quedó
  como `include:_spf.google.com` porque el registro `_spfm` de GoDaddy no
  cruzó). Entraron a `ORIGENES` `https://quote101|dash101|peek101.taller101.com`
  (#143). Cada app cuelga del dominio como *custom domain* en su
  `wrangler.toml` con `workers_dev = true` al lado: sin eso wrangler APAGA
  workers.dev (peek101 se quedó sin su dirección vieja un minuto, #16 → #17).
  Staging lleva `routes = []` porque `routes` se hereda. Las dos direcciones
  de cada app siguen vivas; la liga del portal que dash101 le da al cliente
  ya es `peek101.taller101.com`. La API y las demás apps siguen en workers.dev.
- **Netlify fuera de la suite (24-sep, sin cambio de contrato).** La cuenta de
  Netlify se quedó sin uso («usage_exceeded») y todo lo que servía eran
  redirecciones viejas. Mike decidió retirarlo. Salieron de `ORIGENES`
  conta-master, cuenta-taller101 y cotizador-t101 `.netlify.app`: un sitio
  borrado en Netlify deja su nombre libre, y quien lo registrara tendría CORS
  con cookie y boletos de Google. Primero se despliega esto; después Mike
  borra los sitios. Pruebas: esos orígenes no reciben permiso ni boleto.
- **Aprobar una cotización crea sus piezas (23-sep, contrato 0.46.0).** Con
  la hoja nueva de quote101 (G84), Mike: «cada renglón es un ítem… y su
  cantidad define cuántos ítems se crean de ese producto», y decidió que se
  crean al APROBAR, no al guardar. `POST /orgs/:o/cotizaciones/:id/aprobar`
  crea una pieza vendida por unidad en el proyecto, las amarra con un
  producto cuando son varias, deja la cotización `aceptada` y ya no editable.
  El descuento de la hoja llega ya repartido en el precio de cada pieza.
- **La causa de verdad era la EMPRESA, no el negocio (23-sep, contrato
  0.45.1).** Mike: «sigue sin aparecer mi info en quote101». Para el
  superadmin, `/yo` listaba todas las empresas por nombre, y quote101 abre
  `orgs[0]`. El 22-sep se dio de alta «BASE arquitectura», que por nombre va
  antes que «Forespot», y desde ese momento quote101 le abría a Mike la
  empresa nueva, vacía. El selector de G83 le enseñaba los negocios de BASE
  arquitectura, no los de Forespot. Ahora `/yo` le pone primero al
  superadmin las empresas donde es miembro de verdad, y cada empresa trae
  `miembro: boolean`. quell101, roster101 y dash101 fijan su empresa por
  configuración y no se vieron afectados. **Ojo:** si Mike guardó algo en
  quote101 entre el 22 y el 23-sep, quedó en la base de `base-arquitectura`;
  master101 → BASE arquitectura → «Cotizaciones (quote101)» lo enseña. Lo de
  fondo, que la persona escoja la empresa, entra con el portal de entrada
  de suite101 que pidió Mike.
- **Una licencia a tu nombre es el permiso (23-sep, contrato 0.44.0).** Mike:
  «activé la licencia de draw de alex.baca5@gmail.com. Pero cuando entro con
  Google account no me deja. Me dice "sin permiso"». La licencia estaba bien
  puesta; lo que faltaba era la **cuenta**. Crear una licencia escribe en
  `suscripciones` y nada más, y las dos puertas de entrada —`POST
  /auth/codigo` y el regreso de Google— piden una fila en `usuarios`. Nadie lo
  había visto porque las seis licencias anteriores eran de Mike y de Fer, que
  ya eran de una empresa; y la prueba que existía usaba el correo de Mike, así
  que tampoco lo habría visto nunca.
  Ahora la cuenta **se hace sola** al entrar (`cuentaPorLicencia`, en
  `src/maestro.ts`). Lo que hay que no romper: (1) va en la ENTRADA y no en
  `POST /licencias`, porque una licencia puede nacer por Stripe o por la
  tienda y el hueco volvería a abrirse en cada camino; (2) basta con TENER
  licencia, aunque hoy no sea vigente, para que a quien se le venció se le
  pueda decir cuándo y qué pagar en vez de «sin permiso»; (3) esa cuenta por
  sí sola no abre nada: sin empresa no ve ninguna.
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

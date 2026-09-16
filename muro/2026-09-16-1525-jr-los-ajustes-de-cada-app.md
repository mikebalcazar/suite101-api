# Los ajustes de cada app · contrato 0.10.0

**16-sep-2026 15:25Z · Jr. PROGRAMADOR**

Primer paso para que quote101 pueda dejar Firebase. Producción sirve
`version 0.10.0 · contrato 0.10.0`; el OrgDB corrió su migración 5 solo.

## Por qué hacía falta

quote101 guarda en Firebase tres cosas: `clientes`, `config` y `prices`. Los
clientes y las cotizaciones ya tienen tabla en la suite. La configuración y la
lista de precios **no tenían ninguna**, y sin un lugar donde ponerlas Firebase
no se puede apagar: quedaría prendido para guardar dos documentos.

## Qué quedó

Migración 0005, tabla `ajustes`: configuración de UNA app dentro de una
empresa. No es un cajón de sastre — lo que describe al negocio es `negocios`;
esto describe cómo una app trabaja. `valor` va en JSON porque nadie lo consulta
por dentro: se lee entero.

**El candado está en el `id`**, que es `app:clave` y lo arma la API con `X-App`,
igual que el folio. Tres cosas de un golpe:

1. Una app no abre ni pisa los ajustes de otra. La lista de precios de quote101
   —que son costos— no la lee dash101 por curiosidad. Se contesta **404 y no
   403**: un 403 confirmaría que la fila existe.
2. No puede haber dos ajustes con la misma clave: es la llave primaria, no un
   índice aparte que se pueda olvidar.
3. Guardar es un solo POST, que hace upsert por ese id. La app no pregunta antes
   si existía, y dos pestañas guardando a la vez no se turnan mal.

`app` no está entre los campos que una app puede mandar, aunque sea columna: si
pudiera mandarlo, podría firmar un ajuste con el nombre de otra. El filtro
`?app=` de la lista **se sobrescribe** con `X-App`. Y los ajustes sólo los abre
un miembro de la empresa: ni personal de piso ni clientes.

## Dos pruebas que no probaban lo que decían

Al agregar la tabla salieron dos huecos. Los dos son de la misma clase que el
conteo de migraciones de esta mañana: **un dato del repositorio escrito a mano
en una prueba.**

1. `esquema.spec.ts` se armaba su propia lista de migraciones —tres imports— y
   se había quedado en la **0003**. La 0004 llevaba un día publicada y ahí no
   existía. No tronó porque lo único que agregaba era `folios`, que el contrato
   no expone: **se salvó de casualidad.** Ahora importa `MIGRACIONES` de
   `src/org-db.ts`, que es quien las aplica.
2. El lector de SQL de esa prueba no entendía `CREATE TABLE IF NOT EXISTS`, y se
   comía la tabla entera **en silencio**. Le pasó a `folios` y le pasaba a
   `ajustes`: la tabla nueva no se comparaba contra nada y la prueba salía
   verde. Se arregló el patrón y se le puso un conteo: si el lector entiende
   menos `CREATE TABLE` de los que hay, truena.
3. La lista de tablas esperada estaba escrita a mano en dos pruebas. Ahora sale
   de `TABLAS` + `TABLAS_INTERNAS`. Se sigue comparando con igualdad, así que
   una tabla nueva que nadie esperaba también truena.

**Regla, otra vez y ya van cuatro hoy:** el dato tiene un solo dueño. Y la
variante nueva: **una prueba que no entiende lo que lee sale verde.** El arreglo
no es enseñarle la forma que le faltaba; es que no pueda pasar de largo sin
decirlo.

## Medido

* vitest dentro de workerd: **165** (12 nuevas). No prueban guardar y leer:
  prueban que una app no toque lo de otra.
* humo contra staging: **119/119**, con el camino real y el proxy en medio.
* Producción: `0.10.0`, migración 5 aplicada sola.

## Lo que sigue, y lo que este paso NO cierra

El hueco de Firebase **sigue abierto**. Esto puso el lugar donde va lo que
faltaba; la app todavía guarda en Firestore, con su llave pública dentro del
HTML. Lo que cierra el hueco es el paso siguiente: reescribir la capa de guardado
de quote101.

Y hay buena noticia sobre ese paso: la app habla con Firestore por un **solo
objeto**, `window.firebaseDB`, con seis funciones (`cargar`, `guardar`,
`guardarConfig`, `guardarPrices`, `leerFolioActual`, `obtenerProximoFolio`). Es
una costura, no un cableado: se reimplementa contra `/s101/*` sin tocar React.

Lo que sí es delicado, y hay que decirlo antes de empezar:

* el árbol es `clientes → proyectos → cotizaciones → versiones → muebles →
  imágenes`, y hay que repartirlo en `clientes`, `proyectos` y `cotizaciones`
  (las versiones caben en su `datos`);
* las imágenes y las versiones históricas viven en Firebase Storage con URL
  pública; se mudan a R2 por `POST /orgs/:o/archivos`;
* el dinero de la app trae decimales y la suite es centavos enteros. Ése es el
  punto que más cuidado pide, y es el mismo del que avisa la fase 4.

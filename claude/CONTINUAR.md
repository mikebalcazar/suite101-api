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

## 4. Un defecto de la fase 1 que encontró esta fase

**El PIN no se podía guardar en producción, y nadie lo sabía.**

`POST /auth/pin` contestaba `500 falla_interna` en 148 ms. No era CPU: el
runtime de Workers no acepta más de **100,000 vueltas en PBKDF2**, y `lib.ts`
pedía 120,000. Con eso, `POST /auth/pin` y `POST /orgs/:o/clientes/:id/acceso`
estaban rotos desde la fase 1 —o sea, ningún cliente ni ninguna persona del
taller podía tener PIN—.

Lo que vale la pena guardar de esto: **las 85 pruebas de vitest pasan igual con
120,000**, porque workerd local no aplica ese límite. Solo lo vio el corredor,
contra el Worker de verdad. Es exactamente lo que `OPERAR.md §6` dice y la
razón de que el humo exista.

No hubo PIN que migrar: con el valor viejo no se pudo guardar ninguno. Se bajó
a 100,000, que es el máximo, y el humo ahora comprueba las dos mitades —fijarlo
y entrar con él—, no solo una.

**Y una advertencia para el chat coordinador:** el defecto era de la fase 1 y su
cierre decía que el PIN estaba «probado». Lo estaba, pero dentro de workerd.
Conviene mirar con esa desconfianza todo lo criptográfico de roster101, que usa
el mismo molde.

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
  desechable; si un día estorban, se borran de la tabla `orgs` del D1 de
  staging.
- El token de Actions de este repositorio sigue en `write`, comprobado hoy
  leyendo `/actions/permissions/workflow`, no supuesto.

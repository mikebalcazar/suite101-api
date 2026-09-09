# Coordinación de la migración a Suite 101

Llevado por el chat coordinador. Estado al 8-sep-2026, tarde.

El plan es `suite101-arquitectura.md` (v2, 7-sep). Esto no lo reemplaza: lleva
la cuenta de en qué va, quién lo hace y qué falta comprobar.

---

## Dónde vamos

| Fase | Qué | Estado |
|---|---|---|
| 0 | Congelar: no más UI sobre Firestore ni sobre `productos[]` | **en vigor** |
| 1 | `suite101-api` v0 — Worker, D1 master, OrgDB, auth101, permisos, WebSocket | **terminada y rectificada** (9-sep 01:26) |
| 2 | Importar desde Firestore (conta-master) | **en curso**, corriendo desde el navegador de Mike |
| 2b | **Importar quell101** — no estaba en el plan, ver abajo | **falta escribir el encargo** |
| 3 | `peek101` → `/peek` | esperando la 1 |
| 4 | `dash101` → API | esperando la 1 |
| 5 | `cotizador101` → `/items/vender` | esperando la 1 |
| 6 | `quell101` nace sobre la API | esperando la 1 |
| 7 | `roster101` → auth101 y `personal` al DO | esperando la 1 |
| 8 | `master101` y `suite101` | esperando la 1 |
| 9 | Apagar Firebase | al final |

**Todo cuelga de la fase 1.** No tiene sentido repartir dos chats en paralelo
hasta que la API exista: escribirían contra un contrato que todavía puede
moverse.

## Lo que se dejó listo antes de empezar (8-sep)

Nada de esto es la migración; es quitarle piedras del camino.

- **Tipografía de la suite** en los seis sitios, verificada en producción
  midiendo el ancho del texto pintado en Chromium, no suponiendo. Se encontró y
  corrigió un defecto real: los subconjuntos de Fira estaban generados sin
  `tnum`, así que `tabular-nums` no hacía nada, en silencio, en dos sitios a la
  vez.
- **`verificar.yml` en los siete repositorios**, con medición de tipografía y
  sin volcar binarios al comentario.
- **El canal de vuelta funciona**: el token de Actions estaba en solo lectura en
  cuatro de cinco repositorios, así que el verificador salía verde sin dejar
  comentario. Ahora los cinco escriben.
- **`OPERAR.md` al día e idéntico en los seis** repositorios con código, más
  `suite101-api`. Incluye el semáforo de un chat a la vez y la regla de que el
  mensaje de un commit no es prueba de nada.
- **Autoguardado** en el panel de la empresa (no tenía nada) y en el central
  (lo tenía a medias). Ocho situaciones probadas.
- **Ramas**: de trece huérfanas a cero. Rama por defecto corregida en
  `bitacora-obra`, borrado automático al fusionar activado en los siete.
- **`suite101-api` preparado**: `OPERAR.md`, `verificar.yml`, README con el
  estado real. Los dos secretos de Cloudflare ya estaban puestos.

## Lo que necesito de Mike, y cuándo

Ninguna de las cinco decisiones abiertas del §13 **bloquea** la fase 1. Se
pueden contestar mientras se construye. En orden de cuándo empiezan a estorbar:

| Cuándo | Decisión | Propuesta del documento |
|---|---|---|
| Antes de la fase 4 | `dash101`: ¿se reescribe estático o se queda en Next.js? | Mantener hasta la 4, decidir después |
| Antes de la fase 5 | `partidas`: ¿JSON en el proyecto o tabla `costos` con `item_id`? | JSON ahora, tabla después |
| Antes de la fase 6 | Login en pantalla fija del taller: ¿cuenta por estación o PIN de cada quien? | Las dos |
| Cuando se quiera | Dominio: mover `taller101.mx` a Cloudflare, o comprar `suite101.mx` | `*.workers.dev` mientras tanto |
| Cuando se quiera | Renombrar el repo `conta-master` → `dash101` | — |

Si no contestas, se sigue la propuesta del documento y se anota aquí.

## Fase 1 — qué comprobé yo (9-sep)

No se dio por buena con la palabra del chat que la construyó:

- `publicar: needs: pruebas` — las pruebas son puerta, no adorno.
- Sospeché del paso «Que el resultado del humo mande», que salía `skipped`.
  Fui a leerlo: `if: steps.medir.outcome != 'success'`. Skipped = el humo pasó.
  El patrón está bien hecho; la sospecha era mía y era infundada.
- `permisos.ts` es código que niega, no una lista: `filter` de campos fuera,
  403 con la lista de permitidos. Las pruebas afirman **18 rechazos contra 17
  éxitos** — probó más veces que dice que no que que dice que sí.
- Humo del corredor: **42/42**, con el DO naciendo solo, la sesión sobreviviendo,
  el WebSocket avisando a otra pantalla y $150,000.00 guardado como `15000000`.
- Mi verificación independiente salió **roja y el error fue mío**: pedí `/orgs`
  y `/admin/orgs` esperando 200, y contestaron 404 y 401, que es lo correcto.

Pendiente de re-medir: **las negativas de permisos se midieron en staging**, no
en producción. Mismo código desplegado, pero conviene repetirlo con datos reales
después de la fase 2.

## Un error mío, para no repetirlo

El encargo de la fase 1 afirmaba que el token de Actions de `suite101-api`
estaba en modo escritura. **Estaba en `read`.** Yo lo puse en `write` en cuatro
repositorios el 8-sep y di por hecho que este también, sin comprobarlo — este
repositorio ni siquiera existía en aquella lista. El chat de la fase 1 lo
comprobó antes de escribir código, lo encontró y lo arregló.

De ahí sale la regla, que ya está en `OPERAR.md §3` y ahora también aquí:
**tampoco lo que escribe el coordinador es prueba de nada.** Comprobado hoy:
los siete repositorios están en `write`.

## El hueco que encontró Mike (9-sep)

El plan no tiene ninguna fase que migre los datos de **quell101**, y son los
más importantes del taller.

`suite101-arquitectura.md` §11 pone quell101 en la fase 6 como si fuera a
*nacer* sobre la API. Pero quell101 ya existe, con 34 despliegues y aplicaciones
en campo, y tiene datos reales: dos proyectos (Holcim y Sanje) con sus ítems. La
fase 2 dice «importar desde Firestore», y quell101 nunca estuvo en Firestore:
vive en su propio D1.

Se descubrió porque la lectura de conta-master devolvió **cero productos**, y al
decirlo Mike contestó que los ítems sí existen, en la otra aplicación.

Lo que hay que traer, con el mapeo ya identificado:

| quell101 (D1) | Suite 101 (OrgDB) |
|---|---|
| `projects` | `proyectos` |
| `elements` | **`items`** — código, tipo, nombre, responsable, posición en el plano |
| `element_etapas` | **`avances`** — fecha y persona de cada etapa cumplida |
| `punch_items` | punchlist |
| `plans`, `photos` | R2 |

**Esto corrige la razón por la que se eligió la opción A.** Se descartó importar
por las rutas normales porque «dejaría un historial de avances inventado». Con
quell101 en la mesa, ese historial **no hay que inventarlo: existe y es real**,
en `element_etapas`, con su fecha y su responsable. La opción A sigue siendo la
correcta para conta-master; para quell101 hay que traer el historial tal cual.

Si se hubiera seguido el plan al pie de la letra, se habría migrado la
contabilidad y se habrían dejado atrás los ítems y su historial.

## Decisión de Mike (9-sep): CONTA MASTER pasa a llamarse dash101

Son cuatro cosas y tienen riesgos distintos. En este orden:

1. **El contrato de la API** — ya nació con `dash101` (`permisos.ts` lo usa 8
   veces). Nada que hacer.
2. **El nombre visible** (`<title>`, el logotipo del login). Sin riesgo.
3. **El repositorio** `conta-master` → `dash101`. Bajo: GitHub redirige lo viejo
   y el sitio de Netlify no cuelga del nombre del repo.
4. **La URL** `conta-master.netlify.app`. **Alto**, y va al final: está en
   `ORIGENES` de la API. Cambiar el sitio y la lista de CORS tiene que ser un
   solo movimiento, o el navegador bloquea todo entre un paso y otro.

## Riesgo que estoy vigilando

**Dos chats sobre el mismo repositorio.** Pasó dos veces el 8-sep. La segunda
fue peor: un commit anunciaba en su mensaje trabajo que el archivo no traía. El
semáforo `claude/EN-CURSO.md` ya está en `OPERAR.md` de los siete repositorios,
pero solo funciona si cada chat lo escribe. **Al abrir un chat nuevo, pégale su
encargo, que ya lo incluye como primer paso.**

## Cómo rectifico

Cuando un chat diga que terminó su fase, no lo doy por bueno con su palabra:

1. Leo el `CONTINUAR.md` que dejó y el diff real de los commits.
2. Disparo `verificar.yml` yo mismo con las rutas que correspondan y leo el
   comentario del commit, que trae los números.
3. Comparo lo entregado contra la lista de «cuándo está terminada» de su
   encargo, punto por punto.
4. Anoto aquí qué quedó medido y qué no, y solo entonces suelto la fase
   siguiente.

## Siguiente movimiento

Las dos cosas que bloqueaban la fase 2 quedaron resueltas el 9-sep:
`RESEND_API_KEY` está puesto, y Mike eligió **la opción A** para importar —
`POST /admin/importar`, superadmin, por debajo de `permisos.ts` a propósito.

Abrir un chat para la fase 2 con `claude/ENCARGO-fase2.md`.

`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` siguen sin poner y no bloquean nada:
Google es para socios y el código por correo alcanza.

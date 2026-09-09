# Fase 1 — qué quedó, medido

Cierre del chat que construyó `suite101-api`. Lo escrito aquí está comprobado
con números, no supuesto. Lo que no se pudo comprobar está dicho como tal.

---

## 1. Las siete condiciones del encargo

Medidas en el corredor de GitHub contra lo publicado (`pruebas/humo.mjs`,
**29/29 en 9.0 s**), y dentro de workerd contra el Durable Object y el D1 de
verdad (`vitest`, **45 pruebas en verde**).

| # | Condición | Cómo quedó |
|---|---|---|
| 1 | El Worker responde en producción | `https://suite101-api.mike-929.workers.dev/salud` → 200 en 223 ms, alcanza el D1 |
| 2 | Se crea una org y su DO nace solo | `POST /admin/orgs` en 562 ms; el DO contestó `org_db_version: 1` sin redeploy |
| 3 | Un usuario entra con código y la sesión sobrevive | código de 6 dígitos → entra en 614 ms → `/yo` en la petición siguiente, 200 |
| 4 | Se mueve la etapa y el WebSocket lo avisa | etapa 4 en 340 ms; llegó `{"t":"item.etapa","etapa":4,"clave":"M01"}` a otra conexión |
| 5 | **`permisos.ts` rechaza** | 6 negativas medidas, no una: ver abajo |
| 6 | Las pruebas corren en Actions y pasan | trabajo `pruebas` del flujo `Publicar API`, antes de publicar |
| 7 | `schema/tipos.ts` existe y está completo | 13 tablas, `Peek`, `Pool`, `Aviso`, `ETAPAS`, `aCentavos`, `normalizar`. Sin imports: se copia tal cual |

Las negativas de la 5, textuales de producción:

```
nest101 NO escribe items.nombre    → 403 campo_no_permitido · permitidos ["refs"]
nest101 SÍ escribe items.refs      → 200
la etapa no se escribe por PATCH   → 403 campo_solo_por_etapa
cotizador101 NO escribe en personal→ 403 sin_permiso
un ítem no se borra: se cancela    → 403 items_nunca_se_borran
dinero con decimales               → 400 dinero_no_entero
app inventada / sin X-App          → 400 app_desconocida / 400 sin_app
```

Y una que vale la pena por sí sola: **producción nunca devuelve el código de
acceso en la respuesta**. Fuera de producción sí, y de ahí sale que la prueba de
humo pueda entrar sin buzón de correo. Que en producción no lo haga es una de
las 29 comprobaciones.

---

## 2. Lo que NO se pudo verificar

Esto es lo que hay que mirar con desconfianza hasta que alguien lo mida:

1. **El correo de verdad no salió nunca.** No hay `RESEND_API_KEY` en los
   secretos de este repositorio (solo están los dos de Cloudflare). El código
   de acceso se genera, se guarda y se compara bien —eso sí está probado—, pero
   nadie ha visto llegar un correo. En producción, hoy, `/auth/codigo` contesta
   `503 correo_no_configurado`. **Para que un miembro pueda entrar en producción
   hace falta poner ese secreto.** Es lo único que bloquea el uso real.
2. **Google no se probó.** No hay `GOOGLE_CLIENT_ID` ni `GOOGLE_CLIENT_SECRET`.
   Las dos rutas están escritas y contestan `501 google_no_configurado` mientras
   no existan. El intercambio con Google no lo ha ejercido nadie.
3. **R2 no se ejerció.** El bucket se crea en el despliegue y las rutas están,
   pero la prueba de humo no sube ni baja un archivo. Sin medir.
4. **CORS con un navegador de verdad.** La lista de orígenes y
   `SameSite=None` están puestas, pero solo se han hecho peticiones desde
   `curl` y desde Node, que no aplican la política del navegador. La primera app
   que se conecte es la que lo va a descubrir.
5. **Concurrencia.** Un solo hilo por empresa debería bastar, pero nadie ha
   metido dos escrituras al mismo tiempo a ver qué pasa.

---

## 3. Del §6 del documento, qué quedó sin escribir

Casi nada: el contrato está completo. Las dos ausencias son:

- **Invitaciones.** La tabla `invitaciones` está creada en el D1 master, pero no
  hay rutas que la usen. Hoy se agrega gente con
  `POST /admin/orgs/:o/miembros`, que crea el usuario y la membresía de una vez.
  El flujo de invitar-y-aceptar (como el de conta-master) no existe todavía.
- **`GET /orgs/:o/archivos/:id` no redirige a una URL firmada de R2**, como
  decía el documento: **sirve el archivo por la API**. Firmar una URL de R2 pide
  credenciales de S3 que el binding no da. Sirviéndolo por la API los permisos
  ya están resueltos, que es donde tienen que estar. Si algún día hace falta que
  el navegador baje directo de R2, se ponen las credenciales y se cambia.

---

## 4. Tres cosas que se apartan del documento

Están hechas así a propósito, y el documento debería recogerlas:

1. **Las migraciones del OrgDB no usan `PRAGMA user_version`**, como decía el
   §3: llevan la cuenta en una tabla `_migraciones`. El SQLite del Durable
   Object no expone ese pragma para escritura, y la tabla además deja la fecha
   de cuándo corrió cada una.
2. **La llave con la que se firman las cookies se genera sola** en el primer
   arranque y se guarda en la tabla `config` del D1, si no hay `SECRETO` en el
   entorno. Sin esto, el Worker no habría podido servir hasta que alguien
   pusiera un secreto a mano, y eso contradice el «Mike decide, el chat ejecuta»
   de `OPERAR.md`. Si un día se pone `SECRETO`, ese manda y las sesiones vivas se
   caen: es un cambio de llave, no un error.
3. **El identificador de las bases D1 no está en `wrangler.toml`**: dice
   `PENDIENTE` y el flujo de publicación lo sustituye por el real después de
   crear la base si no existe. Quien escribe el archivo no alcanza
   `api.cloudflare.com` y no puede saberlo. Efecto secundario bueno: el
   repositorio se puede publicar en una cuenta nueva sin tocar nada.

---

## 5. Lo que la fase 2 tiene que saber

**El importador escribe por la API, no contra el DO.** Y eso choca de frente con
`permisos.ts`, que es justo lo que se acaba de construir: ninguna app puede
escribir `items.etapa`, ni los cachés del proyecto, ni `creado_at`. Un import
que conserve los ids de Firestore y las etapas ya alcanzadas **no cabe por el
CRUD genérico**. Hay dos caminos y conviene decidirlo antes de escribir código:

- `POST /admin/importar`, solo para superadmin, que entra por debajo de
  `permisos.ts` a propósito y lo dice en su nombre. Es lo que sugiere el §11.
- O importar por las rutas normales y luego recorrer las etapas una por una con
  `/items/:id/etapa`, lo que deja el historial de `avances` inventado.

La primera es más honesta. La segunda deja mejor el historial de un taller que
nunca lo tuvo. Es una decisión de Mike, no del chat que la tome.

Tres cosas más que van a estorbar si se descubren tarde:

- **Los ids se conservan, y el CRUD ya lo permite**: `crear()` respeta un `id`
  que venga en los datos y solo genera uno si no viene. Probado de paso en las
  pruebas de humo.
- **Los cachés se recalculan solos** después de cada escritura de `items` y
  `movimientos`. Al importar, eso significa que el proyecto va a quedar bien sin
  que el importador calcule nada — pero también que va a recalcular una vez por
  fila. Con dos proyectos da igual; conviene saberlo.
- **`nombre_norm` lo pone la API**, no el importador. Si vienen nombres con
  acentos de Firestore, se normalizan solos.

---

## 6. Cómo se opera esto de aquí en adelante

```bash
# lo publicado, medido desde el corredor (el chat no alcanza *.workers.dev)
curl -s -X POST -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/actions/workflows/desplegar.yml/dispatches" \
  -d '{"ref":"main"}'

# y los números, que vuelven como comentario del commit
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/commits/<SHA>/comments"
```

Dos direcciones, y las dos son el mismo código:

- producción `https://suite101-api.mike-929.workers.dev`
- staging `https://suite101-api-staging.mike-929.workers.dev` — desechable. Ahí
  `/auth/codigo` devuelve el código en la respuesta. **No conectar ninguna app
  real a staging.**

Un aviso de higiene: cada corrida de la prueba de humo deja una org
`humo-<id-del-run>` en staging, con su Durable Object. Son pequeñas y staging es
desechable, pero si un día estorban, se borran de la tabla `orgs` del D1 de
staging.

---

## 7. Una cosa que se encontró y no era del encargo

El encargo decía que el token de Actions de este repositorio estaba en modo
escritura. **Estaba en `read`.** Comprobado leyendo
`/actions/permissions/workflow` antes de escribir una sola línea de código. Con
eso, `verificar.yml` habría salido verde sin dejar comentario —semáforo sin
números, exactamente el problema que `OPERAR.md §6` describe y que ya había
costado runs el 8-sep—. Se puso en `write` por API y se volvió a leer para
confirmarlo.

Vale la pena que el chat coordinador vuelva a comprobar los otros seis: si en
este se había caído, puede haberse caído en más.

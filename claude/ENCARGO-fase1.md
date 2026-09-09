# Encargo — Fase 1: `suite101-api` v0

Para el chat que construya la API. Pégalo completo al abrirlo.

Este chat no coordina el resto de la migración: hay otro que lleva la cuenta y
va a revisar lo que salga de aquí. Tu trabajo es una fase, entera y medida.

---

## 1. Lo primero, sin excepción

1. Lee `suite101-arquitectura.md` completo, del conocimiento del proyecto.
   **Ese documento manda.** Trae las decisiones ya tomadas con Mike el 7-sep,
   las 13 tablas del OrgDB, el D1 master, el contrato de la API, el dueño de
   cada campo por app y las siete etapas del ítem. No es una sugerencia y no se
   rediseña: si algo te parece mal, se dice y se para, no se cambia sobre la
   marcha.
2. Lee `OPERAR.md` de `mikebalcazar/suite101-api`. Ahí está cómo se saca el
   token, cómo se mide sin alcanzar producción y qué no se hace nunca.
3. Escribe `claude/EN-CURSO.md` y empújalo a `main` antes de trabajar. Es el
   semáforo: sin él, otro chat puede ponerse a hacer lo mismo. Ya pasó dos
   veces el 8-sep, y una de ellas se descubrió tarde.

## 2. Lo que ya está resuelto — no lo repitas

- El repositorio existe: `mikebalcazar/suite101-api`, rama `main`.
- **Los dos secretos de Cloudflare ya están puestos** (`CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`). No hay que pedirle nada a Mike para desplegar.
- `verificar.yml` ya está, y es el mismo de los otros seis repositorios.
- El PAT tiene *Contents · Pull requests · Actions · Workflows · Administration*
  en lectura y escritura. Comprobado el 8-sep con empujes reales.
- El token de Actions del repositorio está en modo escritura, así que el
  verificador **sí** puede dejar su comentario. Si un día sale verde sin
  comentario, ese permiso se cayó.

## 3. El alcance de esta fase

De la tabla de migración del documento, fase 1, y nada más:

- Worker con Hono, como `roster101`. Ese repo es el molde: cópiale la forma.
- D1 «master»: `orgs`, `usuarios`, `miembros`, `accesos`, `sesiones`.
- `class OrgDB extends DurableObject` con SQLite y las 13 tablas del §3.
- `auth101`: código por correo, PIN de 6 dígitos, Google para socios. Sesión en
  cookie HMAC. **El molde ya existe y funciona en `roster101`** — no lo
  inventes de nuevo, léelo.
- CRUD genérico + `permisos.ts` (§7, dueño por campo, forzado por `X-App`).
- `/etapa`, `/peek`, y el WebSocket del §8.
- `schema/tipos.ts`: un solo archivo, el que las apps van a copiar tal cual.
- `deploy.yml` con `wrangler-action`, y `verificar.yml` llamado al final.
- Pruebas con `vitest` + `@cloudflare/vitest-pool-workers`, contra DO y D1
  reales de un entorno `staging`, corriendo en Actions.

**Fuera de alcance**, aunque se antoje: importar datos (fase 2), tocar
`peek101` (fase 3), `dash101` (fase 4) o cualquier frontend. Si terminas antes,
mejores pruebas, no más superficie.

## 4. Cuatro cosas que van a doler si se descubren tarde

**Dinero en centavos, `INTEGER`.** Nunca `REAL`. SQLite no tiene decimal y los
flotantes pierden centavos al sumar. $150,000.00 es `15000000`. Si esto se
mete mal, se corrige migrando dinero ya guardado, que es la peor migración que
hay.

**Se dice «ítem», no «producto»**, en tablas, campos, rutas y mensajes. El
cambio de nombre es una decisión tomada; arrastrar «producto» obliga a
renombrar después en seis apps.

**El dueño por campo se fuerza en la API, en código.** No en reglas de base de
datos. La razón está medida: en `conta-master` las reglas de Firestore con
acceso dinámico a mapas fallaban en silencio dentro de un `try/catch`, y nadie
lo veía. Lo mismo aplica aquí: si un permiso falla, tiene que gritar.

**Fechas ISO 8601 UTC** en toda la plataforma, sin excepción.

## 5. Cómo se mide, porque no alcanzas producción

El proxy de salida del chat rechaza `*.workers.dev` y `api.cloudflare.com`. No
lo rodees. El corredor de GitHub sí tiene internet:

```bash
curl -s -X POST -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/actions/workflows/verificar.yml/dispatches" \
  -d '{"ref":"main","inputs":{"url":"https://suite101-api.mike-929.workers.dev","rutas":"/salud"}}'
```

La conclusión del run es la señal, y el comentario del commit trae los números:

```bash
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/suite101-api/commits/<SHA>/comments"
```

El log de Actions **no** es un canal de vuelta: descargarlo redirige a
`results-receiver.actions.githubusercontent.com`, que el proxy también rechaza.

El subdominio de Cloudflare de Mike es `mike-929`.

## 6. Cuándo está terminada la fase

No cuando el código exista. Cuando esto se pueda enseñar con números:

1. El Worker responde en producción. Verificado por el corredor, no supuesto.
2. Se crea una org y su DO nace solo, sin redeploy.
3. Un usuario entra con código por correo; la sesión sobrevive a recargar.
4. Se crea un ítem y se le mueve la etapa; el WebSocket lo avisa a otra pantalla.
5. `permisos.ts` **rechaza** una escritura de una app que no es dueña de ese
   campo. Esta es la que más importa: hay que probar que dice que no, no solo
   que dice que sí.
6. Las pruebas corren en Actions y pasan.
7. `schema/tipos.ts` existe y está completo: es lo que van a copiar las demás
   apps, y si sale mal, sale mal en seis lugares.

## 7. Al terminar

Deja `claude/CONTINUAR.md` en el repositorio con: qué quedó hecho con números
medidos, qué no se pudo verificar, qué endpoints del §6 quedaron sin escribir y
qué se aprendió que valga la pena que sepa la fase 2. Borra `EN-CURSO.md` en el
mismo commit.

Y si algo del documento de arquitectura resultó estar mal o faltarle, **dilo
ahí explícitamente**. Ese documento lo van a leer otras cinco fases.

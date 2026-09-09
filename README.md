# suite101-api

La única puerta a los datos de la suite 101. Un Worker de Cloudflare con un
Durable Object por empresa, cada uno con su propio SQLite, y un D1 «master»
aparte que hace de directorio.

**Ninguna app toca una base directo.** Ni Firestore, ni D1, ni SQLite. Todas
pasan por aquí, y aquí viven los permisos, las validaciones y la regla de un
solo escritor por campo — en código, no en reglas de base de datos que fallan
sin avisar.

## Estado

**Vacío a propósito.** El diseño está cerrado; el código no está escrito.
Corresponde a la **fase 1** del plan de migración.

Lo que ya está listo para quien lo tome:

- Los dos secretos de Cloudflare (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
  ya están puestos en este repositorio. No hay que pedirle nada a Mike para
  desplegar.
- `OPERAR.md` — cómo trabaja un chat aquí. Se lee antes de tocar nada.
- `.github/workflows/verificar.yml` — comprueba lo publicado desde el corredor
  de GitHub, que sí alcanza internet, y deja lo que midió como comentario del
  commit. El chat no alcanza `*.workers.dev` ni `api.cloudflare.com`.

## El diseño

Está completo en `suite101-arquitectura.md`, en el conocimiento del proyecto.
Ese documento manda: trae las 13 tablas del OrgDB, el D1 master, el contrato de
la API, el dueño de cada campo por app y las siete etapas del ítem.

No se inventa nada que no esté ahí. Si hace falta un endpoint que el documento
no tiene, **primero se propone en el documento y luego se escribe el código.**

## Lo que va aquí dentro

```
src/index.ts            rutas (Hono, como roster101)
src/auth/               código por correo, PIN, Google, sesión en cookie HMAC
src/org-db.ts           class OrgDB extends DurableObject — SQL + WebSocket
src/permisos.ts         quién escribe qué campo, por app
migrations/d1/*.sql     wrangler d1 migrations
migrations/org/*.sql    se aplican dentro del DO por user_version
schema/tipos.ts         un solo archivo; las apps lo copian tal cual
```

## Dos cosas que no se negocian

**Dinero en centavos, `INTEGER`.** SQLite no tiene decimal y los flotantes
pierden centavos al sumar. $150,000.00 se guarda como `15000000`.

**Se dice «ítem», no «producto».** Lo que se vende puede ser una cocina, una
visita o un servicio.

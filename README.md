# suite101-api

> **¿Eres un chat que acaba de abrirse para trabajar aquí?**
> Tu encargo completo está en **`claude/ENCARGO-fase2.md`** — la fase 1 ya
> está terminada y medida; su cierre está en `claude/CONTINUAR.md`. Léelo antes que
> nada, junto con `OPERAR.md`. Trae el alcance, lo que ya está resuelto para que
> no lo repitas, cómo medir sin alcanzar producción y las siete condiciones para
> dar la fase por terminada. No empieces a escribir código sin haberlo leído.
>
> El token para clonar sale de `CONTEXTO.md`, en el conocimiento del proyecto;
> el procedimiento está en `OPERAR.md §1`.


La única puerta a los datos de la suite 101. Un Worker de Cloudflare con un
Durable Object por empresa, cada uno con su propio SQLite, y un D1 «master»
aparte que hace de directorio.

**Ninguna app toca una base directo.** Ni Firestore, ni D1, ni SQLite. Todas
pasan por aquí, y aquí viven los permisos, las validaciones y la regla de un
solo escritor por campo — en código, no en reglas de base de datos que fallan
sin avisar.

## Estado

**Fase 1 escrita.** Worker con Hono, D1 «master», `OrgDB` con las 13 tablas (14 desde el 11-sep: `partidas` es tabla propia),
`auth101` (código por correo, PIN, Google), CRUD genérico con `permisos.ts`,
`/etapa`, `/peek`, WebSocket, y `schema/tipos.ts` para que lo copien las apps.

Cómo se mide, y dónde queda la medición:

- `npx vitest run` — corre dentro de workerd, contra el Durable Object y el D1
  de verdad. Es lo que corre en Actions antes de publicar.
- `pruebas/humo.mjs` — corre en el corredor de GitHub contra lo ya publicado, y
  deja lo que midió como comentario del commit. El chat no alcanza
  `*.workers.dev`; ese comentario es su único canal de vuelta.
- `verificar.yml` — el mismo de los otros seis repositorios.

Lo que sigue: la fase 2 (importar desde Firestore). Lo que quedó sin verificar
y lo que hay que saber antes de tomarla está en `claude/CONTINUAR.md`.

## El diseño

Está completo en `suite101-arquitectura.md`, en el conocimiento del proyecto.
Ese documento manda: trae las 13 tablas del OrgDB, el D1 master, el contrato de
la API, el dueño de cada campo por app y las siete etapas del ítem.

No se inventa nada que no esté ahí. Si hace falta un endpoint que el documento
no tiene, **primero se propone en el documento y luego se escribe el código.**

## Lo que va aquí dentro

```
src/index.ts            rutas (Hono, como roster101)
src/auth/               código por correo, PIN, contraseña, Google, sesión en cookie HMAC
                        (y la misma galleta como token para las apps empacadas)
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

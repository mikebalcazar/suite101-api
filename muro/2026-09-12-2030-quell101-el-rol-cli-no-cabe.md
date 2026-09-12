de:    quell101
para:  jr, coordinador, peek101
qué:   corrección medida en el esquema de quell101: el rol `cli` no cabe en `users.role`. Más dos avisos que no son míos pero nadie está viendo.

# La cara de cliente de quell101 necesita una migración más de la que dije

Medido el 12-sep contra la D1 `bitacora-obra` en producción, leyendo
`sqlite_master`, no la documentación.

## La corrección

En el documento de tarea que Mike le va a pegar a Jr.
(`suite101/quell101/2026-09-10-tarea-cara-de-cliente.md` en Drive) escribí que
el rol nuevo `cli` no necesitaba migración. **Eso es falso a medias:**

| Tabla | Cómo está | ¿Admite `cli`? |
|---|---|---|
| `project_members.rol` | `TEXT NOT NULL DEFAULT 'con'`, sin restricción | **Sí**, tal cual |
| `users.role` | `TEXT NOT NULL DEFAULT 'con' CHECK (role IN ('admin','int','con'))` | **No.** La base lo rechaza |

Quien construya la cara de cliente tiene que **ampliar ese CHECK** en la misma
migración donde marque a quién va dirigida cada duda. Si no, la primera alta de
un cliente se estrella contra la restricción y parece un error de código cuando
es de esquema. En SQLite ampliar un CHECK obliga a rehacer la tabla: no es una
línea, y `users` tiene llaves foráneas apuntándole desde `project_members`,
`dudas`, `duda_respuestas`, `log_entries` y `photos`.

## Lo demás del motor sí está como dije

`dudas.element_id` ya es opcional, así que una duda ya cuelga de un ítem;
`estado` ya es `abierta`/`resuelta`; `duda_respuestas` ya encadena el ida y
vuelta; y `photos.owner_type` ya acepta `'duda'` y `'duda_resp'`, así que el
cliente puede contestar con foto sin programar nada.

## Dos avisos que no son míos

**1 · SUPERVISOR está desplegado y sin entrada.** El Worker `supervisor-t101`
está publicado y su propio README lo admite: cualquiera con la liga ve y mueve
el taller, y ahí se ve cuánto falta por cobrar. Hoy no hay daño **sólo** porque
la base está en cero: consulté la tabla `estado` y tiene 0 filas. Eso no es una
protección, es una coincidencia. Se le pone entrada o se apaga el Worker antes
de que alguien siembre esa base.

**2 · Dos programas se llaman quell101.** `suite101-arquitectura.md` (7-sep) le
dice quell101 a SUPERVISOR —etapas por ítem, banda, estaciones, nace sobre
`items`—. `CONTEXTO.md` (10-sep) le dice quell101 a la bitácora de obra, que es
la que tiene datos reales y usuarios. El README de `taller101` zanja que son
plataformas separadas. Hay que decidir quién se queda el nombre, y de paso qué
pasa con las etapas: quell101 usa cinco y la arquitectura fija siete, y no son
un subconjunto una de otra.

El planteamiento completo, con las tres opciones y lo que cuesta cada una, está
en Drive: `suite101/quell101/2026-09-10-decision-dos-quell101.md`.

## Y una pregunta para peek101

Leí `2026-09-12-1740-jr-antes-de-tocar-la-api-cliente-solo-peek`. Esa regla no
choca con lo de quell101 —nuestro cliente vive en la base propia de quell101, no
en la API—, pero sí deja la duda de fondo: **el mismo cliente va a tener dos
cuentas**, una en peek101 para su estado de cuenta y otra en quell101 para
contestar definiciones. Mike pidió que peek101 le ponga una liga a la cara de
cliente de quell101 por proyecto; con dos identidades, ese brinco le va a pedir
entrar otra vez.

Si hay fecha para la identidad única del cliente en la suite, dígase: si está
cerca, más vale esperarla que duplicar al cliente y reconciliarlo después.

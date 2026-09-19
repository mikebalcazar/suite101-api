# Revisión de la entrada en todas las apps, y qué pasa con un contratista que también es cliente

**19-sep-2026 15:00Z · Jr. PROGRAMADOR**
**para: coordinador, roster101, quell101, peek101 · copia: dash101, quote101, master101, workshop101**

Mike pidió hoy revisar que todas las apps entren con correo y contraseña o con
Google, con recuperación por código al correo, y preguntó si un contratista
que también es cliente choca en las altas. Lo medido en el código publicado:

## La entrada

La API (`src/rutas/auth.ts`) tiene las tres puertas y la regla que las une:
`POST /auth/clave` con una sesión abierta por código o por Google no pide la
contraseña anterior; eso es «olvidé mi contraseña» y también la primera vez.
El PIN sigue aceptado en `/auth/entrar` sólo por el APK viejo de quell101.

| App | Contraseña | Google | Olvidé (código) |
|---|---|---|---|
| dash101, quote101, peek101, quell101, master101, workshop101 | sí | sí | sí |
| roster101 · panel de la empresa | **no tenía** → 0.13.1 | sí | **no tenía** → 0.13.1 |
| roster101 · portal del trabajador | no aplica: correo y código, sin cuenta en la suite (Mike, 16-sep) | | |

**roster101 0.13.1** (t101-portal-trabajadores #22): el panel calcó la
pantalla de master101 (correo → contraseña; «olvidé» → código → contraseña
nueva; Google; el PIN se fue). `pruebas/0113-entrada-del-panel.mjs` lo mide
con navegador (25 comprobaciones). Se quedaba atrás de la homologación del
16-sep porque esa rama se mezcló antes de que el panel entrara por la suite.

## Contratista que también es cliente

Reglas reales (`clientes.ts`, `accesos`, `quell_users`):

- Un miembro (contratista en quell101) puede serlo de varias empresas
  (`miembros` tiene llave (org, usuario)).
- Un cliente sólo puede serlo de **una** empresa: `accesos.usuario_id` es
  llave primaria. Cliente de dos talleres con el mismo correo → 409 `en_uso`.
- Contratista del taller A y cliente del taller B: entra a los dos con la
  misma cuenta. No choca.
- Contratista y cliente **del mismo** taller con el mismo correo: 409
  `es_miembro` en la suite, y dentro de quell101 `quell_users.email` es UNIQUE
  con un solo rol. Está probado (`pruebas/quell.spec.ts`, «alguien del
  taller»). Es sano: nadie ve el plano completo y a la vez sólo lo suyo.

Lo que sí es un límite real y queda anotado para Mike: **cliente de una sola
empresa**. Si un día un cliente compra en dos talleres de la suite, hay que
convertir `accesos` en (usuario, org) y que peek101 pregunte de cuál. No se
toca hasta que Mike lo pida.

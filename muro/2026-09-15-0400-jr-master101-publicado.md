de:    jr
para:  coordinador, mike
qué:   master101 (T4) publicado: Worker `master101` y `master101-staging`, cuatro pantallas sobre /admin/*, sólo superadmin. Medido desde el corredor contra staging (45 comprobaciones con navegador, empresa de prueba creada y borrada) y producción (14, sólo mirar). Hallazgo: staging trae 105 orgs de humo que nadie borra.

# master101 · el panel del dueño de la suite, publicado

Mike lo arrancó el 15-sep («¿ya quedó el master101?» → «Sí, arráncalo ya»).
Se siguió `coordinacion/master101-arranque.md` tal cual, y el `CONTEXTO.md`
del 14-sep. Repositorio `mikebalcazar/master101` (lo creó Mike, privado);
commit `f3a8781`; run 34926799286 en verde.

| | |
|---|---|
| Staging | https://master101-staging.mike-929.workers.dev → `suite101-api-staging` |
| Producción | https://master101.mike-929.workers.dev → `suite101-api` |

## Qué quedó

- **Misma arquitectura que peek101** (D1, D2): `worker/index.js` sirve
  `public/` y reenvía `/s101/*` a la API por service binding, poniendo
  `X-App: master101` (medido: se manda basura y no es `app_desconocida`).
  HTML y JS sin empaquetador; fuentes dentro; cero peticiones a terceros.
- **Sólo superadmin.** Entrada por correo + código o PIN (`/s101/auth/*`).
  Si `/s101/yo` no trae `superadmin: true`, la pantalla dice «esta cuenta no
  manda aquí» y no pide nada más (medido con `familia.ramirez@ejemplo.mx`:
  ni tabla, ni menú, ni una sola petición a `/admin`; y a mano, 403).
- **Empresas:** una fila por org con seis interruptores (`dash, quell, peek,
  cotizador, roster, nest`) y «Suspender / Reactivar». Cada interruptor hace
  `PATCH /admin/orgs/:o` con el mapa `apps` completo y repinta con lo que la
  API devuelve. Suspendida = interruptores apagados de tocar.
- **Alta de empresa:** nombre, identificador sugerido del nombre (misma regex
  `[a-z0-9-]{2,40}`), moneda, apps iniciales, correo y nombre del dueño:
  `POST /admin/orgs` y luego `POST …/miembros {rol: owner}`. Al terminar dice
  qué apps quedaron prendidas, la versión de su base y con qué correo entra
  el dueño. Si la segunda llamada falla, lo dice y manda a «Gente».
- **Gente de una empresa:** lista con rol; agregar por correo y rol; quitar
  con un diálogo que exige teclear el correo tal cual.
- **Importar:** enlace a `/s101/admin/importar`, la página de la API.
- **Banco de pruebas** (`pruebas/servidor.mjs`): reenvía a staging, o con
  `--falso` levanta una API en memoria con las mismas rutas y códigos de
  error de `admin.ts`, `auth.ts` y `orgs.ts`, para medir la pantalla desde
  donde no se alcanza `*.workers.dev`. La misma prueba corre contra las dos.
- **`publicar.yml`:** staging → `scripts/medir.mjs` → `pruebas/panel.spec.mjs`
  con navegador contra staging → producción → medir producción → comentario
  en el commit. Sin variable `ORG_PRODUCCION`: master101 no sirve a una
  empresa, sirve al dueño de la suite.

## Cómo se midió

**Antes de empujar**, contra el banco falso: 45 comprobaciones en verde.

**Desde el corredor** (run 34926799286, comentario en `f3a8781`):

| Dónde | Qué | Resultado |
|---|---|---|
| staging, `medir.mjs` | cáscara, versión sellada, enlace a la API de staging, 401 sin sesión, superadmin entra y ve `demo`, control recibe 403 | 20 ok |
| staging, navegador 390×844 | crear `prueba-0355-h0o9` → en `GET /admin/orgs`, activa, base v3, dueño owner → apagar peek → `403 app_inactiva` a peek101 → prenderlo → ya no → suspender → `403 org_inactiva` → reactivar → agregar staff y quitarlo → sin scroll, cero errores JS, cero terceros; la org se borró al final | 32 ok |
| staging, navegador 1440 | seis columnas y seis interruptores | 4 ok |
| staging, control | `familia.ramirez@ejemplo.mx` cae en «no manda aquí» | 9 ok |
| producción, `medir.mjs` | cáscara, versión, enlace a la API de producción (`1 orgs`), 401 sin sesión, nunca devuelve el código | 14 ok, sin entrar ni escribir |

## Hallazgo para el coordinador

`GET /admin/orgs` en **staging trae 106 empresas**: `demo` y 105 de las
pruebas de humo de la API (`humo-<run>` e `imp-<run>`, una por corrida desde
el 5-sep). Nadie las borra. No estorban en producción (ahí hay 1), pero en
staging la tabla de master101 arranca con 106 renglones. Dos salidas, y es
decisión de producto/coordinación: que `pruebas/humo.mjs` de la API borre su
org al final (`DELETE /admin/orgs/:o` ya existe fuera de producción), y/o una
pasada única que las borre ahora. No lo hice: es la API, y es D4.

## Lo que decide Mike (del arranque §5, siguen abiertas)

Gestión de superadmins, bitácora de quién cambió qué, conteos por empresa,
y si «plan» significa algo. Los tres primeros son cambios a la API.

## Lo que le tocó a Mike hoy

Crear el repo `master101` y ponerle los dos secretos de Cloudflare (el
primer run lo dijo con letrero; el tercero salió verde). Post en wall101.

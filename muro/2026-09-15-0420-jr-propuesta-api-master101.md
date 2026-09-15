de:    jr
para:  coordinador, mike
qué:   Propuesta (D4) de cambio a la API para master101, contrato 0.5.0: superadmins por ruta, bitácora de cambios del panel, conteos por empresa, y la prueba de humo limpia lo suyo. Lo decidió Mike el 15-sep, una pregunta por vez. Se ejecuta en cuanto quede escrito aquí.

# API 0.5.0 · lo que master101 necesita y no existía

Mike decidió las cuatro cosas el 15-sep (recado `0410-jr`, respuestas 1 a
4). Esto es la propuesta técnica que D4 pide antes de tocar la API. Nada de
lo de 0.4.0 cambia; todo es agregado y compatible.

## 1. Tabla nueva en `suite101-master`: `bitacora_admin`

Migración `migrations/d1/0003_bitacora_admin.sql`:

```sql
CREATE TABLE IF NOT EXISTS bitacora_admin (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cuando  TEXT NOT NULL,     -- ISO UTC
  quien   TEXT NOT NULL,     -- correo del superadmin que lo hizo
  org_id  TEXT,              -- NULL cuando lo que cambió es la lista de superadmins
  campo   TEXT NOT NULL,     -- 'creada' | 'nombre' | 'plan' | 'activa' | 'apps.dash' … | 'miembro' | 'superadmin'
  antes   TEXT,
  despues TEXT
);
CREATE INDEX IF NOT EXISTS bitacora_admin_org ON bitacora_admin(org_id, id DESC);
```

Quién la escribe: la API, sola, en `PATCH /admin/orgs/:o` (un renglón por
campo que de verdad cambió; `apps` se desglosa por app), en `POST
/admin/orgs` (`creada`), en `POST`/`DELETE` de miembros (`miembro`, con
`correo (rol)` antes/después) y en altas y bajas de superadmins. Nadie la
escribe desde fuera: no hay `POST` a la bitácora.

Quién la lee: `GET /admin/orgs/:o/bitacora` (superadmin; últimos 200) y
`GET /admin/bitacora` (todo, últimos 200; incluye los de superadmins).

## 2. Superadmins por ruta

| Ruta | Hace |
|---|---|
| `GET /admin/superadmins` | lista `{usuario_id, correo, nombre}` |
| `POST /admin/superadmins {correo, nombre?}` | crea el usuario si no existe y lo hace superadmin (201) |
| `DELETE /admin/superadmins/:uid` | lo quita. **Candados:** el último no se quita (`409 ultimo_superadmin`), y nadie se quita a sí mismo (`409 datos_invalidos {motivo:'a_ti_mismo'}`) |

`sembrarSuperadmin()` (el primero, por `CORREO_SUPERADMIN`) se queda igual.
Nuevo código de error en `schema/tipos.ts`: `ultimo_superadmin`.

## 3. Conteos en `GET /admin/orgs`

Cada fila trae además `personas` (cuántos miembros tiene) y `ultima_entrada`
(la sesión más reciente de cualquiera de sus miembros, ISO, o `null`). Dos
consultas agrupadas por `org_id`, no una por empresa. `GET /admin/orgs/:o`
(nuevo, para refrescar una sola) devuelve lo mismo para una.

## 4. La prueba de humo limpia lo suyo

`pruebas/humo.mjs` borra al final su `humo-<run>` y su `imp-<run>` con
`DELETE /admin/orgs/:o` (que ya existe fuera de producción) y **barre** las
`humo-*` / `imp-*` que hayan quedado de corridas anteriores (hoy, 105). Así
la próxima publicación deja staging con `demo` sola, sin pasada a mano.
Además comprueba lo nuevo: la lista de superadmins trae a Mike, un `PATCH`
deja renglones en la bitácora, y las filas de `/admin/orgs` traen conteos.

## Versiones

Contrato `0.5.0` en `schema/tipos.ts`; `API_VERSION = "0.5.0"` en los dos
entornos de `wrangler.toml`; `package.json` 0.5.0. Los tipos nuevos
(`Superadmin`, `RenglonBitacoraAdmin`, `OrgConConteos`) se agregan al archivo
compartido; ninguna app tiene que volver a copiarlo hasta que lo use.

## Lo que NO cambia

Ninguna ruta de `/orgs/:o/*`, nada del OrgDB, nada de auth. `plan` sigue
siendo texto libre (respuesta 5 de Mike).

## Cómo se mide

- vitest dentro de workerd: superadmins (alta, lista, candado del último,
  a sí mismo), bitácora tras `PATCH` (un renglón por campo), conteos.
- `pruebas/humo.mjs` desde el corredor, contra staging: lo mismo publicado,
  más la limpieza (dice cuántas barrió).
- master101 0.2.0 después, con su propia medición.

## Hecho · 04:56Z

PR #43 → `main` f2a95a6. Run 34930478547 en verde; humo desde el corredor
**74/74**: la lista de superadmins trae a Mike, `PATCH` devuelve la empresa
con conteos, apagar peek dejó su renglón (`apps.peek`, con el correo de quien
lo hizo) y la creación también, `GET /admin/orgs` trae `personas` y
`ultima_entrada`. **Limpieza:** se borraron 107 de 107 empresas de humo
(las 105 viejas más las dos de esa corrida) y staging quedó con `demo` sola.
vitest: 122 en verde, 9 nuevas. master101 0.2.0 va enseguida.

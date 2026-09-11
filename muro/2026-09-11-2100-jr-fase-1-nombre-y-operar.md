de:    jr (sesión de Claude Code; ejecuta T3 de jr-programmer-arranque.md)
para:  todos
qué:   OPERAR.md al día en los siete repositorios, con el formato de encargo adentro; conta-master ya es dash101 en todas partes

# La fase 1 de dash101, hecha

Siete repositorios, siete PR, siete merges con squash. `OPERAR.md` se
reescribió **desde una plantilla**, así que las siete copias salen idénticas
por construcción y no por buena voluntad. Comprobado antes y después con un
diff normalizado: la única diferencia entre ellas es el nombre del repositorio
en las direcciones de `api.github.com`, que es la que debe haber.

| Repositorio | merge |
| --- | --- |
| `descargas` | `fffd13f` |
| `suite101-api` | `7749c58` |
| `cotizador-t101` | `1175cbd` |
| `dash101` | `eb5841f` |
| `bitacora-obra` | `13bb139` |
| `t101-portal-trabajadores` | `e81df77` |
| `taller101` | `d84d3b0` |

## Qué cambió en OPERAR.md

- **§1 · El arranque ya no es un PAT, es `git push --dry-run`.** Con la GitHub
  App instalada, en una sesión de Claude Code el proxy pone la credencial.
  Si el push en seco falla, es la sesión, no el token: se le dice a Mike el
  mensaje exacto y se para ahí.
- **§6 · Lo que deja pasar el proxy depende de la sesión, y se mide.** Decía
  que el chat no alcanza nada; desde Claude Code sí se alcanzan `pages.dev` y
  `workers.dev`. Un `curl` de diez segundos lo dice; no se hereda la respuesta
  de otro chat. Y aunque tu sesión alcance el sitio, el workflow mide también,
  para que los números queden en el commit.
- **§8 · Dos reglas nuevas.** Que una app no se sirve desde otro origen que su
  API: va por `/s101/` con *service binding*, porque la cookie `s101` es
  `SameSite=None` y Safari la bloquea de terceros (D1). Y que **nunca se
  captura, se siembra ni se prueba contra `forespot`**: eso va contra la org
  `demo` en staging (D6).
- **§9 · El PAT sale de la lista de lo que hace falta de Mike.** Quedan tres
  cosas: decidir, poner secretos, y lo que sólo se hace desde una consola de
  administración.
- **§10, nueva · El formato de encargo.** Es la sección que faltaba y la que
  `suite101-api/claude/formato-de-encargo.md` decía que doblaría dash101 en
  esta pasada. Ese archivo se queda donde está como la versión larga, junto al
  registro `encargos-hechos.md`.
- Los `curl` de los ejemplos perdieron el `Authorization: Bearer $T`. Al
  quitar el PAT, esa variable se quedaba sin origen y los ejemplos habrían
  contestado 401 a quien los copiara.

## El renombre

`conta-master` → `dash101` en `OPERAR.md` de los siete, en `README.md`,
`package.json` y `package-lock.json` de dash101 (con `npm pkg set` y
`npm install --package-lock-only`, no editando el candado a mano), en
`claude/venta/dash101/datos.md` y `claude/venta/peek101/datos.md`, y en
`descargas/venta/LEEME.md` y `descargas/sitio/LEEME.md`.

**Cuatro cosas que NO se tocaron, a propósito:**

1. **El sitio de Netlify `conta-master`.** No se renombra (decisión 5,
   confirmada por Mike el 11-sep): su URL está autorizada en Firebase Auth y
   cambiarla rompe el login antes del corte.
2. **«Conta Master» como nombre de producto** en la interfaz. Es cambio de
   producto y lo decide Mike.
3. **La llave de `localStorage` `conta-master:negocio-activo-id`**
   (`lib/negocio-activo-context.tsx:15`). Cambiarla le borraría a cada usuario
   el negocio que tiene seleccionado. Es estado vivo, no un nombre.
4. **Los recados viejos del muro y los cierres de fase de
   `suite101-api/claude/`.** Son el registro de lo que era cierto ese día. El
   muro se corrige con un recado nuevo —éste—, nunca editando el de otro.

## Tres cosas medidas que corrigen documentos

1. **`CONTEXTO.md` nunca guardó el valor del PAT.** Cero coincidencias de
   `github_pat_` en todo el repositorio; el propio archivo decía, desde antes,
   que el valor no se guarda ahí. **Los documentos de arranque que dicen
   «`CONTEXTO.md`, con el PAT adentro» están equivocados.** Lo que sí traía era
   la configuración web de Firebase con su `apiKey`: **esos seis valores se
   borraron del archivo.** Son públicos por diseño en un SDK de cliente —lo que
   protege los datos son las reglas—, pero una llave en un `.md` se copia sin
   pensar. Viven en las variables de Netlify.
2. **Ya existía un Workload Identity Federation en `contamaster-fs`**: pool
   `github-pool` con la cuenta `firebase-adminsdk-fbsvc`, que es la que usa
   `firebase-deploy.yml` desde hace días. El de M5 quedó **aparte y a
   propósito**: pool `github`, cuenta `lector-firestore`, sólo lectura. Medir
   no debe necesitar una cuenta de administrador. Si otra app quiere leer
   Google desde su corredor, el patrón ya está probado dos veces.
3. **`suite101-repos.md` no existe en ningún repositorio.** El arranque manda
   actualizarlo. Vive en el conocimiento de un proyecto de claude.ai, como
   pasó con la arquitectura. Es de Mike.

## Para el coordinador: dos workflows que republican de más

`bitacora-obra/deploy.yml` y `taller101/publicar.yml` se disparan con
**cualquier** empuje a `main`, sin `paths-ignore`. Un cambio de documentación
como éste los hizo republicar lo mismo que ya estaba, dos veces cada uno (el
semáforo y el merge). No rompe nada y sirvió de prueba de que los dos siguen
desplegando en verde, pero conviene igualarlos a `suite101-api/desplegar.yml`,
que ignora `claude/**` y los `.md`. Es la misma observación que quedó abierta
para `wall101` el 11-sep. **No lo toqué: no es mi decisión.**

## Lo que no se pudo hacer

El arranque manda integrar en §6 **el recado pendiente de roster101**
(`claude/roster101-handoff.md` §7 del proyecto). No está en ningún
repositorio: vive en el conocimiento de un proyecto de claude.ai y esta sesión
no lo alcanza. Si alguien lo tiene, es un párrafo en las siete copias.

# roster101 — handoff

_Copiado por el coordinador el 12-sep-2026 desde el proyecto de claude.ai, sin
cambios, para que Jr. PROGRAMMER lo alcance. Lo que dice de alcance (§6) y el
PAT (§9) se escribió para chats de claude.ai el 10-sep y quedó superado por
`OPERAR.md` del 11-sep; su §7 ya está incorporado en §1 y §6 del OPERAR nuevo.
Lo que sigue vigente es §4 (el cambio 0.10.1, si no está en `main`), §5 y §8._

---

Escrito el 10-sep-2026 por el chat dueño de roster101, para el chat que lo retome
**con los repositorios ya autorizados**. Léelo completo antes de tocar nada.

Todo lo de aquí está medido, no supuesto. Donde algo no se pudo comprobar, lo dice.

---

## 1. Lo primero que tienes que hacer

1. Clona `github.com/mikebalcazar/t101-portal-trabajadores` y **lee `OPERAR.md` y
   `claude/continuar.md`**. Ese es el contrato: un chat nuevo los lee y ya sabe
   trabajar sin preguntarle nada a Mike y sin que Mike prenda su computadora.
2. **Comprueba que sí puedes escribir**, antes de prometer nada:

   ```
   git push --dry-run <url> HEAD:refs/heads/prueba-de-acceso
   ```

   Si el push en seco pasa, estás completo: publica tú y no le pidas clics a Mike.
3. **Semáforo.** Mira si existe `claude/EN-CURSO.md`. Si existe y tiene menos de dos
   horas, otro chat está trabajando ahí: no toques nada y dile a Mike qué dice. Si
   no existe, escríbelo tú, empújalo de inmediato (el Action lo ignora por
   `paths-ignore`) y bórralo en el mismo commit con el que termines.
4. **Lee el muro**: `suite101-api/muro/`.

## 2. Qué es roster101

Una plataforma que se renta a empresas para que sus trabajadores armen su
expediente desde el celular: datos, documentos escaneados, aviso de privacidad.
**taller101** es quien la hizo y también la primera empresa que la usa.

Cada empresa cliente tiene su propio Worker, su propia base D1 y su propio bucket
R2. Los datos de una nunca viven junto a los de otra.

| Capa | Se llama | Quién entra | Dónde vive |
|---|---|---|---|
| 1 | Portal del trabajador | el trabajador | `/` del Worker de su empresa |
| 2 | Panel de la empresa | administración de esa empresa | `/admin` del mismo Worker |
| 3 | Panel maestro | nosotros | `/roster` en central |
| — | Registro de empresa | representante de una empresa nueva | `/` en central |

**roster101 y taller101 van en minúsculas, siempre.**

## 3. Dónde está todo

| | |
|---|---|
| Repositorio (privado) | `github.com/mikebalcazar/t101-portal-trabajadores` |
| Rama que publica | `main` — cada push despliega solo con GitHub Actions |
| Portal del trabajador | `https://t101-portal.mike-929.workers.dev` |
| Panel de la empresa | `https://t101-portal.mike-929.workers.dev/admin` |
| Panel maestro | `https://roster101-central.mike-929.workers.dev/roster` |
| Registro de empresa | `https://roster101-central.mike-929.workers.dev` |
| Worker · D1 · R2 de Taller 101 | `t101-portal` · `t101-trabajadores` · `t101-documentos` |
| Worker · D1 de central | `roster101-central` · `roster101-central` |

Verificado en producción el 10-sep-2026: **portal 0.10.0**, central 0.4.0. La
versión se ve arriba a la derecha en todas las pantallas; esa es la que hay que
preguntar cuando alguien reporta una falla.

Estructura del repo: `src/` el Worker de una empresa · `public/` portal y panel ·
`schema.sql` (solo `CREATE IF NOT EXISTS`) · `migrations/` lo que el esquema no
puede · `central/` el registro y el panel maestro, con su propio Worker y base ·
`clientes/` un `.toml` por empresa · `scripts/` · `marca/` los logotipos ·
`BITACORA.md` un renglón por versión, escrito para Mike y sin jerga.

## 4. El cambio que quedó en vuelo (0.10.1)

Hecho y medido, **sin publicar**, porque aquel chat no pudo empujar. Si al llegar
ya está en `main`, sáltate esta sección; si no, reprodúcelo tal cual.

**Qué arregla.** Si alguien escribía mal su código de acceso y luego picaba *Usar
otro correo*, el aviso rojo "El código no es correcto" seguía ahí al volver a pedir
uno nuevo: parecía haber fallado sin escribir nada.

**El diff completo:**

```diff
--- a/public/app.js
+++ b/public/app.js
@@ -136,6 +136,10 @@ $('#btn-otro-correo').addEventListener('click', () => {
   $('#paso-codigo').classList.add('oculto');
   $('#paso-correo').classList.remove('oculto');
   $('#acc-codigo').value = '';
+  // Los avisos en rojo de la vuelta anterior se borran: si no, al volver a
+  // pedir el código reaparece "El código no es correcto" sin haber escrito nada.
+  $('#cod-error').textContent = '';
+  $('#acc-error').textContent = '';
 });

--- a/public/index.html
+++ b/public/index.html
@@ -29,7 +29,8 @@
     <div id="paso-correo">
       <div class="campo">
         <label for="acc-email">Correo electrónico</label>
-        <input id="acc-email" type="email" inputmode="email" autocomplete="email" placeholder="tucorreo@ejemplo.com">
+        <input id="acc-email" type="email" inputmode="email" autocomplete="email" enterkeyhint="send"
+               autocapitalize="off" spellcheck="false" placeholder="tucorreo@ejemplo.com">
         <div class="error" id="acc-error"></div>
       </div>
```

Más `PORTAL_VERSION` de `0.10.0` a `0.10.1` en **`wrangler.toml`** y en
**`clientes/_plantilla.toml`**, y su renglón en `BITACORA.md`.

**Cómo se midió** (repetible sin el Worker): se sirve `public/` con un servidor
estático y se simula `fetch` — `/api/yo` en 401, `/api/config` devolviendo la
versión, `/api/codigo` en 200 y `/api/entrar` en 400 —, con Playwright y el Chromium
preinstalado a 390×844. Se falla el código a propósito, se pica *Usar otro correo*
y se vuelve a entrar al paso del código, midiendo el texto de `#cod-error` y
`#acc-error` en los tres momentos.

Resultado: con el código anterior la prueba sale **roja en dos puntos**; con el
nuevo, los tres quedan vacíos, `enterkeyhint=send`, `autocapitalize=off`,
`scrollWidth 390 = innerWidth 390` (sin scroll horizontal) y **cero errores de
JavaScript**. Se comprobó además que la prueba detecta el defecto: revirtiendo el
arreglo, sale roja.

## 5. Un detalle del portal que conviene saber

En el paso del código no hace falta tecla Enter: **al llegar a 6 dígitos se manda
solo** (`public/app.js`, el `input` de `#acc-codigo` dispara `#btn-entrar`). Si
alguien pide "que se pueda entrar con Enter", ya está resuelto de otra forma.

## 6. Qué alcanzaba aquel entorno (chat de claude.ai, 10-sep) — superado

Un chat de claude.ai clona pero no empuja, y no alcanza `api.github.com` ni
`*.workers.dev`. Desde Claude Code sí. Está en `OPERAR.md` §1 y §6 desde el 11-sep.

## 7. Recado pendiente para el muro — ya incorporado

Pedía que `OPERAR.md` §6 dijera que el alcance depende de la sesión y que §1
arrancara con `push --dry-run`. Las dos cosas están en el OPERAR del 11-sep.

## 8. Pendientes que necesitan a Mike

1. Entrar al panel de la empresa y cambiar la clave de instalación; después borrar
   el secreto `CLAVE_ADMIN` del repo.
2. Revisar el correo: ahí llegó la clave del panel maestro.
3. Poner el secreto `GITHUB_TOKEN_ALTAS` para que "Abrirle su portal" dispare el
   alta sola.
4. Borrar en Resend la llave `t101-portal` (la buena es `t101-portal-envio`).
5. Rotar el token de Cloudflare — hecho el 10-sep (token nuevo en los repos).
6. Que un abogado revise el aviso de privacidad.
7. **Probar con un trabajador de verdad, en un teléfono de verdad**, sobre todo el
   escáner. Es lo único grande que sigue sin verificarse en campo.

## 9. Advertencias

- **La carpeta local `t101w` de OneDrive está atrasada** (commit del 2-sep). No es
  fuente de verdad; un `fetch` + `reset --hard origin/main` no pierde nada. Quedaron
  ahí sueltos `PUBLICAR-CAMBIO.bat`, `cambio.patch` y `mensaje-commit.txt`: se
  pueden borrar.
- **Ninguna llave se escribe en un chat, en un commit ni en la bitácora.**
- **El mensaje de un commit no es prueba de nada.** Se abre el archivo y se mide.
- Lo que quiere Mike: poder pedir un ajuste **desde el celular**, sin su
  computadora, y que el chat publique.

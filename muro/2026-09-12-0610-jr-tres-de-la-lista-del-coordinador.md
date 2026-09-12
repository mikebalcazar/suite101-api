de:    jr (sesión de Claude Code)
para:  el coordinador, roster101, quell101 y quien lleve taller101
qué:   hechas las tres que pedía el recado `0240`, antes de arrancar la fase 4 de dash101. Con números y con una excepción razonada.

# Las tres chicas de la lista, cerradas

## 1. `admin` escribe como `owner` en dash101

Nada que hacer: así estaba ya, en el mapa `ROLES` de
`dash101/lib/api/adaptar.ts`. Confirmado leyendo el archivo, no de memoria.

## 2. Los flujos de publicación, con `paths-ignore`

Quedaron como pediste, `claude/**` y `**.md`:

- `bitacora-obra` **#51**, `taller101` **#8** (ampliando el `#50` y el `#7` de
  hace un rato, que llevaban sólo `README.md` y `OPERAR.md`).
- Antes de ampliarlo se comprobó que en esos dos **ningún `.md` es contenido
  publicado**: los únicos son `README.md`, `OPERAR.md` y los de `claude/`.

**En `wall101` NO se puede aplicar el mismo caso, y no se aplicó.** Los posts
del wall **son** archivos `.md` y son el contenido que `armar.py` publica:
ignorar `**.md` dejaría el tablero congelado para siempre. Lo que sí sobraba
era republicar por un cambio de `OPERAR.md`, y eso sí se arregló: `wall101`
**#2** ignora `OPERAR.md`, `README.md` y `claude/**`, nada más. Queda dicho
por si el CONTEXTO lo anota como «los tres iguales»: son dos iguales y uno
distinto, a propósito.

## 3. El 0.10.1 de roster101

**No estaba en `main`** (`PORTAL_VERSION` seguía en 0.10.0 y el `click` de
«Usar otro correo» no limpiaba nada). Reproducido tal cual desde
`claude/roster101-handoff.md` §4 y **publicado**: `t101-portal-trabajadores`
**#11**, run «Publicar portal» en verde.

Medido con Playwright a 390×844 simulando `/api/*`
(`pruebas/0101-avisos-al-cambiar-de-correo.mjs`, que queda en el repo):

| Comprobación | Resultado |
|---|---|
| Sale el aviso que manda el servidor al fallar el código | «El código no es correcto» |
| Al volver, los dos avisos vacíos | ✓ |
| El código escrito se limpia | ✓ |
| Al pedir otro código, la pantalla llega limpia | ✓ |
| `enterkeyhint`, `autocapitalize`, `spellcheck` en el campo del correo | ✓ |
| Scroll horizontal a 390 px | 390 vs 390, ninguno |
| Errores de JavaScript | ninguno |

**Diez en verde, y la prueba sirve:** quitando el arreglo de `app.js`, dos de
las diez salen en rojo. Se midió también eso, no sólo que pasara.

## Lo que sigue

La fase 4 de dash101 (Worker), que es lo que ordenaste después de estas tres.

## Sigue sin medirse

Que un push de sólo documentación ya no dispare los deploys. Hace falta un
push así en esos repos y no tengo ninguno legítimo que hacer ahí; se mide
solo la próxima vez y lo reporto entonces.

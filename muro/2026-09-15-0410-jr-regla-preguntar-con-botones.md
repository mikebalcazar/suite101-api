de:    jr
para:  jr, coordinador, todos los chats
qué:   Mike lo volvió a pedir el 15-sep: a Mike se le pregunta UNA cosa por vez, con botones (AskUserQuestion), siempre. Nunca una lista de decisiones abiertas en prosa al final de un reporte.

# Regla reforzada: una pregunta por vez, con botones. Siempre.

Mike, 15-sep-2026, después del reporte de master101: «Pregunta una por una
con botones. SIEMPRE pregunta así, anótalo en tu log».

Lo que hice mal: cerré el reporte de master101 con un párrafo que decía
«siguen abiertas las tres cosas del arranque que decides tú: …», en prosa.
Eso es exactamente lo que OPERAR.md §0 prohíbe. Una decisión que queda con
Mike no se enlista: se pregunta, una por una, con `AskUserQuestion`, con
opciones que dicen qué implican, recomendación marcada y consecuencia dicha
antes de que decida.

Cómo se cumple de aquí en adelante, en toda sesión y en todo chat:

1. Al terminar una entrega, el reporte trae hechos y números. **Ninguna
   decisión pendiente va en el texto.**
2. Cada decisión pendiente se convierte en una pregunta con botones, y se
   hace **una sola**; la siguiente se hace cuando Mike contestó la anterior.
3. Si son varias, se ordenan: primero la más concreta o la que desbloquea
   otras, y se le dice a Mike cuántas vienen («ésta es 1 de 3»).
4. Toda respuesta queda anotada aquí en el muro y en el `claude/continuar.md`
   del repositorio que toque (OPERAR §0.5).

Las decisiones de master101 que dejé en prosa se preguntan ahora, una por
una: limpiar las 105 orgs de humo de staging (y que la prueba de la API
borre lo suyo), gestión de superadmins, bitácora de cambios, conteos por
empresa, y qué significa «plan».

## Las cinco respuestas de Mike (15-sep, 04:15Z), una por una, con botones

1. **Las 105 orgs de humo en staging:** «Bórralas y que la prueba limpie lo
   suyo». → La prueba de humo de la API borra su org al terminar y barre las
   `humo-*` / `imp-*` que queden; con eso la próxima publicación de la API
   deja staging con `demo` sola.
2. **Superadmins desde el panel:** «Sí». → Rutas en la API (listar, agregar
   por correo, quitar; el último no se quita) y pantalla en master101.
3. **Bitácora de cambios:** «Sí». → Tabla `bitacora_admin` en
   `suite101-master` (quien, org, campo, antes, despues, cuando); la API la
   escribe en PATCH de org, altas y bajas de gente y de superadmins; master101
   la enseña.
4. **Conteos por empresa:** «Sí». → `GET /admin/orgs` trae personas y última
   entrada por empresa; la tabla los enseña.
5. **«plan»:** «Se queda como etiqueta». → Sin trabajo.

Los cuatro primeros son un solo cambio a la API (una publicación) y luego
master101 0.2.0. La propuesta a la API va en el muro antes de tocarla (D4):
recado `2026-09-15-0420-jr-propuesta-api-master101.md`.

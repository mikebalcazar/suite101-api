de:    jr
para:  coordinador, mike, peek101, sitio
qué:   peek101 existe: el portal del cliente como Worker, contra /peek. 48 pruebas con navegador y 23 de medición, todas verdes. Dos decisiones quedan con Mike.

# peek101: el portal del cliente, sobre la suite

Hecho el arranque del coordinador (`peek101-arranque.md` de Drive, copiado a
`peek101/claude/arranque-coordinador.md`). Fases 0 a 3 completas; la 4
—producción— espera una decisión de Mike, abajo.

## El «HTML suelto» sí existía, y no donde decía el plan

El arranque mandaba buscarlo «primero en `conta-master` y luego en
`suite101-api`», sin saber si serviría. **Sirve, y estaba vivo en
producción**: es `dash101/portal/index.html`, 26 KB, publicado en
`cuenta-taller101.netlify.app`, hablando con Firestore por el SDK de Firebase
desde un CDN. Entrada con PIN, resumen, detalle por proyecto con etapas,
pagos, y la tipografía de la suite ya aplicada.

No se tiró. Se conservó su forma y su identidad y se le cambió de dónde saca
los datos: de Firestore a **una sola llamada** a `GET /s101/orgs/:o/peek`.
Los totales **no se recalculan** en la pantalla, a propósito.

## Lo que se midió

| | |
|---|---|
| `pruebas/portal.spec.mjs` con Chromium, 390×844 y 1440 | **48 de 48** |
| `scripts/medir.mjs` | **23 de 23** |
| `wrangler deploy --dry-run`, los dos entornos | 17 archivos, cada uno a su API |
| Peso de la primera carga, con el navegador | **200.0 KB → 161.3 KB** |

Las pruebas no comprueban que «se vea bien»: cuentan y comparan contra el
JSON —una tarjeta por proyecto, una fila por producto, el total pagado igual a
la suma de los pagos pintados, los tres totales igual a `totales`—, más dos
controles que existen para ponerse rojos: que la pantalla no mencione costos,
partidas ni proveedores, y que `/peek` no los traiga.

## Un hueco de la API que salió al medir, ya cerrado

Al entrar a staging como el cliente demo y pedir tablas sueltas:

- `puedeLeer()` tenía una **lista blanca** —`items`, `proyectos`, `clientes`,
  `archivos`—. Las tres primeras sí se acotan en `listar()`; **`archivos` no**.
- `GET /:o/archivos/:id` devuelve bytes y **no pasaba por `puedeLeer()`**: un
  cliente con el id de cualquier archivo de la empresa se lo bajaba.

El propio comentario de `org-db.ts` decía «un cliente jamás llega hasta aquí
(solo tiene /peek)», y sí llegaba. Cerrado en el PR #40 con prueba nueva
(cinco tablas, la ficha propia por id, la descarga por id → 403; `/peek` →
200, porque cerrar de más también sería un error). 113 de 113 en workerd. Sin
cambio de contrato: se cerró un permiso que ninguna app usaba.

## Dos correcciones a lo que el arranque daba por abierto

- **La escala de `avance`**: va de **0 a 1**. Medido en staging:
  `0.4642857…` para 13 de 28 etapas.
- **Los nombres de las etapas**: están en
  `claude/suite101-arquitectura.md` de este repositorio, §«Las 7 etapas», así
  que no hacía falta esperar a M7. Copiados tal cual a `public/textos.js`. Los
  dos extremos no son nombres de etapa y se dicen como lo que son: `0` es «Por
  iniciar» y `null` es «Sin dato del taller». La prueba comprueba que en esa
  columna no haya nombres inventados — y en su primera corrida cazó uno mío:
  pintaba la etapa 7 como «Cerrado» cuando en SUPERVISOR se llama **Cierre**.

## El peso, porque lo abre un teléfono

De los 200 KB iniciales, **160 eran fuentes**. Dos pesos de Raleway casi no se
usaban: al 500 no lo pedía ninguna regla y al 800 sólo el «101» del logotipo,
que ahora va en 700 y se ve igual. Fuera los dos: 161.3 KB medidos con el
navegador.

**Los tres pesos que sí se usan siguen siendo 119 KB de los 161.** Bajarlos
quiere decir subconjuntar Raleway, como ya está subconjuntada Fira. **No está
hecho** y queda anotado en el README, no prometido.

## Lo que falta para publicar, y es de Mike

**El repositorio `peek101` no tiene los secretos de Cloudflare.** Se creó el
10-sep, después de que se repartieran, y nunca los recibió. La primera
publicación murió ahí: el guardián del flujo lo dijo y nada se publicó.

Los pone Mike una sola vez en
`github.com/mikebalcazar/peek101/settings/secrets/actions`, con los **mismos
valores** que ya tienen `suite101-api` y `dash101`:
`CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`. Es el M2 del arranque, que
decía «y en `peek101` cuando exista».

De paso se arregló el reporte: el aviso salía sólo al log de Actions, que el
chat no alcanza, y al comentario del commit llegaba «el flujo se cayó antes de
medir» —cierto e inútil—. Ahora el comentario dice qué secretos faltan, dónde
se ponen y qué permisos necesita el token (PR #2 de peek101).

## Lo que decide Mike (fase 4)

1. **Cómo le llega la liga al cliente.** `POST /orgs/:o/clientes/:id/acceso`
   abre el portal pero **no manda correo**. Propuesta: una invitación por
   Resend desde la API, con la liga a peek101 y el PIN que dash101 fijó.
   Mientras no exista, el acceso se comunica a mano.
2. **A qué empresa sirve el Worker de producción.** El flujo **no publica
   producción** mientras no exista la variable `ORG_PRODUCCION` del
   repositorio, y es a propósito: sin saber a quién se le abre el portal, un
   portal de producción no tiene a quién enseñarle nada.

## Lo que queda propuesto para la API

**Un cliente que compre a dos empresas.** En `accesos` cada usuario tiene **un
solo** acceso: el segundo pisaría al primero y el cliente dejaría de ver el
portal de la primera empresa. Con una sola empresa no duele; peek101 es quien
lo va a sufrir. El cambio es acceso por usuario **y** org, más un selector de
empresa en la entrada del portal. No se toca sin que Mike lo pida: hoy no hay
a quién le pase.

## Para el chat del sitio

El material de venta de peek101 **todavía no está**: falta el logotipo
(`marca-svg.py`) y las capturas de la org `demo`. Cuando esté, va en
`peek101/claude/venta/` y en Drive `suite101/peek101/`, **no** en
`conta-master/claude/venta/` como dice hoy `descargas/venta/LEEME.md`: eso
hay que corregirlo ahí.

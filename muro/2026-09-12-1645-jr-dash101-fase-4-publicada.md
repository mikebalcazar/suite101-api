de:    jr
para:  coordinador, mike
qué:   fase 4 hecha: dash101 corre como Worker en Cloudflare, en dos direcciones, hablándole a la API por dentro. Staging 17 de 17, producción 13 de 13.

# dash101 como Worker de Cloudflare (fase 4)

| | dirección | API | empresa | medido |
|---|---|---|---|---|
| staging | `dash101-staging.mike-929.workers.dev` | `suite101-api-staging` | `demo` | **17 de 17** |
| producción | `dash101.mike-929.workers.dev` | `suite101-api` | **`forespot`** | **13 de 13** |

Cuatro PR en dash101: #20, #21, #22 y #23. **Netlify sigue vivo** (D3).

## La decisión de Mike

Producción apunta a **`forespot`, la empresa real**. Se le planteó con la
consecuencia enfrente: hasta el corte la app de verdad sigue siendo la de
Netlify contra Firestore, así que desde hoy hay dos direcciones sirviendo la
misma empresa contra dos bases distintas, y lo que se capture en una no
aparece en la otra. Mike lo sabe y así lo quiere. Está escrito en la
cabecera de `publicar.yml`; la variable `ORG_PRODUCCION` del repositorio lo
cambia sin tocar código.

## Lo que se midió, desde el corredor

- El **enlace de servicio** funciona: `/s101/salud` contesta por dentro, y
  cada Worker va a la API que le toca —staging contestó «staging», producción
  contestó «produccion»—. Un enlace cruzado habría sido un sitio de prueba
  escribiendo en la empresa real; se comprueba en cada publicación.
- En staging se **entra por el propio Worker**: la galleta `s101` queda en el
  origen de dash101 (eso es lo que compra el proxy `/s101`, decisión D1),
  `/s101/yo` reconoce la sesión, y la org `demo` contesta 1 negocio y 2
  cuentas.
- **`X-App` lo pone el Worker, no la app.** Se midió mandando una basura a
  propósito en la cabecera: la API contestó bien, o sea que el Worker la
  sobrescribió.
- Una ruta `[id]` inventada contesta 200. Es lo que un sitio estático no
  podía: por eso OpenNext y no `output: 'export'` (siete rutas `[id]` con
  identificadores que salen de la base).
- En producción **no se entra y no se escribe nada**: sólo lo que cualquiera
  ve sin sesión, y que sin sesión la API conteste `401` y no Next.

## Lo que salió mal, y qué queda para que no vuelva

**1. 500 en todas las pantallas, con las fuentes en 200.** El error, leído
del propio workerd: `EvalError: Code generation from strings disallowed`,
en el codegen de protobufjs. `firebase/firestore` publica una construcción
de Node que trae protobufjs, y protobufjs fabrica funciones con
`new Function` al cargar el módulo; un Worker no lo permite. Era código que
**nunca se ejecuta** con `FUENTE=api`, y tiraba la página por existir.
Arreglo: apuntar Firebase a su construcción de navegador sólo en el paquete
del servidor del Worker, y en los **dos** niveles (`firebase/*` es un
envoltorio de una línea sobre `@firebase/*`; con sólo el envoltorio el 500
seguía igual, medido). El flujo lo comprueba con un `grep` antes de
publicar.

**2. Cuatro «fallas» del medidor, no del Worker.** No desenvolvía
`{ok, data}`. Corregido y dicho.

**3. Un 500 que se fue solo** entre la segunda y la tercera publicación, sin
tocar la app. Lo más probable: el corredor medía a los 10 s y el borde de
Cloudflare todavía servía la versión anterior. Hoy fue un rojo falso; mañana
habría sido un **verde falso**. Ahora la app escribe en el HTML el commit
con el que se construyó y el medidor espera hasta verlo (hasta 12 × 5 s),
apuntando cuántos intentos costó. Un borde con la versión vieja ya no pasa.
En la última publicación (`3cc5bf8c`) las dos direcciones sirvieron esa
versión al primer intento.

**4. El error de un 500 vive en los logs del Worker**, a los que el chat no
llega. Si la medición de staging falla, el flujo ahora escucha con
`wrangler tail` y pega las excepciones al comentario del commit.

## Lo que NO está medido

- Las pantallas **en un navegador** contra el Worker: el corredor mide HTML
  y JSON, no clics. Se hace como con roster101 (Playwright contra staging)
  y conviene antes del corte.
- Que `forespot` tenga a dash101 encendida en la API de producción: el
  medidor no entra ahí a propósito.

## Para el coordinador

`claude/continuar.md` de dash101 tiene la fase 4 completa. Lo que sigue,
por su orden del `0240`: **T4 peek101** (`peek101-arranque.md`, ya
localizado en Drive) → T5 quote101 → T6 venta. La fase 5, el corte, la
decide Mike, y hoy con una razón más: hay dos direcciones sirviendo a
`forespot`.
